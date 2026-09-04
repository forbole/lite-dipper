import { expect, test, type Page } from "@playwright/test";
import { Secp256k1 } from "@cosmjs/crypto";

declare global {
  interface Window {
    ledgerTest: { requests: number; closes: number; paths: number[][] };
  }
}

test("Ledger reaches the device chooser and supports retry after cancellation", async ({ page }) => {
  await page.addInitScript(() => {
    window.ledgerTest = { requests: 0, closes: 0, paths: [] };
    Object.defineProperty(navigator, "hid", {
      value: {
        getDevices: async () => [],
        requestDevice: async () => { window.ledgerTest.requests++; return []; }
      }
    });
  });
  await page.goto("/wallet");
  await page.getByRole("button", { name: /^Ledger/ }).click();
  await expect(page.getByText("Access denied to use Ledger device", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.ledgerTest.requests)).toBe(1);
  await expect(page.getByText("Buffer is not defined", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Ledger/ }).click();
  await expect.poll(() => page.evaluate(() => window.ledgerTest.requests)).toBe(2);
  await expect(page.getByRole("button", { name: /^Ledger/ })).toBeEnabled();
});

async function mockLedgerDevice(page: Page) {
  // Public keys for deterministic test scalars. No real wallet or signer is used.
  const publicKeys = await Promise.all(Array.from({ length: 40 }, async (_, index) => {
    const privateKey = new Uint8Array(32);
    privateKey[31] = index + 1;
    const { pubkey } = await Secp256k1.makeKeypair(privateKey);
    return Array.from(Secp256k1.compressPubkey(pubkey));
  }));

  await page.addInitScript(({ publicKeys }) => {
    window.ledgerTest = { requests: 0, closes: 0, paths: [] };
    let inputReport: ((event: { data: DataView }) => void) | undefined;
    const device = {
      vendorId: 0x2c97,
      productId: 0x0001,
      open: async () => {},
      close: async () => { window.ledgerTest.closes++; },
      addEventListener: (name: string, callback: typeof inputReport) => {
        if (name === "inputreport") inputReport = callback;
      },
      removeEventListener: () => { inputReport = undefined; },
      sendReport: async (_reportId: number, packet: Uint8Array) => {
        // Only simulate the hardware boundary. The production Ledger libraries
        // still encode/decode APDUs, frame HID packets, and derive the addresses.
        const header = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
        const apdu = packet.subarray(7, 7 + header.getUint16(5));
        let payload: number[];
        if (apdu[0] === 0xb0 && apdu[1] === 0x01) {
          payload = [1, 6, ...new TextEncoder().encode("Desmos"), 5, ...new TextEncoder().encode("2.0.0"), 1, 0];
        } else if (apdu[0] === 0x55 && apdu[1] === 0x00) {
          payload = [0, 2, 0, 0, 0]; // production mode, version 2.0.0, unlocked
        } else if (apdu[0] === 0x55 && apdu[1] === 0x04) {
          const pathOffset = 5 + 1 + apdu[5]; // skip APDU header and length-prefixed HRP
          const pathData = new DataView(apdu.buffer, apdu.byteOffset + pathOffset, 20);
          const path = Array.from({ length: 5 }, (_, index) => pathData.getUint32(index * 4, true));
          window.ledgerTest.paths.push(path);
          payload = publicKeys[(path[2] - 0x80000000) * 20 + path[4]];
        } else {
          throw new Error(`Unexpected Ledger command: ${Array.from(apdu)}`);
        }
        const response = Uint8Array.from([...payload, 0x90, 0x00]);
        const frame = new Uint8Array(64);
        frame.set(packet.subarray(0, 3)); // transport's channel and HID tag
        new DataView(frame.buffer).setUint16(5, response.length);
        frame.set(response, 7);
        inputReport?.({ data: new DataView(frame.buffer) });
      }
    };
    Object.defineProperty(navigator, "hid", {
      value: {
        getDevices: async () => [],
        requestDevice: async () => { window.ledgerTest.requests++; return [device]; },
        addEventListener() {},
        removeEventListener() {}
      }
    });
  }, { publicKeys });
}

const BALANCE_URL = "https://api.mainnet.desmos.network/cosmos/bank/v1beta1/spendable_balances/*/by_denom?denom=udsm";

test("Ledger exchanges HID packets and loads Desmos account addresses", async ({ page }) => {
  await mockLedgerDevice(page);
  await page.route(BALANCE_URL, (route) => route.fulfill({ json: { balance: { denom: "udsm", amount: "0" } } }));
  await page.route("**/api/wallet/**/overview", (route) => route.fulfill({ json: {
    balances: [], delegations: [], unbondingDelegations: [], redelegations: [], totalRewardAmount: "0"
  } }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wallet");
  await page.getByRole("button", { name: /^Ledger/ }).click();
  await expect(page.getByRole("button", { name: "Use this address", exact: true })).toHaveCount(10);
  await expect(page.getByText("m/44'/852'/0'/0/0", { exact: true })).toBeVisible();
  await expect(page.getByText(/^desmos1[a-z0-9]+$/)).toHaveCount(10);
  expect(await page.evaluate(() => window.ledgerTest.paths)).toEqual(
    Array.from({ length: 10 }, (_, index) => [0x8000002c, 0x80000354, 0x80000000, 0, index])
  );
  await page.getByRole("button", { name: "Use this address", exact: true }).first().click();
  await expect(page.getByText("Ledger connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.ledgerTest.closes)).toBe(1);
  expect(errors).toEqual([]);
});

function addressRow(page: Page, index: number) {
  return page.getByText(`Address index ${index}`, { exact: true }).locator("..").locator("..");
}

test("Ledger shows exact spendable DSM, isolates failures and refreshes balances", async ({ page }) => {
  await mockLedgerDevice(page);
  await page.clock.install();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const amounts = new Map<string, string>();
  const invalid = new Set<string>();
  const unavailable = new Set<string>();
  const requests: string[] = [];
  await page.route(BALANCE_URL, async (route) => {
    const address = new URL(route.request().url()).pathname.split("/").at(-2)!;
    requests.push(address);
    await ready;
    if (unavailable.has(address)) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    const balance = invalid.has(address) ? { denom: "other", amount: "wrong" } : { denom: "udsm", amount: amounts.get(address) ?? "0" };
    return route.fulfill({ json: { balance } });
  });
  await page.goto("/wallet");
  await page.getByRole("button", { name: /^Ledger/ }).click();
  await expect(page.getByText("Loading balance…", { exact: true })).toHaveCount(10);
  await expect(addressRow(page, 0).getByRole("button", { name: "Use this address" })).toBeEnabled();
  const addresses = await page.getByText(/^desmos1[a-z0-9]+$/).allTextContents();
  amounts.set(addresses[0], "1234567890");
  amounts.set(addresses[2], "1");
  amounts.set(addresses[3], "9007199254740993000001");
  invalid.add(addresses[4]);
  unavailable.add(addresses[5]);
  release();
  await expect(addressRow(page, 0)).toContainText("1,234.567890 DSM");
  await expect(addressRow(page, 1)).toContainText("0.000000 DSM");
  await expect(addressRow(page, 2)).toContainText("0.000001 DSM");
  await expect(addressRow(page, 3)).toContainText("9,007,199,254,740,993.000001 DSM");
  for (const index of [4, 5]) {
    await expect(addressRow(page, index)).toContainText("Balance unavailable");
    await expect(addressRow(page, index)).not.toContainText("0.000000 DSM");
    await expect(addressRow(page, index).getByRole("button", { name: "Use this address" })).toBeEnabled();
  }
  expect(new Set(requests)).toEqual(new Set(addresses));
  invalid.delete(addresses[4]);
  amounts.set(addresses[4], "5000000");
  await addressRow(page, 4).getByRole("button", { name: "Retry balance" }).click();
  await expect(addressRow(page, 4)).toContainText("5.000000 DSM");

  unavailable.add(addresses[0]);
  await page.clock.fastForward(20_000);
  await expect(addressRow(page, 0)).toContainText("Update failed; balance may be out of date.");
  await expect(addressRow(page, 0)).toContainText("1,234.567890 DSM");
  unavailable.delete(addresses[0]);
  amounts.set(addresses[0], "7654321");
  await page.clock.fastForward(20_000);
  await expect(addressRow(page, 0)).toContainText("7.654321 DSM");
  await expect(addressRow(page, 0)).not.toContainText("Update failed");
});

test("Ledger page and account changes keep balances with their addresses and can connect while loading", async ({ page }) => {
  await mockLedgerDevice(page);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const previousAddresses = new Set<string>();
  let balance = "1000000";
  let hold = true;
  await page.route(BALANCE_URL, async (route) => {
    const address = new URL(route.request().url()).pathname.split("/").at(-2)!;
    if (hold) {
      previousAddresses.add(address);
      await ready;
    }
    await route.fulfill({ json: { balance: { denom: "udsm", amount: previousAddresses.has(address) ? "99000000" : balance } } });
  });
  await page.route("**/api/wallet/**/overview", (route) => route.fulfill({ json: {
    balances: [], delegations: [], unbondingDelegations: [], redelegations: [], totalRewardAmount: "0"
  } }));
  await page.goto("/wallet");
  await page.getByRole("button", { name: /^Ledger/ }).click();
  await expect.poll(() => previousAddresses.size).toBe(10);
  const firstAddress = await addressRow(page, 0).getByText(/^desmos1/).textContent();
  hold = false;
  await page.getByRole("button", { name: "Next 10", exact: true }).click();
  await expect(addressRow(page, 10)).toContainText("m/44'/852'/0'/0/10");
  await expect(addressRow(page, 10)).toContainText("1.000000 DSM");
  release();
  await expect(page.getByText(firstAddress!, { exact: true })).toHaveCount(0);
  await expect(page.getByText("99.000000 DSM", { exact: true })).toHaveCount(0);

  balance = "2000000";
  await page.getByRole("button", { name: "Next account", exact: true }).click();
  await expect(addressRow(page, 0)).toContainText("m/44'/852'/1'/0/0");
  await expect(addressRow(page, 0)).toContainText("2.000000 DSM");
  await expect(page.getByText(firstAddress!, { exact: true })).toHaveCount(0);

  // The next page's balance requests remain pending while address selection
  // completes; only the HID address derivation gates the connection button.
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  await page.route(BALANCE_URL, async (route) => {
    await pending;
    await route.fulfill({ json: { balance: { denom: "udsm", amount: "0" } } });
  });
  await page.getByRole("button", { name: "Next 10", exact: true }).click();
  await expect(addressRow(page, 10)).toContainText("m/44'/852'/1'/0/10");
  await expect(page.getByText("Loading balance…", { exact: true })).toHaveCount(10);
  await addressRow(page, 10).getByRole("button", { name: "Use this address" }).click();
  await expect(page.getByText("Ledger connected", { exact: true })).toBeVisible();
  finish();
});
