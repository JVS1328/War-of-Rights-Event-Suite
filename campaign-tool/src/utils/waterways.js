/**
 * Waterways: which navigable water a region lies on.
 *
 * A landing, and the Anaconda Plan's reach over water, come up water the side
 * already holds. The board knows two such waterways -
 *
 *   s  the sea and tidewater: the coast, the bays and sounds, and the rivers a
 *      ship came straight up from the sea (the James, the Potomac, the
 *      Carolina rivers, Mobile's rivers)
 *   w  the Western rivers: the Mississippi and everything navigable that feeds
 *      it - the Ohio, Tennessee, Cumberland, Missouri, Kanawha and the rest
 *
 * - and a region is on one when enough of it borders that water: a real
 * stretch of coast, or a real stretch of a navigable river, not a corner
 * grazed. A region at the mouth of the Mississippi is on both, and joins them.
 *
 * Worked out from each county's coast and rivers (data/rivers/waterways.json,
 * built by scripts/buildRivers.py), so any county-based map knows its water
 * with nothing set up. A region with no counties - the state-view map - has no
 * known water, and the reach rules fall back to the water-access flag alone.
 */

import COUNTY_WATER from '../data/rivers/waterways.json';

/** How each waterway is named on the sheet. */
export const WATERWAY_NAMES = {
  s: 'the sea and tidewater',
  w: 'the Western rivers',
};

/** Degrees of coast or river (about 15 km) that put a region on the water. */
const ON_WATER = 0.135;

/**
 * The waterways one region lies on, as an array of keys ('s', 'w'), or null
 * when the region has no counties and so no known geography.
 */
export const regionWaterways = (territory) => {
  const counties = territory?.countyFips;
  if (!counties?.length) return null;
  const total = {};
  for (const fips of counties) {
    const water = COUNTY_WATER[fips];
    if (!water) continue;
    for (const [key, length] of Object.entries(water)) total[key] = (total[key] || 0) + length;
  }
  return Object.keys(WATERWAY_NAMES).filter(key => (total[key] || 0) >= ON_WATER);
};

/**
 * Every region's waterways, as Map<territoryId, string[]>; null when the map
 * has no county geography at all.
 */
export const getWaterways = (campaign) => {
  const territories = campaign?.territories || [];
  if (!territories.some(t => t.countyFips?.length)) return null;
  const out = new Map();
  for (const t of territories) {
    const ways = regionWaterways(t);
    if (ways) out.set(t.id, ways);
  }
  return out;
};

/** "the sea and tidewater", "the sea and tidewater or the Western rivers". */
export const waterwayList = (keys, joiner = 'or') =>
  (keys || []).map(k => WATERWAY_NAMES[k]).filter(Boolean).join(` ${joiner} `);
