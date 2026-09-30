import { describe, it, expect } from 'vitest';
import { parseReplayCsv, leaderOf, isMounted, LEADER_KIND, BRANCH } from './replayParser.js';
import { REPLAY_CSV } from '../__fixtures__/synthetic.js';

// A recorder from 2026-09-28 on: cavalry branch + a trailing `mounted` column.
const MOUNTED_CSV = `map,Antietam
mode,Skirmish
sample_rate_hz,2.0
samples,2

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company,mounted
0.0,14:00:00,Rider,1,1620,2600,10,1,0,cav,4,officer,tx01,0,1
0.5,14:00:00,Rider,1,1626,2601,10,1,0,cav,4,officer,tx01,0,0
`;

describe('parseReplayCsv: branch + mounted', () => {
  it('reads cavalry and packs mounted beside the leader kind', () => {
    const r = parseReplayCsv(MOUNTED_CSV);
    expect(r.players[0].branch).toBe(BRANCH.CAVALRY);
    const [f0, f1] = [r.tracks.lk[0], r.tracks.lk[1]];
    expect(leaderOf(f0)).toBe(LEADER_KIND.OFFICER);
    expect(isMounted(f0)).toBe(true);
    expect(leaderOf(f1)).toBe(LEADER_KIND.OFFICER);
    expect(isMounted(f1)).toBe(false);
  });

  it('leaves older replays (no mounted column) unmounted and unchanged', () => {
    const r = parseReplayCsv(REPLAY_CSV);
    for (const v of r.tracks.lk) {
      expect(isMounted(v)).toBe(false);
      expect(leaderOf(v)).toBe(v);
    }
  });
});

// Shapes from a real 2026-09-28 South Mountain round: a CSA gunner who swapped
// to USA infantry and back, and a USA private who changed company.
const SWAP_CSV = `map,SouthMountain
sample_rate_hz,2.0
samples,4

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company
0.0,14:00:00,Bubba,2,100,100,10,1,0,arty,0,none,1028540630,0
0.0,14:00:00,Toenail,1,200,200,10,1,0,inf,0,none,2635207086,1
0.5,14:00:00,Bubba,1,300,300,10,1,0,inf,0,none,3600547528,0
0.5,14:00:00,Toenail,1,201,200,10,1,0,inf,0,none,2635207086,1
1.0,14:00:01,Toenail,1,202,200,10,1,0,inf,0,none,2635207086,0
1.5,14:00:01,Bubba,2,110,100,10,1,0,arty,0,none,1028540630,0
1.5,14:00:01,Toenail,1,203,200,10,1,0,inf,0,none,2635207086,0
`;

describe('parseReplayCsv: mid-round side / company changes', () => {
  const r = parseReplayCsv(SWAP_CSV);
  const stints = (name) => r.players.map((p, i) => ({ ...p, i })).filter((p) => p.name === name);

  it('splits a player into one entry per team / regiment / company stint', () => {
    const b = stints('Bubba');
    expect(b.map((p) => [p.team, p.branch])).toEqual([[2, BRANCH.ARTILLERY], [1, BRANCH.INFANTRY]]);
    const t = stints('Toenail');
    expect(t.map((p) => p.company)).toEqual([1, 0]);
  });

  it('puts each frame under the stint the player was in, and rejoins the old one', () => {
    const [csa, usa] = stints('Bubba');
    const at = (p, f) => r.tracks.x[f * r.playerCount + p.i];
    expect([0, 1, 2, 3].map((f) => at(csa, f))).toEqual([100, NaN, NaN, 110]);  // back on CSA at 1.5 s
    expect([0, 1, 2, 3].map((f) => at(usa, f))).toEqual([NaN, 300, NaN, NaN]);
    expect([csa.firstFrame, csa.lastFrame, usa.firstFrame, usa.lastFrame]).toEqual([0, 3, 1, 1]);
  });
});

// A recorder from 2026-09-30 on: every sample opens with a bare row (empty
// name, team 0, at 0,0,0), so the frame exists even while nobody is alive.
// The rows are the recorder's own, verbatim.
const FRAME_ROW_CSV = `map,Antietam
sample_rate_hz,2.0
samples,2

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company,mounted
0.0,14:00:00,,0,0.00,0.00,0.00,0.0000,0.0000,?,0,none,0,0,0
0.0,14:00:00,Solo,1,100,100,10,1,0,inf,0,none,tx01,0,0
0.5,14:00:00,,0,0.00,0.00,0.00,0.0000,0.0000,?,0,none,0,0,0
1.0,14:00:01,,0,0.00,0.00,0.00,0.0000,0.0000,?,0,none,0,0,0
1.0,14:00:01,Solo,1,110,100,10,1,0,inf,0,none,tx01,0,0
1.5,14:00:01,,0,0.00,0.00,0.00,0.0000,0.0000,?,0,none,0,0,0
`;

describe('parseReplayCsv: bare frame rows', () => {
  it('keeps every frame but never makes the bare row a player', () => {
    const r = parseReplayCsv(FRAME_ROW_CSV);
    expect(Array.from(r.frameTimes)).toEqual([0, 0.5, 1, 1.5]);
    expect(r.players.map((p) => p.name)).toEqual(['Solo']);
    expect(Array.from(r.tracks.x)).toEqual([100, NaN, 110, NaN]);
    expect([r.players[0].firstFrame, r.players[0].lastFrame]).toEqual([0, 2]);
  });
});
