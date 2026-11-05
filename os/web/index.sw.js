// @ts-check
/// <reference lib="webworker" />

/** @type ServiceWorkerGlobalScope */
// @ts-ignore
const me = self;

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

            // Let the old worker keep its clients and cache until their tabs
            // close. skipWaiting would switch a running game to another build.
        })(),
    );
});

me.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            for (const cacheKey of await caches.keys()) {
                if (
                    (cacheKey.startsWith(ENGINE_CACHE_PREFIX) &&
                        cacheKey !== ENGINE_CACHE_NAME) ||
                    (cacheKey === "engine" &&
                        new URL(me.registration.scope).pathname === "/")
                ) {
                    await caches.delete(cacheKey);
                }
            }

            await me.clients.claim();
        })(),
    );
});

me.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
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
            const cache = await caches.open(ENGINE_CACHE_NAME);
            const cachedResponse = await cache.match(url.href);
            if (cachedResponse) {
                return cachedResponse;
            }

            // Storage eviction must not silently mix this build with whatever
            // is now deployed. Unregister so a new visit can install afresh;
            // existing game tabs keep running and their saves are untouched.
            await me.registration.unregister();
            return new Response(
                "Engine cache is incomplete. Close the game tabs and reopen the site online.",
                {
                    status: 503,
                    headers: {
                        "Content-Type": "text/plain; charset=utf-8",
                        "Cache-Control": "no-store",
                    },
                },
            );
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
