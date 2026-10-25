import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";

const EMPTY_WASM = Buffer.from("0061736d01000000", "hex");
const START = "#start_FalloutNevadaEng";

async function openMenu(page, deferInstantiation = false) {
    await page.route("**/wasm-startup-harness", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: '<div id="menu"><div id="menu_content"></div></div><div id="status_text"></div><div id="error_text"></div><div><canvas id="canvas"></canvas></div>',
        }),
    );
    await page.route("**/fallout2-ce.js", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body: `
                window.findWasmBinary = () => "/engine.wasm";
                window.beginInstantiation = () => Module.instantiateWasm({ env: {} }, () => {
                    window.engineReady = true;
                });
                ${deferInstantiation ? "" : "beginInstantiation();"}
            `,
        }),
    );
    const index = [
        "ddraw.ini",
        "fallout2.cfg",
        "data/art/intrface/hr_ifacelft2.frm",
        "data/art/intrface/hr_ifacerht2.frm",
        "data/art/intrface/HR_IFACE_800.frm",
    ]
        .map((name) => `0 ${"0".repeat(64)} ${name}`)
        .join("\n");
    await page.route("**/game/FalloutNevadaEng/index.txt.gz*", (route) =>
        route.fulfill({ body: gzipSync(index) }),
    );
    await page.goto("/wasm-startup-harness#/FalloutNevadaEng");
    await page.evaluate(async () => {
        const { loadEmscripten, waitForWasm } = await import("/wasm.mjs");
        // Call before even loading the generated JavaScript.
        window.earlyWait = "pending";
        waitForWasm().then(
            () => {
                window.earlyWait = "ready";
            },
            () => {
                window.earlyWait = "failed";
            },
        );
        window.FS = {
            chdir() {
                window.fsStartedWithReady = !!window.engineReady;
                throw new Error("filesystem reached");
            },
        };
        await loadEmscripten();
        const { renderMenu } = await import("/mainmenu.mjs");
        renderMenu();
    });
    await expect(page.locator(START)).toBeVisible();
}

test("early menu can start waiting before WASM initialization begins", async ({
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
    await openMenu(page, true);
    await page.locator(START).click();
    await expect(page.locator("#status_text")).toHaveText(
        "Waiting for game engine",
    );
    expect(await page.evaluate(() => window.earlyWait)).toBe("pending");
    expect(
        await page.evaluate(() => window.fsStartedWithReady),
    ).toBeUndefined();
    await page.evaluate(() => window.beginInstantiation());
    expect(
        await page.evaluate(() => window.fsStartedWithReady),
    ).toBeUndefined();
    releaseWasm();
    await expect(page.locator("#error_text")).toContainText(
        "filesystem reached",
    );
    expect(await page.evaluate(() => window.earlyWait)).toBe("ready");
    expect(await page.evaluate(() => window.fsStartedWithReady)).toBe(true);
});

test("Start and waitForWasm also work after WASM is already ready", async ({
    page,
}) => {
    await page.route("**/engine.wasm", (route) =>
        route.fulfill({ body: EMPTY_WASM }),
    );
    await openMenu(page);
    await expect
        .poll(() => page.evaluate(() => window.earlyWait))
        .toBe("ready");
    await page.evaluate(async () => {
        await (await import("/wasm.mjs")).waitForWasm();
    });
    await page.locator(START).click();
    await expect(page.locator("#error_text")).toContainText(
        "filesystem reached",
    );
    expect(await page.evaluate(() => window.fsStartedWithReady)).toBe(true);
});

for (const failure of ["download", "compilation"]) {
    test(`WASM ${failure} failure rejects early and late waiters without touching files`, async ({
        page,
    }) => {
        await page.route("**/engine.wasm", (route) =>
            route.fulfill({
                status: failure === "download" ? 503 : 200,
                body: "not a WASM module",
            }),
        );
        await openMenu(page);
        await expect
            .poll(() => page.evaluate(() => window.earlyWait))
            .toBe("failed");
        await page.locator(START).click();
        await expect(page.locator("#error_text")).toContainText(
            failure === "download" ? "Status is >=300" : /WebAssembly|magic/i,
        );
        expect(
            await page.evaluate(() => window.fsStartedWithReady),
        ).toBeUndefined();
    });
}

test("JavaScript download failure also rejects an early WASM waiter", async ({
    page,
}) => {
    await page.route("**/wasm-startup-harness", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: '<div id="status_text"></div><div id="error_text"></div><canvas id="canvas"></canvas>',
        }),
    );
    await page.goto("/wasm-startup-harness");
    await page.route("**/fallout2-ce.js", (route) => route.abort());
    const result = await page.evaluate(async () => {
        const { loadEmscripten, waitForWasm } = await import("/wasm.mjs");
        const waiting = waitForWasm().then(
            () => "unexpected success",
            () => "rejected",
        );
        try {
            await loadEmscripten();
        } catch {}
        return waiting;
    });
    expect(result).toBe("rejected");
});
