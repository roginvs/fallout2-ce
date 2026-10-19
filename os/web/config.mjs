/**
 * @typedef {object} GameEntry
 * @property {string} name Game title shown in the main menu.
 * @property {string} folder Folder with game files, served from ./game/.
 * @property {string} lang Game language ("ru" or "en"), drives the `language=`
 *   value written to the active fallout2.cfg on launch (unless
 *   keepGameLanguage is set).
 * @property {string} gameType Game engine type, e.g. "nevada" or "sonora".
 * @property {string[]} links Author/community links to display.
 * @property {string} filesVersion Version of the served file set, bump to
 *   invalidate the game cache of all clients.
 * @property {boolean} [keepGameLanguage] When set, the `language=` value
 *   shipped in the game files is not overridden on launch. Used for builds
 *   that keep their own language mapping inside the files (e.g. Foxx Nevada
 *   rebuilds place russian text under text\english with language=english).
 */

/** @type {{ games: GameEntry[], useGzip: boolean }} */
export const configuration = {
    games: [
        {
            name: "Fallout: Nevada 3.4 090725 Foxx",
            folder: "FalloutNevadaFoxx070925",
            lang: "ru",
            gameType: "nevada",
            links: [
                "https://fallout-nevada.ucoz.ru/",
                "https://vk.com/rebuild_by_foxx",
            ],
            filesVersion: "1",
            keepGameLanguage: true,
        },
        {
            name: "Fallout: Nevada 2.4.1 Foxx",
            folder: "FalloutOfNevada",
            lang: "ru",
            gameType: "nevada",
            links: [
                "https://fallout-nevada.ucoz.ru/",
                "https://vk.com/rebuild_by_foxx",
            ],
            filesVersion: "1",
            keepGameLanguage: true,
        },
        {
            name: "Fallout: Nevada 1.00 + патч 02",
            lang: "ru",
            gameType: "nevada",
            folder: "Fallout_Nevada_official_20240505_100_patch2",
            links: ["https://fallout-nevada.ucoz.ru/index/fontec/0-5"],
            filesVersion: "1",
        },
        {
            name: "Fallout: Nevada English 2.0.3.3",
            folder: "FalloutNevadaEng",
            lang: "en",
            gameType: "nevada",
            links: [
                "https://www.nma-fallout.com/threads/fallout-nevada-extended.207311/",
                "https://fallout-nevada.ucoz.ru/",
            ],
            filesVersion: "1",
        },
        {
            name: "Fallout: Sonora 1.16.4 NovaRain (+ DLC)",
            folder: "Fallout_Sonora_1_16_4_novarain_ru",
            lang: "ru",
            gameType: "sonora",
            links: [
                "https://github.com/NovaRain/Fallout-Sonora-English",
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
            ],
            filesVersion: "2",
        },
        {
            name: "Fallout: Sonora 1.15 (+ DLC)",
            folder: "Fallout_Sonora_1_15_dlc",
            lang: "ru",
            gameType: "sonora",
            links: [
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
            ],
            filesVersion: "1",
        },
        {
            name: "Fallout: Sonora 1.13 (+ DLC)",
            folder: "Fallout_Sonora_1_13_dlc",
            lang: "ru",
            gameType: "sonora",
            links: [
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
            ],
            filesVersion: "1",
        },
        {
            name: "Fallout: Sonora 1.11 (+ DLC)",
            folder: "Fallout_Sonora",
            lang: "ru",
            gameType: "sonora",
            links: [
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
            ],
            filesVersion: "1",
        },
        {
            name: "Fallout: Sonora English 1.16.4E (+ DLC) by NovaRain",
            folder: "Fallout_Sonora_1_16_4_novarain_eng",
            lang: "en",
            gameType: "sonora",
            links: [
                "https://cambragol.github.io/Fallout-Sonora/",
                "https://github.com/NovaRain/Fallout-Sonora-English",
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
            ],
            filesVersion: "2",
        },
        {
            name: "Fallout: Sonora English 1.16.4E (+ DLC) by Cambragol",
            folder: "Fallout_Sonora_1_16_E_dlc_eng",
            lang: "en",
            gameType: "sonora",
            links: [
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
                "https://cambragol.github.io/Fallout-Sonora/",
            ],
            filesVersion: "3",
        },
        {
            name: "Fallout: Sonora English 1.15 (+ DLC) by Cambragol 1.05",
            folder: "Fallout_Sonora_1_15_dlc_eng",
            lang: "en",
            gameType: "sonora",
            links: [
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
                "https://cambragol.github.io/Fallout-Sonora/",
            ],
            filesVersion: "3",
        },

        {
            name: "Fallout: Sonora English 1.14 (+ DLC) by Cambragol 1.03",
            folder: "Fallout_Sonora_1_14_dlc_eng",
            lang: "en",
            gameType: "sonora",
            links: [
                "https://fallout-nevada.ucoz.ru/index/opisanie_fallout_sonora/0-59",
                "https://cambragol.github.io/Fallout-Sonora/",
            ],
            filesVersion: "3",
        },
    ],
    useGzip: true,
};
