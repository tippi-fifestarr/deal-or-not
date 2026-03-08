import { test, expect } from "@playwright/test";

test.describe("Prediction Markets", () => {
  test("loads markets page", async ({ page }) => {
    await page.goto("/markets");

    await expect(page.locator("body")).not.toBeEmpty();

    await page.screenshot({ path: "e2e-07-markets.png", fullPage: false });
  });
});

test.describe("Best of Banker", () => {
  test("loads best-of-banker gallery", async ({ page }) => {
    await page.goto("/best-of-banker");

    await expect(page.locator("body")).not.toBeEmpty();

    await page.screenshot({ path: "e2e-08-best-of-banker.png", fullPage: false });
  });
});
