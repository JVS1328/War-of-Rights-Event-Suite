import { saveEvent, getTrackerState, putTrackerState } from './events';
import type { CloudEvent } from './events';
import { isStatsBundle } from '../stats/statsBundle';
import type { StatsBundle, StatsBundleSeason } from '../stats/statsBundle';
import { migrateLegacyFlatToV2 } from '../utils/eventStore';
import { cloudStatsRepo, statsRepo } from '../stats/repo';
import type { StatsRepository } from '../stats/StatsRepository';
import type { TrackerMapStats } from '../stats/statsEngine';
import type { NightWeek, PointSystem } from '../stats/nightMatchup';

/**
 * Getting an event into the database, and back out again.
 *
 * Everything the suite has ever produced — a season the tracker is running
 * right now, an exported event file, an old flat-shape season JSON — comes
 * through here, is normalised to one event tree, and is written as three
 * things: the event's meta (the directory row), its tracker state (the season
 * itself), and its player stats (round by round).
 */

/** What the `tracker` resource holds: one tracker Event, versioned. */
export const TRACKER_STATE_VERSION = 1;

export interface TrackerStatePayload {
  v: number;
  event: TrackerEvent;
}

/**
 * A season inside that tree. Only the fields the public screens read are named;
 * the rest is carried through untouched, because the shape is owned by
 * utils/eventStore (plain JS) and this module is not trying to re-declare it.
 *
 * A week is a {@link NightWeek} — stats/nightMatchup already declares the
 * subset of a tracker week the screens read, structurally and in one place.
 */
export interface TrackerSeason {
  id: string;
  name: string;
  units?: string[];
  weeks?: NightWeek[];
  divisions?: { name: string; units: string[] }[];
  pointSystem?: PointSystem;
  playoffConfig?: { enabled?: boolean; teamsPerDivision?: number };
  [key: string]: unknown;
}

/**
 * The tracker's event tree. Typed loosely on purpose: it is defined by
 * utils/eventStore (plain JS) and this module only ever carries it around.
 */
export interface TrackerEvent {
  id: string;
  name: string;
  seasons: TrackerSeason[];
  unitRegistry?: Record<string, { name: string }>;
  eloSystem?: Record<string, number>;
  [key: string]: unknown;
}

export interface NormalizedExport {
  event: TrackerEvent;
  stats: StatsBundle | null;
}

/**
 * Read whatever the tracker's Export button produced. A multi-season export is
 * an event tree already; a single-season one is the old flat shape and gets
 * migrated the same way opening the file in the tracker would.
 */
export function eventFromExport(data: unknown): NormalizedExport {
  if (!data || typeof data !== 'object') throw new Error('That file is not a season or event export.');
  const raw = data as Record<string, unknown>;
  const stats = isStatsBundle(raw.stats) ? (raw.stats as StatsBundle) : null;

  if (raw.kind === 'event' && raw.event && typeof raw.event === 'object') {
    const event = raw.event as TrackerEvent;
    if (!Array.isArray(event.seasons)) throw new Error('That event file has no seasons in it.');
    return { event, stats };
  }

  if (Array.isArray(raw.events) && raw.events.length) {
    // A whole-app export: take the active event, or the first one.
    const events = raw.events as TrackerEvent[];
    const event = events.find((e) => e.id === raw.activeEventId) ?? events[0];
    return { event, stats };
  }

  if (Array.isArray(raw.weeks) || Array.isArray(raw.units) || Array.isArray(raw.season)) {
    const migrated = migrateLegacyFlatToV2(raw) as { events: TrackerEvent[] };
    return { event: migrated.events[0], stats };
  }

  throw new Error('That file is not a season or event export.');
}

/** The seasons an event has, in the shape the stats screens filter by. */
export const seasonRefsOf = (event: TrackerEvent): StatsBundleSeason[] =>
  (event.seasons ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    weekIds: (s.weeks ?? []).map((w) => String(w.id)),
  }));

/** The event's registry unit names, which the stats screens resolve against. */
export const registryUnitsOf = (event: TrackerEvent): string[] =>
  Object.values(event.unitRegistry ?? {})
    .map((u) => u?.name)
    .filter((n): n is string => !!n);

export interface PublishInput {
  slug: string;
  event: TrackerEvent;
  /**
   * What to call it on the site. Old flat-shape season files carry no event
   * name at all and migrate in as "Default Event", so the owner needs a say.
   * Falls back to the event's own name.
   */
  name?: string;
  /** Player stats to upload. Omit to leave whatever is already stored alone. */
  stats?: StatsBundle | null;
  published?: boolean;
  /** Map win/loss tallies, which the tracker computes and the site displays. */
  mapStats?: { overall?: TrackerMapStats; bySeason?: Record<string, TrackerMapStats> } | null;
  /** Called after each round goes up, so the screen can show progress. */
  onProgress?: (done: number, total: number) => void;
}

export interface PublishResult {
  event: CloudEvent;
  scoreboards: number;
  /** Rounds that would not go up, and why. Empty on a clean publish. */
  failed: { sourceFilename: string; reason: string }[];
}

/**
 * Write an event to the database. Meta first so the event exists, then the
 * tracker state, then the rounds one at a time — a big season is a lot of
 * killfeed, and one request per round is what keeps each one inside the
 * platform's body limit.
 */
export async function publishEvent(input: PublishInput): Promise<PublishResult> {
  const { slug, stats, mapStats, onProgress } = input;
  // The name goes on the event itself, not just the directory row, so pulling
  // it back down later brings the name with it.
  const name = input.name?.trim() || input.event.name;
  const event = name === input.event.name ? input.event : { ...input.event, name };

  const meta = await saveEvent({
    slug,
    name,
    published: input.published,
    seasons: seasonRefsOf(event),
    registryUnits: registryUnitsOf(event),
    mapStats: mapStats ?? null,
  });

  await putTrackerState(slug, { v: TRACKER_STATE_VERSION, event } satisfies TrackerStatePayload);

  let scoreboards = 0;
  const failed: PublishResult['failed'] = [];
  if (stats?.scoreboards?.length || stats?.assignments || stats?.aliases) {
    const total = stats.scoreboards?.length ?? 0;
    onProgress?.(0, total);
    for (const [i, entry] of (stats.scoreboards ?? []).entries()) {
      try {
        await cloudStatsRepo.saveScoreboard(slug, entry.scoreboard, entry.binding);
        scoreboards += 1;
      } catch (err) {
        // One round the database will not take — an enormous killfeed, most
        // likely — must not cost the other forty. Carry on and name it at the
        // end, so a migration is never half-done and silent about it.
        failed.push({
          sourceFilename: entry.sourceFilename,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      onProgress?.(i + 1, total);
    }
    // Pins and renames go up as one document each, after the rounds they describe.
    await cloudStatsRepo.importEventStats(slug, { ...stats, scoreboards: [] });
  }

  return { event: meta, scoreboards, failed };
}

/**
 * Read an event's tracker state back out. Returns null when the event has meta
 * but no season stored yet — a stats-only event, which the site still shows.
 */
export async function pullTrackerEvent(slug: string): Promise<TrackerEvent | null> {
  try {
    const payload = await getTrackerState<TrackerStatePayload>(slug);
    return payload?.event ?? null;
  } catch {
    return null;
  }
}

export interface PullStatsInput {
  /** The event's short name in the database. */
  slug: string;
  /** The tracker event id the rounds belong to in this browser. */
  eventId: string;
  /** Where the rounds come from; the database unless a test says otherwise. */
  from?: StatsRepository;
  /** Where they go; this browser unless a test says otherwise. */
  to?: StatsRepository;
  /** Called after each round comes down, so the screen can show progress. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Bring an event's player stats down into this browser: every round, with its
 * binding to a night, plus the pins and renames. The tracker's own screens read
 * the local store, so pulling the season without its rounds leaves Imported
 * Rounds empty and every scoreboard-backed figure blank.
 *
 * Rounds are keyed by filename, so pulling again overwrites rather than
 * duplicates; rounds only this browser has are left alone.
 */
export async function pullEventStats(input: PullStatsInput): Promise<number> {
  const { slug, eventId, from = cloudStatsRepo, to = statsRepo, onProgress } = input;
  const bundle = await from.exportEventStats(slug, [], [], { full: true });
  const total = bundle.scoreboards.length;
  onProgress?.(0, total);
  for (const [i, entry] of bundle.scoreboards.entries()) {
    await to.saveScoreboard(eventId, entry.scoreboard, entry.binding);
    onProgress?.(i + 1, total);
  }
  // Pins and renames after the rounds they describe, as publishing does.
  await to.importEventStats(eventId, { ...bundle, scoreboards: [] });
  return total;
}

/**
 * The app-state shape the Elo engine and the season derivations expect, built
 * around a single event. The public site never holds an app state of its own,
 * so it synthesises one per event it draws.
 */
export const appStateForEvent = (event: TrackerEvent) => ({
  schemaVersion: 2,
  activeEventId: event.id,
  activeSeasonId: event.seasons?.[0]?.id ?? null,
  events: [event],
});
