import fs from "fs";
import path from "path";
import os from "os";
import zlib from "zlib";
import crypto from "crypto";
import { spawnSync } from "child_process";

// Official Fallout Sonora 1.16b + Dayglow, from the authors' Mail.ru links.
// The whole build stays on the external SSD. Only the gzipped folder is
// copied into the games tree, and hardlink dedup runs after that copy.
const STEP = process.argv[2] || "all";
const isDryRun = process.argv[3] !== "nodry";

console.info("Prepare official Fallout Sonora 1.16b + DLC");
console.info(
    "node scripts/prepare-official-sonora.mjs [step] [nodry]\n" +
        "Steps: preflight download unzip dlc assemble clean pack compress transfer hardlinks validate report all\n" +
        "Build on the external SSD, gzip there, then copy the gzipped folder\n" +
        "into ~/fallout2-ce-website-games and hardlink-dedup.\n" +
        "Default is dry-run; pass 'nodry' as the second argument to actually do things.",
);
if (isDryRun) {
    console.info("Running in DRY-RUN mode, no files will be changed.");
} else {
    console.info("NOT a dry-run, files will be changed!");
}

// Sizes are the Mail.ru file sizes. sha1 is of the bytes we downloaded;
// Mail.ru's own "hash" field is not a sha1 of the file.
const ASSETS = [
    {
        weblink: "wc7X/GXTochNYL",
        name: "Fallout_Sonora_1_16b.zip",
        size: 1322161582,
        sha1: "f5dc7b21428c48b9d9e5ffb30e0cf6005b97ecbf",
    },
    {
        weblink: "ToTA/vtnouJUDS",
        name: "Fallout_Sonora_DLC_1_16b.zip",
        size: 93356921,
        sha1: "03fde7e4b22e6fe22fc71799123733c5f4567558",
    },
];

const DOWNLOADS_DIR =
    "/media/vasilii/externalssd/fallout2-ce-data/downloads/sonora-1.16b";
const WORK_DIR = path.join(DOWNLOADS_DIR, "work");
const STAGING_NAME = "Fallout_Sonora";
const STAGING_DIR = path.join(WORK_DIR, STAGING_NAME);
const DLC_DIR = path.join(WORK_DIR, "dlc");
const DIR_NAME = "Fallout_Sonora_1_16b_dlc";
const GAMES_DIR = path.join(os.homedir(), "fallout2-ce-website-games");
const DEST_DIR = path.join(GAMES_DIR, DIR_NAME);

// Room for the gzipped tree on the internal disk before hardlinks reclaim it.
const MIN_HOME_FREE_BYTES = 3 * 1024 * 1024 * 1024;

// The engine opens patch000.dat, then patch001.dat, and stops at the first
// missing number (src/game.cc, template patch%03d.dat). The base archive has
// no patchNNN.dat, so the DLC's patchDLC.dat becomes patch000.dat.
const PATCH_DAT_NAME = "patch000.dat";

const NATIVE_IGNORE_RES = [
    /\.exe$/i,
    /\.dll$/i,
    /\.ipa/i,
    /\.apk/i,
    /^fallout-sonora-/i,
];

const SMALL_DAT_MAX_BYTES = 8 * 1024 * 1024;
const KNOWN_COPY_ENTRIES = ["BIS_mapper", "data", "mods"];
const KNOWN_COPY_RES = [
    /^readme/i,
    /^log_develop/i,
    /^log_fix/i,
    /^fallout2\.cfg$/i,
    /^ddraw\.ini$/i,
    /^f2_res\.ini$/i,
];

const STEPS = [
    "preflight",
    "download",
    "unzip",
    "dlc",
    "assemble",
    "clean",
    "pack",
    "compress",
    "transfer",
    "hardlinks",
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
        if (!fs.existsSync(DOWNLOADS_DIR)) {
            console.error("External SSD downloads dir is missing:", DOWNLOADS_DIR);
            console.error("Mount the SSD or put the two official zips there.");
            process.exit(1);
        }
        if (fs.existsSync(DEST_DIR)) {
            console.error("Target directory already exists: ", DEST_DIR);
            console.error("Remove it manually before rebuilding.");
            process.exit(1);
        }
        for (const tool of ["dat-unpacker", "pigz", "unzip", "sha1sum"]) {
            const res = spawnSync(tool, ["--help"], { stdio: "ignore" });
            const missing = res.error && res.error.code === "ENOENT";
            if (missing || (res.status !== 0 && res.status !== 1)) {
                console.warn("Tool might be missing: ", tool);
            }
        }
        const homeFree = freeBytes(os.homedir());
        console.info("Free space:");
        for (const mount of [DOWNLOADS_DIR, os.homedir()]) {
            const res = spawnSync("df", ["-h", mount], { encoding: "utf8" });
            console.info((res.stdout || "").trim().split("\n").pop() ?? "");
        }
        if (homeFree < MIN_HOME_FREE_BYTES) {
            console.error(
                "Not enough free space in the home filesystem for the gzipped copy:",
                homeFree,
                "bytes free, need",
                MIN_HOME_FREE_BYTES,
            );
            process.exit(1);
        }
    },

    async download() {
        for (const asset of ASSETS) {
            const filePath = path.join(DOWNLOADS_DIR, asset.name);
            await ensureAsset(asset, filePath);
        }
    },

    unzip() {
        const zipPath = path.join(DOWNLOADS_DIR, ASSETS[0].name);
        if (!fs.existsSync(zipPath)) {
            console.error("Main zip is missing:", zipPath);
            process.exit(1);
        }
        if (fs.existsSync(WORK_DIR)) {
            console.info("Removing old SSD work dir");
            if (!isDryRun) {
                fs.rmSync(WORK_DIR, { recursive: true, force: true });
            }
        }
        run("unzip", ["-q", "-o", zipPath, "-d", WORK_DIR]);
        if (isDryRun) {
            console.info("(dry) staging listing is skipped");
            return;
        }
        if (!fs.existsSync(STAGING_DIR)) {
            console.error("Expected folder inside the zip:", STAGING_NAME);
            process.exit(1);
        }
        const numbered = fs
            .readdirSync(STAGING_DIR)
            .filter((name) => /^patch\d+\.dat$/i.test(name));
        if (numbered.length > 0) {
            console.error(
                "Base Sonora already has a numbered patch, refusing to rename the DLC onto it:",
                numbered.join(", "),
            );
            process.exit(1);
        }
        console.info(
            "Base Sonora top level:",
            fs.readdirSync(STAGING_DIR).join(", "),
        );
        console.info("Base Sonora has no patchNNN.dat");
    },

    dlc() {
        if (!requireDir(STAGING_DIR, "Staging is missing, run unzip first")) {
            return;
        }
        const dlcZip = path.join(DOWNLOADS_DIR, ASSETS[1].name);
        if (!fs.existsSync(dlcZip)) {
            console.error("DLC zip is missing:", dlcZip);
            process.exit(1);
        }
        if (fs.existsSync(DLC_DIR) && !isDryRun) {
            fs.rmSync(DLC_DIR, { recursive: true, force: true });
        }
        run("unzip", ["-q", "-o", dlcZip, "-d", DLC_DIR]);
        if (isDryRun) {
            console.info("(dry) DLC overlay and patchDLC.dat rename are skipped");
            return;
        }
        const patchDlc = path.join(DLC_DIR, "patchDLC.dat");
        if (!fs.existsSync(patchDlc)) {
            console.error("patchDLC.dat is missing from the DLC zip");
            process.exit(1);
        }
        const already = path.join(STAGING_DIR, PATCH_DAT_NAME);
        if (fs.existsSync(already)) {
            console.error("Refusing to overwrite", already);
            process.exit(1);
        }
        for (const entry of fs.readdirSync(DLC_DIR)) {
            if (entry === "patchDLC.dat") {
                continue;
            }
            console.info("Overlay", entry);
            run("cp", ["-a", path.join(DLC_DIR, entry), STAGING_DIR]);
        }
        const renamed = path.join(STAGING_DIR, PATCH_DAT_NAME);
        fs.renameSync(patchDlc, renamed);
        console.info("Renamed patchDLC.dat ->", PATCH_DAT_NAME);
        fs.rmSync(DLC_DIR, { recursive: true, force: true });
    },

    assemble() {
        if (!requireDir(STAGING_DIR, "Staging is missing, run unzip and dlc first")) {
            return;
        }
        const entries = fs.readdirSync(STAGING_DIR);
        const native = [];
        const unknown = [];
        /** @type {string[]} */
        const dats = [];
        for (const entry of entries) {
            const resolved = path.join(STAGING_DIR, entry);
            if (NATIVE_IGNORE_RES.some((re) => re.test(entry))) {
                native.push(entry);
                continue;
            }
            if (/\.dat$/i.test(entry) && fs.statSync(resolved).isFile()) {
                if (fs.statSync(resolved).size >= SMALL_DAT_MAX_BYTES) {
                    dats.push(entry);
                } else {
                    console.info("Small dat, keeping as a raw file:", entry);
                }
                continue;
            }
            if (
                KNOWN_COPY_ENTRIES.includes(entry) ||
                KNOWN_COPY_RES.some((re) => re.test(entry))
            ) {
                continue;
            }
            unknown.push(entry);
        }
        console.info("Dropping native files:", native.join(", ") || "(none)");
        console.info("Unpacking large dats:", dats.join(", ") || "(none)");
        if (!dats.includes(PATCH_DAT_NAME)) {
            console.error("Expected", PATCH_DAT_NAME, "to be a large dat");
            process.exit(1);
        }
        if (unknown.length > 0) {
            console.error("Unknown entries, stopping:", unknown.join(", "));
            process.exit(1);
        }
        for (const entry of native) {
            FsRemoveQuietly(path.join(STAGING_DIR, entry));
        }
        for (const dat of dats) {
            unpackDat(path.join(STAGING_DIR, dat), path.join(STAGING_DIR, dat));
        }
    },

    clean() {
        if (!requireDir(STAGING_DIR, "Staging is missing")) {
            return;
        }
        alignWithOlderSonoraConfigs(STAGING_DIR);
        const cfg = readCfg(path.join(STAGING_DIR, "fallout2.cfg"));
        console.info("Cfg after alignment with 1.13/1.15:");
        for (const key of [
            "master_dat",
            "master_patches",
            "critter_dat",
            "critter_patches",
            "language",
            "art_cache_size",
        ]) {
            console.info(`  ${key}=${cfg["system"]?.[key] ?? "???"}`);
        }
        console.info(
            `  violence_level=${cfg["preferences"]?.violence_level ?? "???"}`,
        );
        const savegameDir = path.join(STAGING_DIR, "data", "SAVEGAME");
        if (fs.existsSync(savegameDir)) {
            for (const f of fs.readdirSync(savegameDir)) {
                FsRemoveQuietly(path.join(savegameDir, f));
            }
            console.info("Cleared SAVEGAME");
        }
        FsRemoveQuietly(path.join(STAGING_DIR, ".DS_Store"));
        createEmptyMarkers(STAGING_DIR);
    },

    pack() {
        if (!requireDir(STAGING_DIR, "Staging is missing")) {
            return;
        }
        const lines = [];
        for (const relPath of listFiles(STAGING_DIR)) {
            const fullPath = path.join(STAGING_DIR, relPath);
            const size = fs.statSync(fullPath).size;
            const hash = sha256File(fullPath);
            lines.push(`${size} ${hash}  ./${relPath}`);
        }
        if (isDryRun) {
            console.info(`(dry) would write index with ${lines.length} files`);
            return;
        }
        fs.writeFileSync(
            path.join(STAGING_DIR, "index.txt"),
            lines.join("\n") + "\n",
        );
        console.info(`Index written: ${lines.length} files`);
    },

    compress() {
        if (!requireDir(STAGING_DIR, "Staging is missing")) {
            return;
        }
        run("pigz", ["-r", "--best", "."], { cwd: STAGING_DIR });
        console.info("Compressed on the SSD");
    },

    transfer() {
        if (!requireDir(STAGING_DIR, "Staging is missing, compress it first")) {
            return;
        }
        if (fs.existsSync(DEST_DIR)) {
            console.error("Target directory already exists: ", DEST_DIR);
            process.exit(1);
        }
        const homeFree = freeBytes(os.homedir());
        if (homeFree < MIN_HOME_FREE_BYTES) {
            console.error(
                "Not enough free space to copy the gzipped folder:",
                homeFree,
            );
            process.exit(1);
        }
        run("cp", ["-a", STAGING_DIR, DEST_DIR]);
        if (isDryRun) {
            console.info("(dry) would copy", STAGING_DIR, "->", DEST_DIR);
            return;
        }
        const srcCount = listFiles(STAGING_DIR).length;
        const dstCount = listFiles(DEST_DIR).length;
        console.info(`Copied: SSD files ${srcCount} -> home files ${dstCount}`);
        if (srcCount !== dstCount) {
            console.error("Copy file count mismatch, leaving the SSD work dir");
            process.exit(1);
        }
        fs.rmSync(WORK_DIR, { recursive: true, force: true });
        console.info("Removed the SSD work dir. Zips are kept in", DOWNLOADS_DIR);
    },

    hardlinks() {
        if (isDryRun && !fs.existsSync(DEST_DIR)) {
            console.info("(dry) game folder is not in the games tree yet");
            return;
        }
        if (!fs.existsSync(DEST_DIR)) {
            console.error("Game folder is missing, run transfer first:", DEST_DIR);
            process.exit(1);
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
            { stdio: "inherit" },
        );
    },

    validate() {
        if (isDryRun && !fs.existsSync(DEST_DIR)) {
            console.info("(dry) game folder is not in the games tree yet");
            return;
        }
        if (!fs.existsSync(DEST_DIR)) {
            console.error("Game folder is missing, run transfer first:", DEST_DIR);
            process.exit(1);
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
            { stdio: "inherit" },
        );
        for (const dat of ["master.dat", "critter.dat", PATCH_DAT_NAME]) {
            const p = path.join(DEST_DIR, dat);
            const ok = fs.existsSync(p) && fs.statSync(p).isDirectory();
            console.info(`${dat} is a directory:`, ok);
            if (!ok) {
                process.exit(1);
            }
        }
        const sfall = path.join(DEST_DIR, "sfall.dat.gz");
        console.info("sfall.dat.gz kept as a file:", fs.existsSync(sfall));
        const cfg = gzRead(path.join(DEST_DIR, "fallout2.cfg.gz"));
        console.info(
            "fallout2.cfg language line:",
            cfg.split("\n").find((line) => /^language=/i.test(line)) ?? "???",
        );
    },

    report() {
        console.info(`\nRussian menu: this folder is the first lang:"ru" sonora
entry, so it is the default on /ru. NovaRain stays next.
English menu: Cambragol 1.05 (1.15) is the first lang:"en" sonora.
NovaRain English is the second.

Manual checklist:
- test natively with local fallout2-ce (start game, DLC invite path, exit)
- rsync -H /home/${os.userInfo().username}/fallout2-ce-website-games/${DIR_NAME} root@fallout-nevada.ru:/var/www/html/game/
- rebuild the web assets (service worker version updates by content hash)
- deploy`);
    },
};

/**
 * Match Russian 1.13/1.15 where the web launcher does not already override
 * the value. violence_level and art_cache_size are the only fallout2.cfg
 * differences. ddraw.ini in those builds is only SkipOpeningMovies; the
 * other sfall keys are not rewritten by the launcher and would be migrated
 * into data/config/game.cfg on first start.
 *
 * @param {string} dir
 */
function alignWithOlderSonoraConfigs(dir) {
    const cfgPath = path.join(dir, "fallout2.cfg");
    let cfg = fs.readFileSync(cfgPath);
    const next = cfg
        .toString("latin1")
        .replace(/^violence_level=\d+/m, "violence_level=3")
        .replace(/^art_cache_size=\d+/m, "art_cache_size=64");
    if (!/^violence_level=3\r?$/m.test(next) || !/^art_cache_size=64\r?$/m.test(next)) {
        console.error("Could not align fallout2.cfg with 1.13/1.15");
        process.exit(1);
    }
    if (!isDryRun) {
        fs.writeFileSync(cfgPath, Buffer.from(next, "latin1"));
    }
    const ddrawPath = path.join(dir, "ddraw.ini");
    const ddraw = "[Misc]\nSkipOpeningMovies=1\n\n";
    console.info("ddraw.ini replaced with the 1.15 SkipOpeningMovies stub");
    if (!isDryRun) {
        fs.writeFileSync(ddrawPath, ddraw);
    }
}

/**
 * @param {string} dir
 * @param {string} hint
 * @returns {boolean}
 */
function requireDir(dir, hint) {
    if (fs.existsSync(dir)) {
        return true;
    }
    if (isDryRun) {
        console.info("(dry)", hint);
        return false;
    }
    console.error(hint, dir);
    process.exit(1);
}

/**
 * @param {{name: string, size: number, sha1: string, weblink: string}} asset
 * @param {string} filePath
 */
async function ensureAsset(asset, filePath) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size === asset.size) {
        const actual = sha1File(filePath);
        if (actual === asset.sha1) {
            console.info("Already downloaded and verified:", asset.name);
            return;
        }
        console.error("sha1 mismatch for", asset.name, actual);
        console.error("Delete it and re-run, or replace it with the official zip.");
        process.exit(1);
    }
    console.info(
        "Need",
        asset.name,
        `(${asset.size} bytes) in`,
        DOWNLOADS_DIR,
    );
    if (isDryRun) {
        console.info("(dry) download is skipped");
        return;
    }
    const base = await mailruBase();
    const url = `${base}/${asset.weblink}`;
    console.info("Downloading", url);
    run("curl", [
        "-L",
        "--fail",
        "--retry",
        "5",
        "--retry-all-errors",
        "-C",
        "-",
        "-A",
        "Mozilla/5.0",
        "-o",
        filePath,
        url,
    ]);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== asset.size) {
        console.error(
            "Download did not finish. If Mail.ru asked for a captcha, put",
            asset.name,
            "into",
            DOWNLOADS_DIR,
            "and re-run.",
        );
        process.exit(1);
    }
    const actual = sha1File(filePath);
    if (actual !== asset.sha1) {
        console.error("sha1 mismatch after download", asset.name, actual);
        process.exit(1);
    }
    console.info("sha1 verified:", asset.name);
}

async function mailruBase() {
    const res = await fetch("https://cloud.mail.ru/api/v2/dispatcher?api=2");
    if (!res.ok) {
        console.error("Mail.ru dispatcher failed", res.status);
        process.exit(1);
    }
    const data = /** @type {any} */ (await res.json());
    const url = data?.body?.weblink_get?.[0]?.url;
    if (!url) {
        console.error("Mail.ru dispatcher returned no weblink_get url");
        process.exit(1);
    }
    return String(url).replace(/\/$/, "");
}

/**
 * @param {string} filePath
 * @param {string} dstDir
 */
function unpackDat(filePath, dstDir) {
    if (isDryRun) {
        console.info("(dry) would unpack", path.basename(filePath));
        return;
    }
    const tmp = dstDir + ".unpacking";
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    // -t lowercases file names, matching existing game folders.
    run("dat-unpacker", ["-q", "-t", "-s", filePath, "-d", tmp]);
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tmp, dstDir);
}

/**
 * @param {string} dir
 */
function createEmptyMarkers(dir) {
    if (isDryRun) {
        console.info("(dry) would add .empty markers under", dir);
        return;
    }
    const keepDirs = [
        "data/SAVEGAME",
        "data/MAPS",
        "data/proto/items",
        "data/proto/critters",
    ];
    for (const keep of keepDirs) {
        const dirPath = path.join(dir, ...keep.split("/"));
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(path.join(dirPath, ".empty"), "");
    }
    let extraMarkers = 0;
    const visit = (/** @type {string} */ sub) => {
        for (const name of fs.readdirSync(sub)) {
            const p = path.join(sub, name);
            if (fs.statSync(p).isDirectory()) {
                visit(p);
            }
        }
        if (sub !== dir && fs.readdirSync(sub).length === 0) {
            fs.writeFileSync(path.join(sub, ".empty"), "");
            extraMarkers++;
            console.info("Extra empty dir marker:", path.relative(dir, sub));
        }
    };
    visit(dir);
    console.info(
        "Empty-folder markers:",
        keepDirs.length,
        "required,",
        extraMarkers,
        "extra",
    );
}

/**
 * @param {string} mount
 * @returns {number}
 */
function freeBytes(mount) {
    const res = spawnSync("df", ["-B1", "--output=avail", mount], {
        encoding: "utf8",
    });
    const line = (res.stdout || "").trim().split("\n").pop() ?? "";
    const n = Number(line);
    if (!Number.isFinite(n)) {
        console.error("Could not read free space for", mount);
        process.exit(1);
    }
    return n;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function sha1File(filePath) {
    const res = spawnSync("sha1sum", [filePath], { encoding: "utf8" });
    if (res.status !== 0) {
        console.error("sha1sum failed", filePath, res.stderr || "");
        process.exit(1);
    }
    return res.stdout.split(/\s+/)[0];
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function sha256File(filePath) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
}

/**
 * @param {string} file
 * @returns {string}
 */
function gzRead(file) {
    return zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
}

/**
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
 * @returns {string[]}
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
        process.exit(res.status ?? 1);
    }
}

/** @typedef {import("child_process").SpawnSyncOptionsWithStringEncoding} SpawnSyncOptionsWithStringEncoding */

for (const step of activeSteps) {
    console.info(`\n===== Step ${step} =====`);
    await steps[step]();
}
console.info("\n==== Done ====");
