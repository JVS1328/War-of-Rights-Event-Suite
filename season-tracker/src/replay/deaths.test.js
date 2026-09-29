import { describe, it, expect } from 'vitest';
import { parseReplayCsv } from './replayParser.js';
import { computeDeaths, deathsAt, withKills, downAt } from './deaths.js';

// Alice (USA officer) dies after 1.0 s and respawns at 2.5 s; Bob swaps to
// CSA at 1.5 s (a new stint, not a death) and then leaves for good.
const CSV = `map,SouthMountain
sample_rate_hz,2.0
samples,6

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company
0.0,14:00:00,Alice,1,100,100,10,1,0,inf,6,officer,1,0
0.0,14:00:00,Bob,1,200,200,10,1,0,inf,0,none,1,0
0.5,14:00:00,Alice,1,101,100,10,1,0,inf,6,officer,1,0
0.5,14:00:00,Bob,1,201,200,10,1,0,inf,0,none,1,0
1.0,14:00:01,Alice,1,102,100,10,1,0,inf,6,officer,1,0
1.0,14:00:01,Bob,1,202,200,10,1,0,inf,0,none,1,0
1.5,14:00:01,Bob,2,300,300,10,1,0,inf,0,none,2,0
2.0,14:00:02,Bob,2,301,300,10,1,0,inf,0,none,2,0
2.5,14:00:02,Alice,1,50,50,10,1,0,inf,6,officer,1,0
`;

describe('computeDeaths', () => {
  const replay = parseReplayCsv(CSV);
  const deaths = computeDeaths(replay);

  it('marks a disappearance at the last seen spot, until the respawn', () => {
    const a = deaths.find((d) => d.x === 102);
    expect(a).toMatchObject({ t: 1.5, until: 2.5, y: 100, team: 1, officer: true });
    expect(replay.players[a.player]).toMatchObject({ name: 'Alice', team: 1 });
  });

  it('does not count a side swap as a death; a final leave never ends', () => {
    const b = deaths.filter((d) => d.x >= 200);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ t: 2.5, until: Infinity, x: 301, team: 2, officer: false });
    expect(replay.players[b[0].player]).toMatchObject({ name: 'Bob', team: 2 });
  });

  it('shows markers while down and fading, or for good with no fade', () => {
    expect(deathsAt(deaths, 1.0, 30)).toEqual([]);
    const mid = deathsAt(deaths, 2.0, 2);
    expect(mid).toHaveLength(1);
    expect(mid[0].alpha).toBeCloseTo(0.75, 6);                // 0.5 s into a 2 s fade
    expect(deathsAt(deaths, 2.5, 30).map((m) => m.d.x)).toEqual([301]);  // Alice is back
    expect(deathsAt(deaths, 100, 30)).toEqual([]);           // faded
    expect(deathsAt(deaths, 100, Infinity).map((m) => m.d.x)).toEqual([102, 301]);  // respawn keeps it
    expect(deathsAt(deaths, 100, Infinity).map((m) => m.alpha)).toEqual([1, 1]);
  });
});

describe('withKills / downAt', () => {
  const deaths = computeDeaths(parseReplayCsv(CSV));
  const events = [
    { ts: 0.5, victim: 'Alice', killer: 'Early' },           // too far before
    { ts: 1.0, victim: ' alice ', killer: 'Carl', cause: 'Minie', victimFormation: 'skirm' },
    { ts: 1.4, victim: 'Dave', killer: 'Carl' },             // someone else
  ];
  const withK = withKills(deaths, { ts: Float32Array.from(events.map((e) => e.ts)), events });

  it('matches each death to its victim\'s nearest kill, or none', () => {
    expect(withK.find((d) => d.name === 'Alice').kill).toBe(events[1]);
    expect(withK.find((d) => d.name === 'Bob').kill).toBeNull();
  });

  it('finds the death a player is down from, only while down', () => {
    expect(downAt(withK, 'Alice', 1.0)).toBeNull();
    expect(downAt(withK, 'Alice', 2.0)).toMatchObject({ x: 102 });
    expect(downAt(withK, 'Alice', 2.5)).toBeNull();
    expect(downAt(withK, 'Bob', 9)).toMatchObject({ x: 301 });
  });
});
