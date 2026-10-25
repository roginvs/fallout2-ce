import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";

const EMPTY_WASM = Buffer.from("0061736d01000000", "hex");

async function startBeforeWasm(page) {
    await page.route("**/wasm-startup-harness", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: '<div id="status_text"></div><div id="error_text"></div><canvas id="canvas"></canvas>',
        }),
    );
    await page.route("**/fallout2-ce.js", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body: `
                window.findWasmBinary = () => "/engine.wasm";
                Module.instantiateWasm({ env: {} }, () => {
                    window.engineReady = true;
                });
            `,
        }),
    );
    await page.route("**/game/Test/index.txt.gz*", (route) =>
        route.fulfill({ body: gzipSync("") }),
    );
    await page.goto("/wasm-startup-harness");
    await page.evaluate(async () => {
        const { loadEmscripten } = await import("/wasm.mjs");
        await loadEmscripten();
        // This is where index.mjs renders the early menu.
        document.body.insertAdjacentHTML("beforeend", "<button>Start</button>");
        window.FS = {
            chdir() {
                window.fsStartedWithReady = !!window.engineReady;
                throw new Error("filesystem reached");
            },
        };
        const { initFilesystem } = await import("/initFilesystem.mjs");
        window.startResult = "pending";
        initFilesystem("Test", "1", async (index) => index, null).catch(
            (error) => {
                window.startResult = error.message;
            },
        );
    });
}

test("early menu and index fetch do not wait for WASM, filesystem startup does", async ({
    page,
}) => {
    let releaseWasm;
    const wasmResponse = new Promise((resolve) => {
        releaseWasm = resolve;
    });
    await page.route("**/engine.wasm", async (route) => {
        await wasmResponse;
        await route.fulfill({ body: EMPTY_WASM });
    });
    await startBeforeWasm(page);
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    await expect(page.locator("#status_text")).toHaveText(
        "Waiting for game engine",
    );
    expect(
        await page.evaluate(() => ({
            result: window.startResult,
            filesystemStarted: window.fsStartedWithReady,
        })),
    ).toEqual({ result: "pending", filesystemStarted: undefined });

    releaseWasm();
    await expect
        .poll(() => page.evaluate(() => window.startResult))
        .toBe("filesystem reached");
    expect(await page.evaluate(() => window.fsStartedWithReady)).toBe(true);
});

for (const failure of ["download", "compilation"]) {
    test(`WASM ${failure} failure rejects waiting startup without touching files`, async ({
        page,
    }) => {
        await page.route("**/engine.wasm", (route) =>
            route.fulfill({
                status: failure === "download" ? 503 : 200,
                body: "not a WASM module",
            }),
        );
        await startBeforeWasm(page);
        await expect
            .poll(() => page.evaluate(() => window.startResult))
            .not.toBe("pending");
        expect(await page.evaluate(() => window.startResult)).toMatch(
            failure === "download" ? /Status is >=300/ : /WebAssembly|magic/i,
        );
        expect(await page.evaluate(() => window.fsStartedWithReady)).toBe(
            undefined,
        );
    });
}
