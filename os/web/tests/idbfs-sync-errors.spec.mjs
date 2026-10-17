import { expect, test } from "@playwright/test";

async function openHarness(page) {
    await page.goto("/tests/harness.html");
}

test("syncfs error is forwarded once and is not a successful save", async ({
    page,
}) => {
    await openHarness(page);
    const result = await page.evaluate(async () => {
        const mod = await import("/idbfsSync.mjs");
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
        const mod = await import("/idbfsSync.mjs");
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
        const mod = await import("/idbfsSync.mjs");
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

test("reportIdbfsWriteError alerts and does not look like success", async ({
    page,
}) => {
    await openHarness(page);
    const result = await page.evaluate(async () => {
        const mod = await import("/idbfsSync.mjs");
        /** @type {string[]} */
        const alerts = [];
        const previousAlert = window.alert;
        window.alert = (msg) => {
            alerts.push(String(msg));
        };
        try {
            const message = mod.reportIdbfsWriteError(new Error("disk full"));
            return { message, alerts };
        } finally {
            window.alert = previousAlert;
        }
    });
    expect(result.message).toBe("IDBFS save failed: disk full");
    expect(result.alerts).toEqual(["IDBFS save failed: disk full"]);
});

test("write_idbfs-style path rejects after alert and never logs saved", async ({
    page,
}) => {
    await openHarness(page);
    const result = await page.evaluate(async () => {
        const mod = await import("/idbfsSync.mjs");
        /** @type {string[]} */
        const alerts = [];
        const logs = [];
        const previousAlert = window.alert;
        const previousError = console.error;
        const previousInfo = console.info;
        window.alert = (msg) => {
            alerts.push(String(msg));
        };
        console.error = (...args) => {
            logs.push(["error", args.map(String).join(" ")]);
        };
        console.info = (...args) => {
            logs.push(["info", args.map(String).join(" ")]);
        };
        try {
            const write_idbfs = async () => {
                await new Promise((resolve, reject) => {
                    const err = new Error("quota exceeded");
                    mod.reportIdbfsWriteError(err);
                    reject(err);
                });
                console.info("IDBFS saved");
            };
            let rejected = null;
            try {
                await write_idbfs();
            } catch (e) {
                rejected = e instanceof Error ? e.message : String(e);
            }
            return {
                alerts,
                rejected,
                savedLogged: logs.some(
                    ([level, text]) =>
                        level === "info" && text.includes("IDBFS saved"),
                ),
            };
        } finally {
            window.alert = previousAlert;
            console.error = previousError;
            console.info = previousInfo;
        }
    });
    expect(result.alerts).toEqual(["IDBFS save failed: quota exceeded"]);
    expect(result.rejected).toBe("quota exceeded");
    expect(result.savedLogged).toBe(false);
});
