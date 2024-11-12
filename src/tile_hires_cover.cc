#include "draw.h"
#include "stdio.h"
#include "tile.h"
#include <stack>
#include <string.h>
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

#define CENTER_VISITED_FLAG 0b10000000
// #define TILE_HALF_VISIBLE 0b01000000
#define CLEAR_FLAGS 0b00111111

// fallout2-ce.js:1816 min tileX=199 x=-3312 tileY=0 y=-1390 maxX=4656 maxY=2186 dx=7968 dy=3576
static constexpr int hex_tile_with_lowest_x = 199;
static constexpr int hex_tile_with_lowest_y = 0;

void init_tile_hires()
{
    printf("===========================\n");
    printf("init_tile_hires\n");
    printf("===========================\n");
    memset(visited_tiles, 0, sizeof(visited_tiles));
    memset(visible_squares, 0, sizeof(visible_squares));
}

/*


          odd   even
   x     x     3     2
      5     4    203   202
   6    205   204    x
     206    x     x     x

(even have next on the same row, odd have next on the next row)




tile size is 32 x 18
   ________
 /         \      ^
|           |     | 18
 \_________/      v

<----32 ---->
screen have vertical 0.5 + 31 + 0.5 tiles
horizontal 20

24 px is vertical distance between 2 rows (up and down arrow press)



View is 640 x 380
*/

struct XY {
    int x;
    int y;
};

#define DO_DEBUG_CHECKS true

#if DO_DEBUG_CHECKS == true
#include <stdlib.h>

#endif

static struct XY get_screen_diff()
{
    if (DO_DEBUG_CHECKS) {
        int minX = 0xFFFFFFFF;
        int minY = 0xFFFFFFFF;
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
            exit(100);
        }
    };

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

static void mark_screen_tiles_around_as_visible(int center_tile)
{

    int centerTileScreenX;
    int centerTileScreenY;
    tileToScreenXY(center_tile, &centerTileScreenX, &centerTileScreenY, gElevation);
    auto screen_diff = get_screen_diff();

    int centerTileGlobalX = centerTileScreenX - screen_diff.x;
    int centerTileGlobalY = centerTileScreenY - screen_diff.y;

    if (DO_DEBUG_CHECKS) {
        if (centerTileGlobalX % square_width != 0 || centerTileGlobalY % square_height != 0) {
            printf("centerTileGlobalX=%i, centerTileGlobalY=%i\n", centerTileGlobalX, centerTileGlobalY);
            exit(100);
        }

        if (
            centerTileGlobalX - squares_screen_width_half * square_width < 0 || centerTileGlobalY - squares_screen_height_half * square_height < 0) {
            printf("centerTileGlobalX=%i, centerTileGlobalY=%i\n", centerTileGlobalX, centerTileGlobalY);
            exit(100);
        }
        if (
            centerTileGlobalX + squares_screen_width_half * square_width >= square_width * square_grid_width
            || centerTileGlobalY + squares_screen_height_half * square_height >= square_height * square_grid_height) {
            printf("centerTileGlobalX=%i, centerTileGlobalY=%i\n", centerTileGlobalX, centerTileGlobalY);
            exit(100);
        }
    }

    int squareX = centerTileGlobalX / square_width;
    int squareY = centerTileGlobalY / square_height;
    for (int x = squareX - squares_screen_width_half; x <= squareX + squares_screen_width_half; x++) {
        for (int y = squareY - squares_screen_height_half; y <= squareY + squares_screen_height_half; y++) {
            visible_squares[gElevation][x][y] = true;
        }
    }
}

void on_center_tile_change()
{
    if (visited_tiles[gElevation][gCenterTile]) {
        printf("========= NOOP on_center_tile_change elev=%i tile=%i ================\n",
            gElevation, gCenterTile);

        return;
    } else {
        printf("=========== on_center_tile_change elev=%i tile=%i ================\n",
            gElevation, gCenterTile);
    }

    // TODO: Clear only current elevation
    init_tile_hires();

    std::stack<int> tiles_to_visit;
    tiles_to_visit.push(gCenterTile);

    int visited_tiles_count = 0;
    while (!tiles_to_visit.empty()) {
        auto tile = tiles_to_visit.top();
        tiles_to_visit.pop();

        if (visited_tiles[gElevation][tile]) {
            continue;
        }

        visited_tiles_count++;

        visited_tiles[gElevation][tile] = true;
        mark_screen_tiles_around_as_visible(tile);

        int tileScreenX;
        int tileScreenY;
        tileToScreenXY(tile, &tileScreenX, &tileScreenY, gElevation);

        {
            int neighbor = tileFromScreenXY(tileScreenX - 32, tileScreenY, gElevation, true);
            if (neighbor >= 0 && neighbor <= HEX_GRID_SIZE && _obj_scroll_blocking_at(neighbor, gElevation) == 0) {
                tiles_to_visit.push(neighbor);
            }
        }
        {
            int neighbor = tileFromScreenXY(tileScreenX + 32, tileScreenY, gElevation, true);
            if (neighbor >= 0 && neighbor <= HEX_GRID_SIZE && _obj_scroll_blocking_at(neighbor, gElevation) == 0) {
                tiles_to_visit.push(neighbor);
            }
        }
        {
            int neighbor = tileFromScreenXY(tileScreenX, tileScreenY - 24, gElevation, true);
            if (neighbor >= 0 && neighbor <= HEX_GRID_SIZE && _obj_scroll_blocking_at(neighbor, gElevation) == 0) {
                tiles_to_visit.push(neighbor);
            }
        }
        {
            int neighbor = tileFromScreenXY(tileScreenX, tileScreenY + 24, gElevation, true);
            if (neighbor >= 0 && neighbor <= HEX_GRID_SIZE && _obj_scroll_blocking_at(neighbor, gElevation) == 0) {
                tiles_to_visit.push(neighbor);
            }
        }
    }

    printf("Done center traversal visited_tiles_count=%i\n", visited_tiles_count);
}

/*
void draw_square(Rect* rect, int elevation, const char* from)
{

    // y and x
    int tile = gHexGridWidth * 40 + gHexGridWidth - 1 - 95;

    int tile_x = gHexGridWidth - 1 - tile % gHexGridWidth;
    int tile_y = tile / gHexGridWidth;

    int tile_screen_x;
    int tile_screen_y;
    tileToScreenXY(tile, &tile_screen_x, &tile_screen_y, elevation);

    printf("%s Tile=%d, x=%d, y=%d, screenX=%d, screenY=%d width=%d buf1=%x",
        from, tile, tile_x, tile_y, tile_screen_x, tile_screen_y,
        gTileWindowWidth,
        gTileWindowBuffer);
    if (tile_screen_x > 0 && tile_screen_y > 0) {
        bufferFill(gTileWindowBuffer + tile_screen_y * gTileWindowWidth + tile_screen_x,
            500,
            400,
            gTileWindowWidth,
            0xD0);
    } else {
        printf("%s no render\n", from);
    }
}
*/

void draw_tile_hires_cover(Rect* rect, unsigned char* buffer, int windowWidth, int windowHeight)
{
    // printf("draw_tile_hires_cover rect=%d,%d,%d,%d window=%d,%d\n",
    //     rect->left, rect->top, rect->right, rect->bottom, windowWidth, windowHeight);

    int minX = rect->left;
    int minY = rect->top;
    int maxX = rect->right;
    int maxY = rect->bottom;

    auto screen_diff = get_screen_diff();
    int minXglobal = minX - screen_diff.x;
    int minYglobal = minY - screen_diff.y;
    int maxXglobal = maxX - screen_diff.x;
    int maxYglobal = maxY - screen_diff.y;

    if (DO_DEBUG_CHECKS) {
        if (minXglobal < 0) {
            printf("minXglobal=%i\n", minXglobal);
            exit(100);
        };
        if (minYglobal < 0) {
            printf("minYglobal=%i\n", minYglobal);
            exit(100);
        };
        if (maxXglobal >= square_width * square_grid_width) {
            printf("maxXglobal=%i\n", maxXglobal);
            exit(100);
        };
        if (maxYglobal >= square_height * square_grid_height) {
            printf("maxYglobal=%i\n", maxYglobal);
            exit(100);
        };
    };

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

    /*
        int leftTop = tileFromScreenXY(minX, minY, gElevation, true);
        int rightTop = tileFromScreenXY(maxX, minY, gElevation, true);
        int leftBottom = tileFromScreenXY(minX, maxY, gElevation, true);
        int rightBottom = tileFromScreenXY(maxX, maxY, gElevation, true);

        // TODO: Use rect instead of going through all tiles
        for (int i = 0; i < HEX_GRID_SIZE; i++) {
            if (tiles[gElevation][i] != 0) {
                // TODO Check if centerTile have the same view_area
                continue;
            }
            int color = 0x40;

            int screenX;
            int screenY;
            tileToScreenXY(i, &screenX, &screenY, gElevation);
            constexpr int tileWidth = 32;
            constexpr int tileHeight = 18;

            if (screenX < 0 || screenY < 0 || screenX + tileWidth >= windowWidth || screenY + tileHeight >= windowHeight) {
                // TODO: Instead of skipping, draw only visible part
                continue;
            };

            int pixel = screenY * windowWidth + screenX;
            for (int y = 0; y < tileHeight; y++) {
                for (int x = 0; x < tileWidth; x++) {
                    buffer[pixel + x] = color;
                }
                pixel += windowWidth;
            }
        }
        */
}

} // namespace fallout