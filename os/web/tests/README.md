# Web tests

From this directory:

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` serves `os/web` on `127.0.0.1:8765` and runs Playwright. The specs cover the IndexedDB sync wrapper and ini parsing used for `ConfigFile`. The nine-game save matrix needs a local WASM build and the published game data; it is not started by this command.
