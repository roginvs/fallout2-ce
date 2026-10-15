// Section 5 step 1: every matrix folder reaches a real in-game main menu on live.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    comparePngs,
    launchGame,
    snap,
    waitForStableFrame,
} from "../helpers/game.mjs";

/** @type {{ folder: string, label: string }[]} */
const GAMES = [
    { folder: "FalloutNevadaFoxx070925", label: "Nevada 3.4 Foxx ru" },
    { folder: "FalloutOfNevada", label: "Nevada 2.4.1 Foxx ru" },
    {
        folder: "Fallout_Nevada_official_20240505_100_patch2",
        label: "Nevada 1.00 patch2 ru",
    },
    { folder: "FalloutNevadaEng", label: "Nevada Eng" },
    { folder: "Fallout_Sonora_1_15_dlc", label: "Sonora 1.15 ru" },
    { folder: "Fallout_Sonora_1_13_dlc", label: "Sonora 1.13 ru" },
    { folder: "Fallout_Sonora", label: "Sonora 1.11 ru" },
    { folder: "Fallout_Sonora_1_15_dlc_eng", label: "Sonora 1.15 eng" },
    { folder: "Fallout_Sonora_1_14_dlc_eng", label: "Sonora 1.14 eng" },
];

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} folder
 */
async function launchGameRetry(page, folder) {
    page.setDefaultNavigationTimeout(90_000);
    let last;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            await launchGame(page, folder);
            return;
        } catch (e) {
            last = e;
            const msg = String(e && /** @type {any} */ (e).message ? /** @type {any} */ (e).message : e);
            if (!/ERR_TIMED_OUT|Timeout|net::ERR_/i.test(msg) || attempt === 3) {
                throw e;
            }
            await page.waitForTimeout(3000 * attempt);
        }
    }
    throw last;
}

for (const { folder, label } of GAMES) {
    test(`main menu renders (${label})`, async ({ page }, testInfo) => {
        test.setTimeout(10 * 60_000);
        await launchGameRetry(page, folder);
        const mainMenu = await waitForStableFrame(page, { timeout: 480_000 });
        await snap(testInfo, `main-menu-${folder}`, mainMenu);
        const { nonBlackRatioB } = await comparePngs(page, mainMenu, mainMenu);
        expect(nonBlackRatioB).toBeGreaterThan(0.15);
    });
}
