// Premade character -> F6 quicksave -> reload shell -> download slot -> load it back.
import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import {
    comparePngs,
    downloadSlot,
    launchGame,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";
const SAVE_NAME = "e2e quicksave";

test("quicksave survives reload, downloads and loads", async ({
    page,
}, testInfo) => {
    await launchGame(page, FOLDER);
    const mainMenu = await waitForStableFrame(page);

    await pressKey(page, "n");
    await waitForCanvasChange(page, mainMenu);
    const charSelect = await waitForStableFrame(page);
    await snap(testInfo, "01-char-select", charSelect);

    await pressKey(page, "t");
    await waitForCanvasChange(page, charSelect);
    const inGame = await waitForStableFrame(page, { maxChanged: 0.05 });
    await snap(testInfo, "02-in-game", inGame);

    await pressKey(page, "F6");
    await waitForCanvasChange(page, inGame, { minChanged: 0.1 });
    const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
    await snap(testInfo, "03-save-dialog", saveDialog);

    await pressKey(page, "Enter");
    await page.waitForTimeout(500);
    await page.keyboard.type(SAVE_NAME, { delay: 50 });
    const description = await waitForStableFrame(page, { maxChanged: 0.01 });
    await snap(testInfo, "04-save-description", description);
    await pressKey(page, "Enter");
    const afterSave = await waitForStableFrame(page, { maxChanged: 0.05 });
    await snap(testInfo, "05-after-save", afterSave);

    await page.reload();
    const slotName = page
        .locator(`#game_slots_${FOLDER} .game_slot_name`)
        .first();
    await expect(slotName).toHaveText(SAVE_NAME, { timeout: 30_000 });

    const archive = await downloadSlot(page, FOLDER, 1, testInfo);
    const stat = await fs.stat(archive);
    expect(stat.size).toBeGreaterThan(1024);

    await launchGame(page, FOLDER);
    const menuAgain = await waitForStableFrame(page);
    await pressKey(page, "l");
    await waitForCanvasChange(page, menuAgain, { minChanged: 0.1 });
    const loadDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
    await snap(testInfo, "06-load-dialog", loadDialog);

    await pressKey(page, "Enter");
    await waitForCanvasChange(page, loadDialog, { minChanged: 0.1 });
    const loaded = await waitForStableFrame(page, { maxChanged: 0.05 });
    await snap(testInfo, "07-loaded", loaded);

    const { changedRatio } = await comparePngs(page, inGame, loaded);
    expect(changedRatio).toBeLessThan(0.3);
});
