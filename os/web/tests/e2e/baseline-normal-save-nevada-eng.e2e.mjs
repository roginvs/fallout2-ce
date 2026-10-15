// Section 5 (partial) for FalloutNevadaEng on the live site:
// new game → F4 normal save → reload → download archive (SAVE.DAT) → load.
import { expect, test } from "../helpers/fixtures.mjs";
import fs from "node:fs/promises";
import {
    comparePngs,
    INTERFACE_BAR,
    downloadSlot,
    launchGame,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";
// Live shell lowercases typed descriptions in the slot list.
const SAVE_NAME = "audit-nveng-n-a";

/**
 * @param {string} archivePath
 * @returns {Promise<string[]>}
 */
async function listTarPaths(archivePath) {
    const buf = new Uint8Array(await fs.readFile(archivePath));
    const paths = [];
    let rest = buf;
    while (rest.length >= 512) {
        const header = rest.subarray(0, 512);
        if (header.every((b) => b === 0)) break;
        const nameEnd = header.indexOf(0);
        const name = String.fromCharCode(
            ...header.subarray(0, nameEnd < 0 ? 100 : Math.min(100, nameEnd)),
        );
        const sizeStr = String.fromCharCode(...header.subarray(124, 136))
            .replace(/\0/g, "")
            .trim();
        const fileSize = parseInt(sizeStr, 8) || 0;
        const typeFlag = header[156];
        const isFile = typeFlag === 0 || typeFlag === 48;
        if (name && isFile) paths.push(name);
        const padded = fileSize + ((512 - (fileSize % 512)) % 512);
        rest = rest.subarray(512 + padded);
    }
    return paths;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} folder
 */
async function launchGameRetry(page, folder) {
    let last;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await launchGame(page, folder);
            return;
        } catch (e) {
            last = e;
            const msg = String(e && e.message ? e.message : e);
            if (!/ERR_TIMED_OUT|Timeout|net::ERR_/i.test(msg) || attempt === 3) {
                throw e;
            }
            await page.waitForTimeout(2000 * attempt);
        }
    }
    throw last;
}

test("baseline normal save reload download load (Nevada Eng)", async ({
    page,
}, testInfo) => {
    test.setTimeout(20 * 60_000);
    await launchGameRetry(page, FOLDER);
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

    // F4 = normal save (not quicksave F6).
    await pressKey(page, "F4");
    await waitForCanvasChange(page, inGame, { minChanged: 0.1 });
    const saveDialog = await waitForStableFrame(page, { maxChanged: 0.01 });
    await snap(testInfo, "04-save-dialog", saveDialog);

    await pressKey(page, "Enter");
    await page.waitForTimeout(500);
    await page.keyboard.type(SAVE_NAME, { delay: 50 });
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
        .locator(`#game_slots_${FOLDER} .game_slot_name`)
        .first();
    await expect(slotName).toHaveText(SAVE_NAME, { timeout: 30_000 });

    const archive = await downloadSlot(page, FOLDER, 1, testInfo);
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

    await launchGameRetry(page, FOLDER);
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
