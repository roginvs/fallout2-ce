/** @type {Date | null} */
let lastTimeError = null;
let onClickInitialized = false;

/**
 * @param {Error} err
 */
export function setErrorState(err) {
    const elem = document.getElementById("error_text");
    if (!elem) {
        console.warn("No error_text element found");
        return;
    }
    elem.innerText = `\n\n${err?.message}\n${err?.stack}`;

    lastTimeError = new Date();
    if (!onClickInitialized) {
        onClickInitialized = true;
        document.body.addEventListener("click", () => {
            if (lastTimeError) {
                const now = new Date();
                const timeDiff = Math.floor(
                    (now.getTime() - lastTimeError.getTime()) / 1000,
                );
                if (timeDiff > 2) {
                    lastTimeError = null;
                    elem.innerText = "";
                }
            }
        });
    }
}
