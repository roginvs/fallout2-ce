// Section 8 (save finalization): an IndexedDB write failure during a normal
// save is reported (alert from write_idbfs / reportIdbfsWriteError), never
// logged as "IDBFS saved", the engine does not report success
// (do_save_idbfs_loadsave returns 1) and nothing is persisted: after a page
// reload the slot is empty. The failure is injected only in this test by
// wrapping IDBFS.syncfs for writes (populate=false).
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

const FOLDER = "FalloutNevadaEng";
const INJECTED = "e2e injected IDBFS failure";

test("section 8: IDBFS write failure during save is reported, not persisted", async ({
    page,
}, testInfo) => {
    test.setTimeout(20 * 60_000);
    /** @type {string[]} */
    const alerts = [];
    page.on("dialog", (d) => {
        alerts.push(d.message());
        d.accept().catch(() => {});
    });
    let injected = false;
    /** @type {string[]} */
    const savedLogs = [];
    page.on("console", (m) => {
        if (injected && m.text().includes("IDBFS saved"))
            savedLogs.push(m.text());
    });

    await launchGameRetry(page, FOLDER);
    const { inGame } = await newGameToMap(page, testInfo, "01-");

    await page.evaluate((msg) => {
        const idbfs = /** @type {any} */ (window).IDBFS;
        const original = idbfs.syncfs;
        idbfs.syncfs = (
            /** @type {any} */ mount,
            /** @type {boolean} */ populate,
            /** @type {(e?: unknown) => void} */ cb,
        ) =>
            populate
                ? original(mount, populate, cb)
                : setTimeout(() => cb(new Error(msg)), 0);
    }, INJECTED);
    injected = true;

    await pressKey(page, "F4");
    await waitForCanvasChange(page, inGame, {
        minChanged: 0.1,
        timeout: 120_000,
    });
    await waitForStableFrame(page, { maxChanged: 0.01 });
    await pressKey(page, "Enter");
    await page.waitForTimeout(800);
    if (
        (await comparePngs(page, inGame, await canvasPng(page))).changedRatio >
        0.2
    ) {
        await page.keyboard.type("e2e-idbfs-fail", { delay: 50 });
        await page.keyboard.press("Enter");
    }
    await expect
        .poll(() => alerts.length, { timeout: 120_000 })
        .toBeGreaterThan(0);
    expect(alerts[0]).toBe(`IDBFS save failed: ${INJECTED}`);
    await page.waitForTimeout(2_000);
    await snap(testInfo, "02-after-failed-save", await canvasPng(page));

    // Leave the error box / save dialog with Escape until the map is back.
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const frame = await canvasPng(page);
        if ((await comparePngs(page, inGame, frame)).changedRatio < 0.4) break;
        await pressKey(page, "Escape");
        await page.waitForTimeout(1_500);
    }
    const back = await canvasPng(page);
    await snap(testInfo, "03-back-on-map", back);
    expect((await comparePngs(page, inGame, back)).changedRatio).toBeLessThan(
        0.4,
    );
    expect(savedLogs, "no 'IDBFS saved' after a failed write").toEqual([]);

    // Nothing reached IndexedDB: the shell shows slot 1 empty after reload.
    await page.reload();
    const slot1 = page.locator(`#game_slots_${FOLDER} .game_slot_name`).first();
    await slot1.waitFor({ state: "attached", timeout: 30_000 });
    await expect(slot1).toHaveText("");
    await testInfo.attach("alerts.json", {
        body: JSON.stringify(alerts, null, 2),
        contentType: "application/json",
    });
});
