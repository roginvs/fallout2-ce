// Reference end-to-end test. Copy this file to write the next scenario.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    comparePngs,
    launchGame,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

test("main menu renders and 'n' opens character selection", async ({
    page,
}, testInfo) => {
    await launchGame(page, FOLDER);

    const mainMenu = await waitForStableFrame(page);
    await snap(testInfo, "01-main-menu", mainMenu);

    await pressKey(page, "n");

    await waitForCanvasChange(page, mainMenu);
    const next = await waitForStableFrame(page, { timeout: 60_000 });
    await snap(testInfo, "02-after-n", next);

    const { changedRatio } = await comparePngs(page, mainMenu, next);
    expect(changedRatio).toBeGreaterThanOrEqual(0.2);
});
