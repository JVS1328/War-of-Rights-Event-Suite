import type { Scoreboard, Team } from './types';
import type { BundleOptions, ScopedAliases, StatsBundle, StatsBundleSeason } from './statsBundle';

export interface ReadOptions {
  /**
   * Ask for the join/leave log too. No stat or view reads it, so a remote
   * repository leaves it behind by default; a backup asks for it.
   */
  withJoinLog?: boolean;
  /**
   * Only the rounds bound to these nights. A viewer is looking at one season,
   * and without this a four-season event is downloaded to draw one of them.
   * Absent means every round, which is what Overall wants.
   */
  weekIds?: string[] | null;
}

/** Optional link from a scoreboard to a specific Week/Round in the tracker. */
export interface ScoreboardBinding {
  weekId: string;
  round: 1 | 2;
}

export interface StoredScoreboard {
  id: string;
  eventId: string;
  binding?: ScoreboardBinding;
  scoreboard: Scoreboard;
  /** A replay is attached (database-backed events only). */
  hasReplay?: boolean;
}

/** Lightweight row for lists, without the heavy player/killfeed arrays. */
export interface ScoreboardSummary {
  id: string;
  eventId: string;
  binding?: ScoreboardBinding;
  sourceFilename: string;
  recordedAt: string | null;
  map: string;
  mode: string;
  area: string | null;
  winner: Team | null;
  /** The round's start on the server clock ("HH:MM:SS"), what a replay is matched by. */
  roundStartTime?: string | null;
  /** A replay is attached (database-backed events only). */
  hasReplay?: boolean;
}

export interface ListQuery {
  eventId: string;
}

/** steam id → regiment label. */
export type RegimentAssignmentMap = Record<string, string>;

/**
 * Steam-id assignments (pins) keyed by scope, where a scope key is
 * `OVERALL_SCOPE` (applies to every season) or a season id (overrides Overall
 * for that season only). A player pinned to different regiments across seasons
 * resolves under the scope of the round being viewed.
 */
export type ScopedAssignments = Record<string, RegimentAssignmentMap>;

/**
 * Storage-agnostic stats persistence. LocalStatsRepository keeps an event in
 * this browser (IndexedDB); ApiStatsRepository keeps it in the database behind
 * /api/db. The screens are written against this interface and cannot tell which
 * one they were handed.
 */
export interface StatsRepository {
  saveScoreboard(eventId: string, scoreboard: Scoreboard, binding?: ScoreboardBinding): Promise<string>;
  getScoreboard(id: string): Promise<StoredScoreboard | null>;
  listScoreboards(query: ListQuery): Promise<ScoreboardSummary[]>;
  deleteScoreboard(id: string): Promise<void>;

  /**
   * Every scoreboard in an event, in one go. Callers that need the whole event
   * (the stats screens do) should prefer this over list-then-get-each: locally
   * it is one transaction instead of N, and over the network it is a handful of
   * paged requests fetched together rather than one per round.
   *
   * `withJoinLog` asks for the join/leave log too. No stat or view reads it, so
   * a remote repository leaves it behind by default; a backup asks for it.
   */
  readAllScoreboards(
    eventId: string,
    options?: ReadOptions,
  ): Promise<StoredScoreboard[]>;

  /** Event-wide (Overall) pins — a view over the Overall scope of the scoped map. */
  getRegimentAssignments(eventId: string): Promise<RegimentAssignmentMap>;
  setRegimentAssignment(eventId: string, steamId: string, regiment: string): Promise<void>;
  setRegimentAssignments(eventId: string, assignments: RegimentAssignmentMap): Promise<void>;

  /** All pins keyed by scope (OVERALL_SCOPE or a season id). */
  getRegimentAssignmentsScoped(eventId: string): Promise<ScopedAssignments>;
  /** Pin one player within a scope (upsert). */
  setRegimentAssignmentScoped(eventId: string, scope: string, steamId: string, regiment: string): Promise<void>;
  /** Pin several players within a scope at once (upsert). */
  setRegimentAssignmentsScoped(eventId: string, scope: string, assignments: RegimentAssignmentMap): Promise<void>;

  /**
   * Event-wide (Overall) regiment rename/merge map (sourceLabel → targetLabel).
   * A view over the Overall scope of {@link getRegimentAliasesScoped}.
   */
  getRegimentAliases(eventId: string): Promise<Record<string, string>>;
  setRegimentAliases(eventId: string, map: Record<string, string>): Promise<void>;

  /**
   * Season-scoped rename/merge maps (scope → sourceLabel → targetLabel), where a
   * scope key is `OVERALL_SCOPE` or a season id. Overall entries apply to every
   * season; a season's own entries layer on top when that season is resolved.
   */
  getRegimentAliasesScoped(eventId: string): Promise<ScopedAliases>;
  setRegimentAliasesScoped(eventId: string, scoped: ScopedAliases): Promise<void>;

  /**
   * Pack all of an event's scoreboards + assignments into a portable bundle.
   * `registryUnits` (the event's unit-registry names) is carried so a read-only
   * shared view resolves regiments the same way the live editor does, and
   * `seasons` (id/name/weekIds) so it can offer the same per-season filtering.
   * Pass `{ full: true }` when the bundle is going somewhere that should hold
   * everything, rather than into a link that has to stay small.
   */
  exportEventStats(
    eventId: string,
    registryUnits?: string[],
    seasons?: StatsBundleSeason[],
    options?: BundleOptions,
  ): Promise<StatsBundle>;
  /** Restore a bundle under the target event; returns the scoreboard count. */
  importEventStats(eventId: string, bundle: StatsBundle): Promise<number>;
}
