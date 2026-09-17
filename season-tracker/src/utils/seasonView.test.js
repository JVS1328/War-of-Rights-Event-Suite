import { describe, it, expect } from 'vitest';
import {
  getEffectiveTeams,
  seasonPoints,
  standingRows,
  nightRows,
  rosterRows,
  seasonKpis,
  tokenUnitsOf,
} from './seasonView';
import { DEFAULT_POINT_SYSTEM } from './eventStore';

// These derivations feed two screens that must never disagree: the admin
// tracker and the public, read-only site. The point of testing them here is
// that both read this one module.

const season = (overrides = {}) => ({
  units: ['A1', 'B1'],
  nonTokenUnits: [],
  weeks: [],
  divisions: [],
  unitPlayerCounts: {},
  manualAdjustments: {},
  pointSystem: { ...DEFAULT_POINT_SYSTEM },
  ...overrides,
});

const week = (overrides = {}) => ({
  id: 1,
  name: 'Night 1',
  teamA: ['A1'],
  teamB: ['B1'],
  leadA: 'A1',
  leadB: 'B1',
  ...overrides,
});

describe('getEffectiveTeams', () => {
  it('leaves the sides alone when nothing was swapped', () => {
    const w = week({ teamA: ['A1', 'A2'], teamB: ['B1'] });
    expect(getEffectiveTeams(w, 1)).toEqual({ teamA: ['A1', 'A2'], teamB: ['B1'] });
  });

  it('moves a balanced unit across for that round only', () => {
    const w = week({ teamA: ['A1', 'A2'], teamB: ['B1'], roundSwaps: { r1: ['A2'], r2: [] } });
    expect(getEffectiveTeams(w, 1)).toEqual({ teamA: ['A1'], teamB: ['B1', 'A2'] });
    expect(getEffectiveTeams(w, 2)).toEqual({ teamA: ['A1', 'A2'], teamB: ['B1'] });
  });
});

describe('seasonPoints', () => {
  it('pays the lead and the assists on a win, and the assists on a loss', () => {
    const s = season({
      units: ['A1', 'A2', 'B1'],
      weeks: [week({ teamA: ['A1', 'A2'], round1Winner: 'A' })],
    });
    const stats = seasonPoints(s);
    expect(stats.A1).toMatchObject({ points: DEFAULT_POINT_SYSTEM.winLead, leadWins: 1 });
    expect(stats.A2).toMatchObject({ points: DEFAULT_POINT_SYSTEM.winAssist, assistWins: 1 });
    expect(stats.B1).toMatchObject({ points: DEFAULT_POINT_SYSTEM.lossLead, leadLosses: 1 });
  });

  it('gives non-token units no row at all', () => {
    const s = season({ nonTokenUnits: ['B1'], weeks: [week({ round1Winner: 'A' })] });
    expect(Object.keys(seasonPoints(s))).toEqual(['A1']);
    expect(tokenUnitsOf(s)).toEqual(['A1']);
  });

  it('scores a fun round as nothing at all', () => {
    const s = season({ weeks: [week({ round1Winner: 'A', round2Winner: 'A', isFunRound: true })] });
    const stats = seasonPoints(s);
    expect(stats.A1).toMatchObject({ points: 0, leadWins: 0 });
    expect(stats.B1).toMatchObject({ points: 0, leadLosses: 0 });
  });

  it('tracks the record but pays nothing in playoffs', () => {
    const s = season({
      weeks: [week({ isPlayoffs: true, leadA_r1: 'A1', leadB_r1: 'B1', round1Winner: 'A' })],
    });
    const stats = seasonPoints(s);
    expect(stats.A1).toMatchObject({ points: 0, leadWins: 1 });
    expect(stats.B1).toMatchObject({ points: 0, leadLosses: 1 });
  });

  it('adds the sweep bonus only to units that won both rounds', () => {
    const s = season({
      units: ['A1', 'A2', 'B1'],
      pointSystem: { ...DEFAULT_POINT_SYSTEM, bonus2_0Lead: 3, bonus2_0Assist: 2 },
      // A2 is swapped over for round two, so it is not on the winning side twice.
      weeks: [week({
        teamA: ['A1', 'A2'],
        round1Winner: 'A',
        round2Winner: 'A',
        roundSwaps: { r1: [], r2: ['A2'] },
      })],
    });
    const stats = seasonPoints(s);
    const perRound = DEFAULT_POINT_SYSTEM.winLead * 2;
    expect(stats.A1.points).toBe(perRound + 3);
    expect(stats.A2.points).toBe(DEFAULT_POINT_SYSTEM.winAssist + DEFAULT_POINT_SYSTEM.lossAssist);
  });

  it('stops at maxWeekIdx so the ladder can walk a season week by week', () => {
    const s = season({
      weeks: [week({ round1Winner: 'A' }), week({ id: 2, round1Winner: 'A' })],
    });
    expect(seasonPoints(s, 0).A1.leadWins).toBe(1);
    expect(seasonPoints(s, 1).A1.leadWins).toBe(2);
    expect(seasonPoints(s).A1.leadWins).toBe(2);
  });

  it('applies manual adjustments last', () => {
    const s = season({ manualAdjustments: { A1: -5 }, weeks: [week({ round1Winner: 'A' })] });
    expect(seasonPoints(s).A1.points).toBe(DEFAULT_POINT_SYSTEM.winLead - 5);
  });

  it('pays a balanced unit only when it lost, under perRoundLoss', () => {
    const s = season({
      units: ['A1', 'A2', 'B1'],
      pointSystem: { ...DEFAULT_POINT_SYSTEM, balancePoints: 1, balancePointsStyle: 'perRoundLoss' },
      weeks: [week({ teamA: ['A1', 'A2'], round1Winner: 'A', roundSwaps: { r1: ['A2'], r2: [] } })],
    });
    // A2 played round one on B's side, which lost, so the balance point lands.
    expect(seasonPoints(s).A2.points).toBe(DEFAULT_POINT_SYSTEM.lossAssist + 1);
  });

  it('tallies balance points on their own as well as in the total', () => {
    const s = season({
      units: ['A1', 'A2', 'B1'],
      pointSystem: { ...DEFAULT_POINT_SYSTEM, balancePoints: 2, balancePointsStyle: 'perRound' },
      weeks: [week({
        teamA: ['A1', 'A2'],
        round1Winner: 'A',
        round2Winner: 'A',
        roundSwaps: { r1: ['A2'], r2: ['A2'] },
      })],
    });
    const stats = seasonPoints(s);
    expect(stats.A2.balancePoints).toBe(4);
    expect(stats.A2.points).toBe(DEFAULT_POINT_SYSTEM.lossAssist * 2 + 4);
    // A unit that never balanced has none of them.
    expect(stats.A1.balancePoints).toBe(0);
  });
});

describe('standingRows', () => {
  it('orders by points then name, and numbers the positions', () => {
    const s = season({
      units: ['A1', 'B1', 'C1'],
      weeks: [week({ teamA: ['A1'], teamB: ['B1', 'C1'], leadB: 'B1', round1Winner: 'A' })],
    });
    const rows = standingRows(s);
    expect(rows.map(r => [r.pos, r.unit])).toEqual([[1, 'A1'], [2, 'C1'], [3, 'B1']]);
    expect(rows[0]).toMatchObject({ w: 1, l: 0, wr: 100 });
  });

  it('badges a unit with its division', () => {
    const s = season({ divisions: [{ name: 'North', units: ['A1'] }] });
    expect(standingRows(s).find(r => r.unit === 'A1').division).toBe('North');
  });

  it('carries the balance-point tally through to the row', () => {
    const s = season({
      pointSystem: { ...DEFAULT_POINT_SYSTEM, balancePoints: 3, balancePointsStyle: 'perNight' },
      weeks: [week({ teamA: ['A1'], round1Winner: 'A', roundSwaps: { r1: ['A1'], r2: ['A1'] } })],
    });
    expect(standingRows(s).find(r => r.unit === 'A1').balancePoints).toBe(3);
    expect(standingRows(s).find(r => r.unit === 'B1').balancePoints).toBe(0);
  });
});

describe('nightRows', () => {
  it('carries both matchups of a split-lead night', () => {
    const s = season({
      weeks: [week({
        isSingleRoundLeads: true,
        leadA_r1: 'A1', leadB_r1: 'B1', leadA_r2: 'A2', leadB_r2: 'B2',
        round1Winner: 'A',
      })],
    });
    expect(nightRows(s)[0]).toMatchObject({
      n: 1, leadA: 'A1', leadB: 'B1', leadA2: 'A2', leadB2: 'B2', r1: 'A', played: true,
    });
  });

  it('reads an unplayed night as unplayed', () => {
    expect(nightRows(season({ weeks: [week()] }))[0].played).toBe(false);
  });
});

describe('rosterRows and seasonKpis', () => {
  it('counts the nights a unit was on a side', () => {
    const s = season({ weeks: [week(), week({ id: 2, teamA: ['A1'], teamB: [] })] });
    expect(rosterRows(s).find(r => r.name === 'A1').nights).toBe(2);
    expect(rosterRows(s).find(r => r.name === 'B1').nights).toBe(1);
  });

  it('reads casualties per faction, following the round-flipped flag', () => {
    const s = season({
      weeks: [week({ r1CasualtiesA: 10, r1CasualtiesB: 4, round1Flipped: true })],
    });
    const casualties = seasonKpis(s).find(k => k.head === 'Casualties');
    expect(casualties.value).toBe('14');
    expect(casualties.hint).toBe('4 USA · 10 CSA');
  });
});
