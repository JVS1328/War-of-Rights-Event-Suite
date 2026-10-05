import type {
  Branch,
  Formation,
  JoinLeave,
  Kill,
  Scoreboard,
  ScoreboardMeta,
  ScoreboardOfficer,
  ScoreboardPlayer,
  RosterEntry,
  ServiceStint,
  Team,
  TeamCasualties,
} from './types';
import { TEAM_BY_CODE } from './types';

/** Weapon/cause keys tracked in the meta `deaths_<team>_<weapon>` fields. */
const WEAPON_KEYS = [
  'canister',
  'shell',
  'minie',
  'compression',
  'round',
  'pellet',
  'pistol',
  'hexagonal',
  'melee',
  'env',
] as const;

/**
 * Split a CSV line into fields, honoring double-quoted fields that may contain
 * commas. Mirrors the log-analyzer's tolerant parsing.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toInt(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function num(v: string | undefined): number {
  return toInt(v) ?? 0;
}

function toNum(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function numF(v: string | undefined): number {
  return toNum(v) ?? 0;
}

/** Non-empty string or null. */
function str(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function teamFromCode(v: string | undefined): Team | null {
  return v == null ? null : (TEAM_BY_CODE[v.trim()] ?? null);
}

/** 'USA' / 'CSA' (any case), else null. */
function teamOrNull(v: string | undefined): Team | null {
  const t = (v ?? '').trim().toUpperCase();
  return t === 'USA' || t === 'CSA' ? t : null;
}

function teamFromText(v: string | undefined): Team {
  return (v ?? '').trim().toUpperCase() === 'USA' ? 'USA' : 'CSA';
}

/** Map a header row to column indices keyed by column name. */
function indexHeader(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    idx[h.trim()] = i;
  });
  return idx;
}

/**
 * Read a column only newer scoreboards carry. Returns undefined when the section
 * has no such column at all, so callers can tell "this build didn't record it"
 * from "recorded, but blank for this row".
 */
function optStr(h: Record<string, number>, r: string[], key: string): string | null | undefined {
  return h[key] === undefined ? undefined : str(r[h[key]]);
}

function optInt(h: Record<string, number>, r: string[], key: string): number | null | undefined {
  return h[key] === undefined ? undefined : toInt(r[h[key]]);
}

const BRANCHES: Branch[] = ['Infantry', 'Artillery', 'Cavalry'];

function branchFrom(v: string | undefined): Branch | null {
  const t = (v ?? '').trim();
  return (BRANCHES as string[]).includes(t) ? (t as Branch) : null;
}

function parsePlayers(rows: string[][]): ScoreboardPlayer[] {
  const h = indexHeader(rows[0]);
  return rows.slice(1).map((r) => ({
    name: r[h['name']] ?? '',
    team: teamFromCode(r[h['team']]) ?? 'USA',
    kills: num(r[h['kills']]),
    deaths: num(r[h['deaths']]),
    kd: numF(r[h['kd']]),
    deathsInForm: num(r[h['deaths_in_form']]),
    deathsSkirm: num(r[h['deaths_skirm']]),
    deathsOob: num(r[h['deaths_oob']]),
    steamId: str(r[h['steam_id']]),
    level: optInt(h, r, 'level'),
  }));
}

/**
 * Parse the command log. Newer builds emit one row per stint with the officer's
 * full posting; older ones carried only `commanded` plus a 0/1 `battery` column.
 */
function parseOfficers(rows: string[][]): ScoreboardOfficer[] {
  const h = indexHeader(rows[0]);
  const hasBranch = h['branch'] !== undefined;
  return rows.slice(1).map((r) => {
    const branch = branchFrom(r[h['branch']]);
    return {
      name: r[h['officer']] ?? '',
      team: teamFromCode(r[h['team']]) ?? 'USA',
      commanded: num(r[h['commanded']]),
      // The July 2026 build replaced the 0/1 battery column with a branch label.
      battery: hasBranch ? branch === 'Artillery' : num(r[h['battery']]) === 1,
      regiment: optStr(h, r, 'regiment'),
      company: optStr(h, r, 'company'),
      branch: hasBranch ? branch : undefined,
      rank: optStr(h, r, 'rank'),
      commandedAvg: optInt(h, r, 'commanded_avg'),
      start: optStr(h, r, 'start'),
      end: optStr(h, r, 'end'),
      durationS: optInt(h, r, 'duration_s'),
      pctRound: optInt(h, r, 'pct_round'),
      steamId: optStr(h, r, 'steam_id'),
    };
  });
}

function parseRoster(rows: string[][]): RosterEntry[] {
  const h = indexHeader(rows[0]);
  return rows.slice(1).map((r) => ({
    team: teamFromText(r[h['team']]),
    regiment: str(r[h['regiment']]),
    company: str(r[h['company']]),
    name: r[h['name']] ?? '',
    className: str(r[h['class']]),
    rank: str(r[h['rank']]),
    steamId: str(r[h['steam_id']]),
    durationS: optInt(h, r, 'duration_s'),
    pctRound: optInt(h, r, 'pct_round'),
  }));
}

function parseService(rows: string[][]): ServiceStint[] {
  const h = indexHeader(rows[0]);
  return rows.slice(1).map((r) => ({
    team: teamFromText(r[h['team']]),
    regiment: str(r[h['regiment']]),
    company: str(r[h['company']]),
    name: r[h['name']] ?? '',
    className: str(r[h['class']]),
    rank: str(r[h['rank']]),
    start: str(r[h['start']]),
    end: str(r[h['end']]),
    durationS: toInt(r[h['duration_s']]),
    pctRound: toInt(r[h['pct_round']]),
    steamId: str(r[h['steam_id']]),
  }));
}

const FORMATIONS: Formation[] = ['in_form', 'skirm', 'oob'];

function parseKills(rows: string[][]): Kill[] {
  const h = indexHeader(rows[0]);
  return rows.slice(1).map((r) => {
    const formRaw = (r[h['victim_formation']] ?? '').trim();
    return {
      tsInRound: r[h['time']] ?? '',
      killer: str(r[h['killer']]),
      killerSteamId: str(r[h['killer_steam_id']]),
      killerTeam: teamFromCode(r[h['killer_team']]),
      victim: r[h['victim']] ?? '',
      victimSteamId: str(r[h['victim_steam_id']]),
      victimTeam: teamFromCode(r[h['victim_team']]),
      victimFormation: (FORMATIONS as string[]).includes(formRaw)
        ? (formRaw as Formation)
        : null,
      cause: r[h['cause']] ?? '',
      cat: num(r[h['cat']]),
      sub: num(r[h['sub']]),
    };
  });
}

function parseJoinLeaves(rows: string[][]): JoinLeave[] {
  const h = indexHeader(rows[0]);
  return rows.slice(1).map((r) => ({
    tsInRound: r[h['time']] ?? '',
    name: r[h['player']] ?? '',
    steamId: str(r[h['steam_id']]),
    action: (r[h['event']] ?? '').trim() === 'left' ? 'left' : 'joined',
  }));
}

/** Derive an ISO-like local timestamp from a `scoreboard_YYYYMMDD_HHMMSS.csv` name. */
function recordedAtFromFilename(filename: string): string | null {
  const m = filename.match(/scoreboard_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function emptyCasualties(): TeamCasualties {
  return { total: 0, inForm: 0, skirm: 0, oob: 0 };
}

function parseMeta(rows: string[][]): ScoreboardMeta {
  const m: Record<string, string> = {};
  for (const row of rows) {
    if (row.length >= 2) m[row[0]] = row.slice(1).join(',');
  }

  const winner = teamOrNull(m['winner']);

  const casualties: Record<Team, TeamCasualties> = {
    USA: emptyCasualties(),
    CSA: emptyCasualties(),
  };
  for (const team of ['usa', 'csa'] as const) {
    const t: Team = team === 'usa' ? 'USA' : 'CSA';
    casualties[t] = {
      total: toInt(m[`casualties_${team}`]) ?? 0,
      inForm: toInt(m[`casualties_${team}_in_form`]) ?? 0,
      skirm: toInt(m[`casualties_${team}_skirm`]) ?? 0,
      oob: toInt(m[`casualties_${team}_oob`]) ?? 0,
    };
  }

  const deathsByWeapon: Record<Team, Record<string, number>> = { USA: {}, CSA: {} };
  for (const team of ['usa', 'csa'] as const) {
    const t: Team = team === 'usa' ? 'USA' : 'CSA';
    for (const w of WEAPON_KEYS) {
      deathsByWeapon[t][w] = toInt(m[`deaths_${team}_${w}`]) ?? 0;
    }
  }

  return {
    roundStartTime: m['round_start_time'] ?? null,
    roundEndTime: m['round_end_time'] ?? null,
    roundDurationS: toInt(m['round_duration_s']),
    map: m['map'] ?? '',
    mode: m['mode'] ?? '',
    area: m['area'] ?? null,
    winner,
    popNow: toInt(m['pop_now']),
    popRoundStart: toInt(m['pop_round_start']),
    popRoundPeak: toInt(m['pop_round_peak']),
    popRoundMax: toInt(m['pop_round_max']),
    popRoundEnd: toInt(m['pop_round_end']),
    moraleUsa: m['morale_usa'] ?? null,
    moraleCsa: m['morale_csa'] ?? null,
    defendingTeam: teamOrNull(m['defending_team']),
    finalPushTime: toNum(m['final_push_time']),
    ticketsUsa: toNum(m['tickets_usa']),
    ticketsCsa: toNum(m['tickets_csa']),
    ticketsLeftUsa: toInt(m['tickets_left_usa']),
    ticketsLeftCsa: toInt(m['tickets_left_csa']),
    casualties,
    deathsByWeapon,
  };
}

/**
 * Parse a War of Rights scoreboard CSV (blank-line-delimited sections) into a
 * typed Scoreboard. Sections after the meta block are keyed by their header row.
 */
export function parseScoreboard(csvText: string, sourceFilename: string): Scoreboard {
  // Split into blank-line-delimited sections.
  const lines = csvText.split(/\r?\n/);
  const sections: string[][][] = [];
  let cur: string[][] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur.length) {
        sections.push(cur);
        cur = [];
      }
      continue;
    }
    cur.push(parseCsvLine(line));
  }
  if (cur.length) sections.push(cur);

  // The first section is always the key,value meta block.
  const meta = parseMeta(sections[0] ?? []);

  const sb: Scoreboard = {
    sourceFilename,
    recordedAt: recordedAtFromFilename(sourceFilename),
    meta,
    players: [],
    officers: [],
    roster: [],
    service: [],
    kills: [],
    joinLeaves: [],
  };

  // Dispatch remaining sections by their header row. The roster and the service
  // log share the same leading `team,regiment,company,name,class,rank` columns —
  // only the service log carries the window served, so `start` tells them apart.
  // Matching on the shared prefix alone lets the service log overwrite the
  // roster, which silently multiplies a unit's member count by its stint count.
  for (const section of sections.slice(1)) {
    const header = section[0] ?? [];
    const trimmed = header.map((c) => c.trim());
    const h0 = trimmed[0] ?? '';
    const h1 = trimmed[1] ?? '';
    if (h0 === 'name' && trimmed.includes('kills')) sb.players = parsePlayers(section);
    else if (h0 === 'officer') sb.officers = parseOfficers(section);
    else if (h0 === 'team' && h1 === 'regiment') {
      if (trimmed.includes('start')) sb.service = parseService(section);
      else sb.roster = parseRoster(section);
    } else if (h0 === 'time' && h1 === 'killer') sb.kills = parseKills(section);
    else if (h0 === 'time' && h1 === 'player') sb.joinLeaves = parseJoinLeaves(section);
  }

  return sb;
}
