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
