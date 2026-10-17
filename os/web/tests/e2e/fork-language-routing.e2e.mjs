// Fork P2: shell language and hash routing (mainmenu.mjs renderMenu).
// No hash -> #/ru or #/en from navigator.languages; only that language's
// games, first of each gameType unless "Show all versions" (#/<lang>/all);
// #/<folder> shows just that game in its own language. Shell only.
import { expect, test } from "../helpers/fixtures.mjs";
import { configuration } from "../../config.mjs";

const VARIANTS = [
    { locale: "en-US", lang: "en", start: "Start game", other: "ru" },
    { locale: "ru-RU", lang: "ru", start: "Запустить игру", other: "en" },
];
const CYRILLIC = /[А-Яа-яЁё]/;

for (const { locale, lang, start, other } of VARIANTS) {
    test.describe(locale, () => {
        test.use({ locale });

        test(`fork P2: language and hash routing (${locale})`, async ({
            page,
        }) => {
            const games = configuration.games.filter((g) => g.lang === lang);
            const firstOfType = games.filter(
                (g, i) =>
                    games.findIndex((x) => x.gameType === g.gameType) === i,
            );
            const visibleStarts = page.locator(".game_start:visible");

            await page.goto("/");
            await expect(page).toHaveURL(new RegExp(`#/${lang}$`));
            await expect(visibleStarts).toHaveCount(firstOfType.length, {
                timeout: 30_000,
            });
            for (const g of firstOfType) {
                await expect(page.locator(`#start_${g.folder}`)).toHaveText(
                    start,
                );
            }
            if (lang === "en") {
                const text = await page
                    .locator("#menu_content > div:not(:has(.languages_links))")
                    .allInnerTexts();
                expect(text.join("")).toContain("Fallout");
                expect(
                    text.filter((t) => CYRILLIC.test(t)),
                    "no Russian text on the English menu",
                ).toEqual([]);
            }

            // Show all versions -> #/<lang>/all with every game of the language.
            await page.locator("#show_all_games").click();
            await expect(page).toHaveURL(new RegExp(`#/${lang}/all$`));
            await expect(visibleStarts).toHaveCount(games.length, {
                timeout: 30_000,
            });

            // A game hash opens just that game, in the game's language.
            const foreign = configuration.games.find((g) => g.lang === other);
            if (!foreign) throw new Error(`no ${other} game in config.mjs`);
            await page.goto(`/#/${foreign.folder}`);
            await page.reload();
            await expect(visibleStarts).toHaveCount(1, { timeout: 30_000 });
            await expect(page.locator(`#start_${foreign.folder}`)).toHaveText(
                other === "ru" ? "Запустить игру" : "Start game",
            );
            // "Show all games" goes back to that language's list.
            await page.locator("#show_all_games").click();
            await expect(page).toHaveURL(new RegExp(`#/${other}$`));
        });
    });
}
