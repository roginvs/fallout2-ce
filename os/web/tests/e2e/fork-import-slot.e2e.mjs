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

test("fork P1: broken or foreign archive shows error, slot intact", async ({
    page,
}, testInfo) => {
    await openShell(page);
    const good = await writeTar(testInfo.outputPath("good.tar"), [
        ["SLOT01/SAVE.DAT", saveDat("FORK-KEEP")],
    ]);
    await importSlot(page, FOLDER, 4, good);
    await expect(slotName(page, 4)).toHaveText("FORK-KEEP", {
        timeout: 30_000,
    });

    const garbage = testInfo.outputPath("garbage.tar");
    await fs.writeFile(
        garbage,
        Buffer.from(
            Array.from({ length: 1500 }, (_, i) => (i * 37 + 11) % 251),
        ),
    );
    const noSave = await writeTar(testInfo.outputPath("nosave.tar"), [
        ["SLOT01/AUTOMAP.SAV", new Uint8Array([1, 2, 3])],
    ]);

    for (const [file, re] of [
        [garbage, /size|ustar|header|Unsupported/i],
        [noSave, /no SAVE\.DAT/i],
    ]) {
        await page.locator(`#showmenu_${FOLDER}_SLOT04`).click();
        const item = page
            .locator("#contextMenu .context-menu-item")
            .filter({ hasText: /import from file|импорт из файла/i });
        const chooserPromise = page.waitForEvent("filechooser");
        await item.click();
        await (await chooserPromise).setFiles(file);
        await expect(page.locator("#error_text")).toHaveText(re, {
            timeout: 15_000,
        });
        // Page is alive (no reload, no hang) and the slot still has the old save.
        await expect(slotName(page, 4)).toHaveText("FORK-KEEP");
        expect(await page.evaluate(() => 1 + 1)).toBe(2);
        await page.reload();
        await page
            .locator(`#game_slots_${FOLDER}`)
            .waitFor({ state: "visible", timeout: 60_000 });
        await expect(slotName(page, 4)).toHaveText("FORK-KEEP", {
            timeout: 30_000,
        });
    }
});

test("fork P1: folder import (webkitdirectory) fills an empty slot", async ({
    page,
}, testInfo) => {
    await openShell(page);
    const dir = testInfo.outputPath("SLOT09");
    await fs.mkdir(`${dir}/PROTO/CRITTERS`, { recursive: true });
    await fs.writeFile(`${dir}/SAVE.DAT`, saveDat("FORK-DIR"));
    await fs.writeFile(`${dir}/PROTO/CRITTERS/00000001.PRO`, Buffer.from([7]));

    await expect(slotName(page, 6)).toHaveText("");
    await page.locator(`#showmenu_${FOLDER}_SLOT06`).click();
    const item = page
        .locator("#contextMenu .context-menu-item")
        .filter({ hasText: /import from folder|импорт из папки/i });
    const chooserPromise = page.waitForEvent("filechooser");
    await item.click();
    await (await chooserPromise).setFiles(dir);
    await page.waitForLoadState("domcontentloaded");
    await expect(slotName(page, 6)).toHaveText("FORK-DIR", { timeout: 30_000 });

    const archive = await downloadSlot(page, FOLDER, 6, testInfo);
    const paths = await listTarPaths(archive);
    expect(paths).toContain("SLOT06/SAVE.DAT");
    expect(paths).toContain("SLOT06/PROTO/CRITTERS/00000001.PRO");
});
