#ifndef TILE_HIRES_COVER_H
#define TILE_HIRES_COVER_H

#include "geometry.h"
#include "map.h"
#include "tile.h"
#include <string.h>

namespace fallout {

static unsigned char tiles[ELEVATION_COUNT][HEX_GRID_SIZE];

void init_tile_hires();

void on_center_tile_or_elevation_change();

void draw_tile_hires_cover(Rect* rect, unsigned char* buffer, int windowWidth, int windowHeight);

} // namespace fallout

#endif