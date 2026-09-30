import { describe, it, expect } from 'vitest';
import { parseReplayCsv } from './replayParser.js';
import { fillTimeline } from './timeline.js';
import { computeDeaths } from './deaths.js';

// A quiet round: Alice is the only one on the field. She spawns 10 s in, dies
// at ~11 s (no frames while she is down), respawns at 20 s and dies again at
// ~21 s, the last thing recorded; the round runs to 30 s.
const CSV = `map,SouthMountain
sample_rate_hz,2.0
samples,6

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company
10.0,14:00:10,Alice,1,100,100,10,1,0,inf,0,none,1,0
10.5,14:00:10,Alice,1,101,100,10,1,0,inf,0,none,1,0
11.0,14:00:11,Alice,1,102,100,10,1,0,inf,0,none,1,0
20.0,14:00:20,Alice,1,50,50,10,1,0,inf,0,flag,1,0
20.5,14:00:20,Alice,1,51,50,10,1,0,inf,0,flag,1,0
21.0,14:00:21,Alice,1,52,50,10,1,0,inf,0,flag,1,0
`;

describe('fillTimeline', () => {
  const recorded = parseReplayCsv(CSV);

  it('the recording alone hides both deaths', () => {
    expect(computeDeaths(recorded)).toHaveLength(0);
  });

  it('fills the round from 0 to its end at the sample rate', () => {
    const r = fillTimeline(recorded, 30);
    expect(r.frameTimes[0]).toBe(0);
    expect(r.frameTimes[r.frameCount - 1]).toBeCloseTo(30);
    for (let f = 1; f < r.frameCount; f++) {
      expect(r.frameTimes[f] - r.frameTimes[f - 1]).toBeCloseTo(0.5);
    }
    expect(r.frameCount).toBe(61);
    // Positions carried to their new frames; empty frames sample nobody.
    expect(r.tracks.x[r.players[0].firstFrame]).toBe(100);
    expect(r.frameTimes[r.players[0].firstFrame]).toBe(10);
    expect(r.frameTimes[r.players[0].lastFrame]).toBe(21);
    expect(Number.isNaN(r.tracks.x[r.frameCount - 1])).toBe(true);
  });

  it('then shows both deaths where she fell', () => {
    const deaths = computeDeaths(fillTimeline(recorded, 30));
    expect(deaths).toHaveLength(2);
    expect(deaths[0]).toMatchObject({ t: 11.5, until: 20, x: 102 });
    expect(deaths[1]).toMatchObject({ t: 21.5, until: Infinity, x: 52 });
  });

  it('leaves an unbroken recording alone', () => {
    const lines = CSV.trim().split('\n');
    const full = parseReplayCsv([...lines.slice(0, 5), '0.0,14:00:00,Alice,1,99,100,10,1,0,inf,0,none,1,0',
      '0.5,14:00:00,Alice,1,99,100,10,1,0,inf,0,none,1,0'].join('\n'));
    expect(fillTimeline(full, null)).toBe(full);
    expect(fillTimeline(full, 0.5)).toBe(full);
  });
});
