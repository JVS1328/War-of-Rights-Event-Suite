import { describe, it, expect } from 'vitest';
import { parseReplayCsv } from './replayParser.js';
import { REPLAY_CSV } from './synthetic.js';
import { encodeQuantReplay, decodeQuantReplay } from './quantReplay';

const replay = parseReplayCsv(REPLAY_CSV);

// A realistically-sized replay (players doing smooth random walks with a few
// presence gaps) so the delta encoding's compression win is visible — the tiny
// hand fixture is dominated by fixed header/JSON overhead.
function syntheticReplay(P, F, seed = 5) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const N = F * P;
  const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N);
  const fx = new Float32Array(N), fy = new Float32Array(N); const lk = new Uint8Array(N);
  x.fill(NaN);
  const px = [], py = [], va = [];
  for (let p = 0; p < P; p++) { px[p] = 1000 + rnd() * 2000; py[p] = 1000 + rnd() * 2000; va[p] = rnd() * 6.28; }
  for (let f = 0; f < F; f++) for (let p = 0; p < P; p++) {
    const i = f * P + p;
    if ((f + p) % 97 < 2) continue; // sparse presence gaps
    va[p] += (rnd() - 0.5) * 0.3; const sp = 1 + rnd() * 1.2;
    px[p] += Math.cos(va[p]) * sp; py[p] += Math.sin(va[p]) * sp;
    x[i] = px[p]; y[i] = py[p]; z[i] = 10;
    fx[i] = Math.cos(va[p]); fy[i] = Math.sin(va[p]); lk[i] = 0;
  }
  return {
    meta: { map: 'Antietam', area: 'The Cornfield', roundStartSec: 50400, sampleRateHz: 2, sampleCount: F },
    players: Array.from({ length: P }, (_, p) => ({ name: `[Reg${p % 12}]Player_${p}`, team: 1 + (p % 2) })),
    frameTimes: Float32Array.from({ length: F }, (_, f) => f * 0.5),
    tracks: { x, y, z, fx, fy, lk }, frameCount: F, playerCount: P,
  };
}

describe('quantized share replay', () => {
  it('round-trips positions within tolerance and preserves the sampled mask + leader kind', () => {
    const r = decodeQuantReplay(encodeQuantReplay(replay));
    expect(r.frameCount).toBe(replay.frameCount);
    expect(r.playerCount).toBe(replay.playerCount);
    expect(r.players).toEqual(replay.players);
    expect(r.meta.map).toBe(replay.meta.map);
    expect(Array.from(r.frameTimes)).toEqual(Array.from(replay.frameTimes));

    const N = replay.frameCount * replay.playerCount;
    for (let i = 0; i < N; i++) {
      if (Number.isNaN(replay.tracks.x[i])) {
        expect(Number.isNaN(r.tracks.x[i])).toBe(true); // unsampled preserved
      } else {
        expect(Math.abs(r.tracks.x[i] - replay.tracks.x[i])).toBeLessThan(0.5);
        expect(Math.abs(r.tracks.y[i] - replay.tracks.y[i])).toBeLessThan(0.5);
        expect(r.tracks.lk[i]).toBe(replay.tracks.lk[i]); // leader kind exact
      }
    }
  });

  it('preserves heading direction (magnitude is renormalized away)', () => {
    const r = decodeQuantReplay(encodeQuantReplay(replay));
    const P = replay.playerCount;
    const i = 0 * P + 2; // frame 0, Carol — faces -x (fwd_x -1)
    const oLen = Math.hypot(replay.tracks.fx[i], replay.tracks.fy[i]);
    const rLen = Math.hypot(r.tracks.fx[i], r.tracks.fy[i]);
    expect(oLen).toBeGreaterThan(1e-6);
    expect(rLen).toBeGreaterThan(1e-6);
    const dot = (replay.tracks.fx[i] * r.tracks.fx[i] + replay.tracks.fy[i] * r.tracks.fy[i]) / (oLen * rLen);
    expect(dot).toBeGreaterThan(0.99); // near-parallel
  });

  it('downsamples frames by a stride, keeping every stride-th frame', () => {
    const r = decodeQuantReplay(encodeQuantReplay(replay, 2));
    expect(r.frameCount).toBe(Math.ceil(replay.frameCount / 2)); // 6 → 3
    expect(r.playerCount).toBe(replay.playerCount);
    // frame times are frames 0, 2, 4 of the source
    expect(Array.from(r.frameTimes)).toEqual([0, 1, 2].map((j) => replay.frameTimes[j * 2]));
  });

  it('drops z (rebuilt as zeros)', () => {
    const r = decodeQuantReplay(encodeQuantReplay(replay));
    expect(r.tracks.z.length).toBe(replay.frameCount * replay.playerCount);
    expect(r.tracks.z.every((v) => v === 0)).toBe(true);
  });

  it('round-trips a realistic multi-hundred-frame replay with gaps', () => {
    const big = syntheticReplay(32, 600, 9);
    const r = decodeQuantReplay(encodeQuantReplay(big));
    expect(r.frameCount).toBe(600);
    expect(r.playerCount).toBe(32);
    const N = 600 * 32;
    let sampled = 0;
    for (let i = 0; i < N; i++) {
      if (Number.isNaN(big.tracks.x[i])) { expect(Number.isNaN(r.tracks.x[i])).toBe(true); continue; }
      sampled++;
      expect(Math.abs(r.tracks.x[i] - big.tracks.x[i])).toBeLessThan(0.5);
      expect(Math.abs(r.tracks.y[i] - big.tracks.y[i])).toBeLessThan(0.5);
    }
    expect(sampled).toBeGreaterThan(15000);
  });
});
