#include "unknown_opcodes_scan.h"
#include "interpreter.h"
#include "platform_compat.h"
#include "sfall_metarules.h"
#include "unknown_opcodes_scan_sfall.h"
#include <algorithm>
#include <filesystem>
#include <iostream>
#include <map>
#include <set>
#include <stdio.h>
#include <string.h>
#include <string>

std::map<fallout::opcode_t, std::set<std::string>> unknown_opcodes;
std::map<std::string, std::set<std::string>> sus_strings;

int checked_files = 0;

void check_data(
    std::string fName,
    unsigned char* data,
    size_t start_pos,
    size_t end_pos,
    size_t static_strings_pos)
{
    size_t i = start_pos;
    bool isPreviousPush = false;
    while (i < end_pos) {
        auto opcode = fallout::stackReadInt16(data, i);
        if (!((opcode >> 8) & 0x80)) {
            printf("ERROR: Wrong opcode %x in file %s at pos=0x%lx\n", opcode, fName.c_str(), i);
            return;
        };
        unsigned int opcodeIndex = opcode & 0x3FF;
        fallout::OpcodeHandler* handler = fallout::gInterpreterOpcodeHandlers[opcodeIndex];
        if (handler == NULL) {
            auto& set = unknown_opcodes[opcode];
            set.insert(fName);
        };

        // printf("DEBUG: pos=0x%lx opcode=0x%x (%x) handler=%s\n", i, opcode, opcodeIndex, handler ? "yes": "no=======================");

        if (opcode >= 0x8276 && opcode <= 0x827C) {
            auto paramsCount = opcode - 0x8276;
            /*
            printf("DEBUG: opcode=0x%x params=%i pos=0x%x prevPush=%i\n",
              opcode, paramsCount, i, isPreviousPush);
            if (i != start_pos) {
                if (isPreviousPush) {
                    printf("  prev push, val=%i\n", stackReadInt32(data, i - 4));
                    if (static_strings_pos){
                        printf("    str=%s\n", &data[static_strings_pos + stackReadInt32(data, i - 4)]);
                    }else{
                        printf("    <no static strings>\n");
                    }
                } else {
                    printf("  prev not push opcode=0x%x\n", stackReadInt16(data, i - 2));
                }
            } else {
                printf("  ERR: first opcode\n");
            }
            */
        }

        i += 2;

        if (opcodeIndex == (fallout::OPCODE_PUSH & 0x3FF)) {
            i += 4;
            isPreviousPush = true;
        } else {
            isPreviousPush = false;
        }
    }
};

void print_hex(const std::string& str)
{
    for (unsigned char c : str) {
        std::cout << std::hex << std::setw(2) << std::setfill('0')
                  << static_cast<int>(c) << ' ';
    }
    std::cout << '\n';
}

void check_file(std::string fName)
{
    fallout::File* stream = fallout::fileOpen(fName.c_str(), "rb");
    if (stream == NULL) {
        printf("Error opening %s\n", fName.c_str());
        exit(1);
    }

    checked_files++;

    int fileSize = fallout::fileGetSize(stream);
    // TODO: Use smart ptr
    auto data = (unsigned char*)malloc(fileSize);

    fileRead(data, 1, fileSize, stream);
    fileClose(stream);

    auto script_strings = std::vector<std::string> {};
    {

        check_data(fName, data, 0, 0x2A, 0);

        auto identifiers_pos = 24 * fallout::stackReadInt32(data, 42) + 42 + 4;
        auto static_strings_pos = identifiers_pos + fallout::stackReadInt32(data, identifiers_pos) + 4 + 4;
        auto static_string_len = fallout::stackReadInt32(data, static_strings_pos);
        if (static_string_len == -1) {
            static_string_len = -4;
        }
        // printf("File %s identifiers_pos=%x static_strings_pos=%x static_string_len=%i\n", fName.c_str(), identifiers_pos, static_strings_pos, static_string_len);
        if (static_string_len > 0) {
            auto pos = static_strings_pos + 4;
            while (pos < static_strings_pos + 4 + static_string_len) {
                auto str_len = fallout::stackReadInt16(data, pos);
                pos += 2;
                auto str = &data[pos];
                auto str_len_actual = strlen((char*)str);
                if (str_len_actual <= str_len) {
                    script_strings.push_back(std::string((char*)str, str_len_actual));
                }
                pos += str_len;
            }
        }
        auto code_pos = static_strings_pos + 4 + static_string_len + 4;

        // printf("File %s identifiers_pos=%x static_strings_pos=%x code_pos=%x\n", fName.c_str(), identifiers_pos,static_strings_pos, code_pos);

        check_data(fName, data, code_pos, fileSize, static_strings_pos);
    }
    for (auto script_str : script_strings) {
        if (
            std::find(
                std::begin(sfall_metarules),
                std::end(sfall_metarules),
                script_str)
            != std::end(sfall_metarules)) {
            // That looks like a sFall metarule
            if (
                std::find_if(
                    fallout::kMetarules, fallout::kMetarules + fallout::kMetarulesCount,
                    [&script_str](auto rule) {
                        return std::string(rule.name) == script_str;
                    })
                == fallout::kMetarules + fallout::kMetarulesCount) {

                auto& set = sus_strings[script_str];
                set.insert(fName);

                // printf("WARNING: Found sFall metarule %s in file %s, but it is not defined in kMetarules\n",
                //   script_str.c_str(), fName.c_str());
                // sus_strings[s].insert(fName);
            }
        }
        // std::cout << "Script string: " << script_str << std::endl;
    }

    free(data);
};

void scan_in_folder(std::string dirPath)
{
    // std::cout << "Scanning folder: " << dirPath << std::endl;
    for (auto dirEntry : std::filesystem::directory_iterator(dirPath)) {
        if (dirEntry.is_directory()) {
            scan_in_folder(dirEntry.path().string());
            continue;
        } else if (dirEntry.is_regular_file()) {
            std::string file_ext = dirEntry.path().extension().string();
            std::transform(file_ext.begin(), file_ext.end(), file_ext.begin(), ::tolower);
            if (file_ext == ".int") {
                // std::cout << "Scanning file: " << dirEntry.path() << std::endl;
                check_file(dirEntry.path());
            } else {
                // std::cout << "Skipping file with unsupported extension: " << dirEntry.path() << std::endl;
            }
        } else {
            std::cout << "Skipping non-regular file: " << dirEntry.path() << std::endl;
        }
    }
}

auto get_opcode_name(fallout::opcode_t opcode)
{
    auto sfallName = std::find_if(
        std::begin(opcodeInfoArray),
        std::end(opcodeInfoArray),
        [&opcode](const SfallOpcodeInfo& info) {
            return info.opcode == (opcode & 0x3FF);
        });

    if (sfallName != std::end(opcodeInfoArray)) {
        return sfallName->name;
    } else {
        return std::string("(check Opcodes.cpp)");
    }
}

void checkScriptsOpcodes()
{
    unknown_opcodes.clear();
    sus_strings.clear();

    checked_files = 0;

    scan_in_folder("/home/vasilii/sslc/test/gamescripts/Fallout2_Restoration_Project/");
    // scan_in_folder("/home/vasilii/sslc/test/gamescripts/Fallout2_Restoration_Project/tmp/verytmp/");
    // scan_in_folder("/home/vasilii/fallout2-ce/sfall_testing/");

    if (unknown_opcodes.size() == 0 && sus_strings.size() == 0) {
        printf("Everything is ok, all opcodes are known and no sus strings. Checked %i files\n", checked_files);
    } else {
        printf("\n\nChecked %i files and found those:\n", checked_files);
        for (auto iter : unknown_opcodes) {
            auto& opcode = iter.first;
            // https://github.com/sfall-team/sfall/blob/master/sfall/Modules/Scripting/Opcodes.cpp
            printf("OPCODE %s (0x%x - 0x%x - %i):\n",
                get_opcode_name(opcode).c_str(),
                opcode, opcode & 0x3FF, opcode & 0x3FF);
            for (auto fName : iter.second) {
                printf("  - %s\n", fName.c_str());
            }
        }
        for (auto iter : sus_strings) {
            printf("METARULE %s:\n", iter.first.c_str());
            for (auto fName : iter.second) {
                printf("  - %s\n", fName.c_str());
            }
        }

        printf("\nSame but per-file:\n");
        std::map<std::string, std::set<std::string>> files;
        for (auto iter : unknown_opcodes) {
            auto& opcode = iter.first;
            for (auto fName : iter.second) {
                std::ostringstream oss;
                oss << "OPCODE " << get_opcode_name(opcode) << " "
                    << "0x" << std::hex << (opcode & 0x3FF)
                    << " (0x" << std::hex << opcode << ")";

                files[fName].insert(oss.str());
            }
        }
        for (auto iter : sus_strings) {
            for (auto fName : iter.second) {
                files[fName].insert(std::string("METARULE ") + iter.first);
            }
        }
        for (auto iter : files) {
            printf("%s:\n", iter.first.c_str());
            for (auto s : iter.second) {
                printf("  - %s\n", s.c_str());
            }
        }
        // asdasd
    }
    printf("Done\n");

    exit(0);
}