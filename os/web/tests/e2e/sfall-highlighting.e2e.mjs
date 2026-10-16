// Sfall object highlighting (gl_highlighting.int, embedded in ce.dat or shipped
// by the game): new game, on the first map hold left Shift and check that items
// get outlined. Also checks the ini that the embedded script reads.
// Candidate mode only (E2E_CANDIDATE_DIR): JS/WASM from the local build.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    launchGameRetry,
    newGameToMap,
    snap,
    waitForMainMenu,
} from "../helpers/game.mjs";

test.beforeAll(() => {
    test.skip(
        !process.env.E2E_CANDIDATE_DIR,
        "set E2E_CANDIDATE_DIR to a local Release web build (e.g. build/web)",
    );
});

/**
 * `ini`: the sfall-mods.ini the running highlighting script reads, relative to
 * the game root. `created`: our shell creates it (embedded ce.dat script,
 * IniConfigFolder + mods\sfall-mods.ini); otherwise the game ships it with
 * its own gl_highlighting.int. `outline`: the first map has a critter to
 * outline (with Critters=1 set by the test), Sonora's has none.
 * @type {{ folder: string, label: string, ini: string, created: boolean, outline: boolean }[]}
 */
const GAMES = [
    {
        folder: "Fallout_Sonora_1_15_dlc",
        label: "Sonora 1.15 ru",
        ini: "mods/sfall-mods.ini",
        created: true,
        outline: false,
    },
    {
        folder: "FalloutNevadaFoxx070925",
        label: "Nevada 3.4 Foxx ru",
        ini: "sfall/mods/sfall-mods.ini",
        created: true,
        outline: true,
    },
    {
        folder: "FalloutOfNevada",
        label: "Nevada 2.4.1 Foxx ru",
        ini: "mods/iniConfigs/mods/sfall-mods.ini",
        created: true,
        outline: true,
    },
    {
        // Own old gl_highlighting.int without the Critters option, reads the
        // shipped root sfall-mods.ini (Key=42). Start map has no items.
        folder: "FalloutNevadaEng",
        label: "Nevada Eng",
        ini: "sfall-mods.ini",
        created: false,
        outline: false,
    },
    {
        folder: "Fallout_Nevada_official_20240505_100_patch2",
        label: "Nevada 1.00 patch2 ru",
        ini: "mods/sfall-mods.ini",
        created: true,
        outline: true,
    },
];

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} folder
 * @param {string} ini
 * @returns {Promise<string | null>}
 */
function readGameFile(page, folder, ini) {
    return page.evaluate(
        ([root, rel]) => {
            let path = "/" + root;
            for (const part of rel.split("/")) {
                const node = FS.lookupPath(path).node;
                const name = Object.keys(node.childNodes || {}).find(
                    (n) => n.toLowerCase() === part.toLowerCase(),
                );
                if (name === undefined) return null;
                path += "/" + name;
            }
            return new TextDecoder().decode(FS.readFile(path));
        },
        [folder, ini],
    );
}

for (const { folder, label, ini, created, outline } of GAMES) {
    test(`hold Shift highlights objects (${label})`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(20 * 60_000);
        await launchGameRetry(page, folder);
        await waitForMainMenu(page, { timeout: 480_000 });
        if (created) {
            const content = await readGameFile(page, folder, ini);
            expect(content, `${ini} must be created`).not.toBeNull();
            expect(content).toMatch(/^\s*Key\s*=\s*42\s*$/im);
        }

        // The start maps have no items on the ground but do have an NPC
        // (except Sonora), so for the test only also outline critters.
        // Global scripts read the ini on new game, after the main menu.
        if (outline) {
            await page.evaluate(
                ([root, rel]) => {
                    let path = "/" + root;
                    for (const part of rel.split("/")) {
                        const node = FS.lookupPath(path).node;
                        const name = Object.keys(node.childNodes || {}).find(
                            (n) => n.toLowerCase() === part.toLowerCase(),
                        );
                        path += "/" + (name ?? part);
                    }
                    FS.writeFile(
                        path,
                        "[Highlighting]\r\nKey=42\r\nCritters=1\r\nCheckLOS=0\r\nOutlineColor=16\r\nMotionScanner=0\r\n",
                    );
                },
                [folder, ini],
            );
        }
        await newGameToMap(page, testInfo, "0-");
        // !created (Nevada Eng): the shipped root sfall-mods.ini has Key=42;
        // it is fetched lazily and unloaded again, so it cannot be read here.

        // Map is animated: take several frames without and with Shift and
        // count pixels that differ in every Shift frame from every plain frame
        // (outlines stay while the key is held, animation does not).
        const frames = async (/** @type {number} */ n) => {
            const out = [];
            for (let i = 0; i < n; i++) {
                await page.waitForTimeout(400);
                out.push(await canvasPng(page));
            }
            return out;
        };
        await page.waitForTimeout(1500);
        const plain = await frames(4);
        await snap(testInfo, "1-no-shift", plain[3]);
        await page.keyboard.down("Shift");
        const shifted = await frames(4);
        await page.keyboard.up("Shift");
        await snap(testInfo, "2-shift", shifted[3]);
        const released = await frames(4);
        await snap(testInfo, "3-released", released[3]);

        const outlined = await persistentDiff(page, plain, shifted);
        const afterRelease = await persistentDiff(page, plain, released);
        console.log(`${label}: outlined=${outlined} released=${afterRelease}`);
        testInfo.annotations.push({
            type: "diff",
            description: `outlined=${outlined} released=${afterRelease}`,
        });
        if (!outline) {
            return;
        }
        expect(outlined, "pixels outlined while Shift is held").toBeGreaterThan(
            100,
        );
        expect(afterRelease, "outlines gone after release").toBeLessThan(
            outlined / 4,
        );
    });
}

/**
 * Pixels that differ (any channel > 40) in every frame of `after` from every
 * frame of `before`.
 * @param {import("@playwright/test").Page} page
 * @param {Buffer[]} before
 * @param {Buffer[]} after
 */
async function persistentDiff(page, before, after) {
    return page.evaluate(
        async ([b64s, a64s]) => {
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
                return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
            };
            const bs = await Promise.all(b64s.map(decode));
            const as = await Promise.all(a64s.map(decode));
            let count = 0;
            for (let i = 0; i < as[0].length; i += 4) {
                const differs = as.every((a) =>
                    bs.every(
                        (b) =>
                            Math.abs(a[i] - b[i]) > 40 ||
                            Math.abs(a[i + 1] - b[i + 1]) > 40 ||
                            Math.abs(a[i + 2] - b[i + 2]) > 40,
                    ),
                );
                if (differs) count++;
            }
            return count;
        },
        [
            before.map((b) => b.toString("base64")),
            after.map((b) => b.toString("base64")),
        ],
    );
}
