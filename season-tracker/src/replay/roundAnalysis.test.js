import { describe, it, expect } from 'vitest';
import {
  areaKey, sideFrames, sideStates, winFeatures, WIN_FEATURES, winProbability, swings,
  distanceTravelled, flagBearers, companySheet, heatGrid, GRID_S,
} from './roundAnalysis.js';
import { YARDS_PER_METER } from './mapCalibration.js';

const FLAG = 2;      // replayParser's leader_kind code for a flag bearer

// A replay at 2 Hz: `at(p, f)` → [x, y, lk] or null (not on the field).
function makeReplay(players, frames, at) {
  const P = players.length, N = P * frames;
  const x = new Float32Array(N).fill(NaN), y = new Float32Array(N), lk = new Uint8Array(N);
  for (let f = 0; f < frames; f++) for (let p = 0; p < P; p++) {
    const s = at(p, f);
    if (!s) continue;
    [x[f * P + p], y[f * P + p], lk[f * P + p]] = [s[0], s[1], s[2] ?? 0];
  }
  return {
    meta: { map: 'Antietam', mode: 'Skirmish', area: 'East Woods', sampleRateHz: 2 },
    players: players.map((p) => ({ regimentCrc: 'r', company: 0, ...p })),
    frameTimes: Float32Array.from({ length: frames }, (_, f) => f / 2),
    tracks: { x, y, lk }, frameCount: frames, playerCount: P,
  };
}

// USA spawns at (0, 0) and CSA at (1000, 0); everyone stands still.
const still = () => makeReplay(
  [{ name: 'u1', team: 1 }, { name: 'u2', team: 1 }, { name: 'c1', team: 2 }],
  41, (p) => (p < 2 ? [0, p * 10] : [1000, 0]),
);

describe('areaKey', () => {
  it('folds the map to its slug and lowercases mode and area', () => {
    expect(areaKey('Antietam', 'Skirmish', 'East Woods')).toBe('antietam|skirmish|east woods');
  });
});

describe('sideFrames', () => {
  it('measures progress from own spawn (0) to the enemy spawn (1)', () => {
    const fr = sideFrames(still());
    expect(fr[1].spawnDistM).toBeCloseTo(1000, 0);
    expect(fr[1].u(500, 5)).toBeCloseTo(0.5, 2);
    expect(fr[2].u(500, 5)).toBeCloseTo(0.5, 2);
    expect(fr[2].u(1000, 0)).toBeCloseTo(0, 2);
  });
});

describe('sideStates', () => {
  it('counts the living, and losses at each stance\'s ticket cost', () => {
    const kills = [
      { ts: 3, victimTeam: 1, victimFormation: 'oob' },
      { ts: 7, victimTeam: 2, victimFormation: 'skirm' },
      { ts: 8, victimTeam: 2, victimFormation: 'in_form' },
    ];
    const st = sideStates(still(), kills);
    expect(st.t[1]).toBe(GRID_S);
    expect(st.side[1].alive[0]).toBe(2);
    expect(st.side[2].alive[0]).toBe(1);
    expect(st.side[1].lost[1]).toBe(5);          // by t = 5
    expect(st.side[2].lost[1]).toBe(0);
    expect(st.side[2].lost[2]).toBe(4);          // by t = 10: 3 + 1
    expect(st.seen[0]).toBe(3);
  });
});

describe('winProbability', () => {
  it('is a logistic on the features, from USA\'s side', () => {
    const st = sideStates(still(), [{ ts: 1, victimTeam: 2, victimFormation: 'oob' }]);
    expect(winProbability(st, null, 'k')).toBeNull();
    const flat = { win: { intercept: 0, coef: WIN_FEATURES.map(() => 0) } };
    expect(winProbability(st, flat, 'k')[3]).toBeCloseTo(0.5, 9);
    // weight only on lossDiff: CSA lost more, so USA is favoured
    const coef = WIN_FEATURES.map((f) => (f === 'lossDiff' ? 10 : 0));
    const p = winProbability(st, { win: { intercept: 0, coef } }, 'k');
    expect(p[3]).toBeGreaterThan(0.5);
    const lossDiff = winFeatures(st, 3)[WIN_FEATURES.indexOf('lossDiff')];
    expect(p[3]).toBeCloseTo(1 / (1 + Math.exp(-10 * lossDiff)), 9);
  });
  it('reads the area\'s attacker and time limit from the calibration', () => {
    const st = sideStates(still());
    const f = winFeatures(st, 4, { limits: { k: 40 }, roles: { k: -1 } }, 'k');
    expect(f[WIN_FEATURES.indexOf('r')]).toBe(-1);
    expect(f[WIN_FEATURES.indexOf('late')]).toBeCloseTo(20 / 40, 9);
  });
});

describe('swings', () => {
  it('finds a jump in win chance and what happened in it', () => {
    const st = sideStates(still());
    const p = Float64Array.from(st.t, (t) => (t < 10 ? 0.5 : 0.8));
    const out = swings(st, p, [{ ts: 7, victimTeam: 2 }], { windowS: 5, count: 3 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ t0: 5, t1: 10, p0: 0.5, p1: 0.8 });
    expect(out[0].deaths).toEqual({ 1: 0, 2: 1 });
  });
});

describe('distanceTravelled', () => {
  it('sums moves in yards and skips a respawn teleport', () => {
    // 1 m per frame for frames 0-9, then a 500 m jump, then 1 m per frame again
    const r = makeReplay([{ name: 'walker', team: 1 }], 20, (p, f) => [f < 10 ? f : 500 + f, 0]);
    const [w] = distanceTravelled(r);
    expect(w.yards).toBeCloseTo(18 * YARDS_PER_METER, 3);
    expect(w.mountedYards).toBe(0);
  });
});

describe('flagBearers', () => {
  it('times each carry and counts every pickup', () => {
    // carries frames 0-3, drops it at 4-5, carries again 6-7
    const r = makeReplay([{ name: 'bearer', team: 2 }, { name: 'none', team: 2 }], 8,
      (p, f) => [f, 0, p === 0 && (f < 4 || f > 5) ? FLAG : 0]);
    const fb = flagBearers(r);
    expect(fb).toHaveLength(1);
    expect(fb[0]).toMatchObject({ name: 'bearer', team: 2, holds: 2 });
    expect(fb[0].timeS).toBeCloseTo(3, 5);          // 6 samples × 0.5 s
    expect(fb[0].longestS).toBeCloseTo(2, 5);
    expect(fb[0].carriedYards).toBeCloseTo(4 * YARDS_PER_METER, 3);   // 3 + 1 one-metre steps under the flag
  });
});

describe('companySheet', () => {
  it('measures contact with the enemy and credits kills and deaths', () => {
    // USA company 50 m from the enemy the whole round
    const r = makeReplay([{ name: 'u1', team: 1 }, { name: 'c1', team: 2 }], 21, (p) => (p === 0 ? [0, 0] : [50, 0]));
    const st = sideStates(r);
    const sheet = companySheet(r, st, [{ victim: 'c1', victimTeam: 2, killer: 'u1', killerTeam: 1 }], (i) => `co ${i}`);
    const usa = sheet.find((c) => c.team === 1);
    expect(usa).toMatchObject({ label: 'co 0', men: 1, kills: 1, deaths: 0, contactPct: 1 });
    expect(usa.medianEnemyYd).toBeCloseTo(50 * YARDS_PER_METER, 3);
    expect(sheet.find((c) => c.team === 2).deaths).toBe(1);
  });
});

describe('heatGrid', () => {
  it('bins presence by side and deaths by where they fell', () => {
    const r = still();
    const h = heatGrid(r, 'presence', [], 20);
    const usaCell = h.cells.find((c) => c.x === 0 && c.y === 0);
    expect(usaCell[1]).toBe(82);                   // u1 and u2 (10 m apart, one 20 m cell), every frame
    expect(usaCell[2]).toBe(0);
    expect(h.max).toBe(82);
    const d = heatGrid(r, 'deaths', [{ x: 25, y: 0, team: 2 }], 20);
    expect(d.cells).toEqual([{ x: 20, y: 0, 1: 0, 2: 1 }]);
  });
});
