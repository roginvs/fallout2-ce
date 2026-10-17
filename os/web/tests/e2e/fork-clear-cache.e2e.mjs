// Fork P1: "Clear cache" link (mainmenu.mjs + gamecache.mjs removeGameCache).
// Removes only this game's Cache Storage, asks confirm when the game was
// downloaded for offline, keeps IDBFS saves. Shell-only.
import { expect, test } from "../helpers/fixtures.mjs";
import fs from "node:fs/promises";
import { packTarFile, tarEnding } from "../../tar.mjs";
import { importSlot } from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";
const OTHER = "Fallout_Sonora_1_15_dlc_eng";

test("fork P1: clear cache removes game cache, keeps saves", async ({
    page,
}, testInfo) => {
    await page.goto(`/#/${FOLDER}`);
    await page
        .locator(`#game_slots_${FOLDER}`)
        .waitFor({ state: "visible", timeout: 60_000 });

    const save = new Uint8Array(0x100);
    const text = "FALLOUT SAVE FILE";
    for (let i = 0; i < text.length; i++) save[i] = text.charCodeAt(i);
    for (const [i, c] of [..."FORK-CACHE"].entries())
        save[0x3d + i] = c.charCodeAt(0);
    const tar = testInfo.outputPath("slot.tar");
    await fs.writeFile(
        tar,
        Buffer.concat(
            [packTarFile("SLOT01/SAVE.DAT", save), tarEnding].map((b) =>
                Buffer.from(b),
            ),
        ),
    );
    await importSlot(page, FOLDER, 1, tar);
    const slot1 = page.locator(`#game_slots_${FOLDER} .game_slot_name`).first();
    await expect(slot1).toHaveText("FORK-CACHE", { timeout: 30_000 });

    // Cache entries as fetcher.mjs creates them (cache name fscache____<folder>____<v>).
    await page.evaluate(
        async ([a, b]) => {
            for (const folder of [a, b]) {
                const c = await caches.open(`fscache____${folder}____1`);
                await c.put(`/game/${folder}/x.txt.gz?v=1`, new Response("x"));
            }
            localStorage.setItem(`${a}___downloaded`, "yes");
        },
        [FOLDER, OTHER],
    );

    /** @type {string[]} */
    const dialogs = [];
    page.on("dialog", async (d) => {
        dialogs.push(`${d.type()}: ${d.message()}`);
        await d.accept();
    });
    const link = page.locator(`#game_cleanup_${FOLDER}`);
    await link.click();
    await expect(link).toHaveText(/Ready|Готово/, { timeout: 15_000 });
    expect(dialogs.length, "confirm for a downloaded game").toBe(1);
    expect(dialogs[0]).toMatch(/^confirm: /);

    const after = await page.evaluate(
        async (a) => ({
            keys: await caches.keys(),
            flag: localStorage.getItem(`${a}___downloaded`),
        }),
        FOLDER,
    );
    expect(after.keys).not.toContain(`fscache____${FOLDER}____1`);
    expect(after.keys).toContain(`fscache____${OTHER}____1`);
    expect(after.flag).toBeNull();

    await page.reload();
    await expect(slot1).toHaveText("FORK-CACHE", { timeout: 30_000 });
});
