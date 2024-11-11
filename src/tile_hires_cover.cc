#include "stdio.h"
#include "tile.h"
#include <stack>
#include <string.h>
namespace fallout {

// TODO: Instead of tiles use square screen tiles 16x18 in size

static unsigned char tiles[ELEVATION_COUNT][HEX_GRID_SIZE];
static unsigned char view_area_id = 1;

#define CENTER_VISITED_FLAG 0b10000000
// #define TILE_HALF_VISIBLE 0b01000000
#define CLEAR_FLAGS 0b00111111

void init_tile_hires()
{
    printf("===========================\n");
    printf("init_tile_hires\n");
    printf("===========================\n");
    memset(tiles, 0, sizeof(tiles));
    view_area_id = 1;

    {
        int min_x = 0;
        int min_y = 0;
        int max_x = 0;
        int max_y = 0;
        int x;
        int y;
        for (int i = 0; i < HEX_GRID_SIZE; i++) {
            tileToScreenXY(i, &x, &y, gElevation);
            if (x < min_x) {
                min_x = x;
            }
            if (y < min_y) {
                min_y = y;
            }
            if (x > max_x) {
                max_x = x;
            }
            if (y > max_y) {
                max_y = y;
            }
        };
        printf("min_x=%i min_y=%i max_x=%i max_y=%i\n", min_x, min_y, max_x, max_y);
        printf("screen width=%i height=%i\n", max_x - min_x, max_y - min_y);
        printf("screen with tile size width=%i height=%i\n", max_x - min_x + 32, max_y - min_y + 18);
        // screen width=7968 height=3576
        // screen with tile size width=8000 height=3594
    }
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

*/

static void mark_screen_tiles_around_as_visible(int center_tile)
{
    int c1 = 0;
    int c2 = 0;

    int centerTileScreenX;
    int centerTileScreenY;
    tileToScreenXY(center_tile, &centerTileScreenX, &centerTileScreenY, gElevation);

    constexpr int tileWidth = 32;
    constexpr int tileDoubleHeight = 24;

    constexpr int tilesOnScreenX = 18; // 20;
    constexpr int tilesOnScreenY = 30; // 32;

    for (int x = centerTileScreenX - tileWidth * tilesOnScreenX / 2;
         x <= centerTileScreenX + tileWidth * tilesOnScreenX / 2;
         x += tileWidth) {
        for (int y = centerTileScreenY - tileDoubleHeight * tilesOnScreenY / 4;
             y <= centerTileScreenY + tileDoubleHeight * tilesOnScreenY / 4; y += tileDoubleHeight) {
            int tile = tileFromScreenXY(x, y, gElevation, true);
            if (tile != -1 && tiles[gElevation][tile] == 0) {
                tiles[gElevation][tile] = view_area_id;
                c1++;
            }
        }
    }

    centerTileScreenX += tileWidth / 2;
    centerTileScreenY += tileDoubleHeight / 2;

    for (int x = centerTileScreenX - tileWidth * tilesOnScreenX / 2;
         x <= centerTileScreenX + tileWidth * tilesOnScreenX / 2;
         x += tileWidth) {
        for (int y = centerTileScreenY - tileDoubleHeight * tilesOnScreenY / 4;
             y <= centerTileScreenY + tileDoubleHeight * tilesOnScreenY / 4; y += tileDoubleHeight) {
            int tile = tileFromScreenXY(x, y, gElevation, true);
            if (tile != -1 && tiles[gElevation][tile] == 0) {
                tiles[gElevation][tile] = view_area_id;
                c2++;
            }
        }
    }

    printf("Done visibility id=%i c1=%i c2=%i\n", view_area_id, c1, c2);
}

void on_center_tile_change()
{
    if (tiles[gElevation][gCenterTile] != 0) {
        printf("========= NOOP on_center_tile_change elev=%i tile=%i ================\n",
            gElevation, gCenterTile);

        return;
    }
    printf("=========== on_center_tile_change elev=%i tile=%i ================\n",
        gElevation, gCenterTile);

    std::stack<int> tiles_to_visit;
    tiles_to_visit.push(gCenterTile);

    int c = 0;
    while (!tiles_to_visit.empty()) {
        auto tile = tiles_to_visit.top();
        tiles_to_visit.pop();

        if (tile < 0) {
            continue;
        }

        if (tiles[gElevation][tile] & CENTER_VISITED_FLAG) {
            continue;
        }

        c++;

        tiles[gElevation][tile] = view_area_id | CENTER_VISITED_FLAG;
        mark_screen_tiles_around_as_visible(tile);

        int tileScreenX;
        int tileScreenY;
        tileToScreenXY(tile, &tileScreenX, &tileScreenY, gElevation);

        /*
                tiles_to_visit.push(
                    tileFromScreenXY(tileScreenX - 32, tileScreenY, gElevation, true));
                tiles_to_visit.push(
                    tileFromScreenXY(tileScreenX + 32, tileScreenY, gElevation, true));
                tiles_to_visit.push(
                    tileFromScreenXY(tileScreenX, tileScreenY - 24, gElevation, true));
                tiles_to_visit.push(
                    tileFromScreenXY(tileScreenX, tileScreenY + 24, gElevation, true));
                    */
    }

    printf("Done center traversal id=%i c=%i\n", view_area_id, c);

    // view_area++;
    /*
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
 */
    // _obj_scroll_blocking_at
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

    Rect updatedRect = *rect;

    int minX = updatedRect.left;
    int minY = updatedRect.top;
    int maxX = updatedRect.right;
    int maxY = updatedRect.bottom;

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
}

} // namespace fallout