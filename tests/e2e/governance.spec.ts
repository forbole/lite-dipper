import { expect, test, type Page } from "@playwright/test";
import { GOVERNANCE_PROPOSAL } from "./fixtures";
import { getVotingProgress } from "../../src/lib/governance";

const proposalUrl = "https://api.mainnet.desmos.network/cosmos/gov/v1/proposals/17";
const poolUrl = "https://api.mainnet.desmos.network/cosmos/staking/v1beta1/pool";
const paramsUrl = "https://api.mainnet.desmos.network/cosmos/gov/v1/params/tallying";
const tallyParams = { quorum: "0.334000000000000000", threshold: "0.500000000000000000", veto_threshold: "0.334000000000000000" };
const liveTally = {
  yes_count: "60000000000000",
  no_count: "10000000000000",
  abstain_count: "20000000000000",
  no_with_veto_count: "10000000000000"
};

async function mockProposal(page: Page, proposal = GOVERNANCE_PROPOSAL) {
  await page.route(proposalUrl, (route) => route.fulfill({ json: { proposal } }));
}

test.beforeEach(async ({ page }) => {
  await page.route("https://api.mainnet.desmos.network/cosmos/tx/v1beta1/txs?*", (route) => route.fulfill({ json: { txs: [], tx_responses: [] } }));
  await page.route(poolUrl, (route) => route.fulfill({ json: { pool: { bonded_tokens: "200000000000000" } } }));
  await page.route(paramsUrl, (route) => route.fulfill({ json: { params: tallyParams } }));
});

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
  await expect(yes.getByText("60.00% of votes cast", { exact: true })).toBeVisible();
  for (const [option, percentage] of [["Yes", "30.00%"], ["No", "5.00%"], ["Abstain", "10.00%"], ["No With Veto", "5.00%"]]) {
    await expect(page.getByText(option, { exact: true }).locator("..").getByText(`${percentage} of bonded power`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Total voted: 100,000,000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByText("Current bonded power: 200,000,000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Bonded voting power participation" })).toHaveAttribute("aria-valuenow", "50");
  await expect(page.getByRole("progressbar", { name: "Approval", exact: true })).toHaveAttribute("aria-valuenow", "75");
  await expect(page.getByRole("progressbar", { name: "Veto", exact: true })).toHaveAttribute("aria-valuenow", "10");
  await expect(page.getByText("Currently passing", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final Tally", exact: true })).toHaveCount(0);
  expect(workerRequests).toEqual([]);
});

test("polls changed tallies and transitions to the stored final result", async ({ page }) => {
  await page.clock.install();
  let proposal = { ...GOVERNANCE_PROPOSAL };
  let tally = { ...liveTally };
  let tallyRequests = 0;
  let poolRequests = 0;
  let paramsRequests = 0;
  let bondedTokens = "200000000000000";
  await page.route(poolUrl, (route) => {
    poolRequests += 1;
    return route.fulfill({ json: { pool: { bonded_tokens: bondedTokens } } });
  });
  await page.route(paramsUrl, (route) => {
    paramsRequests += 1;
    return route.fulfill({ json: { params: tallyParams } });
  });
  await page.route(proposalUrl, (route) => route.fulfill({ json: { proposal } }));
  await page.route(`${proposalUrl}/tally`, (route) => {
    tallyRequests += 1;
    return route.fulfill({ json: { tally } });
  });
  await page.goto("/proposals/17");
  await expect(page.getByText("60,000,000 DSM", { exact: true })).toBeVisible();

  tally = { ...liveTally, yes_count: "70000000000000" };
  bondedTokens = "400000000000000";
  await page.clock.fastForward(30_000);
  await expect(page.getByText("70,000,000 DSM", { exact: true })).toBeVisible();
  expect(tallyRequests).toBe(2);
  await expect(page.getByText("Quorum not met", { exact: true })).toBeVisible();
  await expect(page.getByText("Participation: 27.50%", { exact: true })).toBeVisible();

  proposal = { ...proposal, status: "PROPOSAL_STATUS_PASSED", final_tally_result: tally };
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("heading", { name: "Final Tally", exact: true })).toBeVisible();
  await expect(page.getByText("70,000,000 DSM", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vote", exact: true })).toHaveCount(0);
  expect(tallyRequests).toBe(2);
  expect(poolRequests).toBe(2);
  expect(paramsRequests).toBe(2);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByText(/of bonded power$/)).toHaveCount(0);
  await expect(page.getByText(/Historical participation is unavailable/)).toBeVisible();
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
  await expect(page.getByText("100.00% of votes cast", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
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

test("keeps the tally when bonded power fails or is invalid, then recovers", async ({ page }) => {
  await mockProposal(page);
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally: liveTally } }));
  await page.route(poolUrl, (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/proposals/17");
  await expect(page.getByRole("alert")).toContainText("Bonded power is currently unavailable");
  for (const amount of [undefined, "0", "-1", "1.5", 200000000000000]) {
    await page.route(poolUrl, (route) => route.fulfill({ json: { pool: { bonded_tokens: amount } } }));
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("positive bonded total");
    await expect(page.getByText("60.00% of votes cast", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.getByText(/of bonded power$/)).toHaveCount(0);
  }
  await page.route(poolUrl, (route) => route.fulfill({ json: { pool: { bonded_tokens: "200000000000000" } } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Participation: 50.00%", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("keeps participation without inventing voting thresholds and recovers", async ({ page }) => {
  await mockProposal(page);
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally: liveTally } }));
  await page.route(paramsUrl, (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/proposals/17");
  await expect(page.getByRole("alert")).toContainText("Voting thresholds are currently unavailable");
  await expect(page.getByText("Participation: 50.00%", { exact: true })).toBeVisible();
  await expect(page.getByText("Passing status unavailable", { exact: true })).toBeVisible();
  await page.route(paramsUrl, (route) => route.fulfill({ json: { params: { ...tallyParams, threshold: "invalid" } } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("incomplete voting thresholds");
  await expect(page.getByText("Currently passing", { exact: true })).toHaveCount(0);
  // Also accept the legacy tally_params response, using its actual quorum.
  await page.route(paramsUrl, (route) => route.fulfill({ json: { tally_params: { ...tallyParams, quorum: "0.6" } } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Quorum not met", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Bonded voting power participation" })).toHaveAttribute("aria-valuetext", "50.00% of bonded power voted; quorum 60.00%, not met");
});

test("renders large live amounts and zero participation without losing precision", async ({ page }) => {
  await mockProposal(page);
  let tally = { yes_count: "9007199254740993", no_count: "0", abstain_count: "0", no_with_veto_count: "0" };
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally } }));
  await page.route(poolUrl, (route) => route.fulfill({ json: { pool: { bonded_tokens: "18014398509481986" } } }));
  await page.goto("/proposals/17");
  await expect(page.getByText("9,007,199,254.740993 DSM", { exact: true })).toBeVisible();
  await expect(page.getByText("Current bonded power: 18,014,398,509.481986 DSM", { exact: true })).toBeVisible();
  await expect(page.getByText("50.00% of bonded power", { exact: true })).toBeVisible();
  tally = { ...tally, yes_count: "0" };
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Participation: 0.00%", { exact: true })).toBeVisible();
  await expect(page.getByText("No voting power recorded.", { exact: true })).toBeVisible();
  await expect(page.getByText("Quorum not met", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Bonded voting power participation" })).toHaveAttribute("aria-valuenow", "0");
});

test("uses exact quorum, approval, veto and abstention rules at their boundaries", () => {
  const params = { quorum: "0.334", threshold: "0.5", vetoThreshold: "0.334" };
  const progress = (yes: string, no: string, abstain: string, noWithVeto: string, bonded = "1000") =>
    getVotingProgress({ yes, no, abstain, noWithVeto }, bonded, params);
  expect(progress("333", "0", "0", "0").status).toBe("quorum");
  expect(progress("334", "0", "0", "0").status).toBe("passing");
  expect(progress("167", "167", "0", "0").status).toBe("approval");
  expect(progress("168", "166", "0", "0").status).toBe("passing");
  expect(progress("0", "0", "334", "0").status).toBe("abstaining");
  expect(progress("1", "0", "999", "0").status).toBe("passing");
  expect(progress("666", "0", "0", "334").status).toBe("passing");
  expect(progress("665", "0", "0", "335").status).toBe("veto");
  expect(progress("400", "0", "300", "300").status).toBe("passing");
  // The same rounded 33.40% can be just below quorum. Never classify using
  // displayed percentages or Number-converted token amounts.
  expect(progress("334000000000000000", "0", "0", "0", "1000000000000000000").status).toBe("passing");
  expect(progress("333999999999999999", "0", "0", "0", "1000000000000000000").status).toBe("quorum");
  expect(progress("500000000000000001", "499999999999999999", "0", "0", "1000000000000000000").status).toBe("passing");
});

test("shows approval, abstention and veto blockers on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockProposal(page);
  await page.route(poolUrl, (route) => route.fulfill({ json: { pool: { bonded_tokens: "1000" } } }));
  let tally = { yes_count: "167", no_count: "167", abstain_count: "0", no_with_veto_count: "0" };
  await page.route(`${proposalUrl}/tally`, (route) => route.fulfill({ json: { tally } }));
  await page.goto("/proposals/17");
  await expect(page.getByText("Approval threshold not met", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Approval", exact: true })).toHaveAttribute("aria-valuenow", "50");
  tally = { yes_count: "0", no_count: "0", abstain_count: "334", no_with_veto_count: "0" };
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("No non-abstaining votes", { exact: true })).toBeVisible();
  tally = { yes_count: "665", no_count: "0", abstain_count: "0", no_with_veto_count: "335" };
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Veto threshold exceeded", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Veto", exact: true })).toHaveAttribute("aria-valuenow", "33.5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
