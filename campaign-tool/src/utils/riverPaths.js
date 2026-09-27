/**
 * Rivers on the plate.
 *
 * The theatre maps carry their rivers as [lon, lat] reaches (see
 * data/theatreRivers.js). Here they are put through the same projection as
 * the counties and gathered into one path per layer, so a river's bank and
 * its water are each a single stroke - drawn one river at a time, the ink of
 * one would cut across the water of the next wherever two meet.
 *
 * A reach is drawn bold where it is `navigable` - where a flotilla could come
 * up it - and thin where it is only a river. A `backdrop` reach runs outside
 * the theatre and is drawn in the faded country around the board.
 */

import { projectLatLonToSvg } from './geoProjection';

/** Type sizes for the river names, in plate units. */
export const RIVER_LABEL_SIZE = { navigable: 8.5, river: 6.5 };
const LETTER_SPACING = 0.6;

/** The rivers for a campaign template, loaded on demand; null for none. */
export const loadTheatreRivers = async (templateKey) => {
  if (!templateKey) return null;
  const { THEATRE_RIVERS } = await import('../data/theatreRivers.js');
  return THEATRE_RIVERS[templateKey] || null;
};

const toPath = (pts) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');

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
 * reach long enough to hold the name, eased into a single bow so the letters
 * do not bunch at every bend, and turned to read left to right. Null when the
 * reach is too short to carry it.
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

  // Try the middle of the reach and either side of it; at each, widen the
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
  const f = (n) => n.toFixed(1);
  return `M${f(S.x)},${f(S.y)} Q${f(mid.x + bx)},${f(mid.y + by)} ${f(E.x)},${f(E.y)}`;
};

/**
 * Everything the plate needs to draw a theatre's rivers under one projection.
 *
 * @returns {{
 *   theatre: { navigable: string, river: string },
 *   backdrop: { navigable: string, river: string },
 *   labels: Array<{ key: string, text: string, d: string, navigable: boolean }>,
 * }}
 */
export const projectRivers = (rivers, bounds) => {
  const layers = {
    theatre: { navigable: [], river: [] },
    backdrop: { navigable: [], river: [] },
  };
  const labels = [];

  for (const river of rivers || []) {
    const candidates = [];
    for (const reach of river.reaches) {
      const pts = reach.points.map(([lon, lat]) => projectLatLonToSvg(lat, lon, bounds));
      const kind = reach.navigable ? 'navigable' : 'river';
      layers[reach.backdrop ? 'backdrop' : 'theatre'][kind].push(toPath(pts));

      if (river.label && !reach.backdrop) {
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        candidates.push({ pts, len, navigable: !!reach.navigable });
      }
    }
    // The name goes on a stretch inside the theatre: a navigable one first,
    // since that is the part the reader is after, the longest first within
    // that - and failing those, wherever it fits. The tidal Potomac is mostly
    // open water on the plate, so its name goes up the river instead.
    candidates.sort((a, b) => (b.navigable - a.navigable) || (b.len - a.len));
    for (const c of candidates) {
      const size = RIVER_LABEL_SIZE[c.navigable ? 'navigable' : 'river'];
      const d = labelCurve(c.pts, river.label, size);
      if (d) {
        labels.push({ key: river.name, text: river.label, d, navigable: c.navigable });
        break;
      }
    }
  }

  const join = (group) => ({ navigable: group.navigable.join(''), river: group.river.join('') });
  return { theatre: join(layers.theatre), backdrop: join(layers.backdrop), labels };
};
