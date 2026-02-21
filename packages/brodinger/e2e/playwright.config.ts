import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "cd /Users/tippi/Developer/ethdenver26/deal && npx hardhat node",
      port: 8545,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "cd /Users/tippi/Developer/ethdenver26/deal/frontend && npm run dev",
      port: 3000,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
