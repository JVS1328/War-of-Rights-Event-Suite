import { describe, it, expect } from 'vitest';
import {
  parseArtyCsv, looksLikeArtyCsv, pieceAt, impactsInWindow, replayFilenameForArty, impactFalloffM,
} from './artyParser.js';

// Rows in the exact shape wor_overlay/replay.cpp writes.
const HEADER = 't_s,hms,event,name,model,x,y,z,fwd_x,fwd_y,round,loaded,shell,case,canister';
const gun = (t, x, fx, fy, round, loaded) =>
  `${t},20:00:00,gun,Gun_1,10pdr,${x},100.00,50.00,${fx},${fy},${round},${loaded},,,`;
const caisson = (t, shell) =>
  `${t},20:00:00,caisson,"Caisson, A",10pdr,200.00,100.00,50.00,0.000,1.000,,,${shell},4,2`;
const impact = (t, type) => `${t},20:00:00,impact,,,2205.63,3413.28,191.34,,,${type},,,,`;

const CSV = [
  HEADER,
  gun(0.5, 10, 1, 0, '', 0), caisson(0.5, 10),
  gun(1.0, 10.2, 1, 0, '', 0), caisson(1.0, 10),       // gun drifts 0.2 m: no change point
  gun(1.5, 10.2, 1, 0, 'shell', 1), caisson(1.5, 9),   // loaded + a shell drawn: both change
  impact(1.7, 'OrdnanceShell'),
  impact(1.8, 'type_6'),                               // not artillery: dropped
  caisson(2.0, 9),                                     // gun missing this sample: gone
  gun(2.5, 30, 0, 1, '', 0), caisson(2.5, 9),          // gun back, moved + turned
  impact(2.6, 'NapoleonCase'),
].join('\r\n');

describe('parseArtyCsv', () => {
  const a = parseArtyCsv(CSV);

  it('recognises the file and pairs it with its replay by name', () => {
    expect(looksLikeArtyCsv(CSV)).toBe(true);
    expect(looksLikeArtyCsv('map,antietam\nsample_rate_hz,2')).toBe(false);
    expect(replayFilenameForArty('replay_20260928_203512_arty.csv')).toBe('replay_20260928_203512.csv');
  });

  it('keeps artillery impacts only, typed', () => {
    expect(a.impacts).toEqual([
      [1.7, 2205.63, 3413.28, 191.34, 0],
      [2.6, 2205.63, 3413.28, 191.34, 3],
    ]);
    expect(impactFalloffM(0)).toBe(20);
    expect(impactFalloffM(3)).toBe(15);
  });

  it('compresses a piece to its change points and marks gaps', () => {
    const g = a.pieces.find((p) => p.kind === 'gun');
    expect(g.track.map((s) => s[0])).toEqual([0.5, 1.5, 2, 2.5]);
    expect(g.track[1].slice(5, 7)).toEqual([0, 1]);          // shell, rammed
    expect(g.track[2]).toEqual([2, null]);
    const c = a.pieces.find((p) => p.kind === 'caisson');
    expect(c.name).toBe('Caisson, A');                        // quoted name survives
    expect(c.track.map((s) => s[7])).toEqual([10, 9]);
  });

  it('looks up state and impacts at a playback time', () => {
    const g = a.pieces.find((p) => p.kind === 'gun');
    expect(pieceAt(g, 0.2)).toBeNull();                       // before it appears
    expect(pieceAt(g, 1.2)[1]).toBe(10);                      // held from 0.5
    expect(pieceAt(g, 2.2)).toBeNull();                       // gone
    expect(pieceAt(g, 9)[1]).toBe(30);
    expect(impactsInWindow(a, 2.0, 1).map((i) => i[0])).toEqual([1.7]);
    expect(impactsInWindow(a, 3.0, 5).map((i) => i[0])).toEqual([1.7, 2.6]);
    expect(impactsInWindow(a, 1.0, 5)).toEqual([]);
  });
});
