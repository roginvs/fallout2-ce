// Fork P1: "Download to offline" (mainmenu.mjs downloadAllGameFiles) + the
// engine service worker (index.sw.js). After the download the browser goes
// offline, the page reloads from the service worker and the game reaches the
// main menu and character selection from Cache Storage only.
// Heavy: downloads the whole game (Nevada 1.00 patch2 is the smallest, ~1.7 GB
// unpacked). Needs a non-localhost origin (127.0.0.1), where the SW is on.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    pressKey,
    snap,
    waitForCanvasChange,
    waitForMainMenu,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "Fallout_Nevada_official_20240505_100_patch2";

test("fork P1: game starts offline after Download to offline", async ({
    page,
    context,
}, testInfo) => {
    test.setTimeout(120 * 60_000);
    await page.goto(`/#/${FOLDER}`);
    expect(new URL(page.url()).hostname).not.toBe("localhost");
    // Wait until the engine service worker controls the page.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, {
        timeout: 60_000,
    });

    /** @type {string[]} */
    const dialogs = [];
    page.on("dialog", async (d) => {
        dialogs.push(`${d.type()}: ${d.message()}`);
        await d.accept();
    });
    const link = page.locator(`#game_download_${FOLDER}`);
    await link.click();
    await expect
        .poll(() => dialogs.filter((d) => d.startsWith("alert")).length, {
            timeout: 110 * 60_000,
            intervals: [10_000],
        })
        .toBeGreaterThan(0);
    expect(dialogs.at(-1)).toMatch(/^alert: (Ready|Готово)$/);

    await context.setOffline(true);
    await page.reload();
    const hires = page.locator(`#enable_hires_${FOLDER}`);
    await hires.waitFor({ state: "visible", timeout: 60_000 });
    if (await hires.isChecked()) await hires.uncheck();
    await page.locator(`#start_${FOLDER}`).click();
    await page.locator("#canvas").waitFor({ state: "visible" });
    const menu = await waitForMainMenu(page, { timeout: 480_000 });
    await snap(testInfo, "01-offline-main-menu", menu);
    await pressKey(page, "n");
    await waitForCanvasChange(page, menu, {
        minChanged: 0.15,
        timeout: 120_000,
    });
    const charSelect = await waitForStableFrame(page, {
        minNonBlack: 0.25,
        timeout: 180_000,
    });
    await snap(testInfo, "02-offline-char-select", charSelect);
});
