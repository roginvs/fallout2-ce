// Section 8: legacy f2_res.ini UI → active cfg on web.
// Shell always sets screen.resolution_x, so C++ migration is skipped; mainmenu
// copies ALTERNATE_AMMO_METRE → ui.alternate_ammo_meter and MAIN_MENU_SIZE →
// ui.main_menu_scale_mode (clamped). Screen overrides from the shell stay.
import { expect, test } from "../helpers/fixtures.mjs";
import { launchGameRetry, snap, waitForMainMenu } from "../helpers/game.mjs";

/** @type {{ folder: string, label: string, cfg: string }[]} */
const GAMES = [
    {
        folder: "FalloutNevadaEng",
        label: "Nevada Eng",
        cfg: "Nevada.cfg",
    },
    {
        folder: "FalloutNevadaFoxx070925",
        label: "Nevada 3.4 Foxx ru",
        cfg: "config.cfg",
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

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

for (const { folder, label, cfg } of GAMES) {
    test(`section 8 legacy f2_res UI migrates into cfg (${label})`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(15 * 60_000);
        /** @type {string[]} */
        const f2resLogs = [];
        page.on("console", (m) => {
            if (m.text().startsWith("f2_res.ini:")) f2resLogs.push(m.text());
        });

        await launchGameRetry(page, folder);
        const menu = await waitForMainMenu(page, { timeout: 480_000 });
        await snap(testInfo, "01-main-menu", menu);

        const state = await page.evaluate(
            async ({ folder, cfg }) => {
                const w = /** @type {any} */ (window);
                const node = w.FS.lookupPath(`/${folder}/${cfg}`).node;
                const cfgText = node.contents
                    ? String.fromCharCode(...node.contents)
                    : null;
                const f2res = await fetch(`./game/${folder}/f2_res.ini.gz?v=1`);
                const f2buf = await new Response(
                    f2res.body.pipeThrough(new DecompressionStream("gzip")),
                ).arrayBuffer();
                return {
                    cfgText,
                    f2Text: String.fromCharCode(...new Uint8Array(f2buf)),
                    tags: { ...w.debugTags },
                };
            },
            { folder, cfg },
        );
        await testInfo.attach("state.json", {
            body: Buffer.from(
                JSON.stringify(
                    {
                        ...state,
                        f2resLogs: f2resLogs.map((s) => s.slice(0, 200)),
                    },
                    null,
                    2,
                ),
            ),
            contentType: "application/json",
        });

        expect(state.cfgText, `${cfg} not in memory`).not.toBeNull();
        const ini = parseIni(/** @type {string} */ (state.cfgText));
        const f2 = parseIni(state.f2Text);

        // Shell screen overrides always win.
        expect(ini.screen?.windowed).toBe("1");
        expect(ini.screen?.resolution_x).toBeTruthy();
        expect(ini.qol?.walk_when_sneaking).toBe("1");

        const ammoRaw = f2.iface?.alternate_ammo_metre;
        if (ammoRaw != null && ammoRaw !== "") {
            const expected = String(clamp(parseInt(ammoRaw, 10) || 0, 0, 2));
            expect(
                ini.ui?.alternate_ammo_meter,
                `ALTERNATE_AMMO_METRE=${ammoRaw} → ui.alternate_ammo_meter`,
            ).toBe(expected);
        }

        const sizeRaw = f2.mainmenu?.main_menu_size;
        if (sizeRaw != null && sizeRaw !== "") {
            let scaleMode = parseInt(sizeRaw, 10) || 0;
            const scaleButtons = f2.mainmenu?.scale_buttons_and_text_menu;
            if (
                (scaleButtons === "1" ||
                    scaleButtons?.toLowerCase() === "true") &&
                scaleMode !== 0
            ) {
                scaleMode = 2;
            }
            scaleMode = clamp(scaleMode, 0, 2);
            expect(
                ini.ui?.main_menu_scale_mode,
                `MAIN_MENU_SIZE=${sizeRaw} → ui.main_menu_scale_mode`,
            ).toBe(String(scaleMode));
        }

        // Nevada Eng is the confirmed regression: ammo must be 1, not 0.
        if (folder === "FalloutNevadaEng") {
            expect(f2.iface?.alternate_ammo_metre).toBe("1");
            expect(ini.ui?.alternate_ammo_meter).toBe("1");
            expect(ini.ui?.main_menu_scale_mode).toBe("1");
        }
    });
}
