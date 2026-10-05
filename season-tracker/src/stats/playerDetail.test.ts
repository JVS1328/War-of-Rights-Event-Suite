import { describe, it, expect } from 'vitest';
import { parseScoreboard } from './parseScoreboard';
import { computePlayerDetail } from './statsEngine';

const R1 = `map,DrillCamp
mode,Skirmish
winner,CSA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[51stNY]Joe,2,3,1,3.00,1,0,0,76561198000000001
[20thGA]Han,1,1,2,0.50,1,1,0,76561198000000002

time,killer,killer_steam_id,killer_team,victim,victim_steam_id,victim_team,victim_formation,cause,cat,sub
16:10:00,[51stNY]Joe,76561198000000001,2,[20thGA]Han,76561198000000002,1,in_form,Minie,0,4
16:11:00,[51stNY]Joe,76561198000000001,2,[20thGA]Han,76561198000000002,1,skirm,Melee,0,2
`;

const R2 = `map,Antietam
mode,Skirmish
winner,USA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[51stNY]Joe,2,2,1,2.00,1,0,0,76561198000000001

time,killer,killer_steam_id,killer_team,victim,victim_steam_id,victim_team,victim_formation,cause,cat,sub
17:05:00,[51stNY]Joe,76561198000000001,2,someone,76561198000000099,1,oob,Minie,0,4
`;

const boards = [
  parseScoreboard(R1, 'scoreboard_20260101_120000.csv'),
  parseScoreboard(R2, 'scoreboard_20260101_130000.csv'),
];

describe('computePlayerDetail', () => {
  it('aggregates totals and per-round rows for a player by steam id', () => {
    const d = computePlayerDetail(boards, '76561198000000001', {});
    expect(d).not.toBeNull();
    expect(d!.name).toBe('[51stNY]Joe');
    expect(d!.regiment).toBe('51STNY');
    expect(d!.kills).toBe(5);
    expect(d!.deaths).toBe(2);
    expect(d!.rounds).toBe(2);
    expect(d!.perRound).toHaveLength(2);
  });

  it('counts kills by cause from the killfeed', () => {
    const d = computePlayerDetail(boards, '76561198000000001', {});
    expect(d!.killsByCause).toEqual({ Minie: 2, Melee: 1 });
  });

  it('returns null for an unknown player', () => {
    expect(computePlayerDetail(boards, 'nobody', {})).toBeNull();
  });

  it('breaks each round down by cause (killed with / died to)', () => {
    // Joe: DrillCamp → Minie + Melee kills; Antietam → one Minie kill; never a victim.
    const joe = computePlayerDetail(boards, '76561198000000001', {})!;
    const drill = joe.perRound.find((r) => r.map === 'DrillCamp')!;
    const antietam = joe.perRound.find((r) => r.map === 'Antietam')!;
    expect(drill.killsByCause).toEqual({ Minie: 1, Melee: 1 });
    expect(drill.deathsByCause).toEqual({});
    expect(antietam.killsByCause).toEqual({ Minie: 1 });
    expect(antietam.deathsByCause).toEqual({});

    // Han only appears in DrillCamp, where he died to a Minie and a Melee.
    const han = computePlayerDetail(boards, '76561198000000002', {})!;
    const hanDrill = han.perRound.find((r) => r.map === 'DrillCamp')!;
    expect(hanDrill.deathsByCause).toEqual({ Minie: 1, Melee: 1 });
    expect(hanDrill.killsByCause).toEqual({});
  });
});

// Same steam id, three different in-game names across three rounds.
const A1 = `map,DrillCamp
mode,Skirmish
winner,CSA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[51stNY]OldName,2,1,0,1.00,0,0,0,76561198000000010
`;
const A2 = `map,Antietam
mode,Skirmish
winner,USA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[51stNY]MidName,2,1,0,1.00,0,0,0,76561198000000010
`;
const A3 = `map,Hagerstown
mode,Skirmish
winner,USA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[51stNY]NewName,2,1,0,1.00,0,0,0,76561198000000010
`;
const aliasBoards = [
  parseScoreboard(A1, 'scoreboard_20260101_120000.csv'),
  parseScoreboard(A2, 'scoreboard_20260101_130000.csv'),
  parseScoreboard(A3, 'scoreboard_20260101_140000.csv'),
];

// A round that carries a roster section, so per-round role fields populate.
const WITH_ROSTER = `map,DrillCamp
mode,Skirmish
winner,CSA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[51stNY]Joe,2,3,1,3.00,1,0,0,76561198000000001

team,regiment,company,name,class,rank,steam_id
CSA,51stNY,A,[51stNY]Joe,Rifleman,Sgt,76561198000000001

time,killer,killer_steam_id,killer_team,victim,victim_steam_id,victim_team,victim_formation,cause,cat,sub
16:10:00,[51stNY]Joe,76561198000000001,2,[20thGA]Han,76561198000000002,1,in_form,Minie,0,4
`;

describe('computePlayerDetail — per-round role', () => {
  it('captures in-game role (regiment/company/rank/class) per round from the roster', () => {
    const sbs = [parseScoreboard(WITH_ROSTER, 'scoreboard_20260101_120000.csv')];
    const d = computePlayerDetail(sbs, '76561198000000001', {})!;
    const r = d.perRound[0];
    expect(r.regiment).toBe('51stNY');
    expect(r.company).toBe('A');
    expect(r.className).toBe('Rifleman');
    expect(r.rank).toBe('Sgt');
    expect(r.battery).toBe(false);
  });

  it('flags a battery (artillery) round from the roster regiment', () => {
    const arty = `map,DrillCamp
mode,Skirmish
winner,CSA

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id
[Bty]Gun,2,1,0,1.00,0,0,0,76561198000000050

team,regiment,company,name,class,rank,steam_id
CSA,1st Battery,A,[Bty]Gun,Cannoneer,Cpl,76561198000000050
`;
    const d = computePlayerDetail([parseScoreboard(arty, 'scoreboard_20260101_120000.csv')], '76561198000000050', {})!;
    expect(d.perRound[0].battery).toBe(true);
    expect(d.isArtillery).toBe(true);
  });

  it('records whether the player\'s side took each round', () => {
    // Joe plays team 2 (CSA) in R1, which CSA won, and team 2 in R2, which USA
    // won — so one win and one loss, in that order.
    const d = computePlayerDetail(boards, '76561198000000001', {})!;
    const byMap = Object.fromEntries(d.perRound.map((r) => [r.map, r.won]));
    expect(byMap['DrillCamp']).toBe(true);
    expect(byMap['Antietam']).toBe(false);
  });

  it('leaves won null on a round with no recorded winner', () => {
    const drawn = parseScoreboard(
      R1.replace('winner,CSA', 'winner,'),
      'scoreboard_20260102_120000.csv',
    );
    const d = computePlayerDetail([drawn], '76561198000000001', {})!;
    expect(d.perRound[0].won).toBeNull();
  });

  it('leaves per-round role fields null when the player has no roster entry', () => {
    const d = computePlayerDetail(boards, '76561198000000001', {})!;
    const r = d.perRound[0];
    expect(r.regiment).toBeNull();
    expect(r.rank).toBeNull();
    expect(r.className).toBeNull();
    expect(r.battery).toBe(false);
  });
});

describe('computePlayerDetail — aliases', () => {
  it('uses the newest name as primary and lists prior names most-recent first', () => {
    const d = computePlayerDetail(aliasBoards, '76561198000000010', {})!;
    expect(d.name).toBe('[51stNY]NewName');
    expect(d.aliases).toEqual(['[51stNY]MidName', '[51stNY]OldName']);
  });

  it('excludes the current name and dedupes repeats', () => {
    const d = computePlayerDetail(boards, '76561198000000001', {})!;
    // [51stNY]Joe in both rounds — no other names → no aliases.
    expect(d.aliases).toEqual([]);
  });
});

describe('computePlayerDetail — level', () => {
  const HEAD = 'name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id,level';
  const round = (level: string) => `map,DrillCamp\nmode,Skirmish\nwinner,CSA\n\n${HEAD}\nJoe,2,1,0,1.00,0,0,0,76561198000000077,${level}\n`;

  it('takes the level from the newest round that recorded one, in any file order', () => {
    const sbs = [
      parseScoreboard(round('57'), 'scoreboard_20260103_120000.csv'),   // newest with a level
      parseScoreboard(round(''), 'scoreboard_20260104_120000.csv'),     // newer, but blank
      parseScoreboard(round('55'), 'scoreboard_20260101_120000.csv'),
    ];
    expect(computePlayerDetail(sbs, '76561198000000077', {})!.level).toBe(57);
  });

  it('has none when no round recorded one', () => {
    expect(computePlayerDetail(boards, '76561198000000001', {})!.level).toBeNull();
  });
});
