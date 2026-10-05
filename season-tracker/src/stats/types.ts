/**
 * Typed model for an imported War of Rights scoreboard (one round).
 *
 * NOTE: steam IDs are kept as STRINGS. A SteamID64 (e.g. 76561198955655763)
 * exceeds Number.MAX_SAFE_INTEGER, so parsing as a number would corrupt it.
 */

export type Team = 'USA' | 'CSA';

/** In-CSV numeric team code → canonical team. */
export const TEAM_BY_CODE: Record<string, Team> = { '1': 'USA', '2': 'CSA' };

export type Formation = 'in_form' | 'skirm' | 'oob';

/** Arm of service a unit belongs to, as labelled by the overlay's command log. */
export type Branch = 'Infantry' | 'Artillery' | 'Cavalry';

export interface TeamCasualties {
  total: number;
  inForm: number;
  skirm: number;
  oob: number;
}

export interface ScoreboardMeta {
  roundStartTime: string | null;
  roundEndTime: string | null;
  /**
   * Round length straight from the overlay. Newer scoreboards only — older ones
   * leave it null and callers fall back to end − start.
   */
  roundDurationS: number | null;
  map: string;
  mode: string;
  area: string | null;
  winner: Team | null;
  popNow: number | null;
  popRoundStart: number | null;
  popRoundPeak: number | null;
  popRoundMax: number | null;
  popRoundEnd: number | null;
  moraleUsa: string | null;
  moraleCsa: string | null;
  /**
   * Round setup, from the 2026-10-05 overlay build on; undefined on scoreboards
   * imported before it, null where the mode has none (only Skirmish defends and
   * has a final push; Conquest / Contention have tickets).
   */
  defendingTeam?: Team | null;
  /** Seconds. */
  finalPushTime?: number | null;
  /** Each side's starting tickets. */
  ticketsUsa?: number | null;
  ticketsCsa?: number | null;
  /** Tickets left at round end; 0 = the side was in Last Stand / Final Push. */
  ticketsLeftUsa?: number | null;
  ticketsLeftCsa?: number | null;
  casualties: Record<Team, TeamCasualties>;
  /** weapon/cause key → count, per team. */
  deathsByWeapon: Record<Team, Record<string, number>>;
}

export interface ScoreboardPlayer {
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  kd: number;
  deathsInForm: number;
  deathsSkirm: number;
  deathsOob: number;
  steamId: string | null;
  /** Player level 1..100; undefined before the 2026-10-05 build, null when unknown. */
  level?: number | null;
}

/**
 * One row of the command log: a single officer holding one company's officer
 * slot for one contiguous stretch of the round. An officer who is replaced and
 * later retakes the slot, or who commands two companies, yields several rows —
 * see `collapseOfficerStints` before counting rounds off these.
 *
 * Fields below `battery` arrived with the July 2026 overlay build and are
 * undefined on scoreboards imported before it.
 */
export interface ScoreboardOfficer {
  name: string;
  team: Team;
  /** Peak concurrent subordinates during the stint. */
  commanded: number;
  /** true = artillery (battery), false = infantry. */
  battery: boolean;
  regiment?: string | null;
  company?: string | null;
  branch?: Branch | null;
  rank?: string | null;
  /** Mean concurrent subordinates across the stint (`commanded` is the peak). */
  commandedAvg?: number | null;
  start?: string | null;
  end?: string | null;
  /** Time in the slot, and that as a percentage of the round's duration. */
  durationS?: number | null;
  pctRound?: number | null;
  steamId?: string | null;
}

/**
 * One row per player, showing the unit they ENDED the round in. `durationS` is
 * their total time in that unit summed across every stint served there — see
 * `Scoreboard.service` for the full movement history.
 */
export interface RosterEntry {
  team: Team;
  regiment: string | null;
  company: string | null;
  name: string;
  className: string | null;
  rank: string | null;
  steamId: string | null;
  /**
   * Time served in this unit, and that as a percentage of the round. Undefined
   * on scoreboards predating the July 2026 overlay build; null for Unenlisted
   * players, who have no unit to have served in.
   */
  durationS?: number | null;
  pctRound?: number | null;
}

/**
 * One row per posting a player held during the round (the "service log"). A
 * posting is (team, regiment, company): swapping teams or moving company closes
 * one row and opens the next, while being promoted inside a company does not, so
 * `className`/`rank` are the player's state at the END of the posting.
 *
 * Postings shorter than the overlay's minimum stint are omitted, so a player's
 * roster `durationS` can slightly exceed the sum of their stints here.
 */
export interface ServiceStint {
  team: Team;
  regiment: string | null;
  company: string | null;
  name: string;
  className: string | null;
  rank: string | null;
  start: string | null;
  end: string | null;
  durationS: number | null;
  pctRound: number | null;
  steamId: string | null;
}

export interface Kill {
  tsInRound: string;
  killer: string | null;
  killerSteamId: string | null;
  killerTeam: Team | null;
  victim: string;
  victimSteamId: string | null;
  victimTeam: Team | null;
  victimFormation: Formation | null;
  cause: string;
  cat: number;
  sub: number;
}

export interface JoinLeave {
  tsInRound: string;
  name: string;
  steamId: string | null;
  action: 'joined' | 'left';
}

export interface Scoreboard {
  sourceFilename: string;
  /** ISO timestamp derived from the filename, or null if unparseable. */
  recordedAt: string | null;
  meta: ScoreboardMeta;
  players: ScoreboardPlayer[];
  officers: ScoreboardOfficer[];
  roster: RosterEntry[];
  /**
   * Per-posting service log. The parser always sets it, but scoreboards stored
   * before it existed have no such field — read it as `sb.service ?? []`.
   */
  service?: ServiceStint[];
  kills: Kill[];
  joinLeaves: JoinLeave[];
}
