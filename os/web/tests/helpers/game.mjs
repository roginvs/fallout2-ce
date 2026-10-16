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
 * @returns {Promise<{ changedRatio: number, nonBlackRatioB: number, vividRatioB: number }>}
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
            let vivid = 0;
            for (let i = 0; i < ib.data.length; i += 4) {
                const r = ib.data[i];
                const g = ib.data[i + 1];
                const bl = ib.data[i + 2];
                const sum = r + g + bl;
                if (sum > 30) {
                    nonBlack++;
                }
                // Splash/grain is dark gray (sum~30-60); real menu/map art is brighter.
                if (sum > 80) {
                    vivid++;
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
                vividRatioB: vivid / total,
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
 * @param {{ timeout?: number, minBarNonBlack?: number, unlike?: Buffer, minUnlike?: number }} [opts]
 * @returns {Promise<Buffer>} stable full-frame once gameplay UI is up
 */
export async function waitForGameplay(page, opts = {}) {
    const timeout = opts.timeout ?? 480_000;
    const minBarNonBlack = opts.minBarNonBlack ?? 0.25;
    /** @type {Buffer | null} */
    const unlike = opts.unlike ?? null;
    const minUnlike = opts.minUnlike ?? 0.15;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const full = await canvasPng(page);
        if (unlike) {
            const { changedRatio: vsUnlike } = await comparePngs(
                page,
                unlike,
                full,
            );
            // Sonora Eng: INTERFACE_BAR lights on the main menu art too.
            // Stay here until the frame actually leaves the menu.
            if (vsUnlike < minUnlike) {
                await page.waitForTimeout(1_000);
                continue;
            }
        }
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
        // Enter skips slides/FMV. Do NOT send Escape: on the first map frame it
        // opens the pause menu while INTERFACE_BAR is already lit, and F4 then
        // does nothing (seen on candidate Nevada Eng).
        await pressKey(page, "Enter");
        await page.waitForTimeout(1000);
    }
    throw new Error(
        `Gameplay UI (interface bar) did not appear in ${timeout} ms`,
    );
}

/**
 * Waits until the real main menu is up. Loading splash art is often "stable"
 * while ACM paths are read from an already-fetched master.dat (no network),
 * so a single waitForStableFrame can return too early on the candidate build.
 *
 * @param {Page} page
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function waitForMainMenu(page, opts = {}) {
    const timeout = opts.timeout ?? 480_000;
    const deadline = Date.now() + timeout;
    // Prefer network quiet, but do not fail the whole wait if SFX trickle forever.
    if (trackers.has(page)) {
        try {
            await waitForGameDataIdle(page, {
                timeout: Math.min(300_000, Math.max(0, deadline - Date.now())),
                quietMs: 3_000,
            });
        } catch {
            // Fall through: still try visual settle (menu may already be up).
        }
    }
    /** @type {Buffer | null} */
    let prev = null;
    let skipTick = 0;
    while (Date.now() < deadline) {
        const frame = await canvasPng(page);
        if (prev) {
            const { changedRatio, nonBlackRatioB, vividRatioB } =
                await comparePngs(page, prev, frame);
            // Real menu is dense and stays put; splash is dark grain
            // (nonBlack~0.6 but vivid~0.07) or status text that keeps changing.
            if (
                changedRatio < 0.012 &&
                nonBlackRatioB > 0.2 &&
                vividRatioB > 0.2
            ) {
                await page.waitForTimeout(2_000);
                const confirm = await canvasPng(page);
                const { changedRatio: c2 } = await comparePngs(
                    page,
                    frame,
                    confirm,
                );
                if (c2 < 0.012) {
                    // After 120 s idle the main menu may play the intro movie
                    // (MAIN_MENU_TIMEOUT); a slow movie frame can look "stable"
                    // (Sonora Eng windmill). Do NOT probe with Space/Enter: on
                    // Sonora ru Space activates ИНТРО and then stalls on
                    // intro.mve download. A longer idle confirm distinguishes
                    // a real menu from a slow movie instead.
                    await page.waitForTimeout(5_000);
                    const probe = await canvasPng(page);
                    const { changedRatio: c3 } = await comparePngs(
                        page,
                        confirm,
                        probe,
                    );
                    if (c3 < 0.05) {
                        return probe;
                    }
                    prev = null;
                    await page.waitForTimeout(2_000);
                    continue;
                }
            } else {
                // Sonora hi-res: location splash keeps dithering (changed>0.012)
                // and never looks "settled". Space skips splash/FMV; it is not a
                // main-menu hotkey so a real menu stays put.
                skipTick += 1;
                if (skipTick % 2 === 0) {
                    await pressKey(page, "Space");
                }
            }
        }
        prev = frame;
        await page.waitForTimeout(2_000);
    }
    throw new Error(`Main menu did not settle in ${timeout} ms`);
}

export async function waitForCanvasChange(page, before, opts = {}) {
    const timeout = opts.timeout ?? 60_000;
    const minChanged = opts.minChanged ?? 0.2;
    const deadline = Date.now() + timeout;
    let last = 0;
    while (Date.now() < deadline) {
        const frame = await canvasPng(page);
        // Bound evaluate: WASM can stall the page main thread and hang comparePngs.
        const result = await Promise.race([
            comparePngs(page, before, frame).then((r) => ({ ok: true, r })),
            new Promise((resolve) =>
                setTimeout(() => resolve({ ok: false }), 15_000),
            ),
        ]);
        if (!result.ok) {
            await page.waitForTimeout(500);
            continue;
        }
        last = result.r.changedRatio;
        if (last >= minChanged) {
            return { frame, changedRatio: last };
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
    const slotName = page
        .locator(`#game_slots_${folder} .game_slot_name`)
        .nth(slot - 1);
    const nameText = ((await slotName.textContent()) || "").trim();
    if (!nameText) {
        throw new Error(
            `Slot ${slotId} has empty name — download menu item is hidden`,
        );
    }
    await page.locator(`#showmenu_${folder}_${slotId}`).click();
    const menu = page.locator("#contextMenu");
    await menu.waitFor({ state: "visible", timeout: 10_000 });
    const item = menu
        .locator(".context-menu-item")
        .filter({ hasText: /download|скачать/i });
    await item.waitFor({ state: "visible", timeout: 15_000 });
    const downloadPromise = page.waitForEvent("download");
    await item.click();
    const download = await downloadPromise;
    const target = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(target);
    return target;
}


/**
 * Imports a .tar save archive into a shell slot via the context menu file picker.
 * @param {Page} page
 * @param {string} folder
 * @param {number} slot 1..10
 * @param {string} archivePath absolute path to .tar
 */
export async function importSlot(page, folder, slot, archivePath) {
    const slotId = `SLOT${String(slot).padStart(2, "0")}`;
    await page.locator(`#showmenu_${folder}_${slotId}`).click();
    const menu = page.locator("#contextMenu");
    await menu.waitFor({ state: "visible", timeout: 10_000 });
    const item = menu
        .locator(".context-menu-item")
        .filter({ hasText: /import from file|импорт из файла/i });
    const chooserPromise = page.waitForEvent("filechooser");
    await item.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(archivePath);
    // uploadSavegame reloads the page when done
    await page.waitForLoadState("domcontentloaded");
    await page
        .locator(`#game_slots_${folder}`)
        .waitFor({ state: "visible", timeout: 60_000 });
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

/**
 * Main menu -> `n` -> premade character `t` -> controllable map.
 * Same steps as candidate-normal-save.e2e.mjs.
 *
 * @param {Page} page
 * @param {TestInfo} testInfo
 * @param {string} [prefix] screenshot name prefix
 * @returns {Promise<{ mainMenu: Buffer, inGame: Buffer }>}
 */
export async function newGameToMap(page, testInfo, prefix = "") {
    const mainMenu = await waitForMainMenu(page, { timeout: 480_000 });
    await snap(testInfo, `${prefix}main-menu`, mainMenu);
    await pressKey(page, "n");
    await waitForCanvasChange(page, mainMenu, {
        minChanged: 0.15,
        timeout: 120_000,
    });
    const charSelect = await waitForStableFrame(page, {
        minNonBlack: 0.25,
        timeout: 180_000,
    });
    await snap(testInfo, `${prefix}char-select`, charSelect);
    await pressKey(page, "t");
    await waitForCanvasChange(page, charSelect);
    const inGame = await waitForGameplay(page, {
        timeout: 480_000,
        unlike: mainMenu,
    });
    await snap(testInfo, `${prefix}in-game`, inGame);
    return { mainMenu, inGame };
}

/**
 * F4 normal save into the slot selected in the dialog (`slot` 1..10, moved
 * with ArrowDown from the first one), with a description when asked.
 * Waits until the map is back.
 *
 * @param {Page} page
 * @param {TestInfo} testInfo
 * @param {Buffer} onMap frame of the map before saving
 * @param {string} saveName
 * @param {{ prefix?: string, slot?: number }} [opts]
 * @returns {Promise<Buffer>} map frame after saving
 */
export async function normalSave(page, testInfo, onMap, saveName, opts = {}) {
    const prefix = opts.prefix ?? "";
    await pressKey(page, "F4");
    await waitForCanvasChange(page, onMap, {
        minChanged: 0.1,
        timeout: 120_000,
    });
    const dialog = await waitForStableFrame(page, { maxChanged: 0.01 });
    if (opts.slot) {
        // The dialog opens on slotdat.ini CurrentSlot; Home = first slot of
        // the page on the current engine (no-op where unsupported).
        await pressKey(page, "Home");
        await page.waitForTimeout(300);
        for (let i = 1; i < opts.slot; i++) {
            await pressKey(page, "ArrowDown");
            await page.waitForTimeout(300);
        }
    }
    await snap(testInfo, `${prefix}save-dialog`, await canvasPng(page));
    await pressKey(page, "Enter");
    await page.waitForTimeout(800);
    const afterEnter = await canvasPng(page);
    const { changedRatio: vsMap } = await comparePngs(page, onMap, afterEnter);
    if (vsMap > 0.2) {
        await page.keyboard.type(saveName, { delay: 50 });
        await page.waitForTimeout(300);
        await snap(testInfo, `${prefix}save-description`, await canvasPng(page));
        await page.keyboard.press("Enter");
    }
    const deadline = Date.now() + 480_000;
    let after = await canvasPng(page);
    let repress = 0;
    let nextEnterAt = Date.now() + 5_000;
    while (Date.now() < deadline) {
        const { changedRatio } = await comparePngs(page, onMap, after);
        if (changedRatio < 0.4) break;
        if (repress < 5 && Date.now() >= nextEnterAt) {
            await page.keyboard.press("Enter");
            repress += 1;
            nextEnterAt = Date.now() + 5_000;
        }
        await page.waitForTimeout(1000);
        after = await canvasPng(page);
    }
    const { changedRatio } = await comparePngs(page, onMap, after);
    if (changedRatio >= 0.4) {
        throw new Error("still in save UI after confirm");
    }
    void dialog;
    const afterSave = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.01,
        timeout: 180_000,
    });
    await snap(testInfo, `${prefix}after-save`, afterSave);
    return afterSave;
}

/**
 * Main menu `l` -> pick `slot` (ArrowDown from the first) -> Enter until the
 * load dialog is gone -> stable map with a lit interface bar.
 *
 * @param {Page} page
 * @param {TestInfo} testInfo
 * @param {{ prefix?: string, slot?: number }} [opts]
 * @returns {Promise<Buffer>} loaded map frame
 */
export async function loadFromMainMenu(page, testInfo, opts = {}) {
    const prefix = opts.prefix ?? "";
    const menu = await waitForMainMenu(page, { timeout: 480_000 });
    await snap(testInfo, `${prefix}main-menu`, menu);
    await pressKey(page, "l");
    await waitForCanvasChange(page, menu, {
        minChanged: 0.1,
        timeout: 120_000,
    });
    await waitForStableFrame(page, { maxChanged: 0.01 });
    if (opts.slot) {
        // The dialog opens on slotdat.ini CurrentSlot; Home = first slot of
        // the page on the current engine (no-op where unsupported).
        await pressKey(page, "Home");
        await page.waitForTimeout(300);
        for (let i = 1; i < opts.slot; i++) {
            await pressKey(page, "ArrowDown");
            await page.waitForTimeout(300);
        }
    }
    await waitForGameDataIdle(page, { timeout: 180_000 });
    const loadDialog = await canvasPng(page);
    await snap(testInfo, `${prefix}load-dialog`, loadDialog);
    await page.keyboard.press("Enter");
    const deadline = Date.now() + 480_000;
    let left = false;
    let enters = 1;
    while (Date.now() < deadline) {
        const frame = await canvasPng(page);
        const { changedRatio } = await comparePngs(page, loadDialog, frame);
        if (changedRatio > 0.35) {
            left = true;
            break;
        }
        if (enters < 6) {
            await page.keyboard.press("Enter");
            enters += 1;
        }
        await page.waitForTimeout(2_000);
    }
    if (!left) throw new Error("still on load dialog after Enter");
    const loaded = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.01,
        timeout: 480_000,
    });
    await snap(testInfo, `${prefix}loaded`, loaded);
    const bar = await canvasPng(page, INTERFACE_BAR);
    const { nonBlackRatioB } = await comparePngs(page, bar, bar);
    if (nonBlackRatioB < 0.25) {
        throw new Error("interface bar is dark after load: not on a map");
    }
    return loaded;
}
