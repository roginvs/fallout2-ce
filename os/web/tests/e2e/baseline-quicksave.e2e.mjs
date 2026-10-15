// Section 5: first F6 opens slot dialog; second F6 takes quick path (no dialog).
// Add rows to GAMES for more titles (Nevada Eng covered by dedicated file).
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    INTERFACE_BAR,
    launchGameRetry,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForGameplay,
    waitForMainMenu,
    waitForStableFrame,
} from "../helpers/game.mjs";

/** @type {{ folder: string, label: string, saveName: string }[]} */
const GAMES = [
    {
        folder: "Fallout_Sonora_1_15_dlc_eng",
        label: "Sonora 1.15 Eng",
        saveName: "audit-so115e-qs",
    },
    {
        folder: "Fallout_Sonora_1_14_dlc_eng",
        label: "Sonora 1.14 Eng",
        saveName: "audit-so114e-qs",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc",
        label: "Sonora 1.15 ru",
        saveName: "audit-so115r-qs",
    },
    {
        folder: "Fallout_Sonora_1_13_dlc",
        label: "Sonora 1.13 ru",
        saveName: "audit-so113r-qs",
    },
];

for (const { folder, label, saveName } of GAMES) {
    test(`baseline second F6 quicksave skips dialog (${label})`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(20 * 60_000);
        await launchGameRetry(page, folder);
        const mainMenu = await waitForMainMenu(page, { timeout: 480_000 });
        await snap(testInfo, "01-main-menu", mainMenu);

        await pressKey(page, "n");
        await waitForCanvasChange(page, mainMenu, {
            minChanged: 0.15,
            timeout: 120_000,
        });
        const charSelect = await waitForStableFrame(page);
        await snap(testInfo, "02-char-select", charSelect);

        await pressKey(page, "t");
        await waitForCanvasChange(page, charSelect, {
            minChanged: 0.1,
            timeout: 120_000,
        });
        const inGame = await waitForGameplay(page, { timeout: 480_000 });
        await snap(testInfo, "03-in-game", inGame);

        await pressKey(page, "F6");
        await waitForCanvasChange(page, inGame, {
            minChanged: 0.1,
            timeout: 120_000,
        });
        const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
        await snap(testInfo, "04-first-f6-dialog", saveDialog);

        await pressKey(page, "Enter");
        await page.waitForTimeout(800);
        const afterEnter = await canvasPng(page);
        const { changedRatio: vsMap } = await comparePngs(
            page,
            inGame,
            afterEnter,
        );
        if (vsMap > 0.2) {
            await page.keyboard.type(saveName, { delay: 50 });
            await page.waitForTimeout(300);
            await page.keyboard.press("Enter");
        }
        const afterFirstDeadline = Date.now() + 480_000;
        let afterFirst = await canvasPng(page);
        let repress = 0;
        let nextEnterAt = Date.now() + 5_000;
        while (Date.now() < afterFirstDeadline) {
            const { changedRatio } = await comparePngs(page, inGame, afterFirst);
            if (changedRatio < 0.4) break;
            if (repress < 5 && Date.now() >= nextEnterAt) {
                await page.keyboard.press("Enter");
                repress += 1;
                nextEnterAt = Date.now() + 5_000;
            }
            await page.waitForTimeout(1000);
            afterFirst = await canvasPng(page);
        }
        afterFirst = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.01,
            timeout: 180_000,
        });
        await snap(testInfo, "05-after-first-save", afterFirst);

        await pressKey(page, "F6");
        await page.waitForTimeout(2500);
        const afterSecond = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.02,
            timeout: 180_000,
        });
        await snap(testInfo, "06-after-second-f6", afterSecond);

        const vsMap2 = await comparePngs(page, afterFirst, afterSecond);
        const vsDialog = await comparePngs(page, saveDialog, afterSecond);
        expect(vsMap2.changedRatio).toBeLessThan(0.25);
        expect(vsDialog.changedRatio).toBeGreaterThan(0.2);

        await page.reload();
        const slotName = page
            .locator(`#game_slots_${folder} .game_slot_name`)
            .first();
        const nameRe = new RegExp(
            `^(${saveName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}|Нет имени|No name|)$`,
            "i",
        );
        await expect(slotName).toHaveText(nameRe, { timeout: 30_000 });
    });
}

