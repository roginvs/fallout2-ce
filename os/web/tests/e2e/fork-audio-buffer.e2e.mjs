// Fork P2: audio buffer 4096 under EMSCRIPTEN (audio_engine.cc).
// SDL's Web Audio backend makes a ScriptProcessorNode with the engine's
// sample count. Check: buffer 4096, AudioContext running, audio callbacks
// keep coming at the main menu and some of them carry sound (menu music).
import { expect, test } from "../helpers/fixtures.mjs";
import { launchGameRetry, snap, waitForMainMenu } from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

test("fork P2: SDL audio uses a 4096 buffer and plays at the main menu", async ({
    page,
}, testInfo) => {
    test.setTimeout(15 * 60_000);
    await page.addInitScript(() => {
        const w = /** @type {any} */ (window);
        w.__audio = { contexts: [], processors: [] };
        const Orig = w.AudioContext || w.webkitAudioContext;
        if (!Orig) return;
        const orig = Orig.prototype.createScriptProcessor;
        Orig.prototype.createScriptProcessor = function (...args) {
            const node = orig.apply(this, args);
            w.__audio.processors.push(node);
            if (!w.__audio.contexts.includes(this))
                w.__audio.contexts.push(this);
            return node;
        };
    });
    await launchGameRetry(page, FOLDER);
    const menu = await waitForMainMenu(page, { timeout: 480_000 });
    await snap(testInfo, "01-main-menu", menu);

    // Listeners added now run after SDL's onaudioprocess has filled the output.
    const stats = await page.evaluate(async () => {
        const a = /** @type {any} */ (window).__audio;
        let callbacks = 0;
        let loud = 0;
        let peak = 0;
        for (const node of a.processors) {
            node.addEventListener("audioprocess", (/** @type {any} */ e) => {
                callbacks++;
                const data = e.outputBuffer.getChannelData(0);
                let max = 0;
                for (let i = 0; i < data.length; i++) {
                    max = Math.max(max, Math.abs(data[i]));
                }
                peak = Math.max(peak, max);
                if (max > 0.001) loud++;
            });
        }
        await new Promise((r) => setTimeout(r, 10_000));
        return {
            bufferSizes: a.processors.map(
                (/** @type {any} */ n) => n.bufferSize,
            ),
            states: a.contexts.map((/** @type {any} */ c) => c.state),
            sampleRates: a.contexts.map((/** @type {any} */ c) => c.sampleRate),
            callbacks,
            loud,
            peak,
        };
    });
    await testInfo.attach("audio.json", {
        body: JSON.stringify(stats, null, 2),
        contentType: "application/json",
    });
    expect(stats.bufferSizes).toEqual([4096]);
    expect(stats.states).toEqual(["running"]);
    // 10 s of 4096-frame buffers at 44.1-48 kHz is ~100-120 callbacks.
    expect(stats.callbacks).toBeGreaterThan(50);
    expect(stats.loud, "menu music should reach the output").toBeGreaterThan(0);
});
