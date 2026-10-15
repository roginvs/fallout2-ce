// Fork P1: shell save import (mainmenu.mjs uploadSavegame/tarToFiles).
// Shell-only: no game start. Archives are built with the shell's own tar.mjs.
import { expect, test } from "../helpers/fixtures.mjs";
import fs from "node:fs/promises";
import { packTarFile, tarEnding } from "../../tar.mjs";
import { downloadSlot, importSlot, listTarPaths } from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

/** SAVE.DAT stub that getSaveInfo() accepts: header + name at 0x3d. */
function saveDat(name) {
    const buf = new Uint8Array(0x100);
    const header = "FALLOUT SAVE FILE";
    for (let i = 0; i < header.length; i++) buf[i] = header.charCodeAt(i);
    for (let i = 0; i < name.length; i++) buf[0x3d + i] = name.charCodeAt(i);
    return buf;
}

/**
 * @param {string} file
 * @param {[string, Uint8Array | null][]} entries
 */
async function writeTar(file, entries) {
    const blocks = entries.map(([p, d]) => packTarFile(p, d));
    blocks.push(tarEnding);
    await fs.writeFile(file, Buffer.concat(blocks.map((b) => Buffer.from(b))));
    return file;
}

/** @param {import("@playwright/test").Page} page @param {number} slot */
function slotName(page, slot) {
    return page.locator(`#game_slots_${FOLDER} .game_slot_name`).nth(slot - 1);
}

async function openShell(page) {
    await page.goto(`/#/${FOLDER}`);
    await page
        .locator(`#game_slots_${FOLDER}`)
        .waitFor({ state: "visible", timeout: 60_000 });
}

test("fork P1: tar import into occupied slot replaces old files", async ({
    page,
}, testInfo) => {
    await openShell(page);
    await expect(slotName(page, 2)).toHaveText("");

    const oldTar = await writeTar(testInfo.outputPath("old.tar"), [
        ["SLOT07/", null],
        ["SLOT07/SAVE.DAT", saveDat("FORK-OLD")],
        ["SLOT07/OLDONLY.TXT", new TextEncoder().encode("old")],
    ]);
    await importSlot(page, FOLDER, 2, oldTar);
    await expect(slotName(page, 2)).toHaveText("FORK-OLD", { timeout: 30_000 });

    const newTar = await writeTar(testInfo.outputPath("new.tar"), [
        ["SLOT05/", null],
        ["SLOT05/SAVE.DAT", saveDat("FORK-NEW")],
        ["SLOT05/PROTO/", null],
        ["SLOT05/PROTO/ITEMS/", null],
        ["SLOT05/PROTO/ITEMS/00000001.PRO", new Uint8Array([1, 2, 3])],
    ]);
    await importSlot(page, FOLDER, 2, newTar);
    await expect(slotName(page, 2)).toHaveText("FORK-NEW", { timeout: 30_000 });
    // Neighbour slots untouched.
    await expect(slotName(page, 1)).toHaveText("");
    await expect(slotName(page, 3)).toHaveText("");

    const archive = await downloadSlot(page, FOLDER, 2, testInfo);
    const paths = await listTarPaths(archive);
    await testInfo.attach("slot02-paths.json", {
        body: JSON.stringify(paths, null, 2),
        contentType: "application/json",
    });
    expect(paths).toContain("SLOT02/SAVE.DAT");
    expect(paths).toContain("SLOT02/PROTO/ITEMS/00000001.PRO");
    expect(paths.filter((p) => /OLDONLY/.test(p))).toEqual([]);
});
