// Section 5 (partial): F4 normal save → reload → download (SAVE.DAT) → load.
// One parametrized test per game folder (add rows to GAMES for more titles).
import { expect, test } from "../helpers/fixtures.mjs";
import fs from "node:fs/promises";
import {
    comparePngs,
    INTERFACE_BAR,
    downloadSlot,
    launchGameRetry,
    listTarPaths,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

/** @type {{ folder: string, label: string, saveName: string }[]} */
const GAMES = [
    {
        folder: "FalloutNevadaEng",
        label: "Nevada Eng",
        saveName: "audit-nveng-n-a",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc_eng",
        label: "Sonora 1.15 Eng",
        saveName: "audit-so115e-n-a",
    },
];

for (const { folder, label, saveName } of GAMES) {
    test(`baseline normal save reload download load (${label})`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(20 * 60_000);
        await launchGameRetry(page, folder);
        const mainMenu = await waitForStableFrame(page);
        await snap(testInfo, "01-main-menu", mainMenu);

        await pressKey(page, "n");
        await waitForCanvasChange(page, mainMenu);
        const charSelect = await waitForStableFrame(page);
        await snap(testInfo, "02-char-select", charSelect);

        await pressKey(page, "t");
        await waitForCanvasChange(page, charSelect);
        const inGame = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.01,
            timeout: 480_000,
        });
        await snap(testInfo, "03-in-game", inGame);

        await pressKey(page, "F4");
        await waitForCanvasChange(page, inGame, { minChanged: 0.1 });
        const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
        await snap(testInfo, "04-save-dialog", saveDialog);

        await pressKey(page, "Enter");
        await page.waitForTimeout(500);
        await page.keyboard.type(saveName, { delay: 50 });
        const description = await waitForStableFrame(page, { maxChanged: 0.01 });
        await snap(testInfo, "05-save-description", description);
        await pressKey(page, "Enter");
        const afterSave = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.01,
            timeout: 480_000,
        });
        await snap(testInfo, "06-after-save", afterSave);

        await page.reload();
        const slotName = page
            .locator(`#game_slots_${folder} .game_slot_name`)
            .first();
        await expect(slotName).toHaveText(saveName, { timeout: 30_000 });

        const archive = await downloadSlot(page, folder, 1, testInfo);
        const stat = await fs.stat(archive);
        expect(stat.size).toBeGreaterThan(1024);
        const tarPaths = await listTarPaths(archive);
        await testInfo.attach("archive-paths.json", {
            body: Buffer.from(JSON.stringify(tarPaths, null, 2)),
            contentType: "application/json",
        });
        expect(
            tarPaths.some((p) => p === "SAVE.DAT" || p.endsWith("/SAVE.DAT")),
            `SAVE.DAT missing in archive: ${tarPaths.join(", ")}`,
        ).toBe(true);

        await launchGameRetry(page, folder);
        const menuAgain = await waitForStableFrame(page);
        await pressKey(page, "l");
        await waitForCanvasChange(page, menuAgain, { minChanged: 0.1 });
        const loadDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
        await snap(testInfo, "07-load-dialog", loadDialog);

        await pressKey(page, "Enter");
        await waitForCanvasChange(page, loadDialog, { minChanged: 0.1 });
        const loaded = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.01,
            timeout: 480_000,
        });
        await snap(testInfo, "08-loaded", loaded);

        const { changedRatio } = await comparePngs(page, afterSave, loaded);
        expect(changedRatio).toBeLessThan(0.35);
    });
}
