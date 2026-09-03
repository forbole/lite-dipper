import { expect, test, type Page } from "@playwright/test";
import { GOVERNANCE_PROPOSAL } from "./fixtures";

const proposalUrl = "https://api.mainnet.desmos.network/cosmos/gov/v1/proposals/17";
const liveTally = {
  yes_count: "60000000000000",
  no_count: "10000000000000",
  abstain_count: "20000000000000",
  no_with_veto_count: "10000000000000"
};

async function mockProposal(page: Page, proposal = GOVERNANCE_PROPOSAL) {
  await page.route(proposalUrl, (route) => route.fulfill({ json: { proposal } }));
}

test("loads a live stake-weighted tally directly, ignoring the zero final placeholder", async ({ page }) => {
  const workerRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) workerRequests.push(request.url());
  });
  await mockProposal(page);
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally: liveTally } }));
  await page.goto("/proposals/17");

  await expect(page.getByRole("heading", { name: "Live Tally", exact: true })).toBeVisible();
  const yes = page.getByText("Yes", { exact: true }).locator("..");
  await expect(yes.getByText("60,000,000 DSM", { exact: true })).toBeVisible();
  await expect(yes.getByText("60.00%", { exact: true })).toBeVisible();
  await expect(page.getByText("Total voted: 100,000,000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final Tally", exact: true })).toHaveCount(0);
  expect(workerRequests).toEqual([]);
});

test("polls changed tallies and transitions to the stored final result", async ({ page }) => {
  await page.clock.install();
  let proposal = { ...GOVERNANCE_PROPOSAL };
  let tally = { ...liveTally };
  let tallyRequests = 0;
  await page.route(proposalUrl, (route) => route.fulfill({ json: { proposal } }));
  await page.route(`${proposalUrl}/tally`, (route) => {
    tallyRequests += 1;
    return route.fulfill({ json: { tally } });
  });
  await page.goto("/proposals/17");
  await expect(page.getByText("60,000,000 DSM", { exact: true })).toBeVisible();

  tally = { ...liveTally, yes_count: "70000000000000" };
  await page.clock.fastForward(30_000);
  await expect(page.getByText("70,000,000 DSM", { exact: true })).toBeVisible();
  expect(tallyRequests).toBe(2);

  proposal = { ...proposal, status: "PROPOSAL_STATUS_PASSED", final_tally_result: tally };
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("heading", { name: "Final Tally", exact: true })).toBeVisible();
  await expect(page.getByText("70,000,000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vote", exact: true })).toHaveCount(0);
  expect(tallyRequests).toBe(2);
});

test("shows unavailable tally data without substituting zeros and recovers on refresh", async ({ page }) => {
  await mockProposal(page);
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/proposals/17");
  await expect(page.getByRole("alert")).toContainText("Voting totals are currently unavailable.");
  await expect(page.getByRole("heading", { name: "Proposal #17", exact: true })).toBeVisible();
  await expect(page.getByText("0 DSM", { exact: true })).toHaveCount(0);

  // A malformed success response must also remain unavailable.
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally: { yes_count: "0" } } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("incomplete tally");

  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally: liveTally } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("60,000,000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("preserves exact final amounts above JavaScript's safe integer range", async ({ page }) => {
  await mockProposal(page, {
    ...GOVERNANCE_PROPOSAL,
    status: "PROPOSAL_STATUS_PASSED",
    final_tally_result: { yes_count: "9007199254740993", no_count: "0", abstain_count: "0", no_with_veto_count: "0" }
  });
  await page.goto("/proposals/17");
  await expect(page.getByRole("heading", { name: "Final Tally", exact: true })).toBeVisible();
  await expect(page.getByText("9,007,199,254.740993 DSM", { exact: true })).toBeVisible();
  await expect(page.getByText("100.00%", { exact: true })).toBeVisible();
});

test("does not display a final tally before voting starts", async ({ page }) => {
  await mockProposal(page, { ...GOVERNANCE_PROPOSAL, status: "PROPOSAL_STATUS_DEPOSIT_PERIOD" });
  await page.goto("/proposals/17");
  await expect(page.getByRole("heading", { name: "Proposal #17", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^(Live|Final) Tally$/ })).toHaveCount(0);
});

test("marks previously loaded data as stale after a failed refresh", async ({ page }) => {
  await page.clock.install();
  await mockProposal(page);
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally: liveTally } }));
  await page.goto("/proposals/17");
  await expect(page.getByText("60,000,000 DSM", { exact: true })).toBeVisible();
  await page.route(proposalUrl, (route) => route.fulfill({ status: 503, json: {} }));
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("alert")).toContainText("showing previously loaded data");
  await expect(page.getByText("60,000,000 DSM", { exact: true })).toBeVisible();
});
