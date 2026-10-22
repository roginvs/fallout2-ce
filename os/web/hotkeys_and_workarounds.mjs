/**
 * The engine enables relative mouse mode (dinput.cc: SDL_SetRelativeMouseMode)
 * from its own callbacks (timers/rAF, see emscripten callUserCallback), not from
 * the user's click handler. SDL then asks for pointer lock through Emscripten
 * (SDL_emscriptenmouse.c: emscripten_request_pointerlock), and the glue calls
 * `canvas.requestPointerLock()` without catching anything. When the request runs
 * outside of a user gesture, or while the lock is still held (Escape released it
 * a moment ago, or a double click), browsers reject it with
 * InUseAttributeError ("Pointer is already locked") or NotAllowedError
 * ("Pointer lock requires a user gesture") as an unhandled rejection.
 *
 * Wrap the canvas method so that every caller — our menu and the engine — goes
 * through one place that:
 *   1. skips the request when the pointer is already locked;
 *   2. silently retries within the next user gesture (click or touch) when the
 *      browser denied the request because of a missing gesture.
 */
export function addPointerLockWorkaround() {
    const canvas = document.getElementById("canvas");
    if (!canvas) {
        throw new Error(`Canvas element is not found`);
    }
    if (typeof canvas.requestPointerLock !== "function") {
        // Old browsers report failures via the pointerlockerror event instead.
        return;
    }

    const origRequestPointerLock = canvas.requestPointerLock.bind(canvas);

    function isPointerLockDenial(e) {
        return (
            e instanceof DOMException &&
            (e.name === "NotAllowedError" ||
                e.name === "InUseAttributeError" ||
                e.name === "SecurityError")
        );
    }

    function deferToNextGesture(args, e) {
        console.info(
            `Pointer lock denied (${e?.name ?? "?"}), retrying on the next click/touch`,
        );

        const retry = () => {
            cleanup();
            try {
                const promise = origRequestPointerLock(...args);
                if (promise instanceof Promise) {
                    promise.catch((e) => {
                        // Still not in a gesture, or the browser still refuses
                        // (for example, the page runs in an iframe that
                        // disallows pointer lock): the player keeps playing in
                        // absolute mouse mode, no need to surface anything.
                        console.info(`Deferred pointer lock request failed`, e);
                    });
                }
            } catch (e) {
                console.info(`Deferred pointer lock request failed`, e);
            }
        };
        const cleanup = () => {
            document.removeEventListener("click", retry);
            document.removeEventListener("touchend", retry);
        };

        document.addEventListener("click", retry, { once: true });
        document.addEventListener("touchend", retry, { once: true });
    }

    function requestPointerLock(...args) {
        if (document.pointerLockElement) {
            // Already locked, the engine just lost a race with a previous
            // request (double click, Escape released and re-locked too fast).
            return;
        }

        try {
            const promise = origRequestPointerLock(...args);
            if (promise instanceof Promise) {
                return promise.catch((e) => {
                    if (isPointerLockDenial(e)) {
                        deferToNextGesture(args, e);
                        return;
                    }
                    console.info(`Pointer lock request failed`, e);
                });
            }
            return promise;
        } catch (e) {
            if (isPointerLockDenial(e)) {
                deferToNextGesture(args, e);
                return;
            }
            throw e;
        }
    }

    canvas.requestPointerLock = requestPointerLock;
}

export function addRightMouseButtonWorkaround() {
    // The game will act weird if no "mouseup" event received for right button
    // This can happen if pointer is not locked (for example, because user pressed Escape button)
    //   and user performs a right-click on the game field which brings context menu.
    //

    const canvas = document.getElementById("canvas");
    if (!canvas) {
        throw new Error(`Canvas element is not found`);
    }

    // RMB belongs to the game even in absolute mouse mode or after Escape
    // releases pointer lock. Keep the browser menu from swallowing mouseup.
    canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();
    });

    const RIGHT_BUTTON_ID = 2;

    let isRightDown = false;

    canvas.addEventListener("mousedown", (event) => {
        if (event.button === RIGHT_BUTTON_ID) {
            isRightDown = true;
            return;
        }
    });
    canvas.addEventListener("mouseup", (event) => {
        if (event.button === RIGHT_BUTTON_ID) {
            isRightDown = false;
            return;
        }
        if (isRightDown && !(event.buttons & RIGHT_BUTTON_ID)) {
            const fakeEvent = new MouseEvent("mouseup", {
                button: RIGHT_BUTTON_ID,
                buttons: 0,

                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,

                bubbles: true,
                cancelable: true,

                screenX: event.screenX,
                screenY: event.screenY,
                clientX: event.clientX,
                clientY: event.clientY,
                movementX: event.movementX,
                movementY: event.movementY,
            });
            isRightDown = false;

            canvas.dispatchEvent(fakeEvent);
        }
    });
}

export function addBackquoteAsEscape() {
    window.addEventListener("keyup", (e) => {
        if (e.code === "Backquote") {
            for (const eventName of ["keydown", "keyup"]) {
                const fakeEvent = new KeyboardEvent(eventName, {
                    ctrlKey: false,
                    shiftKey: false,
                    altKey: false,
                    metaKey: false,

                    bubbles: true,
                    cancelable: true,

                    code: "Escape",
                    key: "Escape",
                    keyCode: 27,
                    which: 27,
                });
                window.dispatchEvent(fakeEvent);
            }
        }
    });
}

/**
 *
 * @param {HTMLElement} elementToFullscreen
 */
export function addHotkeysForFullscreen(elementToFullscreen) {
    // Emscripten prevents defaults for F11
    window.addEventListener("keyup", (e) => {
        if (
            (e.key === "F11" &&
                !e.ctrlKey &&
                !e.shiftKey &&
                !e.metaKey &&
                !e.altKey) ||
            (e.key === "f" &&
                e.ctrlKey &&
                !e.shiftKey &&
                !e.metaKey &&
                !e.altKey)
        ) {
            elementToFullscreen.requestFullscreen({
                navigationUI: "hide",
            });
        }
    });
}
