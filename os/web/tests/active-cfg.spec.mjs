import { expect, test } from "@playwright/test";

test("ConfigFile and the web screen keys round-trip through IniParser", async ({
    page,
}) => {
    await page.goto("/tests/harness.html");
    const result = await page.evaluate(async () => {
        const { IniParser } = await import("/iniparser.mjs");
        const ddraw = new TextEncoder().encode(
            "[Misc]\nConfigFile=Nevada.cfg\n",
        );
        const configFile = new IniParser(ddraw)
            .getValue("Misc", "ConfigFile")
            ?.trim();
        const cfg = new IniParser(new Uint8Array());
        cfg.setValue("screen", "resolution_x", "1280");
        cfg.setValue("screen", "resolution_y", "720");
        cfg.setValue("qol", "walk_when_sneaking", "1");
        cfg.setValue("system", "f2_res_migrated", "1");
        cfg.setValue("ui", "alternate_ammo_meter", "1");
        const packed = new TextDecoder().decode(cfg.pack());
        return { configFile, packed };
    });
    expect(result.configFile).toBe("Nevada.cfg");
    expect(result.packed).toContain("resolution_x=1280");
    expect(result.packed).toContain("walk_when_sneaking=1");
    expect(result.packed).toContain("f2_res_migrated=1");
    expect(result.packed).toContain("alternate_ammo_meter=1");
});
