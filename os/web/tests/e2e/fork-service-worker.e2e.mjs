// Worker updates wait until existing game tabs close. The active build and
// its cache must remain in use throughout a running game.
import { expect, test } from "../helpers/fixtures.mjs";

const FOLDER = "FalloutNevadaEng";

/** @param {import("@playwright/test").Page} page */
const versionTag = (page) =>
    page
        .evaluate(() => /** @type {any} */ (window).debugTags?.version ?? null)
        .catch(() => null);

/** @param {import("@playwright/test").Page} page */
const marker = (page) =>
    page
        .evaluate(() => /** @type {any} */ (window).__swMarker ?? null)
        .catch(() => "navigating");

/** @param {import("@playwright/test").Page} page @param {string} url */
const takeOver = (page, url) =>
    page.evaluate((url) => {
        const w = /** @type {any} */ (window);
        w.__swMarker = "same page";
        w.__controllerChanges = 0;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            w.__controllerChanges++;
        });
        navigator.serviceWorker.register(url);
    }, url);

test("fork P2: service worker reports build VERSION; updates wait for game tabs", async ({
    page,
}) => {
    test.setTimeout(5 * 60_000);
    const sw = await (await page.request.get("/index.sw.js")).text();
    const built = sw.match(/const VERSION = "([^"]*)"/)?.[1];
    expect(built, "VERSION replaced by CMake").toMatch(/^[a-f0-9]{64}$/);

    // First visit installs the worker; it claims the page and reports VERSION.
    await page.goto(`/#/${FOLDER}`);
    await expect.poll(() => versionTag(page), { timeout: 60_000 }).toBe(built);

    // Start a controlled session before installing an update.
    await page.reload();
    await expect.poll(() => versionTag(page), { timeout: 60_000 }).toBe(built);
    const start = page.locator(`#start_${FOLDER}`);
    await start.waitFor({ state: "visible", timeout: 60_000 });

    // A different script URL forces an install even when the build is the same.
    // It must wait instead of taking over or deleting the running build's cache.
    await takeOver(page, "index.sw.js?e2e=waiting");
    await expect
        .poll(() =>
            page.evaluate(async () => {
                const registration =
                    await navigator.serviceWorker.getRegistration();
                return registration?.waiting?.state;
            }),
        )
        .toBe("installed");
    expect(await marker(page), "no reload while the game runs").toBe(
        "same page",
    );
    expect(await page.evaluate(() => window.__controllerChanges)).toBe(0);
    await expect(page.locator("#canvas")).toBeVisible();
});
