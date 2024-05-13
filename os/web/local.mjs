import { asyncfs } from "./asyncfs.mjs";
import {
    addBackquoteAsEscape,
    addRightMouseButtonWorkaround,
} from "./hotkeys_and_workarounds.mjs";
import { resizeCanvas } from "./resizeCanvas.mjs";
import { setErrorState } from "./setErrorState.mjs";
import { setStatusText } from "./setStatusText.mjs";
import { initializeGlobalModuleObject, loadEmscriptenJs } from "./wasm.mjs";

function startLocalFsMenu() {
    const menuDiv = document.getElementById("menu");
    if (!menuDiv) {
        setStatusText("Error: No menu div!");
        throw new Error(`No menu div!`);
    }

    setStatusText(null);

    menuDiv.innerHTML = `
<div>
<br/>
<br/>
<br/>
Select folder    
<input type="file" id="folderInput" webkitdirectory directory></input>
    
</div>

`;

    const folderInput = /** @type {HTMLInputElement} */ (
        document.getElementById("folderInput")
    );

    folderInput.addEventListener("change", (e) => {
        if (!folderInput.files) {
            return;
        }

        /** @type {Map<string, () => Promise<Uint8Array>>} */
        const getData = new Map();

        /** @type {import("./asyncfs.types").AsyncFsFile[]} */
        const filesIndex = [];

        let folderName = "";

        for (let i = 0; i < folderInput.files.length; i++) {
            const file = folderInput.files[i];

            const fullName = file.webkitRelativePath;
            getData.set(fullName, () =>
                file.arrayBuffer().then((buf) => new Uint8Array(buf))
            );

            filesIndex.push({
                filePath: fullName,
                size: file.size,
                content: null,
            });

            const parts = fullName.split("/");
            if (parts.length > 1) {
                if (!folderName) {
                    folderName = parts[0];
                } else {
                    if (folderName !== parts[0]) {
                        throw new Error("Multiple folders selected");
                    }
                }
            }
        }

        if (!folderName) {
            throw new Error("No folder name");
        }

        FS.chdir("/");
        const mountName = "app";
        FS.mkdir(mountName);

        /** @type {import("./asyncfs.types").AsyncFsMountOptions}} */
        const asyncfs_mount_options = {
            files: filesIndex,
            config: {
                loadFile: async (filePath, expectedSize) => {
                    const dataPromiseFactory = getData.get(filePath);
                    if (!dataPromiseFactory) {
                        throw new Error("File not found in getData map");
                    }
                    setStatusText(`${filePath}`);
                    const data = await dataPromiseFactory();
                    setStatusText(null);
                    return data;
                },
                saveFile: async (file, data) => {
                    throw new Error("Not implemented");
                },
            },
        };
        FS.mount(asyncfs, asyncfs_mount_options, "/" + mountName);

        FS.chdir("/" + mountName + "/" + folderName);

        setStatusText("Starting");
        removeRunDependency("initialize-filesystems");

        // === copy-paste from menu
        // @ts-ignore
        document.getElementById("menu").style.display = "none";

        const canvas = /** @type {HTMLCanvasElement | null} */ (
            document.getElementById("canvas")
        );
        if (!canvas) {
            throw new Error(`No canvas!`);
        }
        canvas.style.display = "";
        // === end copy-paste
    });
}

// === copy-paste from index
window.addEventListener("error", (err) => {
    console.info("error", err);
    setErrorState(err.error);
});
window.addEventListener("unhandledrejection", (err) => {
    console.info("unhandledrejection", err);
});

initializeGlobalModuleObject();
await loadEmscriptenJs();

addRightMouseButtonWorkaround();
addBackquoteAsEscape();

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
// === end of copy-paste

startLocalFsMenu();
