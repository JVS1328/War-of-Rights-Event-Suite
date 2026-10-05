import { describe, it, expect } from 'vitest';
import { calibrate, usableRound, fitRoundModel, MIN_ROUNDS } from './roundModelFit.js';
import { teamOf } from './killAlign.js';
import { SAMPLE_VERSION, WIN_FEATURES } from './roundAnalysis.js';

const board = (over) => ({ map: 'Antietam', mode: 'Skirmish', area: 'East Woods', durationS: 1500, moraleUsa: null, moraleCsa: null, ...over });

describe('calibrate', () => {
  it('finds an area\'s time limit where rounds that ran to time cluster', () => {
    const boards = [...Array(6).fill(board({ durationS: 2707 })), board({ durationS: 1200 }), board({ durationS: 2500 })];
    expect(calibrate(boards).limits['antietam|skirmish|east woods']).toBe(2707);
  });
  it('reads the attacker from who ends in Final Push, however morale is spelled', () => {
    const boards = [
      ...Array(3).fill(board({ moraleUsa: 'FinalPush', moraleCsa: 'Breaking' })),
      ...Array(3).fill(board({ moraleUsa: 'Final Push', moraleCsa: 'Last Stand' })),
    ];
    expect(calibrate(boards).roles['antietam|skirmish|east woods']).toBe(1);
    expect(calibrate(boards.slice(0, 4)).roles).toEqual({});      // too few to say
  });
});

describe('usableRound', () => {
  it('needs a winner and a fight', () => {
    expect(usableRound({ winner: 'USA', moraleUsa: 'Breaking', moraleCsa: 'Engaged' })).toBe(true);
    expect(usableRound({ winner: null })).toBe(false);
    expect(usableRound({ winner: 'CSA', moraleUsa: 'Battle Ready', moraleCsa: 'BattleReady' })).toBe(false);
    expect(teamOf('csa')).toBe(2);
    expect(teamOf(1)).toBe(1);
  });
});

// A round in which the eventual loser bleeds tickets faster (deterministic spread per round).
function syntheticRound(i, winner) {
  const n = 40, fast = 3 + (i % 4), slow = 1 + (i % 3);
  const side = (rate) => ({
    alive: Array(n).fill(30), mean: Array(n).fill(0.4), front: Array(n).fill(0.6),
    lost: Array.from({ length: n }, (_, k) => k * rate),
  });
  return {
    id: `r${String(i).padStart(3, '0')}`, winner,
    sample: { v: SAMPLE_VERSION, key: 'antietam|skirmish|east woods', seen: Array(n).fill(60),
      side: winner === 1 ? { 1: side(slow), 2: side(fast) } : { 1: side(fast), 2: side(slow) } },
  };
}

describe('fitRoundModel', () => {
  const rounds = Array.from({ length: 30 }, (_, i) => syntheticRound(i, i % 2 ? 1 : 2));
  it('learns that the side losing fewer tickets wins, and says how well on unseen rounds', () => {
    const m = fitRoundModel(rounds, { limits: {}, roles: {} }, { source: 'test' });
    expect(m.source).toBe('test');
    expect(m.win.features).toEqual(WIN_FEATURES);
    expect(m.win.coef[WIN_FEATURES.indexOf('lossDiff')]).toBeGreaterThan(0);
    expect(m.validation.rounds).toBe(30);
    expect(m.validation.aucRoundMean).toBeGreaterThan(0.9);
    expect(m.areas['antietam|skirmish|east woods'].rounds).toBe(30);
  });
  it('fits from a single round, without validation, and skips stale samples', () => {
    expect(MIN_ROUNDS).toBe(1);
    expect(fitRoundModel([], {})).toBeNull();
    const one = fitRoundModel(rounds.slice(0, 1), { limits: {}, roles: {} });
    expect(one.rounds).toBe(1);
    expect(one.validation).toBeNull();
    expect([one.win.intercept, ...one.win.coef].every(Number.isFinite)).toBe(true);   // one winner can't run it away
    expect(fitRoundModel(rounds.slice(0, 3), { limits: {}, roles: {} }).validation.rounds).toBe(3);
    const stale = rounds.map((r) => ({ ...r, sample: { ...r.sample, v: SAMPLE_VERSION - 1 } }));
    expect(fitRoundModel(stale, {})).toBeNull();
  });
});
