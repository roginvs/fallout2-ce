import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import {
    createSonoraTools,
} from "./prepare-sonora-common.mjs";

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
        "Steps: preflight download unzip assemble clean clone ruspack pack compress hardlinks validate report all\n" +
        "Pipeline: build the (English) base, copy it to the second folder, add\n" +
        "the russian language pack on top only there, then pack+gz both and run\n" +
        "the global hardlink deduplication last." +
        "Default is dry-run; pass 'nodry' as third argument to actually do things.",
);
if (isDryRun) {
    console.info("Running in DRY-RUN mode, no files will be changed.");
} else {
    console.info("NOT a dry-run, files will be changed!");
}

const {
    run,
    unpackDat,
    assembleInto,
    createEmptyMarkers,
    writeIndex,
    compressDir,
    hardlinkGames,
    validateGames,
    listFiles,
    sha256File,
    gzRead,
    readCfg,
    FsRemoveQuietly,
} = createSonoraTools(isDryRun);

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

// Files and directories we know how to handle in the unpacked repack.
// Anything else stops the assemble step and asks for our attention.
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
    "clean",
    "clone",
    "ruspack",
    "pack",
    "compress",
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
        assembleInto(
            stagingRoot,
            EN_DIR,
            KNOWN_COPY_ENTRIES,
            [...KNOWN_COPY_RES, ...KNOWN_COPY_DAT_RES],
        );
        if (!isDryRun) {
            fs.rmSync(UNPACKED_DIR, { recursive: true });
            console.info("Staging cleaned");
        }
    },

    clone() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        if (fs.existsSync(RU_DIR) && fs.readdirSync(RU_DIR).length > 0) {
            console.error("RU folder is not empty:", RU_DIR);
            console.error("Remove it to re-clone.");
            process.exit(1);
        }
        // Plain deep copy (no -l): the russian pack is added on top of this
        // copy later, the hardlink deduplication runs at the very end and
        // links what is identical then.
        run("cp", ["-a", EN_DIR, RU_DIR]);
        if (isDryRun) {
            return;
        }
        const enCount = listFiles(EN_DIR).length;
        const ruCount = listFiles(RU_DIR).length;
        console.info(`Cloned: EN files ${enCount} -> RU files ${ruCount}`);
        if (enCount !== ruCount) {
            console.error("Clone file count mismatch!");
            process.exit(1);
        }
    },

    ruspack() {
        if (isDryRun && !fs.existsSync(RU_DIR)) {
            console.info("(dry) RU_DIR does not exist yet (clone runs first)");
            return;
        }
        if (!fs.existsSync(RU_DIR)) {
            console.error("RU folder does not exist, run clone first");
            process.exit(1);
        }
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
        unpackDat(datPath, path.join(RU_DIR, "mods", "fs_russian.dat"));
        fs.rmSync(tempDir, { recursive: true });
        setRussianModState(RU_DIR, true);
        createEmptyMarkers(RU_DIR);
        const top = fs.readdirSync(path.join(RU_DIR, "mods", "fs_russian.dat"));
        console.info("fs_russian.dat top level:", top.join(", "));
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

        // The base build is the English one: the russian language mod must
        // not be active here, it is added to the RU folder only.
        setRussianModState(EN_DIR, false);
        createEmptyMarkers(EN_DIR);
    },

    pack() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        for (const [dir, label] of [
            [EN_DIR, "EN"],
            [RU_DIR, "RU"],
        ]) {
            if (!fs.existsSync(dir)) {
                console.error(`${label} folder is missing:`, dir);
                process.exit(1);
            }
            console.info(label);
            writeIndex(dir);
        }
    },

    compress() {
        for (const [dir, label] of [
            [EN_DIR, "EN"],
            [RU_DIR, "RU"],
        ]) {
            if (isDryRun && !fs.existsSync(dir)) {
                console.info(`(dry) ${label} missing, gzip skipped`);
                continue;
            }
            compressDir(dir);
            console.info(`${label} compressed`);
        }
    },

    hardlinks() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        hardlinkGames(GAMES_DIR);
    },

    async validate() {
        if (isDryRun && !fs.existsSync(EN_DIR)) {
            console.info("(dry) EN_DIR does not exist yet, step is a no-op");
            return;
        }
        validateGames(GAMES_DIR);
        const cfg = gzRead(path.join(EN_DIR, "fallout2.cfg.gz"));
        console.info(
            "fallout2.cfg from pack:\n",
            cfg.split("\n").slice(0, 10).join("\n"),
        );

        // In the base (English) build the russian mod must be disabled,
        // in the russian one it must be enabled.
        const enOrder = gzRead(path.join(EN_DIR, "mods", "mods_order.txt.gz"));
        console.info(
            "EN mods_order.txt:",
            enOrder.split("\n").filter(Boolean).join(" | "),
        );
        const enHasPack = fs.existsSync(
            path.join(EN_DIR, "mods", "fs_russian.dat"),
        );
        console.info("EN has fs_russian.dat (must be false):", enHasPack);

        const ruOrder = gzRead(path.join(RU_DIR, "mods", "mods_order.txt.gz"));
        console.info(
            "RU mods_order.txt:",
            ruOrder.split("\n").filter(Boolean).join(" | "),
        );
        const ruText = path.join(
            RU_DIR,
            "mods",
            "fs_russian.dat",
            "text",
            "russian",
        );
        console.info("RU text/russian exists:", fs.existsSync(ruText));
        for (const [dir, label] of [
            [EN_DIR, "EN"],
            [RU_DIR, "RU"],
        ]) {
            const noDats = listFiles(dir).every((p) => !/\.dat$/i.test(p));
            console.info(`${label} no raw .dat files left:`, noDats);
        }
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
 * Enable or disable the russian language mod in a folder's mods_order.txt.
 * The base build ships English only (disabled), the russian folder gets it
 * enabled. The mod itself may be absent; only the order line is touched.
 *
 * @param {string} dir Game folder root.
 * @param {boolean} enabled
 */
function setRussianModState(dir, enabled) {
    const orderPath = path.join(dir, "mods", "mods_order.txt");
    if (!fs.existsSync(orderPath)) {
        console.error("mods_order.txt is missing:", orderPath);
        process.exit(1);
    }
    let order = fs.readFileSync(orderPath, "utf8");
    if (enabled) {
        order = order.replace(/^;+fs_russian\.dat/m, "fs_russian.dat");
        if (!/^fs_russian\.dat/m.test(order)) {
            order += "\nfs_russian.dat\n";
        }
    } else {
        order = order.replace(/^fs_russian\.dat/m, ";fs_russian.dat");
    }
    fs.writeFileSync(orderPath, order);
    const state = enabled ? "enabled" : "disabled";
    console.info(
        `mods_order.txt (${path.basename(dir)}): fs_russian.dat ${state}`,
    );
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

for (const step of activeSteps) {
    console.info(`\n===== Step ${step} =====`);
    await steps[step]();
}
console.info("\n==== Done ====");
