#include "unknown_opcodes_scan.h"
#include "interpreter.h"
#include "platform_compat.h"
#include <algorithm>
#include <filesystem>
#include <iostream>
#include <map>
#include <set>
#include <stdio.h>
#include <string>

std::map<fallout::opcode_t, std::set<std::string>> unknown_opcodes;

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
            printf("ERROR: Wrong opcode %x in file %s at pos=0x%x\n", opcode, fName.c_str(), i);
            return;
        };
        unsigned int opcodeIndex = opcode & 0x3FF;
        fallout::OpcodeHandler* handler = fallout::gInterpreterOpcodeHandlers[opcodeIndex];
        if (handler == NULL) {
            auto& set = unknown_opcodes[opcode];
            set.insert(fName);
        };

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

void check_file(std::string fName)
{
    fallout::File* stream = fallout::fileOpen(fName.c_str(), "rb");
    if (stream == NULL) {
        printf("Error opening %s\n", fName.c_str());
        exit(1);
    }

    int fileSize = fallout::fileGetSize(stream);
    // TODO: Use smart ptr
    auto data = (unsigned char*)malloc(fileSize);

    fileRead(data, 1, fileSize, stream);
    fileClose(stream);

    {

        check_data(fName, data, 0, 0x2A, 0);

        auto identifiers_pos = 24 * fallout::stackReadInt32(data, 42) + 42 + 4;
        auto static_strings_pos = identifiers_pos + fallout::stackReadInt32(data, identifiers_pos) + 4 + 4;
        auto static_string_len = fallout::stackReadInt32(data, static_strings_pos);
        if (static_string_len == -1) {
            static_string_len = -4;
        }
        auto code_pos = static_strings_pos + static_string_len + 4 + 4;

        // printf("File %s identifiers_pos=%x static_strings_pos=%x code_pos=%x\n", fName.c_str(), identifiers_pos,static_strings_pos, code_pos);

        check_data(fName, data, code_pos, fileSize, static_strings_pos);
    }

    free(data);
};

void scan_in_folder(std::string dirPath)
{
    std::cout << "Scanning folder: " << dirPath << std::endl;
    for (auto dirEntry : std::filesystem::directory_iterator(dirPath)) {
        if (dirEntry.is_directory()) {
            scan_in_folder(dirEntry.path().string());
            continue;
        } else if (dirEntry.is_regular_file()) {
            std::string file_ext = dirEntry.path().extension().string();
            std::transform(file_ext.begin(), file_ext.end(), file_ext.begin(), ::tolower);
            if (file_ext == ".int") {
                std::cout << "Scanning file: " << dirEntry.path() << std::endl;
                check_file(dirEntry.path());
            } else {
                std::cout << "Skipping file with unsupported extension: " << dirEntry.path() << std::endl;
            }
        } else {
            std::cout << "Skipping non-regular file: " << dirEntry.path() << std::endl;
        }
    }
}

void checkScriptsOpcodes()
{
    unknown_opcodes.clear();
    scan_in_folder("/home/vasilii/sslc");
}