// The fileTransformer workaround always fetches
// data/art/intrface/hr_ifacelft2.frm, hr_ifacerht2.frm and hr_iface_800.frm
// from the FalloutNevadaEng game fetcher
// (Patch001.dat/ART/INTRFACE/<name>.gz), for every game. A plain fetch()
// hangs forever when the server never answers. After a first online start
// the three files must come from Cache Storage so a second start still
// reaches the engine main menu with the network hanging.
// HTTP cache is disabled (CDP) so a browser cache hit cannot mask the bug.
// Canvas frames are read with toDataURL: Playwright's screenshot waits for
// document.fonts.ready, which never settles when the network is hung.
// Needs a non-localhost origin (127.0.0.1), where the SW is on.
import { expect, test } from "../helpers/fixtures.mjs";
import { comparePngs, snap } from "../helpers/game.mjs";

// Without this, context.route() does not see requests made by the service
// worker, so a cache miss there would reach the real server.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

// Tracing also snapshots the page and would hang on fonts.ready once
// the network is held open.
test.use({ trace: "off" });

/** @type {{ folder: string, label: string }[]} */
const GAMES = [
    { folder: "FalloutNevadaEng", label: "Nevada Eng" },
    // Original Fallout 2 is not on the site; Sonora checks the same
    // Nevada Eng fetcher path when starting a different game.
    { folder: "Fallout_Sonora_1_15_dlc_eng", label: "Sonora 1.15 Eng" },
];

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<Buffer>}
 */
async function canvasPngFromDataUrl(page) {
    const dataUrl = await page.locator("#canvas").evaluate((c) => {
        if (!(c instanceof HTMLCanvasElement)) {
            throw new Error("#canvas is not a canvas");
        }
        return c.toDataURL("image/png");
    });
    const base64 = dataUrl.split(",", 2)[1];
    if (!base64) {
        throw new Error("canvas toDataURL did not return a PNG");
    }
    return Buffer.from(base64, "base64");
}

/**
 * Visual main-menu wait without network-idle or Playwright screenshots.
 * A long idle wait would let MAIN_MENU_TIMEOUT start intro.mve.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{ timeout?: number }} [opts]
 */
async function waitForEngineMenu(page, opts = {}) {
    const timeout = opts.timeout ?? 180_000;
    const deadline = Date.now() + timeout;
    /** @type {Buffer | null} */
    let prev = null;
    while (Date.now() < deadline) {
        const status = await page
            .locator("#status_text")
            .evaluate((el) =>
                getComputedStyle(el).opacity === "0"
                    ? ""
                    : el.textContent || "",
            )
            .catch(() => "");
        if (status.trim()) {
            prev = null;
            await page.waitForTimeout(500);
            continue;
        }
        const frame = await canvasPngFromDataUrl(page);
        if (prev) {
            const { changedRatio, nonBlackRatioB, vividRatioB } =
                await comparePngs(page, prev, frame);
            if (
                changedRatio < 0.012 &&
                nonBlackRatioB > 0.2 &&
                vividRatioB > 0.2
            ) {
                await page.waitForTimeout(2_000);
                const confirm = await canvasPngFromDataUrl(page);
                const { changedRatio: c2 } = await comparePngs(
                    page,
                    frame,
                    confirm,
                );
                if (c2 < 0.012) {
                    return confirm;
                }
            }
        }
        prev = frame;
        await page.waitForTimeout(1_000);
    }
    throw new Error(`Engine main menu did not settle in ${timeout} ms`);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} folder
 */
async function startGameFromShell(page, folder) {
    const start = page.locator(`#start_${folder}`);
    await start.waitFor({ state: "visible", timeout: 60_000 });
    const hires = page.locator(`#enable_hires_${folder}`);
    if (await hires.isChecked()) {
        await hires.uncheck();
    }
    await start.click();
    await page.locator("#canvas").waitFor({ state: "visible" });
}

for (const { folder, label } of GAMES) {
    test(`fork: hr_iface workaround starts offline from cache (${label})`, async ({
        page,
        context,
    }, testInfo) => {
        test.setTimeout(10 * 60_000);

        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

        // index.html, not "/": the candidate proxy serves "/" from upstream.
        await page.goto(`/index.html#/${folder}`);
        expect(new URL(page.url()).hostname).not.toBe("localhost");
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload();
        await page.waitForFunction(() => !!navigator.serviceWorker.controller, {
            timeout: 60_000,
        });

        await startGameFromShell(page, folder);
        const onlineMenu = await waitForEngineMenu(page, { timeout: 180_000 });
        await snap(testInfo, "01-online-main-menu", onlineMenu);

        // Hang every request that reaches the network, including SW fetches.
        // HTTP cache stays disabled so only Cache Storage can serve the three files.
        // reload(), not goto() of the same URL: goto would not navigate and the
        // in-game shell menu would stay hidden.
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await context.route("**/*", () => {});

        await page.reload({ waitUntil: "commit", timeout: 30_000 });
        await startGameFromShell(page, folder);
        const offlineMenu = await waitForEngineMenu(page, { timeout: 180_000 });
        await snap(testInfo, "02-offline-main-menu", offlineMenu);
    });
}
