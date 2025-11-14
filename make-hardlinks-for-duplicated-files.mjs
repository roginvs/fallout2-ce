import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";

console.info("Make hardlinks for duplicated .gz files script");
const dirArg = process.argv[2];
if (!dirArg) {
    console.error("Please provide directory path as first argument");
    process.exit(1);
}
const DIR = dirArg;
if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
    console.error("Provided path is not a directory: ", DIR);
    process.exit(1);
}

const DEBUG_SKIPPING = false;

console.info("Scanning directory: ", DIR);
const allFiles = scanFiles(DIR);
// console.info(allFiles);
console.info(
    "Total files scanned: " +
        allFiles.length +
        ", finding duplicates by hash..."
);
const duplicates = getGzDuplicates(DIR, allFiles);
// console.info(duplicates);

printStats(allFiles, duplicates);

for (const [hash, files] of duplicates.entries()) {
    makeDuplicatesSymlinks(DIR, hash, files);
}

console.info("Done.");

/**
 *
 * @param {string} startingDir
 * @param {string} hash
 * @param {ReturnType<typeof scanFiles>} files
 */
function makeDuplicatesSymlinks(startingDir, hash, files) {
    console.info(`Processing duplicate group: ${hash}, files: `);
    for (const file of files) {
        checkIndexGzContainsFile(startingDir, file.relPath, hash);
    }

    const originalFile = files[0];
    console.info(` - [original] ${originalFile.relPath}`);

    const originalFilePath = path.join(startingDir, originalFile.relPath);
    for (let i = 1; i < files.length; i++) {
        const duplicateFile = files[i];
        const duplicateFilePath = path.join(startingDir, duplicateFile.relPath);
        console.info(` - [duplicate] ${duplicateFile.relPath}`);
        fs.unlinkSync(duplicateFilePath);
        fs.linkSync(originalFilePath, duplicateFilePath);
    }
}

/**
 *
 * @param {string} baseDir
 * @param {string} relPath
 * @param {string} hash
 */
function checkIndexGzContainsFile(baseDir, relPath, hash) {
    const fileFirstDir = path.dirname(relPath).split(path.sep)[0];
    const indexGzPath = path.join(baseDir, fileFirstDir, "index.txt.gz");
    if (!fs.existsSync(indexGzPath)) {
        throw new Error(`index.txt.gz not found at path: ${indexGzPath}`);
    }

    const dataCompressed = fs.readFileSync(indexGzPath);
    const data = zlib.unzipSync(dataCompressed);
    const indexContent = data.toString("utf-8");
    const lines = indexContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    /** @type {string[]} */
    const sameHashNames = [];
    for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.{64})\s+(.+)$/);
        if (!m) {
            throw new Error(`Wrong line ${line}`);
        }
        const sizeStr = m[1];
        const sha256hash = m[2];
        const fName = m[3];

        if (sha256hash !== hash) {
            continue;
        }
        sameHashNames.push(fName);
    }
    if (sameHashNames.length === 0) {
        throw new Error(
            `File ${relPath} with hash ${hash} not found in index.txt.gz`
        );
    }
    const expectedFilePathInIndex =
        "./" +
        relPath
            .substring(fileFirstDir.length + path.sep.length)
            .replace(/\.gz$/, "");
    if (!sameHashNames.includes(expectedFilePathInIndex)) {
        // console.info({
        //   expectedFilePathInIndex,
        //   sameHashNames,
        // });
        throw new Error(
            `File ${relPath} with hash ${hash} not found in index.txt.gz, looked for ${expectedFilePathInIndex}, found: ${sameHashNames.join(
                ", "
            )}`
        );
    }

    return true;
}

/**
 *
 * @param {ReturnType<typeof scanFiles>} allFiles
 * @param {ReturnType<typeof getGzDuplicates>} duplicates
 */
function printStats(allFiles, duplicates) {
    let totalFilesSize = 0;
    let totalUniqInodeSize = 0;
    /** @type {Set<bigint>} */
    const seenInodes = new Set();
    let totalGzCompressedSize = 0;
    let totalGzUnpackedSize = 0;

    let totalUniqGroups = 0;

    let possibleSizeSavings = 0;

    for (const file of allFiles) {
        totalFilesSize += file.size;
        if (!seenInodes.has(file.inode)) {
            totalUniqInodeSize += file.size;
            seenInodes.add(file.inode);
        }
        if (file.gzCrc32 !== null && file.gzSize32 !== null) {
            totalGzCompressedSize += file.size;
            totalGzUnpackedSize += file.gzSize32;
        }
    }

    for (const files of duplicates.values()) {
        totalUniqGroups += 1;

        // Keeping one file
        const sizeSavings =
            files.reduce((acc, f) => acc + f.size, 0) - files[0].size;
        possibleSizeSavings += sizeSavings;
    }

    const printSize = (/** @type {number} */ size) => {
        if (size > 1e9) {
            return (size / 1e9).toFixed(2) + " GB";
        } else if (size > 1e6) {
            return (size / 1e6).toFixed(2) + " MB";
        } else if (size > 1e3) {
            return (size / 1e3).toFixed(2) + " KB";
        } else {
            return size + " B";
        }
    };

    console.info("Total files size: ", printSize(totalFilesSize));
    console.info("Total unique inode size: ", printSize(totalUniqInodeSize));
    console.info(
        "Total .gz compressed size: ",
        printSize(totalGzCompressedSize)
    );
    console.info("Total .gz unpacked size: ", printSize(totalGzUnpackedSize));
    console.info("Total duplicated groups found: ", totalUniqGroups);
    console.info(
        "Possible size savings by removing duplicates: ",
        printSize(possibleSizeSavings)
    );
}

/**
 * @param {string} startingDir
 */

function scanFiles(startingDir) {
    /** @type {({
     * relPath: string,
     * size: number,
     * gzCrc32: number | null,
     * gzSize32: number | null,
     * inode: bigint
     * }[])} */
    const out = [];

    /**
     * @param {string} dirPath
     */
    function scanDir(dirPath) {
        const names = fs.readdirSync(dirPath);
        for (const name of names) {
            const fPath = path.join(dirPath, name);
            let stat;
            try {
                stat = fs.statSync(fPath);
            } catch (e) {
                console.info("Problem with path: ", fPath);
                continue;
            }

            if (stat.isDirectory()) {
                scanDir(fPath);
                continue;
            } else if (stat.isFile()) {
                if (
                    DEBUG_SKIPPING &&
                    (stat.size < 100000000 || stat.size > 300000000)
                ) {
                    continue;
                }

                /** @type {number | null} */
                let gzCrc32 = null;

                /** @type {number | null} */
                let gzSize32 = null;

                if (fPath.endsWith(".gz")) {
                    const fd = fs.openSync(fPath, "r");

                    const chunkSize = 8;
                    const buffer = Buffer.alloc(chunkSize);
                    fs.readSync(fd, buffer, 0, chunkSize, 0);

                    // That one always differs
                    const time = buffer.readInt32LE(4);

                    fs.readSync(
                        fd,
                        buffer,
                        0,
                        chunkSize,
                        stat.size - chunkSize
                    );
                    gzCrc32 = buffer.readUInt32LE(0);
                    gzSize32 = buffer.readUInt32LE(4);
                }
                const statBigInt = fs.statSync(fPath, { bigint: true });
                out.push({
                    relPath: path.relative(startingDir, fPath),
                    size: stat.size,
                    gzCrc32: fPath.endsWith(".gz") ? gzCrc32 : null,
                    gzSize32: fPath.endsWith(".gz") ? gzSize32 : null,
                    inode: statBigInt.ino,
                });
            } else {
                console.warn("Unknown file type: ", fPath);
            }
        }
    }

    scanDir(startingDir);

    return out;
}

/**
 * @param {string} startingDir
 * @param {ReturnType<typeof scanFiles>} fileList
 */
function getGzDuplicates(startingDir, fileList) {
    // First, ground by crc32 and size
    /** @type {Map<string, ReturnType<typeof scanFiles>>} */
    const crcSizeMap = new Map();

    const keyFn = (
        /** @type { ReturnType<typeof scanFiles>[number] } */ file
    ) => `${file.gzCrc32} - ${file.gzSize32}`;

    for (const file of fileList) {
        if (file.gzCrc32 === null || file.gzSize32 === null) {
            continue;
        }
        const key = keyFn(file);
        const list = crcSizeMap.get(key) || [];
        list.push(file);
        crcSizeMap.set(key, list);
    }

    /** @type {Map<string, ReturnType<typeof scanFiles>>} */
    const sha256filesMap = new Map();
    for (const [_, files] of crcSizeMap.entries()) {
        if (files.length < 2) {
            continue;
        }
        for (const file of files) {
            const dataCompressed = fs.readFileSync(
                path.join(startingDir, file.relPath)
            );
            const data = zlib.unzipSync(dataCompressed);
            const hash = crypto.createHash("sha256").update(data).digest("hex");

            const arr = sha256filesMap.get(hash) || [];
            arr.push(file);
            sha256filesMap.set(hash, arr);
        }
    }

    // Health-check, all groups must have at least 2 files and the same size&crc32
    for (const [hash, files] of sha256filesMap.entries()) {
        if (files.length < 2) {
            sha256filesMap.delete(hash);
            continue;
        }
        const refUnpackedSize = files[0].gzSize32;
        const refCrc32 = files[0].gzCrc32;
        for (const file of files) {
            if (
                file.gzSize32 !== refUnpackedSize ||
                file.gzCrc32 !== refCrc32
            ) {
                throw new Error(
                    `Health-check failed for hash ${hash}: file ${file.relPath} has different size/crc32`
                );
            }
        }
    }

    // Now, for each list remove inode duplicates (hardlinks)
    for (const [sha256, files] of sha256filesMap.entries()) {
        /** @type {typeof files} */
        const filteredList = [];
        for (const file of files) {
            if (!filteredList.find((f) => f.inode === file.inode)) {
                filteredList.push(file);
            }
        }
        if (filteredList.length < 2) {
            sha256filesMap.delete(sha256);
        } else {
            sha256filesMap.set(sha256, filteredList);
        }
    }

    return sha256filesMap;
}
