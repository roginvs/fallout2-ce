import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

// Shared by the NovaRain and official Sonora prepare scripts.
// Download and the first unpack stay in each script. Everything after the
// game root exists (drop native binaries, unpack big dats, violence level,
// index, gzip, hardlinks) lives here.

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const NATIVE_IGNORE_RES = [
    /\.exe$/i,
    /\.dll$/i,
    /\.ipa/i,
    /\.apk/i,
    /^fallout-sonora-/i,
];

// Dats smaller than this stay raw: the engine fetches and parses them whole.
export const SMALL_DAT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * @param {boolean} isDryRun
 */
export function createSonoraTools(isDryRun) {
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

    /**
     * @param {string} filePath
     * @param {string} dstDir
     */
    function unpackDat(filePath, dstDir) {
        if (isDryRun) {
            console.info(
                "(dry) would unpack",
                path.basename(filePath),
                "->",
                dstDir,
            );
            return;
        }
        // In-place unpack: the dat file and the destination directory share a path.
        const same = path.resolve(filePath) === path.resolve(dstDir);
        const out = same ? `${dstDir}.unpacking` : dstDir;
        fs.rmSync(out, { recursive: true, force: true });
        fs.mkdirSync(out, { recursive: true });
        // -t lowercases file names, matching existing game folders.
        run("dat-unpacker", ["-q", "-t", "-s", filePath, "-d", out]);
        fs.rmSync(filePath, { force: true });
        if (same) {
            fs.renameSync(out, dstDir);
        }
    }

    /**
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

    /**
     * Classify the game root. Large dats are unpacked, small dats stay files,
     * native binaries are dropped, anything else must be listed.
     *
     * @param {string} dir
     * @param {string[]} knownEntries
     * @param {RegExp[]} knownRes
     */
    function classifyGameRoot(dir, knownEntries, knownRes) {
        const native = [];
        const unknown = [];
        /** @type {string[]} */
        const dats = [];
        /** @type {string[]} */
        const copy = [];
        for (const entry of fs.readdirSync(dir)) {
            const resolved = path.join(dir, entry);
            if (NATIVE_IGNORE_RES.some((re) => re.test(entry))) {
                native.push(entry);
                continue;
            }
            if (/\.dat$/i.test(entry) && fs.statSync(resolved).isFile()) {
                if (fs.statSync(resolved).size >= SMALL_DAT_MAX_BYTES) {
                    dats.push(entry);
                } else {
                    copy.push(entry);
                    console.info("Small dat, keeping as a raw file:", entry);
                }
                continue;
            }
            if (
                knownEntries.includes(entry) ||
                knownRes.some((re) => re.test(entry))
            ) {
                copy.push(entry);
                continue;
            }
            unknown.push(entry);
        }
        return { native, unknown, dats, copy };
    }

    /**
     * @param {string} stagingRoot
     * @param {string} destDir
     * @param {string[]} knownEntries
     * @param {RegExp[]} knownRes
     * @param {string[]} [requiredDats]
     */
    function assembleInto(
        stagingRoot,
        destDir,
        knownEntries,
        knownRes,
        requiredDats = [],
    ) {
        const classified = classifyGameRoot(
            stagingRoot,
            knownEntries,
            knownRes,
        );
        console.info(
            "Dropping native files:",
            classified.native.join(", ") || "(none)",
        );
        console.info(
            "Unpacking large dats:",
            classified.dats.join(", ") || "(none)",
        );
        for (const name of requiredDats) {
            if (!classified.dats.includes(name)) {
                console.error("Expected", name, "to be a large dat");
                process.exit(1);
            }
        }
        if (classified.unknown.length > 0) {
            console.error(
                "Unknown entries, stopping:",
                classified.unknown.join(", "),
            );
            console.error("Add them to the script lists and re-run.");
            process.exit(1);
        }
        const inPlace = path.resolve(stagingRoot) === path.resolve(destDir);
        for (const entry of classified.native) {
            FsRemoveQuietly(path.join(stagingRoot, entry));
        }
        if (!inPlace) {
            for (const entry of classified.copy) {
                moveEntry(
                    path.join(stagingRoot, entry),
                    path.join(destDir, entry),
                );
            }
        }
        for (const dat of classified.dats) {
            unpackDat(
                path.join(stagingRoot, dat),
                path.join(destDir, dat),
            );
        }
        if (!inPlace && !isDryRun) {
            const leftovers = fs.readdirSync(stagingRoot);
            if (leftovers.length > 0) {
                console.error(
                    "Staging is not empty after move:",
                    leftovers.join(", "),
                );
                process.exit(1);
            }
        }
        return classified;
    }

    /**
     * Official 1.16 is aligned with Russian 1.13/1.15 on the keys we already
     * settled: maximum blood, the smaller art cache, and the short ddraw.ini.
     * A build that does not ship ddraw.ini is left without one.
     * NovaRain keeps its own sfall ddraw.ini and does not call this.
     *
     * @param {string} dir
     */
    function alignOfficialSonoraConfig(dir) {
        const cfgPath = path.join(dir, "fallout2.cfg");
        if (!fs.existsSync(cfgPath)) {
            console.info("No fallout2.cfg, config left unset:", dir);
        } else {
            const text = fs.readFileSync(cfgPath).toString("latin1");
            let next = text;
            if (/^violence_level=\d+/m.test(next)) {
                next = next.replace(/^violence_level=\d+/m, "violence_level=3");
            } else {
                console.info("fallout2.cfg has no violence_level, left as shipped");
            }
            if (/^art_cache_size=\d+/m.test(next)) {
                next = next.replace(/^art_cache_size=\d+/m, "art_cache_size=64");
            } else {
                console.info("fallout2.cfg has no art_cache_size, left as shipped");
            }
            if (next !== text) {
                console.info(
                    "fallout2.cfg aligned: violence_level=3, art_cache_size=64",
                );
                if (!isDryRun) {
                    fs.writeFileSync(cfgPath, Buffer.from(next, "latin1"));
                }
            }
        }
        const ddrawPath = path.join(dir, "ddraw.ini");
        if (!fs.existsSync(ddrawPath)) {
            console.info("No ddraw.ini in this build, leaving it absent");
            return;
        }
        console.info(
            "ddraw.ini replaced with the 1.13/1.15 SkipOpeningMovies stub",
        );
        if (!isDryRun) {
            fs.writeFileSync(ddrawPath, "[Misc]\nSkipOpeningMovies=1\n\n");
        }
    }

    /**
     * @param {string} dir
     */
    function noteDdraw(dir) {
        const ddrawPath = path.join(dir, "ddraw.ini");
        if (!fs.existsSync(ddrawPath)) {
            console.info("No ddraw.ini in this build, leaving it absent");
            return;
        }
        const ddraw = readCfg(ddrawPath);
        console.info(
            "ddraw.ini kept as shipped. IniConfigFolder=",
            ddraw["scripts"]?.iniconfigfolder ?? "??? (commented out)",
        );
        console.info(
            "  ConfigFile=",
            ddraw["misc"]?.configfile ?? "??? (commented out)",
        );
    }

    /**
     * @param {string} dir
     */
    function clearSavegames(dir) {
        const savegameDir = path.join(dir, "data", "SAVEGAME");
        if (!fs.existsSync(savegameDir)) {
            return;
        }
        for (const name of fs.readdirSync(savegameDir)) {
            FsRemoveQuietly(path.join(savegameDir, name));
        }
        console.info("Cleared SAVEGAME");
    }

    /**
     * asyncfetchfs builds the virtual tree only from files in index.txt, so an
     * empty folder never appears. Mark the engine paths and any other empty
     * directory.
     *
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
                console.info(
                    "Extra empty dir marker:",
                    path.relative(dir, sub),
                );
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
     * @param {string} dir
     * @returns {number}
     */
    function writeIndex(dir) {
        const lines = [];
        for (const relPath of listFiles(dir)) {
            const fullPath = path.join(dir, relPath);
            const size = fs.statSync(fullPath).size;
            const hash = sha256File(fullPath);
            lines.push(`${size} ${hash}  ./${relPath}`);
        }
        if (isDryRun) {
            console.info(`(dry) would write index with ${lines.length} files`);
            return lines.length;
        }
        fs.writeFileSync(path.join(dir, "index.txt"), lines.join("\n") + "\n");
        console.info(`Index written: ${lines.length} files`);
        return lines.length;
    }

    /**
     * @param {string} dir
     */
    function compressDir(dir) {
        run("pigz", ["-r", "--best", "."], { cwd: dir });
    }

    /**
     * @param {string} gamesDir
     */
    function hardlinkGames(gamesDir) {
        run(
            "node",
            [
                path.join(SCRIPT_DIR, "make-hardlinks-for-duplicated-files.mjs"),
                gamesDir,
                "nodry",
            ],
            { stdio: "inherit" },
        );
    }

    /**
     * @param {string} gamesDir
     */
    function validateGames(gamesDir) {
        run(
            "node",
            [
                path.join(SCRIPT_DIR, "validate-index-txt-checksums.mjs"),
                gamesDir,
            ],
            { stdio: "inherit" },
        );
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

    return {
        run,
        unpackDat,
        moveEntry,
        classifyGameRoot,
        assembleInto,
        alignOfficialSonoraConfig,
        noteDdraw,
        clearSavegames,
        createEmptyMarkers,
        writeIndex,
        compressDir,
        hardlinkGames,
        validateGames,
        FsRemoveQuietly,
        listFiles,
        sha256File,
        sha1File,
        gzRead,
        readCfg,
        freeBytes,
    };
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

/** @typedef {import("child_process").SpawnSyncOptionsWithStringEncoding} SpawnSyncOptionsWithStringEncoding */
