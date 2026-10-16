// Fork P1: hi-res checkbox (localStorage enable_hires_<folder>) and the JS
// rewrite of the active cfg ([Misc] ConfigFile) in mainmenu.mjs.
// One test per game x hi-res state. Boots only to the main menu.
import { expect, test } from "../helpers/fixtures.mjs";
import fs from "node:fs/promises";
import { snap, waitForMainMenu } from "../helpers/game.mjs";

/** @type {{ folder: string, cfg: string }[]} */
const GAMES = [
    { folder: "FalloutNevadaEng", cfg: "Nevada.cfg" },
    { folder: "FalloutNevadaFoxx070925", cfg: "config.cfg" },
    { folder: "Fallout_Sonora_1_15_dlc_eng", cfg: "fallout2.cfg" },
];

/** @param {string} text */
function parseIni(text) {
    /** @type {Record<string, Record<string, string>>} */
    const out = {};
    let section = "";
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith(";") || line.startsWith("#")) continue;
        if (line.startsWith("[") && line.endsWith("]")) {
            section = line.slice(1, -1).trim().toLowerCase();
            continue;
        }
        const i = line.indexOf("=");
        if (i < 0) continue;
        (out[section] ??= {})[line.slice(0, i).trim().toLowerCase()] = line
            .slice(i + 1)
            .trim();
    }
    return out;
}

for (const { folder, cfg } of GAMES) {
    for (const hires of [false, true]) {
        test(`fork P1: hi-res ${hires ? "on" : "off"} writes cfg (${folder})`, async ({
            page,
        }, testInfo) => {
            test.setTimeout(15 * 60_000);
            await page.goto(`/#/${folder}`);
            const box = page.locator(`#enable_hires_${folder}`);
            await box.waitFor({ state: "visible", timeout: 60_000 });
            // Default is checked; flip to the wanted state and reload.
            await box.setChecked(!hires);
            await box.setChecked(hires);
            await page.reload();
            await box.waitFor({ state: "visible", timeout: 60_000 });
            await expect(box).toBeChecked({ checked: hires });
            expect(
                await page.evaluate(
                    (k) => localStorage.getItem(k),
                    `enable_hires_${folder}`,
                ),
            ).toBe(hires ? "yes" : "no");

            await page.locator(`#start_${folder}`).click();
            await page.locator("#canvas").waitFor({ state: "visible" });
            const menu = await waitForMainMenu(page, { timeout: 480_000 });
            await snap(testInfo, "01-main-menu", menu);

            const state = await page.evaluate(
                async ({ folder, cfg }) => {
                    const w = /** @type {any} */ (window);
                    const canvas = /** @type {HTMLCanvasElement} */ (
                        document.getElementById("canvas")
                    );
                    const node = w.FS.lookupPath(`/${folder}/${cfg}`).node;
                    const cfgText = node.contents
                        ? String.fromCharCode(...node.contents)
                        : null;
                    // Original cfg as published (gzip in the game folder).
                    const res = await fetch(`./game/${folder}/${cfg}.gz?v=1`);
                    const orig = await new Response(
                        res.body.pipeThrough(new DecompressionStream("gzip")),
                    ).arrayBuffer();
                    return {
                        canvas: [canvas.width, canvas.height],
                        tags: { ...w.debugTags },
                        cfgText,
                        origText: String.fromCharCode(...new Uint8Array(orig)),
                    };
                },
                { folder, cfg },
            );
            await fs.writeFile(
                testInfo.outputPath("state.json"),
                JSON.stringify(state, null, 2),
            );
            await testInfo.attach("state.json", {
                path: testInfo.outputPath("state.json"),
                contentType: "application/json",
            });

            expect(state.tags.isUsingHiRes).toBe(String(hires));
            expect(state.cfgText, `${cfg} not in memory`).not.toBeNull();
            const ini = parseIni(/** @type {string} */ (state.cfgText));
            const orig = parseIni(state.origText);

            expect(ini.screen?.windowed).toBe("1");
            expect(ini.qol?.walk_when_sneaking).toBe("1");
            if (!hires) {
                expect(state.canvas).toEqual([640, 480]);
                expect(ini.screen?.resolution_x).toBe("640");
                expect(ini.screen?.resolution_y).toBe("480");
                expect(ini.screen?.scale).toBe("1");
            } else {
                const [gw, gh] = state.tags.gameScreenSize.split("x");
                expect(Number(gw)).toBeGreaterThan(640);
                expect(state.canvas).toEqual([Number(gw), Number(gh)]);
                expect(ini.screen?.resolution_x).toBe(gw);
                expect(ini.screen?.resolution_y).toBe(gh);
                expect(ini.ui?.iface_bar_mode).toBe("0");
                expect(ini.ui?.iface_bar_width).toBe(
                    Number(gw) / Number(ini.screen?.scale) >= 800
                        ? "800"
                        : "640",
                );
                expect(ini.ui?.splash_screen_size).toBe("1");
                expect(ini.ui?.death_screen_size).toBe("1");
                expect(ini.ui?.end_slide_size).toBe("1");
            }
            // Keys of the published cfg survive the rewrite (values may change).
            const lost = [];
            for (const [s, kv] of Object.entries(orig)) {
                for (const k of Object.keys(kv)) {
                    if (ini[s]?.[k] === undefined) lost.push(`[${s}] ${k}`);
                }
            }
            expect(lost, "keys dropped from the active cfg").toEqual([]);
        });
    }
}
