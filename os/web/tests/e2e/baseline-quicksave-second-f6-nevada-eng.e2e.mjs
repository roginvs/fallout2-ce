// Section 5 step 6 for FalloutNevadaEng on live:
// first F6 opens the slot dialog; second F6 must take the quick path (no dialog).
import { expect, test } from "../helpers/fixtures.mjs";
import {
    comparePngs,
    INTERFACE_BAR,
    launchGame,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";
const SAVE_NAME = "e2e qs2";

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} folder
 */
async function launchGameRetry(page, folder) {
    page.setDefaultNavigationTimeout(90_000);
    let last;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            await launchGame(page, folder);
            return;
        } catch (e) {
            last = e;
            const msg = String(
                e && /** @type {any} */ (e).message
                    ? /** @type {any} */ (e).message
                    : e,
            );
            if (!/ERR_TIMED_OUT|Timeout|net::ERR_/i.test(msg) || attempt === 5) {
                throw e;
            }
            await page.waitForTimeout(3000 * attempt);
        }
    }
    throw last;
}

test("second F6 quicksave skips slot dialog (Nevada Eng)", async ({
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

    // First F6: slot dialog (assigns quick slot).
    await pressKey(page, "F6");
    await waitForCanvasChange(page, inGame, { minChanged: 0.1 });
    const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
    await snap(testInfo, "02-first-f6-dialog", saveDialog);

    await pressKey(page, "Enter");
    await page.waitForTimeout(500);
    await page.keyboard.type(SAVE_NAME, { delay: 50 });
    await pressKey(page, "Enter");
    const afterFirst = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.01,
        timeout: 480_000,
    });
    await snap(testInfo, "03-after-first-save", afterFirst);

    // Second F6: must stay on the map (no dialog overlay).
    await pressKey(page, "F6");
    await page.waitForTimeout(2500);
    const afterSecond = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.02,
        timeout: 180_000,
    });
    await snap(testInfo, "04-after-second-f6", afterSecond);

    const vsMap = await comparePngs(page, afterFirst, afterSecond);
    const vsDialog = await comparePngs(page, saveDialog, afterSecond);
    // Still looks like the map, not like the save dialog.
    expect(vsMap.changedRatio).toBeLessThan(0.25);
    expect(vsDialog.changedRatio).toBeGreaterThan(0.2);

    await page.reload();
    const slotName = page
        .locator(`#game_slots_${FOLDER} .game_slot_name`)
        .first();
    await expect(slotName).toHaveText(SAVE_NAME, { timeout: 30_000 });
});
