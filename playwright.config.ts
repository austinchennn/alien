import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4328",
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {}),
  },
  webServer: {
    command: "node dist/server/main.js",
    url: "http://127.0.0.1:4328/health",
    reuseExistingServer: false,
    env: {
      ALIEN_PORT: "4328",
      ALIEN_DATA: process.env.ALIEN_UI_DATA ?? ".ui-test-data",
    },
  },
});
