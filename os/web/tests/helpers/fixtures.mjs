// Playwright `test` with two automatic fixtures for every e2e test:
// - console/page/WASM error collection, saved as console-errors.json and
//   compared with baselines/console-errors.json;
// - game data request tracking used by waitForGameDataIdle().
// Import `test` and `expect` from here instead of "@playwright/test".
import { test as base, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackGameData } from "./game.mjs";

const BASELINE_FILE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "baselines",
    "console-errors.json",
);

/** Messages that are noise and never count. Regex sources. */
const IGNORED = [
    // Fullscreen/pointer lock are refused in headless Chromium.
    "fullscreen",
    "pointer ?lock",
    "favicon",
    // Network flakes of the live site (third-party chat widget, slow requests).
    // Real game data failures surface as shell status/errors or test timeouts.
    "Failed to load resource: net::ERR_(TIMED_OUT|FAILED|CONNECTION_RESET)",
    // Live site rate-limits when several agents hit it at once.
    "Failed to load resource: the server responded with a status of 429",
    "embed\\.tawk\\.to",
];

const WASM_CRASH = /\babort\(|RuntimeError|Aborted\(|unreachable|memory access out of bounds/i;

/**
 * Turns a message into a stable "type": numbers, hex, urls and quoted names removed.
 * @param {string} text
 */
export function errorType(text) {
    return text
        .split("\n")[0]
        .replace(/https?:\/\/\S+/g, "<url>")
        .replace(/0x[0-9a-f]+/gi, "<hex>")
        .replace(/\d+/g, "<n>")
        .replace(/"[^"]*"|'[^']*'/g, "<s>")
        .trim()
        .slice(0, 200);
}

export const test = base.extend({
    errors: [
        async ({ page }, use, testInfo) => {
            /** @type {{ kind: string, text: string, type: string, wasmCrash: boolean }[]} */
            const errors = [];
            /** @param {string} kind @param {string} text */
            const add = (kind, text) => {
                if (IGNORED.some((r) => new RegExp(r, "i").test(text))) return;
                errors.push({
                    kind,
                    text,
                    type: `${kind}: ${errorType(text)}`,
                    wasmCrash: WASM_CRASH.test(text),
                });
            };
            page.on("console", (m) => {
                if (m.type() === "error") add("console.error", m.text());
            });
            page.on("pageerror", (e) =>
                add("pageerror", `${e.name}: ${e.message}`),
            );
            await page.addInitScript(() => {
                window.addEventListener("unhandledrejection", (ev) => {
                    const r = /** @type {any} */ (ev).reason;
                    console.error(
                        `unhandledrejection: ${r && r.stack ? r.stack : r}`,
                    );
                });
            });

            await use(errors);

            await fs.writeFile(
                testInfo.outputPath("console-errors.json"),
                JSON.stringify(errors, null, 2),
            );
            await testInfo.attach("console-errors", {
                path: testInfo.outputPath("console-errors.json"),
                contentType: "application/json",
            });

            const crashes = errors.filter((e) => e.wasmCrash);
            /** @type {Record<string, string[]>} */
            let baseline = {};
            try {
                baseline = JSON.parse(await fs.readFile(BASELINE_FILE, "utf8"));
            } catch {}
            const known = new Set(baseline[testInfo.title] ?? []);
            const types = [...new Set(errors.map((e) => e.type))];
            if (process.env.E2E_UPDATE_ERROR_BASELINE) {
                baseline[testInfo.title] = types.filter((t) =>
                    !errors.find((e) => e.type === t && e.wasmCrash),
                );
                await fs.writeFile(
                    BASELINE_FILE,
                    JSON.stringify(baseline, null, 2) + "\n",
                );
            }
            const fresh = types.filter((t) => !known.has(t));
            if (testInfo.status === "passed") {
                expect(crashes, "WASM crash in console").toEqual([]);
                if (!process.env.E2E_UPDATE_ERROR_BASELINE) {
                    expect(
                        fresh,
                        "new error types vs baselines/console-errors.json",
                    ).toEqual([]);
                }
            }
        },
        { auto: true },
    ],
    gameData: [
        async ({ page }, use) => {
            await use(trackGameData(page));
        },
        { auto: true },
    ],
});

export { expect };
