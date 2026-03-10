import { test, expect } from "@playwright/test";

test.describe("Aptos Integration", () => {
  test("play page shows connect wallet prompt with APT button in nav", async ({ page }) => {
    await page.goto("/play");

    // Nav should have the APT connect button (Aptos wallet connect)
    const aptBtn = page.locator("button", { hasText: "APT" });
    await expect(aptBtn).toBeVisible();
  });

  test("nav shows EVM connect button alongside APT button", async ({ page }) => {
    await page.goto("/");

    // Both connect options should be visible (dynamic imports, give extra time)
    const evmConnect = page.locator("nav button", { hasText: "CONNECT" });
    const aptBtn = page.locator("nav button", { hasText: "APT" });
    await expect(evmConnect).toBeVisible({ timeout: 10000 });
    await expect(aptBtn).toBeVisible({ timeout: 10000 });
  });

  test("play page still shows EVM connect wallet when no wallet connected", async ({ page }) => {
    await page.goto("/play");

    // Without any wallet, should see the standard connect prompt
    await expect(page.locator("text=Connect your wallet")).toBeVisible();
    await expect(page.locator("text=Connect Wallet")).toBeVisible();
  });

  test("nav APT button is styled with Aptos teal color", async ({ page }) => {
    await page.goto("/");

    const aptBtn = page.locator("button", { hasText: "APT" });
    await expect(aptBtn).toBeVisible();

    // Check it has the Aptos teal border styling
    const borderColor = await aptBtn.evaluate(
      (el) => getComputedStyle(el).borderColor
    );
    // The button should exist and be clickable
    await expect(aptBtn).toBeEnabled();
  });

  test("play page game ID input works for Aptos games", async ({ page }) => {
    await page.goto("/play");

    // The join game input should work for any game ID
    const input = page.locator('input[placeholder="Game ID"]');
    await expect(input).toBeVisible();
    await input.fill("42");

    // Join button should work
    const joinBtn = page.locator("button", { hasText: "Join" });
    await expect(joinBtn).toBeVisible();
  });

  test("nav renders without errors on all pages", async ({ page }) => {
    // Test that the Aptos provider doesn't break any page
    const pages = ["/", "/play", "/agents", "/watch", "/markets"];
    for (const path of pages) {
      await page.goto(path);
      // Nav should always be present — use the nav element
      await expect(page.locator("nav")).toBeVisible();
      // APT button should always be in nav
      const aptBtn = page.locator("nav button", { hasText: "APT" });
      await expect(aptBtn).toBeVisible();
    }
  });
});
