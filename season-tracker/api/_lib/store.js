import { query } from './sql.js';
import { DOC_KINDS } from './schema.js';

/**
 * The database behind the public stats site.
 *
 * Storage is Postgres on Neon, reached over HTTP by the serverless driver.
 * Everything the API touches goes through this module, which is the only file
 * that knows a table layout exists — the router above it asks for events and
 * rounds and never writes a query.
 *
 * See schema.js for the tables. The shape follows how the site reads: a
 * scoreboard's summary columns sit beside its payload so a list view never
 * loads a killfeed, and an event's pins, renames and tracker state are single
 * JSON documents because that is exactly how the screens hold them.
 */

/**
 * Neon's HTTP endpoint will take a much larger row than this, but a scoreboard
 * past a megabyte is a sign something has gone wrong upstream rather than a
 * round anyone recorded — and refusing it with a clear message beats a timeout.
 */
export const MAX_VALUE_BYTES = 4_000_000;

/** Share links live a year, which is long enough that nobody notices. */
const SHARE_TTL_SECONDS = 31_536_000;

/** Thrown when a single value is too large to store. */
export class ValueTooLargeError extends Error {
  constructor(bytes) {
    super(`Value is ${bytes} bytes, over the ${MAX_VALUE_BYTES}-byte limit`);
    this.name = 'ValueTooLargeError';
    this.bytes = bytes;
  }
}

function sized(value) {
  const json = JSON.stringify(value ?? null);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_VALUE_BYTES) throw new ValueTooLargeError(bytes);
  return json;
}

/** A row's JSONB column, whether the driver handed it back parsed or as text. */
function asJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// --- Events ---------------------------------------------------------------

/** An event row as the API talks about it. */
function toEvent(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    published: !!row.published,
    seasons: asJson(row.seasons, []),
    registryUnits: asJson(row.registry_units, []),
    mapStats: asJson(row.map_stats, null),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    scoreboardCount: Number(row.scoreboard_count ?? 0),
  };
}

// The directory and the event page both want the round count, and counting in
// the same statement beats keeping a denormalised tally honest.
const EVENT_COLUMNS = `
  e.slug, e.name, e.published, e.seasons, e.registry_units, e.map_stats,
  e.created_at, e.updated_at,
  (SELECT count(*) FROM wor_scoreboards s WHERE s.event_slug = e.slug) AS scoreboard_count
`;

/** Every published event, most recently updated first. */
export async function listPublishedEvents() {
  const rows = await query(
    `SELECT ${EVENT_COLUMNS} FROM wor_events e WHERE e.published ORDER BY e.updated_at DESC`,
  );
  return rows.map(toEvent);
}

export async function getEvent(slug) {
  const rows = await query(`SELECT ${EVENT_COLUMNS} FROM wor_events e WHERE e.slug = $1`, [slug]);
  return toEvent(rows[0]);
}

/**
 * Create or update an event. `createdAt` is left alone on an update — it is the
 * one field about an event that is not the caller's to revise.
 */
export async function putEvent(slug, meta) {
  const rows = await query(
    `INSERT INTO wor_events (slug, name, published, seasons, registry_units, map_stats, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, now())
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       published = EXCLUDED.published,
       seasons = EXCLUDED.seasons,
       registry_units = EXCLUDED.registry_units,
       map_stats = EXCLUDED.map_stats,
       updated_at = now()
     RETURNING slug, name, published, seasons, registry_units, map_stats, created_at, updated_at,
       (SELECT count(*) FROM wor_scoreboards s WHERE s.event_slug = $1) AS scoreboard_count`,
    [
      slug,
      meta.name,
      !!meta.published,
      sized(meta.seasons ?? []),
      sized(meta.registryUnits ?? []),
      meta.mapStats == null ? null : sized(meta.mapStats),
    ],
  );
  return toEvent(rows[0]);
}

/** Remove an event. Its rounds and documents go with it, by foreign key. */
export async function deleteEvent(slug) {
  const rows = await query(
    `WITH gone AS (DELETE FROM wor_scoreboards WHERE event_slug = $1 RETURNING 1)
     SELECT count(*)::int AS n FROM gone`,
    [slug],
  );
  await query('DELETE FROM wor_events WHERE slug = $1', [slug]);
  return Number(rows[0]?.n ?? 0);
}

// --- Scoreboards ----------------------------------------------------------

/**
 * Whether the round in `s` has a replay. Chunk 0 goes up last, so its presence
 * means the whole replay is stored.
 */
const HAS_REPLAY = `EXISTS (SELECT 1 FROM wor_replays r
  WHERE r.event_slug = s.event_slug AND r.scoreboard_id = s.id AND r.idx = 0)`;

function toSummary(row) {
  return {
    id: row.id,
    eventId: row.event_slug,
    ...(row.week_id ? { binding: { weekId: row.week_id, round: Number(row.round) } } : {}),
    sourceFilename: row.source_filename,
    recordedAt: row.recorded_at,
    map: row.map,
    mode: row.mode,
    area: row.area,
    winner: row.winner,
    roundStartTime: row.round_start_time ?? null,
    ...(row.has_replay ? { hasReplay: true } : {}),
  };
}

/**
 * Every round's id and payload size, in id order. The cheap half of a bulk
 * read: it is what lets the server cut pages on a byte budget without pulling
 * a single killfeed to find out how big one is.
 */
export async function scoreboardSizes(slug, weekIds = null) {
  // pg_column_size covers rounds stored before the size was recorded: it reads
  // the compressed on-disk size without decompressing, so it is cheap and close
  // enough to cut pages by.
  const size = 'COALESCE(NULLIF(payload_bytes, 0), pg_column_size(payload)) AS bytes';
  const rows = weekIds
    ? await query(
        `SELECT id, ${size} FROM wor_scoreboards
          WHERE event_slug = $1 AND week_id = ANY($2) ORDER BY id`,
        [slug, weekIds],
      )
    : await query(
        `SELECT id, ${size} FROM wor_scoreboards WHERE event_slug = $1 ORDER BY id`,
        [slug],
      );
  return rows.map((r) => ({ id: r.id, bytes: Number(r.bytes) }));
}

/** Summary rows for every round in an event — the list view's whole payload. */
export async function listSummaries(slug) {
  const rows = await query(
    `SELECT id, event_slug, source_filename, recorded_at, map, mode, area, winner, week_id, round,
            payload #>> '{scoreboard,meta,roundStartTime}' AS round_start_time,
            ${HAS_REPLAY} AS has_replay
       FROM wor_scoreboards s WHERE event_slug = $1 ORDER BY recorded_at DESC NULLS LAST, id`,
    [slug],
  );
  return rows.map(toSummary);
}

/**
 * A stored record, flagged when the round has a replay to watch. The flag is
 * the table's to say, so one that came back up inside a payload is dropped.
 */
function toRecord(row) {
  const record = asJson(row.payload);
  if (!record) return record;
  const { hasReplay: _stale, ...rest } = record;
  return row.has_replay ? { ...rest, hasReplay: true } : rest;
}

export async function getScoreboard(slug, id) {
  const rows = await query(
    `SELECT payload, ${HAS_REPLAY} AS has_replay FROM wor_scoreboards s WHERE event_slug = $1 AND id = $2`,
    [slug, id],
  );
  return rows.length ? toRecord(rows[0]) : null;
}

/**
 * Several rounds at once, in the order asked for.
 *
 * `withJoinLog` keeps the join/leave log. It is off by default because no stat
 * or view reads that log while it is a twelfth of what a round weighs, and the
 * bulk read is the one request a visitor waits on. Postgres drops it from the
 * document before the row is ever sent, so it costs nothing to leave out.
 */
export async function getScoreboards(slug, ids, { withJoinLog = false } = {}) {
  if (!ids.length) return [];
  const payload = withJoinLog ? 'payload' : `payload #- '{scoreboard,joinLeaves}'`;
  const rows = await query(
    `SELECT id, ${payload} AS payload, ${HAS_REPLAY} AS has_replay
       FROM wor_scoreboards s WHERE event_slug = $1 AND id = ANY($2)`,
    [slug, ids],
  );
  const byId = new Map(rows.map((r) => [r.id, toRecord(r)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** Upsert one round: its payload, and the columns a list view reads. */
/**
 * Upsert one round and mark its event as changed, in a single statement.
 *
 * The timestamp matters because it is what a cached read is tagged with: a
 * round replaced in place leaves the count alone, so without touching the event
 * a stale copy would keep being served. Doing it in the same round trip means
 * importing a season costs one query a round rather than four.
 */
export async function putScoreboard(slug, id, record, summary) {
  const payload = sized(record);
  await query(
    `WITH saved AS (
     INSERT INTO wor_scoreboards
       (event_slug, id, source_filename, recorded_at, map, mode, area, winner, week_id, round, payload, payload_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
     ON CONFLICT (event_slug, id) DO UPDATE SET
       source_filename = EXCLUDED.source_filename,
       recorded_at = EXCLUDED.recorded_at,
       map = EXCLUDED.map,
       mode = EXCLUDED.mode,
       area = EXCLUDED.area,
       winner = EXCLUDED.winner,
       week_id = EXCLUDED.week_id,
       round = EXCLUDED.round,
       payload = EXCLUDED.payload,
       payload_bytes = EXCLUDED.payload_bytes
     RETURNING 1
   )
   UPDATE wor_events SET updated_at = now() WHERE slug = $1`,
    [
      slug,
      id,
      String(summary.sourceFilename ?? ''),
      summary.recordedAt ?? null,
      summary.map ?? null,
      summary.mode ?? null,
      summary.area ?? null,
      summary.winner ?? null,
      summary.binding?.weekId != null ? String(summary.binding.weekId) : null,
      summary.binding?.round ?? null,
      payload,
      Buffer.byteLength(payload, 'utf8'),
    ],
  );
}

export async function deleteScoreboard(slug, id) {
  await query(
    `WITH gone AS (
       DELETE FROM wor_scoreboards WHERE event_slug = $1 AND id = $2 RETURNING 1
     )
     UPDATE wor_events SET updated_at = now() WHERE slug = $1`,
    [slug, id],
  );
}

// --- Replays --------------------------------------------------------------

/**
 * Store one chunk of a round's replay. `chunk` is base64; it is kept as bytes.
 *
 * Returns false when the round does not exist, so the caller can say so rather
 * than tripping the foreign key.
 *
 * The client writes chunk 0 last, so a replay only counts as attached (see
 * HAS_REPLAY) once every chunk is in. Landing it drops any chunks past `total`
 * left by a longer replay this one replaces, and marks the event as changed so
 * cached reads are retired. Someone reading while a replacement goes up can
 * catch a mix of old and new chunks; that window is the owner's own upload.
 */
export async function putReplayChunk(slug, id, idx, total, chunk) {
  const rows = await query(
    `INSERT INTO wor_replays (event_slug, scoreboard_id, idx, total, chunk)
     SELECT $1, $2, $3, $4, decode($5, 'base64')
      WHERE EXISTS (SELECT 1 FROM wor_scoreboards WHERE event_slug = $1 AND id = $2)
     ON CONFLICT (event_slug, scoreboard_id, idx) DO UPDATE SET
       total = EXCLUDED.total, chunk = EXCLUDED.chunk
     RETURNING 1`,
    [slug, id, idx, total, chunk],
  );
  if (!rows.length) return false;
  if (idx === 0) {
    await query(
      `WITH gone AS (
         DELETE FROM wor_replays WHERE event_slug = $1 AND scoreboard_id = $2 AND idx >= $3 RETURNING 1
       )
       UPDATE wor_events SET updated_at = now() WHERE slug = $1`,
      [slug, id, total],
    );
  }
  return true;
}

/** One chunk, as base64, and how many make up the replay; null when absent. */
export async function getReplayChunk(slug, id, idx) {
  const rows = await query(
    `SELECT total, translate(encode(chunk, 'base64'), E'\\n', '') AS chunk
       FROM wor_replays WHERE event_slug = $1 AND scoreboard_id = $2 AND idx = $3`,
    [slug, id, idx],
  );
  return rows.length ? { chunk: rows[0].chunk, total: Number(rows[0].total) } : null;
}

export async function deleteReplay(slug, id) {
  await query(
    `WITH gone AS (
       DELETE FROM wor_replays WHERE event_slug = $1 AND scoreboard_id = $2 RETURNING 1
     ), unlearned AS (
       -- without its replay the round has nothing to teach the round model
       DELETE FROM wor_round_samples WHERE event_slug = $1 AND scoreboard_id = $2 RETURNING 1
     )
     UPDATE wor_events SET updated_at = now() WHERE slug = $1`,
    [slug, id],
  );
}

// --- Per-event documents --------------------------------------------------

async function getDoc(slug, kind, fallback) {
  const rows = await query(
    'SELECT doc FROM wor_event_docs WHERE event_slug = $1 AND kind = $2',
    [slug, kind],
  );
  return rows.length ? asJson(rows[0].doc, fallback) : fallback;
}

async function putDoc(slug, kind, doc) {
  await query(
    `INSERT INTO wor_event_docs (event_slug, kind, doc, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (event_slug, kind) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [slug, kind, sized(doc)],
  );
}

export const getAssignments = (slug) => getDoc(slug, DOC_KINDS.assignments, {});
export const putAssignments = (slug, scoped) => putDoc(slug, DOC_KINDS.assignments, scoped);

export const getAliases = (slug) => getDoc(slug, DOC_KINDS.aliases, {});
export const putAliases = (slug, scoped) => putDoc(slug, DOC_KINDS.aliases, scoped);

/**
 * The tracker's own state — weeks, rosters, settings, brackets. Public to read
 * once the event is published, since the site shows the season as well as the
 * player stats; owner-only to write.
 */
export const getTracker = (slug) => getDoc(slug, DOC_KINDS.tracker, null);
export const putTracker = (slug, state) => putDoc(slug, DOC_KINDS.tracker, state);

// --- Round model --------------------------------------------------------------
// The replay viewer's win model trains itself on the events' season rounds; see
// roundModel.js for when. These are its reads and writes.

/** A round's whole replay as the packed bytes the viewer decodes, or null. */
export async function getReplayBytes(slug, id) {
  const rows = await query(
    `SELECT translate(encode(chunk, 'base64'), E'\\n', '') AS chunk
       FROM wor_replays WHERE event_slug = $1 AND scoreboard_id = $2 ORDER BY idx`,
    [slug, id],
  );
  return rows.length ? new Uint8Array(Buffer.concat(rows.map((r) => Buffer.from(r.chunk, 'base64')))) : null;
}

/** Store a round's training sample (null: its replay couldn't be read as a round). */
export async function putRoundSample(slug, id, version, sample) {
  await query(
    `INSERT INTO wor_round_samples (event_slug, scoreboard_id, version, sample)
     SELECT $1, $2, $3, $4::jsonb
      WHERE EXISTS (SELECT 1 FROM wor_scoreboards WHERE event_slug = $1 AND id = $2)
     ON CONFLICT (event_slug, scoreboard_id) DO UPDATE SET
       version = EXCLUDED.version, sample = EXCLUDED.sample`,
    [slug, id, version, sample == null ? null : JSON.stringify(sample)],
  );
}

/** Season rounds (bound to a night) with a replay but no sample of `version`, `limit` at a time. */
export async function roundsNeedingSamples(version, limit) {
  return query(
    `SELECT s.event_slug AS slug, s.id
       FROM wor_scoreboards s
       JOIN wor_replays r ON r.event_slug = s.event_slug AND r.scoreboard_id = s.id AND r.idx = 0
       LEFT JOIN wor_round_samples rs ON rs.event_slug = s.event_slug AND rs.scoreboard_id = s.id
      WHERE rs.version IS NULL OR rs.version <> $1
      ORDER BY s.event_slug, s.id
      LIMIT $2`,
    [version, limit],
  );
}

/**
 * A fingerprint of everything the model is fitted from: every round, its winner,
 * its size (a re-upload), and its sample. Cheap -- no
 * payload is read -- so it can be asked on every request.
 */
export async function roundModelInputs() {
  const rows = await query(
    `SELECT md5(coalesce(string_agg(
              concat_ws('/', s.event_slug, s.id, s.winner, s.payload_bytes, rs.version, rs.sample IS NULL),
              ',' ORDER BY s.event_slug, s.id), '')) AS inputs
       FROM wor_scoreboards s
       LEFT JOIN wor_round_samples rs ON rs.event_slug = s.event_slug AND rs.scoreboard_id = s.id`,
  );
  return rows[0].inputs;
}

/** Every round, for calibration, with its sample where it has one. */
export async function roundModelData() {
  const rows = await query(
    `SELECT s.event_slug AS slug, s.id, s.winner,
            s.map, s.mode, s.area, s.payload -> 'scoreboard' -> 'meta' AS meta, rs.version, rs.sample
       FROM wor_scoreboards s
       LEFT JOIN wor_round_samples rs ON rs.event_slug = s.event_slug AND rs.scoreboard_id = s.id`,
  );
  return rows.map((r) => ({
    slug: r.slug, id: r.id, winner: r.winner,
    map: r.map, mode: r.mode, area: r.area, meta: asJson(r.meta, {}), sample: asJson(r.sample),
  }));
}

/** The stored model and the inputs it was fitted from, or null before the first fit. */
export async function getRoundModel() {
  const rows = await query(`SELECT model, inputs FROM wor_round_model WHERE id = 1`);
  return rows.length ? { model: asJson(rows[0].model), inputs: rows[0].inputs } : null;
}

export async function putRoundModel(model, inputs) {
  await query(
    `INSERT INTO wor_round_model (id, model, inputs, trained_at) VALUES (1, $1::jsonb, $2, now())
     ON CONFLICT (id) DO UPDATE SET model = EXCLUDED.model, inputs = EXCLUDED.inputs, trained_at = now()`,
    [model == null ? null : JSON.stringify(model), inputs],
  );
}

// --- Share links ----------------------------------------------------------

/**
 * Share chunks are content-addressed and written once: the id is a hash of the
 * payload, so a row that exists already holds these exact bytes. Insert-or-
 * ignore means a re-share is a no-op and — the part that matters — nobody can
 * rewrite what sits behind a link somebody else already has. A repeat share
 * pushes the expiry out instead, so it does not lapse a year after the first.
 */
export async function putShareChunk(id, idx, chunk) {
  await query(
    `INSERT INTO wor_shares (id, idx, chunk, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)
     ON CONFLICT (id, idx) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [id, idx, chunk, String(SHARE_TTL_SECONDS)],
  );
}

export async function getShareChunk(id, idx) {
  const rows = await query(
    'SELECT chunk FROM wor_shares WHERE id = $1 AND idx = $2 AND expires_at > now()',
    [id, idx],
  );
  return rows.length ? rows[0].chunk : null;
}
