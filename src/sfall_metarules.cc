#include "sfall_metarules.h"

#include <algorithm>
#include <string.h>
#include <memory>

#include "combat.h"
#include "debug.h"
#include "game.h"
#include "game_dialog.h"
#include "game_mouse.h"
#include "interface.h"
#include "inventory.h"
#include "object.h"
#include "sfall_ini.h"
#include "text_font.h"
#include "tile.h"
#include "window.h"
#include "worldmap.h"

namespace fallout {

typedef void(MetaruleHandler)(Program* program, int args);

// Simplified cousin of `SfallMetarule` from Sfall.
typedef struct MetaruleInfo {
    const char* name;
    MetaruleHandler* handler;
    int minArgs;
    int maxArgs;
} MetaruleInfo;

static void mf_car_gas_amount(Program* program, int args);
static void mf_combat_data(Program* program, int args);
static void mf_critter_inven_obj2(Program* program, int args);
static void mf_dialog_obj(Program* program, int args);
static void mf_get_cursor_mode(Program* program, int args);
static void mf_get_flags(Program* program, int args);
static void mf_get_object_data(Program* program, int args);
static void mf_get_text_width(Program* program, int args);
static void mf_intface_redraw(Program* program, int args);
static void mf_loot_obj(Program* program, int args);
static void mf_metarule_exist(Program* program, int args);
static void mf_outlined_object(Program* program, int args);
static void mf_set_cursor_mode(Program* program, int args);
static void mf_set_flags(Program* program, int args);
static void mf_set_ini_setting(Program* program, int args);
static void mf_set_outline(Program* program, int args);
static void mf_show_window(Program* program, int args);
static void mf_tile_refresh_display(Program* program, int args);
static void mf_string_format(Program* program, int args);

constexpr MetaruleInfo kMetarules[] = {
    { "car_gas_amount", mf_car_gas_amount, 0, 0 },
    { "combat_data", mf_combat_data, 0, 0 },
    { "critter_inven_obj2", mf_critter_inven_obj2, 2, 2 },
    { "dialog_obj", mf_dialog_obj, 0, 0 },
    { "get_cursor_mode", mf_get_cursor_mode, 0, 0 },
    { "get_flags", mf_get_flags, 1, 1 },
    { "get_object_data", mf_get_object_data, 2, 2 },
    { "get_text_width", mf_get_text_width, 1, 1 },
    { "intface_redraw", mf_intface_redraw, 0, 1 },
    { "loot_obj", mf_loot_obj, 0, 0 },
    { "metarule_exist", mf_metarule_exist, 1, 1 },
    { "outlined_object", mf_outlined_object, 0, 0 },
    { "set_cursor_mode", mf_set_cursor_mode, 1, 1 },
    { "set_flags", mf_set_flags, 2, 2 },
    { "set_ini_setting", mf_set_ini_setting, 2, 2 },
    { "set_outline", mf_set_outline, 2, 2 },
    { "show_window", mf_show_window, 0, 1 },
    { "tile_refresh_display", mf_tile_refresh_display, 0, 0 },
    { "string_format", mf_string_format, 2, 8 },
};

constexpr int kMetarulesMax = sizeof(kMetarules) / sizeof(kMetarules[0]);

void mf_car_gas_amount(Program* program, int args)
{
    programStackPushInteger(program, wmCarGasAmount());
}

void mf_combat_data(Program* program, int args)
{
    if (isInCombat()) {
        programStackPushPointer(program, combat_get_data());
    } else {
        programStackPushPointer(program, nullptr);
    }
}

void mf_critter_inven_obj2(Program* program, int args)
{
    int slot = programStackPopInteger(program);
    Object* obj = static_cast<Object*>(programStackPopPointer(program));

    switch (slot) {
    case 0:
        programStackPushPointer(program, critterGetArmor(obj));
        break;
    case 1:
        programStackPushPointer(program, critterGetItem2(obj));
        break;
    case 2:
        programStackPushPointer(program, critterGetItem1(obj));
        break;
    case -2:
        programStackPushInteger(program, obj->data.inventory.length);
        break;
    default:
        programFatalError("mf_critter_inven_obj2: invalid type");
    }
}

void mf_dialog_obj(Program* program, int args)
{
    if (GameMode::isInGameMode(GameMode::kDialog)) {
        programStackPushPointer(program, gGameDialogSpeaker);
    } else {
        programStackPushPointer(program, nullptr);
    }
}

void mf_get_cursor_mode(Program* program, int args)
{
    programStackPushInteger(program, gameMouseGetMode());
}

void mf_get_flags(Program* program, int args)
{
    Object* object = static_cast<Object*>(programStackPopPointer(program));
    programStackPushInteger(program, object->flags);
}

void mf_get_object_data(Program* program, int args)
{
    size_t offset = static_cast<size_t>(programStackPopInteger(program));
    void* ptr = programStackPopPointer(program);

    if (offset % 4 != 0) {
        programFatalError("mf_get_object_data: bad offset %d", offset);
    }

    int value = *reinterpret_cast<int*>(reinterpret_cast<unsigned char*>(ptr) + offset);
    programStackPushInteger(program, value);
}

void mf_get_text_width(Program* program, int args)
{
    const char* string = programStackPopString(program);
    programStackPushInteger(program, fontGetStringWidth(string));
}

void mf_intface_redraw(Program* program, int args)
{
    if (args == 0) {
        interfaceBarRefresh();
    } else {
        // TODO: Incomplete.
        programFatalError("mf_intface_redraw: not implemented");
    }

    programStackPushInteger(program, -1);
}

void mf_loot_obj(Program* program, int args)
{
    if (GameMode::isInGameMode(GameMode::kInventory)) {
        programStackPushPointer(program, inven_get_current_target_obj());
    } else {
        programStackPushPointer(program, nullptr);
    }
}

void mf_metarule_exist(Program* program, int args)
{
    const char* metarule = programStackPopString(program);

    for (int index = 0; index < kMetarulesMax; index++) {
        if (strcmp(kMetarules[index].name, metarule) == 0) {
            programStackPushInteger(program, 1);
            return;
        }
    }

    programStackPushInteger(program, 0);
}

void mf_outlined_object(Program* program, int args)
{
    programStackPushPointer(program, gmouse_get_outlined_object());
}

void mf_set_cursor_mode(Program* program, int args)
{
    int mode = programStackPopInteger(program);
    gameMouseSetMode(mode);
    programStackPushInteger(program, -1);
}

void mf_set_flags(Program* program, int args)
{
    int flags = programStackPopInteger(program);
    Object* object = static_cast<Object*>(programStackPopPointer(program));

    object->flags = flags;

    programStackPushInteger(program, -1);
}

void mf_set_ini_setting(Program* program, int args)
{
    ProgramValue value = programStackPopValue(program);
    const char* triplet = programStackPopString(program);

    if (value.isString()) {
        const char* stringValue = programGetString(program, value.opcode, value.integerValue);
        if (!sfall_ini_set_string(triplet, stringValue)) {
            debugPrint("set_ini_setting: unable to write '%s' to '%s'",
                stringValue,
                triplet);
        }
    } else {
        int integerValue = value.asInt();
        if (!sfall_ini_set_int(triplet, integerValue)) {
            debugPrint("set_ini_setting: unable to write '%d' to '%s'",
                integerValue,
                triplet);
        }
    }

    programStackPushInteger(program, -1);
}

void mf_set_outline(Program* program, int args)
{
    int outline = programStackPopInteger(program);
    Object* object = static_cast<Object*>(programStackPopPointer(program));
    object->outline = outline;
    programStackPushInteger(program, -1);
}

void mf_show_window(Program* program, int args)
{
    if (args == 0) {
        _windowShow();
    } else if (args == 1) {
        const char* windowName = programStackPopString(program);
        if (!_windowShowNamed(windowName)) {
            debugPrint("show_window: window '%s' is not found", windowName);
        }
    }

    programStackPushInteger(program, -1);
}

void mf_tile_refresh_display(Program* program, int args)
{
    tileWindowRefresh();
    programStackPushInteger(program, -1);
}

void mf_string_format(Program* program, int args)
{
    sprintf_lite(program, args, "string_format");
}

void sprintf_lite(Program* program, int args, const char* infoOpcodeName)
{
    auto format = programStackPopString(program); // Pop the format string

    ProgramValue formatArgs[7]; // 8 arguments total, 1 for format string

    for (int index = 0; index < args - 1; index++) {
        formatArgs[index] = programStackPopValue(program);
    }

    int fmtLen = strlen(format);
    if (fmtLen == 0) {
        programStackPushString(program, "");
        return;
    }
    if (fmtLen > 1024) {
        debugPrint("%s(): format string exceeds maximum length of 1024 characters.", infoOpcodeName);
        programStackPushString(program, "Error");
        return;
    }
    int newFmtLen = fmtLen;

    for (int i = 0; i < fmtLen; i++) {
        if (format[i] == '%') newFmtLen++; // will possibly be escaped, need space for that
    }

    // parse format to make it safe
    auto newFmt = std::make_unique<char[]>(newFmtLen + 1);

    bool conversion = false;
    int j = 0;
    int valIdx = 0;

    char out[5120+1] = { 0 };
    int bufCount = sizeof(out) - 1;
    char* outBuf = out;
    

    int numArgs = args; // From 2 to 8

    for (int i = 0; i < fmtLen; i++) {
        char c = format[i];
        if (!conversion) {
            // Start conversion.
            if (c == '%') conversion = true;
        } else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '%') {
            int partLen;
            if (c == '%') {
                // escaped % sign, just copy newFmt up to (and including) the leading % sign
                newFmt[j] = '\0';
                // strncpy_s(outBuf, bufCount, newFmt, j);
                strncpy(outBuf, newFmt.get(), std::min(j, bufCount - 1));
                partLen = j;
            } else {
                // ignore size prefixes
                if (c == 'h' || c == 'l' || c == 'j' || c == 'z' || c == 't' || c == 'w' || c == 'L' || c == 'I') continue;
                // Type specifier, perform conversion.
                if (++valIdx == numArgs) {
                    debugPrint("%s() - format string contains more conversions than passed arguments (%d): %s",
                        infoOpcodeName, numArgs - 1, format);
                }
                const auto& arg = formatArgs[std::min(valIdx - 1, numArgs - 2)];

                // ctx.arg(valIdx < numArgs ? valIdx : numArgs - 1);
                if (c == 'S' || c == 'Z') {
                    c = 's'; // don't allow wide strings
                }
                if (c == 's' && !arg.isString() || // don't allow treating non-string values as string pointers
                    c == 'n') // don't allow "n" specifier
                {
                    c = 'd';
                }
                newFmt[j++] = c;
                newFmt[j] = '\0';
                partLen = arg.isFloat()
                    ? snprintf(outBuf, bufCount, newFmt.get(), arg.floatValue)
                    : arg.isInt()    ? snprintf(outBuf, bufCount, newFmt.get(), arg.integerValue)
                    : arg.isString() ? snprintf(outBuf, bufCount, newFmt.get(),
                                           programGetString(program, arg.opcode, arg.integerValue))
                                     : snprintf(outBuf, bufCount, newFmt.get(), "<UNSUPPORTED TYPE>");
            }
            outBuf += partLen;
            bufCount -= partLen;
            conversion = false;
            j = 0;
            if (bufCount <= 0) {
                break;
            }
            continue;
        }
        newFmt[j++] = c;
    }
    // Copy the remainder of the string.
    if (bufCount > 0) {
        newFmt[j] = '\0';
        // strcpy_s(outBuf, bufCount, newFmt);
        if (strlen(newFmt.get()) < bufCount) {
            strcpy(outBuf, newFmt.get());
        } else {
            strncpy(outBuf, newFmt.get(), bufCount - 1);
            outBuf[bufCount - 1] = '\0'; // Ensure null-termination
        }
    }


    programStackPushString(program, out);
}

void sfall_metarule(Program* program, int args)
{
    static ProgramValue values[8];

    for (int index = 0; index < args; index++) {
        values[index] = programStackPopValue(program);
    }

    const char* metarule = programStackPopString(program);

    for (int index = 0; index < args; index++) {
        programStackPushValue(program, values[index]);
    }

    int metaruleIndex = -1;
    for (int index = 0; index < kMetarulesMax; index++) {
        if (strcmp(kMetarules[index].name, metarule) == 0) {
            metaruleIndex = index;
            break;
        }
    }

    if (metaruleIndex == -1) {
        programFatalError("op_sfall_func: '%s' is not implemented", metarule);
    }

    if (args < kMetarules[metaruleIndex].minArgs || args > kMetarules[metaruleIndex].maxArgs) {
        programFatalError("op_sfall_func: '%s': invalid number of args", metarule);
    }

    kMetarules[metaruleIndex].handler(program, args);
}

} // namespace fallout
