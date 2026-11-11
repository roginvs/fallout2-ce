// @ts-check
/// <reference lib="webworker" />

/** @type ServiceWorkerGlobalScope */
// @ts-ignore
const me = self;

/** @type Clients */
var clients;

// CMake passes the build configuration; Debug keeps DWARF in the main WASM.
const DEBUG_BUILD = Number("@WEB_DEBUG_BUILD@") === 1;

const CACHE_FILES = [
    // No need to add "custom.js"

    "index.html",
    "index.css",
    "mainmenu.css",
    "buildinfo.mjs",
    "asyncfetchfs.mjs",
    "config.mjs",
    "fetchArrayBufProgress.mjs",
    "fetcher.mjs",
    "gamecache.mjs",
    "hotkeys_and_workarounds.mjs",
    "idbfsSync.mjs",
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
    "contextmenu.css",
    "contextmenu.mjs",

    "fallout2-ce.wasm",
    "fallout2-ce.js",
    "fallout2-ce.ico",
    // Only Release emits a separate source map. Cache it with its matching WASM.
    ...(DEBUG_BUILD ? [] : ["fallout2-ce.wasm.map"]),

    "manifest.json",

    // "AppIcon.png",
    // "nevada-640x480-ru.png",
    // "nevada-hires-ru.png",
    // "sonora-640x480-ru.png",
    // "sonora-hires-ru.png",

    // The shell at the registration's root, including preview subdirectories.
    "./",
];

// CMake replaces this with a hash of the finished web assets.
const VERSION = "@WEB_ASSET_VERSION@";

const ENGINE_CACHE_PREFIX = `engine-${encodeURIComponent(me.registration.scope)}-`;
const ENGINE_CACHE_NAME = `${ENGINE_CACHE_PREFIX}${VERSION}`;

me.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cacheAlreadyExists = await caches.has(ENGINE_CACHE_NAME);
            const cache = await caches.open(ENGINE_CACHE_NAME);

            try {
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
            } catch (error) {
                if (!cacheAlreadyExists) {
                    await caches.delete(ENGINE_CACHE_NAME);
                }
                throw error;
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
                const GAMES_OLD_CACHE_PREFIX_3 = "engine";

                if (
                    cacheKey.startsWith(GAMES_OLD_CACHE_PREFIX) ||
                    cacheKey.startsWith(GAMES_OLD_CACHE_PREFIX_2) ||
                    (cacheKey.startsWith(ENGINE_CACHE_PREFIX) &&
                        cacheKey !== ENGINE_CACHE_NAME) ||
                    cacheKey === GAMES_OLD_CACHE_PREFIX_3
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
    if (event.request.method !== "GET" || url.origin !== me.location.origin) {
        return;
    }

    // Do not even try to fetch if it not an engine
    if (
        // TODO: Improve that
        !CACHE_FILES.some(
            (f) => url.pathname === new URL(f, me.registration.scope).pathname,
        )
    ) {
        return;
    }
    event.respondWith(
        (async (request) => {
            // Ignore the query, e.g. "/?window=1", so it is served offline too
            const cachedResponse = await caches.match(url, {
                ignoreSearch: true,
                cacheName: ENGINE_CACHE_NAME,
            });
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
            // waitUntil keeps the worker alive until the cache write finishes,
            // otherwise it can be lost if the worker is stopped or replaced
            // right after responding
            event.waitUntil(cache.put(request, cloned));
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
