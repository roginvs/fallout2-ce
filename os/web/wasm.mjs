import { fetchArrayBufProgress } from "./fetchArrayBufProgress.mjs";
import { loadJs } from "./loadJs.mjs";
import { setErrorState } from "./setErrorState.mjs";
import { setStatusText } from "./setStatusText.mjs";

/** @type {() => void} */
let resolveWasm;
/** @type {(reason: any) => void} */
let rejectWasm;
/** @type {Promise<void>} */
const wasmReady = new Promise((resolve, reject) => {
    resolveWasm = resolve;
    rejectWasm = reject;
});
// Report failures before Start is clicked without consuming the rejection.
wasmReady.catch((e) => {
    console.warn(e);
    setErrorState(e);
});

export function waitForWasm() {
    return wasmReady;
}

function initializeGlobalModuleObject() {
    if (/** @type {any} */ (window).Module) {
        throw new Error(`This file must be the first to load`);
    }

    const scanUnimplemented =
        new URLSearchParams(window.location.search).get(
            "scan-unimplemented",
        ) === "1";

    /** @type {any} */ (window).Module = {
        arguments: scanUnimplemented ? ["--scan-unimplemented"] : [],
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
            if (typeof document.exitPointerLock === "function") {
                document.exitPointerLock();
            }
            if (typeof document.exitFullscreen === "function") {
                document.exitFullscreen().catch((e) => {});
            }
            if (code === 0) {
                setStatusText(`Exited with code ${code}`);
                window.location.reload();
            } else {
                setErrorState(new Error(`Exited with code ${code}`));
            }
        },

        instantiateWasm: (
            /** @type {WebAssembly.Imports} */ info,
            /** @type {(instance: WebAssembly.Instance, module: WebAssembly.Module) => void} */ receiveInstance,
        ) => {
            (async () => {
                setStatusText(`Loading WASM binary`);

                const arrayBuffer = await fetchArrayBufProgress(
                    findWasmBinary(),
                    false,
                    (loaded, total) =>
                        setStatusText(
                            `WASM binary loading ${Math.floor(
                                (loaded / total) * 100,
                            )}%`,
                        ),
                );

                // await new Promise(r => setTimeout(r, 10000));

                setStatusText("Instantiating WebAssembly");

                // We want our own title
                info.env.emscripten_set_window_title = () => {};

                const inst = await WebAssembly.instantiate(
                    /** @type {Uint8Array<ArrayBuffer>} */
                    (arrayBuffer),
                    info,
                );
                setStatusText("");
                receiveInstance(inst.instance, inst.module);
            })().then(resolveWasm, rejectWasm);
        },
    };
}

export async function loadEmscripten() {
    try {
        initializeGlobalModuleObject();

        setStatusText("Loading emscripten");
        await loadJs("./fallout2-ce.js");
    } catch (e) {
        rejectWasm(e);
        throw e;
    }
}
