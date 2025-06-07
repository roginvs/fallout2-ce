#ifndef SCAN_UNIMPLEMENTED_UTILS_H
#define SCAN_UNIMPLEMENTED_UTILS_H

#include "scan_unimplemented.h"
#include "config.h"
#include "dfile.h"
#include "dictionary.h"
#include "interpreter.h"
#include "platform_compat.h"
#include "scan_unimplemented_sfall.h"
#include "sfall_metarules.h"
#include <algorithm>
#include <dirent.h>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <stdio.h>
#include <string.h>
#include <string>
#include <sys/stat.h>

std::string to_lower(const std::string& str)
{
    std::string lowerStr = str;
    std::transform(lowerStr.begin(), lowerStr.end(), lowerStr.begin(), ::tolower);
    return lowerStr;
};

bool ends_with(const std::string& str, const std::string& suffix)
{
    auto low = to_lower(str);
    auto low_suffix = to_lower(suffix);
    if (str.size() < suffix.size()) {
        return false;
    }
    return std::equal(low_suffix.rbegin(), low_suffix.rend(), low.rbegin());
}

std::string toHexString(unsigned int value, bool prefix = true, bool uppercase = false)
{
    char buffer[20]; // Enough for "0x" + 8 hex digits + null terminator

    if (prefix) {
        if (uppercase)
            std::snprintf(buffer, sizeof(buffer), "0X%X", value);
        else
            std::snprintf(buffer, sizeof(buffer), "0x%x", value);
    } else {
        if (uppercase)
            std::snprintf(buffer, sizeof(buffer), "%X", value);
        else
            std::snprintf(buffer, sizeof(buffer), "%x", value);
    }

    return std::string(buffer);
}


// This is a simple directory iterator that mimics the behavior of C++17's std::filesystem::directory_iterator
class directory_iterator {
public:
    class DirEntry {
    public:
        explicit DirEntry(const std::string& fullPath)
            : _path(fullPath)
        {
            struct stat s;
            if (stat(fullPath.c_str(), &s) == 0) {
                _isDir = S_ISDIR(s.st_mode);
                _isFile = S_ISREG(s.st_mode);
            } else {
                _isDir = _isFile = false;
            }
        }

        bool is_directory() const { return _isDir; }
        bool is_regular_file() const { return _isFile; }
        const std::string& path() const { return _path; }

    private:
        std::string _path;
        bool _isDir;
        bool _isFile;
    };
    class Iterator {
    public:
        Iterator() = default;
        Iterator(const std::string& path)
            : _dir(opendir(path.c_str()))
            , _root(path)
        {
            ++(*this); // Load first entry
        }

        ~Iterator()
        {
            if (_dir) closedir(_dir);
        }

        DirEntry operator*() const
        {
            return DirEntry(_root + "/" + _entryName);
        }

        Iterator& operator++()
        {
            if (!_dir) return *this;
            struct dirent* entry;
            while ((entry = readdir(_dir))) {
                std::string name = entry->d_name;
                if (name != "." && name != "..") {
                    _entryName = name;
                    return *this;
                }
            }
            // No more entries
            closedir(_dir);
            _dir = nullptr;
            _entryName.clear();
            return *this;
        }

        bool operator!=(const Iterator& other) const
        {
            return _dir != other._dir;
        }

    private:
        DIR* _dir = nullptr;
        std::string _root;
        std::string _entryName;
    };

    explicit directory_iterator(const std::string& path)
        : _path(path)
    {
    }
    Iterator begin() const { return Iterator(_path); }
    Iterator end() const { return Iterator(); }

private:
    std::string _path;
};


#endif