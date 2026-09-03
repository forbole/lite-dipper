import { expect } from "@playwright/test";
import { test, TX_HASH, ACCOUNT, INACTIVE_ACCOUNT } from "./fixtures/explorer";

test("large transaction logs and events stay unmounted until expanded, then preserve safe JSON values", async ({ page, profileApi }) => {
  const value = '<script>window.__eventInjected = true</script>\n1000000udsm "quoted" ' + "x".repeat(500);
  const events = Array.from({ length: 3 }, (_, index) => ({
    type: `transfer_${index}`,
    attributes: Array.from({ length: 16 }, (_, attribute) => ({ key: `attribute_${attribute}`, value }))
  }));
  profileApi.serveDocuments = true;
  profileApi.transaction = {
    tx: { body: { messages: Array.from({ length: 80 }, () => ({
      "@type": "/cosmos.bank.v1beta1.MsgSend", from_address: ACCOUNT, to_address: INACTIVE_ACCOUNT,
      amount: [{ denom: "udsm", amount: "1000000" }]
    })) }, auth_info: { fee: { amount: [] } } },
    tx_response: { txhash: TX_HASH, height: "3", timestamp: "2026-09-03T12:00:00Z", code: 0,
      logs: Array.from({ length: 80 }, (_, msg_index) => ({ msg_index, log: "", events })), events }
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`/transactions/${TX_HASH}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Transaction Overview" })).toBeVisible();
  const logs = page.getByRole("region", { name: "Message logs JSON" });
  const transactionEvents = page.getByRole("region", { name: "Transaction events JSON" });
  for (const region of [logs, transactionEvents]) {
    await expect(region.locator("details")).toHaveCount(1);
    await expect(region.locator("details[open]")).toHaveCount(0);
    expect(await region.locator("*").count()).toBeLessThan(10);
    await expect(region).not.toContainText("attribute_0");
  }

  // The server body is compact too: attributes occur only in the inert data
  // snapshot, not as thousands of rendered message/event rows.
  const html = await response!.text();
  expect(html.split('<script id="page-data"')[0]).not.toContain("attribute_0");
  const logSummary = logs.locator("summary").first();
  await logSummary.focus();
  await page.keyboard.press("Enter");
  await expect(logs.locator("details[open]")).toHaveCount(1);
  await expect(logs.locator("details")).toHaveCount(81);
  await expect(logs).not.toContainText("transfer_0");
  await logs.locator("summary").nth(1).click();
  await logs.locator("summary").filter({ hasText: '"events":' }).click();
  await logs.locator("details[open]").last().locator("summary").nth(1).click();
  await logs.locator("summary").filter({ hasText: '"attributes":' }).click();
  await logs.locator("details[open]").last().locator("summary").nth(1).click();
  await expect(logs).toContainText(JSON.stringify(value));
  await expect(logs.locator("script, iframe, img")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__eventInjected"))).toBeUndefined();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await logs.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(384);
  await logSummary.click();
  await expect(logs.locator("details")).toHaveCount(1);
  await expect(logs).not.toContainText("attribute_0");
  await transactionEvents.locator("summary").first().click();
  await expect(transactionEvents.locator("details")).toHaveCount(4);
  await expect(logs.locator("details[open]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("empty logs and events retain their empty states", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  await page.goto(`/transactions/${TX_HASH}`);
  await expect(page.getByText("No structured message logs returned.")).toBeVisible();
  await expect(page.getByText("No events returned.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: /JSON$/ })).toHaveCount(0);
});
