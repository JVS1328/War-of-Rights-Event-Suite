/**
 * Hill shading on the plate.
 *
 * The relief of the country east of the Rockies, shaded as an engraver would
 * - shadow only, in sepia, nothing on flat ground - and cut into 2-degree
 * tiles (public/relief/, built by scripts/buildRelief.py). A county map draws
 * the tiles its bounds cover; the plate's projection is a straight stretch of
 * longitude and latitude, so each tile is a plain rectangle on it.
 */

import RELIEF from '../data/reliefTiles.json';
import { projectLatLonToSvg } from './geoProjection';

/** Degrees of country drawn around a map's own bounds. */
const MARGIN = 0.5;

/**
 * The tiles to draw for a map, placed in plate units.
 * @returns {Array<{ key: string, href: string, x: number, y: number, width: number, height: number }>}
 */
export const reliefTilesFor = (bounds) => {
  if (!bounds) return [];
  const size = RELIEF.size;
  const base = import.meta.env.BASE_URL || '/';
  return RELIEF.tiles
    .filter(([lon, lat]) =>
      lon + size >= bounds.minLon - MARGIN && lon <= bounds.maxLon + MARGIN
      && lat + size >= bounds.minLat - MARGIN && lat <= bounds.maxLat + MARGIN)
    .map(([lon, lat]) => {
      const nw = projectLatLonToSvg(lat + size, lon, bounds);
      const se = projectLatLonToSvg(lat, lon + size, bounds);
      return {
        key: `${lon}_${lat}`,
        href: `${base}relief/${lon}_${lat}.webp`,
        x: nw.x,
        y: nw.y,
        width: se.x - nw.x,
        height: se.y - nw.y,
      };
    });
};
