// Caching reverse proxy for e2e tests. Serves E2E_PROXY_UPSTREAM
// (default https://fallout-nevada.ru) on http://127.0.0.1:E2E_PROXY_PORT,
// storing each GET response (raw bytes, Content-Encoding kept as-is) in
// E2E_CACHE_DIR. Later requests are answered from disk. Range requests are
// served from the cached full body. E2E_CANDIDATE_DIR, if set, is checked
// first: a file there (e.g. fallout2-ce.js/.wasm, *.mjs) overrides upstream.
//
//   node helpers/caching-proxy.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const UPSTREAM = new URL(
    process.env.E2E_PROXY_UPSTREAM || "https://fallout-nevada.ru",
);
const PORT = Number(process.env.E2E_PROXY_PORT || 8766);
const CACHE_DIR = path.resolve(
    process.env.E2E_CACHE_DIR || "/workspace/e2e-cache",
);
const CANDIDATE_DIR = process.env.E2E_CANDIDATE_DIR
    ? path.resolve(process.env.E2E_CANDIDATE_DIR)
    : null;
const KEEP_HEADERS = [
    "content-type",
    "content-encoding",
    "last-modified",
    "etag",
    "cache-control",
];
const MIME = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".html": "text/html",
    ".css": "text/css",
    ".json": "application/json",
};
const inflight = new Map();

fs.mkdirSync(CACHE_DIR, { recursive: true });
const keyFor = (u) => {
    const safe =
        u
            .split("?")[0]
            .replace(/[^A-Za-z0-9._/-]/g, "_")
            .replace(/\.\.+/g, "_")
            .replace(/^\/+/, "") || "index";
    const h = crypto.createHash("sha1").update(u).digest("hex").slice(0, 10);
    return path.join(
        CACHE_DIR,
        `${safe.endsWith("/") ? safe + "index" : safe}.${h}`,
    );
};

function fetchUpstream(urlPath, headers) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            new URL(urlPath, UPSTREAM),
            {
                headers: {
                    "accept-encoding": headers["accept-encoding"] || "identity",
                    "user-agent": headers["user-agent"] || "e2e-proxy",
                },
                timeout: 10 * 60_000,
            },
            (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () =>
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    }),
                );
                res.on("error", reject);
            },
        );
        req.on("timeout", () => req.destroy(new Error("upstream timeout")));
        req.on("error", reject);
    });
}

async function getCached(urlPath, reqHeaders) {
    const file = keyFor(urlPath);
    if (fs.existsSync(file + ".json")) {
        return {
            ...JSON.parse(fs.readFileSync(file + ".json", "utf8")),
            body: fs.readFileSync(file),
            hit: true,
        };
    }
    if (!inflight.has(file)) {
        inflight.set(
            file,
            (async () => {
                try {
                    for (let attempt = 1; ; attempt++) {
                        try {
                            const r = await fetchUpstream(urlPath, reqHeaders);
                            const meta = {
                                status: r.status,
                                headers: Object.fromEntries(
                                    KEEP_HEADERS.filter(
                                        (h) => r.headers[h],
                                    ).map((h) => [h, r.headers[h]]),
                                ),
                            };
                            if (r.status === 200) {
                                fs.mkdirSync(path.dirname(file), {
                                    recursive: true,
                                });
                                fs.writeFileSync(file + ".tmp", r.body);
                                fs.renameSync(file + ".tmp", file);
                                fs.writeFileSync(
                                    file + ".json",
                                    JSON.stringify(meta),
                                );
                            }
                            return { ...meta, body: r.body, hit: false };
                        } catch (e) {
                            if (attempt >= 3) throw e;
                            console.error(
                                `[proxy] retry ${attempt} ${urlPath}: ${e.message}`,
                            );
                        }
                    }
                } finally {
                    inflight.delete(file);
                }
            })(),
        );
    }
    return inflight.get(file);
}

function send(req, res, status, headers, body) {
    headers = { ...headers, "accept-ranges": "bytes" };
    const range =
        req.headers.range &&
        status === 200 &&
        /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
        const start = range[1] ? +range[1] : body.length - +range[2];
        const end =
            range[1] && range[2]
                ? Math.min(+range[2], body.length - 1)
                : body.length - 1;
        const total = body.length;
        body = body.subarray(start, end + 1);
        status = 206;
        headers["content-range"] = `bytes ${start}-${end}/${total}`;
    }
    // Upstream sends compressed bodies chunked; the shell preallocates by
    // Content-Length, so a compressed length there would break it.
    if (!headers["content-encoding"] || status === 206)
        headers["content-length"] = body.length;
    res.writeHead(status, headers);
    res.end(req.method === "HEAD" ? undefined : body);
}

http.createServer(async (req, res) => {
    const urlPath = req.url;
    try {
        if (req.method !== "GET" && req.method !== "HEAD")
            return send(req, res, 405, {}, Buffer.alloc(0));
        if (CANDIDATE_DIR) {
            const local = path.join(
                CANDIDATE_DIR,
                decodeURIComponent(urlPath.split("?")[0]),
            );
            if (
                local.startsWith(CANDIDATE_DIR) &&
                fs.existsSync(local) &&
                fs.statSync(local).isFile()
            ) {
                console.log(`[proxy] local ${urlPath}`);
                return send(
                    req,
                    res,
                    200,
                    {
                        "content-type":
                            MIME[path.extname(local)] ||
                            "application/octet-stream",
                        "cache-control": "no-cache",
                    },
                    fs.readFileSync(local),
                );
            }
        }
        const r = await getCached(urlPath, req.headers);
        console.log(
            `[proxy] ${r.hit ? "hit " : "miss"} ${r.status} ${urlPath}`,
        );
        send(req, res, r.status, r.headers, r.body);
    } catch (e) {
        console.error(`[proxy] error ${urlPath}: ${e.message}`);
        if (!res.headersSent)
            send(
                req,
                res,
                502,
                { "content-type": "text/plain" },
                Buffer.from(String(e.message)),
            );
    }
}).listen(PORT, "127.0.0.1", () =>
    console.log(
        `[proxy] http://127.0.0.1:${PORT}/ -> ${UPSTREAM.origin}, cache ${CACHE_DIR}${CANDIDATE_DIR ? `, candidate ${CANDIDATE_DIR}` : ""}`,
    ),
);
