# Web tests

Everything here runs from this directory.

## Install

```bash
npm install
npx playwright install --with-deps chromium
```

## Run

| Command | What it runs | Server |
| --- | --- | --- |
| `npm test` | `*.spec.mjs`: shell modules in a blank page (IDBFS sync wrapper, ini parsing) | serves `os/web` on `127.0.0.1:8765` |
| `npm run e2e` | `e2e/*.e2e.mjs`: the real game in Chromium | none, uses `https://fallout-nevada.ru/` |
| `npm run e2e -- quicksave` | one e2e file by name | same |
| `npm run e2e -- --headed` | watch the browser | same |

`E2E_BASE_URL` points e2e tests at another deployment, e.g. `E2E_BASE_URL=http://127.0.0.1:8765/ npm run e2e`. A local server only works if `os/web` contains the built `fallout2-ce.js`/`.wasm` and `game/<folder>/` data; neither is in git.

### Local caching proxy

By default e2e tests go straight to `https://fallout-nevada.ru/`. `E2E_USE_CACHE_PROXY=1 npm run e2e` makes Playwright start `helpers/caching-proxy.mjs` on `http://127.0.0.1:8766/` and run the tests against it. The first run downloads every requested file from the site and stores it on disk. Later runs serve it from disk, so `main-menu-new-game` drops to about 20 s. Bodies are stored as received (gzip stays gzip), range requests are cut from the cached file, and only `200` responses are cached.

- `E2E_CACHE_DIR` sets the cache folder, default `/workspace/e2e-cache` (outside git). Delete it to refetch everything, for example after a deploy.
- `E2E_PROXY_PORT` sets the port, default `8766`. `E2E_PROXY_UPSTREAM` sets the origin, default `https://fallout-nevada.ru`.
- `E2E_CANDIDATE_DIR=/path/to/build` turns on candidate mode. A file in that folder (`fallout2-ce.js`, `fallout2-ce.wasm`, `*.mjs`, `index.sw.js` and so on) is served instead of the site's copy, and everything else, including `game/`, comes from the cache.
- A proxy that is already running on the port is reused. Run it by hand with `node helpers/caching-proxy.mjs` to see the hit/miss log.

Each test gets a fresh Playwright browser context: empty IndexedDB, localStorage and cache. Saves made by tests never touch a real browser profile.

## Artifacts

- `test-results/e2e/<test>/` holds the PNG screenshots made with `snap()`, downloaded save archives, and a trace when a test fails.
- `npx playwright show-trace test-results/e2e/<test>/trace.zip` opens the trace.
- `test-results/`, `playwright-report/` and `node_modules/` are git-ignored. Do not commit screenshots, saves or game data.

## Reference tests

- `e2e/main-menu-new-game.e2e.mjs` (about 30 s): starts Nevada English, waits for the main menu, presses `n`, checks that character selection replaced it.
- `e2e/quicksave-download.e2e.mjs` (about 4 min): premade character (`t`), F6 quicksave with a description, page reload, slot name visible in the shell menu, slot archive downloaded, game loaded back through `l` in the main menu.

## Helpers (`helpers/game.mjs`)

| Helper | Use |
| --- | --- |
| `launchGame(page, folder)` | opens `/#/<folder>`, turns hi-res off, clicks `#start_<folder>` |
| `waitForStableFrame(page, opts)` | waits for game data idle, then a non-black frame that stops changing; returns the PNG. On maps pass `region: INTERFACE_BAR` |
| `waitForGameDataIdle(page, opts)` | status line hidden and no game data request for `quietMs` (2 s) |
| `canvasPng(page, region?)` | screenshot of `#canvas` or of a region (fractions of canvas size) |
| `waitForCanvasChange(page, before, opts)` | waits until at least `minChanged` (default 20%) of pixels differ from `before` |
| `comparePngs(page, a, b)` | `{ changedRatio, nonBlackRatioB }` for two PNGs |
| `pressKey(page, key)` | keydown, 80 ms pause, keyup, so the game loop sees the key held for at least one frame |
| `snap(testInfo, name, png)` | saves `<name>.png` into the test folder and attaches it to the report |
| `downloadSlot(page, folder, slot, testInfo)` | shell menu: slot context menu, "Download save", saves the `.tar` and returns its path |

## Error collection and load waiting (automatic)

Import `test`/`expect` from `../helpers/fixtures.mjs`, not from `@playwright/test`. Then every test:

- collects `console.error`, `pageerror` and `unhandledrejection` into `console-errors.json` in its output folder;
- fails on a WASM crash (`abort(`, `Aborted(`, `RuntimeError`, `unreachable`, `memory access out of bounds`);
- fails on an error *type* (message with numbers, urls, quoted strings normalized) missing from `baselines/console-errors.json` for this test title. Known noise (fullscreen/pointer lock refusals, favicon, live-site network flakes such as `net::ERR_TIMED_OUT`, the `embed.tawk.to` chat widget) is ignored in `IGNORED` in `fixtures.mjs`.
- Refresh the baseline on the live site with `E2E_UPDATE_ERROR_BASELINE=1 npm run e2e`, review the diff, commit it. Then run the candidate without the variable: a new error type there is a regression.

Game data requests (`/game/...`, `*.dat`) are tracked. `waitForStableFrame` first calls `waitForGameDataIdle` (the top status line `#status_text` hidden and no game data request for 2 s) and does not accept a frame while a request is pending. On timeout the error names the status text, the last loaded file and pending requests. `skipLoadWait: true` turns this off.

On maps use `waitForStableFrame(page, { region: INTERFACE_BAR, maxChanged: 0.01, timeout: 480_000 })`: only the bottom interface bar must be still (the map is animated), the full frame is returned. Entering a map on the live site downloads many files lazily and can take several minutes.

## Writing the next test

1. Copy `e2e/main-menu-new-game.e2e.mjs` to `e2e/<scenario>.e2e.mjs` and change `FOLDER` (folders are in `../config.mjs`).
2. Build each step the same way: take a stable frame, act (`pressKey`, `page.keyboard.type`, `page.mouse.click`), call `waitForCanvasChange(page, previousFrame)`, then `waitForStableFrame` again, then `snap`.
3. Prove results with pixel diffs or with shell DOM after `page.reload()` (slot names in `#game_slots_<folder> .game_slot_name`), not with fixed sleeps.
4. Open your screenshots and check that they show what you expect. A passing diff only proves the picture changed.

Proven hotkeys: `n` new game, `l` load game (main menu), `t` take premade character, F6 quicksave dialog, Enter to confirm a slot or description. Escape (close dialogs, skip movies) is not used by these tests yet.

## Known limits

- The game is one canvas; there is no DOM inside it. Text on screen cannot be read, so assertions use pixel ratios and shell DOM.
- The canvas is scaled with CSS: screenshots are 1024x768 in the menus and 819x614 on the map with the default viewport. Only compare frames from the same screen. For mouse clicks, convert game coordinates (640x480) with `page.locator("#canvas").boundingBox()`.
- The start click requests pointer lock and, on non-localhost hosts, fullscreen. Headless Chromium may refuse either; with pointer lock the game reads relative mouse movement, so absolute `page.mouse` clicks are unreliable. Prefer hotkeys; mouse input is not covered by the reference tests yet.
- Maps are animated, so frames never match exactly; raise `maxChanged`.
- Live runs download game data from the site on every run because the context is fresh. Slow network makes `waitForStableFrame` time out (default 180 s).
- File import (`uploadFile`/`uploadFolder`) uses a native file chooser: wait for `page.waitForEvent("filechooser")` before clicking the menu item.
