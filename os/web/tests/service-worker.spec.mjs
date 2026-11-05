import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const template = readFileSync(
    new URL("../index.sw.js", import.meta.url),
    "utf8",
);
const A = "a".repeat(64);
const B = "b".repeat(64);
const cachePrefix = (scope) => `engine-${encodeURIComponent(scope)}-`;

const test = base.extend({
    engine: async ({}, use) => {
        const state = { version: A, fail: "", requests: [] };
        const server = createServer((request, response) => {
            const path = new URL(request.url, "http://test").pathname;
            state.requests.push(path);
            response.setHeader("Cache-Control", "no-store");
            if (path.endsWith("index.sw.js")) {
                response.setHeader("Content-Type", "text/javascript");
                response.end(
                    template
                        .replaceAll("@WEB_ASSET_VERSION@", state.version)
                        .replaceAll("@WEB_DEBUG_BUILD@", "0"),
                );
            } else if (state.fail && path.endsWith(state.fail)) {
                response.writeHead(503).end("install failed");
            } else if (path.endsWith("/") || path.endsWith("index.html")) {
                response.setHeader("Content-Type", "text/html");
                response.end(`<title>${state.version}</title>`);
            } else {
                response.end(`${state.version}:${path}`);
            }
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        try {
            await use({ state, origin });
        } finally {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
    },
});

async function install(page, script = "index.sw.js") {
    return page.evaluate(async (script) => {
        const registration = await navigator.serviceWorker.register(script);
        const worker =
            registration.installing ||
            registration.waiting ||
            registration.active;
        const done = () =>
            ["installed", "activated", "redundant"].includes(worker.state);
        if (!done()) {
            await new Promise((resolve) => {
                worker.addEventListener("statechange", () => {
                    if (done()) resolve();
                });
            });
        }
        return worker.state;
    }, script);
}

async function controlled(page) {
    await expect
        .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
        .toBe(true);
}

const cachedFetch = (page, path) =>
    page.evaluate(async (path) => (await fetch(path)).text(), path);
const keys = (page) => page.evaluate(() => caches.keys());

test("failed update preserves the active build; activation cleans only old engine caches", async ({
    page,
    context,
    engine,
}) => {
    const scope = `${engine.origin}/`;
    const prefix = cachePrefix(scope);
    await page.goto(scope);
    const keep = [
        "fscache____FalloutNevadaEng____1",
        "gamedata_legacy",
        `${cachePrefix(`${scope}preview/`)}${A}`,
        "unrelated-cache",
    ];
    await page.evaluate(
        async (names) => {
            for (const name of names) await caches.open(name);
        },
        [...keep, "engine"],
    );
    await install(page);
    await controlled(page);
    expect(await keys(page)).toEqual(expect.arrayContaining(keep));
    expect(await keys(page)).not.toContain("engine");

    engine.state.version = B;
    engine.state.fail = "fallout2-ce.wasm";
    expect(await install(page, "index.sw.js?failed")).toBe("redundant");
    expect(await keys(page)).toContain(`${prefix}${A}`);
    expect(await keys(page)).not.toContain(`${prefix}${B}`);
    expect(await cachedFetch(page, "mainmenu.mjs")).toBe(`${A}:/mainmenu.mjs`);

    engine.state.fail = "";
    expect(await install(page, "index.sw.js?retry")).toBe("installed");
    expect(await keys(page)).toEqual(
        expect.arrayContaining([`${prefix}${A}`, `${prefix}${B}`]),
    );
    expect(await cachedFetch(page, "mainmenu.mjs")).toBe(`${A}:/mainmenu.mjs`);
    expect(
        await page.evaluate(async () => {
            const registration =
                await navigator.serviceWorker.getRegistration();
            return registration.waiting?.state;
        }),
    ).toBe("installed");

    // Activation must wait for every old client, including a second game tab.
    const second = await context.newPage();
    await second.goto(scope);
    await controlled(second);
    await page.close();
    expect(await cachedFetch(second, "mainmenu.mjs")).toBe(
        `${A}:/mainmenu.mjs`,
    );
    const waiting = context
        .serviceWorkers()
        .find((worker) => worker.url().endsWith("?retry"));
    expect(waiting).toBeDefined();
    await second.close();
    await expect
        .poll(() =>
            waiting.evaluate(
                () =>
                    self.registration.active?.state === "activated" &&
                    self.registration.active.scriptURL.endsWith("?retry"),
            ),
        )
        .toBe(true);
    const fresh = await context.newPage();
    await fresh.goto(scope);
    await controlled(fresh);
    await expect
        .poll(() => cachedFetch(fresh, "mainmenu.mjs"))
        .toBe(`${B}:/mainmenu.mjs`);
    expect(await keys(fresh)).toEqual(
        expect.arrayContaining([...keep, `${prefix}${B}`]),
    );
    expect(await keys(fresh)).not.toContain(`${prefix}${A}`);
});

test("failed reinstall of the same build does not delete its active cache", async ({
    page,
    engine,
}) => {
    await page.goto(engine.origin);
    await install(page);
    await controlled(page);
    engine.state.fail = "fallout2-ce.wasm";
    expect(await install(page, "index.sw.js?same-build")).toBe("redundant");
    expect(await cachedFetch(page, "mainmenu.mjs")).toBe(`${A}:/mainmenu.mjs`);
    expect(await keys(page)).toContain(
        `${cachePrefix(`${engine.origin}/`)}${A}`,
    );
});

test("preview scope and query links use their build cache; game files and POST bypass it", async ({
    page,
    engine,
}) => {
    const scope = `${engine.origin}/preview/`;
    await page.goto(scope);
    await install(page);
    await controlled(page);
    engine.state.version = B;
    engine.state.requests.length = 0;
    expect(await cachedFetch(page, "./?fbclid=tracking")).toBe(
        `<title>${A}</title>`,
    );
    expect(await cachedFetch(page, "mainmenu.mjs?tracking=1")).toBe(
        `${A}:/preview/mainmenu.mjs`,
    );
    expect(engine.state.requests).toEqual([]);
    expect(await cachedFetch(page, "game/data.gz")).toBe(
        `${B}:/preview/game/data.gz`,
    );
    expect(
        await page.evaluate(async () =>
            (await fetch("mainmenu.mjs", { method: "POST" })).text(),
        ),
    ).toBe(`${B}:/preview/mainmenu.mjs`);
    expect(await keys(page)).toContain(`${cachePrefix(scope)}${A}`);
});

test("missing build asset fails instead of reading another cache or the new deployment", async ({
    page,
    engine,
}) => {
    await page.goto(engine.origin);
    await install(page);
    await controlled(page);
    const cacheName = `${cachePrefix(`${engine.origin}/`)}${A}`;
    await page.evaluate(async (cacheName) => {
        const url = new URL("mainmenu.mjs", location.href);
        await (await caches.open(cacheName)).delete(url);
        await (
            await caches.open("foreign-build")
        ).put(url, new Response("wrong version"));
    }, cacheName);
    engine.state.version = B;
    engine.state.requests.length = 0;
    expect(
        await page.evaluate(async () => (await fetch("mainmenu.mjs")).status),
    ).toBe(503);
    expect(engine.state.requests).toEqual([]);
    expect(
        await page.evaluate(async () =>
            Boolean(await navigator.serviceWorker.getRegistration()),
        ),
    ).toBe(false);
    // A new visit can install again without erasing game data or saves.
    await page.reload();
    await install(page);
    await controlled(page);
    expect(await cachedFetch(page, "mainmenu.mjs")).toBe(`${B}:/mainmenu.mjs`);
});
