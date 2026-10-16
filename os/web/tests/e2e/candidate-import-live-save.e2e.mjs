// Section 7A: normal (F4) or first quick (F6) save on the published engine (E2E_LIVE_URL, default the
// live site; a non-candidate caching proxy keeps the same engine/data) ->
// download .tar -> import into the candidate (baseURL, E2E_CANDIDATE_DIR) ->
// load -> new candidate save in slot 2 -> reload -> download (SAVE.DAT, ce.sav,
// nested proto/) -> load slot 2.
import { expect, test } from "../helpers/fixtures.mjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
    comparePngs,
    downloadSlot,
    importSlot,
    launchGameRetry,
    listTarPaths,
    loadFromMainMenu,
    newGameToMap,
    normalSave,
} from "../helpers/game.mjs";
import { ALL_GAMES } from "../helpers/games.mjs";

const LIVE = process.env.E2E_LIVE_URL || "https://fallout-nevada.ru/";
const ARTIFACTS =
    process.env.E2E_ARTIFACTS_DIR || "/workspace/artifacts/merge-audit";

test.beforeAll(() => {
    test.skip(
        !process.env.E2E_CANDIDATE_DIR,
        "set E2E_CANDIDATE_DIR (candidate JS/WASM) and E2E_USE_CACHE_PROXY=1",
    );
});

/** @param {string} name */
const nameRe = (name) => new RegExp(`^(${name}|No name|Нет имени)$`, "i");

/**
 * Keeps the published-engine archive outside git with its SHA-256.
 * @param {string} folder @param {string} file @param {string} kind
 */
async function keepArchive(folder, file, kind) {
    const buf = await fs.readFile(file);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    const dir = path.join(ARTIFACTS, folder, kind);
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(dir, `${stamp}-${path.basename(file)}`);
    await fs.copyFile(file, target);
    await fs.appendFile(
        path.join(dir, "manifest.txt"),
        `${sha}  ${path.basename(target)}  ${(await listTarPaths(file)).join(",")}\n`,
    );
    return sha;
}

const KINDS = /** @type {const} */ ([
    { kind: "normal", key: "F4", suffix: "" },
    { kind: "quick", key: "F6", suffix: "q" },
]);

for (const { folder, label, tag } of ALL_GAMES) {
    for (const { kind, key, suffix } of KINDS) {
        test(`7A import published-engine ${kind} save into candidate and load (${label})`, async ({
            page,
        }, testInfo) => {
            test.setTimeout(40 * 60_000);
            page.setDefaultNavigationTimeout(90_000);
            const liveName = `audit-${tag}-7a${suffix}`;
            const candName = `audit-${tag}-7a-new`;

            // --- published engine: new game, save to slot 1, download ---
            await page.goto(`${LIVE.replace(/\/$/, "")}/#/${folder}`);
            const start = page.locator(`#start_${folder}`);
            await start.waitFor({ state: "visible", timeout: 60_000 });
            const hires = page.locator(`#enable_hires_${folder}`);
            if (await hires.isChecked()) await hires.uncheck();
            await start.click();
            await page.locator("#canvas").waitFor({ state: "visible" });
            const { inGame } = await newGameToMap(page, testInfo, "live-01-");
            const liveSaved = await normalSave(
                page,
                testInfo,
                inGame,
                liveName,
                {
                    prefix: "live-02-",
                    key,
                },
            );
            await page.reload();
            await expect(
                page.locator(`#game_slots_${folder} .game_slot_name`).first(),
            ).toHaveText(nameRe(liveName), { timeout: 30_000 });
            const liveArchive = await downloadSlot(page, folder, 1, testInfo);
            const livePaths = await listTarPaths(liveArchive);
            expect(livePaths.some((p) => /(^|\/)SAVE\.DAT$/.test(p))).toBe(
                true,
            );
            const sha = await keepArchive(
                folder,
                liveArchive,
                `baseline-${kind}`,
            );
            await testInfo.attach("live-archive.txt", {
                body: `${sha}\n${livePaths.join("\n")}`,
                contentType: "text/plain",
            });

            // --- candidate: import into slot 1, load it ---
            await page.goto(`/#/${folder}`);
            await page
                .locator(`#game_slots_${folder}`)
                .waitFor({ state: "visible", timeout: 60_000 });
            await importSlot(page, folder, 1, liveArchive);
            await expect(
                page.locator(`#game_slots_${folder} .game_slot_name`).first(),
            ).toHaveText(nameRe(liveName), { timeout: 30_000 });
            await launchGameRetry(page, folder);
            const loaded = await loadFromMainMenu(page, testInfo, {
                prefix: "cand-03-",
                slot: 1,
            });
            const vsLive = await comparePngs(page, liveSaved, loaded);
            expect(
                vsLive.changedRatio,
                "imported save should show the same map as when saved",
            ).toBeLessThan(0.5);

            // --- candidate: new save into slot 2, reload, download, load ---
            const candSaved = await normalSave(
                page,
                testInfo,
                loaded,
                candName,
                {
                    prefix: "cand-04-",
                    slot: 2,
                },
            );
            await page.reload();
            const slot2 = page
                .locator(`#game_slots_${folder} .game_slot_name`)
                .nth(1);
            await expect(slot2).toHaveText(nameRe(candName), {
                timeout: 30_000,
            });
            const candArchive = await downloadSlot(page, folder, 2, testInfo);
            const candPaths = await listTarPaths(candArchive);
            await testInfo.attach("candidate-archive.txt", {
                body: candPaths.join("\n"),
                contentType: "text/plain",
            });
            expect(candPaths.some((p) => /(^|\/)SAVE\.DAT$/.test(p))).toBe(
                true,
            );
            // The shell export must take the new engine's ce.sav and the
            // nested proto/ files of the slot.
            expect(candPaths.some((p) => /(^|\/)ce\.sav$/.test(p))).toBe(true);
            expect(
                candPaths.some((p) =>
                    /(^|\/)proto\/[^/]+\/[^/]+\.pro$/.test(p),
                ),
            ).toBe(true);
            await launchGameRetry(page, folder);
            const reloaded = await loadFromMainMenu(page, testInfo, {
                prefix: "cand-05-",
                slot: 2,
            });
            const vsCand = await comparePngs(page, candSaved, reloaded);
            expect(vsCand.changedRatio).toBeLessThan(0.5);
        });
    }
}
