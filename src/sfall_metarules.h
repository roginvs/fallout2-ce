#ifndef FALLOUT_SFALL_METARULES_H_
#define FALLOUT_SFALL_METARULES_H_

#include "interpreter.h"

namespace fallout {

typedef void(MetaruleHandler)(Program* program, int args);

// Simplified cousin of `SfallMetarule` from Sfall.
typedef struct MetaruleInfo {
    const char* name;
    MetaruleHandler* handler;
    int minArgs;
    int maxArgs;
} MetaruleInfo;


extern const MetaruleInfo kMetarules[];

void sfall_metarule(Program* program, int args);

} // namespace fallout

#endif /* FALLOUT_SFALL_METARULES_H_ */
