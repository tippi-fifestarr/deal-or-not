import { test, expect } from "@playwright/test";

test.describe("Unified Connect Modal", () => {
  test("CONNECT button visible in nav", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
  });

  test("CONNECT opens unified modal with EVM and APTOS sections", async ({ page }) => {
    await page.goto("/");

    // Click CONNECT
    const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
    await connectBtn.click();

    // Modal should show "CHOOSE YOUR CHAIN"
    await expect(page.locator("text=CHOOSE YOUR CHAIN")).toBeVisible({ timeout: 5000 });

    // Should have EVM section (frequency label)
    await expect(page.locator("text=FREQ: 84532")).toBeVisible();

    // Should have APTOS section (frequency label)
    await expect(page.locator("text=FREQ: APT-2")).toBeVisible();
  });

  test("modal shows frequency labels for chains", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
    await connectBtn.click();

    await expect(page.locator("text=FREQ: 84532")).toBeVisible();
    await expect(page.locator("text=FREQ: APT-2")).toBeVisible();
  });

  test("modal has rotating ad (commercial break)", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
    await connectBtn.click();

    // RotatingAd shows "Sponsored by absolutely no one"
    await expect(page.locator("text=Sponsored by absolutely no one")).toBeVisible();
  });

  test("modal has snarky disclaimer", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
    await connectBtn.click();

    await expect(page.locator("text=This wallet selection is not financial advice")).toBeVisible();
  });

  test("modal closes on backdrop click", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
    await connectBtn.click();

    await expect(page.locator("text=CHOOSE YOUR CHAIN")).toBeVisible();

    // Click backdrop (top-left corner, outside modal)
    await page.mouse.click(10, 10);

    // Modal should close
    await expect(page.locator("text=CHOOSE YOUR CHAIN")).not.toBeVisible({ timeout: 3000 });
  });

  test("modal shows Aptos wallet options", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
    await expect(connectBtn).toBeVisible({ timeout: 10000 });
    await connectBtn.click();

    // Aptos wallet adapter auto-registers social login wallets (Google, Apple)
    // or shows "No Aptos wallets detected" + "Get Petra Wallet" link
    const google = page.locator("text=Continue with Google");
    const noWallets = page.locator("text=No Aptos wallets detected");
    const either = google.or(noWallets);
    await expect(either.first()).toBeVisible({ timeout: 5000 });
  });

  test("play page still shows connect wallet when no wallet connected", async ({ page }) => {
    await page.goto("/play");

    await expect(page.locator("text=Connect your wallet")).toBeVisible();
  });

  test("nav renders without errors on all pages", async ({ page }) => {
    const pages = ["/", "/play", "/agents", "/watch", "/markets"];
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator("nav")).toBeVisible();
      const connectBtn = page.locator("nav button", { hasText: "CONNECT" });
      await expect(connectBtn).toBeVisible({ timeout: 10000 });
    }
  });
});
