// Fork svga.cc: the web build creates the SDL window without
// SDL_WINDOW_ALLOW_HIGHDPI; the shell (mainmenu.mjs) sizes the game in device
// pixels (CSS size x devicePixelRatio) and scales the canvas with CSS. At
// DPR 2 the canvas backing store must equal the game screen, not twice it,
// and mouse clicks must land on the right spot.
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

test.use({ deviceScaleFactor: 2, viewport: { width: 1024, height: 768 } });

test("fork: DPR 2 hi-res canvas is game screen size in device pixels", async ({
    page,
}, testInfo) => {
    test.setTimeout(15 * 60_000);
    await page.goto(`/#/${FOLDER}`);
    const hires = page.locator(`#enable_hires_${FOLDER}`);
    await hires.waitFor({ state: "visible", timeout: 60_000 });
    await hires.setChecked(true);
    await page.locator(`#start_${FOLDER}`).click();
    await page.locator("#canvas").waitFor({ state: "visible" });
    const menu = await waitForMainMenu(page);
    await snap(testInfo, "01-main-menu", menu);

    const s = await page.evaluate(() => {
        const c = /** @type {HTMLCanvasElement} */ (
            document.getElementById("canvas")
        );
        const tags = { .../** @type {any} */ (window).debugTags };
        return {
            dpr: devicePixelRatio,
            backing: [c.width, c.height],
            css: [c.clientWidth, c.clientHeight],
            tags,
        };
    });
    await testInfo.attach("state.json", {
        body: JSON.stringify(s, null, 2),
        contentType: "application/json",
    });
    expect(s.dpr).toBe(2);
    expect(s.tags.isUsingHiRes).toBe("true");
    const [cw, ch] = s.tags.canvasPixelSize.split("x").map(Number);
    const [gw, gh] = s.tags.gameScreenSize.split("x").map(Number);
    expect([gw, gh]).toEqual([Math.round(cw * 2), Math.round(ch * 2)]);
    // The window is (game / scale) * scale, a few pixels smaller (seen: game
    // 2008x1496, scale 3 -> canvas 2007x1494); HiDPI doubling would give
    // about twice the game screen.
    expect(Math.abs(s.backing[0] - gw), "no HiDPI doubling").toBeLessThan(8);
    expect(Math.abs(s.backing[1] - gh), "no HiDPI doubling").toBeLessThan(8);
    expect(Math.abs(s.css[0] - cw)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.css[1] - ch)).toBeLessThanOrEqual(1);
});

// DPR 1 is the control for the same mouse path.
for (const dpr of [1, 2]) {
    test.describe(`DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        test(`fork: DPR ${dpr} without hi-res, mouse click on New game hits`, async ({
            page,
        }, testInfo) => {
            test.setTimeout(15 * 60_000);
            await launchGame(page, FOLDER);
            const menu = await waitForMainMenu(page);
            await snap(testInfo, "01-main-menu", menu);
            const backing = await page
                .locator("#canvas")
                .evaluate((c) => [
                    /** @type {HTMLCanvasElement} */ (c).width,
                    /** @type {HTMLCanvasElement} */ (c).height,
                ]);
            expect(backing).toEqual([640, 480]);

            // 'New game' button center ≈ (43, 73) in 640x480 game pixels.
            const box = await page.locator("#canvas").boundingBox();
            if (!box) throw new Error("#canvas has no bounding box");
            const x = box.x + (box.width * 43) / 640;
            const y = box.y + (box.height * 73) / 480;
            // Start locks the pointer; locked, CDP mouse moves carry no
            // movementX/Y. Leave the lock (as a user pressing Esc) so the
            // game follows absolute positions, as in the touch smoke test.
            await page.evaluate(() => {
                if (document.pointerLockElement) document.exitPointerLock();
            });
            await page.waitForTimeout(300);
            await page.mouse.move(x - 40, y - 40);
            await page.mouse.move(x, y, { steps: 10 });
            await page.waitForTimeout(1_500);
            await snap(testInfo, "02-cursor-on-button", await canvasPng(page));
            await page.mouse.down();
            await page.waitForTimeout(100);
            await page.mouse.up();
            await waitForCanvasChange(page, menu, { timeout: 30_000 });
            const next = await waitForStableFrame(page, { timeout: 60_000 });
            await snap(testInfo, "03-after-click", next);
            expect(
                (await comparePngs(page, menu, next)).changedRatio,
            ).toBeGreaterThan(0.2);
        });
    });
}
