// Section 8: [qol] walk_when_sneaking=1 from the web shell drives organization
// sneak/run logic (no game_mouse.cc hack). Assert cfg after boot, reach the
// map, open Skilldex (S) and toggle Sneak — game must stay controllable.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    launchGameRetry,
    newGameToMap,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

/** @type {{ folder: string, label: string, cfg: string }[]} */
const GAMES = [
    {
        folder: "FalloutNevadaEng",
        label: "Nevada Eng",
        cfg: "Nevada.cfg",
    },
    {
        folder: "Fallout_Sonora_1_15_dlc_eng",
        label: "Sonora 1.15 Eng",
        cfg: "fallout2.cfg",
    },
];

/**
 * @param {string} text
 * @returns {Record<string, Record<string, string>>}
 */
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

for (const { folder, label, cfg } of GAMES) {
    test(`section 8 walk_when_sneaking via organization option (${label})`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(20 * 60_000);
        await launchGameRetry(page, folder);
        const { inGame } = await newGameToMap(page, testInfo, "01-");

        const cfgText = await page.evaluate(
            async ({ folder, cfg }) => {
                const w = /** @type {any} */ (window);
                const node = w.FS.lookupPath(`/${folder}/${cfg}`).node;
                return node.contents
                    ? String.fromCharCode(...node.contents)
                    : null;
            },
            { folder, cfg },
        );
        expect(cfgText, `${cfg} in memory`).not.toBeNull();
        const ini = parseIni(/** @type {string} */ (cfgText));
        expect(ini.qol?.walk_when_sneaking).toBe("1");
        await testInfo.attach("active-cfg.txt", {
            body: Buffer.from(/** @type {string} */ (cfgText)),
            contentType: "text/plain",
        });

        // Skilldex hotkey, then Enter for the first skill (Sneak). Organization
        // walk_when_sneaking keeps sneak across run; we only require the UI
        // path not to soft-lock and the cfg option to be active.
        await pressKey(page, "s");
        await waitForCanvasChange(page, inGame, {
            minChanged: 0.02,
            timeout: 60_000,
        });
        const skilldex = await waitForStableFrame(page, {
            maxChanged: 0.02,
            timeout: 60_000,
        });
        await snap(testInfo, "02-skilldex", skilldex);
        await pressKey(page, "Enter");
        await page.waitForTimeout(1500);
        // Escape closes skilldex if still open; harmless on map.
        await pressKey(page, "Escape");
        await page.waitForTimeout(500);

        const after = await canvasPng(page);
        await snap(testInfo, "03-after-sneak-toggle", after);
        const { nonBlackRatioB } = await comparePngs(page, after, after);
        expect(nonBlackRatioB).toBeGreaterThan(0.1);
        // Still not back on the shell — canvas stays the game surface.
        await expect(page.locator("#canvas")).toBeVisible();
    });
}
