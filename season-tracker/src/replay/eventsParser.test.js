import { describe, it, expect } from 'vitest';
import {
  looksLikeEventsCsv, isEventsFilename, eventsFilenameFor, replayFilenameForEvents, parseEventsCsv, roundStateAt,
} from './eventsParser.js';

// Rows in the exact shape wor_overlay/replay.cpp writes.
const CSV = [
  't_s,hms,event,team,value,pct',
  '0.00,20:41:07,morale,USA,BattleReady,',
  '0.00,20:41:07,morale,CSA,BattleReady,',
  '0.00,20:41:07,tickets,USA,122.0,100.00',
  '0.00,20:41:07,tickets,CSA,122.0,100.00',
  '0.00,20:41:07,phase,,Prepare,',
  '612.40,20:51:19,counter_attack,CSA,start,',
  '619.02,20:51:26,morale,CSA,Engaged,',
  '619.02,20:51:26,tickets,CSA,91.0,74.60',
  '700.00,20:52:47,counter_attack,CSA,end,',
  '',
].join('\r\n');

describe('parseEventsCsv', () => {
  it('recognises the file and pairs it with its replay by name', () => {
    expect(looksLikeEventsCsv(CSV)).toBe(true);
    expect(looksLikeEventsCsv('map,antietam\nsample_rate_hz,2')).toBe(false);
    expect(isEventsFilename('replay_20261005_204107_events.csv')).toBe(true);
    expect(isEventsFilename('replay_20261005_204107_arty.csv')).toBe(false);
    expect(eventsFilenameFor('replay_20261005_204107.csv')).toBe('replay_20261005_204107_events.csv');
    expect(replayFilenameForEvents('replay_20261005_204107_events.csv')).toBe('replay_20261005_204107.csv');
  });

  it('reads every row, sides as 1 / 2, pct only on tickets', () => {
    const ev = parseEventsCsv(CSV);
    expect(ev).toHaveLength(9);
    expect(ev[2]).toEqual({ t: 0, event: 'tickets', team: 1, value: '122.0', pct: 100 });
    expect(ev[4]).toEqual({ t: 0, event: 'phase', team: 0, value: 'Prepare', pct: null });
    expect(ev[7]).toEqual({ t: 619.02, event: 'tickets', team: 2, value: '91.0', pct: 74.6 });
    expect(parseEventsCsv('')).toEqual([]);
    expect(parseEventsCsv('garbage')).toEqual([]);
  });
});

describe('roundStateAt', () => {
  const ev = parseEventsCsv(CSV);

  it('holds each field at its latest value', () => {
    expect(roundStateAt(ev, 620)).toEqual({
      teams: { 1: { morale: 'BattleReady', tickets: 122, pct: 100 }, 2: { morale: 'Engaged', tickets: 91, pct: 74.6 } },
      counterAttack: 2, phase: 'Prepare',
    });
    expect(roundStateAt(ev, 10).teams[2]).toEqual({ morale: 'BattleReady', tickets: 122, pct: 100 });
  });

  it('ends the counter-attack, and knows nothing before the first row', () => {
    expect(roundStateAt(ev, 612).counterAttack).toBe(0);
    expect(roundStateAt(ev, 612.4).counterAttack).toBe(2);
    expect(roundStateAt(ev, 800).counterAttack).toBe(0);
    expect(roundStateAt(ev, -1)).toEqual({
      teams: { 1: { morale: null, tickets: null, pct: null }, 2: { morale: null, tickets: null, pct: null } },
      counterAttack: 0, phase: null,
    });
    expect(roundStateAt([], 5).phase).toBeNull();
  });
});
