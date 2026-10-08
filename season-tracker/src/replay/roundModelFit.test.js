import { describe, it, expect } from 'vitest';
import { calibrate, usableRound, fitRoundModel, MIN_ROUNDS } from './roundModelFit.js';
import { teamOf } from './killAlign.js';
import { SAMPLE_VERSION, WIN_FEATURES, areaLogit } from './roundAnalysis.js';

const board = (over) => ({ map: 'Antietam', mode: 'Skirmish', area: 'Test Field', durationS: 1500, moraleUsa: null, moraleCsa: null, ...over });

describe('calibrate', () => {
  it('takes the attacker and ticket pools from the game\'s own area setup where boards don\'t say', () => {
    // Pry Ford: CSA defends, 124 / 84 starting tickets (areaFacts); Conquest is 100 a side
    const c = calibrate([
      ...Array(5).fill({ map: 'Antietam', mode: 'Skirmish', area: 'Pry Ford', durationS: 1500, winner: 'USA', moraleUsa: 'Engaged', moraleCsa: 'Breaking', pop: 100 }),
      ...Array(5).fill({ map: 'DrillCamp', mode: 'Conquest', area: 'Orchards', durationS: 1500, winner: 'USA', moraleUsa: 'Engaged', moraleCsa: 'Breaking', pop: 100 }),
    ]);
    expect(c.roles['antietam|skirmish|pry ford']).toBe(1);
    expect(c.pools['antietam|skirmish|pry ford']).toEqual({ 1: 6.889, 2: 4.667 });
    expect(c.pools['drill-camp|conquest|orchards']).toEqual({ 1: 5.556, 2: 5.556 });
  });

  it('finds an area\'s time limit where rounds that ran to time cluster', () => {
    const boards = [...Array(6).fill(board({ durationS: 2707 })), board({ durationS: 1200 }), board({ durationS: 2500 })];
    expect(calibrate(boards).limits['antietam|skirmish|test field']).toBe(2707);
  });
  it('reads the attacker from who ends in Final Push, however morale is spelled', () => {
    const boards = [
      ...Array(3).fill(board({ moraleUsa: 'FinalPush', moraleCsa: 'Breaking' })),
      ...Array(3).fill(board({ moraleUsa: 'Final Push', moraleCsa: 'Last Stand' })),
    ];
    expect(calibrate(boards).roles['antietam|skirmish|test field']).toBe(1);
    expect(calibrate(boards.slice(0, 4)).roles).toEqual({});      // too few to say
  });
  it('counts each area\'s wins and states its facts, from every scoreboard', () => {
    const boards = [
      ...Array.from({ length: 5 }, (_, i) => board({ winner: 'USA', moraleUsa: 'Final Push', moraleCsa: 'Breaking',
        casualtiesUsa: 100, casualtiesCsa: 150, ticketsUsa: 200, ticketsCsa: 500 + 10 * i, pop: 100 })),
      board({ winner: 'CSA', moraleUsa: 'Breaking', moraleCsa: 'Engaged', casualtiesUsa: 120, casualtiesCsa: 90, ticketsUsa: 400, ticketsCsa: 300, pop: 50 }),
      board({ winner: 'USA', ticketsUsa: 0, ticketsCsa: 0, pop: 100 }),   // an older scoreboard: no stance counts
      board({ winner: null }),
    ];
    const c = calibrate(boards, null, 'PUBS');
    const key = 'antietam|skirmish|test field';
    expect(c.rates[key]).toEqual({ usa: 6, n: 7, p0: 0.5 });
    // CSA broke five times, at 500-540 tickets with 100 players: its pool is ~5.2 a player; USA broke once, too few to say
    expect(c.pools[key]).toEqual({ 2: 5.2 });
    expect(c.poolDefault).toBeNull();                                // too few rounds of USA breaking anywhere
    expect(c.facts[key]).toMatchObject({ source: 'PUBS', rounds: 8, decided: 7, usaWins: 6, medianS: 1500,
      casualties: { 1: 100, 2: 150 }, tickets: { 1: 200, 2: 520 }, pool: { 2: 5.2 },
      ending: { 1: 'Final Push', 2: 'Breaking', share: 0.625 } });
    // the rate as a feature: above even here, and back to the prior without this round's own win
    expect(areaLogit(c, key)).toBeGreaterThan(0);
    expect(areaLogit(c, key, 1)).toBeLessThan(areaLogit(c, key));
    expect(areaLogit(c, 'nowhere')).toBe(0);
    // with a base, an area's rate shrinks toward base's there instead of 50%
    const events = calibrate([board({ winner: 'CSA' })], c);
    expect(events.rates[key].p0).toBeGreaterThan(0.5);
    expect(events.facts[key].source).toBe('PUBS');                  // too few event rounds for their own facts
  });
  it('gives Conquest and Contention no attacker, whatever their endings or a base say', () => {
    // every one of these ends with CSA in Last Stand: in Skirmish that makes CSA the defender
    const endings = (mode) => Array(6).fill(board({ mode, moraleUsa: 'Engaged', moraleCsa: 'LastStand' }));
    const c = calibrate([...endings('Skirmish'), ...endings('Contention'), ...endings('Conquest')],
      { roles: { 'antietam|contention|test field': 1, 'a|conquest|b': -1, 'a|skirmish|b': -1 } });
    expect(c.roles).toEqual({ 'antietam|skirmish|test field': 1, 'a|skirmish|b': -1 });
    expect(calibrate([board({ mode: 'Contention', defendingTeam: 'USA' })]).roles).toEqual({});
  });
  it('keeps a base calibration where its own boards settle nothing', () => {
    const base = { limits: { 'a|skirmish|c': 1800, 'antietam|skirmish|test field': 1 }, roles: { 'a|skirmish|c': -1 } };
    const own = calibrate(Array(6).fill(board({ durationS: 2707 })), base);
    expect(own.limits).toEqual({ 'a|skirmish|c': 1800, 'antietam|skirmish|test field': 2707 });
    expect(own.roles).toEqual({ 'a|skirmish|c': -1 });
  });
  it('takes the attacker, pools and tickets lost from boards that record them, over the inference', () => {
    const key = 'antietam|skirmish|test field';
    // morale alone would say USA attacks, but too few boards for that; one board naming the defender settles it
    const boards = [
      ...Array(3).fill(board({ moraleUsa: 'FinalPush', moraleCsa: 'Breaking' })),
      board({ defendingTeam: 'USA', winner: 'USA', moraleUsa: 'LastStand', moraleCsa: 'Engaged' }),
    ];
    expect(calibrate(boards).roles[key]).toBe(-1);
    // the pool from starting tickets (in stance tickets per player: start ÷ 18), won or lost, run to
    // time or not, whatever the population; tickets lost = start − left
    const real = Array.from({ length: 5 }, (_, i) => board({
      winner: 'USA', moraleUsa: 'Engaged', moraleCsa: 'Breaking', pop: 100, ticketsUsa: 999, ticketsCsa: 999,
      defendingTeam: 'CSA', startTicketsUsa: 122, startTicketsCsa: '122', ticketsLeftUsa: 40 + i, ticketsLeftCsa: 0,
    }));
    const c = calibrate(real);
    expect(c.roles[key]).toBe(1);
    expect(c.pools[key]).toEqual({ 1: 6.778, 2: 6.778 });
    expect(c.facts[key].tickets).toEqual({ 1: 80, 2: 122 });
    // blank values are no values: back to the stance counts
    const blank = calibrate(real.map((r) => ({ ...r, defendingTeam: null, startTicketsUsa: null, startTicketsCsa: '', ticketsLeftUsa: null })));
    expect(blank.facts[key].tickets).toEqual({ 1: 999, 2: 999 });
    expect(blank.pools[key]).toEqual({ 2: 9.99 });
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
    sample: { v: SAMPLE_VERSION, key: 'antietam|skirmish|test field', seen: Array(n).fill(60),
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
    expect(m.areas['antietam|skirmish|test field'].rounds).toBe(30);
  });
  it('reads each round\'s own starting tickets into its features', () => {
    const calib = { limits: {}, roles: {} }, j = WIN_FEATURES.indexOf('poolDiff');
    expect(fitRoundModel(rounds, calib).win.coef[j]).toBe(0);              // no pools known: the feature is flat
    const real = rounds.map((r) => ({ ...r, defendingTeam: 'CSA', startTicketsUsa: 150, startTicketsCsa: 150 }));
    expect(fitRoundModel(real, calib).win.coef[j]).toBeGreaterThan(0);     // CSA spending more of its pool favours USA
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
  it('starts from a prior: leans on it with few rounds, and falls back to it entirely with none', () => {
    const calib = { limits: {}, roles: {} };
    const prior = { ...fitRoundModel(rounds, calib, { source: 'PUBS' }), areas: { 'x|y|z': { rounds: 9, usaWins: 4, bands: {} } } };
    // a single odd round: the flat ground's winner is CSA, which on its own pushes the fit away
    const odd = [{ ...syntheticRound(0, 2), id: 'odd' }];
    const alone = fitRoundModel(odd, calib), leaning = fitRoundModel(odd, calib, { source: 'event', prior });
    const dist = (m) => Math.hypot(m.win.intercept - prior.win.intercept, ...m.win.coef.map((c, j) => c - prior.win.coef[j]));
    expect(dist(leaning)).toBeLessThan(dist(alone));
    expect(leaning.prior).toEqual({ source: 'PUBS', rounds: 30 });
    expect(leaning.areas['x|y|z'].source).toBe('PUBS');                       // ground events haven't fought over

    const none = fitRoundModel([], calib, { source: 'event', prior });
    expect(none).toMatchObject({ rounds: 0, validation: null, win: prior.win, source: 'event' });
    // a prior fitted on other features is no prior
    expect(fitRoundModel([], calib, { prior: { ...prior, win: { ...prior.win, features: ['x'] } } })).toBeNull();
  });
});
