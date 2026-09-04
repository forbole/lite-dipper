import { expect, test } from "@playwright/test";
import { mockExplorerApi } from "./fixtures";

declare global {
  interface Window { backgroundDraws: number; motionChanged: boolean }
}

test("background stays within the viewport and stops for reduced motion and hidden tabs", async ({ page }) => {
  await mockExplorerApi(page);
  await page.setViewportSize({ width: 390, height: 650 });
  await page.clock.install();
  await page.addInitScript(() => {
    window.backgroundDraws = 0;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      window.backgroundDraws++;
      return clear.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.getByText("Latest Height", { exact: true })).toBeVisible();
  await page.clock.runFor(100);
  const dimensions = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width, height: canvas.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight, ratio: Math.min(window.devicePixelRatio, 2)
  }));
  expect(dimensions.documentHeight).toBeGreaterThan(dimensions.viewportHeight);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight * dimensions.ratio);
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth * dimensions.ratio);
  const before = await page.evaluate(() => window.backgroundDraws);
  await page.clock.runFor(1000);
  const animated = (await page.evaluate(() => window.backgroundDraws)) - before;
  expect(animated).toBeGreaterThan(0);
  expect(animated).toBeLessThanOrEqual(31);

  const observeMotionChange = () => page.evaluate(() => {
    window.motionChanged = false;
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => { window.motionChanged = true; }, { once: true });
  });
  await observeMotionChange();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => window.motionChanged)).toBe(true);
  await page.clock.runFor(100);
  const reduced = await page.evaluate(() => window.backgroundDraws);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.backgroundDraws)).toBe(reduced);
  await observeMotionChange();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => page.evaluate(() => window.motionChanged)).toBe(true);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.backgroundDraws)).toBeGreaterThan(reduced);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await page.evaluate(() => window.backgroundDraws);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.backgroundDraws)).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.backgroundDraws)).toBeGreaterThan(hidden);
});
