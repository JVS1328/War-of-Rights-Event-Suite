/**
 * Rivers on the plate.
 *
 * Every county-based map draws the rivers of the country it shows. The data
 * (data/rivers/, built by scripts/buildRivers.py) is one file per state, each
 * river cut into stretches tagged with the counties they run through, so a
 * map loads only the states it covers and can tell for itself which stretches
 * run through its own theatre - nothing is set up per campaign.
 *
 * Here the stretches are put through the same projection as the counties and
 * gathered into one path per layer, so a river's bank and its water are each
 * a single stroke - drawn one river at a time, the ink of one would cut
 * across the water of the next wherever two meet.
 *
 * A stretch is drawn bold where it is navigable - where a flotilla could come
 * up it - and fine where it is only a river. Outside the theatre it is drawn
 * in the faded country around the board.
 */

import RIVER_INDEX from '../data/rivers/index.json';
import { projectLatLonToSvg } from './geoProjection';

const STATE_FILES = import.meta.glob('../data/rivers/[0-9]*.json', { import: 'default' });

/** Type sizes for the river names, in plate units. */
export const RIVER_LABEL_SIZE = { navigable: 8.5, river: 6.5 };
const LETTER_SPACING = 0.6;

/** Degrees of country loaded around a map's own bounds. */
const MARGIN = 0.5;

const overlaps = (a, b) => a.minLon <= b[2] && a.maxLon >= b[0] && a.minLat <= b[3] && a.maxLat >= b[1];

const grow = (bounds, m) => ({
  minLon: bounds.minLon - m, maxLon: bounds.maxLon + m,
  minLat: bounds.minLat - m, maxLat: bounds.maxLat + m,
});

/**
 * The rivers of every state whose rivers reach the map, loaded on demand.
 * @returns {Promise<Array<{ n: string, l?: 1, s: Array<[number[], 0|1, number[][]]> }>>}
 */
export const loadRivers = async (bounds) => {
  if (!bounds) return [];
  const area = grow(bounds, MARGIN);
  const states = Object.keys(RIVER_INDEX).filter(s => overlaps(area, RIVER_INDEX[s]));
  const files = await Promise.all(states.map(s => STATE_FILES[`../data/rivers/${s}.json`]?.()));
  return files.filter(Boolean).flat();
};

const toPath = (pts) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');

const lengthOf = (pts) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
};

/** The point `d` along a polyline, given its running lengths. */
const pointAt = (pts, cum, d) => {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const span = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / span));
  return {
    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
  };
};

/**
 * A gentle curve to set a river's name along: the straightest stretch of the
 * river long enough to hold the name, eased into a single bow so the letters
 * do not bunch at every bend, and turned to read left to right. Null when the
 * river is too short, or too winding, to carry it.
 */
const labelCurve = (pts, text, size) => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1];
  // Room for the name with a margin either side, so it is never clipped.
  const need = text.length * (size * 0.55 + LETTER_SPACING) * 1.2;
  if (total < need) return null;

  // Try the middle of the river and either side of it; at each, widen the
  // stretch until its ends stand far enough apart to hold the name, and keep
  // the straightest such stretch found. A meandering river needs a longer
  // stretch than a straight one to set the same name across.
  let best = null;
  for (let f = 0.25; f <= 0.751; f += 0.05) {
    const c = total * f;
    for (let h = need / 2; c - h >= 0 && c + h <= total; h *= 1.15) {
      const S = pointAt(pts, cum, c - h);
      const E = pointAt(pts, cum, c + h);
      const chord = Math.hypot(E.x - S.x, E.y - S.y);
      if (chord >= need) {
        const winding = (2 * h) / chord;
        if (!best || winding < best.winding) best = { S, E, M: pointAt(pts, cum, c), winding };
        break;
      }
    }
  }
  if (!best) return null;

  let { S, E } = best;
  if (S.x > E.x) [S, E] = [E, S];
  const mid = { x: (S.x + E.x) / 2, y: (S.y + E.y) / 2 };
  // Bow toward the river's own midpoint, but never more than a slight curve.
  let bx = 2 * (best.M.x - mid.x);
  let by = 2 * (best.M.y - mid.y);
  const chord = Math.hypot(E.x - S.x, E.y - S.y);
  const bow = Math.hypot(bx, by);
  const maxBow = chord * 0.3;
  if (bow > maxBow) { bx *= maxBow / bow; by *= maxBow / bow; }
  const C = { x: mid.x + bx, y: mid.y + by };
  const f = (n) => n.toFixed(1);
  return {
    d: `M${f(S.x)},${f(S.y)} Q${f(C.x)},${f(C.y)} ${f(E.x)},${f(E.y)}`,
    // What the name covers, for keeping names clear of one another.
    box: {
      x0: Math.min(S.x, E.x, C.x) - size, x1: Math.max(S.x, E.x, C.x) + size,
      y0: Math.min(S.y, E.y, C.y) - size * 1.5, y1: Math.max(S.y, E.y, C.y) + size * 0.5,
    },
  };
};

/**
 * Join a river's stretches back into runs: each stretch starts where the one
 * before it ended, so following end to start rebuilds the river.
 */
const chains = (pieces) => {
  const key = (p) => `${p[0]},${p[1]}`;
  const byStart = new Map();
  const isNext = new Set();
  for (const pc of pieces) byStart.set(key(pc.raw[0]), pc);
  for (const pc of pieces) {
    const next = byStart.get(key(pc.raw[pc.raw.length - 1]));
    if (next && next !== pc) isNext.add(next);
  }
  const runs = [];
  const used = new Set();
  const walk = (first) => {
    const pts = [];
    for (let pc = first; pc && !used.has(pc); pc = byStart.get(key(pc.raw[pc.raw.length - 1]))) {
      used.add(pc);
      pts.push(...(pts.length ? pc.pts.slice(1) : pc.pts));
    }
    if (pts.length > 1) runs.push(pts);
  };
  for (const pc of pieces) if (!isNext.has(pc)) walk(pc);
  for (const pc of pieces) if (!used.has(pc)) walk(pc);   // any loop left over
  return runs;
};

/**
 * Everything the plate needs to draw the rivers under one projection.
 *
 * @param rivers  what loadRivers returned
 * @param bounds  the map's lat/lon bounds (the counties' projection)
 * @param theatre Set of the campaign's county FIPS codes, as numbers
 * @returns {{
 *   theatre: { navigable: string, river: string },
 *   backdrop: { navigable: string, river: string },
 *   labels: Array<{ key: string, text: string, d: string, navigable: boolean }>,
 * }}
 */
export const projectRivers = (rivers, bounds, theatre) => {
  const layers = {
    theatre: { navigable: [], river: [] },
    backdrop: { navigable: [], river: [] },
  };
  const view = grow(bounds, MARGIN / 2);
  const named = new Map();   // name -> { navigable: [], river: [] } in-theatre pieces

  for (const river of rivers || []) {
    for (const [counties, nav, raw] of river.s) {
      // Stretches wholly off the plate are left out.
      let seen = false;
      for (const [lon, lat] of raw) {
        if (lon >= view.minLon && lon <= view.maxLon && lat >= view.minLat && lat <= view.maxLat) { seen = true; break; }
      }
      if (!seen) continue;

      const pts = raw.map(([lon, lat]) => projectLatLonToSvg(lat, lon, bounds));
      const inside = counties.some(c => theatre.has(c));
      const kind = nav ? 'navigable' : 'river';
      layers[inside ? 'theatre' : 'backdrop'][kind].push(toPath(pts));

      if (inside && river.l) {
        if (!named.has(river.n)) named.set(river.n, { navigable: [], river: [] });
        named.get(river.n)[kind].push({ raw, pts });
      }
    }
  }

  // Names: navigable rivers first, then the longest; a name that would sit
  // on top of one already set is left off rather than printed over it.
  const wanted = [];
  for (const [name, byKind] of named) {
    const runs = [
      ...chains(byKind.navigable).map(pts => ({ pts, navigable: true })),
      ...chains(byKind.river).map(pts => ({ pts, navigable: false })),
    ].map(r => ({ ...r, len: lengthOf(r.pts) }));
    runs.sort((a, b) => (b.navigable - a.navigable) || (b.len - a.len));
    if (runs.length) wanted.push({ name, runs, navigable: runs[0].navigable, len: runs[0].len });
  }
  wanted.sort((a, b) => (b.navigable - a.navigable) || (b.len - a.len));

  const labels = [];
  const taken = [];
  const clear = (b) => taken.every(t => b.x1 < t.x0 || b.x0 > t.x1 || b.y1 < t.y0 || b.y0 > t.y1);
  for (const { name, runs } of wanted) {
    const text = `${name} R.`;
    for (const run of runs) {
      const size = RIVER_LABEL_SIZE[run.navigable ? 'navigable' : 'river'];
      const curve = labelCurve(run.pts, text, size);
      if (curve && clear(curve.box)) {
        taken.push(curve.box);
        labels.push({ key: name, text, d: curve.d, navigable: run.navigable });
        break;
      }
    }
  }

  const join = (group) => ({ navigable: group.navigable.join(''), river: group.river.join('') });
  return { theatre: join(layers.theatre), backdrop: join(layers.backdrop), labels };
};
