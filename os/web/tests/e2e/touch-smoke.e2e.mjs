// Optional touch smoke: tap "New game" on the main menu (touch is wired for
// the web/__EMSCRIPTEN__ build). Against live, pointer lock can leave the
// mouse in relative mode so a zero-length tap clicks the old cursor spot —
// hold the finger briefly (CDP touchStart/touchEnd) so the game moves the
// cursor to the touch first.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    comparePngs,
    launchGame,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

test.use({
    hasTouch: true,
    viewport: { width: 1024, height: 768 },
});

/**
 * Touch down/up in 640x480 game coordinates, with a short hold.
 * @param {import("@playwright/test").Page} page
 * @param {number} gx
 * @param {number} gy
 */
async function holdTapGame(page, gx, gy) {
    await page.evaluate(() => {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    });
    await page.waitForTimeout(100);

    const box = await page.locator("#canvas").boundingBox();
    if (!box) throw new Error("#canvas has no bounding box");
    const x = box.x + (box.width * gx) / 640;
    const y = box.y + (box.height * gy) / 480;

    const client = await page.context().newCDPSession(page);
    try {
        await client.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y }],
        });
        await page.waitForTimeout(150);
        await client.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
    } finally {
        await client.detach();
    }
}

test("tap on 'New game' opens character selection", async ({
    page,
}, testInfo) => {
    await launchGame(page, FOLDER);

    const mainMenu = await waitForStableFrame(page);
    await snap(testInfo, "01-main-menu", mainMenu);

    // Button center ≈ (43, 73); label fallback at x=126.
    await holdTapGame(page, 43, 19 + 41 + 13);

    try {
        await waitForCanvasChange(page, mainMenu, { timeout: 15_000 });
    } catch {
        await holdTapGame(page, 126, 19 + 41 + 13);
        await waitForCanvasChange(page, mainMenu, { timeout: 45_000 });
    }

    const next = await waitForStableFrame(page, { timeout: 60_000 });
    await snap(testInfo, "02-after-tap", next);

    const { changedRatio } = await comparePngs(page, mainMenu, next);
    expect(changedRatio).toBeGreaterThanOrEqual(0.2);
});
