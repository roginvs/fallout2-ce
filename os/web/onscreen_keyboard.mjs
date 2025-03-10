// @ts-check

const key_data = [
    { type: "keydown", code: "KeyQ", key: "q", keyCode: 81, which: 81 },
    { type: "keyup", code: "KeyQ", key: "q", keyCode: 81, which: 81 },
    { type: "keydown", code: "KeyW", key: "w", keyCode: 87, which: 87 },
    { type: "keyup", code: "KeyW", key: "w", keyCode: 87, which: 87 },
    { type: "keydown", code: "KeyE", key: "e", keyCode: 69, which: 69 },
    { type: "keyup", code: "KeyE", key: "e", keyCode: 69, which: 69 },
    { type: "keydown", code: "KeyR", key: "r", keyCode: 82, which: 82 },
    { type: "keyup", code: "KeyR", key: "r", keyCode: 82, which: 82 },
    { type: "keydown", code: "KeyT", key: "t", keyCode: 84, which: 84 },
    { type: "keyup", code: "KeyT", key: "t", keyCode: 84, which: 84 },
    { type: "keydown", code: "KeyY", key: "y", keyCode: 89, which: 89 },
    { type: "keyup", code: "KeyY", key: "y", keyCode: 89, which: 89 },
    { type: "keydown", code: "KeyU", key: "u", keyCode: 85, which: 85 },
    { type: "keyup", code: "KeyU", key: "u", keyCode: 85, which: 85 },
    { type: "keydown", code: "KeyI", key: "i", keyCode: 73, which: 73 },
    { type: "keyup", code: "KeyI", key: "i", keyCode: 73, which: 73 },
    { type: "keydown", code: "KeyO", key: "o", keyCode: 79, which: 79 },
    { type: "keyup", code: "KeyO", key: "o", keyCode: 79, which: 79 },
    { type: "keydown", code: "KeyP", key: "p", keyCode: 80, which: 80 },
    { type: "keyup", code: "KeyP", key: "p", keyCode: 80, which: 80 },
    { type: "keydown", code: "KeyA", key: "a", keyCode: 65, which: 65 },
    { type: "keyup", code: "KeyA", key: "a", keyCode: 65, which: 65 },
    { type: "keydown", code: "KeyS", key: "s", keyCode: 83, which: 83 },
    { type: "keyup", code: "KeyS", key: "s", keyCode: 83, which: 83 },
    { type: "keydown", code: "KeyD", key: "d", keyCode: 68, which: 68 },
    { type: "keyup", code: "KeyD", key: "d", keyCode: 68, which: 68 },
    { type: "keydown", code: "KeyF", key: "f", keyCode: 70, which: 70 },
    { type: "keyup", code: "KeyF", key: "f", keyCode: 70, which: 70 },
    { type: "keydown", code: "KeyG", key: "g", keyCode: 71, which: 71 },
    { type: "keyup", code: "KeyG", key: "g", keyCode: 71, which: 71 },
    { type: "keydown", code: "KeyH", key: "h", keyCode: 72, which: 72 },
    { type: "keyup", code: "KeyH", key: "h", keyCode: 72, which: 72 },
    { type: "keydown", code: "KeyJ", key: "j", keyCode: 74, which: 74 },
    { type: "keyup", code: "KeyJ", key: "j", keyCode: 74, which: 74 },
    { type: "keydown", code: "KeyK", key: "k", keyCode: 75, which: 75 },
    { type: "keyup", code: "KeyK", key: "k", keyCode: 75, which: 75 },
    { type: "keydown", code: "KeyL", key: "l", keyCode: 76, which: 76 },
    { type: "keyup", code: "KeyL", key: "l", keyCode: 76, which: 76 },
    { type: "keydown", code: "KeyZ", key: "z", keyCode: 90, which: 90 },
    { type: "keyup", code: "KeyZ", key: "z", keyCode: 90, which: 90 },
    { type: "keydown", code: "KeyX", key: "x", keyCode: 88, which: 88 },
    { type: "keyup", code: "KeyX", key: "x", keyCode: 88, which: 88 },
    { type: "keydown", code: "KeyC", key: "c", keyCode: 67, which: 67 },
    { type: "keyup", code: "KeyC", key: "c", keyCode: 67, which: 67 },
    { type: "keydown", code: "KeyV", key: "v", keyCode: 86, which: 86 },
    { type: "keyup", code: "KeyV", key: "v", keyCode: 86, which: 86 },
    { type: "keydown", code: "KeyB", key: "b", keyCode: 66, which: 66 },
    { type: "keyup", code: "KeyB", key: "b", keyCode: 66, which: 66 },
    { type: "keydown", code: "KeyN", key: "n", keyCode: 78, which: 78 },
    { type: "keyup", code: "KeyN", key: "n", keyCode: 78, which: 78 },
    { type: "keydown", code: "KeyM", key: "m", keyCode: 77, which: 77 },
    { type: "keyup", code: "KeyM", key: "m", keyCode: 77, which: 77 },
    { type: "keydown", code: "Comma", key: ",", keyCode: 188, which: 188 },
    { type: "keyup", code: "Comma", key: ",", keyCode: 188, which: 188 },
    { type: "keydown", code: "Period", key: ".", keyCode: 190, which: 190 },
    { type: "keyup", code: "Period", key: ".", keyCode: 190, which: 190 },
    {
        type: "keydown",
        code: "Backspace",
        key: "Backspace",
        keyCode: 8,
        which: 8,
    },
    {
        type: "keyup",
        code: "Backspace",
        key: "Backspace",
        keyCode: 8,
        which: 8,
    },
    { type: "keydown", code: "Space", key: " ", keyCode: 32, which: 32 },
    { type: "keyup", code: "Space", key: " ", keyCode: 32, which: 32 },
    { type: "keydown", code: "Enter", key: "Enter", keyCode: 13, which: 13 },
    { type: "keyup", code: "Enter", key: "Enter", keyCode: 13, which: 13 },
    {
        type: "keydown",
        code: "ShiftLeft",
        key: "Shift",
        keyCode: 16,
        which: 16,
    },
    { type: "keyup", code: "ShiftLeft", key: "Shift", keyCode: 16, which: 16 },
    {
        type: "keydown",
        code: "ShiftRight",
        key: "Shift",
        keyCode: 16,
        which: 16,
    },
    { type: "keyup", code: "ShiftRight", key: "Shift", keyCode: 16, which: 16 },
];

if (false) {
    /** @type {{code?: string, key?: string, keyCode?:number, which?: number, type: string }[]} */
    const key_data = [];
    /** @type {any} */ (window).key_data = key_data;
    window.addEventListener("keydown", (e) => {
        key_data.push({
            type: "keydown",
            code: e.code,
            key: e.key,
            keyCode: e.keyCode,
            which: e.which,
        });
    });
    window.addEventListener("keyup", (e) => {
        key_data.push({
            type: "keyup",
            code: e.code,
            key: e.key,
            keyCode: e.keyCode,
            which: e.which,
        });
    });
}

/**
 * @param {number} keyCode
 */
function _ensureKeyData(keyCode) {
    if (!key_data.find((e) => e.keyCode === keyCode && e.type === "keydown")) {
        throw new Error(`Keydown not found for keyCode ${keyCode}`);
    }
    if (!key_data.find((e) => e.keyCode === keyCode && e.type === "keyup")) {
        throw new Error(`Keydown not found for keyCode ${keyCode}`);
    }
}

/**
 * @param {(typeof key_data)[number]} keyEvent
 */
function _sendKeyEvent(keyEvent) {
    const fakeEvent = new KeyboardEvent(keyEvent.type, {
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,

        bubbles: true,
        cancelable: true,

        code: keyEvent.code,
        key: keyEvent.key,
        keyCode: keyEvent.keyCode,
        which: keyEvent.which,
    });

    window.dispatchEvent(fakeEvent);
}

/**
 * @param {string} key
 */
function createSendKeyFunction(key) {
    const keyDownData = key_data.find(
        (e) => e.key === key && e.type === "keydown",
    );
    if (!keyDownData) {
        throw new Error(`Keydown not found for key ${key}`);
    }
    const keyUpData = key_data.find((e) => e.key === key && e.type === "keyup");
    if (!keyUpData) {
        throw new Error(`Keyup not found for key ${key}`);
    }
    return () => {
        _sendKeyEvent(keyDownData);
        _sendKeyEvent(keyUpData);
    };
}

// window.addEventListener("keydown", (e) =>
//     console.info("keydown", e.code, e.key, e.keyCode, e.which)
// );

const _BUTTON_SIZE = 60;
const _keyboardStyles = `
.keyboard_button {
    margin: 4px;
    border-radius: 4px;
    background-color: white;
    color: black;
    font-family: monospace;
    width: ${_BUTTON_SIZE}px;
    height: ${_BUTTON_SIZE}px;
    line-height: ${_BUTTON_SIZE}px;
    text-align: center;
}
.keyboard_row {
    display: flex;
    margin: 10px;
}
.keyboard {
    position: fixed;
    opacity: 0.9;
    background-color: #cfcfcf;
    padding: 10px;
}
`;

function _addKeyboardStyles() {
    const _keyboardStyleSheet = document.createElement("style");
    _keyboardStyleSheet.innerText = _keyboardStyles;
    document.head.appendChild(_keyboardStyleSheet);
}
_addKeyboardStyles();

/**
 *
 * @param {HTMLElement} parentEl
 * @param {string} kText
 * @param {() => void} callback
 */
function _addKeyCallback(parentEl, kText, callback) {
    const el = document.createElement("div");
    el.className = "keyboard_button";
    el.innerHTML = kText;
    parentEl.appendChild(el);
    el.onclick = (e) => {
        callback();
        e.preventDefault();
        e.stopPropagation();
    };
    return el;
}

/**
 *
 * @param {HTMLElement} parentEl
 * @param {string} kText
 * @param {string} key
 */
function _addKey(parentEl, kText, key) {
    return _addKeyCallback(parentEl, kText, createSendKeyFunction(key));
}

let _keyboardShiftPressed = false;

const shiftDownEvent = key_data.find(
    (x) => x.key === "Shift" && x.type === "keydown",
);
const shiftUpEvent = key_data.find(
    (x) => x.key === "Shift" && x.type === "keyup",
);

/**
 *
 * @param {boolean} [isExiting]
 */
function toggle_shift(isExiting) {
    if (!shiftUpEvent || !shiftDownEvent) {
        throw new Error("Shift key events not found");
    }
    if (isExiting && _keyboardShiftPressed) {
        _keyboardShiftPressed = false;
        _sendKeyEvent(shiftUpEvent);
        return;
    }
    if (_keyboardShiftPressed) {
        _keyboardShiftPressed = false;
        _sendKeyEvent(shiftUpEvent);
    } else {
        _keyboardShiftPressed = true;
        _sendKeyEvent(shiftDownEvent);
    }
}

/**
 *
 * @param {HTMLElement} parentEl
 */
function _addShiftKey(parentEl) {
    const _keyboardShiftClassName = "keyboard_shift_button";

    const el = _addKeyCallback(parentEl, "shift", () => {
        toggle_shift();

        document
            .querySelectorAll("." + _keyboardShiftClassName)
            .forEach((elem) => {
                // @ts-ignore
                elem.style.backgroundColor = _keyboardShiftPressed
                    ? "#ededed"
                    : "";
            });
    });
    el.className = (el.className || "") + " " + _keyboardShiftClassName;
    return el;
}

const _keyboardMainDivId = "onscreen-keyboard-id";
function _removeKeyboardElement() {
    const el = document.querySelector("#" + _keyboardMainDivId);
    if (el) {
        el.parentElement?.removeChild(el);
    }
}

function _createKeyboardElement() {
    _removeKeyboardElement();

    _keyboardShiftPressed = false;

    const div = document.createElement("div");
    div.className = "keyboard";
    div.id = _keyboardMainDivId;

    for (const rowId of [0, 1, 2, 3]) {
        const rowDiv = document.createElement("div");
        rowDiv.className = "keyboard_row";

        if (rowId === 1) {
            rowDiv.style.paddingLeft = `${_BUTTON_SIZE / 2}px`;
        } else if (rowId === 2) {
            _addShiftKey(rowDiv).style.width = `${_BUTTON_SIZE * 1.4}px`;
        } else if (rowId === 3) {
            rowDiv.style.paddingLeft = `${_BUTTON_SIZE * 4}px`;
        }

        const keysRows = /** @type {const} */ ([
            "QWERTYUIOP".split(""),
            "ASDFGHJKL".split(""),
            "ZXCVBNM,.".split(""),
        ]);
        const keyRow = keysRows[rowId];

        if (keyRow) {
            for (let i = 0; i < keyRow.length; i++) {
                _addKey(rowDiv, keyRow[i], keyRow[i].toLowerCase());
            }
        }

        if (rowId === 0) {
            _addKey(rowDiv, "<-", "Backspace").style.width = `${
                _BUTTON_SIZE * 1.2
            }px`;
        } else if (rowId === 1) {
            _addKey(rowDiv, "enter", "Enter").style.width = `${
                _BUTTON_SIZE * 1.6
            }px`;
        } else if (rowId === 2) {
            _addShiftKey(rowDiv).style.width = `${_BUTTON_SIZE * 1.4}px`;
        } else if (rowId === 3) {
            _addKey(rowDiv, "&nbsp;", " ").style.width = `${
                _BUTTON_SIZE * 5
            }px`;
        }

        div.appendChild(rowDiv);
    }

    (document.querySelector("#container") || document.body).appendChild(div);

    let posX = (window.innerWidth - div.clientWidth) / 2;
    let posY = window.innerHeight - div.clientHeight - _BUTTON_SIZE / 2;
    div.style.left = `${posX}px`;
    div.style.top = `${posY}px`;

    let touchX = 0;
    let touchY = 0;
    const onMove = (/** @type {TouchEvent} */ e) => {
        posX = posX + (e.touches[0].screenX - touchX);
        posY = posY + (e.touches[0].screenY - touchY);
        div.style.left = `${posX}px`;
        div.style.top = `${posY}px`;
        touchX = e.touches[0].screenX;
        touchY = e.touches[0].screenY;
    };
    div.ontouchstart = (e) => {
        touchX = e.touches[0].screenX;
        touchY = e.touches[0].screenY;
        window.addEventListener("touchmove", onMove);
    };
    window.addEventListener("touchend", () => {
        window.removeEventListener("touchmove", onMove);
    });
}

export function isTouchDevice() {
    return (
        !!(
            typeof window !== "undefined" &&
            ("ontouchstart" in window ||
                // @ts-ignore
                (window.DocumentTouch &&
                    typeof document !== "undefined" &&
                    // @ts-ignore
                    document instanceof window.DocumentTouch))
        ) ||
        !!(
            typeof navigator !== "undefined" &&
            // @ts-ignore
            (navigator.maxTouchPoints || navigator.msMaxTouchPoints)
        )
    );
}

function startTextInput() {
    if (isTouchDevice()) {
        _createKeyboardElement();
    }
}
function stopTextInput() {
    _removeKeyboardElement();
    toggle_shift(true);
}

// WASM build calls those functions
/** @type {any} */ (window).startTextInput = startTextInput;
/** @type {any} */ (window).stopTextInput = stopTextInput;
