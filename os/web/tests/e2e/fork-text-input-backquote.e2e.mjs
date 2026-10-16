// Fork P1: JS text input bridge (input.cc beginTextInput/endTextInput ->
// onscreen_keyboard.mjs startTextInput/stopTextInput) and Backquote as Escape
// (hotkeys_and_workarounds.mjs addBackquoteAsEscape). Touch context, so the
// on-screen keyboard is expected while the save description is typed.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    INTERFACE_BAR,
    launchGameRetry,
    newGameToMap,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

test.use({ hasTouch: true });

test("fork P1: save description shows on-screen keyboard; ` closes inventory", async ({
    page,
}, testInfo) => {
    test.setTimeout(20 * 60_000);
    /** @type {string[]} */
    const bridgeWarnings = [];
    page.on("console", (m) => {
        if (/No function (start|stop)TextInput/.test(m.text())) {
            bridgeWarnings.push(m.text());
        }
    });
    await launchGameRetry(page, FOLDER);
    const { inGame } = await newGameToMap(page, testInfo, "01-");
    const keyboard = page.locator(".keyboard");
    await expect(keyboard).toHaveCount(0);

    // F4 -> slot -> Enter opens the description prompt (beginTextInput).
    await pressKey(page, "F4");
    await waitForCanvasChange(page, inGame, {
        minChanged: 0.1,
        timeout: 120_000,
    });
    await waitForStableFrame(page, { maxChanged: 0.01 });
    await pressKey(page, "Enter");
    await expect(
        keyboard,
        "on-screen keyboard for the description",
    ).toBeVisible({
        timeout: 15_000,
    });
    await snap(testInfo, "02-keyboard", await page.screenshot());
    await page.keyboard.type("kbd-bridge", { delay: 50 });
    await page.keyboard.press("Enter");
    await expect(keyboard, "keyboard removed after Enter").toHaveCount(0, {
        timeout: 60_000,
    });
    const deadline = Date.now() + 180_000;
    let onMap = await canvasPng(page);
    while (Date.now() < deadline) {
        if ((await comparePngs(page, inGame, onMap)).changedRatio < 0.4) break;
        await page.waitForTimeout(1000);
        onMap = await canvasPng(page);
    }
    onMap = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.01,
        timeout: 180_000,
    });
    await snap(testInfo, "03-after-save", onMap);
    expect(bridgeWarnings).toEqual([]);

    // Backquote behaves like Escape: closes the inventory.
    await pressKey(page, "i");
    await waitForCanvasChange(page, onMap, {
        minChanged: 0.15,
        timeout: 120_000,
    });
    const inventory = await waitForStableFrame(page, { maxChanged: 0.02 });
    await snap(testInfo, "04-inventory", inventory);
    await pressKey(page, "Backquote");
    await waitForCanvasChange(page, inventory, {
        minChanged: 0.15,
        timeout: 60_000,
    });
    const back = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.02,
        timeout: 120_000,
    });
    await snap(testInfo, "05-after-backquote", back);
    expect((await comparePngs(page, onMap, back)).changedRatio).toBeLessThan(
        0.25,
    );
});
