import { fetchArrayBufProgress } from "./fetchArrayBufProgress.mjs";
import { loadJs } from "./loadJs.mjs";
import { setErrorState } from "./setErrorState.mjs";
import { setStatusText } from "./setStatusText.mjs";

/** @type {typeof _fd_read | null} */
let fd_read_custom_func = null;

export function setCustomFdRead(/** @type {typeof _fd_read} */ func) {
    fd_read_custom_func = func;
}

function initializeGlobalModuleObject() {
    if (/** @type {any} */ (window).Module) {
        throw new Error(`This file must be the first to load`);
    }

    /** @type {any} */ (window).Module = {
        canvas: document.getElementById("canvas"),
        setStatus: (/** @type {string} */ msg) =>
            msg && console.info("setStatus", msg),
        preRun: [],
        preInit: [() => addRunDependency("initialize-filesystems")],
        onRuntimeInitialized: () => {},
        onAbort: (/** @type {string} */ what) => {
            console.warn("aborted!", what);
        },
        onExit: (/** @type {number} */ code) => {
            console.info(`Exited with code ${code}`);
            document.exitPointerLock();
            document.exitFullscreen().catch((e) => {});
            if (code === 0) {
                setStatusText(`Exited with code ${code}`);
                window.location.reload();
            } else {
                setErrorState(new Error(`Exited with code ${code}`));
            }
        },

        instantiateWasm: (
            /** @type {WebAssembly.Imports} */ info,
            /** @type {(instance: WebAssembly.Instance, module: WebAssembly.Module) => void} */ receiveInstance
        ) => {
            (async () => {
                setStatusText(`Loading WASM binary`);

                const arrayBuffer = await fetchArrayBufProgress(
                    wasmBinaryFile,
                    false,
                    (loaded, total) =>
                        setStatusText(
                            `WASM binary loading ${Math.floor(
                                (loaded / total) * 100
                            )}%`
                        )
                );

                // await new Promise(r => setTimeout(r, 10000));

                setStatusText("Instantiating WebAssembly");

                const newImports = {
                    /** @type {typeof _fd_read} */
                    fd_read: (fd, iovs, iovsLen, nread) => {
                        if (fd_read_custom_func) {
                            return fd_read_custom_func(
                                fd,
                                iovs,
                                iovsLen,
                                nread
                            );
                        }

                        return _fd_read(fd, iovs, iovsLen, nread);
                    },
                };

                // Current info already have Asyncify.instrumentWasmImports() applied
                // So we need to apply it for new imports
                Asyncify.instrumentWasmImports(newImports);

                const monkeyPatchedInfo = {
                    ...info,
                    wasi_snapshot_preview1: {
                        ...info.wasi_snapshot_preview1,
                        ...newImports,
                    },
                };

                const inst = await WebAssembly.instantiate(
                    arrayBuffer,
                    monkeyPatchedInfo
                );
                setStatusText("");
                receiveInstance(inst.instance, inst.module);
            })().catch((e) => {
                console.warn(e);
                setErrorState(e);
            });
        },
    };
}

export async function loadEmscripten() {
    initializeGlobalModuleObject();

    setStatusText("Loading emscripten");
    await loadJs("./fallout2-ce.js");
}
