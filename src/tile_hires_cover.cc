#include "debug.h"
#include "draw.h"
#include "stdio.h"
#include "tile.h"
#include <string.h>
#include <vector>
namespace fallout {

static bool visited_tiles[ELEVATION_COUNT][HEX_GRID_SIZE];

static constexpr int square_width = 16;
static constexpr int square_height = 12;
static constexpr int square_grid_width = 500;
static constexpr int square_grid_height = 300;
static bool visible_squares[ELEVATION_COUNT][square_grid_width][square_grid_height];
static_assert(square_width * square_grid_width == 8000);
static_assert(square_height * square_grid_height == 3600);

static constexpr int screen_view_width = 640;
static constexpr int screen_view_height = 380;

static constexpr int squares_screen_width_half = screen_view_width / 2 / square_width;
static_assert(screen_view_width % (2 * square_width) == 0);
static constexpr int squares_screen_height_half = screen_view_height / 2 / square_height;
// static_assert(screen_view_height % (2 * square_height) == 0);

static void clean_cache()
{
    memset(visited_tiles, 0, sizeof(visited_tiles));
    memset(visible_squares, 0, sizeof(visible_squares));
}
static void clean_cache_for_elevation(int elevation)
{
    memset(visited_tiles[elevation], 0, sizeof(visited_tiles[elevation]));
    memset(visible_squares[elevation], 0, sizeof(visible_squares[elevation]));
}

void init_tile_hires()
{
    debugPrint("init_tile_hires\n");
    clean_cache();
}

struct XY {
    int x;
    int y;
};

#define DO_DEBUG_CHECKS 1

#ifdef DO_DEBUG_CHECKS
#include <stdlib.h>
#endif

static struct XY get_screen_diff()
{
    constexpr int hex_tile_with_lowest_x = 199;
    constexpr int hex_tile_with_lowest_y = 0;

#ifdef DO_DEBUG_CHECKS
    {
        int minX = 0x7FFFFFFF;
        int minY = 0x7FFFFFFF;
        int maxX = 0;
        int maxY = 0;
        int minTileX = -1;
        int minTileY = -1;
        for (int t = 0; t < HEX_GRID_SIZE; t++) {
            int x;
            int y;
            tileToScreenXY(t, &x, &y, gElevation);
            if (x < minX) {
                minX = x;
                minTileX = t;
            };
            if (y < minY) {
                minY = y;
                minTileY = t;
            };
            if (x > maxX) {
                maxX = x;
            }
            if (y > maxY) {
                maxY = y;
            }
        }
        if (minTileX != hex_tile_with_lowest_x || minTileY != hex_tile_with_lowest_y) {
            printf("min tileX=%i x=%i tileY=%i y=%i maxX=%i maxY=%i dx=%i dy=%i\n",
                minTileX, minX,
                minTileY, minY,
                maxX, maxY,
                maxX - minX, maxY - minY);
            exit(108);
        }
    };
#endif

    int offsetX;
    int tmp;
    int offsetY;
    tileToScreenXY(hex_tile_with_lowest_x, &offsetX, &tmp, gElevation);
    tileToScreenXY(hex_tile_with_lowest_y, &tmp, &offsetY, gElevation);
    return {
        .x = offsetX,
        .y = offsetY,
    };
};

static void mark_screen_tiles_around_as_visible(int center_tile, struct XY& screen_diff)
{
    // TODO: Use neighbors information to cover only new squares

    // TODO: This func takes slightly more on the left side

    int centerTileScreenX;
    int centerTileScreenY;
    tileToScreenXY(center_tile, &centerTileScreenX, &centerTileScreenY, gElevation);

    int centerTileGlobalX = centerTileScreenX - screen_diff.x;
    int centerTileGlobalY = centerTileScreenY - screen_diff.y;

#ifdef DO_DEBUG_CHECKS
    {
        if (centerTileGlobalX % square_width != 0 || centerTileGlobalY % square_height != 0) {
            printf("centerTileGlobalX=%i, centerTileGlobalY=%i\n", centerTileGlobalX, centerTileGlobalY);
            exit(101);
        }

        if (
            centerTileGlobalX - squares_screen_width_half * square_width < 0 || centerTileGlobalY - squares_screen_height_half * square_height < 0) {
            printf("centerTileGlobalX=%i, centerTileGlobalY=%i\n", centerTileGlobalX, centerTileGlobalY);
            printf("kekekek border=%i\n", gTileBorderInitialized);
            exit(102);
        }
        if (
            centerTileGlobalX + squares_screen_width_half * square_width >= square_width * square_grid_width
            || centerTileGlobalY + squares_screen_height_half * square_height >= square_height * square_grid_height) {
            printf("centerTileGlobalX=%i, centerTileGlobalY=%i\n", centerTileGlobalX, centerTileGlobalY);
            exit(103);
        }
    };
#endif

    int squareX = centerTileGlobalX / square_width;
    int squareY = centerTileGlobalY / square_height;
    for (int x = squareX - squares_screen_width_half; x <= squareX + squares_screen_width_half; x++) {
        for (int y = squareY - squares_screen_height_half; y <= squareY + squares_screen_height_half; y++) {
            visible_squares[gElevation][x][y] = true;
        }
    }
}

void on_center_tile_or_elevation_change()
{
    if (!gTileBorderInitialized) {
        return;
    };

    if (visited_tiles[gElevation][gCenterTile]) {
        debugPrint("on_center_tile_or_elevation_change tile was visited gElevation=%i gCenterTile=%i so doing nothing\n",
            gElevation, gCenterTile);

        return;
    };

    debugPrint("on_center_tile_or_elevation_change non-visited tile gElevation=%i gCenterTile=%i\n",
        gElevation, gCenterTile);

    clean_cache_for_elevation(gElevation);

    std::vector<int> tiles_to_visit {};
    tiles_to_visit.reserve(7000);

    tiles_to_visit.push_back(gCenterTile);

    int visited_tiles_count = 0;

    auto screen_diff = get_screen_diff();

    while (!tiles_to_visit.empty()) {
        auto tile = tiles_to_visit.back();
        tiles_to_visit.pop_back();

        if (visited_tiles[gElevation][tile]) {
            continue;
        }

        if (tile != gCenterTile) [[unlikely]] {
            if (tile < 0 || tile >= HEX_GRID_SIZE) {
                continue;
            }
            if (_obj_scroll_blocking_at(tile, gElevation) == 0) {
                continue;
            }

            // TODO: Maybe create new function in tile.cc and use it here
            int tile_x = HEX_GRID_WIDTH - 1 - tile % HEX_GRID_WIDTH;
            int tile_y = tile / HEX_GRID_WIDTH;
            if (
                tile_x <= gTileBorderMinX || tile_x >= gTileBorderMaxX || tile_y <= gTileBorderMinY || tile_y >= gTileBorderMaxY) {
                continue;
            }
        }

        visited_tiles_count++;

        visited_tiles[gElevation][tile] = true;
        mark_screen_tiles_around_as_visible(tile, screen_diff);

        int tileScreenX;
        int tileScreenY;
        tileToScreenXY(tile, &tileScreenX, &tileScreenY, gElevation);

        tiles_to_visit.push_back(tileFromScreenXY(tileScreenX - 32 + 16, tileScreenY + 8, gElevation, true));
        tiles_to_visit.push_back(tileFromScreenXY(tileScreenX + 32 + 16, tileScreenY + 8, gElevation, true));
        tiles_to_visit.push_back(tileFromScreenXY(tileScreenX + 16, tileScreenY - 24 + 8, gElevation, true));
        tiles_to_visit.push_back(tileFromScreenXY(tileScreenX + 16, tileScreenY + 24 + 8, gElevation, true));
    }

    debugPrint("on_center_tile_or_elevation_change visited_tiles_count=%i\n", visited_tiles_count);
}

void draw_tile_hires_cover(Rect* rect, unsigned char* buffer, int windowWidth, int windowHeight)
{
    int minX = rect->left;
    int minY = rect->top;
    int maxX = rect->right;
    int maxY = rect->bottom;

    auto screen_diff = get_screen_diff();
    int minXglobal = minX - screen_diff.x;
    int minYglobal = minY - screen_diff.y;
    int maxXglobal = maxX - screen_diff.x;
    int maxYglobal = maxY - screen_diff.y;

#ifdef DO_DEBUG_CHECKS
    {
        if (minXglobal < 0) {
            printf("minXglobal=%i\n", minXglobal);
            exit(104);
        };
        if (minYglobal < 0) {
            printf("minYglobal=%i\n", minYglobal);
            exit(105);
        };
        if (maxXglobal >= square_width * square_grid_width) {
            printf("maxXglobal=%i\n", maxXglobal);
            exit(106);
        };
        if (maxYglobal >= square_height * square_grid_height) {
            // This can happen if screen width is 640*8
            printf("maxYglobal=%i\n", maxYglobal);
            exit(107);
        };
    }
#endif

    if (minXglobal % square_width != 0) {
        minXglobal = minXglobal - (minXglobal % square_width);
    };
    if (minYglobal % square_height != 0) {
        minYglobal = minYglobal - (minYglobal % square_height);
    };
    maxXglobal++;
    if ((maxXglobal) % square_width != 0) {
        maxXglobal = maxXglobal - (maxXglobal % square_width) + square_width;
    };
    maxYglobal++;
    if ((maxYglobal) % square_height != 0) {
        maxYglobal = maxYglobal - (maxYglobal % square_height) + square_height;
    };

    int minSquareX = minXglobal / square_width;
    int minSquareY = minYglobal / square_height;
    int maxSquareX = maxXglobal / square_width;
    int maxSquareY = maxYglobal / square_height;
    for (int x = minSquareX; x <= maxSquareX; x++) {
        for (int y = minSquareY; y <= maxSquareY; y++) {
            if (!visible_squares[gElevation][x][y]) {
                int screenX = x * square_width + screen_diff.x;
                int screenY = y * square_height + screen_diff.y;
                Rect squareRect = {
                    .left = screenX,
                    .top = screenY,
                    .right = screenX + square_width,
                    .bottom = screenY + square_height,
                };

                Rect intersection;
                if (rectIntersection(rect, &squareRect, &intersection) == -1) {
                    continue;
                };

                bufferFill(buffer + windowWidth * intersection.top + intersection.left,
                    intersection.right - intersection.left + 1,
                    intersection.bottom - intersection.top + 1,
                    windowWidth,
                    0x40);
            }
        }
    }
}

} // namespace fallout