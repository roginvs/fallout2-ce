import { defineConfig } from "@playwright/test";

// End-to-end tests against a deployed shell. No local web server is started.
// E2E_BASE_URL=http://127.0.0.1:8765/ can point them at a local build instead.
export default defineConfig({
    testDir: "./e2e",
    testMatch: "*.e2e.mjs",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 20 * 60_000,
    outputDir: "./test-results/e2e",
    use: {
        baseURL: process.env.E2E_BASE_URL || "https://fallout-nevada.ru/",
        viewport: { width: 1024, height: 768 },
        acceptDownloads: true,
        trace: "retain-on-failure",
    },
});
