// Web defaults written into the active cfg ([Misc] ConfigFile) by
// mainmenu.mjs for every game: keys the engine no longer reads from
// ddraw.ini / f2_res.ini. Boots each game to the main menu (hi-res default)
// and checks the cfg the engine read.
import { expect, test } from "../helpers/fixtures.mjs";
import { waitForMainMenu } from "../helpers/game.mjs";
import { ALL_GAMES } from "../helpers/games.mjs";

/** @type {Record<string, string>} */
const CFG = {
    FalloutNevadaEng: "Nevada.cfg",
    FalloutNevadaFoxx070925: "config.cfg",
    FalloutOfNevada: "config.cfg",
};

/** @type {[string, string, string][]} */
const EXPECTED = [
    ["ui", "skip_opening_movies", "1"],
    ["ui", "display_karma_changes", "1"],
    ["ui", "display_bonus_damage", "1"],
    ["ui", "numbers_in_dialogue", "1"],
    ["ui", "auto_quick_save", "0"],
    ["ui", "alternate_ammo_meter", "1"],
    ["ui", "movie_aspect_fit", "1"],
    ["preferences", "subtitles", "1"],
    ["preferences", "running", "1"],
    ["qol", "use_walk_distance", "3"],
    ["sound", "gapless_music", "1"],
    ["sound", "music_path2", "data\\sound\\music\\"],
    ["system", "art_cache_size", "256"],
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

for (const { folder, tag } of ALL_GAMES) {
    const cfg = CFG[folder] ?? "fallout2.cfg";
    test(`web cfg defaults (${tag})`, async ({ page }) => {
        test.setTimeout(15 * 60_000);
        await page.goto(`/#/${folder}`);
        await page.locator(`#start_${folder}`).click();
        await page.locator("#canvas").waitFor({ state: "visible" });
        // skip_opening_movies=1: the menu comes without the intro movies.
        await waitForMainMenu(page, { timeout: 480_000 });

        const cfgText = await page.evaluate(
            ({ folder, cfg }) => {
                const w = /** @type {any} */ (window);
                const node = w.FS.lookupPath(`/${folder}/${cfg}`).node;
                return node.contents
                    ? String.fromCharCode(...node.contents)
                    : null;
            },
            { folder, cfg },
        );
        expect(cfgText, `${cfg} not in memory`).not.toBeNull();
        const ini = parseIni(/** @type {string} */ (cfgText));
        for (const [section, key, value] of EXPECTED) {
            expect(ini[section]?.[key], `[${section}] ${key}`).toBe(value);
        }
        expect(ini.ui?.death_screen_size).toBe("1");
        expect(ini.ui?.end_slide_size).toBe("1");
    });
}
