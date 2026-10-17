import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: ".",
    testMatch: "*.spec.mjs",
    fullyParallel: false,
    retries: 0,
    use: { baseURL: "http://127.0.0.1:8765" },
    webServer: {
        command: "python3 -m http.server 8765 --bind 127.0.0.1",
        cwd: "..",
        port: 8765,
        reuseExistingServer: false,
    },
});
