#include "stdio.h"
#include "tile.h"
#include <string.h>

namespace fallout {

static unsigned char tiles[ELEVATION_COUNT][HEX_GRID_SIZE];

void init_tile_hires()
{
    printf("===========================\n");
    printf("init_tile_hires\n");
    printf("===========================\n");
    memset(tiles, 0, sizeof(tiles));
}

void on_center_tile_change()
{
    printf("=========== on_center_tile_change elev=%i tile=%i ================\n",
        gElevation, gCenterTile);

    tiles[gElevation][gCenterTile] = 1;
    if (gCenterTile > 0) {
        tiles[gElevation][gCenterTile - 1] = 2;
    };
    if (gCenterTile < HEX_GRID_SIZE - 1) {
        tiles[gElevation][gCenterTile + 1] = 2;
    };
    if (gCenterTile >= HEX_GRID_HEIGHT) {
        tiles[gElevation][gCenterTile - HEX_GRID_HEIGHT] = 2;
    };
    if (gCenterTile < HEX_GRID_SIZE - HEX_GRID_HEIGHT) {
        tiles[gElevation][gCenterTile + HEX_GRID_HEIGHT] = 2;
    };

    // _obj_scroll_blocking_at
}

void draw_tile_hires_cover(Rect* rect, unsigned char* buffer, int windowWidth, int windowHeight)
{
}

} // namespace fallout