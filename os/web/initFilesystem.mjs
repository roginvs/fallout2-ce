import { ASYNCFETCHFS } from "./asyncfetchfs.mjs";
import { knownInitialFiles } from "./config.initialFiles.mjs";
import { configuration } from "./config.mjs";
import { createFetcher } from "./fetcher.mjs";
import { getCacheName } from "./gamecache.mjs";
import { setStatusText } from "./setStatusText.mjs";

const GAME_PATH = "./game/";

/**
 *
 * @param {Uint8Array} indexUnpackedRaw
 */
export function parseIndex(indexUnpackedRaw) {
    const indexRaw = new TextDecoder("windows-1251").decode(indexUnpackedRaw);

    const filesIndex = indexRaw
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x)
        .map((line) => {
            const m = line.match(/^(\d+)\s+(.{64})\s+(.+)$/);
            if (!m) {
                throw new Error(`Wrong line ${line}`);
            }
            const sizeStr = m[1];
            const sha256hash = m[2];
            const fName = m[3];

            return {
                name: fName.startsWith("./") ? fName.slice(2) : fName,
                size: parseInt(sizeStr),
                sha256hash,
                /** @type {null | Uint8Array} */
                contents: null,
            };
        });
    return filesIndex;
}

/**
 * @param {string} folderName
 * @param {string} filesVersion
 */
export async function downloadAllGameFiles(folderName, filesVersion) {
    const fetcher = createFetcher(
        GAME_PATH + folderName + "/",
        getCacheName(folderName, filesVersion),
        configuration.useGzip,
        (text) => {
            if (text) {
                setStatusText(text);
            } else {
                // Do not update status, just a visual fix
                // Do not forget to clear status when this function returns
            }
        },
        null,
        filesVersion,
    );

    const indexUnpackedRaw = await fetcher("index.txt");

    const filesIndex = parseIndex(indexUnpackedRaw)
        .filter((file) => file.name !== "index.txt")
        .filter((file) => {
            // This is workaround for Nevada to skip files in cp1251 encoding
            if (file.name.startsWith("!docs/")) {
                return false;
            }

            return true;
        });

    /**
     * We want to fetch small files in multiple simultaneous threads
     * but still fetch big files sequantially.
     * This is done to prevent crashing on devices with
     * small amount of memory like tables.
     */
    const WORKERS_SIZE_THRESHOLD = 1024 * 1024;
    const filesForWorkers = filesIndex.filter(
        (f) => f.size < WORKERS_SIZE_THRESHOLD,
    );
    const filesForMainBecauseBig = filesIndex
        .filter((f) => f.size >= WORKERS_SIZE_THRESHOLD)
        .sort(
            (a, b) =>
                // Let's start with smallest files first because they are more likely to be used
                a.size - b.size,
        );

    console.info(`Fetching small files`);
    let availableTaskIndex = 0;
    async function worker() {
        while (true) {
            const task = filesForWorkers[availableTaskIndex];
            if (!task) {
                setStatusText(null);
                return;
            }
            availableTaskIndex++;
            await fetcher(task.name, task.size, task.sha256hash);
        }
    }
    await Promise.all(new Array(10).fill(0).map(() => worker()));

    console.info("Fetching big files");
    for (const bigFile of filesForMainBecauseBig) {
        await fetcher(bigFile.name, bigFile.size, bigFile.sha256hash);
    }

    setStatusText(null);
}

/**
 * @returns {[ReturnType<typeof createFetcher>, import("./fetcher.mjs").OnFetching]}
 */
function usePreloadingFetcher(
    /** @type {ReturnType<typeof createFetcher>} */
    fetcher,
    /** @type {string[]} */
    preloadFiles,
    /** @type {string[]} */
    allFiles,
    /** @type {(text: string | null) => void} */
    setStatusText,
) {
    /*
    Given the original fetcher it will return a pre-loading fetcher

    It will keep 1 downloading slot for original requests (i.e. made from returned func)

    Besides this, it will immeditely download preloadFiles in several slots

    When it went through all preloadFiles it will continue downloading allFiles,
      but only when fetcher is calm for few seconds

    It also will not download the same file simultaneously

    onFetching = function which original fetcher should call
    Returns [newFetcher, onFetching]
    */

    const MAX_TOTAL_SLOTS = 5;
    const PRELOADING_SLOTS = MAX_TOTAL_SLOTS - 1;
    const ALL_LOADING_SLOTS = 2;

    /**
     * Slot 0 is the main game downloading slot
     *
     * @type {(
     *   {
     *      filePath: string,
     *      status: string | null,
     *      onReady: Promise<Uint8Array>
     *   }
     *   | null
     * )[]}
     */
    const slots = Array.from({ length: MAX_TOTAL_SLOTS }).fill(null);

    /** @type {ReturnType<typeof createFetcher>} */
    const gameFetcher = (filePath, expectedSize, expectedHash) => {
        if (slots[0] !== null) {
            throw new Error("Internal error: game downloadin slot is occupied");
        }

        const existingDownloading = slots.find(
            (slot) => slot && slot.filePath === filePath,
        );
        if (existingDownloading) {
            return existingDownloading.onReady;
        }

        const downloaded = Promise.resolve().then(() =>
            fetcher(filePath, expectedSize, expectedHash),
        );
        slots[0] = {
            filePath,
            status: "",
            onReady: downloaded,
        };

        return downloaded;
    };

    return [
        gameFetcher,
        (fileName, status) => {
            const slotIndex = slots.findIndex(
                (slot) => slot && slot.filePath === fileName,
            );
            if (slotIndex === -1) {
                throw new Error(`Internal error: not found in slots`);
            }
            if (status === null) {
                slots[slotIndex] = null;
            } else {
                const slot = slots[slotIndex];
                if (slot === null) {
                    throw new Error(
                        "Never happens: we already checked that slot is not null",
                    );
                }
                slot.status = status;
            }

            setStatusText(
                slots
                    .map(
                        (slot, index) =>
                            slot && `${index} ${slot.filePath} ${slot.status}`,
                    )
                    .filter((x) => x)
                    .join("\n"),
            );
        },
    ];
}

/**
 * @typedef { (index: ReturnType<typeof parseIndex>) => Promise<ReturnType<typeof parseIndex>> } FileIndexTransformer
 */

/**
 *
 * @param {string} folderName
 * @param {string} filesVersion
 * @param {FileIndexTransformer} fileIndexTransformer
 * @param {import("./fetcher.mjs").FileTransformer} fileTransformer
 */
export async function initFilesystem(
    folderName,
    filesVersion,
    fileIndexTransformer,
    fileTransformer,
) {
    setStatusText("Fetching files index");

    /** @type {import("./fetcher.mjs").OnFetching} */
    let onFetching = (fileName, status) => {
        setStatusText(status !== null ? `${fileName} ${status}` : "");
    };
    let fetcher = createFetcher(
        GAME_PATH + folderName + "/",
        getCacheName(folderName, filesVersion),
        configuration.useGzip,
        (filePath, status) => {
            onFetching(filePath, status);
        },
        fileTransformer,
        filesVersion,
    );

    const indexUnpackedRaw = await fetcher("index.txt");

    const parsedUntransformedIndex = parseIndex(indexUnpackedRaw);
    const filesIndex = await fileIndexTransformer(parsedUntransformedIndex);

    [fetcher, onFetching] = usePreloadingFetcher(
        fetcher,
        knownInitialFiles[folderName] || [],
        [],
        setStatusText,
    );

    setStatusText("Mounting file systems");

    FS.chdir("/");

    FS.mkdir(folderName);

    FS.mount(
        ASYNCFETCHFS,
        {
            files: filesIndex,
            options: {
                fetcher: (
                    /** @type {string} */
                    filePath,
                    /** @type {number|undefined} */ expectedSize = undefined,
                    /** @type {string|undefined} */ expectedSha256hash = undefined,
                ) => {
                    // Use this to collect information about startup files
                    if (false) {
                        // @ts-ignore
                        window.files = window.files || {};
                        // @ts-ignore
                        window.files[folderName] =
                            // @ts-ignore
                            window.files[folderName] || [];
                        // @ts-ignore
                        window.files[folderName].push(path);
                    }
                    return fetcher(filePath, expectedSize, expectedSha256hash);
                },
            },
        },
        "/" + folderName,
    );

    FS.mount(IDBFS, {}, "/" + folderName + "/data/SAVEGAME");

    FS.mount(MEMFS, {}, "/" + folderName + "/data/MAPS");
    FS.mount(MEMFS, {}, "/" + folderName + "/data/proto/items");
    FS.mount(MEMFS, {}, "/" + folderName + "/data/proto/critters");

    FS.chdir("/" + folderName);

    const savegameNodeMount = FS.lookupPath("/" + folderName + "/data/SAVEGAME")
        .node.mount;

    await new Promise((resolve) => {
        // The FS.syncfs do not understand nested mounts so we need to find mount node directly
        IDBFS.syncfs(savegameNodeMount, true, () => {
            resolve(null);
        });
    });

    // This function is called from C code
    /** @type {any} */ (window).write_idbfs = async () => {
        console.info("Writing IDBFS");
        await new Promise((resolve, reject) => {
            IDBFS.syncfs(savegameNodeMount, false, (/** @type {any} */ err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(null);
                }
            });
        });
        console.info("IDBFS saved");
    };

    {
        const originalSyncfs = IDBFS.syncfs;
        IDBFS.syncfs = (
            /** @type {any} */ mount,
            /** @type {any} */ populate,
            /** @type {any} */ callback,
        ) => {
            originalSyncfs(mount, populate, () => {
                if (!navigator.storage || !navigator.storage.persist) {
                    callback();
                    return;
                }
                navigator.storage
                    .persist()
                    .catch((e) => console.warn(e))
                    .then(() => callback());
            });
        };
    }

    // To save UDBFS into indexeddb do this:
    // IDBFS.syncfs(FS.lookupPath('/app/data/SAVEGAME').node.mount, false, () => console.info('saved'))
}
