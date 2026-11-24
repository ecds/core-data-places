import { SPRITE_ID, SPRITE_PATH } from '@utils/tileStyles';

/**
 * Loads the renderer's icon sprite next to the base map's, once per style (a
 * base map change replaces the style and its sprites). Icons are then
 * `og:<name>`.
 */
export const ensureSprite = (map: any) => {
  const sprites = map.getSprite?.() || [];

  if (!sprites.some((sprite: any) => sprite.id === SPRITE_ID)) {
    map.addSprite(SPRITE_ID, new URL(SPRITE_PATH, window.location.origin).toString());
  }
};
