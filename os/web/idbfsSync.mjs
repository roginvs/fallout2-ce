/**
 * Tell the user a save to IndexedDB failed. Always logs; shows alert() when
 * available so a silent reject cannot look like a successful save.
 *
 * @param {unknown} err
 * @returns {string} message shown to the user
 */
export function reportIdbfsWriteError(err) {
    const detail =
        err instanceof Error
            ? err.message
            : err != null
              ? String(err)
              : "unknown error";
    const message = `IDBFS save failed: ${detail}`;
    console.error(message, err);
    if (typeof alert === "function") {
        alert(message);
    }
    return message;
}

/**
 * Forward IDBFS.syncfs errors and ask for persistent storage afterwards.
 * persist() is not a write: refusal or a missing API still calls callback once
 * without an error.
 *
 * @param {{ syncfs: Function }} idbfs
 */
export function installIdbfsSyncfsWrapper(idbfs) {
    const originalSyncfs = idbfs.syncfs;
    idbfs.syncfs = (
        /** @type {any} */ mount,
        /** @type {any} */ populate,
        /** @type {any} */ callback,
    ) => {
        originalSyncfs(mount, populate, (/** @type {any} */ err) => {
            if (err) {
                callback(err);
                return;
            }
            if (!navigator.storage || !navigator.storage.persist) {
                console.info("IDBFS persist() is not available");
                callback();
                return;
            }
            navigator.storage
                .persist()
                .then((granted) => {
                    if (granted) {
                        console.info("IDBFS persist() granted");
                    } else {
                        console.warn("IDBFS persist() was not granted");
                    }
                })
                .catch((e) => console.warn("IDBFS persist() failed", e))
                .then(() => callback());
        });
    };
}
