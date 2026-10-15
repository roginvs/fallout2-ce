import { expect, test } from "@playwright/test";

async function openHarness(page) {
    await page.goto("/tests/harness.html");
}

test("syncfs error is forwarded once and is not a successful save", async ({
    page,
}) => {
    await openHarness(page);
    const result = await page.evaluate(async () => {
        const mod = await import("/initFilesystem.mjs");
        const calls = [];
        const idbfs = {
            syncfs(_mount, _populate, callback) {
                callback(new Error("disk full"));
            },
        };
        mod.installIdbfsSyncfsWrapper(idbfs);
        await new Promise((resolve) => {
            idbfs.syncfs({}, false, (err) => {
                calls.push(err ? String(err.message || err) : null);
                resolve(null);
            });
        });
        return calls;
    });
    expect(result).toEqual(["disk full"]);
});

test("persist refusal is not reported as a failed sync", async ({ page }) => {
    await openHarness(page);
    const result = await page.evaluate(async () => {
        const mod = await import("/initFilesystem.mjs");
        const idbfs = {
            syncfs(_mount, _populate, callback) {
                callback();
            },
        };
        const previous = navigator.storage;
        Object.defineProperty(navigator, "storage", {
            configurable: true,
            value: { persist: async () => false },
        });
        try {
            mod.installIdbfsSyncfsWrapper(idbfs);
            const calls = [];
            await new Promise((resolve) => {
                idbfs.syncfs({}, false, (err) => {
                    calls.push(err ?? null);
                    resolve(null);
                });
            });
            return calls;
        } finally {
            Object.defineProperty(navigator, "storage", {
                configurable: true,
                value: previous,
            });
        }
    });
    expect(result).toEqual([null]);
});

test("missing persist API still completes the sync once", async ({ page }) => {
    await openHarness(page);
    const result = await page.evaluate(async () => {
        const mod = await import("/initFilesystem.mjs");
        const idbfs = {
            syncfs(_mount, _populate, callback) {
                callback();
            },
        };
        const previous = navigator.storage;
        Object.defineProperty(navigator, "storage", {
            configurable: true,
            value: undefined,
        });
        try {
            mod.installIdbfsSyncfsWrapper(idbfs);
            const calls = [];
            await new Promise((resolve) => {
                idbfs.syncfs({}, false, (err) => {
                    calls.push(err ?? null);
                    resolve(null);
                });
            });
            return calls;
        } finally {
            Object.defineProperty(navigator, "storage", {
                configurable: true,
                value: previous,
            });
        }
    });
    expect(result).toEqual([null]);
});
