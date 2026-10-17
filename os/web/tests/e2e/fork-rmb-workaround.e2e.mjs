// Fork P1: right mouse button release workaround
// (hotkeys_and_workarounds.mjs addRightMouseButtonWorkaround). When the RMB
// "mouseup" is lost (context menu, Escape from pointer lock), SDL keeps the
// right button pressed: the game sees it held (REPEAT), so the next right
// click does not cycle the cursor mode (SDL drops the duplicate press).
// The shell sends a synthetic RMB mouseup on the next other-button mouseup.
// Check: RMB down without up (hex -> arrow), a middle mouseup with buttons=0,
// then a real right click must cycle the cursor back to the hex.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    launchGameRetry,
    newGameToMap,
    snap,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";
// A floor tile right of the player on the Nevada Eng start map: over
// empty (black) space the hex cursor is hidden and RMB does not cycle.
const U = 0.62;
const V = 0.42;
const AROUND = { x: U - 0.06, y: V - 0.08, w: 0.14, h: 0.18 };

test("fork P1: lost RMB mouseup is released by the next mouseup", async ({
    page,
}, testInfo) => {
    test.setTimeout(20 * 60_000);
    await launchGameRetry(page, FOLDER);
    await newGameToMap(page, testInfo, "01-");

    const canvas = page.locator("#canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("#canvas has no bounding box");
    const x = box.x + box.width * U;
    const y = box.y + box.height * V;
    await page.mouse.move(x - 40, y - 40);
    await page.mouse.move(x, y, { steps: 10 });
    await page.waitForTimeout(1_500);

    // Record synthetic (shell-made) RMB mouseups reaching the canvas.
    await page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__fakeRmbUps = 0;
        document.getElementById("canvas")?.addEventListener(
            "mouseup",
            (e) => {
                if (e.button === 2 && !e.isTrusted) w.__fakeRmbUps++;
            },
            true,
        );
    });
    /** @param {string} type @param {number} button @param {number} buttons */
    const dispatch = (type, button, buttons) =>
        page.evaluate(([type, button, buttons, x, y]) => {
            document.getElementById("canvas")?.dispatchEvent(
                new MouseEvent(type, {
                    button,
                    buttons,
                    clientX: x,
                    clientY: y,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }, /** @type {[string, number, number, number, number]} */ ([type, button, buttons, x, y]));

    await snap(testInfo, "02-mouse-on-floor", await canvasPng(page));
    const hex = await canvasPng(page, AROUND);
    await snap(testInfo, "02-hex-cursor-region", hex);

    // RMB pressed, its mouseup never arrives: game cycles to the arrow.
    await dispatch("mousedown", 2, 2);
    await page.waitForTimeout(1_500);
    const arrow = await canvasPng(page, AROUND);
    await snap(testInfo, "03-arrow-rmb-stuck", arrow);
    const hexVsArrow = (await comparePngs(page, hex, arrow)).changedRatio;
    expect(hexVsArrow, "RMB down should cycle hex -> arrow").toBeGreaterThan(
        0.01,
    );

    // Another button is released with no buttons held: shell releases RMB.
    await dispatch("mouseup", 1, 0);
    await page.waitForTimeout(1_000);
    expect(
        await page.evaluate(() => /** @type {any} */ (window).__fakeRmbUps),
    ).toBe(1);

    // A real right click now cycles the mode again (arrow -> hex).
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(500);
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(1_500);
    const after = await canvasPng(page, AROUND);
    await snap(testInfo, "04-after-right-click", after);
    const afterVsHex = (await comparePngs(page, hex, after)).changedRatio;
    const afterVsArrow = (await comparePngs(page, arrow, after)).changedRatio;
    await testInfo.attach("ratios.json", {
        body: JSON.stringify({ hexVsArrow, afterVsHex, afterVsArrow }),
        contentType: "application/json",
    });
    expect(
        afterVsHex,
        "right click after release should bring the hex cursor back",
    ).toBeLessThan(afterVsArrow);
});
