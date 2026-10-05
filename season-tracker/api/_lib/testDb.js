import { createPglite } from './pgliteClient.js';
import { ensureSchema, setSql } from './sql.js';

/**
 * A fresh database for one test file.
 *
 * The tests run against PGlite rather than a stand-in object, so the SQL in
 * store.js is genuinely executed: a typo, a column that does not exist, a
 * conflict clause that does not do what it looks like — all of them fail here
 * instead of on the deployment.
 */
export async function startTestDb() {
  const client = await createPglite();
  setSql(client);
  await ensureSchema();
  return client;
}

/** Empty every table, so each test starts from nothing without a new database. */
export async function truncateAll(client) {
  await client.query(
    'TRUNCATE wor_round_model, wor_round_samples, wor_shares, wor_replays, wor_event_docs, wor_scoreboards, wor_events RESTART IDENTITY CASCADE',
  );
}
