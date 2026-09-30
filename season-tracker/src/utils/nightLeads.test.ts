import { describe, it, expect } from 'vitest';
import { nightLeadPairs, sweepLabel } from './nightLeads';

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

describe('sweepLabel', () => {
  it('says Team A/B on a night without leads', () => {
    expect(sweepLabel({}, 'A')).toBe('Team A');
  });

  it('names the night lead', () => {
    expect(sweepLabel({ leadA: '8th OH', leadB: 'II Corps' }, 'B')).toBe('II Corps');
  });

  it('names both round leads when they differ, once when they match', () => {
    const night = { isSingleRoundLeads: true, leadA_r1: '8th OH', leadA_r2: 'MSG', leadB_r1: 'JD', leadB_r2: 'JD' };
    expect(sweepLabel(night, 'A')).toBe('8th OH / MSG');
    expect(sweepLabel(night, 'B')).toBe('JD');
  });

  it('falls back to the team for a round that has no lead', () => {
    expect(sweepLabel({ isSingleRoundLeads: true, leadA_r1: '8th OH' }, 'A')).toBe('8th OH / Team A');
    expect(sweepLabel({ isPlayoffs: true, leadA_r2: 'MSG' }, 'A')).toBe('Team A / MSG');
  });
});
