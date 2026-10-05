import { describe, it, expect } from 'vitest';
import { parseScoreboard } from './parseScoreboard';

const META_AND_PLAYERS = `round_start_time,16:59:43
round_end_time,17:39:19
map,DrillCamp
mode,Skirmish
area,Flemming's Meadow
winner,CSA
pop_now,166
pop_round_start,161
pop_round_peak,166
pop_round_max,187
pop_round_end,166
morale_usa,FinalPush
morale_csa,Breaking
casualties_usa,179
casualties_csa,111
casualties_usa_in_form,70
casualties_usa_skirm,57
casualties_usa_oob,52
casualties_csa_in_form,60
casualties_csa_skirm,32
casualties_csa_oob,19
deaths_usa_minie,54
deaths_usa_melee,57
deaths_csa_minie,19
deaths_csa_melee,45

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
pashaBiceps,2,3,0,3.00,0,0,0,76561198955655763
BASEDWOR,1,0,0,0.00,0,0,0,76561198430474911
`;

describe('parseScoreboard — meta', () => {
  it('parses round identity fields from the meta section', () => {
    const sb = parseScoreboard(META_AND_PLAYERS, 'scoreboard_20260527_173919.csv');
    expect(sb.meta.map).toBe('DrillCamp');
    expect(sb.meta.mode).toBe('Skirmish');
    expect(sb.meta.area).toBe("Flemming's Meadow");
    expect(sb.meta.winner).toBe('CSA');
    expect(sb.meta.roundStartTime).toBe('16:59:43');
    expect(sb.meta.roundEndTime).toBe('17:39:19');
  });

  it('parses population and morale', () => {
    const sb = parseScoreboard(META_AND_PLAYERS, 'x.csv');
    expect(sb.meta.popRoundStart).toBe(161);
    expect(sb.meta.popRoundPeak).toBe(166);
    expect(sb.meta.popRoundEnd).toBe(166);
    expect(sb.meta.moraleUsa).toBe('FinalPush');
    expect(sb.meta.moraleCsa).toBe('Breaking');
  });

  it('parses casualties by team and stance', () => {
    const sb = parseScoreboard(META_AND_PLAYERS, 'x.csv');
    expect(sb.meta.casualties.USA).toEqual({ total: 179, inForm: 70, skirm: 57, oob: 52 });
    expect(sb.meta.casualties.CSA).toEqual({ total: 111, inForm: 60, skirm: 32, oob: 19 });
  });

  it('parses deaths-by-weapon per team', () => {
    const sb = parseScoreboard(META_AND_PLAYERS, 'x.csv');
    expect(sb.meta.deathsByWeapon.USA.minie).toBe(54);
    expect(sb.meta.deathsByWeapon.USA.melee).toBe(57);
    expect(sb.meta.deathsByWeapon.CSA.minie).toBe(19);
  });
});

const FULL = `round_start_time,16:59:43
round_end_time,17:39:19
map,DrillCamp
mode,Skirmish
area,Flemming's Meadow
winner,CSA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
pashaBiceps,2,3,1,3.00,1,0,0,76561198955655763
"Smith, John",1,5,2,2.50,2,0,0,76561198430474911

officer,team,commanded,battery
[20thGA]Pvt. Han,1,31,0
{PBR}Kernel Jewish Banker,2,9,1

team,regiment,company,name,class,rank,steam_id
USA,Battery A,A Company,[TTT] obamasus32,Officer,Colonel,76561199633316620
CSA,Unenlisted,,DDRMAN,,,76561199340766227

time,killer,killer_steam_id,killer_team,victim,victim_steam_id,victim_team,victim_formation,cause,cat,sub
17:29:11,Mr Fister,76561199368740246,2,SB-[51stNY]Vol.vanreiswick,76561198416690509,1,oob,Melee,0,2

time,player,steam_id,event
17:29:13,Godchilla,76561197978895735,joined
17:29:15,SB-[51stNY]Vol.vanreiswick,76561198416690509,left
`;

describe('parseScoreboard — players', () => {
  it('parses player rows with team normalization and string steam IDs', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.players).toHaveLength(2);
    const p = sb.players[0];
    expect(p).toEqual({
      name: 'pashaBiceps',
      team: 'CSA',
      kills: 3,
      deaths: 1,
      kd: 3,
      deathsInForm: 1,
      deathsSkirm: 0,
      deathsOob: 0,
      steamId: '76561198955655763',
    });
  });

  it('keeps steam IDs as exact strings (no float corruption)', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.players[0].steamId).toBe('76561198955655763');
    expect(typeof sb.players[0].steamId).toBe('string');
  });

  it('handles quoted names containing commas', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.players[1].name).toBe('Smith, John');
    expect(sb.players[1].team).toBe('USA');
  });
});

describe('parseScoreboard — officers', () => {
  it('parses officers with battery flag as boolean', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.officers).toHaveLength(2);
    expect(sb.officers[0]).toEqual({
      name: '[20thGA]Pvt. Han',
      team: 'USA',
      commanded: 31,
      battery: false,
    });
    expect(sb.officers[1].battery).toBe(true);
    expect(sb.officers[1].team).toBe('CSA');
  });
});

describe('parseScoreboard — roster', () => {
  it('parses roster entries with text teams and nullable fields', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.roster).toHaveLength(2);
    expect(sb.roster[0]).toEqual({
      team: 'USA',
      regiment: 'Battery A',
      company: 'A Company',
      name: '[TTT] obamasus32',
      className: 'Officer',
      rank: 'Colonel',
      steamId: '76561199633316620',
    });
    expect(sb.roster[1].company).toBeNull();
    expect(sb.roster[1].rank).toBeNull();
  });
});

describe('parseScoreboard — killfeed', () => {
  it('parses kills with team normalization and formation', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.kills).toHaveLength(1);
    expect(sb.kills[0]).toEqual({
      tsInRound: '17:29:11',
      killer: 'Mr Fister',
      killerSteamId: '76561199368740246',
      killerTeam: 'CSA',
      victim: 'SB-[51stNY]Vol.vanreiswick',
      victimSteamId: '76561198416690509',
      victimTeam: 'USA',
      victimFormation: 'oob',
      cause: 'Melee',
      cat: 0,
      sub: 2,
    });
  });
});

describe('parseScoreboard — join/leave', () => {
  it('parses join and leave events', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.joinLeaves).toHaveLength(2);
    expect(sb.joinLeaves[0]).toEqual({
      tsInRound: '17:29:13',
      name: 'Godchilla',
      steamId: '76561197978895735',
      action: 'joined',
    });
    expect(sb.joinLeaves[1].action).toBe('left');
  });
});

// Newer overlay builds (July 2026) reshaped three sections: the command log
// carries each officer's posting, branch and stint window (one row per stint,
// `battery` replaced by `branch`), the roster gained time-served columns, and a
// seventh "service log" section lists one row per posting a player held. The
// service log repeats the roster's leading `team,regiment` columns, so the two
// are told apart by the service log's `start`/`end` cells.
const NEW_FORMAT = `round_start_time,21:06:35
round_end_time,21:44:35
round_duration_s,2279
map,Antietam
mode,Skirmish
area,Roulette Lane
era,ACW
winner,CSA
morale_usa,Breaking
morale_csa,LastStand
defending_team,CSA
final_push_time,146
tickets_usa,122
tickets_csa,122
tickets_left_usa,31
tickets_left_csa,0

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id,level
Frosty,1,4,2,2.00,1,1,0,76561199085016851,56
Ferg,1,1,3,0.33,2,1,0,76561198881020357,

officer,team,regiment,company,branch,rank,commanded,commanded_avg,start,end,duration_s,pct_round,steam_id
Frosty,1,Graham's Battery,A Company,Artillery,Major,14,11,21:16:14,21:35:45,1170,51,76561199085016851
Nuke,1,14th Indiana,B Company,Infantry,Lt. Colonel,45,36,21:06:40,21:44:35,2274,100,76561198062666289

team,regiment,company,name,class,rank,duration_s,pct_round,steam_id
USA,Graham's Battery,A Company,Frosty,Officer,Major,1928,85,76561199085016851
USA,Graham's Battery,A Company,Ferg,NCO,Sergeant Major,1957,86,76561198881020357
USA,Unenlisted,,Drifter,,,,,76561197964860269

team,regiment,company,name,class,rank,start,end,duration_s,pct_round,steam_id
USA,Graham's Battery,A Company,Ferg,NCO,Sergeant Major,21:06:39,21:35:34,1735,76,76561198881020357
USA,14th Indiana,B Company,Ferg,Private,,21:35:40,21:44:35,535,23,76561198881020357
USA,Graham's Battery,A Company,Frosty,Officer,Major,21:06:39,21:35:45,1746,77,76561199085016851

time,killer,killer_steam_id,killer_team,victim,victim_steam_id,victim_team,victim_formation,cause,cat,sub
21:07:19,,,0,Frosty,76561199085016851,1,skirm,Env,5,0

time,player,steam_id,event
21:07:00,Ferg,76561198881020357,joined
`;

describe('parseScoreboard — new format sections', () => {
  it('keeps the roster section when a service log follows it', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    // One row per player as they ENDED the round — including the Unenlisted,
    // who never hold a posting and so have no service-log rows at all.
    expect(sb.roster).toHaveLength(3);
    expect(sb.roster.map((r) => r.name)).toEqual(['Frosty', 'Ferg', 'Drifter']);
  });

  it('parses the service log as one row per posting held', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    expect(sb.service).toHaveLength(3);
    const ferg = sb.service!.filter((s) => s.name === 'Ferg');
    expect(ferg).toHaveLength(2);
    expect(ferg.map((s) => s.regiment)).toEqual(["Graham's Battery", '14th Indiana']);
    expect(ferg[0]).toEqual({
      team: 'USA',
      regiment: "Graham's Battery",
      company: 'A Company',
      name: 'Ferg',
      className: 'NCO',
      rank: 'Sergeant Major',
      start: '21:06:39',
      end: '21:35:34',
      durationS: 1735,
      pctRound: 76,
      steamId: '76561198881020357',
    });
  });

  it('derives the battery flag from the command log branch column', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    expect(sb.officers[0].battery).toBe(true); // Artillery
    expect(sb.officers[1].battery).toBe(false); // Infantry
  });

  it('parses the command log posting and stint window', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    expect(sb.officers[0]).toEqual({
      name: 'Frosty',
      team: 'USA',
      commanded: 14,
      battery: true,
      regiment: "Graham's Battery",
      company: 'A Company',
      branch: 'Artillery',
      rank: 'Major',
      commandedAvg: 11,
      start: '21:16:14',
      end: '21:35:45',
      durationS: 1170,
      pctRound: 51,
      steamId: '76561199085016851',
    });
  });

  it('parses roster time-served columns', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    expect(sb.roster[0].durationS).toBe(1928);
    expect(sb.roster[0].pctRound).toBe(85);
    // Unenlisted players have no unit to have served in — blank, not zero.
    expect(sb.roster[2].durationS).toBeNull();
    expect(sb.roster[2].pctRound).toBeNull();
  });

  it('parses round_duration_s from the meta block', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    expect(sb.meta.roundDurationS).toBe(2279);
  });

  it('parses the round setup and tickets left (October 2026 build)', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    expect(sb.meta).toMatchObject({
      defendingTeam: 'CSA', finalPushTime: 146, ticketsUsa: 122, ticketsCsa: 122, ticketsLeftUsa: 31, ticketsLeftCsa: 0,
    });
  });

  it('parses each player\'s level, blank as null', () => {
    const sb = parseScoreboard(NEW_FORMAT, 'x.csv');
    expect(sb.players.map((p) => p.level)).toEqual([56, null]);
  });

  it('reads a mode without the setup as nulls', () => {
    const conquest = NEW_FORMAT.replace('defending_team,CSA', 'defending_team,').replace('final_push_time,146', 'final_push_time,');
    const sb = parseScoreboard(conquest, 'x.csv');
    expect(sb.meta.defendingTeam).toBeNull();
    expect(sb.meta.finalPushTime).toBeNull();
    expect(sb.meta.ticketsUsa).toBe(122);
  });
});

describe('parseScoreboard — older scoreboards', () => {
  it('has no round setup or player levels', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.meta.defendingTeam).toBeNull();
    expect(sb.meta.ticketsLeftUsa).toBeNull();
    expect(sb.players[0].level).toBeUndefined();
  });

  it('falls back to the battery column when there is no branch column', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.officers[0].battery).toBe(false);
    expect(sb.officers[1].battery).toBe(true);
  });

  it('reports an empty service log and no round_duration_s', () => {
    const sb = parseScoreboard(FULL, 'x.csv');
    expect(sb.service).toEqual([]);
    expect(sb.meta.roundDurationS).toBeNull();
  });
});

describe('parseScoreboard — recordedAt', () => {
  it('derives an ISO timestamp from the filename', () => {
    const sb = parseScoreboard(FULL, 'scoreboard_20260527_173919.csv');
    // 2026-05-27 17:39:19 local — assert the date/time components are present.
    expect(sb.recordedAt).toMatch(/^2026-05-27T17:39:19/);
  });

  it('returns null recordedAt for an unrecognized filename', () => {
    const sb = parseScoreboard(FULL, 'not-a-scoreboard.csv');
    expect(sb.recordedAt).toBeNull();
  });
});
