// Section 5/8: after a quicksave slot is set, F7 quickloads without a dialog.
// Inventory is opened then closed first: F7 is not handled inside the inventory UI.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    comparePngs,
    INTERFACE_BAR,
    launchGameRetry,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";
const SAVE_NAME = "e2e ql7";

test("F7 quickload restores map without dialog (Nevada Eng)", async ({
    page,
}, testInfo) => {
    test.setTimeout(20 * 60_000);
    await launchGameRetry(page, FOLDER);
    const mainMenu = await waitForStableFrame(page);

    await pressKey(page, "n");
    await waitForCanvasChange(page, mainMenu);
    const charSelect = await waitForStableFrame(page);

    await pressKey(page, "t");
    await waitForCanvasChange(page, charSelect);
    const inGame = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.01,
        timeout: 480_000,
    });
    await snap(testInfo, "01-in-game", inGame);

    await pressKey(page, "F6");
    await waitForCanvasChange(page, inGame, { minChanged: 0.1 });
    const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);
    await page.keyboard.type(SAVE_NAME, { delay: 50 });
    await pressKey(page, "Enter");
    const afterSave = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.01,
        timeout: 480_000,
    });
    await snap(testInfo, "02-after-save", afterSave);

    // Meaningful action, then return to the map (F7 is ignored inside inventory).
    await pressKey(page, "i");
    await waitForCanvasChange(page, afterSave, { minChanged: 0.15 });
    const inventory = await waitForStableFrame(page, { maxChanged: 0.02 });
    await snap(testInfo, "03-inventory", inventory);
    await pressKey(page, "Escape");
    await waitForCanvasChange(page, inventory, { minChanged: 0.15 });
    const onMap = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.02,
        timeout: 180_000,
    });
    await snap(testInfo, "04-back-on-map", onMap);

    await pressKey(page, "F7");
    await page.waitForTimeout(2500);
    const afterF7 = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.02,
        timeout: 180_000,
    });
    await snap(testInfo, "05-after-f7", afterF7);

    const vsMap = await comparePngs(page, onMap, afterF7);
    const vsDialog = await comparePngs(page, saveDialog, afterF7);
    // Still on the map, not a load dialog.
    expect(vsMap.changedRatio).toBeLessThan(0.25);
    expect(vsDialog.changedRatio).toBeGreaterThan(0.2);
});
