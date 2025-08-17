#include "sfall_behaviours.h"

#include "display_monitor.h"
#include "sfall_config.h"
#include "worldmap.h"

namespace fallout {

void sfallOnBeforeGameInit()
{

}

void sfallOnGameInit()
{

}

void sfallOnAfterGameInit()
{

}

void sfallOnGameExit()
{

}

void sfallOnGameReset()
{

}

void sfallOnBeforeGameStart()
{

}

void sfallOnAfterGameStarted()
{
    //Disable Horrigan Patch
    bool isDisableHorrigan = false;
    configGetBool(&gSfallConfig, SFALL_CONFIG_MISC_KEY, SFALL_CONFIG_DISABLE_HORRIGAN, &isDisableHorrigan);

    if (isDisableHorrigan)
    {
        didMeetFrankHorrigan = true;
        displayMonitorAddMessage(SFALL_CONFIG_DISABLE_HORRIGAN);
    }
}

void sfallOnAfterNewGame()
{

}

void sfallOnGameModeChange()
{

}

void sfallOnBeforeGameClose()
{

}

void sfallOnCombatStart()
{

}

void sfallOnCombatEnd()
{

}

void sfallOnBeforeMapLoad()
{

}

} // namespace fallout
