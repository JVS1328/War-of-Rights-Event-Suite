// A replay's frames laid out over the whole round.
//
// The recorder only writes rows for players on the field, and a frame is just
// the rows sharing a t_s -- so while nobody is alive there are no frames at
// all. On a full server that never happens; on a quiet one it is most of the
// round: before anyone spawns, whenever everyone is down, and after the last
// death. Left as is, the viewer's timeline skips those stretches, a player
// who died stays drawn where they fell until the next frame, and a death with
// no frame after it (the round's last) is never seen.
//
// fillTimeline puts empty frames (nobody sampled) at the sample rate into
// every such stretch: from t_s 0 to the first frame, across any gap, and on
// to `endT` (the round's end, in replay t_s) when that is known.

// Two frames further apart than this many sample steps have a gap between them.
const GAP_STEPS = 3;

// The replay with the empty stretches filled, or the replay itself when there
// are none. Player indices are unchanged; firstFrame / lastFrame are redone
// for the new frame numbering.
export function fillTimeline(replay, endT = null) {
  const { frameCount: F, playerCount: P } = replay;
  const src = replay.frameTimes;
  if (F === 0) return replay;
  const step = 1 / (replay.meta.sampleRateHz || 2);
  const maxGap = step * GAP_STEPS;

  const times = [];
  const from = [];   // source frame per output frame, -1 for an empty one
  // Empty frames every step after `a`, stopping short of `b`.
  const fill = (a, b) => {
    const n = Math.ceil((b - a) / step - 0.5) - 1;
    for (let k = 1; k <= n; k++) { times.push(a + k * step); from.push(-1); }
  };

  if (src[0] > maxGap) { times.push(0); from.push(-1); fill(0, src[0]); }
  for (let f = 0; f < F; f++) {
    if (f > 0 && src[f] - src[f - 1] > maxGap) fill(src[f - 1], src[f]);
    times.push(src[f]); from.push(f);
  }
  const last = src[F - 1];
  if (Number.isFinite(endT) && endT >= last + step) fill(last, endT + step);

  if (times.length === F) return replay;

  const G = times.length;
  const s = replay.tracks;
  const tracks = {
    x: new Float32Array(G * P).fill(NaN), y: new Float32Array(G * P), z: new Float32Array(G * P),
    fx: new Float32Array(G * P), fy: new Float32Array(G * P), lk: new Uint8Array(G * P),
  };
  for (let g = 0; g < G; g++) {
    const f = from[g];
    if (f < 0) continue;
    for (const k of ['x', 'y', 'z', 'fx', 'fy', 'lk']) {
      tracks[k].set(s[k].subarray(f * P, (f + 1) * P), g * P);
    }
  }
  const newIndex = new Int32Array(F);
  from.forEach((f, g) => { if (f >= 0) newIndex[f] = g; });
  const at = (f) => (f >= 0 ? newIndex[f] : f);
  return {
    ...replay,
    players: replay.players.map((p) => ({ ...p, firstFrame: at(p.firstFrame), lastFrame: at(p.lastFrame) })),
    frameTimes: Float32Array.from(times),
    tracks,
    frameCount: G,
  };
}
