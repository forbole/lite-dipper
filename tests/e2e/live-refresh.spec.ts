import { createServer } from "node:http";
import { expect } from "@playwright/test";
import { test, OPERATOR, PROFILE } from "./fixtures/explorer";

test("refreshes validator data on navigation even with a warm browser HTTP cache", async ({ browser, profileApi }) => {
  const validators = await (await profileApi.request("/api/validators")).json();
  let apiRequests = 0;
  const server = createServer(async (request, response) => {
    try {
      if (request.url === "/api/validators") {
        apiRequests += 1;
        response.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=3600" });
        response.end(JSON.stringify(validators));
      } else {
        const result = await profileApi.request(request.url!);
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
      }
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // Routing disables Chromium's HTTP cache. Use a separate, un-routed browser
  // context and a real HTTP server to cover the cache behavior users see.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const address = server.address() as { port: number };
    await page.goto(`http://127.0.0.1:${address.port}/validators`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => apiRequests).toBe(1);
    await expect(page.getByText("12,345 DSM", { exact: true })).toBeVisible();
    validators[0].tokens = "99000000";
    await page.getByRole("link", { name: "Blocks", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Blocks", exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Validators", exact: true }).click();
    await expect(page.getByText("99 DSM", { exact: true })).toBeVisible();
    expect(apiRequests).toBe(2);
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("polls validator detail and metadata after server rendering", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  await page.clock.install();
  const firstRead = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/validators/${OPERATOR}`);
  await page.goto(`/validators/${OPERATOR}`);
  await firstRead;
  await expect(page.getByRole("heading", { name: "Apollo Community", exact: true })).toBeVisible();
  profileApi.profile = { ...PROFILE, nickname: "Updated community", bio: "Updated biography." };
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("heading", { name: "Updated community", exact: true })).toBeVisible();
  await expect(page.getByText("Updated biography.", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Updated community — Desmos Validator | Lite-Dipper");
});

test("refreshes an open page on focus, reconnect and back-forward restoration", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  const firstRead = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/blocks");
  await page.goto("/blocks");
  await firstRead;
  profileApi.latestHeight = 4;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("link", { name: "4", exact: true })).toBeVisible();
  profileApi.latestHeight = 5;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("link", { name: "5", exact: true })).toBeVisible();
  profileApi.latestHeight = 6;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.getByRole("link", { name: "6", exact: true })).toBeVisible();
});

test("a stalled API read times out so later polls can recover", async ({ page, profileApi }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const original = window.fetch;
    let requests = 0;
    window.fetch = (input, options) => {
      if (String(input).startsWith("/api/blocks?") && ++requests === 2) {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
        });
      }
      return original(input, options);
    };
  });
  await page.goto("/blocks");
  await expect(page.getByRole("link", { name: "3", exact: true })).toBeVisible();
  await page.clock.fastForward(15_000);
  profileApi.latestHeight = 4;
  await page.clock.fastForward(15_000);
  await page.clock.fastForward(15_000);
  await expect(page.getByRole("link", { name: "4", exact: true })).toBeVisible();
});

test("a failed refresh cannot unmount a populated page and stop its polling", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  await page.clock.install();
  const firstRead = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/blocks");
  await page.goto("/blocks");
  await firstRead;
  let unavailable = true;
  await page.route("**/api/blocks?limit=20", async (route) => {
    if (unavailable) return route.fulfill({ status: 404, json: { error: "Upstream unavailable" } });
    return route.fallback();
  });
  await page.clock.fastForward(15_000);
  await expect(page.getByRole("link", { name: "3", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Page Not Found", exact: true })).toHaveCount(0);
  unavailable = false;
  profileApi.latestHeight = 4;
  await page.clock.fastForward(15_000);
  await expect(page.getByRole("link", { name: "4", exact: true })).toBeVisible();
});

test("HTML revalidates in the browser while retaining a short edge TTL", async ({ profileApi }) => {
  profileApi.cacheEnabled = true;
  profileApi.versionId = "deployment-a";
  for (let index = 0; index < 2; index++) {
    const response = await profileApi.request("/validators");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=30, must-revalidate");
  }
  expect((await profileApi.request("/api/validators")).headers.get("cache-control")).toBe("public, max-age=0, s-maxage=30, must-revalidate");
  expect((await profileApi.request("/wallet")).headers.get("cache-control")).toBe("no-store");
  for (const origin of ["http://lite.desmos.network", "http://127.0.0.1:4173", "https://localhost"]) {
    expect((await profileApi.request(`${origin}/validators`)).headers.get("cache-control")).toBe("no-store");
  }
  profileApi.versionId = undefined;
  expect((await profileApi.request("/validators")).headers.get("cache-control")).toBe("no-store");
});

test("HTML from a previous deployment cannot serve an obsolete app bundle", async ({ profileApi }) => {
  profileApi.cacheEnabled = true;
  profileApi.versionId = "deployment-a";
  const first = await (await profileApi.request(`/validators/${OPERATOR}`)).text();
  profileApi.profile = { ...PROFILE, nickname: "New deployment profile" };
  expect(await (await profileApi.request(`/validators/${OPERATOR}`)).text()).toBe(first);
  profileApi.versionId = "deployment-b";
  const updated = await (await profileApi.request(`/validators/${OPERATOR}`)).text();
  expect(updated).toContain("New deployment profile");
  expect(updated).not.toBe(first);
});
