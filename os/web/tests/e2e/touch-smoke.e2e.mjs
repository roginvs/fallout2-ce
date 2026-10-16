// Optional touch smoke: tap "New game" on the main menu (touch is wired for
// the web/__EMSCRIPTEN__ build). Against live, pointer lock can leave the
// mouse in relative mode so a zero-length tap clicks the old cursor spot —
// hold the finger briefly (CDP touchStart/touchEnd) so the game moves the
// cursor to the touch first.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    launchGame,
    snap,
    waitForCanvasChange,
    waitForMainMenu,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

test.use({
    hasTouch: true,
    viewport: { width: 1024, height: 768 },
});

/**
 * Touch down/up in 640x480 game coordinates, with a short hold. With `dx`
 * the finger moves that many game pixels right while held and lifts there.
 * @param {import("@playwright/test").Page} page
 * @param {number} gx
 * @param {number} gy
 * @param {number} [dx]
 */
async function holdTapGame(page, gx, gy, dx = 0) {
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
        if (dx) {
            // A few small steps, each held for several game frames, so the
            // engine sees the finger still down and already moved.
            for (let step = 1; step <= 4; step++) {
                await client.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [
                        { x: x + (box.width * dx * step) / 4 / 640, y },
                    ],
                });
                await page.waitForTimeout(80);
            }
            await page.waitForTimeout(150);
        }
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

// Fork touch.cc: PAN_MINIMUM_MOVEMENT is 15 (upstream 4), so a finger that
// jitters a few pixels is still a tap (click); a longer drag is a pan that
// only moves the cursor.
test("fork: 8 px jitter is still a tap, 30 px drag is a pan", async ({
    page,
}, testInfo) => {
    await launchGame(page, FOLDER);
    const mainMenu = await waitForMainMenu(page);
    await snap(testInfo, "01-main-menu", mainMenu);

    // Drag that ends on the 'New game' button: pan, no click.
    await holdTapGame(page, 43 - 30, 73, 30);
    await page.waitForTimeout(5_000);
    const afterDrag = await canvasPng(page);
    await snap(testInfo, "02-after-drag", afterDrag);
    const drag = await comparePngs(page, mainMenu, afterDrag);
    expect(
        drag.changedRatio,
        "30 px drag must not press New game",
    ).toBeLessThan(0.2);

    // Jittered tap on the same button: click.
    await holdTapGame(page, 43 - 4, 73, 8);
    await waitForCanvasChange(page, mainMenu, { timeout: 30_000 });
    const next = await waitForStableFrame(page, { timeout: 60_000 });
    await snap(testInfo, "03-after-jitter-tap", next);
    const tap = await comparePngs(page, mainMenu, next);
    expect(tap.changedRatio).toBeGreaterThanOrEqual(0.2);
});
