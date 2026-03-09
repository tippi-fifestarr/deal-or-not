import { test, expect } from "@playwright/test";

test.describe("Agents Page", () => {
  test("loads agents list page", async ({ page }) => {
    await page.goto("/agents");

    // Should have agent-related content
    await expect(page.locator("h1, h2").first()).toBeVisible();

    await page.screenshot({ path: "e2e-02-agents.png", fullPage: false });
  });

  test("agent registration page loads", async ({ page }) => {
    await page.goto("/agents/register");

    // Should show registration form or connect wallet prompt
    await expect(page.locator("body")).not.toBeEmpty();

    await page.screenshot({ path: "e2e-03-agent-register.png", fullPage: false });
  });
});
