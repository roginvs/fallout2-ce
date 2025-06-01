#ifndef FALLOUT_SFALL_METARULES_H_
#define FALLOUT_SFALL_METARULES_H_

#include "interpreter.h"

namespace fallout {

void sfall_metarule(Program* program, int args);

void sprintf_lite(Program* program, int args, const char* infoOpcodeName);

} // namespace fallout

#endif /* FALLOUT_SFALL_METARULES_H_ */
