// Section 7B: F4 normal save on candidate (E2E_CANDIDATE_DIR) → reload → download → load.
// Game data from live/cache; JS/WASM/shell from local Release build.
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
    waitForGameDataIdle,
    waitForGameplay,
    waitForMainMenu,
    waitForStableFrame,
} from "../helpers/game.mjs";

test.beforeAll(() => {
    test.skip(
        !process.env.E2E_CANDIDATE_DIR,
        "set E2E_CANDIDATE_DIR to a local Release web build (e.g. build/web)",
    );
});

/** @type {{ folder: string, label: string, saveName: string }[]} */
const GAMES = [
    {
        folder: "FalloutNevadaEng",
        label: "Nevada Eng",
        saveName: "audit-nv-eng-c7b",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc_eng",
        label: "Sonora 1.15 Eng",
        saveName: "audit-so115e-c7b",
    },
    {
        folder: "Fallout_Sonora_1_14_dlc_eng",
        label: "Sonora 1.14 Eng",
        saveName: "audit-so114e-c7b",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc",
        label: "Sonora 1.15 ru",
        saveName: "audit-so115r-c7b",
    },
    {
        folder: "Fallout_Sonora_1_13_dlc",
        label: "Sonora 1.13 ru",
        saveName: "audit-so113r-c7b",
    },
    {
        folder: "Fallout_Sonora",
        label: "Sonora 1.11 ru",
        saveName: "audit-so111r-c7b",
    },
    {
        folder: "FalloutNevadaFoxx070925",
        label: "Nevada 3.4 Foxx ru",
        saveName: "audit-nv34r-c7b",
    },
    {
        folder: "FalloutOfNevada",
        label: "Nevada 2.4.1 Foxx ru",
        saveName: "audit-nv241r-c7b",
    },
    {
        folder: "Fallout_Nevada_official_20240505_100_patch2",
        label: "Nevada 1.00 patch2 ru",
        saveName: "audit-nv100r-c7b",
    },
];

for (const { folder, label, saveName } of GAMES) {
    test(`candidate 7B normal save reload download load (${label})`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(20 * 60_000);
        await launchGameRetry(page, folder);
        const mainMenu = await waitForMainMenu(page, { timeout: 480_000 });
        await snap(testInfo, "01-main-menu", mainMenu);

        // No canvas click: it can hit INTRO / take pointer lock and stall evaluate.
        await pressKey(page, "n");
        await waitForCanvasChange(page, mainMenu, {
            minChanged: 0.15,
            timeout: 120_000,
        });
        // Reject near-black splash (Sonora Eng regressed when char-select was black).
        const charSelect = await waitForStableFrame(page, {
            minNonBlack: 0.25,
            timeout: 180_000,
        });
        await snap(testInfo, "02-char-select", charSelect);

        await pressKey(page, "t");
        await waitForCanvasChange(page, charSelect);
        // Nevada 2.4.1 (and similar) show a long intro; bar stays black until map.
        // Pass mainMenu so INTERFACE_BAR lighting on the title screen is ignored.
        const inGame = await waitForGameplay(page, {
            timeout: 480_000,
            unlike: mainMenu,
        });
        await snap(testInfo, "03-in-game", inGame);

        await pressKey(page, "F4");
        await waitForCanvasChange(page, inGame, {
            minChanged: 0.1,
            timeout: 120_000,
        });
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
            `^(${saveName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|Нет имени|No name)$`,
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
        // Intro FMV can look "stable"; wait for the real menu before Load.
        const menuAgain = await waitForMainMenu(page, { timeout: 480_000 });
        await snap(testInfo, "07-main-menu-again", menuAgain);
        await pressKey(page, "l");
        await waitForCanvasChange(page, menuAgain, {
            minChanged: 0.1,
            timeout: 120_000,
        });
        const loadDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
        await snap(testInfo, "08-load-dialog", loadDialog);

        // Wait out background art fetches (status line on load UI), then confirm.
        await waitForGameDataIdle(page, { timeout: 180_000 });
        await page.keyboard.press("Enter");
        const leftLoadDeadline = Date.now() + 480_000;
        let leftLoad = false;
        let enters = 1;
        while (Date.now() < leftLoadDeadline) {
            const frame = await canvasPng(page);
            const { changedRatio } = await comparePngs(page, loadDialog, frame);
            if (changedRatio > 0.35) {
                leftLoad = true;
                break;
            }
            if (enters < 6) {
                await page.keyboard.press("Enter");
                enters += 1;
            }
            await page.waitForTimeout(2_000);
        }
        expect(leftLoad, "still on load dialog after Enter").toBe(true);
        const loaded = await waitForStableFrame(page, {
            region: INTERFACE_BAR,
            maxChanged: 0.01,
            timeout: 480_000,
        });
        await snap(testInfo, "09-loaded", loaded);

        const { changedRatio } = await comparePngs(page, afterSave, loaded);
        expect(
            changedRatio,
            "loaded map should resemble the post-save map",
        ).toBeLessThan(0.5);
    });
}
