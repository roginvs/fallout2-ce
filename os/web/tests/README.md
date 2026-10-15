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
| `waitForStableFrame(page, opts)` | waits for a non-black frame that stops changing; returns the PNG. Pass `maxChanged: 0.05` on animated maps |
| `waitForCanvasChange(page, before, opts)` | waits until at least `minChanged` (default 20%) of pixels differ from `before` |
| `comparePngs(page, a, b)` | `{ changedRatio, nonBlackRatioB }` for two PNGs |
| `canvasPng(page)` | screenshot of `#canvas` |
| `pressKey(page, key)` | keydown, 80 ms pause, keyup, so the game loop sees the key held for at least one frame |
| `snap(testInfo, name, png)` | saves `<name>.png` into the test folder and attaches it to the report |
| `downloadSlot(page, folder, slot, testInfo)` | shell menu: slot context menu, "Download save", saves the `.tar` and returns its path |

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
