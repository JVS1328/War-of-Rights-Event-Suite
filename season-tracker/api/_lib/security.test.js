import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { startTestDb, truncateAll } from './testDb.js';

/**
 * The properties that matter more than any feature: who may write, what a
 * stranger may read, and what a shared cache is allowed to keep.
 */
const { default: handler } = await import('./router.js');

const PASS = 'admin-pass-long-enough';
let db;

const call = async (method, path, { body, query = {}, auth = false, headers = {} } = {}) => {
  const sent = {};
  const res = {
    statusCode: 200,
    body: undefined,
    setHeader(k, v) { sent[k.toLowerCase()] = v; },
    end() { return res; },
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  await handler({
    method,
    url: `/api/db?path=${encodeURIComponent(path)}`,
    body,
    query: { path, ...query },
    headers: { ...(auth ? { authorization: `Bearer ${PASS}` } : {}), ...headers },
  }, res);
  return { ...res, headers: sent };
};

const scoreboard = () => ({ sourceFilename: 'r1.csv', meta: { map: 'Bloody Lane' }, players: [], kills: [] });
const summary = (id) => ({ id, eventId: 'ssl', sourceFilename: 'r1.csv', recordedAt: null });

beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await truncateAll(db);
  process.env.ADMIN_PASS = PASS;
});

describe('who may write', () => {
  const writes = [
    ['POST', 'events', { body: { slug: 'ssl' } }],
    ['DELETE', 'events/ssl', {}],
    ['PUT', 'events/ssl/tracker', { body: { state: {} } }],
    ['PUT', 'events/ssl/assignments', { body: { assignments: {} } }],
    ['PUT', 'events/ssl/aliases', { body: { aliases: {} } }],
    ['PUT', 'events/ssl/scoreboard', { query: { id: 'ssl::r1.csv' }, body: { record: {}, summary: {} } }],
    ['DELETE', 'events/ssl/scoreboard', { query: { id: 'ssl::r1.csv' } }],
  ];

  it.each(writes)('refuses %s %s without the pass', async (method, path, opts) => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    expect((await call(method, path, opts)).statusCode).toBe(401);
  });

  it.each(writes)('refuses %s %s with the wrong pass', async (method, path, opts) => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    const res = await call(method, path, { ...opts, headers: { authorization: 'Bearer not-the-right-pass' } });
    expect(res.statusCode).toBe(401);
  });

  it('refuses every write when the deployment has no pass set', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    delete process.env.ADMIN_PASS;
    for (const [method, path, opts] of writes) {
      expect((await call(method, path, opts ?? {})).statusCode).toBe(401);
    }
  });

  it('refuses a pass too short to be one', async () => {
    process.env.ADMIN_PASS = 'short';
    expect((await call('POST', 'events', { body: { slug: 'x' }, auth: true })).statusCode).toBe(401);
  });
});

describe('what a stranger may read', () => {
  beforeEach(async () => {
    await call('POST', 'events', { body: { slug: 'ssl', name: 'SSL', published: false }, auth: true });
    await call('PUT', 'events/ssl/tracker', { body: { state: { secret: 'unreleased season' } }, auth: true });
    await call('PUT', 'events/ssl/scoreboard', {
      query: { id: 'ssl::r1.csv' }, auth: true,
      body: { record: { scoreboard: scoreboard() }, summary: summary('ssl::r1.csv') },
    });
  });

  const reads = ['events/ssl', 'events/ssl/tracker', 'events/ssl/scoreboards', 'events/ssl/assignments', 'events/ssl/aliases'];

  it.each(reads)('hides %s while the event is unpublished', async (path) => {
    expect((await call('GET', path)).statusCode).toBe(404);
  });

  it('keeps an unpublished event out of the directory', async () => {
    expect((await call('GET', 'events')).body.events).toEqual([]);
  });

  it('does not distinguish an unpublished event from one that never existed', async () => {
    const hidden = await call('GET', 'events/ssl');
    const absent = await call('GET', 'events/nothing-here');
    expect(hidden.statusCode).toBe(absent.statusCode);
    expect(hidden.body).toEqual(absent.body);
  });

  it('refuses a round id belonging to another event', async () => {
    await call('POST', 'events', { body: { slug: 'other', published: true }, auth: true });
    const res = await call('GET', 'events/other/scoreboard', { query: { id: 'ssl::r1.csv' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('what a shared cache may keep', () => {
  it('never lets a proxy hold an unpublished event', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: false }, auth: true });
    await call('PUT', 'events/ssl/tracker', { body: { state: { secret: 1 } }, auth: true });

    // The owner can read it — and that response must not be reusable by anyone.
    for (const path of ['events/ssl', 'events/ssl/tracker', 'events/ssl/scoreboards', 'events/ssl/aliases']) {
      const res = await call('GET', path, { auth: true });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('lets a proxy hold a published event for visitors, never for the owner', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    const visitor = await call('GET', 'events/ssl/scoreboards', { query: { full: '1' } });
    expect(visitor.headers['cache-control']).toMatch(/^public,/);
    // The owner reads right after writing; a held copy would undo the write on screen.
    const owner = await call('GET', 'events/ssl/scoreboards', { query: { full: '1' }, auth: true });
    expect(owner.headers['cache-control']).toBe('private, no-store');
  });

  it('stops sharing an event the moment it is unpublished', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    expect((await call('GET', 'events/ssl')).headers['cache-control']).toMatch(/^public,/);

    await call('POST', 'events', { body: { slug: 'ssl', published: false }, auth: true });
    expect((await call('GET', 'events/ssl', { auth: true })).headers['cache-control']).toBe('private, no-store');
  });

  it('never lets anything hold the sign-in check', async () => {
    expect((await call('GET', 'auth', { auth: true })).headers['cache-control']).toBe('private, no-store');
    expect((await call('GET', 'auth')).headers['cache-control']).toBe('private, no-store');
  });

  it('puts nothing a caller sent into a response header', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    const id = 'ssl::r1.csv';
    await call('PUT', 'events/ssl/scoreboard', {
      query: { id }, auth: true,
      body: { record: { scoreboard: scoreboard() }, summary: summary(id) },
    });

    // A week list is unvalidated caller input and it identifies the response,
    // so it must reach the ETag as a hash and never as itself.
    const res = await call('GET', 'events/ssl/scoreboards', {
      query: { full: '1', weeks: 'w1,\r\nX-Injected: yes' },
    });
    const etag = String(res.headers.etag);
    expect(etag).not.toMatch(/[\r\n]/);
    expect(etag).not.toContain('X-Injected');
    expect(etag).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
  });
});

describe('bad input is refused, not crashed on', () => {
  beforeEach(async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
  });

  it.each([
    ['a slug that is not one', 'POST', 'events', { body: { slug: '../../etc/passwd' } }],
    ['a slug with a quote', 'POST', 'events', { body: { slug: "ssl'; DROP TABLE wor_events; --" } }],
    ['a body that is not an object', 'POST', 'events', { body: 'nope' }],
    ['a missing round id', 'PUT', 'events/ssl/scoreboard', { body: { record: {}, summary: {} } }],
    ['a tracker state that is not an object', 'PUT', 'events/ssl/tracker', { body: { state: 'nope' } }],
    ['aliases that are not a map', 'PUT', 'events/ssl/aliases', { body: { aliases: [] } }],
  ])('refuses %s', async (_label, method, path, opts) => {
    const res = await call(method, path, { ...opts, auth: true });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('leaves the tables standing after an injection attempt', async () => {
    await call('POST', 'events', { body: { slug: "x'; DROP TABLE wor_events; --" }, auth: true });
    await call('GET', 'events/ssl/scoreboards', { query: { weeks: "w1'; DROP TABLE wor_scoreboards; --", full: '1' } });
    const rows = await db.query("SELECT count(*)::int AS n FROM wor_events");
    expect(rows[0].n).toBe(1);
  });

  it('clamps a page number rather than trusting it', async () => {
    for (const page of ['-5', '99999', 'NaN', 'Infinity']) {
      const res = await call('GET', 'events/ssl/scoreboards', { query: { full: '1', page } });
      expect(res.statusCode).toBe(200);
      expect(res.body.page).toBeGreaterThanOrEqual(0);
    }
  });

  it('says the database is missing without saying anything else', async () => {
    const res = await call('GET', 'events/ssl/scoreboards', { query: { full: '1' } });
    expect(JSON.stringify(res.body)).not.toMatch(/postgres:|neon\.tech|password/i);
  });
});
