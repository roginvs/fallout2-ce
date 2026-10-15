// Section 5 (partial): F4 normal save → reload → download (SAVE.DAT) → load.
// One parametrized test per game folder (add rows to GAMES for more titles).
import { expect, test } from "../helpers/fixtures.mjs";
import fs from "node:fs/promises";
import {
    canvasPng,
    comparePngs,
    INTERFACE_BAR,
    downloadSlot,
    launchGameRetry,
    listTarPaths,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForGameplay,
    waitForStableFrame,
} from "../helpers/game.mjs";

/** @type {{ folder: string, label: string, saveName: string }[]} */
const GAMES = [
    {
        folder: "FalloutNevadaFoxx070925",
        label: "Nevada 3.4 Foxx ru",
        saveName: "audit-nv34r-n-a",
    },
    {
        folder: "FalloutOfNevada",
        label: "Nevada 2.4.1 Foxx ru",
        saveName: "audit-nv241r-n-a",
    },
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
    {
        folder: "Fallout_Sonora_1_14_dlc_eng",
        label: "Sonora 1.14 Eng",
        saveName: "audit-so114e-n-a",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc",
        label: "Sonora 1.15 ru",
        saveName: "audit-so115r-n-a",
    },
    {
        folder: "Fallout_Sonora_1_13_dlc",
        label: "Sonora 1.13 ru",
        saveName: "audit-so113r-n-a",
    },
    {
        folder: "Fallout_Sonora",
        label: "Sonora 1.11 ru",
        saveName: "audit-so111r-n-a",
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
        // Nevada 2.4.1 (and similar) show a long intro; bar stays black until map.
        const inGame = await waitForGameplay(page, { timeout: 480_000 });
        await snap(testInfo, "03-in-game", inGame);

        await pressKey(page, "F4");
        await waitForCanvasChange(page, inGame, { minChanged: 0.1 });
        const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
        await snap(testInfo, "04-save-dialog", saveDialog);

        await pressKey(page, "Enter");
        await page.waitForTimeout(800);
        // If we are still in a save UI (not back on the map), type a description.
        // Some builds save on the first Enter with an empty name ("Нет имени").
        const afterEnter = await canvasPng(page);
        const { changedRatio: vsMap } = await comparePngs(
            page,
            inGame,
            afterEnter,
        );
        let expectNamed = false;
        if (vsMap > 0.2) {
            await page.keyboard.type(saveName, { delay: 50 });
            await page.waitForTimeout(300);
            const description = await waitForStableFrame(page, {
                maxChanged: 0.01,
            });
            await snap(testInfo, "05-save-description", description);
            await page.keyboard.press("Enter");
            expectNamed = true;
        } else {
            await snap(testInfo, "05-saved-without-description", afterEnter);
        }
        // Must be back on the map before reload (save UI can look "stable").
        // Re-press Enter a few times if the description box is still up.
        const afterSaveDeadline = Date.now() + 480_000;
        let afterSave = await canvasPng(page);
        let nextEnterAt = Date.now() + 5_000;
        let repress = 0;
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
        {
            const { changedRatio } = await comparePngs(page, inGame, afterSave);
            expect(
                changedRatio,
                "still in save UI after confirm; IDBFS would be empty",
            ).toBeLessThan(0.4);
        }
        afterSave = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.01,
            timeout: 180_000,
        });
        await snap(testInfo, "06-after-save", afterSave);

        await page.reload();
        const slotName = page
            .locator(`#game_slots_${folder} .game_slot_name`)
            .first();
        // Named when the description prompt accepted the text; otherwise empty
        // / "Нет имени" / "No name". Presence of SAVE.DAT is asserted below.
        const nameRe = new RegExp(
            `^(${saveName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|Нет имени|No name|)$`,
            "i",
        );
        await expect(slotName).toHaveText(nameRe, { timeout: 30_000 });

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
