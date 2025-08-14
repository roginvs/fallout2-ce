/** @type {string | null} */
let lastStatusText = null;

/**
 * @param {string | null} text
 */
export function setStatusText(text) {
    if (text === lastStatusText) {
        return;
    }
    lastStatusText = text;
    console.info(`Status: ${text}`);
    const statusTextEl = document.getElementById("status_text");
    if (!statusTextEl) {
        throw new Error(`Element not found`);
    }
    statusTextEl.innerHTML = text || "";
    statusTextEl.style.opacity = `${text ? 1 : 0}`;
}
