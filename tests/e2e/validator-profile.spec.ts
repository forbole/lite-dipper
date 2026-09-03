import { test as base, expect } from "@playwright/test";
import worker from "../../worker/index";

const OPERATOR = "desmosvaloper17lca9smrdlwkznr92hypzrgsjkelnxeaacgrwq";
const ACCOUNT = "desmos17lca9smrdlwkznr92hypzrgsjkelnxear4qhyj";
const IDENTITY = "TESTKEYBASE";
const PROFILE = {
  "@type": "/desmos.profiles.v3.Profile",
  account: { "@type": "/cosmos.auth.v1beta1.BaseAccount", address: ACCOUNT },
  dtag: "apollo", nickname: "Apollo Community", bio: "An on-chain validator profile.\nSupporting the Desmos community.",
  pictures: { profile: "https://profile-images.test/avatar.svg", cover: "https://profile-images.test/cover.svg" },
  creation_date: "2021-11-02T16:58:41.653318881Z"
};
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="#155e75"/><circle cx="400" cy="100" r="70" fill="#38bdf8"/></svg>';

type ProfileApi = {
  profile: unknown;
  status: number;
  brokenImages: boolean;
  requests: string[];
};

const test = base.extend<{ profileApi: ProfileApi }>({
  profileApi: async ({ page }, use) => {
    const state: ProfileApi = { profile: structuredClone(PROFILE), status: 200, brokenImages: false, requests: [] };
    const originalFetch = globalThis.fetch;
    const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
    Object.defineProperty(globalThis, "caches", { configurable: true, value: {
      open: async () => ({ match: async () => undefined, put: async () => {} })
    } });
    // Keep the real validator normalization and account derivation in the path.
    // Only replace the public REST service and Keybase lookup.
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://keybase.io") return Response.json({ them: [{
        basics: { username: "staking-name" }, pictures: { primary: { url: "https://profile-images.test/keybase.svg" } }
      }] });
      if (url.origin !== "https://validator-rest.test") throw new Error(`Unexpected upstream: ${url}`);
      state.requests.push(url.pathname);
      if (url.pathname === `/cosmos/staking/v1beta1/validators/${OPERATOR}`) return Response.json({ validator: {
        operator_address: OPERATOR, consensus_pubkey: { key: Buffer.alloc(32, 1).toString("base64") },
        description: { moniker: "Staking name", identity: IDENTITY, details: "Original staking description.",
          website: "https://validator.example", security_contact: "security@validator.example" },
        status: "BOND_STATUS_BONDED", jailed: false, tokens: "12345000000",
        commission: { commission_rates: { rate: "0.05" } }
      } });
      if (url.pathname === `/desmos/profiles/v3/profiles/${ACCOUNT}`) return Response.json(
        state.status === 200 ? { profile: state.profile } : { error: "Profile unavailable" }, { status: state.status }
      );
      throw new Error(`Unexpected REST path: ${url.pathname}`);
    };
    await page.route("**/api/validators**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/validators") {
        await route.fulfill({ json: [] });
        return;
      }
      const pending: Promise<unknown>[] = [];
      const response = await worker.fetch(new Request(route.request().url()), {
        DESMOS_REST_URL: "https://validator-rest.test"
      } as Parameters<typeof worker.fetch>[1], {
        waitUntil: (promise: Promise<unknown>) => { pending.push(promise); }
      } as Parameters<typeof worker.fetch>[2]);
      await Promise.all(pending);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    for (const pattern of ["https://profile-images.test/**", "**/api/keybase/avatar/**"]) {
      await page.route(pattern, (route) => route.fulfill(state.brokenImages
        ? { status: 404 }
        : { contentType: "image/svg+xml", body: IMAGE }));
    }
    try { await use(state); }
    finally {
      globalThis.fetch = originalFetch;
      if (originalCaches) Object.defineProperty(globalThis, "caches", originalCaches);
      else Reflect.deleteProperty(globalThis, "caches");
    }
  }
});

test("uses the validator account's Desmos Profile and preserves staking metadata", async ({ page, profileApi }, testInfo) => {
  await page.goto(`/validators/${OPERATOR}`);
  await expect(page.getByRole("heading", { name: "Apollo Community", exact: true })).toBeVisible();
  await expect(page.getByText("Desmos Profile", { exact: true })).toBeVisible();
  await expect(page.getByText("@apollo", { exact: true })).toBeVisible();
  await expect(page.getByText(PROFILE.bio, { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Apollo Community avatar" })).toHaveAttribute("src", PROFILE.pictures.profile);
  await expect(page.getByRole("img", { name: "Apollo Community cover" })).toBeVisible();
  await expect(page.getByText("Validator name: Staking name")).toBeVisible();
  await expect(page.getByText("Profile created: 02 Nov 2021, 16:58:41 UTC")).toBeVisible();
  await expect(page.getByRole("link", { name: "https://validator.example" })).toBeVisible();
  await expect(page.locator(`a[href="/accounts/${ACCOUNT}"]`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delegation Actions" })).toBeVisible();
  expect(profileApi.requests).toContain(`/desmos/profiles/v3/profiles/${ACCOUNT}`);
  await page.screenshot({ path: testInfo.outputPath("profile-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("img", { name: "Apollo Community cover" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("profile-mobile.png"), fullPage: true });
});

for (const scenario of ["absent", "unavailable", "different account"] as const) {
  test(`preserves validator details when the profile is ${scenario}`, async ({ page, profileApi }) => {
    if (scenario === "absent") profileApi.profile = null;
    if (scenario === "unavailable") profileApi.status = 503;
    if (scenario === "different account") profileApi.profile = { ...PROFILE, account: { address: "desmos1somebodyelse" } };
    await page.goto(`/validators/${OPERATOR}`);
    await expect(page.getByRole("heading", { name: "Staking name", exact: true })).toBeVisible();
    await expect(page.getByText("Original staking description.", { exact: true })).toBeVisible();
    await expect(page.getByText("Desmos Profile", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Staking name avatar" })).toHaveAttribute("src", `/api/keybase/avatar/${IDENTITY}`);
    await expect(page.getByRole("heading", { name: "Delegation Actions" })).toBeVisible();
  });
}

test("supports vesting accounts and falls back for empty fields or invalid image URLs", async ({ page, profileApi }) => {
  profileApi.profile = { ...PROFILE, account: { base_vesting_account: { base_account: { address: ACCOUNT } } },
    nickname: "", bio: "", pictures: { profile: "javascript:alert(1)", cover: "data:text/html,unsafe" } };
  await page.goto(`/validators/${OPERATOR}`);
  await expect(page.getByRole("heading", { name: "Staking name", exact: true })).toBeVisible();
  await expect(page.getByText("@apollo", { exact: true })).toBeVisible();
  await expect(page.getByText("Original staking description.", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Staking name avatar" })).toHaveAttribute("src", `/api/keybase/avatar/${IDENTITY}`);
  await expect(page.getByRole("img", { name: /cover$/ })).toHaveCount(0);
});

test("broken profile images fall back without hiding the profile or staking actions", async ({ page, profileApi }) => {
  profileApi.brokenImages = true;
  await page.goto(`/validators/${OPERATOR}`);
  await expect(page.getByRole("img", { name: "Apollo Community avatar" })).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.getByRole("img", { name: "Apollo Community cover" })).toHaveCount(0);
  await expect(page.getByText("@apollo", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delegation Actions" })).toBeVisible();
});
