// @ts-check
/// <reference lib="webworker" />

/** @type ServiceWorkerGlobalScope */
// @ts-ignore
const me = self;

/** @type Clients */
var clients;

const CACHE_FILES = [
    // No need to add "custom.js"

    "index.html",
    "index.css",
    "mainmenu.css",
    "asyncfetchfs.mjs",
    "config.mjs",
    "fetchArrayBufProgress.mjs",
    "fetcher.mjs",
    "gamecache.mjs",
    "hotkeys_and_workarounds.mjs",
    "index.mjs",
    "iniparser.mjs",
    "initFilesystem.mjs",
    "loadJs.mjs",
    "mainmenu.mjs",
    "onscreen_keyboard.mjs",
    "pako_inflate.min.js",
    "pako.mjs",
    "resizeCanvas.mjs",
    "setErrorState.mjs",
    "setStatusText.mjs",
    "tar.mjs",
    "wasm.mjs",
    "service_worker_manager.mjs",
    "debugTags.mjs",

    "fallout2-ce.wasm",
    "fallout2-ce.js",
    "fallout2-ce.ico",
    "fallout2-ce.wasm.map",

    "manifest.json",

    // "AppIcon.png",
    // "nevada-640x480-ru.png",
    // "nevada-hires-ru.png",
    // "sonora-640x480-ru.png",
    // "sonora-hires-ru.png",

    // @TODO: Do we want to use '/'? Is this relative to service worker registration? If so, then how it works in "fetch" event?
    "/",
];

// This will be replaced by CMake
const VERSION = "@BUILD_DATE_TIME@";

const ENGINE_CACHE_NAME = "engine";

me.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(ENGINE_CACHE_NAME);

            for (const fpath of CACHE_FILES) {
                await cache.add(
                    new Request(fpath, {
                        cache: "no-cache",
                        headers: {
                            "Cache-Control": "no-cache",
                        },
                    }),
                );
            }

            await me.skipWaiting();
        })(),
    );
});

me.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            for (const cacheKey of await caches.keys()) {
                // Drop old cache schema because newer asyncfetchfs saved files into cache on its own
                const GAMES_OLD_CACHE_PREFIX = "gamedata_";
                const GAMES_OLD_CACHE_PREFIX_2 = "gamescache";

                if (
                    cacheKey.startsWith(GAMES_OLD_CACHE_PREFIX) ||
                    cacheKey.startsWith(GAMES_OLD_CACHE_PREFIX_2)
                ) {
                    await caches.delete(cacheKey);
                }
            }

            await clients.claim();
        })(),
    );
});

me.addEventListener("fetch", (event) => {
    // console.info("service worker request", event.request.url);

    const url = new URL(event.request.url);

    //console.info(`Requested '${url}`);
    //console.info(new URL(url).pathname);

    // Skip cross-origin requests, like those for Google Analytics.
    if (url.origin !== me.location.origin) {
        return;
    }

    // Do not even try to fetch if it not an engine
    if (
        // TODO: Improve that
        !CACHE_FILES.some((f) => url.pathname === f || url.pathname === "/" + f)
    ) {
        return;
    }
    event.respondWith(
        (async (request) => {
            const cachedResponse = await caches.match(url);
            if (cachedResponse) {
                return cachedResponse;
            }

            const responseFromNetwork = await fetch(url);

            const cloned = responseFromNetwork.clone();
            console.warn(
                `Service worker saved engine '${url}' to cache during fetch. ` +
                    `This should never happen because all engine files should be saved during install phase`,
            );
            const cache = await caches.open(ENGINE_CACHE_NAME);
            cache.put(request, cloned);

            return responseFromNetwork;
        })(event.request),
    );
});

me.addEventListener("message", (messageEvent) => {
    console.info(`Service worker got a message=${messageEvent.data}`);
    if (messageEvent.data === '{"type":"versionrequest"}') {
        if (messageEvent.source) {
            console.info(`Service worker replying with version=${VERSION}`);
            messageEvent.source.postMessage(
                JSON.stringify({ type: "version", version: VERSION }),
            );
        } else {
            console.warn(
                `Service worker got a message but no source to reply`,
                messageEvent.data,
            );
        }
    } else {
        console.warn(
            `Unexpected message for service worker`,
            messageEvent.data,
        );
    }
});
