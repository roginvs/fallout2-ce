#include <filesystem>
#include "unknown_opcodes_scan.h"
#include <iostream>
#include <string>
#include <algorithm>


void check_file(const char* path) {
    // This function is a placeholder for scanning a file for unknown opcodes.
    // The actual implementation would involve reading the file and checking
    // for opcodes that are not recognized by the interpreter.
}

void scan_in_folder(std::string dirPath) {
  std::cout << "Scanning folder: " << dirPath << std::endl;
  for (auto dirEntry : std::filesystem::directory_iterator(dirPath)) {
    if (dirEntry.is_directory()) {
      scan_in_folder(dirEntry.path().string());
      continue;
    } else if (dirEntry.is_regular_file()) {
      std::string file_ext = dirEntry.path().extension().string();
      std::transform(file_ext.begin(), file_ext.end(), file_ext.begin(), ::tolower);
      if (file_ext == "int") {
        std::cout << "Scanning file: " << dirEntry.path() << std::endl;
      } else {
        std::cout << "Skipping file with unsupported extension: " << dirEntry.path() << std::endl;        
      }
    } else {
      std::cout << "Skipping non-regular file: " << dirEntry.path() << std::endl;
    }
  }

}

void checkScriptsOpcodes() {
    scan_in_folder(".");
}