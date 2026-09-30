import { describe, it, expect } from 'vitest';
import { nightLeadPairs, roundWinners } from './nightLeads';

describe('nightLeadPairs', () => {
  it('gives a regular night one matchup', () => {
    expect(nightLeadPairs({ leadA: '8th OH', leadB: 'II Corps' })).toEqual({
      first: { a: '8th OH', b: 'II Corps' },
      second: null,
    });
  });

  it('ignores per-round leads on a night that does not split them', () => {
    // The flag is what says a night runs two matchups; stale round fields on a
    // regular night are not it.
    const r = nightLeadPairs({ leadA: '8th OH', leadB: 'II Corps', leadA_r2: 'MSG', leadB_r2: 'FSB' });
    expect(r.second).toBeNull();
  });

  it('names both matchups on a single-round-lead night', () => {
    expect(nightLeadPairs({
      isSingleRoundLeads: true,
      leadA_r1: '8th OH', leadB_r1: 'II Corps',
      leadA_r2: 'MSG', leadB_r2: 'FSB',
    })).toEqual({
      first: { a: '8th OH', b: 'II Corps' },
      second: { a: 'MSG', b: 'FSB' },
    });
  });

  it('does the same for a playoff night', () => {
    const r = nightLeadPairs({
      isPlayoffs: true,
      leadA_r1: 'CQB', leadB_r1: 'JD',
      leadA_r2: 'CB', leadB_r2: 'TKO',
    });
    expect(r.second).toEqual({ a: 'CB', b: 'TKO' });
  });

  it('keeps one line when both rounds run the same matchup', () => {
    const r = nightLeadPairs({
      isSingleRoundLeads: true,
      leadA_r1: '8th OH', leadB_r1: 'II Corps',
      leadA_r2: '8th OH', leadB_r2: 'II Corps',
    });
    expect(r.first).toEqual({ a: '8th OH', b: 'II Corps' });
    expect(r.second).toBeNull();
  });

  it('falls back to the night lead for a round that has none, as the points table does', () => {
    const r = nightLeadPairs({
      isSingleRoundLeads: true,
      leadA: '8th OH', leadB: 'II Corps',
      leadA_r2: 'MSG', leadB_r2: 'FSB',
    });
    expect(r.first).toEqual({ a: '8th OH', b: 'II Corps' });
    expect(r.second).toEqual({ a: 'MSG', b: 'FSB' });
  });

  it('reads a half-filled night as the one matchup it has', () => {
    const only2 = nightLeadPairs({ isSingleRoundLeads: true, leadA_r2: 'MSG', leadB_r2: 'FSB' });
    expect(only2).toEqual({ first: { a: 'MSG', b: 'FSB' }, second: null });

    const only1 = nightLeadPairs({ isSingleRoundLeads: true, leadA_r1: 'MSG', leadB_r1: 'FSB' });
    expect(only1).toEqual({ first: { a: 'MSG', b: 'FSB' }, second: null });
  });

  it('reports a night with one side named and the other not', () => {
    expect(nightLeadPairs({ leadA: '8th OH' }).first).toEqual({ a: '8th OH', b: null });
  });

  it('has nothing to show for a night with no leads at all', () => {
    expect(nightLeadPairs({ isSingleRoundLeads: true })).toEqual({ first: null, second: null });
  });
});

describe('roundWinners', () => {
  it('says Team A/B on a night without leads', () => {
    expect(roundWinners({ round1Winner: 'A', round2Winner: 'B' })).toEqual(['Team A', 'Team B']);
  });

  it('names the night lead of the side that won each round', () => {
    expect(roundWinners({ leadA: '8th OH', leadB: 'II Corps', round1Winner: 'B', round2Winner: 'A' }))
      .toEqual(['II Corps', '8th OH']);
  });

  it('names each round its own lead on a split-lead night', () => {
    expect(roundWinners({
      isSingleRoundLeads: true, leadA_r1: '8th OH', leadA_r2: 'MSG', leadB_r1: 'JD', leadB_r2: 'FSB',
      round1Winner: 'A', round2Winner: 'A',
    })).toEqual(['8th OH', 'MSG']);
  });

  it('falls back to the team for a round that has no lead, and null for no result', () => {
    expect(roundWinners({ isSingleRoundLeads: true, leadA_r1: '8th OH', round1Winner: 'A', round2Winner: 'A' }))
      .toEqual(['8th OH', 'Team A']);
    expect(roundWinners({ leadA: '8th OH', round1Winner: 'A' })).toEqual(['8th OH', null]);
  });
});
