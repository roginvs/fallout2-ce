// Section 5/8: after quicksave slot is set, F7 quickloads without a dialog.
// Inventory opened then closed first: F7 ignored inside inventory UI.
// One parameterized test per game folder (all nine, Nevada Eng included).
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
        folder: "FalloutNevadaEng",
        label: "Nevada Eng",
        saveName: "audit-nveng-ql",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc_eng",
        label: "Sonora 1.15 Eng",
        saveName: "audit-so115e-ql",
    },
    {
        folder: "Fallout_Sonora_1_14_dlc_eng",
        label: "Sonora 1.14 Eng",
        saveName: "audit-so114e-ql",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc",
        label: "Sonora 1.15 ru",
        saveName: "audit-so115r-ql",
    },
    {
        folder: "Fallout_Sonora_1_13_dlc",
        label: "Sonora 1.13 ru",
        saveName: "audit-so113r-ql",
    },
    {
        folder: "Fallout_Sonora",
        label: "Sonora 1.11 ru",
        saveName: "audit-so111r-ql",
    },
    {
        folder: "FalloutNevadaFoxx070925",
        label: "Nevada 3.4 Foxx ru",
        saveName: "audit-nv34r-ql",
    },
    {
        folder: "FalloutOfNevada",
        label: "Nevada 2.4.1 Foxx ru",
        saveName: "audit-nv241r-ql",
    },
    {
        folder: "Fallout_Nevada_official_20240505_100_patch2",
        label: "Nevada 1.00 patch2 ru",
        saveName: "audit-nv100r-ql",
    },
];

for (const { folder, label, saveName } of GAMES) {
    test(`baseline F7 quickload without dialog (${label})`, async ({
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

        await pressKey(page, "t");
        await waitForCanvasChange(page, charSelect, {
            minChanged: 0.1,
            timeout: 120_000,
        });
        const inGame = await waitForGameplay(page, { timeout: 480_000 });
        await snap(testInfo, "02-in-game", inGame);

        await pressKey(page, "F6");
        await waitForCanvasChange(page, inGame, {
            minChanged: 0.1,
            timeout: 120_000,
        });
        const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
        await pressKey(page, "Enter");
        await page.waitForTimeout(800);
        const afterEnter = await canvasPng(page);
        const { changedRatio: vsMap0 } = await comparePngs(
            page,
            inGame,
            afterEnter,
        );
        if (vsMap0 > 0.2) {
            await page.keyboard.type(saveName, { delay: 50 });
            await page.waitForTimeout(300);
            await page.keyboard.press("Enter");
        }
        const afterSaveDeadline = Date.now() + 480_000;
        let afterSave = afterEnter;
        let repress = 0;
        let nextEnterAt = Date.now() + 5_000;
        while (Date.now() < afterSaveDeadline) {
            const { changedRatio } = await comparePngs(page, inGame, afterSave);
            if (changedRatio < 0.4) break;
            if (repress < 5 && Date.now() >= nextEnterAt) {
                await page.keyboard.press("Enter");
                repress += 1;
                nextEnterAt = Date.now() + 5_000;
            }
            await page.waitForTimeout(1000);
            afterSave = await canvasPng(page);
        }
        afterSave = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.01,
            timeout: 180_000,
        });
        await snap(testInfo, "03-after-save", afterSave);

        await pressKey(page, "i");
        await waitForCanvasChange(page, afterSave, {
            minChanged: 0.15,
            timeout: 120_000,
        });
        const inventory = await waitForStableFrame(page, { maxChanged: 0.02 });
        await snap(testInfo, "04-inventory", inventory);
        await pressKey(page, "Escape");
        await waitForCanvasChange(page, inventory, {
            minChanged: 0.15,
            timeout: 120_000,
        });
        const onMap = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.02,
            timeout: 180_000,
        });
        await snap(testInfo, "05-back-on-map", onMap);

        await pressKey(page, "F7");
        await page.waitForTimeout(2500);
        const afterF7 = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.02,
            timeout: 180_000,
        });
        await snap(testInfo, "06-after-f7", afterF7);

        const vsMap = await comparePngs(page, onMap, afterF7);
        const vsDialog = await comparePngs(page, saveDialog, afterF7);
        expect(vsMap.changedRatio).toBeLessThan(0.25);
        expect(vsDialog.changedRatio).toBeGreaterThan(0.2);
    });
}
