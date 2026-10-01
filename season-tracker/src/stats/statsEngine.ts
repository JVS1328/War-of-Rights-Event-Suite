import type {
  Branch,
  RosterEntry,
  Scoreboard,
  ScoreboardOfficer,
  ScoreboardPlayer,
  Team,
  TeamCasualties,
} from './types';
import type { RegimentAssignmentMap } from './StatsRepository';
import { extractRegimentTag, matchPlayerToRegimentList } from './regimentMatcher';
import type { RegimentListEntry } from './regimentMatcher';
import { avgTicketCost, perPlayerRate, ticketDamage, pctShare, TICKET_WEIGHT } from './labels';
import { mapAttacker, canonicalMapName } from './mapCatalog';
import { averageMorale } from './morale';
import { branchOf } from './branch';

export interface FormationCounts {
  in_form: number;
  skirm: number;
  oob: number;
}

export interface PlayerStatRow {
  /** Identity key: steamId when present, else the name. */
  key: string;
  steamId: string | null;
  name: string;
  regiment: string;
  team: Team;
  rounds: number;
  kills: number;
  deaths: number;
  kd: number;
  deathsInForm: number;
  deathsSkirm: number;
  deathsOob: number;
  killsInForm: number;
  killsSkirm: number;
  killsOob: number;
  /** Avg ticket cost per death (×Td); null when no stance deaths. */
  avgTd: number | null;
  /** Avg ticket value per kill (×Tk); null when no killfeed kills. */
  avgTk: number | null;
  /**
   * The in-game regiment on their most recent round, and the arm of service it
   * implies. Distinct from `regiment`, which is the league unit they were
   * resolved to — a player can be pinned to a unit and still be sat in a
   * battery, and only the in-game name says which.
   */
  inGameRegiment: string | null;
  branch: Branch;
}

export type PlayerType = 'all' | 'inf' | 'cav' | 'arty';

/** Filter value -> the arm of service it keeps. */
const TYPE_BRANCH: Record<Exclude<PlayerType, 'all'>, Branch> = {
  inf: 'Infantry',
  cav: 'Cavalry',
  arty: 'Artillery',
};

export interface EngineOptions {
  regimentList?: RegimentListEntry[];
  /**
   * Restrict player-round aggregation by arm of service, read off the in-game
   * regiment the roster recorded for that round. 'all' (default) counts every
   * round; inf + cav + arty reconcile to all.
   *
   * 'inf' excludes cavalry. Before branchOf existed the only question asked was
   * "is this a battery?", so mounted rounds counted as infantry.
   */
  type?: PlayerType;
  /**
   * Event-level regiment label remap (rename/merge). Applied as the final step
   * of regiment resolution: a resolved label is replaced by aliasMap[label],
   * followed transitively, so merged regiments roll into their target.
   */
  aliasMap?: Record<string, string>;
  /**
   * Per-scoreboard alias selection for the season-scoped Overall view: given a
   * scoreboard, return the rename/merge map to apply to its rows. When set it
   * takes precedence over {@link aliasMap}, letting each round resolve under its
   * own season's scope so a unit renamed/split in one season keeps its own
   * identity in the others. Omit it (the default) for a single flat map.
   */
  aliasMapFor?: (sb: Scoreboard) => Record<string, string> | undefined;
  /**
   * Per-scoreboard steam-id assignment (pin) selection, mirroring
   * {@link aliasMapFor}: given a scoreboard, return the pins to apply to its
   * rows. When set it takes precedence over the flat `assignments` argument, so
   * a player pinned to one regiment in some seasons and another later resolves
   * correctly per round. Omit it (the default) to use the flat `assignments`.
   */
  assignmentsFor?: (sb: Scoreboard) => RegimentAssignmentMap | undefined;
}

/**
 * Resolve a regiment label through the rename/merge alias map. Follows chains
 * (A→B→C) and stops deterministically on a cycle.
 */
export function applyAlias(label: string, aliasMap?: Record<string, string>): string {
  if (!aliasMap) return label;
  let cur = label;
  const seen = new Set<string>();
  while (aliasMap[cur] != null && !seen.has(cur)) {
    seen.add(cur);
    cur = aliasMap[cur];
  }
  return cur;
}

/**
 * Fold an extra rename/merge layer over an options object's alias map(s), for
 * previewing labels rolled together without touching the stored (season /
 * Overall) alias state. The layer wins over the base map, and because
 * {@link applyAlias} follows chains, a base label that already renames into one
 * of the layer's keys lands on the layer's target too. The inputs are left
 * untouched — nothing here is persisted.
 */
export function withAliasLayer(options: EngineOptions, layer: Record<string, string>): EngineOptions {
  if (Object.keys(layer).length === 0) return options;
  const base = options.aliasMapFor;
  return {
    ...options,
    aliasMap: { ...(options.aliasMap ?? {}), ...layer },
    // `resolveRow` prefers `aliasMapFor` whenever it's set, so keep it unset
    // when the caller had none and let the flat `aliasMap` above carry the layer.
    aliasMapFor: base ? (sb: Scoreboard) => ({ ...(base(sb) ?? {}), ...layer }) : undefined,
  };
}

function kdOf(kills: number, deaths: number): number {
  return deaths > 0 ? kills / deaths : kills;
}

function emptyCasualties(): TeamCasualties {
  return { total: 0, inForm: 0, skirm: 0, oob: 0 };
}

/**
 * Resolve a regiment for one player: explicit assignment → list → name tag,
 * then through the rename/merge alias map.
 */
export function resolveFor(
  steamId: string | null,
  name: string,
  assignments: RegimentAssignmentMap,
  list?: RegimentListEntry[],
  aliasMap?: Record<string, string>,
): string {
  let base: string;
  if (steamId && assignments[steamId]) base = assignments[steamId];
  else {
    const m = list && list.length ? matchPlayerToRegimentList(name, list) : null;
    base = m ?? extractRegimentTag(name);
  }
  return applyAlias(base, aliasMap);
}

/**
 * Resolve a regiment for one player-round, honoring the per-scoreboard alias map
 * (season-scoped Overall view) when provided, else the flat `aliasMap`. Every
 * regiment resolution inside a scoreboard loop goes through here so per-season
 * renames/merges apply to the correct rounds.
 */
function resolveRow(
  sb: Scoreboard,
  steamId: string | null,
  name: string,
  assignments: RegimentAssignmentMap,
  options: EngineOptions,
): string {
  const asg = options.assignmentsFor ? options.assignmentsFor(sb) ?? assignments : assignments;
  const aliasMap = options.aliasMapFor ? options.aliasMapFor(sb) : options.aliasMap;
  return resolveFor(steamId, name, asg, options.regimentList, aliasMap);
}

/** Find a player's roster entry within a scoreboard (steam id, else name+team). */
function findRoster(sb: Scoreboard, steamId: string | null, name: string, team: Team): RosterEntry | undefined {
  if (steamId) {
    const byId = sb.roster.find((r) => r.steamId === steamId);
    if (byId) return byId;
  }
  const lower = name.toLowerCase();
  return sb.roster.find((r) => r.team === team && r.name.toLowerCase() === lower);
}


/** Parse "HH:MM:SS" → seconds since midnight, or null. */
function timeToSeconds(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function roundDurationSeconds(sb: Scoreboard): number | null {
  const start = timeToSeconds(sb.meta.roundStartTime);
  const end = timeToSeconds(sb.meta.roundEndTime);
  if (start == null || end == null) return null;
  let d = end - start;
  if (d < 0) d += 86400; // crossed midnight
  return d;
}

/** killfeed kills bucketed by victim formation for one player in one scoreboard. */
function killFormInRound(sb: Scoreboard, key: string): FormationCounts {
  const f: FormationCounts = { in_form: 0, skirm: 0, oob: 0 };
  for (const k of sb.kills) {
    if ((k.killerSteamId ?? k.killer) === key && k.victimFormation) f[k.victimFormation] += 1;
  }
  return f;
}

/** A zeroed player row keyed by steam id (or name when the player is anonymous). */
function emptyPlayerRow(key: string, steamId: string | null, name: string, team: Team): PlayerStatRow {
  return {
    key,
    steamId,
    name,
    regiment: '',
    inGameRegiment: null,
    branch: 'Infantry',
    team,
    rounds: 0,
    kills: 0,
    deaths: 0,
    kd: 0,
    deathsInForm: 0,
    deathsSkirm: 0,
    deathsOob: 0,
    killsInForm: 0,
    killsSkirm: 0,
    killsOob: 0,
    avgTd: null,
    avgTk: null,
  };
}

/** Fold one player-round (roster totals + killfeed formations) into a running row. */
function addPlayerRound(row: PlayerStatRow, sb: Scoreboard, p: ScoreboardPlayer, key: string): void {
  row.name = p.name;
  row.team = p.team;
  row.rounds += 1;
  row.kills += p.kills;
  row.deaths += p.deaths;
  row.deathsInForm += p.deathsInForm;
  row.deathsSkirm += p.deathsSkirm;
  row.deathsOob += p.deathsOob;
  // Kills-by-formation only from this (role-matching) round.
  const kf = killFormInRound(sb, key);
  row.killsInForm += kf.in_form;
  row.killsSkirm += kf.skirm;
  row.killsOob += kf.oob;
}

/** Fill derived fields (k/d, avg ticket costs) on a fully-accumulated player row. */
function finalizePlayerRow(row: PlayerStatRow): void {
  row.kd = kdOf(row.kills, row.deaths);
  row.avgTd = avgTicketCost(row.deathsInForm, row.deathsSkirm, row.deathsOob);
  row.avgTk = avgTicketCost(row.killsInForm, row.killsSkirm, row.killsOob);
}

/** Arm-of-service filter for one player-round. */
function roundMatchesType(sb: Scoreboard, p: ScoreboardPlayer, type: PlayerType): boolean {
  if (type === 'all') return true;
  const entry = findRoster(sb, p.steamId, p.name, p.team);
  return branchOf(entry?.regiment) === TYPE_BRANCH[type];
}

/** Per-player aggregate across the supplied scoreboards. */
export function computePlayerLeaderboard(
  scoreboards: Scoreboard[],
  assignments: RegimentAssignmentMap,
  options: EngineOptions = {},
): PlayerStatRow[] {
  const type: PlayerType = options.type ?? 'all';
  const acc = new Map<string, PlayerStatRow>();
  // The scoreboard of each player's most recent round, so their single displayed
  // regiment resolves under the latest season's scope (Overall, option B).
  const latest = new Map<string, Scoreboard>();

  for (const sb of scoreboards) {
    for (const p of sb.players) {
      if (!roundMatchesType(sb, p, type)) continue;

      const key = p.steamId ?? p.name;
      const prevLatest = latest.get(key);
      if (!prevLatest || (sb.recordedAt ?? '') >= (prevLatest.recordedAt ?? '')) latest.set(key, sb);
      let row = acc.get(key);
      if (!row) {
        row = emptyPlayerRow(key, p.steamId, p.name, p.team);
        acc.set(key, row);
      }
      addPlayerRound(row, sb, p, key);
    }
  }

  const rows = [...acc.values()];
  for (const r of rows) {
    const sb = latest.get(r.key)!;
    r.regiment = resolveRow(sb, r.steamId, r.name, assignments, options);
    r.inGameRegiment = findRoster(sb, r.steamId, r.name, r.team)?.regiment ?? null;
    r.branch = branchOf(r.inGameRegiment);
    finalizePlayerRow(r);
  }
  rows.sort((a, b) => b.kills - a.kills);
  return rows;
}

// ── Officers ──────────────────────────────────────────────────────────────

export interface OfficerStatRow {
  key: string;
  name: string;
  team: Team;
  battery: boolean;
  rounds: number;
  commanded: number;
  unitKills: number;
  unitDeaths: number;
  unitKd: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
}

/** One officer's whole round, folded out of the command log's per-stint rows. */
interface OfficerRound {
  key: string;
  name: string;
  team: Team;
  battery: boolean;
  /** Peak subordinates across every stint they held this round. */
  commanded: number;
  /** Their command-log rows, in the order the slots were taken. */
  stints: ScoreboardOfficer[];
}

/**
 * Fold the command log into one entry per officer per round.
 *
 * Newer scoreboards emit one row per STINT — a contiguous stretch holding one
 * company's officer slot — so an officer who was replaced and later retook the
 * slot, or who commanded two companies, appears several times in a single round.
 * Counting those rows directly inflates `rounds`, sums peak-command figures that
 * were never concurrent, and double-counts subordinates.
 *
 * Keyed by name + branch, matching the leaderboard's own identity, so an officer
 * who spent part of the round on a battery still splits into separate infantry
 * and artillery careers.
 */
function collapseOfficerStints(officers: ScoreboardOfficer[]): OfficerRound[] {
  const byKey = new Map<string, OfficerRound>();
  for (const off of officers) {
    const key = `${off.name}::${off.battery ? 1 : 0}`;
    let r = byKey.get(key);
    if (!r) {
      r = {
        key,
        name: off.name,
        team: off.team,
        battery: off.battery,
        commanded: 0,
        stints: [],
      };
      byKey.set(key, r);
    }
    r.commanded = Math.max(r.commanded, off.commanded);
    r.stints.push(off);
  }
  return [...byKey.values()];
}

/**
 * Every distinct unit an officer commanded this round. Newer scoreboards name the
 * posting on each command-log row; older ones only named the officer, so fall
 * back to whatever unit the roster has them in. Each posting carries its own
 * team — officers do swap sides mid-round, and their subordinates have to be
 * looked up on the side that posting was served for.
 */
function officerUnits(
  sb: Scoreboard,
  off: OfficerRound,
): { team: Team; regiment: string; company: string }[] {
  const out: { team: Team; regiment: string; company: string }[] = [];
  const seen = new Set<string>();
  const add = (team: Team, regiment: string | null | undefined, company: string | null | undefined) => {
    if (!regiment || !company) return;
    const k = `${team} ${regiment} ${company}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ team, regiment, company });
  };
  for (const s of off.stints) add(s.team, s.regiment, s.company);
  if (out.length === 0) {
    const lead = findRoster(sb, null, off.name, off.team);
    add(off.team, lead?.regiment, lead?.company);
  }
  return out;
}

export function computeOfficerLeaderboard(
  scoreboards: Scoreboard[],
  _assignments: RegimentAssignmentMap,
): OfficerStatRow[] {
  const acc = new Map<string, OfficerStatRow>();

  for (const sb of scoreboards) {
    const playerKD = (steamId: string | null, name: string, team: Team) => {
      const p = sb.players.find((x) =>
        steamId ? x.steamId === steamId : x.team === team && x.name.toLowerCase() === name.toLowerCase(),
      );
      return p ? { kills: p.kills, deaths: p.deaths } : { kills: 0, deaths: 0 };
    };

    for (const off of collapseOfficerStints(sb.officers)) {
      const key = off.key;
      let row = acc.get(key);
      if (!row) {
        row = {
          key,
          name: off.name,
          team: off.team,
          battery: off.battery,
          rounds: 0,
          commanded: 0,
          unitKills: 0,
          unitDeaths: 0,
          unitKd: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winrate: 0,
        };
        acc.set(key, row);
      }
      row.rounds += 1;
      row.commanded += off.commanded;

      // Unit members from the roster (same team + regiment + company), unioned
      // over every unit commanded and deduped, so a man who served under this
      // officer in two stints of the same company still counts once.
      const counted = new Set<string>();
      let unitKills = 0;
      let unitDeaths = 0;
      for (const unit of officerUnits(sb, off)) {
        const members = sb.roster.filter(
          (r) => r.team === unit.team && r.regiment === unit.regiment && r.company === unit.company,
        );
        for (const m of members) {
          const id = m.steamId ?? `${m.team} ${m.name.toLowerCase()}`;
          if (counted.has(id)) continue;
          counted.add(id);
          const kd = playerKD(m.steamId, m.name, m.team);
          unitKills += kd.kills;
          unitDeaths += kd.deaths;
        }
      }
      if (counted.size === 0) {
        const kd = playerKD(null, off.name, off.team); // fallback: own row
        unitKills += kd.kills;
        unitDeaths += kd.deaths;
      }
      row.unitKills += unitKills;
      row.unitDeaths += unitDeaths;

      if (sb.meta.winner === off.team) row.wins += 1;
      else if (sb.meta.winner) row.losses += 1;
      else row.draws += 1;
    }
  }

  const rows = [...acc.values()];
  for (const r of rows) {
    r.unitKd = kdOf(r.unitKills, r.unitDeaths);
    const decided = r.wins + r.losses;
    r.winrate = decided > 0 ? r.wins / decided : 0;
  }
  rows.sort((a, b) => b.unitKills - a.unitKills);
  return rows;
}

// ── Rounds, overview, maps ──────────────────────────────────────────────────

export interface RoundSummary {
  sourceFilename: string;
  recordedAt: string | null;
  map: string;
  mode: string;
  area: string | null;
  winner: Team | null;
  durationSeconds: number | null;
  players: number;
  usaKills: number;
  csaKills: number;
  usaCasualties: number;
  csaCasualties: number;
  popPeak: number | null;
}

export function computeRounds(scoreboards: Scoreboard[]): RoundSummary[] {
  const rounds = scoreboards.map((sb): RoundSummary => {
    let usaKills = 0;
    let csaKills = 0;
    for (const p of sb.players) {
      if (p.team === 'USA') usaKills += p.kills;
      else csaKills += p.kills;
    }
    return {
      sourceFilename: sb.sourceFilename,
      recordedAt: sb.recordedAt,
      map: sb.meta.map,
      mode: sb.meta.mode,
      area: sb.meta.area,
      winner: sb.meta.winner,
      durationSeconds: roundDurationSeconds(sb),
      players: sb.players.length,
      usaKills,
      csaKills,
      usaCasualties: sb.meta.casualties.USA.total,
      csaCasualties: sb.meta.casualties.CSA.total,
      popPeak: sb.meta.popRoundPeak ?? sb.meta.popRoundMax,
    };
  });
  rounds.sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));
  return rounds;
}

export interface Overview {
  totalRounds: number;
  usaWins: number;
  csaWins: number;
  draws: number;
  usaKills: number;
  csaKills: number;
  totalKills: number;
  usaCasualties: number;
  csaCasualties: number;
  distinctPlayers: number;
  distinctRegiments: number;
  /** Mean of per-round peak population across rounds that reported it. */
  avgPeakPop: number | null;
}

export function computeOverview(
  scoreboards: Scoreboard[],
  assignments: RegimentAssignmentMap = {},
  options: EngineOptions = {},
): Overview {
  let usaWins = 0;
  let csaWins = 0;
  let draws = 0;
  let usaKills = 0;
  let csaKills = 0;
  let usaCasualties = 0;
  let csaCasualties = 0;
  let peakPopTotal = 0;
  let peakPopCount = 0;
  const players = new Set<string>();

  for (const sb of scoreboards) {
    if (sb.meta.winner === 'USA') usaWins += 1;
    else if (sb.meta.winner === 'CSA') csaWins += 1;
    else draws += 1;
    for (const p of sb.players) {
      players.add(p.steamId ?? p.name);
      if (p.team === 'USA') usaKills += p.kills;
      else csaKills += p.kills;
    }
    usaCasualties += sb.meta.casualties.USA.total;
    csaCasualties += sb.meta.casualties.CSA.total;
    const pk = sb.meta.popRoundPeak ?? sb.meta.popRoundMax;
    if (pk != null) {
      peakPopTotal += pk;
      peakPopCount += 1;
    }
  }

  // Distinct regiments = labels resolved per round, so a unit that existed only
  // in an earlier season (Overall, option B) still counts even if all its
  // players later moved to other regiments.
  const regiments = new Set<string>();
  for (const sb of scoreboards) {
    for (const p of sb.players) regiments.add(resolveRow(sb, p.steamId, p.name, assignments, options));
  }

  return {
    totalRounds: scoreboards.length,
    usaWins,
    csaWins,
    draws,
    usaKills,
    csaKills,
    totalKills: usaKills + csaKills,
    usaCasualties,
    csaCasualties,
    distinctPlayers: players.size,
    distinctRegiments: regiments.size,
    avgPeakPop: peakPopCount > 0 ? Math.round(peakPopTotal / peakPopCount) : null,
  };
}

export interface TrackerMapEntry {
  plays: number;
  usaWins: number;
  csaWins: number;
  // Rounds with no winner (Conquest/Contention ties).
  draws: number;
  totalCasualties: number;
  usaCasualties: number;
  csaCasualties: number;
  avgLossesUsa: number;
  avgLossesCsa: number;
  avgFormationUsa: FormationCounts;
  avgFormationCsa: FormationCounts;
  hasFormation: boolean;
  attackerWins: number;
  defenderWins: number;
  // False for Conquest/Contention, which have no attacker/defender.
  hasAttacker?: boolean;
  avgMoraleUsa?: string | null;
  avgMoraleCsa?: string | null;
  hasMorale?: boolean;
}

export interface TrackerMapStats {
  overall: {
    totalRounds: number;
    usaWins: number;
    csaWins: number;
    // Rounds with no winner (Conquest/Contention ties).
    draws: number;
    attackerWins: number;
    defenderWins: number;
    // Rounds that have an attacker/defender (excludes Conquest/Contention).
    attackerRounds: number;
    usaCasualties: number;
    csaCasualties: number;
    totalCasualties: number;
    usaFormation: FormationCounts;
    csaFormation: FormationCounts;
    formationTotal: FormationCounts;
    hasFormation: boolean;
  };
  byMap: Record<string, TrackerMapEntry>;
}

export interface MapStatRow {
  map: string;
  rounds: number;
  usaWins: number;
  csaWins: number;
  draws: number;
  usaKills: number;
  csaKills: number;
  usaCasualties: number;
  csaCasualties: number;
  usaFormation: FormationCounts;
  csaFormation: FormationCounts;
  avgDurationSeconds: number | null;
  modes: { mode: string; area: string | null; rounds: number }[];
}

export function computeMapBreakdown(scoreboards: Scoreboard[]): MapStatRow[] {
  const byMap = new Map<string, MapStatRow & { _durTotal: number; _durCount: number; _modes: Map<string, number> }>();
  for (const sb of scoreboards) {
    const map = sb.meta.map || 'Unknown';
    let r = byMap.get(map);
    if (!r) {
      r = {
        map,
        rounds: 0,
        usaWins: 0,
        csaWins: 0,
        draws: 0,
        usaKills: 0,
        csaKills: 0,
        usaCasualties: 0,
        csaCasualties: 0,
        usaFormation: { in_form: 0, skirm: 0, oob: 0 },
        csaFormation: { in_form: 0, skirm: 0, oob: 0 },
        avgDurationSeconds: null,
        modes: [],
        _durTotal: 0,
        _durCount: 0,
        _modes: new Map(),
      };
      byMap.set(map, r);
    }
    r.rounds += 1;
    if (sb.meta.winner === 'USA') r.usaWins += 1;
    else if (sb.meta.winner === 'CSA') r.csaWins += 1;
    else r.draws += 1;
    for (const p of sb.players) {
      if (p.team === 'USA') r.usaKills += p.kills;
      else r.csaKills += p.kills;
    }
    const uc = sb.meta.casualties.USA;
    r.usaCasualties += uc.total;
    r.usaFormation.in_form += uc.inForm;
    r.usaFormation.skirm += uc.skirm;
    r.usaFormation.oob += uc.oob;
    const cc = sb.meta.casualties.CSA;
    r.csaCasualties += cc.total;
    r.csaFormation.in_form += cc.inForm;
    r.csaFormation.skirm += cc.skirm;
    r.csaFormation.oob += cc.oob;
    const dur = roundDurationSeconds(sb);
    if (dur != null) {
      r._durTotal += dur;
      r._durCount += 1;
    }
    const modeKey = `${sb.meta.mode}|${sb.meta.area ?? ''}`;
    r._modes.set(modeKey, (r._modes.get(modeKey) ?? 0) + 1);
  }

  const rows = [...byMap.values()].map((r) => {
    r.avgDurationSeconds = r._durCount > 0 ? Math.round(r._durTotal / r._durCount) : null;
    r.modes = [...r._modes.entries()].map(([k, rounds]) => {
      const [mode, area] = k.split('|');
      return { mode, area: area || null, rounds };
    });
    return r as MapStatRow;
  });
  rows.sort((a, b) => b.rounds - a.rounds);
  return rows;
}

const zeroForm = (): FormationCounts => ({ in_form: 0, skirm: 0, oob: 0 });

/**
 * Map win/loss/casualty stats derived purely from imported scoreboards,
 * projected into the same `{ overall, byMap }` shape the tracker's map view
 * uses so the Maps tab can render either source through one component.
 *
 * Unlike the tracker's map stats — which only cover rounds bound to a week —
 * this counts EVERY imported scoreboard, assigned or not. For a scoreboard that
 * is bound to a week the two sources agree; unbound scoreboards show up here but
 * not in the tracker. Attacker/defender come from the map catalog (null for
 * Conquest/Contention, which are excluded from that split but still count toward
 * win % and casualties); casualty formation makeup and morale come straight from
 * each scoreboard's meta.
 */
export function computeScoreboardMapStats(scoreboards: Scoreboard[]): TrackerMapStats {
  interface Acc {
    plays: number;
    usaWins: number;
    csaWins: number;
    draws: number;
    usaCas: number;
    csaCas: number;
    usaForm: FormationCounts;
    csaForm: FormationCounts;
    usaMorale: (string | null)[];
    csaMorale: (string | null)[];
  }
  const acc = new Map<string, Acc>();
  for (const sb of scoreboards) {
    const map = canonicalMapName(sb.meta.map) || sb.meta.map || 'Unknown';
    let a = acc.get(map);
    if (!a) {
      a = {
        plays: 0, usaWins: 0, csaWins: 0, draws: 0, usaCas: 0, csaCas: 0,
        usaForm: zeroForm(), csaForm: zeroForm(), usaMorale: [], csaMorale: [],
      };
      acc.set(map, a);
    }
    a.plays += 1;
    if (sb.meta.winner === 'USA') a.usaWins += 1;
    else if (sb.meta.winner === 'CSA') a.csaWins += 1;
    else a.draws += 1;
    const uc = sb.meta.casualties.USA;
    const cc = sb.meta.casualties.CSA;
    a.usaCas += uc.total;
    a.csaCas += cc.total;
    a.usaForm.in_form += uc.inForm; a.usaForm.skirm += uc.skirm; a.usaForm.oob += uc.oob;
    a.csaForm.in_form += cc.inForm; a.csaForm.skirm += cc.skirm; a.csaForm.oob += cc.oob;
    a.usaMorale.push(sb.meta.moraleUsa);
    a.csaMorale.push(sb.meta.moraleCsa);
  }

  const addForm = (t: FormationCounts, s: FormationCounts) => {
    t.in_form += s.in_form; t.skirm += s.skirm; t.oob += s.oob;
  };
  const avgForm = (f: FormationCounts, n: number): FormationCounts =>
    n > 0
      ? { in_form: Math.round(f.in_form / n), skirm: Math.round(f.skirm / n), oob: Math.round(f.oob / n) }
      : zeroForm();

  const overall = {
    totalRounds: 0, usaWins: 0, csaWins: 0, draws: 0,
    attackerWins: 0, defenderWins: 0, attackerRounds: 0,
    usaCasualties: 0, csaCasualties: 0, totalCasualties: 0,
    usaFormation: zeroForm(), csaFormation: zeroForm(), formationTotal: zeroForm(),
    hasFormation: false,
  };
  const byMap: Record<string, TrackerMapEntry> = {};

  for (const [map, a] of acc) {
    const attacker = mapAttacker(map); // 'USA' | 'CSA' | null (Conquest/Contention)
    const isUsaAttack = attacker === 'USA';
    const totalCas = a.usaCas + a.csaCas;
    const formTotal: FormationCounts = {
      in_form: a.usaForm.in_form + a.csaForm.in_form,
      skirm: a.usaForm.skirm + a.csaForm.skirm,
      oob: a.usaForm.oob + a.csaForm.oob,
    };
    const hasFormation = formTotal.in_form + formTotal.skirm + formTotal.oob > 0;
    const avgMoraleUsa = averageMorale(a.usaMorale);
    const avgMoraleCsa = averageMorale(a.csaMorale);

    byMap[map] = {
      plays: a.plays,
      usaWins: a.usaWins,
      csaWins: a.csaWins,
      draws: a.draws,
      totalCasualties: totalCas,
      usaCasualties: a.usaCas,
      csaCasualties: a.csaCas,
      avgLossesUsa: a.plays > 0 ? Math.round(a.usaCas / a.plays) : 0,
      avgLossesCsa: a.plays > 0 ? Math.round(a.csaCas / a.plays) : 0,
      avgFormationUsa: avgForm(a.usaForm, a.plays),
      avgFormationCsa: avgForm(a.csaForm, a.plays),
      hasFormation,
      attackerWins: attacker === null ? 0 : isUsaAttack ? a.usaWins : a.csaWins,
      defenderWins: attacker === null ? 0 : isUsaAttack ? a.csaWins : a.usaWins,
      hasAttacker: attacker !== null,
      avgMoraleUsa,
      avgMoraleCsa,
      hasMorale: !!(avgMoraleUsa || avgMoraleCsa),
    };

    overall.totalRounds += a.plays;
    overall.usaWins += a.usaWins;
    overall.csaWins += a.csaWins;
    overall.draws += a.draws;
    overall.usaCasualties += a.usaCas;
    overall.csaCasualties += a.csaCas;
    overall.totalCasualties += totalCas;
    addForm(overall.usaFormation, a.usaForm);
    addForm(overall.csaFormation, a.csaForm);
    addForm(overall.formationTotal, formTotal);
    if (attacker !== null) {
      overall.attackerRounds += a.plays;
      overall.attackerWins += isUsaAttack ? a.usaWins : a.csaWins;
      overall.defenderWins += isUsaAttack ? a.csaWins : a.usaWins;
    }
  }
  overall.hasFormation =
    overall.formationTotal.in_form + overall.formationTotal.skirm + overall.formationTotal.oob > 0;

  return { overall, byMap };
}

// ── Player detail ────────────────────────────────────────────────────────────

export interface PlayerRoundRow {
  sourceFilename: string;
  recordedAt: string | null;
  map: string;
  area: string | null;
  team: Team;
  /** Regiment the player was rostered in this round (raw roster tag), or null. */
  regiment: string | null;
  /** Company within the regiment this round, or null. */
  company: string | null;
  /** In-game class this round (e.g. Rifleman, Skirmisher), or null. */
  className: string | null;
  /** In-game rank this round (e.g. Pvt, Sgt), or null. */
  rank: string | null;
  /** True when this round was played on a battery (artillery). */
  battery: boolean;
  /** Arm of service for this round, from the in-game regiment. */
  branch: Branch;
  kills: number;
  deaths: number;
  deathsInForm: number;
  deathsSkirm: number;
  deathsOob: number;
  killsInForm: number;
  killsSkirm: number;
  killsOob: number;
  avgTd: number | null;
  avgTk: number | null;
  /** Kills this round bucketed by weapon/cause (killfeed) — what the player killed with. */
  killsByCause: Record<string, number>;
  /**
   * Whether the player's side took this round. Null when the round was drawn or
   * no winner was recorded — a draw is not a loss and should not read as one.
   */
  won: boolean | null;
  /** Deaths this round bucketed by weapon/cause (killfeed) — what the player died to. */
  deathsByCause: Record<string, number>;
}

export interface PlayerDetail {
  key: string;
  steamId: string | null;
  name: string;
  /** Other in-game names this player used across rounds, most-recent first. */
  aliases: string[];
  regiment: string;
  isArtillery: boolean;
  rounds: number;
  kills: number;
  deaths: number;
  kd: number;
  deathsInForm: number;
  deathsSkirm: number;
  deathsOob: number;
  killsInForm: number;
  killsSkirm: number;
  killsOob: number;
  avgTd: number | null;
  avgTk: number | null;
  killsByCause: Record<string, number>;
  deathsByCause: Record<string, number>;
  perRound: PlayerRoundRow[];
}

function isSamePlayer(targetKey: string, steamId: string | null, name: string | null): boolean {
  if (steamId && steamId === targetKey) return true;
  return !steamId && name === targetKey;
}

export function computePlayerDetail(
  scoreboards: Scoreboard[],
  key: string,
  assignments: RegimentAssignmentMap,
  options: EngineOptions = {},
): PlayerDetail | null {
  const detail: PlayerDetail = {
    key,
    steamId: null,
    name: '',
    aliases: [],
    regiment: '',
    isArtillery: false,
    rounds: 0,
    kills: 0,
    deaths: 0,
    kd: 0,
    deathsInForm: 0,
    deathsSkirm: 0,
    deathsOob: 0,
    killsInForm: 0,
    killsSkirm: 0,
    killsOob: 0,
    avgTd: null,
    avgTk: null,
    killsByCause: {},
    deathsByCause: {},
    perRound: [],
  };
  const type = options.type ?? 'all';
  let found = false;
  // The player's most recent round, so their regiment resolves under the latest
  // season's scope (Overall, option B).
  let latestSb: Scoreboard | null = null;
  // Names used across rounds, in chronological (oldest→newest) order of appearance.
  const nameOrder: string[] = [];

  for (const sb of scoreboards) {
    const p = sb.players.find((x) => (x.steamId ?? x.name) === key);
    if (!p) continue;
    const rosterEntry = findRoster(sb, p.steamId, p.name, p.team);
    const roundBranch = branchOf(rosterEntry?.regiment);
    const batteryRound = roundBranch === 'Artillery';
    // Same arm filter the leaderboard uses, so the card and the table agree.
    if (type !== 'all' && roundBranch !== TYPE_BRANCH[type]) continue;

    found = true;
    if (!latestSb || (sb.recordedAt ?? '') >= (latestSb.recordedAt ?? '')) latestSb = sb;
    detail.steamId = p.steamId;
    detail.name = p.name;
    nameOrder.push(p.name);
    if (batteryRound) detail.isArtillery = true;
    detail.rounds += 1;
    detail.kills += p.kills;
    detail.deaths += p.deaths;
    detail.deathsInForm += p.deathsInForm;
    detail.deathsSkirm += p.deathsSkirm;
    detail.deathsOob += p.deathsOob;

    // This round's killfeed for the player (causes + kill formations). Causes are
    // tallied both into the running totals and into this round's own buckets so a
    // per-round "killed with / died to" breakdown is available on each round row.
    let kIf = 0;
    let kSk = 0;
    let kOob = 0;
    const roundKillsByCause: Record<string, number> = {};
    const roundDeathsByCause: Record<string, number> = {};
    for (const kill of sb.kills) {
      if (isSamePlayer(key, kill.killerSteamId, kill.killer)) {
        detail.killsByCause[kill.cause] = (detail.killsByCause[kill.cause] ?? 0) + 1;
        roundKillsByCause[kill.cause] = (roundKillsByCause[kill.cause] ?? 0) + 1;
        if (kill.victimFormation === 'in_form') kIf += 1;
        else if (kill.victimFormation === 'skirm') kSk += 1;
        else if (kill.victimFormation === 'oob') kOob += 1;
      }
      if (isSamePlayer(key, kill.victimSteamId, kill.victim)) {
        detail.deathsByCause[kill.cause] = (detail.deathsByCause[kill.cause] ?? 0) + 1;
        roundDeathsByCause[kill.cause] = (roundDeathsByCause[kill.cause] ?? 0) + 1;
      }
    }
    detail.killsInForm += kIf;
    detail.killsSkirm += kSk;
    detail.killsOob += kOob;

    detail.perRound.push({
      sourceFilename: sb.sourceFilename,
      recordedAt: sb.recordedAt,
      map: sb.meta.map,
      area: sb.meta.area,
      team: p.team,
      regiment: rosterEntry?.regiment ?? null,
      company: rosterEntry?.company ?? null,
      className: rosterEntry?.className ?? null,
      rank: rosterEntry?.rank ?? null,
      battery: batteryRound,
      branch: roundBranch,
      kills: p.kills,
      deaths: p.deaths,
      deathsInForm: p.deathsInForm,
      deathsSkirm: p.deathsSkirm,
      deathsOob: p.deathsOob,
      killsInForm: kIf,
      killsSkirm: kSk,
      killsOob: kOob,
      avgTd: avgTicketCost(p.deathsInForm, p.deathsSkirm, p.deathsOob),
      avgTk: avgTicketCost(kIf, kSk, kOob),
      won: sb.meta.winner == null ? null : sb.meta.winner === p.team,
      killsByCause: roundKillsByCause,
      deathsByCause: roundDeathsByCause,
    });
  }

  if (!found) return null;
  // Aliases: distinct prior names (excluding the current/newest one), most-recent first.
  const seenNames = new Set<string>([detail.name]);
  for (let i = nameOrder.length - 1; i >= 0; i--) {
    const n = nameOrder[i];
    if (seenNames.has(n)) continue;
    seenNames.add(n);
    detail.aliases.push(n);
  }
  detail.kd = kdOf(detail.kills, detail.deaths);
  detail.regiment = resolveRow(latestSb!, detail.steamId, detail.name, assignments, options);
  detail.avgTd = avgTicketCost(detail.deathsInForm, detail.deathsSkirm, detail.deathsOob);
  detail.avgTk = avgTicketCost(detail.killsInForm, detail.killsSkirm, detail.killsOob);
  return detail;
}

// ── Regiments ────────────────────────────────────────────────────────────────

export interface RegimentRoundRow {
  sourceFilename: string;
  recordedAt: string | null;
  map: string;
  area: string | null;
  players: number;
  kills: number;
  deaths: number;
  casualtiesByFormation: FormationCounts;
  /** Kills this round bucketed by victim formation (drives per-round ×Tk). */
  killsByFormation: FormationCounts;
  /** Deaths the unit suffered this round, bucketed by weapon/cause (died to). */
  casualtiesByCause: Record<string, number>;
  /** Kills the unit inflicted this round, bucketed by weapon/cause (killed with). */
  killsByCause: Record<string, number>;
  avgTd: number | null;
  avgTk: number | null;
  /** Kills ÷ players fielded this round (size-normalized offense); null if none. */
  killRate: number | null;
  /** Casualties ÷ players fielded this round (size-normalized losses); null if none. */
  lossRate: number | null;
}

export interface RegimentStatRow {
  regiment: string;
  /** Distinct players seen across all rounds. */
  players: number;
  /** Average distinct players fielded per round (sum of per-round head counts ÷ rounds). */
  avgPlayers: number;
  rounds: number;
  kills: number;
  deaths: number;
  kd: number;
  casualtiesByFormation: FormationCounts;
  killsByFormation: FormationCounts;
  avgTd: number | null;
  avgTk: number | null;
  /**
   * Kills ÷ total players fielded (sum of per-round head counts) — the pooled
   * per-round-per-player offensive rate across all rounds; null when unfielded.
   */
  killRate: number | null;
  /**
   * Casualties ÷ total players fielded — the pooled per-round-per-player loss
   * rate across all rounds; null when unfielded.
   */
  lossRate: number | null;
  /** Deaths the regiment suffered, bucketed by weapon/cause (victim resolves here). */
  casualtiesByCause: Record<string, number>;
  /** Kills the regiment inflicted, bucketed by weapon/cause (killer resolves here). */
  killsByCause: Record<string, number>;
  topPlayers: PlayerStatRow[];
  roundFilenames: string[];
  perRound: RegimentRoundRow[];
}

export function computeRegimentBreakdown(
  scoreboards: Scoreboard[],
  assignments: RegimentAssignmentMap,
  options: EngineOptions = {},
): RegimentStatRow[] {
  const type: PlayerType = options.type ?? 'all';

  const byReg = new Map<
    string,
    RegimentStatRow & { _roundSet: Set<string>; _perRound: Map<string, RegimentRoundRow> }
  >();
  const ensure = (regiment: string) => {
    let r = byReg.get(regiment);
    if (!r) {
      r = {
        regiment,
        players: 0,
        avgPlayers: 0,
        rounds: 0,
        kills: 0,
        deaths: 0,
        kd: 0,
        casualtiesByFormation: { in_form: 0, skirm: 0, oob: 0 },
        killsByFormation: { in_form: 0, skirm: 0, oob: 0 },
        avgTd: null,
        avgTk: null,
        killRate: null,
        lossRate: null,
        casualtiesByCause: {},
        killsByCause: {},
        topPlayers: [],
        roundFilenames: [],
        perRound: [],
        _roundSet: new Set<string>(),
        _perRound: new Map<string, RegimentRoundRow>(),
      };
      byReg.set(regiment, r);
    }
    return r;
  };

  // Player aggregates split by the label each player held IN EACH ROUND, so a
  // player whose unit split/merged or who changed regiments between seasons
  // contributes to every regiment they belonged to (Overall, option B). In a
  // single flat view a player holds one label, so this collapses to one row per
  // player — identical to the old per-leaderboard rollup.
  const regPlayers = new Map<string, Map<string, PlayerStatRow>>();
  for (const sb of scoreboards) {
    for (const p of sb.players) {
      if (!roundMatchesType(sb, p, type)) continue;
      const regiment = resolveRow(sb, p.steamId, p.name, assignments, options);
      const key = p.steamId ?? p.name;
      let pmap = regPlayers.get(regiment);
      if (!pmap) {
        pmap = new Map<string, PlayerStatRow>();
        regPlayers.set(regiment, pmap);
      }
      let row = pmap.get(key);
      if (!row) {
        row = emptyPlayerRow(key, p.steamId, p.name, p.team);
        row.regiment = regiment;
        pmap.set(key, row);
      }
      addPlayerRound(row, sb, p, key);
    }
  }
  for (const [regiment, pmap] of regPlayers) {
    const r = ensure(regiment);
    for (const row of pmap.values()) {
      finalizePlayerRow(row);
      r.players += 1;
      r.kills += row.kills;
      r.deaths += row.deaths;
      r.casualtiesByFormation.in_form += row.deathsInForm;
      r.casualtiesByFormation.skirm += row.deathsSkirm;
      r.casualtiesByFormation.oob += row.deathsOob;
      r.killsByFormation.in_form += row.killsInForm;
      r.killsByFormation.skirm += row.killsSkirm;
      r.killsByFormation.oob += row.killsOob;
      r.topPlayers.push(row);
    }
  }

  // Per-round, per-regiment rollup + rounds + casualties by cause (killfeed).
  for (const sb of scoreboards) {
    for (const p of sb.players) {
      const regiment = resolveRow(sb, p.steamId, p.name, assignments, options);
      const r = ensure(regiment);
      r._roundSet.add(sb.sourceFilename);
      let rr = r._perRound.get(sb.sourceFilename);
      if (!rr) {
        rr = {
          sourceFilename: sb.sourceFilename,
          recordedAt: sb.recordedAt,
          map: sb.meta.map,
          area: sb.meta.area,
          players: 0,
          kills: 0,
          deaths: 0,
          casualtiesByFormation: { in_form: 0, skirm: 0, oob: 0 },
          killsByFormation: { in_form: 0, skirm: 0, oob: 0 },
          casualtiesByCause: {},
          killsByCause: {},
          avgTd: null,
          avgTk: null,
          killRate: null,
          lossRate: null,
        };
        r._perRound.set(sb.sourceFilename, rr);
      }
      rr.players += 1;
      rr.kills += p.kills;
      rr.deaths += p.deaths;
      rr.casualtiesByFormation.in_form += p.deathsInForm;
      rr.casualtiesByFormation.skirm += p.deathsSkirm;
      rr.casualtiesByFormation.oob += p.deathsOob;
      const kf = killFormInRound(sb, p.steamId ?? p.name);
      rr.killsByFormation.in_form += kf.in_form;
      rr.killsByFormation.skirm += kf.skirm;
      rr.killsByFormation.oob += kf.oob;
    }
    for (const kill of sb.kills) {
      const cause = kill.cause || 'Unknown';
      // Suffered: the victim's regiment took this casualty (aggregate + this round).
      const victimReg = resolveRow(sb, kill.victimSteamId, kill.victim, assignments, options);
      const vr = ensure(victimReg);
      vr.casualtiesByCause[cause] = (vr.casualtiesByCause[cause] ?? 0) + 1;
      const vrr = vr._perRound.get(sb.sourceFilename);
      if (vrr) vrr.casualtiesByCause[cause] = (vrr.casualtiesByCause[cause] ?? 0) + 1;
      // Inflicted: the killer's regiment dealt this kill (skip environment deaths).
      if (kill.killer) {
        const killerReg = resolveRow(sb, kill.killerSteamId, kill.killer, assignments, options);
        const kr = ensure(killerReg);
        kr.killsByCause[cause] = (kr.killsByCause[cause] ?? 0) + 1;
        const krr = kr._perRound.get(sb.sourceFilename);
        if (krr) krr.killsByCause[cause] = (krr.killsByCause[cause] ?? 0) + 1;
      }
    }
  }

  const rows = [...byReg.values()].map((r) => {
    r.kd = kdOf(r.kills, r.deaths);
    r.topPlayers.sort((a, b) => b.kills - a.kills);
    r.roundFilenames = [...r._roundSet];
    r.rounds = r._roundSet.size;
    // Average head count per round, weighted only over rounds the regiment fielded.
    const fielded = [...r._perRound.values()].reduce((n, rr) => n + rr.players, 0);
    r.avgPlayers = r.rounds > 0 ? fielded / r.rounds : 0;
    r.avgTd = avgTicketCost(
      r.casualtiesByFormation.in_form,
      r.casualtiesByFormation.skirm,
      r.casualtiesByFormation.oob,
    );
    r.avgTk = avgTicketCost(r.killsByFormation.in_form, r.killsByFormation.skirm, r.killsByFormation.oob);
    // Size-normalized rates: kills / casualties over total players fielded
    // (player-rounds), so a big unit and a small one compare on equal footing.
    r.killRate = perPlayerRate(r.kills, fielded);
    r.lossRate = perPlayerRate(r.deaths, fielded);
    r.perRound = [...r._perRound.values()]
      .map((rr) => {
        rr.avgTd = avgTicketCost(
          rr.casualtiesByFormation.in_form,
          rr.casualtiesByFormation.skirm,
          rr.casualtiesByFormation.oob,
        );
        rr.avgTk = avgTicketCost(rr.killsByFormation.in_form, rr.killsByFormation.skirm, rr.killsByFormation.oob);
        rr.killRate = perPlayerRate(rr.kills, rr.players);
        rr.lossRate = perPlayerRate(rr.deaths, rr.players);
        return rr;
      })
      .sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));
    return r as RegimentStatRow;
  });
  // Drop killfeed-only labels: a name seen only as a killer/victim (never on a
  // roster) produces a row with no players. There are no 0-player regiments.
  const fielded = rows.filter((r) => r.players > 0);
  fielded.sort((a, b) => b.kills - a.kills);
  return fielded;
}

// ── Ticket-damage shares (per-round-averaged) ───────────────────────────────

/**
 * A unit's ticket-damage contribution, expressed as its share of its team's
 * ticket damage each round and averaged across the rounds it played. Ticket
 * damage inflicted is ×Tk-weighted kills (tickets drained from the enemy);
 * received is ×Td-weighted deaths (tickets it cost its own team). Averaging the
 * per-round shares — rather than pooling totals — keeps a unit's typical
 * per-round contribution from being dominated by its highest-population nights.
 */
export interface TicketShare {
  /** Mean per-round share of its team's ticket damage inflicted (sums to 100% across the team); null if it never dealt any. */
  avgPctInflicted: number | null;
  /** Mean per-round share of its team's ticket damage received; null if it never took any. */
  avgPctReceived: number | null;
  /** Mean per-round unit head count. */
  avgUnitPlayers: number;
  /** Mean per-round team head count. */
  avgTeamPlayers: number;
  /** Ticket share restricted to rounds this unit played as USA. */
  asUSA: TicketContextShare;
  /** Ticket share restricted to rounds this unit played as CSA. */
  asCSA: TicketContextShare;
  /** Ticket share restricted to rounds this unit's team attacked. */
  asAttacker: TicketContextShare;
  /** Ticket share restricted to rounds this unit's team defended. */
  asDefender: TicketContextShare;
  /** Per-round (keyed by sourceFilename) figures, for round-level display. */
  perRound: Record<string, TicketRoundShare>;
}

/** A unit's average ticket share within one context slice (faction or role) —
 *  the same figures as {@link TicketShare} minus the per-round detail. `rounds`
 *  is how many rounds the unit spent in this context (0 = it never did). */
export interface TicketContextShare {
  avgPctInflicted: number | null;
  avgPctReceived: number | null;
  avgUnitPlayers: number;
  avgTeamPlayers: number;
  rounds: number;
}

/** One round's ticket figures for a unit: its share of the team's ticket damage
 *  and the roster split it's built from. */
export interface TicketRoundShare {
  pctInflicted: number | null;
  pctReceived: number | null;
  unitPlayers: number;
  teamPlayers: number;
}

/** A running share accumulator — one per entity plus one per context
 *  bucket (faction/role), so every scope averages the same per-round figures. */
interface ShareAcc {
  sumPctInf: number;
  cntInf: number;
  sumPctRec: number;
  cntRec: number;
  sumUnitPlayers: number;
  sumTeamPlayers: number;
  cntRounds: number;
}

function emptyShareAcc(): ShareAcc {
  return { sumPctInf: 0, cntInf: 0, sumPctRec: 0, cntRec: 0, sumUnitPlayers: 0, sumTeamPlayers: 0, cntRounds: 0 };
}

/** Fold one round's shares for an entity into an accumulator. */
function bumpShare(
  a: ShareAcc,
  pctInf: number | null,
  pctRec: number | null,
  unitPlayers: number,
  teamPlayers: number,
): void {
  a.sumUnitPlayers += unitPlayers;
  a.sumTeamPlayers += teamPlayers;
  a.cntRounds += 1;
  if (pctInf != null) {
    a.sumPctInf += pctInf;
    a.cntInf += 1;
  }
  if (pctRec != null) {
    a.sumPctRec += pctRec;
    a.cntRec += 1;
  }
}

function finalizeShare(a: ShareAcc): TicketContextShare {
  return {
    avgPctInflicted: a.cntInf > 0 ? a.sumPctInf / a.cntInf : null,
    avgPctReceived: a.cntRec > 0 ? a.sumPctRec / a.cntRec : null,
    avgUnitPlayers: a.cntRounds > 0 ? a.sumUnitPlayers / a.cntRounds : 0,
    avgTeamPlayers: a.cntRounds > 0 ? a.sumTeamPlayers / a.cntRounds : 0,
    rounds: a.cntRounds,
  };
}

/**
 * Core: average per-round ticket-damage shares for arbitrary entities. For each
 * round it tallies every player's ticket damage into per-team totals and into
 * each entity the player belongs to (via `entitiesOf` — one regiment, or the
 * token(s) that claim it), then records each entity's share of its team's total.
 * The denominators are the full team (all players, tagged or not), so an entity's
 * share reads as "of everything the team did, this unit accounted for X%".
 */
function computeTicketShares(
  scoreboards: Scoreboard[],
  entitiesOf: (sb: Scoreboard, p: ScoreboardPlayer) => string[],
): Record<string, TicketShare> {
  interface Acc {
    overall: ShareAcc;
    asUSA: ShareAcc;
    asCSA: ShareAcc;
    asAttacker: ShareAcc;
    asDefender: ShareAcc;
    perRound: Record<string, TicketRoundShare>;
  }
  const acc = new Map<string, Acc>();
  const ensureAcc = (e: string): Acc => {
    let a = acc.get(e);
    if (!a) {
      a = {
        overall: emptyShareAcc(),
        asUSA: emptyShareAcc(),
        asCSA: emptyShareAcc(),
        asAttacker: emptyShareAcc(),
        asDefender: emptyShareAcc(),
        perRound: {},
      };
      acc.set(e, a);
    }
    return a;
  };
  for (const sb of scoreboards) {
    const atk = mapAttacker(sb.meta.area ?? sb.meta.map);
    const groups = new Map<string, { team: Team; entity: string; inflicted: number; received: number; players: number }>();
    const teamInf: Record<Team, number> = { USA: 0, CSA: 0 };
    const teamRec: Record<Team, number> = { USA: 0, CSA: 0 };
    const teamPlayers: Record<Team, number> = { USA: 0, CSA: 0 };
    for (const p of sb.players) {
      const kf = killFormInRound(sb, p.steamId ?? p.name);
      const inflicted = ticketDamage(kf.in_form, kf.skirm, kf.oob);
      const received = ticketDamage(p.deathsInForm, p.deathsSkirm, p.deathsOob);
      teamInf[p.team] += inflicted;
      teamRec[p.team] += received;
      teamPlayers[p.team] += 1;
      for (const entity of entitiesOf(sb, p)) {
        const gk = `${p.team} ${entity}`;
        let g = groups.get(gk);
        if (!g) {
          g = { team: p.team, entity, inflicted: 0, received: 0, players: 0 };
          groups.set(gk, g);
        }
        g.inflicted += inflicted;
        g.received += received;
        g.players += 1;
      }
    }
    // A unit plays one side per round; a stray cross-team player would otherwise
    // create a second (team, entity) group that overwrites the round's perRound
    // entry and double-counts the average. Collapse each entity to its dominant
    // group — most players, then most ticket damage — so it's represented once
    // per round by its real side.
    const dominant = new Map<string, { team: Team; entity: string; inflicted: number; received: number; players: number }>();
    for (const g of groups.values()) {
      const cur = dominant.get(g.entity);
      if (
        !cur ||
        g.players > cur.players ||
        (g.players === cur.players && g.inflicted + g.received > cur.inflicted + cur.received)
      ) {
        dominant.set(g.entity, g);
      }
    }
    for (const g of dominant.values()) {
      const a = ensureAcc(g.entity);
      const tPlayers = teamPlayers[g.team];
      const pctInf = pctShare(g.inflicted, teamInf[g.team]);
      const pctRec = pctShare(g.received, teamRec[g.team]);
      a.perRound[sb.sourceFilename] = {
        pctInflicted: pctInf,
        pctReceived: pctRec,
        unitPlayers: g.players,
        teamPlayers: tPlayers,
      };
      // Overall + the round's faction bucket, plus the role bucket when the map
      // has a defined attacker.
      bumpShare(a.overall, pctInf, pctRec, g.players, tPlayers);
      bumpShare(g.team === 'USA' ? a.asUSA : a.asCSA, pctInf, pctRec, g.players, tPlayers);
      if (atk) bumpShare(g.team === atk ? a.asAttacker : a.asDefender, pctInf, pctRec, g.players, tPlayers);
    }
  }
  const out: Record<string, TicketShare> = {};
  for (const [entity, a] of acc) {
    const o = finalizeShare(a.overall);
    out[entity] = {
      avgPctInflicted: o.avgPctInflicted,
      avgPctReceived: o.avgPctReceived,
      avgUnitPlayers: o.avgUnitPlayers,
      avgTeamPlayers: o.avgTeamPlayers,
      asUSA: finalizeShare(a.asUSA),
      asCSA: finalizeShare(a.asCSA),
      asAttacker: finalizeShare(a.asAttacker),
      asDefender: finalizeShare(a.asDefender),
      perRound: a.perRound,
    };
  }
  return out;
}

/** Per-regiment average per-round ticket-damage shares (Regiments tab). */
export function computeRegimentTicketShares(
  scoreboards: Scoreboard[],
  assignments: RegimentAssignmentMap,
  options: EngineOptions = {},
): Record<string, TicketShare> {
  return computeTicketShares(scoreboards, (sb, p) => [
    resolveRow(sb, p.steamId, p.name, assignments, options),
  ]);
}

/**
 * Per-token average per-round ticket-damage shares (main tracker's per-unit
 * table). A player's resolved regiment is mapped to every token that claims it,
 * so a token's share sums the ticket damage of all its regiments.
 */
export function computeTokenTicketShares(
  scoreboards: Scoreboard[],
  assignments: RegimentAssignmentMap,
  tokenRegiments: Record<string, string[]>,
  options: EngineOptions = {},
): Record<string, TicketShare> {
  const reverse = new Map<string, string[]>();
  for (const [token, regs] of Object.entries(tokenRegiments)) {
    for (const reg of regs) {
      const arr = reverse.get(reg);
      if (arr) arr.push(token);
      else reverse.set(reg, [token]);
    }
  }
  return computeTicketShares(
    scoreboards,
    (sb, p) => reverse.get(resolveRow(sb, p.steamId, p.name, assignments, options)) ?? [],
  );
}

// ── Combat totals (meta-level weapons & casualties) ─────────────────────────

export interface CombatTotals {
  casualties: Record<Team, TeamCasualties>;
  deathsByWeapon: Record<Team, Record<string, number>>;
  /**
   * Tickets each side lost, by killfeed cause: every death weighted by the
   * stance the victim died in (IF·1, Sk·3, OoL·5). Deaths with no stance are
   * left out, so the causes sum to the side's stance-weighted ticket loss.
   */
  ticketsLostByCause: Record<Team, Record<string, number>>;
}

export function computeCombatTotals(scoreboards: Scoreboard[]): CombatTotals {
  const casualties: Record<Team, TeamCasualties> = { USA: emptyCasualties(), CSA: emptyCasualties() };
  const deathsByWeapon: Record<Team, Record<string, number>> = { USA: {}, CSA: {} };
  const ticketsLostByCause: Record<Team, Record<string, number>> = { USA: {}, CSA: {} };

  for (const sb of scoreboards) {
    for (const k of sb.kills) {
      if (!k.victimTeam || !k.victimFormation) continue;
      const byCause = ticketsLostByCause[k.victimTeam];
      const cause = k.cause || 'Unknown';
      byCause[cause] = (byCause[cause] ?? 0) + TICKET_WEIGHT[k.victimFormation];
    }
    for (const team of ['USA', 'CSA'] as Team[]) {
      const c = sb.meta.casualties[team];
      casualties[team].total += c.total;
      casualties[team].inForm += c.inForm;
      casualties[team].skirm += c.skirm;
      casualties[team].oob += c.oob;
      for (const [weapon, count] of Object.entries(sb.meta.deathsByWeapon[team])) {
        deathsByWeapon[team][weapon] = (deathsByWeapon[team][weapon] ?? 0) + count;
      }
    }
  }
  return { casualties, deathsByWeapon, ticketsLostByCause };
}

// ── Regiment context breakdown (by faction & attacker/defender role) ─────────

export interface ContextStatSlice {
  rounds: number;
  players: number;
  /** Players fielded across this slice's rounds (player-rounds), the rate denominator. */
  fielded: number;
  kills: number;
  deaths: number;
  kd: number;
  casualtiesByFormation: FormationCounts;
  killsByFormation: FormationCounts;
  avgTd: number | null;
  avgTk: number | null;
  /** Kills ÷ players fielded — size-normalized offense for this slice; null if none. */
  killRate: number | null;
  /** Casualties ÷ players fielded — size-normalized losses for this slice; null if none. */
  lossRate: number | null;
  casualtiesByCause: Record<string, number>;
  killsByCause: Record<string, number>;
}

export interface RegimentContextStats {
  asUSA: ContextStatSlice;
  asCSA: ContextStatSlice;
  asAttacker: ContextStatSlice;
  asDefender: ContextStatSlice;
}

function emptyContextSlice(): ContextStatSlice {
  return {
    rounds: 0,
    players: 0,
    fielded: 0,
    kills: 0,
    deaths: 0,
    kd: 0,
    casualtiesByFormation: { in_form: 0, skirm: 0, oob: 0 },
    killsByFormation: { in_form: 0, skirm: 0, oob: 0 },
    avgTd: null,
    avgTk: null,
    killRate: null,
    lossRate: null,
    casualtiesByCause: {},
    killsByCause: {},
  };
}

function emptyRegimentContext(): RegimentContextStats {
  return {
    asUSA: emptyContextSlice(),
    asCSA: emptyContextSlice(),
    asAttacker: emptyContextSlice(),
    asDefender: emptyContextSlice(),
  };
}

function addToSlice(slice: ContextStatSlice, kills: number, deaths: number,
  dIF: number, dSk: number, dOob: number, kf: FormationCounts) {
  // One call per player-round in this slice — the loss/kill-rate denominator.
  slice.fielded += 1;
  slice.kills += kills;
  slice.deaths += deaths;
  slice.casualtiesByFormation.in_form += dIF;
  slice.casualtiesByFormation.skirm += dSk;
  slice.casualtiesByFormation.oob += dOob;
  slice.killsByFormation.in_form += kf.in_form;
  slice.killsByFormation.skirm += kf.skirm;
  slice.killsByFormation.oob += kf.oob;
}

function addCause(bucket: Record<string, number>, cause: string) {
  bucket[cause] = (bucket[cause] ?? 0) + 1;
}

function finalizeSlice(slice: ContextStatSlice, rounds: Set<string>, players: Set<string>) {
  slice.rounds = rounds.size;
  slice.players = players.size;
  slice.kd = kdOf(slice.kills, slice.deaths);
  slice.avgTd = avgTicketCost(
    slice.casualtiesByFormation.in_form,
    slice.casualtiesByFormation.skirm,
    slice.casualtiesByFormation.oob,
  );
  slice.avgTk = avgTicketCost(
    slice.killsByFormation.in_form,
    slice.killsByFormation.skirm,
    slice.killsByFormation.oob,
  );
  slice.killRate = perPlayerRate(slice.kills, slice.fielded);
  slice.lossRate = perPlayerRate(slice.deaths, slice.fielded);
}

/**
 * Per-regiment stats split by faction (USA/CSA) and role (Attacker/Defender).
 * Role slices are populated only for skirmish maps that have a defined attacker;
 * conquest/contention rounds contribute to faction slices only.
 */
export function computeRegimentContextStats(
  scoreboards: Scoreboard[],
  assignments: RegimentAssignmentMap,
  options: EngineOptions = {},
): Record<string, RegimentContextStats> {
  const result: Record<string, RegimentContextStats> = {};
  const roundSets = new Map<string, { usa: Set<string>; csa: Set<string>; atk: Set<string>; def: Set<string> }>();
  const playerSets = new Map<string, { usa: Set<string>; csa: Set<string>; atk: Set<string>; def: Set<string> }>();

  const ensure = (reg: string) => {
    if (!result[reg]) {
      result[reg] = emptyRegimentContext();
      roundSets.set(reg, { usa: new Set(), csa: new Set(), atk: new Set(), def: new Set() });
      playerSets.set(reg, { usa: new Set(), csa: new Set(), atk: new Set(), def: new Set() });
    }
    return result[reg];
  };

  for (const sb of scoreboards) {
    const atk = mapAttacker(sb.meta.area ?? sb.meta.map);

    for (const p of sb.players) {
      const reg = resolveRow(sb, p.steamId, p.name, assignments, options);
      const ctx = ensure(reg);
      const rs = roundSets.get(reg)!;
      const ps = playerSets.get(reg)!;
      const pk = p.steamId ?? p.name;
      const kf = killFormInRound(sb, pk);

      const teamSlice = p.team === 'USA' ? ctx.asUSA : ctx.asCSA;
      const tk = p.team === 'USA' ? 'usa' as const : 'csa' as const;
      addToSlice(teamSlice, p.kills, p.deaths, p.deathsInForm, p.deathsSkirm, p.deathsOob, kf);
      rs[tk].add(sb.sourceFilename);
      ps[tk].add(pk);

      if (atk) {
        const isAtk = p.team === atk;
        const roleSlice = isAtk ? ctx.asAttacker : ctx.asDefender;
        const rk = isAtk ? 'atk' as const : 'def' as const;
        addToSlice(roleSlice, p.kills, p.deaths, p.deathsInForm, p.deathsSkirm, p.deathsOob, kf);
        rs[rk].add(sb.sourceFilename);
        ps[rk].add(pk);
      }
    }

    for (const kill of sb.kills) {
      const cause = kill.cause || 'Unknown';

      if (kill.victimTeam) {
        const vReg = resolveRow(sb, kill.victimSteamId, kill.victim, assignments, options);
        const vCtx = ensure(vReg);
        addCause((kill.victimTeam === 'USA' ? vCtx.asUSA : vCtx.asCSA).casualtiesByCause, cause);
        if (atk) {
          addCause((kill.victimTeam === atk ? vCtx.asAttacker : vCtx.asDefender).casualtiesByCause, cause);
        }
      }

      if (kill.killer && kill.killerTeam) {
        const kReg = resolveRow(sb, kill.killerSteamId, kill.killer, assignments, options);
        const kCtx = ensure(kReg);
        addCause((kill.killerTeam === 'USA' ? kCtx.asUSA : kCtx.asCSA).killsByCause, cause);
        if (atk) {
          addCause((kill.killerTeam === atk ? kCtx.asAttacker : kCtx.asDefender).killsByCause, cause);
        }
      }
    }
  }

  for (const [reg] of Object.entries(result)) {
    const ctx = result[reg];
    const rs = roundSets.get(reg)!;
    const ps = playerSets.get(reg)!;
    finalizeSlice(ctx.asUSA, rs.usa, ps.usa);
    finalizeSlice(ctx.asCSA, rs.csa, ps.csa);
    finalizeSlice(ctx.asAttacker, rs.atk, ps.atk);
    finalizeSlice(ctx.asDefender, rs.def, ps.def);
  }

  return result;
}
