// Fork P1: slot list names after reload (mainmenu.mjs game_slot_name).
// Imports a named and an empty-name SAVE.DAT, reloads the shell, checks labels.
import { expect, test } from "../helpers/fixtures.mjs";
import fs from "node:fs/promises";
import { packTarFile, tarEnding } from "../../tar.mjs";
import { importSlot } from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

/** @param {string} name 11-char save header name at 0x3d */
function saveDat(name) {
    const save = new Uint8Array(0x100);
    const magic = "FALLOUT SAVE FILE";
    for (let i = 0; i < magic.length; i++) save[i] = magic.charCodeAt(i);
    for (let i = 0; i < 11; i++) save[0x3d + i] = name.charCodeAt(i) || 0;
    return save;
}

/** @param {import("@playwright/test").TestInfo} testInfo @param {string} file @param {Uint8Array} body */
async function writeTar(testInfo, file, body) {
    const tar = testInfo.outputPath(file);
    await fs.writeFile(
        tar,
        Buffer.concat(
            [packTarFile("SLOT01/SAVE.DAT", body), tarEnding].map((b) =>
                Buffer.from(b),
            ),
        ),
    );
    return tar;
}

test("fork P1: slot list shows name and No name after reload", async ({
    page,
}, testInfo) => {
    await page.goto(`/#/${FOLDER}`);
    await page
        .locator(`#game_slots_${FOLDER}`)
        .waitFor({ state: "visible", timeout: 60_000 });

    const named = await writeTar(testInfo, "named.tar", saveDat("FORK-SLOT1"));
    const empty = await writeTar(testInfo, "empty.tar", saveDat(""));
    await importSlot(page, FOLDER, 1, named);
    await importSlot(page, FOLDER, 2, empty);

    const names = page.locator(`#game_slots_${FOLDER} .game_slot_name`);
    await expect(names.nth(0)).toHaveText("FORK-SLOT1", { timeout: 30_000 });
    await expect(names.nth(1)).toHaveText(/^(No name|Нет имени|$)/i, {
        timeout: 30_000,
    });

    await page.reload();
    await page
        .locator(`#game_slots_${FOLDER}`)
        .waitFor({ state: "visible", timeout: 60_000 });
    await expect(names.nth(0)).toHaveText("FORK-SLOT1", { timeout: 30_000 });
    await expect(names.nth(1)).toHaveText(/^(No name|Нет имени|$)/i, {
        timeout: 30_000,
    });
});
