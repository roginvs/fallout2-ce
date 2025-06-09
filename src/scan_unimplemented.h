#ifndef CHECK_SCRIPTS_OPCODES_SCAN_H
#define CHECK_SCRIPTS_OPCODES_SCAN_H

#include "config.h"
#include <map>
#include <set>
#include <string>

struct CaseInsensitiveCompare {
    bool operator()(const std::string& a, const std::string& b) const
    {
        return std::lexicographical_compare(
            a.begin(), a.end(),
            b.begin(), b.end(),
            [](unsigned char c1, unsigned char c2) {
                return std::tolower(c1) < std::tolower(c2);
            });
    }
};

using ConfigMap = std::map<
    std::string,
    std::map<std::string, std::string, CaseInsensitiveCompare>,
    CaseInsensitiveCompare>;

void checkScriptsOpcodes();

class ConfigChecker {
public:
    ConfigChecker(fallout::Config& configDefaults, std::string configFileName);
    ConfigChecker(ConfigMap configDefaults, std::string configFileName);

    void check(fallout::Config& readedConfig);

private:
    ConfigMap defaultsMap;
    std::string configFileName;
};

#endif /* CHECK_SCRIPTS_OPCODES_SCAN_H */