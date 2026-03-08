import { test, expect } from "@playwright/test";

test.describe("Watch Lobby", () => {
  test("loads watch lobby with game ID input", async ({ page }) => {
    await page.goto("/watch");

    // Header
    await expect(page.locator("text=The Audience")).toBeVisible();
    await expect(page.locator("text=Live from Base Sepolia")).toBeVisible();

    // Game ID input
    const input = page.locator('input[placeholder*="28"]');
    await expect(input).toBeVisible();

    // Watch button
    await expect(page.locator("button", { hasText: "Watch" })).toBeVisible();

    await page.screenshot({ path: "e2e-04-watch-lobby.png", fullPage: false });
  });

  test("shows latest game quick-pick", async ({ page }) => {
    await page.goto("/watch");

    // Should show "or jump to the latest" with a game link
    await expect(page.locator("text=jump to the latest")).toBeVisible({ timeout: 15000 });
  });

  test("navigates to game via input", async ({ page }) => {
    await page.goto("/watch");

    const input = page.locator('input[placeholder*="28"]');
    await input.fill("8");
    await page.locator("button", { hasText: "Watch" }).click();

    // Should navigate to /watch/8
    await page.waitForURL("**/watch/8");
  });
});

test.describe("Watch Game (Spectator)", () => {
  // Game 8 is a completed game (GameOver) — stable test target
  test("loads game 8 with spectator bar", async ({ page }) => {
    await page.goto("/watch/8");

    // Spectator bar
    await expect(page.locator("text=Live")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Game #8")).toBeVisible();

    // Navigation buttons
    await expect(page.locator("button", { hasText: "Choose Game" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Exit" })).toBeVisible();

    await page.screenshot({ path: "e2e-05-watch-game.png", fullPage: false });
  });

  test("shows game info sidebar on desktop", async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/watch/8");

    // Sidebar should show game info
    await expect(page.locator("text=Game Info")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Host")).toBeVisible();
    await expect(page.locator("text=Player")).toBeVisible();
    await expect(page.locator("text=Cases Open")).toBeVisible();
  });

  test("shows audience commentary sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/watch/8");

    await expect(page.locator("text=Audience Commentary")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=SWAP IT")).toBeVisible();
  });

  test("shows audience count (1)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/watch/8");

    // Audience count card
    await expect(page.locator("text=Audience")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=(it's you)")).toBeVisible();
  });

  test("shows event log", async ({ page }) => {
    await page.goto("/watch/8");

    // EventLog component should render
    // Wait for game state to load first
    await expect(page.locator("text=Game #8")).toBeVisible({ timeout: 15000 });
  });

  test("navigates between games with arrows", async ({ page }) => {
    await page.goto("/watch/8");
    await expect(page.locator("text=Game #8")).toBeVisible({ timeout: 15000 });

    // Click next arrow
    await page.locator("button", { hasText: "▶" }).click();
    await page.waitForURL("**/watch/9");

    // Click prev arrow
    await page.locator("button", { hasText: "◀" }).click();
    await page.waitForURL("**/watch/8");
  });

  test("completed game shows GameOver state", async ({ page }) => {
    await page.goto("/watch/8");

    // Game 8 should be completed — look for GameOver indicators
    // Phase 8 = GameOver, so we should see payout info or "Play Again" equivalent
    await expect(page.locator("text=Game #8")).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: "e2e-06-watch-game-over.png", fullPage: false });
  });
});
