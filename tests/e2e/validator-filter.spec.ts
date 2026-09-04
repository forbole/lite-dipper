import { expect } from "@playwright/test";
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { test, STAKING_VALIDATOR, OPERATOR, INACTIVE_OPERATOR, PROFILE } from "./fixtures/explorer";

const JAILED_OPERATOR = "desmosvaloper1d6xe3ldswgaurszrp3emspvhspvu7hxm4ty8mv";
const UNBONDING_OPERATOR = "desmosvaloper10wlzyl5pfm6qfzg9mr73u9jwv9gx595z4kc9ae";
const INACTIVE = { ...STAKING_VALIDATOR, operator_address: INACTIVE_OPERATOR, status: "BOND_STATUS_UNBONDED", tokens: "2000000" };
// A jailed record must be excluded from the active set even if marked bonded.
const JAILED = { ...STAKING_VALIDATOR, operator_address: JAILED_OPERATOR, jailed: true, tokens: "3000000",
  description: { ...STAKING_VALIDATOR.description, moniker: "Jailed validator", identity: "" } };
const UNBONDING = { ...STAKING_VALIDATOR, operator_address: UNBONDING_OPERATOR, status: "BOND_STATUS_UNBONDING", tokens: "1000000",
  description: { ...STAKING_VALIDATOR.description, moniker: "Unbonding validator", identity: "" } };
const PAGES = [[STAKING_VALIDATOR, JAILED], [INACTIVE, UNBONDING]];

async function largeRegistry() {
  return Promise.all(Array.from({ length: 45 }, async (_, index) => {
    const key = new Uint8Array(32);
    key[31] = index + 1;
    const wallet = await DirectSecp256k1Wallet.fromKey(key, "desmosvaloper");
    const [account] = await wallet.getAccounts();
    return { ...INACTIVE, operator_address: account.address, tokens: String((45 - index) * 1_000_000),
      description: { ...INACTIVE.description, moniker: `Inactive ${index + 1}`, identity: "" } };
  }));
}

test("large lists mount and query profiles only for the selected page", async ({ page, profileApi }) => {
  const validators = await largeRegistry();
  profileApi.validatorPages = [validators];
  profileApi.serveDocuments = true;
  await page.clock.install();
  const profiles = new Set<string>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/validators\/[^/]+\/profile$/.test(path)) profiles.add(path.split("/")[3]);
  });
  await page.goto("/validators?status=inactive");
  await expect(page.locator('a[href^="/validators/desmosvaloper"]')).toHaveCount(20);
  await expect(page.getByRole("navigation", { name: "Validator pagination" })).toContainText("1–20 of 45 validators");
  await expect.poll(() => profiles.size).toBe(20);
  expect(profiles).toEqual(new Set(validators.slice(0, 20).map((validator) => validator.operator_address)));
  profiles.clear();
  await page.getByRole("link", { name: "Next →", exact: true }).click();
  await expect(page).toHaveURL(/status=inactive&page=2$/);
  await expect(page.getByRole("navigation", { name: "Validator pagination" })).toContainText("21–40 of 45 validators");
  await expect(page.locator('a[href^="/validators/desmosvaloper"]')).toHaveCount(20);
  await expect.poll(() => profiles.size).toBe(20);
  expect(profiles).toEqual(new Set(validators.slice(20, 40).map((validator) => validator.operator_address)));
  await page.clock.fastForward(30_000);
  expect(profiles).toEqual(new Set(validators.slice(20, 40).map((validator) => validator.operator_address)));
  await page.getByRole("link", { name: "Next →", exact: true }).click();
  await expect(page.locator('a[href^="/validators/desmosvaloper"]')).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Next →", exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/status=inactive&page=2$/);
  await expect(page.locator('a[href^="/validators/desmosvaloper"]')).toHaveCount(20);
  await page.getByRole("combobox", { name: "Validator status" }).selectOption("active");
  await expect(page).toHaveURL(/\/validators$/);
});

test("defaults to active and switches to all paginated jailed/inactive validators with profiles", async ({ page, profileApi }, testInfo) => {
  profileApi.serveDocuments = true;
  profileApi.validatorPages = PAGES;
  await page.goto("/validators");
  const selector = page.getByRole("combobox", { name: "Validator status" });
  await expect(selector).toHaveValue("active");
  await expect(page.locator(`a[href="/validators/${OPERATOR}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/validators/${JAILED_OPERATOR}"]`)).toHaveCount(0);
  expect(profileApi.validatorListQueries.every((query) => query.status === "BOND_STATUS_BONDED")).toBe(true);
  await selector.selectOption("inactive");
  await expect(page).toHaveURL(/\/validators\?status=inactive$/);
  await expect(page.locator(`a[href="/validators/${OPERATOR}"]`)).toHaveCount(0);
  const inactive = page.locator(`a[href="/validators/${INACTIVE_OPERATOR}"]`);
  await expect(inactive.getByText("Inactive Community", { exact: true })).toBeVisible();
  await expect(inactive.getByRole("img", { name: "Inactive Community avatar" })).toHaveAttribute("src", PROFILE.pictures.profile);
  await expect(inactive.getByText("Inactive", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="/validators/${JAILED_OPERATOR}"]`).getByText("Jailed", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="/validators/${UNBONDING_OPERATOR}"]`).getByText("Inactive", { exact: true })).toBeVisible();
  expect(profileApi.validatorListQueries).toContainEqual({ status: null, key: "page-1" });
  await expect(page).toHaveTitle("Jailed & Inactive Desmos Validators | Lite-Dipper");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://lite.desmos.network/validators?status=inactive");

  await page.goBack();
  await expect(selector).toHaveValue("active");
  await expect(page.locator(`a[href="/validators/${OPERATOR}"]`)).toBeVisible();
  await page.goForward();
  await expect(selector).toHaveValue("inactive");
  await expect(inactive).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("inactive-validators-mobile.png"), fullPage: true });

  // Other callers still receive only active validators, even after this view.
  const defaults = await (await profileApi.request("/api/validators")).json();
  expect(defaults.map((validator: { operatorAddress: string }) => validator.operatorAddress)).toEqual([OPERATOR]);
});

test("inactive selection hydrates, polls and reports empty/unavailable results without showing the active set", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  profileApi.validatorPages = PAGES;
  await page.clock.install();
  await page.goto("/validators?status=inactive");
  await expect(page.getByRole("combobox", { name: "Validator status" })).toHaveValue("inactive");
  const inactive = page.locator(`a[href="/validators/${INACTIVE_OPERATOR}"]`);
  await expect(inactive).toBeVisible();
  profileApi.validatorPages = [[STAKING_VALIDATOR, { ...INACTIVE, tokens: "4000000" }]];
  await page.clock.fastForward(30_000);
  await expect(inactive).toContainText("4 DSM");
  await expect(page.locator(`a[href="/validators/${JAILED_OPERATOR}"]`)).toHaveCount(0);
  profileApi.validatorListUnavailable = true;
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("alert")).toContainText("Unable to refresh");
  await expect(inactive).toBeVisible();
  profileApi.validatorListUnavailable = false;
  profileApi.validatorPages = [[STAKING_VALIDATOR]];
  await page.getByRole("button", { name: "Retry validators" }).click();
  await expect(page.getByText("No jailed or inactive validators found.", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="/validators/${OPERATOR}"]`)).toHaveCount(0);
});

test.describe("validator filters without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("server renders only the selected page and preloads its profiles", async ({ page, profileApi }) => {
    const validators = await largeRegistry();
    profileApi.validatorPages = [validators];
    profileApi.serveDocuments = true;
    await page.goto("/validators?status=inactive&page=2");
    await expect(page.locator('a[href^="/validators/desmosvaloper"]')).toHaveCount(20);
    await expect(page.getByText("Inactive 21", { exact: true })).toBeVisible();
    await expect(page.getByText("Inactive 1", { exact: true })).toHaveCount(0);
    expect(profileApi.requests.filter((path) => path.startsWith("/desmos/profiles/v3/profiles/"))).toHaveLength(20);
    await expect(page).toHaveTitle("Jailed & Inactive Desmos Validators — Page 2 | Lite-Dipper");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://lite.desmos.network/validators?status=inactive&page=2");
    await page.getByRole("link", { name: "Next →", exact: true }).click();
    await expect(page.locator('a[href^="/validators/desmosvaloper"]')).toHaveCount(5);
    expect((await profileApi.request("/validators?status=inactive&page=4")).status).toBe(404);
  });
  test("renders the requested set into HTML and isolates cached active/inactive responses", async ({ page, profileApi }) => {
    profileApi.serveDocuments = true;
    profileApi.cacheEnabled = true;
    profileApi.versionId = "validator-filter";
    profileApi.validatorPages = PAGES;
    await page.goto("/validators");
    await expect(page.locator(`a[href="/validators/${OPERATOR}"]`)).toBeVisible();
    await page.goto("/validators?status=inactive");
    await expect(page.getByRole("combobox", { name: "Validator status" })).toHaveValue("inactive");
    await expect(page.locator(`a[href="/validators/${INACTIVE_OPERATOR}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/validators/${OPERATOR}"]`)).toHaveCount(0);
    expect((await profileApi.request("/api/validators?status=unknown")).status).toBe(400);
    for (const status of ["active", "inactive", "active", "inactive"]) {
      const validators = await (await profileApi.request(`/api/validators?status=${status}`)).json();
      expect(validators.map((validator: { operatorAddress: string }) => validator.operatorAddress)).toEqual(
        status === "active" ? [OPERATOR] : [JAILED_OPERATOR, INACTIVE_OPERATOR, UNBONDING_OPERATOR]
      );
    }
  });
});
