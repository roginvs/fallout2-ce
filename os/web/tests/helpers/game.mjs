// Reusable helpers for end-to-end tests of the web shell.
// The game draws into one <canvas>, so every check is made on canvas pixels.

/** @typedef {import("@playwright/test").Page} Page */
/** @typedef {import("@playwright/test").TestInfo} TestInfo */

/**
 * Opens the shell for one game and presses its start button.
 * Hi-res is switched off so the canvas is always 640x480 and coordinates stay stable.
 *
 * @param {Page} page
 * @param {string} folder e.g. "FalloutNevadaEng"
 */
export async function launchGame(page, folder) {
    await page.goto(`/#/${folder}`);
    const start = page.locator(`#start_${folder}`);
    await start.waitFor({ state: "visible" });
    const hires = page.locator(`#enable_hires_${folder}`);
    if (await hires.isChecked()) {
        await hires.uncheck();
    }
    await start.click();
    await page.locator("#canvas").waitFor({ state: "visible" });
}

/**
 * launchGame with retries for live/proxy navigation flakes.
 * @param {Page} page
 * @param {string} folder
 * @param {{ attempts?: number }} [opts]
 */
export async function launchGameRetry(page, folder, opts = {}) {
    const attempts = opts.attempts ?? 5;
    page.setDefaultNavigationTimeout(90_000);
    let last;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await launchGame(page, folder);
            return;
        } catch (e) {
            last = e;
            const msg = String(e && /** @type {any} */ (e).message ? /** @type {any} */ (e).message : e);
            if (!/ERR_TIMED_OUT|Timeout|net::ERR_/i.test(msg) || attempt === attempts) {
                throw e;
            }
            await page.waitForTimeout(3000 * attempt);
        }
    }
    throw last;
}

/**
 * File paths inside a ustar archive (files only).
 * @param {string} archivePath
 * @returns {Promise<string[]>}
 */
export async function listTarPaths(archivePath) {
    const fs = await import("node:fs/promises");
    const buf = new Uint8Array(await fs.readFile(archivePath));
    const paths = [];
    let rest = buf;
    while (rest.length >= 512) {
        const header = rest.subarray(0, 512);
        if (header.every((b) => b === 0)) break;
        const nameEnd = header.indexOf(0);
        const name = String.fromCharCode(
            ...header.subarray(0, nameEnd < 0 ? 100 : Math.min(100, nameEnd)),
        );
        const sizeStr = String.fromCharCode(...header.subarray(124, 136))
            .replace(/\0/g, "")
            .trim();
        const fileSize = parseInt(sizeStr, 8) || 0;
        const typeFlag = header[156];
        const isFile = typeFlag === 0 || typeFlag === 48;
        if (name && isFile) paths.push(name);
        const padded = fileSize + ((512 - (fileSize % 512)) % 512);
        rest = rest.subarray(512 + padded);
    }
    return paths;
}

/**
 * Screenshot of #canvas, or only of `region` (fractions of the canvas size).
 *
 * @param {Page} page
 * @param {{ x: number, y: number, w: number, h: number }} [region]
 * @returns {Promise<Buffer>}
 */
export async function canvasPng(page, region) {
    if (!region) {
        return page.locator("#canvas").screenshot({ animations: "disabled" });
    }
    const box = await page.locator("#canvas").boundingBox();
    if (!box) throw new Error("#canvas has no bounding box");
    return page.screenshot({
        animations: "disabled",
        clip: {
            x: box.x + box.width * region.x,
            y: box.y + box.height * region.y,
            width: box.width * region.w,
            height: box.height * region.h,
        },
    });
}

/**
 * Compares two PNG screenshots inside the browser and returns pixel stats.
 *
 * @param {Page} page
 * @param {Buffer} a
 * @param {Buffer} b
 * @returns {Promise<{ changedRatio: number, nonBlackRatioB: number }>}
 */
export async function comparePngs(page, a, b) {
    return page.evaluate(
        async ([a64, b64]) => {
            /** @param {string} s */
            const decode = async (s) => {
                const blob = await (
                    await fetch(`data:image/png;base64,${s}`)
                ).blob();
                const bmp = await createImageBitmap(blob);
                const c = new OffscreenCanvas(bmp.width, bmp.height);
                const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (
                    c.getContext("2d")
                );
                ctx.drawImage(bmp, 0, 0);
                return ctx.getImageData(0, 0, bmp.width, bmp.height);
            };
            const [ia, ib] = await Promise.all([decode(a64), decode(b64)]);
            const total = ib.width * ib.height;
            let changed = 0;
            let nonBlack = 0;
            for (let i = 0; i < ib.data.length; i += 4) {
                const r = ib.data[i];
                const g = ib.data[i + 1];
                const bl = ib.data[i + 2];
                if (r + g + bl > 30) {
                    nonBlack++;
                }
                if (
                    ia.width !== ib.width ||
                    ia.height !== ib.height ||
                    Math.abs(ia.data[i] - r) > 8 ||
                    Math.abs(ia.data[i + 1] - g) > 8 ||
                    Math.abs(ia.data[i + 2] - bl) > 8
                ) {
                    changed++;
                }
            }
            return {
                changedRatio: changed / total,
                nonBlackRatioB: nonBlack / total,
            };
        },
        [a.toString("base64"), b.toString("base64")],
    );
}

/**
 * Waits until the canvas shows a picture (enough non-black pixels) that stays
 * the same between two consecutive shots. Use it after loading screens.
 *
 * @param {Page} page
 * Animated maps never give identical frames, raise `maxChanged` for them.
 *
 * @param {{ timeout?: number, interval?: number, minNonBlack?: number, maxChanged?: number, skipLoadWait?: boolean, region?: { x: number, y: number, w: number, h: number } }} [opts]
 * `region` checks stability only there (e.g. INTERFACE_BAR on animated maps); the full frame is returned.
 * @returns {Promise<Buffer>} the stable frame
 */
/** Bottom interface bar on the 640x480 map screen (y 379..480). */
export const INTERFACE_BAR = { x: 0, y: 379 / 480, w: 1, h: 101 / 480 };

export async function waitForStableFrame(page, opts = {}) {
    if (trackers.has(page) && !opts.skipLoadWait) {
        await waitForGameDataIdle(page, { timeout: opts.timeout });
    }
    const timeout = opts.timeout ?? 180_000;
    const interval = opts.interval ?? 1_000;
    const minNonBlack = opts.minNonBlack ?? 0.1;
    const maxChanged = opts.maxChanged ?? 0.002;
    const deadline = Date.now() + timeout;
    let prev = await canvasPng(page, opts.region);
    while (Date.now() < deadline) {
        await page.waitForTimeout(interval);
        const cur = await canvasPng(page, opts.region);
        const { changedRatio, nonBlackRatioB } = await comparePngs(
            page,
            prev,
            cur,
        );
        const loading =
            trackers.has(page) &&
            !opts.skipLoadWait &&
            (trackers.get(page)?.pending.size ?? 0) > 0;
        if (
            !loading &&
            nonBlackRatioB >= minNonBlack &&
            changedRatio < maxChanged
        ) {
            return opts.region ? canvasPng(page) : cur;
        }
        prev = cur;
    }
    throw new Error(`Canvas did not settle on a picture in ${timeout} ms`);
}

/**
 * Waits until the canvas differs from `before` by at least `minChanged` of pixels.
 *
 * @param {Page} page
 * @param {Buffer} before
 * @param {{ timeout?: number, minChanged?: number }} [opts]
 * @returns {Promise<{ frame: Buffer, changedRatio: number }>}
 */
/**
 * After "Take" / new game: skip intro slides/movies until the bottom interface
 * bar is lit (real map UI). Slideshows leave that bar nearly black, so
 * waitForStableFrame alone can return too early (seen on FalloutOfNevada).
 *
 * @param {Page} page
 * @param {{ timeout?: number, minBarNonBlack?: number }} [opts]
 * @returns {Promise<Buffer>} stable full-frame once gameplay UI is up
 */
export async function waitForGameplay(page, opts = {}) {
    const timeout = opts.timeout ?? 480_000;
    const minBarNonBlack = opts.minBarNonBlack ?? 0.25;
    const deadline = Date.now() + timeout;
    let skipTick = 0;
    while (Date.now() < deadline) {
        const bar = await canvasPng(page, INTERFACE_BAR);
        // compare against itself just to get nonBlackRatioB
        const { nonBlackRatioB } = await comparePngs(page, bar, bar);
        if (nonBlackRatioB >= minBarNonBlack) {
            return waitForStableFrame(page, {
                region: INTERFACE_BAR,
                maxChanged: 0.01,
                timeout: Math.max(30_000, deadline - Date.now()),
                skipLoadWait: true,
            });
        }
        skipTick += 1;
        // Escape/Enter skip narrated intros on Nevada/Sonora builds.
        if (skipTick % 2 === 1) {
            await pressKey(page, "Escape");
        } else {
            await pressKey(page, "Enter");
        }
        await page.waitForTimeout(1000);
    }
    throw new Error(
        `Gameplay UI (interface bar) did not appear in ${timeout} ms`,
    );
}

export async function waitForCanvasChange(page, before, opts = {}) {
    const timeout = opts.timeout ?? 60_000;
    const minChanged = opts.minChanged ?? 0.2;
    const deadline = Date.now() + timeout;
    let last = 0;
    while (Date.now() < deadline) {
        const frame = await canvasPng(page);
        const { changedRatio } = await comparePngs(page, before, frame);
        last = changedRatio;
        if (changedRatio >= minChanged) {
            return { frame, changedRatio };
        }
        await page.waitForTimeout(500);
    }
    throw new Error(
        `Canvas changed only ${(last * 100).toFixed(1)}% in ${timeout} ms`,
    );
}

/**
 * Saves a PNG into the test output folder (test-results/...) and attaches it to the report.
 *
 * @param {TestInfo} testInfo
 * @param {string} name file name without extension
 * @param {Buffer} png
 */
export async function snap(testInfo, name, png) {
    await testInfo.attach(name, { body: png, contentType: "image/png" });
    const fs = await import("node:fs/promises");
    await fs.writeFile(testInfo.outputPath(`${name}.png`), png);
}

/**
 * Presses a key the way SDL sees it: real keydown/keyup on the focused page.
 *
 * @param {Page} page
 * @param {string} key Playwright key name: "n", "t", "Enter", "F6", "Escape"...
 */
export async function pressKey(page, key) {
    await page.keyboard.down(key);
    await page.waitForTimeout(80);
    await page.keyboard.up(key);
}

/**
 * Opens the slot context menu in the shell menu and downloads the slot archive.
 * The shell menu must be visible (reload the page after leaving the game).
 *
 * @param {Page} page
 * @param {string} folder
 * @param {number} slot 1..10
 * @param {TestInfo} testInfo
 * @returns {Promise<string>} path of the saved archive inside test-results
 */
export async function downloadSlot(page, folder, slot, testInfo) {
    const slotId = `SLOT${String(slot).padStart(2, "0")}`;
    await page.locator(`#showmenu_${folder}_${slotId}`).click();
    const item = page
        .locator("#contextMenu .context-menu-item")
        .filter({ hasText: /download|скачать/i });
    await item.waitFor({ state: "visible", timeout: 10_000 });
    const downloadPromise = page.waitForEvent("download");
    await item.click();
    const download = await downloadPromise;
    const target = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(target);
    return target;
}

/** @type {WeakMap<Page, { pending: Map<any, string>, lastFinished: string, lastActivity: number }>} */
const trackers = new WeakMap();

/** @param {string} url */
function isGameData(url) {
    return /\/game\/|\.dat(\.gz)?(\?|$)/i.test(url);
}

/**
 * Starts tracking game data requests (`/game/...`, `*.dat`) on the page.
 * The e2e fixture in fixtures.mjs calls it for every test.
 *
 * @param {Page} page
 */
export function trackGameData(page) {
    const t = { pending: new Map(), lastFinished: "", lastActivity: Date.now() };
    trackers.set(page, t);
    page.on("request", (r) => {
        if (!isGameData(r.url())) return;
        t.pending.set(r, r.url());
        t.lastActivity = Date.now();
    });
    /** @param {any} r */
    const done = (r) => {
        if (!t.pending.delete(r)) return;
        t.lastFinished = r.url();
        t.lastActivity = Date.now();
    };
    page.on("requestfinished", done);
    page.on("requestfailed", done);
    return t;
}

/**
 * Waits until the shell's top status line (#status_text, file name + percent while
 * downloading) is hidden and no game data request was active for `quietMs`.
 * On timeout throws with the status text, last finished file and pending requests.
 *
 * @param {Page} page
 * @param {{ timeout?: number, quietMs?: number }} [opts]
 */
export async function waitForGameDataIdle(page, opts = {}) {
    const timeout = opts.timeout ?? 180_000;
    const quietMs = opts.quietMs ?? 2_000;
    const t = trackers.get(page);
    if (!t) throw new Error("trackGameData(page) was not called");
    const deadline = Date.now() + timeout;
    let status = "";
    while (Date.now() < deadline) {
        status = await page
            .locator("#status_text")
            .evaluate((el) =>
                getComputedStyle(el).opacity === "0" ? "" : el.textContent || "",
            )
            .catch(() => "");
        if (
            !status.trim() &&
            t.pending.size === 0 &&
            Date.now() - t.lastActivity >= quietMs
        ) {
            return;
        }
        await page.waitForTimeout(250);
    }
    throw new Error(
        `Game data still loading after ${timeout} ms. ` +
            `Status: "${status}". Last loaded: ${t.lastFinished || "none"}. ` +
            `Pending: ${[...t.pending.values()].join(", ") || "none"}`,
    );
}
