// Proximity grouping for the replay viewer.
//
// Counts how many players cluster near a given player at a given frame, within a
// radius expressed in YARDS. Replay positions are in world meters, so distances
// are converted meters → yards at the boundary (the map is drawn in yards, and
// the community talks in yards). The center player is included in the count, so
// a lone man reads as "1".

import { YARDS_PER_METER } from './mapCalibration.js';

// Count players within `radiusYards` of player `centerIdx` at frame `frame`.
//   opts.sameTeamOnly (default true) — count only the center's own team, the
//     natural reading of "how many men are in this formation/group".
//   opts.aliveOnly (default true) — a not-sampled-this-frame player (NaN x) is
//     treated as absent and never counted.
// Returns 0 when the center itself isn't present this frame.
export function countNearby(replay, frame, centerIdx, radiusYards, opts = {}) {
  const { sameTeamOnly = true, aliveOnly = true } = opts;
  const P = replay.playerCount;
  if (centerIdx < 0 || centerIdx >= P) return 0;
  const base = frame * P;
  const xs = replay.tracks.x;
  const ys = replay.tracks.y;

  const cx = xs[base + centerIdx];
  if (Number.isNaN(cx)) return 0;
  const cy = ys[base + centerIdx];
  const centerTeam = replay.players[centerIdx].team;

  // Compare squared meter-distance against a squared meter-threshold to avoid a
  // sqrt per player.
  const radiusMeters = radiusYards / YARDS_PER_METER;
  const r2 = radiusMeters * radiusMeters;

  let count = 0;
  for (let pi = 0; pi < P; pi++) {
    const x = xs[base + pi];
    if (aliveOnly && Number.isNaN(x)) continue;
    if (sameTeamOnly && replay.players[pi].team !== centerTeam) continue;
    const dx = x - cx;
    const dy = ys[base + pi] - cy;
    if (dx * dx + dy * dy <= r2) count++;
  }
  return count;
}
