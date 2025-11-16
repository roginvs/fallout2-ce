import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";

console.info("Validate index.txt.gz checksums");
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

for (const dir of fs.readdirSync(DIR)) {
    const dirPath = path.join(DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) {
        console.info(`  - Skipping ${dirPath}, not a directory`);
        continue;
    }
    validateGameDir(dirPath);
}

console.info("Done");

/**
 * @param {string} gameDir
 */
function validateGameDir(gameDir) {
    console.info(`  - Validating ${path.basename(gameDir)}`);
    const indexTxtGzPath = path.join(gameDir, "index.txt.gz");
    if (!fs.existsSync(indexTxtGzPath)) {
        console.warn(`    index.txt.gz not found in ${gameDir}, skipping`);
        return;
    }
    const indexTxtGzBuffer = fs.readFileSync(indexTxtGzPath);
    const indexTxtBuffer = zlib.gunzipSync(indexTxtGzBuffer);
    const indexTxtContent = indexTxtBuffer.toString("utf-8");
    const lines = indexTxtContent
        .split("\n")
        .filter((line) => line.trim().length > 0);
    for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.{64})\s+(.+)$/);
        if (!m) {
            throw new Error(`Wrong line ${line}`);
        }
        const sizeStr = m[1];
        const sha256hash = m[2];
        const fName = m[3];

        const filePath = path.join(gameDir, fName) + ".gz";
        if (filePath === indexTxtGzPath) {
            // skip index.txt.gz itself
            continue;
        }
        if (!fs.existsSync(filePath)) {
            console.info("    - ERROR: Missing file:", filePath);
            continue;
        }

        const dataCompressed = fs.readFileSync(filePath);
        const data = zlib.unzipSync(dataCompressed);
        const size = data.length;

        if (sizeStr !== size.toString()) {
            console.info("    - ERROR: Size mismatch for file:", filePath);
            continue;
        }

        const hash = crypto.createHash("sha256").update(data).digest("hex");

        if (hash !== sha256hash) {
            console.info("    - ERROR: Checksum mismatch for file:", filePath);
            continue;
        }
    }
}
