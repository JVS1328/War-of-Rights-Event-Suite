import { describe, it, expect } from 'vitest';
import {
  areaKey, sideFrames, sideStates, winFeatures, WIN_FEATURES, winProbability, swings,
  distanceTravelled, flagBearers, companySheet, areaStats, areaSummary, heatDensity, isoSegments, frontLine, GRID_S, sampleFromRecording, statesFromSample,
  withRoundFacts,
} from './roundAnalysis.js';
import { alignKills } from './killAlign.js';
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
    const flat = { win: { features: WIN_FEATURES, intercept: 0, coef: WIN_FEATURES.map(() => 0) } };
    expect(winProbability(st, flat, 'k')[3]).toBeCloseTo(0.5, 9);
    // weight only on lossDiff: CSA lost more, so USA is favoured
    const coef = WIN_FEATURES.map((f) => (f === 'lossDiff' ? 10 : 0));
    const p = winProbability(st, { win: { features: WIN_FEATURES, intercept: 0, coef } }, 'k');
    expect(p[3]).toBeGreaterThan(0.5);
    const lossDiff = winFeatures(st, 3)[WIN_FEATURES.indexOf('lossDiff')];
    expect(p[3]).toBeCloseTo(1 / (1 + Math.exp(-10 * lossDiff)), 9);
    // a side's share of its ticket pool: CSA's 5 tickets lost of a 2-a-player pool, 3 men at their peak on the field
    const pooled = winFeatures(st, 3, { pools: { k: { 2: 2 } } }, 'k');
    expect(pooled[WIN_FEATURES.indexOf('poolCsa')]).toBeCloseTo(5 / (2 * Math.max(10, 3 * 1.16)), 9);
    expect(pooled[WIN_FEATURES.indexOf('poolUsa')]).toBe(0);         // no pool known for USA here
    // a model fitted on other features is no model
    expect(winProbability(st, { win: { features: ['x'], intercept: 0, coef: [1] } }, 'k')).toBeNull();
  });
  it('reads the area\'s attacker and time limit from the calibration', () => {
    const st = sideStates(still());
    const f = winFeatures(st, 4, { limits: { k: 40 }, roles: { k: -1 } }, 'k');
    expect(f[WIN_FEATURES.indexOf('r')]).toBe(-1);
    expect(f[WIN_FEATURES.indexOf('late')]).toBeCloseTo(20 / 40, 9);
  });
  it('prefers the round\'s own defender and starting tickets to the calibration\'s', () => {
    const st = withRoundFacts(sideStates(still(), [{ ts: 1, victimTeam: 2, victimFormation: 'oob' }]),
      { defendingTeam: 'CSA', startTicketsUsa: null, startTicketsCsa: 100 });
    const f = winFeatures(st, 3, { roles: { k: -1 }, pools: { k: { 1: 2, 2: 2 } } }, 'k');
    expect(f[WIN_FEATURES.indexOf('r')]).toBe(1);                         // CSA defends: USA attacks
    // its 5 stance tickets at 18 / pop each (pop: the floor of 10), of its 100 tickets
    expect(f[WIN_FEATURES.indexOf('poolCsa')]).toBeCloseTo((5 * 18) / 10 / 100, 9);
    expect(f[WIN_FEATURES.indexOf('poolUsa')]).toBe(0);                  // none known: the area's pool (nothing lost yet)
    // nothing known: the calibration stands
    const none = winFeatures(withRoundFacts(sideStates(still())), 3, { roles: { k: -1 } }, 'k');
    expect(none[WIN_FEATURES.indexOf('r')]).toBe(-1);
  });
  it('takes tickets spent from the HUD where the replay has it, else from losses on the game\'s scale', () => {
    // CSA (1 man to USA's 2) hits 0 tickets -- Last Stand -- at t = 10
    const events = [
      { t: 0, event: 'tickets', team: 2, value: '100.0', pct: 100 },
      { t: 4, event: 'tickets', team: 2, value: '60.0', pct: 60 },
      { t: 10, event: 'tickets', team: 2, value: '0.0', pct: 0 },
    ];
    const st = sideStates(still(), [], events);
    expect(st.side[2].spent[1]).toBeCloseTo(0.4, 9);
    expect(Number.isNaN(st.side[1].spent[1])).toBe(true);     // no HUD rows for USA
    const at = (i, k) => winFeatures(st, i)[WIN_FEATURES.indexOf(k)];
    expect(at(1, 'poolCsa')).toBeCloseTo(0.4, 9);
    expect(at(2, 'poolCsa')).toBe(1);                         // t = 10: out of tickets
    // and the same from losses alone: 2 stance tickets at 18 / 10 each of USA's 3
    const out = withRoundFacts(sideStates(makeReplay([{ name: 'u1', team: 1 }, { name: 'u2', team: 1 }, { name: 'c1', team: 2 }],
      401, (p) => (p < 2 ? [0, p * 10] : [1000, 0])), [{ ts: 150, victimTeam: 1, victimFormation: 'in_form' }, { ts: 160, victimTeam: 1, victimFormation: 'in_form' }]),
    { startTicketsUsa: 3 });
    expect(winFeatures(out, 31)[WIN_FEATURES.indexOf('poolUsa')]).toBeCloseTo(0.6, 9);
    expect(winFeatures(out, 33)[WIN_FEATURES.indexOf('poolUsa')]).toBe(1);
  });
  it('skips the HUD\'s reads across a stage change', () => {
    // 3684, 2026-10-06: USA's stage drop at 50 % read as 25 % until its next loss
    const events = [
      { t: 2, event: 'tickets', team: 1, value: '', pct: 50.4 },
      { t: 6.2, event: 'morale', team: 1, value: 'TakingLosses', pct: null },
      { t: 6.2, event: 'tickets', team: 1, value: '', pct: 25 },
      { t: 13, event: 'tickets', team: 1, value: '', pct: 49.6 },
      { t: 17, event: 'morale', team: 1, value: 'LastStand', pct: null },
    ];
    const st = sideStates(still(), [], events);
    expect(st.side[1].spent[2]).toBeCloseTo(0.496, 9);   // t = 10: still 50.4 % left
    expect(st.side[1].spent[3]).toBeCloseTo(0.504, 9);   // t = 15
    expect(st.side[1].spent[4]).toBe(1);                 // t = 20: Last Stand
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

describe('areaStats', () => {
  it('times each side on each patch, counts who fell there, and names who held it', () => {
    const r = still();   // 41 frames at 2 Hz: 20 s
    const st = areaStats(r, [{ x: 1005, y: 0, team: 2 }], (i) => `co ${r.players[i].team}`, 20);
    const usa = st.cells.get(0);                     // u1 and u2, 10 m apart, one 20 m cell
    expect(usa.s[1]).toBeCloseTo(2 * 20.5, 5);       // 41 frames of 0.5 s each
    expect(usa).toMatchObject({ first: 0, last: 20 });
    const csa = st.cells.get(50 * 4096);
    expect(csa.dead).toEqual({ 1: 0, 2: 1 });
    expect(st.max.dead).toBe(1);

    const sum = areaSummary(st, [usa, csa]);
    expect(sum.dead[2]).toBe(1);
    expect(sum.companies.map((c) => c.name)).toEqual(['co 1', 'co 2']);
    expect(areaSummary(st, [])).toBeNull();
  });

  it('spreads into a smooth density that peaks where they stood', () => {
    const st = areaStats(still(), [], () => null, 20);
    const h = heatDensity(st, 'presence', 1);
    const at = (t, wx, wy) => h.d[t][Math.round((wy - h.y0) / h.cellM) * h.w + Math.round((wx - h.x0) / h.cellM)];
    expect(at(1, 0, 0)).toBeCloseTo(h.max, 5);
    expect(at(1, 20, 0)).toBeGreaterThan(0);
    expect(at(1, 20, 0)).toBeLessThan(at(1, 0, 0));
    expect(at(2, 0, 0)).toBe(0);
  });
});

describe('isoSegments', () => {
  it('traces where a grid crosses a level', () => {
    // a column of 1s at i = 2 in a 4 × 3 grid of 0s: two vertical lines half a cell either side
    const g = Float32Array.from({ length: 12 }, (_, k) => +(k % 4 === 2));
    const segs = isoSegments(g, 4, 3, 0.5);
    expect(segs.length).toBe(4);
    expect(new Set(segs.map((s) => s[0]))).toEqual(new Set([1.5, 2.5]));
    expect(isoSegments(g, 4, 3, 0.5, new Uint8Array(12))).toEqual([]);
  });
});

describe('frontLine', () => {
  it('runs between the two armies and nowhere else', () => {
    // USA in a line across the field at x = 0, CSA at x = 200
    const players = Array.from({ length: 20 }, (_, i) => ({ name: `p${i}`, team: i < 10 ? 1 : 2 }));
    const r = makeReplay(players, 1, (p) => [p < 10 ? 0 : 200, (p % 10) * 20]);
    const segs = frontLine(r, 0);
    expect(segs.length).toBeGreaterThan(5);
    for (const [x0, , x1] of segs) { expect(x0).toBeCloseTo(100, 0); expect(x1).toBeCloseTo(100, 0); }
    expect(frontLine(makeReplay(players.slice(0, 10), 1, (p) => [0, p * 20]), 0)).toEqual([]);
  });
});

describe('alignKills', () => {
  it('puts kills on the replay clock, sorted, dropping untimed ones', () => {
    const meta = { roundStartSec: 14 * 3600 };
    const out = alignKills([{ time: '14:00:09', victim: 'b' }, { time: null }, { time: '14:00:02', victim: 'a' }], meta);
    expect(out.map((k) => [k.victim, k.ts])).toEqual([['a', 2], ['b', 9]]);
    expect(alignKills([{ time: '14:00:02' }], {})).toEqual([]);
  });
});

describe('training samples', () => {
  it('round-trip to the same model inputs', () => {
    const r = still();
    r.meta.roundStartSec = 0;
    const kills = [{ time: '00:00:03', victimTeam: 1, victimFormation: 'oob' }];
    const sample = sampleFromRecording(r, kills, 20);
    expect(sample.key).toBe('antietam|skirmish|east woods');
    const direct = sideStates(r, alignKills(kills, r.meta)), back = statesFromSample(sample);
    for (const i of [0, 1, 3]) {
      winFeatures(back, i).forEach((v, j) => expect(v).toBeCloseTo(winFeatures(direct, i)[j], 2));
    }
  });
});
