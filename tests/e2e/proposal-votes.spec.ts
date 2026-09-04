import { expect } from "@playwright/test";
import { test, ACCOUNT, INACTIVE_ACCOUNT, PROPOSAL } from "./fixtures/explorer";

const HASH_A = "AB".repeat(32);
const HASH_B = "CD".repeat(32);
const HASH_C = "EF".repeat(32);
const vote = (voter = ACCOUNT, option = "VOTE_OPTION_YES", proposalId = "51", version = "v1") => ({
  "@type": `/cosmos.gov.${version}.MsgVote`, proposal_id: proposalId, voter, option
});
const tx = (hash: string, messages: unknown[], code: number | null = 0, height = "100") => ({
  tx: { body: { messages } },
  response: { txhash: hash, height, timestamp: "2026-09-04T02:20:26Z", code }
});
const payload = (...transactions: ReturnType<typeof tx>[]) => ({
  txs: transactions.map((transaction) => transaction.tx),
  tx_responses: transactions.map((transaction) => transaction.response)
});

test("shows proposal-specific vote transactions below the actions and hydrates safely", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  profileApi.proposal = { ...PROPOSAL, status: "PROPOSAL_STATUS_VOTING_PERIOD" };
  profileApi.voteTransactions = payload(
    tx(HASH_A, [vote(), vote(ACCOUNT, "VOTE_OPTION_NO", "52")], 0, "103"),
    tx(HASH_B, [{ "@type": "/cosmos.authz.v1beta1.MsgExec", grantee: ACCOUNT, msgs: [{
      "@type": "/cosmos.gov.v1beta1.MsgVoteWeighted", proposal_id: "51", voter: INACTIVE_ACCOUNT,
      options: [{ option: "VOTE_OPTION_YES", weight: "0.700000000000000000" }, { option: "VOTE_OPTION_ABSTAIN", weight: "0.300000000000000000" }]
    }] }], 0, "102"),
    tx(HASH_C, [vote(ACCOUNT, "VOTE_OPTION_NO_WITH_VETO", "51", "v1beta1")], 5, "101")
  );
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (/hydration|hydrating|#418/i.test(message.text())) errors.push(message.text()); });
  await page.goto("/proposals/51");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recent vote transactions", exact: true }) });
  const rows = section.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator(`a[href='/transactions/${HASH_A}']`)).toBeVisible();
  await expect(rows.nth(0).locator(`a[href='/accounts/${ACCOUNT}']`)).toBeVisible();
  await expect(rows.nth(0).locator("a[href='/blocks/103']")).toBeVisible();
  await expect(rows.nth(0).getByText("Yes", { exact: true })).toBeVisible();
  await expect(rows.nth(0).getByText("No", { exact: true })).toHaveCount(0);
  await expect(rows.nth(1).getByText("Yes 70.00%", { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByText("Abstain 30.00%", { exact: true })).toBeVisible();
  await expect(rows.nth(1).locator(`a[href='/accounts/${INACTIVE_ACCOUNT}']`)).toBeVisible();
  await expect(rows.nth(1).locator(`a[href='/accounts/${ACCOUNT}']`)).toHaveCount(0);
  await expect(rows.nth(2).getByText("Failed", { exact: true })).toBeVisible();
  await expect(rows.nth(2).getByText("No With Veto", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh votes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh votes", exact: true })).toBeEnabled();
  const search = requests.filter((url) => new URL(url).pathname === "/cosmos/tx/v1beta1/txs");
  expect(search.length).toBeGreaterThan(0);
  for (const url of search) {
    const query = new URL(url).searchParams;
    expect(query.get("events")).toBe("proposal_vote.proposal_id='51'");
    expect(query.get("order_by")).toBe("2");
    expect(query.get("limit")).toBe("10");
    expect(query.get("page")).toBe("1");
  }
  expect(requests.some((url) => new URL(url).pathname.startsWith("/api/"))).toBe(false);
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(headings.indexOf("Recent vote transactions")).toBe(headings.indexOf("Vote") + 1);
  expect(errors).toEqual([]);
});

test("distinguishes unavailable history from empty results and preserves stale rows", async ({ page, profileApi }) => {
  profileApi.voteTransactionsStatus = 503;
  await page.goto("/proposals/51");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recent vote transactions", exact: true }) });
  await expect(section.getByRole("alert")).toContainText("Recent vote transactions are unavailable");
  await expect(section.getByText("No vote transactions found for this proposal.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Final Tally", exact: true })).toBeVisible();
  profileApi.voteTransactionsStatus = 200;
  profileApi.voteTransactions = payload(tx(HASH_A, [vote()]));
  await section.getByRole("button", { name: "Refresh votes", exact: true }).click();
  await expect(section.getByRole("listitem")).toHaveCount(1);
  profileApi.voteTransactionsStatus = 503;
  await section.getByRole("button", { name: "Refresh votes", exact: true }).click();
  await expect(section.getByRole("alert")).toContainText("showing previously loaded data");
  await expect(section.getByRole("listitem")).toHaveCount(1);
  profileApi.voteTransactionsStatus = 200;
  profileApi.voteTransactions = { txs: [], tx_responses: [tx(HASH_B, []).response] };
  await section.getByRole("button", { name: "Refresh votes", exact: true }).click();
  await expect(section.getByRole("alert")).toContainText("incomplete vote transaction data");
  await expect(section.locator(`a[href='/transactions/${HASH_B}']`)).toHaveCount(0);
  profileApi.voteTransactions = payload();
  await section.getByRole("button", { name: "Refresh votes", exact: true }).click();
  await expect(section.getByText("No vote transactions found for this proposal.", { exact: true })).toBeVisible();
  await expect(section.getByRole("alert")).toHaveCount(0);
});

test("polls vote transactions and refreshes them with the proposal", async ({ page, profileApi }) => {
  await page.clock.install();
  profileApi.voteTransactions = payload(tx(HASH_A, [vote()]));
  await page.goto("/proposals/51");
  await expect(page.locator(`a[href='/transactions/${HASH_A}']`)).toBeVisible();
  profileApi.voteTransactions = payload(tx(HASH_B, [vote(INACTIVE_ACCOUNT)]));
  await page.clock.fastForward(30_000);
  await expect(page.locator(`a[href='/transactions/${HASH_B}']`)).toBeVisible();
  await expect(page.locator(`a[href='/transactions/${HASH_A}']`)).toHaveCount(0);
  profileApi.voteTransactions = payload(tx(HASH_C, [vote()]));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(`a[href='/transactions/${HASH_C}']`)).toBeVisible();
});

test("bounds multi-message previews on mobile and handles unknown details safely", async ({ page, profileApi }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  profileApi.voteTransactions = payload(...Array.from({ length: 12 }, (_, index) => tx(
    (index + 1).toString(16).padStart(64, "0"), Array.from({ length: 100 }, () => vote()), 0, String(100 - index)
  )));
  await page.goto("/proposals/51");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recent vote transactions", exact: true }) });
  await expect(section.getByRole("listitem")).toHaveCount(10);
  await expect(section.getByText("97 more vote messages in this transaction.", { exact: true })).toHaveCount(10);
  await expect(section.locator(`a[href='/accounts/${ACCOUNT}']`)).toHaveCount(30);
  // Font loading may still be changing the surrounding mobile layout when
  // the independently fetched transaction rows first appear.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const layout = await page.evaluate(() => ({
    width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll("#root *")].filter((element) => element.getBoundingClientRect().right > window.innerWidth)
      .slice(-12).map((element) => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width, text: element.textContent?.slice(0, 45) }))
  }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
  const bad = tx(HASH_A, [vote('<iframe src="javascript:alert(1)">', '<script>alert(1)</script>')], null);
  bad.response.timestamp = "invalid date";
  profileApi.voteTransactions = payload(bad, tx(HASH_B, [{ "@type": "/unknown.MsgVote", proposal_id: "51" }]));
  await section.getByRole("button", { name: "Refresh votes", exact: true }).click();
  await expect(section.getByText("Voter unavailable", { exact: true })).toBeVisible();
  await expect(section.getByText("Unknown option", { exact: true })).toBeVisible();
  await expect(section.getByText("Unknown result", { exact: true })).toBeVisible();
  await expect(section.getByText("Vote details unavailable. Open the transaction for details.", { exact: true })).toBeVisible();
  await expect(section.locator("script, iframe, [onclick], [onerror]")).toHaveCount(0);
});

test.describe("vote transaction HTML without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("renders recent votes and keeps the page available if transaction search fails", async ({ page, profileApi }) => {
    profileApi.serveDocuments = true;
    profileApi.voteTransactions = payload(tx(HASH_A, [vote()]));
    let response = await page.goto("/proposals/51");
    expect(response?.status()).toBe(200);
    await expect(page.locator(`a[href='/transactions/${HASH_A}']`)).toBeVisible();
    profileApi.voteTransactionsStatus = 503;
    response = await page.reload();
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Final Tally", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Recent vote transactions are unavailable");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  });
});
