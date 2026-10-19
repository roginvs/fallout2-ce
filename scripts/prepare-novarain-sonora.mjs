import fs from "fs";
import path from "path";
import os from "os";
import zlib from "zlib";
import crypto from "crypto";
import readline from "readline/promises";
import { spawnSync } from "child_process";

// Release tag: default is the release we are preparing right now, when a new
// version comes out pass it as the first argument and everything (downloads,
// staging, folder names) is derived from it.
const RELEASE_TAG_DEFAULT = "1.16.4-sfall";
const TAG = process.argv[2] || RELEASE_TAG_DEFAULT;
const STEP = process.argv[3] || "all";
const isDryRun = process.argv[4] !== "nodry";
// 1.16.4-sfall -> 1_16_4, used in folder names.
const VERSION_SLUG = TAG.replace(/-sfall.*$/, "").replace(
    /[^a-zA-Z0-9]+/g,
    "_",
);
const versionText = VERSION_SLUG.replaceAll("_", ".");

console.info("Prepare NovaRain Fallout Sonora release script");
console.info(
    "node scripts/prepare-novarain-sonora.mjs [release-tag] [step] [nodry]\n" +
        `Release tag defaults to ${RELEASE_TAG_DEFAULT}; downloads, staging and\n` +
        "folder names are all derived from it.\n" +
        "Steps: preflight download unzip assemble ruspack clean pack hardlinks clone validate report all\n" +
        "Default is dry-run; pass 'nodry' as third argument to actually do things.",
);
if (isDryRun) {
    console.info("Running in DRY-RUN mode, no files will be changed.");
} else {
    console.info("NOT a dry-run, files will be changed!");
}

// Names of the two release assets we need. One carries the version: e.g.
// Fallout_Sonora_1.16.4E_sfall.zip.
const MAIN_ASSET_RE = /^Fallout_Sonora_.*_sfall\.zip$/;
const RU_ASSET_NAME = "fs_lang_russian.zip";

const DOWNLOADS_DIR = `/data/games/downloads/${TAG}`;
const UNPACKED_DIR = path.join(DOWNLOADS_DIR, "unpacked");
const GAMES_DIR = path.join(os.homedir(), "fallout2-ce-website-games");
const EN_DIR_NAME = `Fallout_Sonora_${VERSION_SLUG}_novarain_eng`;
const RU_DIR_NAME = `Fallout_Sonora_${VERSION_SLUG}_novarain_ru`;
const EN_DIR = path.join(GAMES_DIR, EN_DIR_NAME);
const RU_DIR = path.join(GAMES_DIR, RU_DIR_NAME);

// Native-only files of the repack, useless in the web player: executables,
// libraries, platform builds. This is the ONLY thing we drop; every other
// file of the repack is kept (sfall.dat, translations, docs, everything).
const NATIVE_IGNORE_RES = [
    /\.exe$/i,
    /\.dll$/i,
    /\.ipa/i,
    /\.apk/i,
    /^fallout-sonora-/i,
];

// Files and directories we know how to handle in the unpacked repack.
// Anything else stops the assemble step and asks for our attention.

// Dats smaller than this stay raw: the engine fetches and parses them whole,
// unpacking into directories only pays off for the big ones.
const SMALL_DAT_MAX_BYTES = 8 * 1024 * 1024;
const KNOWN_COPY_ENTRIES = [
    "BIS_mapper",
    "data",
    "mods",
    "ddraw.ini",
    "f2_res.ini",
    "fallout2.cfg",
    "master_patches.ini",
    "critter_patches.ini",
    "translations",
];
const KNOWN_COPY_RES = [
    /^readme/i,
    /^log_develop/i,
    /^sfall-FAQ/i,
    /^sfall-readme/i,
    /^f2_res_README/i,
    /^f2_res_change/i,
];
const KNOWN_COPY_DAT_RES = [/^patch\d+\.dat$/i];

const STEPS = [
    "preflight",
    "download",
    "unzip",
    "assemble",
    "ruspack",
    "clean",
    "pack",
    "hardlinks",
    "clone",
    "validate",
    "report",
];

const activeSteps = STEP === "all" ? STEPS : [assertStepName(STEP)];

function assertStepName(step) {
    if (!STEPS.includes(step)) {
        console.error(
            "Unknown step: ",
            step,
            " expected one of: ",
            STEPS.join(" "),
        );
        process.exit(1);
    }
    return step;
}

const steps = {
    preflight() {
        for (const dir of [EN_DIR, RU_DIR]) {
            if (fs.existsSync(dir)) {
                console.error("Target directory already exists: ", dir);
                console.error(
                    "Remove it manually or point the script elsewhere.",
                );
                process.exit(1);
            }
        }
        for (const tool of ["dat-unpacker", "pigz", "unzip"]) {
            const res = spawnSync(tool, ["--help"], { stdio: "ignore" });
            const res2 = res.error && res.error.code === "ENOENT";
            if (res2 || (res.status !== 0 && res.status !== 1)) {
                console.warn("Tool might be missing: ", tool);
            }
        }
        console.info("Free space:");
        for (const mount of ["/data", os.homedir()]) {
            const res = spawnSync("df", ["-h", mount], { encoding: "utf8" });
            console.info((res.stdout || "").trim().split("\n").pop() ?? "");
        }
    },

    async download() {
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
        const assets = await fetchAssets();
        for (const asset of assets) {
            const filePath = path.join(DOWNLOADS_DIR, asset.name);
            await downloadAsset(asset, filePath);
        }
        const mainAsset = assets.find((/** @type {any} */ a) =>
            MAIN_ASSET_RE.test(a.name),
        );
        // Remember the real asset name (it carries the letterful version,
        // e.g. Fallout_Sonora_1.16.4E_sfall.zip, not derivable from the tag).
        fs.writeFileSync(
            path.join(DOWNLOADS_DIR, "assets.json"),
            JSON.stringify({ mainAssetName: mainAsset.name }, null, 4) + "\n",
        );
        console.info("Wrote", path.join(DOWNLOADS_DIR, "assets.json"));
    },

    unzip() {
        const assetsMetaPath = path.join(DOWNLOADS_DIR, "assets.json");
        if (!fs.existsSync(assetsMetaPath)) {
            console.error("assets.json not found, re-run download step");
            process.exit(1);
        }
        const assetsMeta = /** @type {any} */ (
            JSON.parse(fs.readFileSync(assetsMetaPath, "utf8"))
        );
        const zipPath = path.join(DOWNLOADS_DIR, assetsMeta.mainAssetName);
        if (!fs.existsSync(zipPath)) {
            console.error("Main zip not found (already unpacked?):", zipPath);
            console.error("Re-run download step.");
            process.exit(1);
        }
        if (fs.existsSync(UNPACKED_DIR)) {
            console.info("Removing old staging and unpacking again");
            if (!isDryRun) {
                fs.rmSync(UNPACKED_DIR, { recursive: true });
            }
        }
        run("unzip", ["-q", "-o", zipPath, "-d", UNPACKED_DIR]);
        if (isDryRun) {
            console.info(
                "(dry) staging listing and the zip removal are skipped",
            );
            return;
        }
        const entries = fs.readdirSync(UNPACKED_DIR);
        console.info("Unpacked entries:", entries.join(", "));
        // Release the disk space.
        fs.rmSync(zipPath);
        console.info("Removed the main zip to free space: ", zipPath);
    },

    assemble() {
        if (isDryRun && !fs.existsSync(UNPACKED_DIR)) {
            console.info(
                "(dry) staging does not exist (unzip runs first in a real run)",
            );
            return;
        }
        if (!fs.existsSync(UNPACKED_DIR)) {
            if (fs.readdirSync(EN_DIR).length > 0) {
                console.info(
                    "Staging is gone, and the target folder is populated: assemble is already done.",
                );
                return;
            }
            console.error(
                "Staging does not exist (it is removed after success). " +
                    "Re-run unzip to rebuild it.",
            );
            process.exit(1);
        }
        fs.mkdirSync(EN_DIR, { recursive: true });

        // Never assemble twice into the same folder: half of the entries
        // would nest inside the already copied ones.
        if (fs.readdirSync(EN_DIR).length > 0) {
            console.error(
                "Target folder is not empty, assemble was already done (or it needs a manual check):",
                EN_DIR,
            );
            process.exit(1);
        }

        const stagingEntries = fs.readdirSync(UNPACKED_DIR);
        // The repack zip may contain everything inside a single top-level
        // directory; take it as the staging root automatically.
        let stagingRoot = UNPACKED_DIR;
        if (
            stagingEntries.length === 1 &&
            fs
                .statSync(path.join(UNPACKED_DIR, stagingEntries[0]))
                .isDirectory()
        ) {
            stagingRoot = path.join(UNPACKED_DIR, stagingEntries[0]);
            console.info(
                "Nested zip root, using it as staging root:",
                stagingRoot,
            );
        }
        const entries = fs.readdirSync(stagingRoot);
        const native = [];
        const unknown = [];
        /** @type {string[]} */
        const dats = [];
        const copy = [];
        for (const entry of entries) {
            const resolved = path.join(stagingRoot, entry);
            if (NATIVE_IGNORE_RES.some((re) => re.test(entry))) {
                native.push(entry);
                if (!isDryRun) {
                    fs.rmSync(resolved, { recursive: true, force: true });
                }
                continue;
            }
            const isDat = /\.dat$/i.test(entry);
            if (isDat) {
                // Big dats are unpacked into same-named directories (engine
                // reads dat names as directories, individual files are
                // fetched on demand). Small dats are kept as raw files, the
                // engine fetches and parses them whole.
                if (fs.statSync(resolved).size >= SMALL_DAT_MAX_BYTES) {
                    dats.push(entry);
                } else {
                    copy.push(entry);
                    console.info(
                        "Small dat, keeping as raw file (no unpack):",
                        entry,
                    );
                }
                continue;
            }
            if (
                KNOWN_COPY_ENTRIES.includes(entry) ||
                KNOWN_COPY_RES.some((re) => re.test(entry)) ||
                KNOWN_COPY_DAT_RES.some((re) => re.test(entry))
            ) {
                copy.push(entry);
                continue;
            }
            unknown.push(entry);
        }
        console.info(
            "Ignoring native files:",
            native.length,
            native.join(", "),
        );
        if (unknown.length > 0) {
            console.error("Unknown entries, stopping:", unknown.join(", "));
            console.error(
                "Add them to the script lists and re-run (they are not moved).",
            );
            process.exit(1);
        }

        for (const entry of copy) {
            moveEntry(path.join(stagingRoot, entry), path.join(EN_DIR, entry));
        }
        for (const dat of dats) {
            unpackDat(path.join(stagingRoot, dat), path.join(EN_DIR, dat));
        }

        // Verify the staging root is empty now.
        const leftovers = fs.readdirSync(stagingRoot);
        if (leftovers.length > 0) {
            console.error(
                "Staging is not empty after move:",
                leftovers.join(", "),
            );
            console.error("Fix the script lists and re-run.");
            process.exit(1);
        }
        if (!isDryRun) {
            fs.rmSync(UNPACKED_DIR, { recursive: true });
            console.info("Staging cleaned");
        }
    },

    ruspack() {
        const ruZipPath = path.join(DOWNLOADS_DIR, RU_ASSET_NAME);
        const tempDir = path.join(DOWNLOADS_DIR, "fs_russian_temp");
        fs.rmSync(tempDir, { recursive: true, force: true });
        run("unzip", ["-q", "-o", ruZipPath, "-d", tempDir]);
        if (isDryRun) {
            console.info("(dry) fs_russian.dat handling is skipped");
            return;
        }
        const datPath = path.join(tempDir, "fs_russian.dat");
        if (!fs.existsSync(datPath)) {
            console.error("fs_russian.dat not found in the language pack");
            process.exit(1);
        }
        unpackDat(datPath, path.join(EN_DIR, "mods", "fs_russian.dat"));
        if (!isDryRun) {
            fs.rmSync(tempDir, { recursive: true });
        }

        // Enable the language pack in mods_order.txt.
        const orderPath = path.join(EN_DIR, "mods", "mods_order.txt");
        let order = fs.readFileSync(orderPath, "utf8");
        order = order.replace(/^;+fs_russian\.dat/m, "fs_russian.dat");
        if (!order.includes("fs_russian.dat")) {
            order += "\nfs_russian.dat\n";
        }
        fs.writeFileSync(orderPath, order);
        console.info("mods_order.txt now has fs_russian.dat enabled");

        const top = fs.readdirSync(path.join(EN_DIR, "mods", "fs_russian.dat"));
        console.info(
            "fs_russian.dat top level:",
            top.join(", "),
            "(expect text\\russian only)",
        );
    },

    clean() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        // Configs are not edited: the repack is ready to play and the web
        // launch transformer overrides everything it needs on the fly.
        const cfg = readCfg(path.join(EN_DIR, "fallout2.cfg"));
        console.info("Check the shipped cfg values:");
        for (const key of [
            "master_dat",
            "master_patches",
            "critter_dat",
            "critter_patches",
        ]) {
            console.info(`  ${key}=${cfg["system"]?.[key] ?? "???"}`);
        }
        const ddraw = readCfg(path.join(EN_DIR, "ddraw.ini"));
        console.info(
            "  IniConfigFolder=",
            ddraw["scripts"]?.iniConfigFolder ?? "??? (commented out)",
        );
        console.info(
            "  Misc ConfigFile=",
            ddraw["misc"]?.configfile ?? "??? (commented out)",
        );

        // Remove savegames and junk not shipped to players.
        const savegameDir = path.join(EN_DIR, "data", "SAVEGAME");
        if (fs.existsSync(savegameDir)) {
            for (const f of fs.readdirSync(savegameDir)) {
                FsRemoveQuietly(path.join(savegameDir, f));
            }
            console.info("Cleared SAVEGAME");
        }
        fs.rmSync(path.join(EN_DIR, ".DS_Store"), { force: true });

        // README "Add empty files to keep empty folders": asyncfetchfs
        // builds the virtual tree only from files listed in index.txt, so
        // an empty folder never appears in the web FS. The engine expects
        // these dirs to exist (saves, maps, proto editing), keep them with
        // zero-size .empty files.
        const keepDirs = [
            "data/SAVEGAME",
            "data/MAPS",
            "data/proto/items",
            "data/proto/critters",
        ];
        for (const dir of keepDirs) {
            const dirPath = path.join(EN_DIR, ...dir.split("/"));
            fs.mkdirSync(dirPath, { recursive: true });
            fs.writeFileSync(path.join(dirPath, ".empty"), "");
        }
        console.info("Created", keepDirs.length, "empty-folder markers");

        // Any other empty folder would be invisible in the web FS as well;
        // mark it too (bottom-up so nested chain empties are all marked).
        let extraMarkers = 0;
        const visit = (/** @type {string} */ dir) => {
            for (const name of fs.readdirSync(dir)) {
                const p = path.join(dir, name);
                if (fs.statSync(p).isDirectory()) {
                    visit(p);
                }
            }
            if (fs.readdirSync(dir).length === 0) {
                fs.writeFileSync(path.join(dir, ".empty"), "");
                extraMarkers++;
                console.info(
                    "Extra empty dir marker:",
                    path.relative(EN_DIR, dir),
                );
            }
        };
        for (const dir of keepDirs) {
            visit(path.join(EN_DIR, ...dir.split("/")));
        }
        if (extraMarkers > 0) {
            console.info("Extra empty dir markers created:", extraMarkers);
        } else {
            console.info("No extra empty dirs, nothing to mark");
        }
    },

    pack() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        // Same format as game/pack.sh: find -type f -printf '%s ' + sha256sum.
        // Same format as game/pack.sh and the web README: "size sha256  ./path".
        // make-hardlinks-for-duplicated-files.mjs and asyncfetchfs expect the ./.
        const lines = [];
        for (const relPath of listFiles(EN_DIR)) {
            const fullPath = path.join(EN_DIR, relPath);
            const size = fs.statSync(fullPath).size;
            const hash = sha256File(fullPath);
            lines.push(`${size} ${hash}  ./${relPath}`);
        }
        const indexLine = lines.join("\n") + "\n";
        if (!isDryRun) {
            fs.writeFileSync(path.join(EN_DIR, "index.txt"), indexLine);
            run("pigz", ["-r", "--best", "."], { cwd: EN_DIR });
            console.info("Packed, files: ", lines.length);
        }
    },

    hardlinks() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        run(
            "node",
            [
                path.join(
                    os.homedir(),
                    "fallout2-ce-web",
                    "scripts",
                    "make-hardlinks-for-duplicated-files.mjs",
                ),
                GAMES_DIR,
                "nodry",
            ],
            // Show its progress lines live.
            { stdio: "inherit" },
        );
    },

    async clone() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        run("cp", ["-al", EN_DIR, RU_DIR]);
        // Every file must be shared between EN and RU. nlink==1 means
        // something went wrong and it is not acceptable.
        const unique = [];
        let shared = 0;
        let withOld = 0;
        for (const relPath of listFiles(RU_DIR)) {
            const nlink = fs.statSync(path.join(RU_DIR, relPath)).nlink;
            if (nlink === 1) {
                unique.push(relPath);
            } else if (nlink === 2) {
                shared++;
            } else if (nlink >= 3) {
                withOld++;
            }
        }
        console.info(
            `Files nlink==2 (this build): ${shared}, nlink>=3 (shared with old folders): ${withOld}`,
        );
        if (unique.length > 0) {
            console.error(
                "Unique files (nlink==1), what the hell are they doing here:",
            );
            console.error(unique.join("\n"));
            const ok = await confirm(
                `Continue anyway? (${unique.length} unique files) [y/N] `,
            );
            if (!ok) {
                console.error("Stopped by user");
                process.exit(1);
            }
        }
    },

    async validate() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        run(
            "node",
            [
                path.join(
                    os.homedir(),
                    "fallout2-ce-web",
                    "scripts",
                    "validate-index-txt-checksums.mjs",
                ),
                GAMES_DIR,
            ],
            // Show the validator's per-game OK/error lines.
            { stdio: "inherit" },
        );
        const cfg = gzRead(path.join(EN_DIR, "fallout2.cfg.gz"));
        console.info(
            "fallout2.cfg from pack:\n",
            cfg.split("\n").slice(0, 10).join("\n"),
        );
        const order = gzRead(path.join(EN_DIR, "mods", "mods_order.txt.gz"));
        console.info(
            "mods_order.txt from pack:\n",
            order.split("\n").filter(Boolean).join("\n"),
        );
        const ruText = path.join(
            EN_DIR,
            "mods",
            "fs_russian.dat",
            "text",
            "russian",
        );
        console.info("text/russian exists:", fs.existsSync(ruText));
        const noDats = listFiles(EN_DIR).every((p) => !/\.dat$/i.test(p));
        console.info("No raw .dat files left:", noDats);
    },

    report() {
        console.info(`\nAdd to os/web/config.mjs games array BEFORE the first
lang:"en" sonora entry, and before the first lang:"ru" sonora entry for the
russian one. Fresh players see only the first entry per lang + gameType, so
the new versions become the default.`);

        const links = [
            "https://github.com/NovaRain/Fallout-Sonora-English",
            "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
        ];
        const printEntry = (name, folder, lang, extraLink) => {
            console.info(
                JSON.stringify(
                    {
                        name,
                        folder,
                        gameType: "sonora",
                        lang,
                        links: extraLink ? [extraLink, ...links] : links,
                        filesVersion: "1",
                    },
                    null,
                    4,
                ) + ",",
            );
        };
        printEntry(
            `Fallout: Sonora English ${versionText} (+ DLC) by NovaRain`,
            EN_DIR_NAME,
            "en",
            "https://cambragol.github.io/Fallout-Sonora/",
        );
        printEntry(
            `Fallout: Sonora ${versionText} NovaRain (+ DLC)`,
            RU_DIR_NAME,
            "ru",
            null,
        );

        console.info(`\nManual checklist:
- test natively with local fallout2-ce (check translation, strart game, exit)
- rsync -H /home/${os.userInfo().username}/fallout2-ce-website-games/{${EN_DIR_NAME},${RU_DIR_NAME}} root@fallout-nevada.ru:/var/www/html/game/
- add entries to os/web/config.mjs (see above)
- rebuild the web assets (service worker version updates by content hash)
- deploy`);
    },
};

/**
 * @param {string} filePath
 * @param {string} dstDir
 */
function unpackDat(filePath, dstDir) {
    fs.mkdirSync(dstDir, { recursive: true });
    // -t lowercases file names, matching existing game folders.
    run("dat-unpacker", ["-q", "-t", "-s", filePath, "-d", dstDir]);
    if (!isDryRun) {
        fs.rmSync(filePath, { force: true });
    }
}

/**
 * Copy entry across filesystems and remove the source.
 * @param {string} src
 * @param {string} dst
 */
function moveEntry(src, dst) {
    console.info("Moving", path.basename(src), "->", dst);
    if (isDryRun) {
        return;
    }
    fs.cpSync(src, dst, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
}

async function fetchAssets() {
    const url = `https://api.github.com/repos/NovaRain/Fallout-Sonora-English/releases/tags/${TAG}`;
    const res = await fetch(url);
    if (!res.ok) {
        console.error("Failed to fetch release info", res.status);
        process.exit(1);
    }
    const release = /** @type {any} */ (await res.json());
    const wanted = release.assets.filter(
        (/** @type {any} */ a) =>
            MAIN_ASSET_RE.test(a.name) || a.name === RU_ASSET_NAME,
    );
    if (wanted.length !== 2) {
        console.error(
            "Expected 2 assets, found:",
            wanted.map((/** @type {any} */ a) => a.name),
        );
        process.exit(1);
    }
    return wanted;
}

/**
 * Download with resume support and sha256 verification.
 * @param {any} asset
 * @param {string} filePath
 */
async function downloadAsset(asset, filePath) {
    const expected = String(asset.digest || "").replace(/^sha256:/, "");
    if (fs.existsSync(filePath)) {
        const actual = sha256File(filePath);
        if (actual === expected) {
            console.info("Already downloaded and verified:", asset.name);
            return;
        }
        console.info("Hash mismatch, removing and re-downloading:", asset.name);
        if (!isDryRun) fs.rmSync(filePath);
    }
    console.info("Downloading", asset.name, `(${asset.size} bytes)`);
    if (isDryRun) {
        return;
    }
    run("curl", ["-sL", "-C", "-", "-o", filePath, asset.browser_download_url]);
    const actual = sha256File(filePath);
    if (actual !== expected) {
        console.error("sha256 mismatch after download", asset.name);
        fs.rmSync(filePath);
        process.exit(1);
    }
    console.info("sha256 verified:", asset.name);
}

/**
 * @param {string} filePath
 * @returns {string} sha256 hex digest
 */
function sha256File(filePath) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
}

/**
 * @param {string} file
 * @returns {string} gunzipped utf8 text
 */
function gzRead(file) {
    return zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
}

/**
 * Parse simple ini into {lowercaseSection: {lowercaseKey: value}}.
 * @param {string} file
 */
function readCfg(file) {
    /** @type {{[section: string]: {[key: string]: string}}} */
    const result = { other: {} };
    let section = "other";
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const header = /^\[(.+)\]\s*$/.exec(line);
        if (header) {
            section = header[1].toLowerCase();
            continue;
        }
        const kv = /^([^=;#\s][^=]*)=(.*)$/.exec(line);
        if (kv) {
            result[section] ??= {};
            result[section][kv[1].trim().toLowerCase()] = kv[2].trim();
        }
    }
    return result;
}

/**
 * @param {string} dir
 * @returns {string[]} posix-like paths, "./" prefix stripped
 */
function listFiles(dir) {
    /** @type {string[]} */
    const result = [];
    const visit = (/** @type {string} */ current) => {
        for (const entry of fs.readdirSync(current)) {
            const full = path.join(current, entry);
            const rel = path.relative(dir, full).replaceAll(path.sep, "/");
            if (fs.statSync(full).isDirectory()) {
                visit(full);
            } else {
                result.push(rel);
            }
        }
    };
    visit(dir);
    return result;
}

/**
 * @param {string} file
 */
function FsRemoveQuietly(file) {
    if (isDryRun) {
        console.info("(dry) would remove ", file);
        return;
    }
    fs.rmSync(file, { recursive: true, force: true });
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {SpawnSyncOptionsWithStringEncoding} [opts]
 */
function run(cmd, args, opts) {
    console.info("> " + [cmd, ...args].join(" "));
    if (isDryRun) {
        return;
    }
    const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
    if (res.status !== 0) {
        console.error(
            "Command failed:",
            cmd,
            ...(opts?.cwd ? [`(cwd ${opts.cwd})`] : []),
        );
        console.error(res.stdout || "");
        console.error(res.stderr || "");
        process.exit(1);
    }
}

/**
 * @param {string} question
 * @returns {Promise<boolean>} true when user answered y
 */
async function confirm(question) {
    if (isDryRun) {
        console.info("(dry) ask:", question);
        return false;
    }
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = (await rl.question(question)).trim().toLowerCase();
    rl.close();
    return answer === "y" || answer === "yes";
}

/** @typedef {import("child_process").SpawnSyncOptionsWithStringEncoding} SpawnSyncOptionsWithStringEncoding */

for (const step of activeSteps) {
    console.info(`\n===== Step ${step} =====`);
    await steps[step]();
}
console.info("\n==== Done ====");
