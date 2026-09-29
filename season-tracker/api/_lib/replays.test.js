import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { startTestDb, truncateAll } from './testDb.js';

const { default: handler } = await import('./router.js');

const PASS = 'admin-pass-long-enough';
const ID = 'ssl::round1.csv';
let db;

const makeRes = () => {
  const res = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  return res;
};

const call = async (method, path, { body, query = {}, auth = false } = {}) => {
  const res = makeRes();
  await handler({
    method,
    body,
    query: { path: path.split('/').filter(Boolean), ...query },
    headers: auth ? { authorization: `Bearer ${PASS}` } : {},
  }, res);
  return res;
};

const b64 = (s) => Buffer.from(s).toString('base64');

const seed = async ({ published = true } = {}) => {
  await call('POST', 'events', { body: { slug: 'ssl', name: 'SSL', published }, auth: true });
  await call('PUT', 'events/ssl/scoreboard', {
    query: { id: ID },
    body: {
      record: { scoreboard: { sourceFilename: 'round1.csv', meta: { map: 'Antietam' } } },
      summary: { sourceFilename: 'round1.csv', map: 'Antietam' },
    },
    auth: true,
  });
};

/** Upload `parts` the way the client does: every chunk after the first, then chunk 0. */
const upload = async (parts) => {
  const order = [...parts.keys()].slice(1).concat(0);
  for (const idx of order) {
    const res = await call('PUT', 'events/ssl/replay', {
      query: { id: ID, idx: String(idx) },
      body: { chunk: b64(parts[idx]), total: parts.length },
      auth: true,
    });
    expect(res.statusCode).toBe(200);
  }
};

const read = (idx, auth = false) => call('GET', 'events/ssl/replay', { query: { id: ID, idx: String(idx) }, auth });
const text = (res) => Buffer.from(res.body.chunk, 'base64').toString();

beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await truncateAll(db);
  process.env.ADMIN_PASS = PASS;
});

describe('replays', () => {
  it('stores a replay in chunks and serves it back byte for byte', async () => {
    await seed();
    await upload(['first half,', 'second half']);

    const zero = await read(0);
    expect(zero.statusCode).toBe(200);
    expect(zero.body.total).toBe(2);
    expect(text(zero) + text(await read(1))).toBe('first half,second half');
  });

  it('flags the round as having a replay in lists and full reads', async () => {
    await seed();
    const before = await call('GET', 'events/ssl/scoreboards');
    expect(before.body.scoreboards[0].hasReplay).toBeUndefined();

    await upload(['x']);
    expect((await call('GET', 'events/ssl/scoreboards')).body.scoreboards[0].hasReplay).toBe(true);
    expect((await call('GET', 'events/ssl/scoreboard', { query: { id: ID } })).body.scoreboard.hasReplay).toBe(true);
    const full = await call('GET', 'events/ssl/scoreboards', { query: { full: '1' } });
    expect(full.body.items[0].hasReplay).toBe(true);
  });

  it('does not count a replay as attached until chunk 0 lands', async () => {
    await seed();
    await call('PUT', 'events/ssl/replay', {
      query: { id: ID, idx: '1' }, body: { chunk: b64('tail'), total: 2 }, auth: true,
    });
    expect((await call('GET', 'events/ssl/scoreboards')).body.scoreboards[0].hasReplay).toBeUndefined();
  });

  it('drops the leftover chunks of a longer replay it replaces', async () => {
    await seed();
    await upload(['a', 'b', 'c']);
    await upload(['short']);
    expect((await read(0)).body.total).toBe(1);
    expect((await read(1)).statusCode).toBe(404);
    expect((await read(2)).statusCode).toBe(404);
  });

  it('retires cached reads when a replay changes', async () => {
    await seed();
    await upload(['one']);
    const first = (await read(0)).headers.etag;
    await upload(['two']);
    expect((await read(0)).headers.etag).not.toBe(first);
  });

  it('only lets the owner write or detach', async () => {
    await seed();
    const put = await call('PUT', 'events/ssl/replay', {
      query: { id: ID, idx: '0' }, body: { chunk: b64('x'), total: 1 },
    });
    expect(put.statusCode).toBe(401);
    await upload(['x']);
    expect((await call('DELETE', 'events/ssl/replay', { query: { id: ID } })).statusCode).toBe(401);

    expect((await call('DELETE', 'events/ssl/replay', { query: { id: ID }, auth: true })).statusCode).toBe(200);
    expect((await read(0)).statusCode).toBe(404);
  });

  it('hides an unpublished event’s replay and never lets a proxy keep it', async () => {
    await seed({ published: false });
    await upload(['x']);
    expect((await read(0)).statusCode).toBe(404);
    const owner = await read(0, true);
    expect(owner.statusCode).toBe(200);
    expect(owner.headers['cache-control']).toBe('private, no-store');
  });

  it('refuses a replay for a round that does not exist', async () => {
    await seed();
    const res = await call('PUT', 'events/ssl/replay', {
      query: { id: 'ssl::nope.csv', idx: '0' }, body: { chunk: b64('x'), total: 1 }, auth: true,
    });
    expect(res.statusCode).toBe(404);
  });

  it('goes with its round, and with its event', async () => {
    await seed();
    await upload(['x']);
    await call('DELETE', 'events/ssl/scoreboard', { query: { id: ID }, auth: true });
    expect((await db.query('SELECT count(*)::int AS n FROM wor_replays'))[0].n).toBe(0);

    await seed();
    await upload(['x']);
    await call('DELETE', 'events/ssl', { auth: true });
    expect((await db.query('SELECT count(*)::int AS n FROM wor_replays'))[0].n).toBe(0);
  });

  it('keeps the replay when its round is re-imported', async () => {
    await seed();
    await upload(['x']);
    await seed();
    expect((await read(0)).statusCode).toBe(200);
  });

  it('ignores a replay flag a caller tries to store inside a round', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    await call('PUT', 'events/ssl/scoreboard', {
      query: { id: ID },
      body: { record: { hasReplay: true, scoreboard: { sourceFilename: 'round1.csv' } }, summary: { hasReplay: true } },
      auth: true,
    });
    expect((await call('GET', 'events/ssl/scoreboard', { query: { id: ID } })).body.scoreboard.hasReplay).toBeUndefined();
  });

  it('refuses malformed chunks, indexes and totals', async () => {
    await seed();
    const put = (query, body) => call('PUT', 'events/ssl/replay', { query: { id: ID, ...query }, body, auth: true });
    expect((await put({ idx: '0' }, { chunk: 'not base64!', total: 1 })).statusCode).toBe(400);
    expect((await put({ idx: '0' }, { chunk: '', total: 1 })).statusCode).toBe(400);
    expect((await put({ idx: '1' }, { chunk: b64('x'), total: 1 })).statusCode).toBe(400);
    expect((await put({ idx: '-1' }, { chunk: b64('x'), total: 1 })).statusCode).toBe(400);
    expect((await put({ idx: '0' }, { chunk: b64('x'), total: 9999 })).statusCode).toBe(400);
    expect((await call('GET', 'events/ssl/replay', { query: { id: 'other::a.csv', idx: '0' } })).statusCode).toBe(400);
  });
});
