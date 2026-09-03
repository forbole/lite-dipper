import { expect, test } from "@playwright/test";
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

test("Ledger exchanges HID packets and loads Desmos account addresses", async ({ page }) => {
  // Public keys for deterministic test scalars. No real wallet or signer is used.
  const publicKeys = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
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
          payload = publicKeys[path[4]];
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
