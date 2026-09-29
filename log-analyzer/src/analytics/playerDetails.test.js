import { describe, it, expect } from 'vitest';
import { parseReplayCsv } from '../utils/replayParser';
import { parseScoreboardCsv } from '../scoreboard/parseScoreboard';
import {
  buildPlayerDirectory, roleLabel, steamProfileUrl, shortCompany, groupEntriesByRegiment,
} from './playerDirectory';
import { countNearby } from './proximity';

// A replay whose player names match the scoreboard roster below.
const REPLAY_CSV = `map,Antietam
mode,Skirmish
area,The Cornfield
winner,1
round_started_at,14:00:00
sample_rate_hz,2.0
samples,1

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company
0.0,14:00:00,[1stTX]Colonel_Alice,1,1620,2600,10,1,0,inf,0,officer,tx01,0
0.0,14:00:00,[1stTX]Bob,1,1610,2560,10,1,0,inf,1,none,tx01,0
0.0,14:00:00,[2ndMS]Carol,2,1500,2620,10,-1,0,inf,0,flag,ms02,0
`;

// A full scoreboard with player steam_ids, an officer section (which the roster
// scan must skip), a roster section, and a kill log carrying steam ids.
const SCOREBOARD_CSV = `round_start_time,14:00:00
round_end_time,14:00:03
map,Antietam
mode,Skirmish
winner,1
casualties_usa,1
casualties_csa,1

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[1stTX]Colonel_Alice,1,1,0,0.00,0,0,0,76561199633316620
[1stTX]Bob,1,0,1,0.00,1,0,0,76561198430474911
[2ndMS]Carol,2,1,1,1.00,0,1,0,76561198955655763

officer,team,commanded,battery
[1stTX]Colonel_Alice,1,20,0

team,regiment,company,name,class,rank,steam_id
USA,1st Texas Infantry,A Company,[1stTX]Colonel_Alice,Officer,Colonel,76561199633316620
USA,1st Texas Infantry,B Company,[1stTX]Bob,Rifleman,Private,76561198430474911
CSA,Unenlisted,,[2ndMS]Carol,,,76561198955655763

time,killer,killer_steam_id,killer_team,victim,victim_steam_id,victim_team,victim_formation,cause
14:00:01,[2ndMS]Carol,76561198955655763,2,[1stTX]Bob,76561198430474911,1,in_form,Minie
14:00:02,[1stTX]Colonel_Alice,76561199633316620,1,[2ndMS]Carol,76561198955655763,2,skirm,Rifle
`;

describe('parseScoreboardCsv — roster + steam ids', () => {
  const sb = parseScoreboardCsv(SCOREBOARD_CSV);

  it('parses steam ids on player rows as strings (no float corruption)', () => {
    const alice = sb.players.find(p => p.name === '[1stTX]Colonel_Alice');
    expect(alice.steamId).toBe('76561199633316620');
    expect(typeof alice.steamId).toBe('string');
  });

  it('parses the roster section, skipping the officer section', () => {
    expect(sb.roster).toHaveLength(3);
    expect(sb.roster[0]).toEqual({
      name: '[1stTX]Colonel_Alice',
      team: 'USA',
      regiment: '1st Texas Infantry',
      company: 'A Company',
      className: 'Officer',
      rank: 'Colonel',
      steamId: '76561199633316620',
    });
  });

  it('nulls empty roster cells (Unenlisted has no company/class/rank)', () => {
    const carol = sb.roster.find(r => r.name === '[2ndMS]Carol');
    expect(carol.regiment).toBe('Unenlisted');
    expect(carol.company).toBeNull();
    expect(carol.className).toBeNull();
    expect(carol.rank).toBeNull();
  });

  it('carries killer/victim steam ids into the kills array', () => {
    expect(sb.kills[0]).toMatchObject({
      victim: '[1stTX]Bob',
      victimSteamId: '76561198430474911',
      killer: '[2ndMS]Carol',
      killerSteamId: '76561198955655763',
    });
  });
});

describe('parseScoreboardCsv — roster-less scoreboard', () => {
  it('returns an empty roster when no roster section is present', () => {
    const noRoster = `round_start_time,14:00:00

name,team,kills,deaths
[1stTX]Bob,1,0,1
`;
    const sb = parseScoreboardCsv(noRoster);
    expect(sb.roster).toEqual([]);
    expect(sb.players).toHaveLength(1);
  });
});

describe('buildPlayerDirectory', () => {
  const replay = parseReplayCsv(REPLAY_CSV);
  const sb = parseScoreboardCsv(SCOREBOARD_CSV);

  it('joins replay players to roster regiment/company/role/steamId by name', () => {
    const { details, hasRoster, hasSteam } = buildPlayerDirectory(replay, sb);
    expect(hasRoster).toBe(true);
    expect(hasSteam).toBe(true);

    const alice = details[0];
    expect(alice.regiment).toBe('1st Texas Infantry');
    expect(alice.company).toBe('A Company');
    expect(alice.role).toBe('Officer · Colonel');
    expect(alice.steamId).toBe('76561199633316620');
    // Grouping uses the in-game regiment when present.
    expect(alice.groupRegiment).toBe('1st Texas Infantry');
    // The community name-tag regiment is always resolved too.
    expect(alice.tagRegiment).toBe('1STTX');
  });

  it('carries company splits (Alice A / Bob B share a regiment)', () => {
    const { details } = buildPlayerDirectory(replay, sb);
    expect(details[0].company).toBe('A Company');
    expect(details[1].company).toBe('B Company');
    expect(details[0].regiment).toBe(details[1].regiment);
  });

  it('falls back to the name-tag regiment when there is no scoreboard', () => {
    const { details, hasRoster, hasSteam } = buildPlayerDirectory(replay, null);
    expect(hasRoster).toBe(false);
    expect(hasSteam).toBe(false);
    expect(details[0].regiment).toBeNull();
    expect(details[0].steamId).toBeNull();
    expect(details[0].groupRegiment).toBe('1STTX');
    expect(details[2].groupRegiment).toBe('2NDMS');
  });
});

describe('roleLabel + steamProfileUrl', () => {
  it('joins class and rank, tolerating missing pieces', () => {
    expect(roleLabel('Officer', 'Colonel')).toBe('Officer · Colonel');
    expect(roleLabel('Rifleman', null)).toBe('Rifleman');
    expect(roleLabel(null, null)).toBeNull();
  });

  it('builds a steam profile url and null-guards', () => {
    expect(steamProfileUrl('76561199633316620')).toBe('https://steamcommunity.com/profiles/76561199633316620');
    expect(steamProfileUrl(null)).toBeNull();
  });
});

describe('shortCompany', () => {
  it('strips a trailing company suffix', () => {
    expect(shortCompany('A Company')).toBe('A');
    expect(shortCompany('B Coy')).toBe('B');
    expect(shortCompany('1st Platoon')).toBe('1st Platoon');
    expect(shortCompany(null)).toBeNull();
  });
});

describe('groupEntriesByRegiment', () => {
  const replay = parseReplayCsv(REPLAY_CSV);
  const sb = parseScoreboardCsv(SCOREBOARD_CSV);

  it('groups entries by regiment with company splits and UNTAGGED last', () => {
    const { details } = buildPlayerDirectory(replay, sb);
    // USA team entries: Alice (idx 0) and Bob (idx 1).
    const entries = [
      { index: 0, name: '[1stTX]Colonel_Alice' },
      { index: 1, name: '[1stTX]Bob' },
    ];
    const groups = groupEntriesByRegiment(entries, details);
    expect(groups).toHaveLength(1);
    expect(groups[0].regiment).toBe('1st Texas Infantry');
    expect(groups[0].count).toBe(2);
    // Company split: A×1, B×1.
    expect(groups[0].companies).toEqual([
      { company: 'A Company', count: 1 },
      { company: 'B Company', count: 1 },
    ]);
  });
});

describe('countNearby', () => {
  // 4 players in a line on the x axis (meters): p0,p1,p3 team 1; p2 team 2.
  // p3 is not sampled this frame (NaN) → treated as absent.
  const replay = {
    playerCount: 4,
    frameCount: 1,
    players: [{ team: 1 }, { team: 1 }, { team: 2 }, { team: 1 }],
    tracks: {
      x: Float32Array.from([0, 3, 4, NaN]),
      y: Float32Array.from([0, 0, 0, NaN]),
    },
  };

  it('includes the center player and only same-team members by default', () => {
    // 5 yd ≈ 4.57 m: p1 (3 m) and p2 (4 m) are both in range, but p2 is enemy.
    expect(countNearby(replay, 0, 0, 5)).toBe(2); // p0 + p1
  });

  it('counts all teams when sameTeamOnly is false', () => {
    expect(countNearby(replay, 0, 0, 5, { sameTeamOnly: false })).toBe(3); // p0 + p1 + p2
  });

  it('excludes players outside the radius', () => {
    // 3.5 yd ≈ 3.2 m: p1 (3 m) is in, p2 (4 m) is out.
    expect(countNearby(replay, 0, 0, 3.5, { sameTeamOnly: false })).toBe(2);
  });

  it('returns 0 when the center player is not present this frame', () => {
    expect(countNearby(replay, 0, 3, 100)).toBe(0);
  });
});

describe('buildPlayerDirectory: in-game regiment without a scoreboard', () => {
  // regiment_crc values from a real 2026-09-28 South Mountain replay.
  const CSV = `map,SouthMountain
sample_rate_hz,2.0
samples,1

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company
0.0,14:00:00,[1stCIR]VPvt.Fan,1,2103,1134,10,1,0,inf,0,none,2635207086,0
0.0,14:00:00,Chad Sky,2,1965,1186,10,1,0,inf,0,none,1937582154,0
0.0,14:00:00,Nobody,2,1960,1161,10,1,0,inf,0,none,12345,0
`;
  it('resolves regiment_crc through the overlay unit table', () => {
    const { details } = buildPlayerDirectory(parseReplayCsv(CSV), null);
    expect(details[0].regiment).toBe('23rd Ohio');            // not the [1stCIR] name tag
    expect(details[0].groupRegiment).toBe('23rd Ohio');
    expect(details[1].regiment).toBe('5th North Carolina');
    expect(details[2].regiment).toBeNull();                   // unknown crc: tag / untagged
  });
});

describe('groupEntriesByRegiment: by tag vs in-game regiment', () => {
  const CSV = `map,SouthMountain
sample_rate_hz,2.0
samples,1

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company
0.0,14:00:00,[1stCIR]VPvt.Fan,1,2103,1134,10,1,0,inf,0,none,2635207086,0
0.0,14:00:00,[1stCIR]Capt.Grant,1,2100,1130,10,1,0,inf,0,none,2635207086,0
0.0,14:00:00,Pubber,1,2090,1120,10,1,0,inf,0,none,2635207086,0
`;
  const replay = parseReplayCsv(CSV);
  const { details } = buildPlayerDirectory(replay, null);
  const entries = replay.players.map((p, index) => ({ ...p, index }));
  it('REGT puts everyone in their in-game regiment', () => {
    const g = groupEntriesByRegiment(entries, details, 'regiment');
    expect(g.map((x) => [x.regiment, x.count])).toEqual([['23rd Ohio', 3]]);
  });
  it('TAGS splits by the name tag instead', () => {
    const g = groupEntriesByRegiment(entries, details, 'tag');
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.count === 2).entries.map((e) => e.name))
      .toEqual(['[1stCIR]VPvt.Fan', '[1stCIR]Capt.Grant']);
  });
});
