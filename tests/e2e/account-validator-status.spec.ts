import { expect } from "@playwright/test";
import { test, OPERATOR, ACCOUNT, INACTIVE_OPERATOR, PROFILE } from "./fixtures/explorer";

const JAILED = "desmosvaloper1pe2fwwffxn2qnykeut8wzm20sv6eevxedlgpfu";
const UNBONDING = "desmosvaloper1rh2qeyg5z4ddm8erf7preu3yp72g2zvzjqhgx9";

function validator(operator_address: string, status: string, jailed = false) {
  return { operator_address, status, jailed, description: { moniker: "Staking fallback" } };
}

test("account delegations show bonded, jailed and inactive validators in initial HTML", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  profileApi.delegationAddresses = [OPERATOR, INACTIVE_OPERATOR, JAILED, UNBONDING];
  profileApi.validatorResponses = {
    [INACTIVE_OPERATOR]: { validator: validator(INACTIVE_OPERATOR, "BOND_STATUS_UNBONDED") },
    [JAILED]: { validator: validator(JAILED, "BOND_STATUS_BONDED", true) },
    [UNBONDING]: { validator: validator(UNBONDING, "BOND_STATUS_UNBONDING") }
  };
  const response = await page.goto(`/accounts/${ACCOUNT}`);
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  for (const status of ["Bonded", "Jailed", "Inactive"]) expect(html).toContain(`>${status}</span>`);

  for (const [operator, status, color] of [
    [OPERATOR, "Bonded", "emerald"], [INACTIVE_OPERATOR, "Inactive", "slate"],
    [JAILED, "Jailed", "rose"], [UNBONDING, "Inactive", "slate"]
  ]) {
    const delegation = page.locator(`a[href="/validators/${operator}"]`);
    await expect(delegation.getByText(status, { exact: true })).toBeVisible();
    await expect(delegation.getByText(status, { exact: true })).toHaveClass(new RegExp(color));
    await expect(delegation.getByText("50.000000 DSM", { exact: true })).toBeVisible();
  }
  const active = page.locator(`a[href="/validators/${OPERATOR}"]`);
  await expect(active.getByText("Apollo Community", { exact: true })).toBeVisible();
  await expect(active.getByRole("img")).toHaveAttribute("src", PROFILE.pictures.profile);
  expect(profileApi.requests).not.toContain(`/cosmos/staking/v1beta1/validators/${OPERATOR}`);
  expect(profileApi.requests).toContain(`/cosmos/staking/v1beta1/validators/${INACTIVE_OPERATOR}`);

  // Resolving delegation targets must not insert inactive validators into the
  // shared bonded validator directory used by the validator list.
  const validators = await (await profileApi.request("/api/validators")).json();
  expect(validators.map((entry: { operatorAddress: string }) => entry.operatorAddress)).toEqual([OPERATOR]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("missing validator status stays unknown without hiding balances or profile identity", async ({ page, profileApi }) => {
  profileApi.serveDocuments = true;
  profileApi.delegationAddresses = [OPERATOR, INACTIVE_OPERATOR, JAILED];
  profileApi.validatorResponses = {
    [INACTIVE_OPERATOR]: { status: 503 },
    [JAILED]: { status: 404 }
  };
  const response = await page.goto(`/accounts/${ACCOUNT}`);
  expect(response?.status()).toBe(200);
  for (const operator of [INACTIVE_OPERATOR, JAILED]) {
    const delegation = page.locator(`a[href="/validators/${operator}"]`);
    await expect(delegation.getByText("Status unavailable", { exact: true })).toBeVisible();
    await expect(delegation.getByText("Inactive", { exact: true })).toHaveCount(0);
    await expect(delegation.getByText("50.000000 DSM", { exact: true })).toBeVisible();
  }
  await expect(page.locator(`a[href="/validators/${INACTIVE_OPERATOR}"]`).getByText("Inactive Community", { exact: true })).toBeVisible();
  await expect(page.getByText("100.000000 DSM", { exact: true })).toHaveCount(2);
});

test("delegation status updates on account refresh", async ({ page, profileApi }) => {
  profileApi.delegationAddresses = [INACTIVE_OPERATOR];
  profileApi.validatorResponses = { [INACTIVE_OPERATOR]: { validator: validator(INACTIVE_OPERATOR, "BOND_STATUS_UNBONDED") } };
  await page.clock.install();
  await page.goto(`/accounts/${ACCOUNT}`);
  const delegation = page.locator(`a[href="/validators/${INACTIVE_OPERATOR}"]`);
  await expect(delegation.getByText("Inactive", { exact: true })).toBeVisible();
  profileApi.validatorResponses[INACTIVE_OPERATOR] = { validator: validator(INACTIVE_OPERATOR, "BOND_STATUS_UNBONDED", true) };
  await page.clock.fastForward(20_000);
  await expect(delegation.getByText("Jailed", { exact: true })).toBeVisible();
  await expect(delegation.getByText("Inactive", { exact: true })).toHaveCount(0);
});
