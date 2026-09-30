import { describe, it, expect } from 'vitest';
import {
  parseArtyCsv, looksLikeArtyCsv, pieceAt, impactsInWindow, replayFilenameForArty, impactRadiusM, impactSources,
  flagOwner,
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
    // 25% kill chance in the open, double roll: shell = its 3 m kill radius.
    expect(impactRadiusM(0)).toBe(3);
    expect(impactRadiusM(3)).toBeCloseTo(6.333, 3);
  });

  it('sizes the impact ring for any kill chance, kill radius to reach', () => {
    // 100% is the certain-kill radius; 0% the blast's full reach.
    expect(impactRadiusM(0, 1)).toBe(3);
    expect(impactRadiusM(1, 1)).toBe(2);
    expect(impactRadiusM(0, 0)).toBe(20);
    expect(impactRadiusM(1, 0)).toBe(15);
    // A shell can't beat 25% past its kill radius, a case 56.25%.
    expect(impactRadiusM(0, 0.5)).toBe(3);
    expect(impactRadiusM(3, 0.5625)).toBe(2);
    // 10%: roll sqrt(0.1) against the per-roll chance.
    expect(impactRadiusM(4, 0.1)).toBeCloseTo(20 - (Math.sqrt(0.1) / 0.5) * 17, 6);
    expect(impactRadiusM(2, 2)).toBe(3);    // clamped
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

describe('impactSources', () => {
  // Gun_1 at (0,100) facing +x: rammed with a shell at 0.5 s, fired by 1.0 s.
  // Gun_2 at (0,300) facing +x, rammed with case, never fires.
  const csv = [
    HEADER,
    '0.5,20:00:00,gun,Gun_1,10pdr,0.00,100.00,50.00,1.000,0.000,shell,1,,,',
    '0.5,20:00:00,gun,Gun_2,10pdr,0.00,300.00,50.00,1.000,0.000,case,1,,,',
    '1.0,20:00:00,gun,Gun_1,10pdr,0.00,100.00,50.00,1.000,0.000,,0,,,',
    '1.0,20:00:00,gun,Gun_2,10pdr,0.00,300.00,50.00,1.000,0.000,case,1,,,',
    '3.0,20:00:00,impact,,,600.00,110.00,50.00,,,OrdnanceShell,,,,',   // down Gun_1's bore
    '3.5,20:00:00,impact,,,600.00,110.00,50.00,,,OrdnanceShell,,,,',   // second burst: fire already used
    '4.0,20:00:00,impact,,,600.00,300.00,50.00,,,OrdnanceCase,,,,',    // Gun_2 never fired
  ].join('\r\n');
  it('credits an impact to the gun that fired it, once', () => {
    const src = impactSources(parseArtyCsv(csv));
    expect(src[0]).toEqual({ x: 0, y: 100 });
    expect(src[1]).toBeNull();
    expect(src[2]).toBeNull();
  });
});

describe('dropped flags', () => {
  // A flag row appears only while the colours lie on the ground.
  const flag = (t, x) =>
    `${t},20:00:00,flag,usa_infantry_114th_pennsylvania (Co. B),,${x},3619.20,68.00,,,,,,,`;
  const csv = [
    HEADER,
    gun(0.5, 10, 1, 0, '', 0), flag(0.5, 1181.4),
    gun(1.0, 10, 1, 0, '', 0), flag(1.0, 1181.4),
    gun(1.5, 10, 1, 0, '', 0),                                  // picked up
  ].join('\r\n');

  it('tracks a dropped flag as a piece until it is picked up', () => {
    const f = parseArtyCsv(csv).pieces.find((p) => p.kind === 'droppedFlag');
    expect(f.name).toBe('usa_infantry_114th_pennsylvania (Co. B)');
    expect(pieceAt(f, 0.7).slice(1, 3)).toEqual([1181.4, 3619.2]);
    expect(pieceAt(f, 1.6)).toBeNull();
  });

  it('sees a pickup on an area with no artillery, from the per-sample row', () => {
    const bare = [
      HEADER,
      '0.5,20:00:00,sample,,,,,,,,,,,,', flag(0.5, 1181.4),
      '1.0,20:00:00,sample,,,,,,,,,,,,',                        // picked up
    ].join('\r\n');
    const f = parseArtyCsv(bare).pieces.find((p) => p.kind === 'droppedFlag');
    expect(pieceAt(f, 0.7)).not.toBeNull();
    expect(pieceAt(f, 1.2)).toBeNull();
  });

  it('names the owning company and side', () => {
    expect(flagOwner('usa_infantry_114th_pennsylvania (Co. B)'))
      .toEqual({ team: 1, unit: '114th Pennsylvania, B Company' });
    expect(flagOwner('csa_cavalry_jeffdavis_legion')).toEqual({ team: 2, unit: 'Jeffdavis Legion' });
    expect(flagOwner('usa_infantry_2nd_united states (Co. A)').unit).toBe('2nd United States, A Company');
    // 1776: the era prefix names the side (Patriots team 1, British team 2).
    expect(flagOwner('1776_us_infantry_1st_delaware (Co. A)'))
      .toEqual({ team: 1, unit: '1st Delaware, A Company' });
    expect(flagOwner('1776_uk_infantry_von_bose')).toEqual({ team: 2, unit: 'Von Bose' });
  });
});
