// Section 8 (configs/storage): only data/SAVEGAME is persisted (IDBFS),
// MAPS/proto are MEMFS, the game folder is ASYNCFETCHFS (asyncfetchfs.mjs).
// ASYNCFETCHFS file semantics used by CE config writes: ENOENT for a missing
// file, short overwrite leaves no tail, truncate, rename over a file, unlink.
// The rewritten active cfg keeps the published comments. Main menu only.
import { expect, test } from "../helpers/fixtures.mjs";
import { launchGameRetry, snap, waitForMainMenu } from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";
const CFG = "Nevada.cfg";

test("section 8: IDBFS only for SAVEGAME; ASYNCFETCHFS errno/overwrite/rename", async ({
    page,
}, testInfo) => {
    test.setTimeout(15 * 60_000);
    await launchGameRetry(page, FOLDER);
    const menu = await waitForMainMenu(page, { timeout: 480_000 });
    await snap(testInfo, "01-main-menu", menu);

    const r = await page.evaluate(
        async ({ folder, cfg }) => {
            const FS = /** @type {any} */ (window).FS;
            const root = `/${folder}`;
            /** @param {() => unknown} fn */
            const errno = (fn) => {
                try {
                    fn();
                    return null;
                } catch (e) {
                    return /** @type {any} */ (e).errno ?? String(e);
                }
            };
            // Filesystem type mounted at p ("none" if p is not a mount point).
            /** @param {string} p */
            const kind = (p) => {
                const node = FS.lookupPath(p, { follow_mount: false }).node;
                const t = node.mounted?.type;
                if (!t) return "none";
                if (t.dbs) return "IDBFS";
                if (t.ops_table) return "MEMFS";
                if (t.FILE_MODE !== undefined) return "ASYNCFETCHFS";
                return "other";
            };
            /** @param {string} p */
            const text = (p) => FS.readFile(p, { encoding: "utf8" });

            const mounts = {
                root: kind(root),
                data: kind(`${root}/data`),
                savegame: kind(`${root}/data/SAVEGAME`),
                maps: kind(`${root}/data/MAPS`),
                items: kind(`${root}/data/proto/items`),
                critters: kind(`${root}/data/proto/critters`),
            };
            const dbs = (await indexedDB.databases())
                .map((d) => d.name)
                .filter((n) => n?.startsWith("/"));

            const a = `${root}/e2e-a.cfg`;
            const b = `${root}/e2e-b.cfg`;
            const c = `${root}/e2e-c.cfg`;
            const fsr = {};
            fsr.missingStat = errno(() => FS.stat(a));
            fsr.missingOpen = errno(() => FS.open(a, "r"));
            FS.writeFile(a, "0123456789");
            FS.writeFile(a, "abc");
            fsr.shortOverwrite = text(a);
            const s = FS.open(a, "r+");
            FS.write(s, new TextEncoder().encode("X"), 0, 1, 0);
            FS.close(s);
            fsr.patched = text(a);
            FS.truncate(a, 1);
            fsr.truncated = text(a);
            FS.truncate(a, 3);
            fsr.extendedSize = FS.stat(a).size;
            FS.writeFile(a, "new");
            FS.writeFile(c, "old contents");
            FS.rename(a, c);
            fsr.renamedOld = errno(() => FS.stat(a));
            fsr.renamedNew = text(c);
            FS.rename(c, b);
            fsr.renamedTwice = text(b);
            FS.unlink(b);
            fsr.unlinked = errno(() => FS.stat(b));
            fsr.listing = FS.readdir(root).filter((/** @type {string} */ n) =>
                n.startsWith("e2e-"),
            );

            const cfgNode = FS.lookupPath(`${root}/${cfg}`).node;
            const cfgText = cfgNode.contents
                ? new TextDecoder("latin1").decode(cfgNode.contents)
                : null;
            const res = await fetch(`./game/${folder}/${cfg}.gz?v=1`);
            const orig = new TextDecoder("latin1").decode(
                await new Response(
                    res.body.pipeThrough(new DecompressionStream("gzip")),
                ).arrayBuffer(),
            );
            const comments = (/** @type {string} */ t) =>
                t
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter((l) => l.startsWith(";"));
            const lostComments = cfgText
                ? comments(orig).filter((l) => !comments(cfgText).includes(l))
                : null;
            return {
                mounts,
                dbs,
                fsr,
                origComments: comments(orig).length,
                lostComments,
            };
        },
        { folder: FOLDER, cfg: CFG },
    );
    await testInfo.attach("fs.json", {
        body: JSON.stringify(r, null, 2),
        contentType: "application/json",
    });

    expect(r.mounts).toEqual({
        root: "ASYNCFETCHFS",
        data: "none",
        savegame: "IDBFS",
        maps: "MEMFS",
        items: "MEMFS",
        critters: "MEMFS",
    });
    expect(r.dbs).toEqual([`/${FOLDER}/data/SAVEGAME`]);
    const ENOENT = 44;
    expect(r.fsr).toEqual({
        missingStat: ENOENT,
        missingOpen: ENOENT,
        shortOverwrite: "abc",
        patched: "Xbc",
        truncated: "X",
        extendedSize: 3,
        renamedOld: ENOENT,
        renamedNew: "new",
        renamedTwice: "new",
        unlinked: ENOENT,
        listing: [],
    });
    expect(r.lostComments, "published cfg comments kept").toEqual([]);
});
