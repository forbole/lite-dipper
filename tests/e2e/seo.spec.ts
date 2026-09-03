import { expect } from "@playwright/test";
import { test, OPERATOR, ACCOUNT, INACTIVE_OPERATOR, PROFILE, TX_HASH } from "./fixtures/explorer";

test.beforeEach(async ({ profileApi }) => { profileApi.serveDocuments = true; });

test.describe("public HTML without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  const pages = [
    ["/", "Desmos Blockchain Explorer", "Latest Height"],
    ["/validators", "Desmos Validators", "Apollo Community"],
    [`/validators/${OPERATOR}`, "Apollo Community — Desmos Validator", "An on-chain validator profile."],
    ["/blocks", "Desmos Blocks", "Apollo Community"],
    ["/blocks/3", "Desmos Block 3", "Signed Validators (1)"],
    ["/transactions", "Desmos Transactions", "MsgSend"],
    [`/transactions/${TX_HASH}`, `Desmos Transaction ${TX_HASH}`, "Transaction Overview"],
    ["/proposals", "Desmos Governance Proposals", "Community funding"],
    ["/proposals/51", "Proposal #51: Community funding", "Support public infrastructure."],
    [`/accounts/${ACCOUNT}`, `Desmos Account ${ACCOUNT}`, "100.000000 DSM"]
  ];
  for (const [path, title, content] of pages) {
    test(`renders ${path} with its own content and metadata`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(`${title} | Lite-Dipper`);
      await expect(page.locator("#root")).toContainText(content);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://lite.desmos.network${path}`);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", `${title} | Lite-Dipper`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S{3}/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
      expect(JSON.parse(await page.locator("#page-structured-data").textContent() ?? "{}")["@graph"][1].url).toBe(`https://lite.desmos.network${path}`);
      await expect(page.locator("#root")).not.toContainText(/Loading (validators|blocks|transactions|proposal|account)/);
    });
  }
});

test("hydrates server HTML and updates metadata on navigation, pagination and back", async ({ page, profileApi }) => {
  profileApi.latestHeight = 25;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (/hydration|hydrating|#418/i.test(message.text())) errors.push(message.text()); });
  await page.goto(`/validators/${OPERATOR}`);
  await expect(page.getByRole("heading", { name: "Apollo Community", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Blocks", exact: true }).click();
  await expect(page).toHaveTitle("Desmos Blocks | Lite-Dipper");
  await page.getByRole("link", { name: "Older blocks" }).click();
  await expect(page).toHaveURL(/\/blocks\?before=6$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://lite.desmos.network/blocks?before=6");
  await expect(page.getByRole("link", { name: "5", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "25", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Wallet", exact: true }).click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await page.goBack();
  await expect(page).toHaveTitle("Desmos Blocks Before 6 | Lite-Dipper");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  expect(errors).toEqual([]);
});

test("escapes on-chain text in HTML, metadata and bootstrap JSON", async ({ page, profileApi }) => {
  const payload = '</script><script>window.__seoInjected=1</script><img src=x onerror="window.__seoInjected=1">$&';
  profileApi.profile = { ...PROFILE, nickname: payload, bio: `**Safe content**\n\n${payload}\n\n[Unsafe](javascript:alert(1))` };
  const response = await page.goto(`/validators/${OPERATOR}`);
  const html = await response!.text();
  expect(html).not.toContain(payload);
  expect(html).toContain("\\u003c/script\\u003e");
  await expect(page.locator(".profile-bio strong")).toHaveText("Safe content");
  await expect(page.locator(".profile-bio script, .profile-bio iframe, [onerror]")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__seoInjected"))).toBeUndefined();
  await expect(page.locator("#page-data")).toHaveCount(1);
  await expect(page.locator("#page-structured-data")).toHaveCount(1);
  JSON.parse(await page.locator("#page-data").textContent() ?? "{}");
});

test("returns genuine 404s, canonical redirects and retryable upstream failures", async ({ profileApi }) => {
  for (const path of ["/missing-page", "/validators/not-an-address", `/validators/${INACTIVE_OPERATOR}`, "/blocks/999", "/blocks?before=invalid", "/proposals/999", `/transactions/${"CD".repeat(32)}`]) {
    const response = await profileApi.request(path);
    expect(response.status, path).toBe(404);
    const body = await response.text();
    expect(body).toContain("Page Not Found");
    expect(body).toContain('content="noindex, follow"');
  }
  const redirect = await profileApi.request(`/transactions/${TX_HASH.toLowerCase()}`);
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("location")).toBe(`https://lite.desmos.network/transactions/${TX_HASH}`);
  const trailingSlash = await profileApi.request("/validators/");
  expect(trailingSlash.status).toBe(308);
  expect(trailingSlash.headers.get("location")).toBe("https://lite.desmos.network/validators");
  profileApi.unavailable = true;
  const unavailable = await profileApi.request("/proposals");
  expect(unavailable.status).toBe(503);
  expect(unavailable.headers.get("retry-after")).toBe("60");
  expect(unavailable.headers.get("cache-control")).toBe("no-store");
  expect(await unavailable.text()).toContain("Desmos data is temporarily unavailable");
  profileApi.unavailable = false;
  profileApi.rpcError = true;
  for (const path of ["/blocks", "/transactions"]) {
    const rpcFailure = await profileApi.request(path);
    expect(rpcFailure.status, path).toBe(503);
    expect(await rpcFailure.text()).toContain("Desmos data is temporarily unavailable");
  }
});

test("serves crawler resources and keeps wallet state out of public HTML", async ({ profileApi }) => {
  const robots = await profileApi.request("/robots.txt");
  expect(robots.status).toBe(200);
  expect(robots.headers.get("content-type")).toContain("text/plain");
  expect(await robots.text()).toContain("Sitemap: https://lite.desmos.network/sitemap.xml");
  const sitemap = await profileApi.request("/sitemap.xml");
  expect(sitemap.headers.get("content-type")).toContain("application/xml");
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>https://lite.desmos.network/validators/${OPERATOR}</loc>`);
  expect(xml).toContain("<loc>https://lite.desmos.network/proposals/51</loc>");
  expect(xml).toContain(`<loc>https://lite.desmos.network/transactions/${TX_HASH}</loc>`);
  expect(xml).not.toContain("/wallet");
  expect(xml).not.toContain("127.0.0.1");
  for (const path of ["/llms.txt", "/docs/explorer.md", "/social-card.png"]) expect((await profileApi.request(path)).status, path).toBe(200);
  expect((await profileApi.request("/llms-full.txt")).status).toBe(404);
  expect((await profileApi.request("/assets/missing.js")).status).toBe(404);
  const wallet = await profileApi.request("/wallet");
  expect(wallet.headers.get("x-robots-tag")).toBe("noindex, follow");
  expect(wallet.headers.get("cache-control")).toBe("no-store");
  const html = await wallet.text();
  expect(html).toContain('"resources":{}');
  expect(html).not.toContain(ACCOUNT);
  expect(await (await profileApi.request("/validators", { method: "HEAD" })).text()).toBe("");
});

test("wallet connection still works after hydration under the document CSP", async ({ page, profileApi }) => {
  await page.addInitScript((address) => {
    window.keplr = { enable: async () => {}, getKey: async () => { throw new Error("Unused"); } };
    window.getOfflineSigner = () => ({
      getAccounts: async () => [{ address, algo: "secp256k1", pubkey: new Uint8Array(33) }],
      signDirect: async () => { throw new Error("This test must not sign transactions."); }
    });
  }, ACCOUNT);
  await page.goto("/wallet");
  await page.getByRole("button", { name: /^Keplr/ }).click();
  await expect(page.getByText("Available: 100.000000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByText("Total rewards: 1.000000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim rewards", exact: true })).toBeEnabled();
});
