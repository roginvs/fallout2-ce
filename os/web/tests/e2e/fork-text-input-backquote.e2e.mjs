// Fork P1: JS text input bridge (input.cc beginTextInput/endTextInput ->
// onscreen_keyboard.mjs startTextInput/stopTextInput) and Backquote as Escape
// (hotkeys_and_workarounds.mjs addBackquoteAsEscape). Touch context, so the
// on-screen keyboard is expected while the save description is typed; its
// keys (letters, Backspace, Enter) type into the game.
import { expect, test } from "../helpers/fixtures.mjs";
import {
    canvasPng,
    comparePngs,
    INTERFACE_BAR,
    launchGameRetry,
    newGameToMap,
    pressKey,
    snap,
    waitForCanvasChange,
    waitForStableFrame,
} from "../helpers/game.mjs";

const FOLDER = "FalloutNevadaEng";

test.use({ hasTouch: true });

test("fork P1: save description shows on-screen keyboard; ` closes inventory", async ({
    page,
}, testInfo) => {
    test.setTimeout(20 * 60_000);
    /** @type {string[]} */
    const bridgeWarnings = [];
    page.on("console", (m) => {
        if (/No function (start|stop)TextInput/.test(m.text())) {
            bridgeWarnings.push(m.text());
        }
    });
    await launchGameRetry(page, FOLDER);
    const { inGame } = await newGameToMap(page, testInfo, "01-");
    const keyboard = page.locator(".keyboard");
    await expect(keyboard).toHaveCount(0);

    // F4 -> slot -> Enter opens the description prompt (beginTextInput).
    await pressKey(page, "F4");
    await waitForCanvasChange(page, inGame, {
        minChanged: 0.1,
        timeout: 120_000,
    });
    await waitForStableFrame(page, { maxChanged: 0.01 });
    await pressKey(page, "Enter");
    await expect(
        keyboard,
        "on-screen keyboard for the description",
    ).toBeVisible({
        timeout: 15_000,
    });
    await snap(testInfo, "02-keyboard", await page.screenshot());
    // On-screen keys (with a Backspace) plus the real keyboard, then the
    // on-screen Enter: the description must become "kbd-bridge".
    // Playwright's hit test reports <body> over the keys in headless
    // Chromium, so the key's click is dispatched directly; what lies at the
    // key centre is recorded for diagnosis.
    /** @type {string[]} */
    const hits = [];
    /** @param {string} label */
    const tapKey = async (label) => {
        const key = keyboard
            .locator(".keyboard_button")
            .filter({ hasText: new RegExp(`^${label}$`) });
        const b = await key.boundingBox();
        if (b) {
            hits.push(
                `${label}: ${await page.evaluate(
                    ([x, y]) => {
                        const el = document.elementFromPoint(x, y);
                        return el
                            ? `${el.tagName}.${el.className} ${el.textContent?.slice(0, 10)}`
                            : "null";
                    },
                    [b.x + b.width / 2, b.y + b.height / 2],
                )}`,
            );
        }
        await key.dispatchEvent("click");
        await page.waitForTimeout(150);
    };
    for (const label of ["K", "B", "X", "&lt;-|<-", "D"]) {
        await tapKey(label);
    }
    await page.keyboard.type("-bridge", { delay: 50 });
    await tapKey("enter");
    await testInfo.attach("key-hit-test.txt", {
        body: hits.join("\n"),
        contentType: "text/plain",
    });
    await expect(keyboard, "keyboard removed after Enter").toHaveCount(0, {
        timeout: 60_000,
    });
    const deadline = Date.now() + 180_000;
    let onMap = await canvasPng(page);
    while (Date.now() < deadline) {
        if ((await comparePngs(page, inGame, onMap)).changedRatio < 0.4) break;
        await page.waitForTimeout(1000);
        onMap = await canvasPng(page);
    }
    onMap = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.01,
        timeout: 180_000,
    });
    await snap(testInfo, "03-after-save", onMap);
    expect(bridgeWarnings).toEqual([]);

    // Backquote behaves like Escape: closes the inventory.
    await pressKey(page, "i");
    await waitForCanvasChange(page, onMap, {
        minChanged: 0.15,
        timeout: 120_000,
    });
    const inventory = await waitForStableFrame(page, { maxChanged: 0.02 });
    await snap(testInfo, "04-inventory", inventory);
    await pressKey(page, "Backquote");
    await waitForCanvasChange(page, inventory, {
        minChanged: 0.15,
        timeout: 60_000,
    });
    const back = await waitForStableFrame(page, {
        region: INTERFACE_BAR,
        maxChanged: 0.02,
        timeout: 120_000,
    });
    await snap(testInfo, "05-after-backquote", back);
    expect((await comparePngs(page, onMap, back)).changedRatio).toBeLessThan(
        0.25,
    );

    // The typed description is the slot name in the shell after a reload.
    await page.reload();
    await expect(
        page.locator(`#game_slots_${FOLDER} .game_slot_name`).first(),
    ).toHaveText(/^kbd-bridge$/i, { timeout: 30_000 });
});
