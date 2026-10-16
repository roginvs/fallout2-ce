// SAVE.DAT with trailing bytes still loads; the display monitor shows a warning.
// Control: the same save without extra bytes loads with the monitor unchanged.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    launchGameRetry,
    loadFromMainMenu,
    newGameToMap,
    normalSave,
    snap,
    waitForMainMenu,
} from "../helpers/game.mjs";

test.beforeAll(() => {
    test.skip(
        !process.env.E2E_CANDIDATE_DIR,
        "set E2E_CANDIDATE_DIR to a local Release web build (e.g. build/web)",
    );
});

const FOLDER = "FalloutNevadaEng";
// Display monitor inside the 640x480 interface bar (display_monitor.cc).
const MONITOR = { x: 23 / 640, y: (379 + 24) / 480, w: 167 / 640, h: 60 / 480 };

test("SAVE.DAT with unread data loads with a monitor warning", async ({
    page,
}, testInfo) => {
    test.setTimeout(30 * 60_000);
    await launchGameRetry(page, FOLDER);
    const { inGame } = await newGameToMap(page, testInfo, "01-");
    await normalSave(page, testInfo, inGame, "leftover");

    await page.reload();
    await launchGameRetry(page, FOLDER);
    await loadFromMainMenu(page, testInfo, { prefix: "02-clean-" });
    await page.waitForTimeout(1000);
    const clean = await canvasPng(page, MONITOR);
    await snap(testInfo, "02-clean-monitor", clean);

    await page.reload();
    await launchGameRetry(page, FOLDER);
    await waitForMainMenu(page, { timeout: 480_000 });
    const size = await page.evaluate(async (folder) => {
        const FS = /** @type {any} */ (window).FS;
        const p = `/${folder}/data/SAVEGAME/SLOT01/SAVE.DAT`;
        const data = FS.readFile(p);
        const out = new Uint8Array(data.length + 16).fill(0x5a);
        out.set(data);
        FS.writeFile(p, out);
        return FS.stat(p).size - data.length;
    }, FOLDER);
    expect(size).toBe(16);
    await loadFromMainMenu(page, testInfo, { prefix: "03-tampered-" });
    await page.waitForTimeout(1000);
    const tampered = await canvasPng(page, MONITOR);
    await snap(testInfo, "03-tampered-monitor", tampered);

    const { changedRatio } = await comparePngs(page, clean, tampered);
    expect(
        changedRatio,
        "warning text should appear on the monitor",
    ).toBeGreaterThan(0.01);
});
