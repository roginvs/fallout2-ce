// Fork P2: service worker version and autoreload guard
// (index.sw.js versionrequest, service_worker_manager.mjs preventAutoreload).
// The shell asks the active worker for VERSION (debug tag "version"), which
// CMake fills from @BUILD_DATE_TIME@. A new worker taking control reloads a
// controlled page, but not while a game is started (preventAutoreload).
// A new worker is made by registering the same script under another URL.
// Shell only: the game is started but not waited for.
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

test("fork P2: service worker reports build VERSION; no autoreload in game", async ({
    page,
}) => {
    test.setTimeout(5 * 60_000);
    const sw = await (await page.request.get("/index.sw.js")).text();
    const built = sw.match(/const VERSION = "([^"]*)"/)?.[1];
    expect(built, "VERSION replaced by CMake").toMatch(
        /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/,
    );

    // First visit installs the worker; it claims the page and reports VERSION.
    await page.goto(`/#/${FOLDER}`);
    await expect.poll(() => versionTag(page), { timeout: 60_000 }).toBe(built);

    // Controlled page: a new worker taking control reloads the page.
    await page.reload();
    await expect.poll(() => versionTag(page), { timeout: 60_000 }).toBe(built);
    await takeOver(page, "index.sw.js?e2e=1");
    await expect
        .poll(() => marker(page), {
            timeout: 60_000,
            message: "page should reload when a new worker takes control",
        })
        .toBe(null);
    // After reload the shell registers plain index.sw.js again (one more
    // takeover and reload); wait until the page settles with the start button.
    await expect
        .poll(
            async () => {
                const v = await versionTag(page);
                await page.waitForTimeout(5_000);
                return v === built && (await versionTag(page)) === built;
            },
            { timeout: 90_000 },
        )
        .toBe(true);
    const start = page.locator(`#start_${FOLDER}`);
    await start.waitFor({ state: "visible", timeout: 60_000 });

    // Game started: preventAutoreload keeps the page on a takeover.
    await start.click();
    await page.locator("#canvas").waitFor({ state: "visible" });
    await takeOver(page, "index.sw.js?e2e=2");
    await expect
        .poll(
            () =>
                page.evaluate(
                    () => /** @type {any} */ (window).__controllerChanges,
                ),
            { timeout: 60_000 },
        )
        .toBeGreaterThan(0);
    await page.waitForTimeout(5_000);
    expect(await marker(page), "no reload while the game runs").toBe(
        "same page",
    );
    await expect(page.locator("#canvas")).toBeVisible();
});
