import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads hero section with title and CTA", async ({ page }) => {
    await page.goto("/");

    // Hero title
    await expect(page.locator("text=DEAL")).toBeVisible();
    await expect(page.locator("text=NOT")).toBeVisible();

    // Play Now button
    const playBtn = page.locator("button", { hasText: "Play Now" });
    await expect(playBtn).toBeVisible();

    await page.screenshot({ path: "e2e-01-homepage.png", fullPage: false });
  });

  test("shows ticker tape with game show flavor", async ({ page }) => {
    await page.goto("/");

    // Ticker should contain at least one of our items
    await expect(page.locator("text=PROTECTED BY")).toBeVisible();
  });

  test("shows Banker section", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=THE BANKER")).toBeVisible();
    await expect(page.locator("text=Greatest Hits")).toBeVisible();
  });

  test("shows AI Agents section with agent cards", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=Meet the AI Agents")).toBeVisible();
    await expect(page.locator("text=View Full Leaderboard")).toBeVisible();
  });

  test("shows infrastructure cards (VRF, Price Feeds, CCIP)", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=CHAINLINK PRICE FEEDS")).toBeVisible();
    await expect(page.locator("text=VRF: QUANTUM DICE")).toBeVisible();
    await expect(page.locator("text=CCIP: CROSS-CHAIN PLAY")).toBeVisible();
  });

  test("shows CRE workflow cards", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=CRE FTW")).toBeVisible();
    await expect(page.locator("text=CONFIDENTIAL CASE REVEAL")).toBeVisible();
    await expect(page.locator("text=AI BANKER")).toBeVisible();
    await expect(page.locator("text=SPONSOR JACKPOT")).toBeVisible();
  });

  test("GameBoard renders connect wallet prompt", async ({ page }) => {
    await page.goto("/");

    // Scroll to game section
    const playBtn = page.locator("button", { hasText: "Play Now" });
    await playBtn.click();

    // Should see wallet connect prompt (no wallet connected)
    await expect(page.locator("text=Connect your wallet")).toBeVisible();
    await expect(page.locator("text=Connect Wallet")).toBeVisible();
  });

  test("GameBoard spectator mode — enter game ID", async ({ page }) => {
    await page.goto("/");

    // Scroll to game section
    const playBtn = page.locator("button", { hasText: "Play Now" });
    await playBtn.click();

    // Spectator input — enter a known game ID
    const input = page.locator('input[placeholder="Game ID"]');
    await expect(input).toBeVisible();
    await input.fill("8");

    const watchBtn = page.locator("button", { hasText: "Watch" });
    await watchBtn.click();

    // Should load game state (spectator mode)
    await expect(page.locator("text=game #8", { exact: false })).toBeVisible({ timeout: 15000 });
  });
});
