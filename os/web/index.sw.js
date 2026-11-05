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

// CacheStorage is shared across registrations on an origin. Keep both builds
// and preview scopes separate, including while a new worker is installing.
const ENGINE_CACHE_PREFIX = `engine-${encodeURIComponent(me.registration.scope)}-`;
const ENGINE_CACHE_NAME = `${ENGINE_CACHE_PREFIX}${VERSION}`;
const CACHE_URLS = CACHE_FILES.map(
    (path) => new URL(path, me.registration.scope).href,
);
const ENGINE_URLS = new Set(CACHE_URLS);

me.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cacheAlreadyExists = await caches.has(ENGINE_CACHE_NAME);
            const cache = await caches.open(ENGINE_CACHE_NAME);
            try {
                // addAll commits only after every response succeeds. A failed
                // install cannot overwrite part of an existing build's cache.
                await cache.addAll(
                    CACHE_URLS.map(
                        (url) => new Request(url, { cache: "no-cache" }),
                    ),
                );
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

                if (
                    cacheKey.startsWith(GAMES_OLD_CACHE_PREFIX) ||
                    cacheKey.startsWith(GAMES_OLD_CACHE_PREFIX_2) ||
                    (cacheKey.startsWith(ENGINE_CACHE_PREFIX) &&
                        cacheKey !== ENGINE_CACHE_NAME) ||
                    (cacheKey === "engine" &&
                        new URL(me.registration.scope).pathname === "/")
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

    // Tracking parameters (e.g. fbclid) must not bypass the cached shell.
    url.search = "";
    if (!ENGINE_URLS.has(url.href)) {
        return;
    }
    event.respondWith(
        (async () => {
            const cachedResponse = await caches.match(url.href, {
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
            event.waitUntil(cache.put(url.href, cloned));
            return responseFromNetwork;
        })(),
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
