export function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        if (window.location.hostname !== "localhost") {
            navigator.serviceWorker.register("index.sw.js");

            navigator.serviceWorker.addEventListener("controllerchange", () => {
                if (preventReloadCounter > 0) {
                    isReloadPending = true;
                } else {
                    window.location.reload();
                }
            });
        }
    }
}

let preventReloadCounter = 0;

let isReloadPending = false;

export function preventAutoreload() {
    preventReloadCounter++;
    return () => {
        preventReloadCounter--;
        if (isReloadPending) {
            window.location.reload();
        }
    };
}
