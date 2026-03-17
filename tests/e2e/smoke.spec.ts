import { expect, test } from "@playwright/test";
import { mockExplorerApi } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockExplorerApi(page);
});

test("renders the dashboard with mocked explorer data", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Home", exact: true })).toBeVisible();
  const latestHeightCard = page.getByText("Latest Height", { exact: true }).locator("..");
  const activeValidatorsCard = page.getByText("Active Validators", { exact: true }).locator("..");
  await expect(latestHeightCard.getByText("26,934,457", { exact: true })).toBeVisible();
  await expect(activeValidatorsCard.getByText("24", { exact: true })).toBeVisible();
  await expect(page.getByText("76,323,264.012345 DSM")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Recent Blocks", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Recent Transactions", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "26,934,457" })).toBeVisible();
  await expect(page.getByText("MsgSend")).toBeVisible();
  await expect(page.getByText("© 2026 Forbole Limited.")).toBeVisible();
});

test("navigates across the explorer list pages", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Blocks" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Blocks", exact: true })).toBeVisible();
  await expect(page.getByText("Apollo", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Transactions", exact: true })).toBeVisible();
  await expect(page.getByText("MsgSend")).toBeVisible();

  await page.getByRole("link", { name: "Validators" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Validators", exact: true })).toBeVisible();
  await expect(page.getByText("Apollo", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Proposals" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Proposals", exact: true })).toBeVisible();
  await expect(page.getByText("Proposal #17")).toBeVisible();
  await expect(page.getByText("Improve Desmos metadata indexing")).toBeVisible();
});

test("shows the disconnected wallet onboarding state", async ({ page }) => {
  await page.goto("/wallet");

  await expect(page.getByRole("heading", { level: 1, name: "Wallet", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Connect Wallet", exact: true })).toBeVisible();
  await expect(page.getByText("Keplr and Ledger Desmos app supported")).toBeVisible();
  await expect(page.getByRole("button", { name: /Keplr/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ledger/ })).toBeVisible();
});
