// World → map transforms for the replay viewer.
//
// The maps are the game's own map art -- the same *_game.png files the
// overlay draws (wor_overlay/assets/maps). Their geometry is fixed by the
// engine, so there is no per-map fitting: the terrain square is 4096 m wide
// and drawn at 0.5 px per metre (2048 px), Y flipped (image Y points down).
// A map whose art is turned inside a larger canvas (Antietam, 50° CCW -- its
// compass bias) is rotated about the square's centre into that canvas, which
// is ceil(2048·(|cos|+|sin|)) px square. This mirrors
// wor_overlay/mod/calibration.cpp world_m_to_map_px exactly; the overlay's
// live fence and zone positions land on the drawn field edges with it.

export const YARDS_PER_METER = 1.0936;

const MAP_PX = 2048;
const WORLD_M = 4096;
const PX_PER_M = MAP_PX / WORLD_M;

// Map id used internally. Keys match the rangefinder slugs.
export const MAPS = {
  'antietam':       { name: 'Antietam',       file: 'antietam_game.png',      tiltDeg: 50 },
  'harpers-ferry':  { name: "Harper's Ferry", file: 'harpersferry_game.png',  tiltDeg: 0 },
  'south-mountain': { name: 'South Mountain', file: 'southmountain_game.png', tiltDeg: 0 },
  'drill-camp':     { name: 'Drill Camp',     file: 'drillcamp_game.png',     tiltDeg: 0 },
};

// Map names as written into the replay CSV header (taken from the engine's
// level name) → internal slug. Loose match, lowercased, alphanumeric only.
const NAME_TO_SLUG = [
  ['antietam',      'antietam'],
  ['harpersferry',  'harpers-ferry'],
  ['harper',        'harpers-ferry'],
  ['southmountain', 'south-mountain'],
  ['drillcamp',     'drill-camp'],
];

export function resolveMapSlug(name) {
  if (!name) return null;
  const norm = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [needle, slug] of NAME_TO_SLUG) {
    if (norm.includes(needle)) return slug;
  }
  return null;
}

const TILTS = {};
for (const [slug, m] of Object.entries(MAPS)) {
  const r = (m.tiltDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  TILTS[slug] = { c, s, half: Math.ceil(MAP_PX * (Math.abs(c) + Math.abs(s))) / 2 };
}

// World meters → map pixels. Returns null when the slug isn't recognized.
export function worldMetersToMapPx(slug, xMeters, yMeters) {
  const t = TILTS[slug];
  if (!t) return null;
  // Scale + Y flip into terrain-square pixels about the square's centre, then
  // tilt CCW into the art. Image Y points down, so a visually CCW rotation is
  // the transpose of the textbook (Y-up) one.
  const u = xMeters * PX_PER_M - MAP_PX / 2;
  const v = (WORLD_M - yMeters) * PX_PER_M - MAP_PX / 2;
  return { x: u * t.c + v * t.s + t.half, y: -u * t.s + v * t.c + t.half };
}

// Map pixels per yard -- uniform (the transform is a rotation + scale).
// Returns null when the slug isn't recognized.
export function mapPxPerYard(slug) {
  return TILTS[slug] ? PX_PER_M / YARDS_PER_METER : null;
}

// Project a heading vector (meter-space) to map-pixel space: the linear part
// of worldMetersToMapPx. Output is NOT renormalized -- caller decides.
export function headingToMapDelta(slug, fwdX, fwdY) {
  const t = TILTS[slug];
  if (!t) return null;
  const du = fwdX * PX_PER_M;
  const dv = -fwdY * PX_PER_M;
  return { dx: du * t.c + dv * t.s, dy: -du * t.s + dv * t.c };
}
