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

/*


          odd   even
   x     x     3     2
      5     4    203   202
   6    205   204    x
     206    x     x     x

(even have next on the same row, odd have next on the next row)




tile size is 32 x 18

screen have vertical 0.5 + 31 + 0.5 tiles
horizontal 20

*/

void on_center_tile_change()
{
    printf("=========== on_center_tile_change elev=%i tile=%i ================\n",
        gElevation, gCenterTile);

    tiles[gElevation][gCenterTile] = 1;
    if (gCenterTile > 0) {
        tiles[gElevation][gCenterTile - 1] = 2;
    };
    /*
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

    for (int i = 0; i < HEX_GRID_SIZE; i++) {
        if (tiles[gElevation][i] == 0) {
            continue;
        }
        int color = tiles[gElevation][i] == 1 ? 0x80 : 0x40;

        int screenX;
        int screenY;
        tileToScreenXY(i, &screenX, &screenY, gElevation);
        constexpr int tileWidth = 32;
        constexpr int tileHeight = 18;
        if (screenX < 0 || screenY < 0 || screenX + tileWidth >= windowWidth || screenY + tileHeight >= windowHeight) {
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