// Fork: offline-first shell start. The engine service worker (index.sw.js)
// serves the shell from Cache Storage. When the server is down and never
// answers (hangs, not a fast refusal), the game menu must still appear
// quickly, also with a launch query like "?window=1". custom.js and the
// third-party scripts it adds are not cached and hang too.
// Needs a non-localhost origin (127.0.0.1), where the SW is on.
import { expect, test } from "../helpers/fixtures.mjs";

// Without this, context.route() does not see requests made by the service
// worker, so a cache miss there would reach the real server and the test
// would pass without the fix. Must be set before the browser starts.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

const FOLDER = "FalloutNevadaEng";

test("fork: shell menu appears offline when the server hangs", async ({
    page,
    context,
}) => {
    // index.html, not "/": the candidate proxy serves "/" from upstream.
    await page.goto(`/index.html#/${FOLDER}`);
    expect(new URL(page.url()).hostname).not.toBe("localhost");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, {
        timeout: 60_000,
    });

    // Every request that reaches the network never gets an answer.
    await context.route("**/*", () => {});
    for (const url of [
        `/index.html#/${FOLDER}`,
        `/index.html?window=1#/${FOLDER}`,
    ]) {
        await page.goto(url, { waitUntil: "commit", timeout: 10_000 });
        await page
            .locator(`#start_${FOLDER}`)
            .waitFor({ state: "visible", timeout: 10_000 });
    }
});
