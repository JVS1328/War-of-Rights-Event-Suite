/**
 * The database, as tables.
 *
 * The shape follows how the site reads: an event row is what the directory
 * lists, a scoreboard row is one round (its replay rides beside it, in chunks,
 * in wor_replays), and the summary columns beside its payload are there so a
 * list view never has to load a killfeed.
 * Everything else an event owns — pins, renames, the tracker's own state — is
 * a single JSON document keyed by the event, because that is exactly how the
 * screens hold them and nothing queries inside them.
 *
 * The DDL is idempotent and runs once per cold start, so a fresh Neon database
 * needs no migration step: point WOR_DATABASE_URL at it and the first request
 * builds what it needs.
 */
/**
 * One statement, because it is nine round trips otherwise.
 *
 * The schema is created on the first request after a cold start rather than by
 * a migration step, so a fresh Neon database needs nothing but its URL. Sending
 * each CREATE separately meant the first visitor after an idle period waited
 * for nine round trips before anything was read; a DO block is one.
 *
 * Everything here is idempotent, so it is safe to run against a database that
 * already has it all.
 */
export const SCHEMA = `DO $$ BEGIN

  CREATE TABLE IF NOT EXISTS wor_events (
    slug             TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    published        BOOLEAN NOT NULL DEFAULT FALSE,
    seasons          JSONB NOT NULL DEFAULT '[]'::jsonb,
    registry_units   JSONB NOT NULL DEFAULT '[]'::jsonb,
    map_stats        JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- The directory lists published events, most recently touched first.
  CREATE INDEX IF NOT EXISTS wor_events_published_idx
    ON wor_events (published, updated_at DESC);

  CREATE TABLE IF NOT EXISTS wor_scoreboards (
    event_slug       TEXT NOT NULL REFERENCES wor_events(slug) ON DELETE CASCADE,
    id               TEXT NOT NULL,
    source_filename  TEXT NOT NULL,
    recorded_at      TEXT,
    map              TEXT,
    mode             TEXT,
    area             TEXT,
    winner           TEXT,
    week_id          TEXT,
    round            SMALLINT,
    payload          JSONB NOT NULL,
    -- How big the payload is, recorded when it is written. Paging a bulk read
    -- needs every round's size to decide where to cut, and asking Postgres
    -- (octet_length(payload::text)) re-serializes every killfeed in the event
    -- to answer -- for every page. Writing it down once makes that free.
    payload_bytes    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (event_slug, id)
  );

  ALTER TABLE wor_scoreboards ADD COLUMN IF NOT EXISTS payload_bytes INTEGER NOT NULL DEFAULT 0;

  -- A round list is "every scoreboard in this event, newest first".
  CREATE INDEX IF NOT EXISTS wor_scoreboards_event_idx
    ON wor_scoreboards (event_slug, recorded_at DESC);

  -- A visitor reads one season, so the hot read filters on the night a round
  -- is bound to.
  CREATE INDEX IF NOT EXISTS wor_scoreboards_week_idx
    ON wor_scoreboards (event_slug, week_id);

  CREATE TABLE IF NOT EXISTS wor_event_docs (
    event_slug       TEXT NOT NULL REFERENCES wor_events(slug) ON DELETE CASCADE,
    kind             TEXT NOT NULL,
    doc              JSONB NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_slug, kind)
  );

  -- Share links: the short-link store, on the same database as everything else.
  -- Chunks are content-addressed and write-once; a manifest row (idx = -1) says
  -- how many there are.
  CREATE TABLE IF NOT EXISTS wor_shares (
    id               TEXT NOT NULL,
    idx              INTEGER NOT NULL,
    chunk            TEXT NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, idx)
  );

  CREATE INDEX IF NOT EXISTS wor_shares_expiry_idx ON wor_shares (expires_at);

  -- A round's replay (positions + artillery), as the compressed binary the
  -- viewer decodes, cut into chunks so no one request nears the platform's
  -- body cap. Keyed to its scoreboard, so it is visible exactly when that round
  -- is and goes with it when the round or the event is deleted.
  CREATE TABLE IF NOT EXISTS wor_replays (
    event_slug       TEXT NOT NULL,
    scoreboard_id    TEXT NOT NULL,
    idx              INTEGER NOT NULL,
    total            INTEGER NOT NULL,
    chunk            BYTEA NOT NULL,
    PRIMARY KEY (event_slug, scoreboard_id, idx),
    FOREIGN KEY (event_slug, scoreboard_id)
      REFERENCES wor_scoreboards (event_slug, id) ON DELETE CASCADE
  );

END $$;`;

/** The three documents an event owns beside its rounds. */
export const DOC_KINDS = { assignments: 'assignments', aliases: 'aliases', tracker: 'tracker' };
