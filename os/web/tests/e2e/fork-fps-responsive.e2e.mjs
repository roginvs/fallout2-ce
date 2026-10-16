// Fork P2: FPS limiter sleeps 4 ms less under EMSCRIPTEN (fps_limiter.cc),
// SDL_Delay yields to the browser via Asyncify. Check that the tab stays
// responsive for 10 s at the main menu and on the map: a 50 ms timer is
// never starved for long, requestAnimationFrame keeps running and a Node ->
// page evaluate round trip stays short.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    launchGameRetry,
    newGameToMap,
    snap,
    waitForMainMenu,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

/** @param {import("@playwright/test").Page} page */
async function measure(page) {
    const inPage = page.evaluate(async () => {
        let frames = 0;
        let running = true;
        const tick = () => {
            frames++;
            if (running) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        let last = performance.now();
        let maxGap = 0;
        const timer = setInterval(() => {
            const now = performance.now();
            maxGap = Math.max(maxGap, now - last);
            last = now;
        }, 50);
        await new Promise((r) => setTimeout(r, 10_000));
        running = false;
        clearInterval(timer);
        return { rafPerSecond: frames / 10, maxTimerGapMs: Math.round(maxGap) };
    });
    let maxRoundTripMs = 0;
    const end = Date.now() + 9_000;
    while (Date.now() < end) {
        const t = Date.now();
        await page.evaluate(() => 1);
        maxRoundTripMs = Math.max(maxRoundTripMs, Date.now() - t);
        await page.waitForTimeout(200);
    }
    return { ...(await inPage), maxRoundTripMs };
}

test("fork P2: tab stays responsive at the main menu and on the map", async ({
    page,
}, testInfo) => {
    test.setTimeout(20 * 60_000);
    await launchGameRetry(page, FOLDER);
    const menu = await waitForMainMenu(page, { timeout: 480_000 });
    await snap(testInfo, "01-main-menu", menu);
    const atMenu = await measure(page);

    await newGameToMap(page, testInfo, "02-");
    const onMap = await measure(page);
    await testInfo.attach("responsiveness.json", {
        body: JSON.stringify({ atMenu, onMap }, null, 2),
        contentType: "application/json",
    });
    for (const [where, m] of Object.entries({ atMenu, onMap })) {
        expect(m.rafPerSecond, `${where}: rAF rate`).toBeGreaterThan(20);
        expect(m.maxTimerGapMs, `${where}: 50 ms timer gap`).toBeLessThan(500);
        expect(m.maxRoundTripMs, `${where}: evaluate round trip`).toBeLessThan(
            200,
        );
    }
});
