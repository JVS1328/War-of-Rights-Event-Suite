import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { startTestDb, truncateAll } from './testDb.js';

const { default: handler } = await import('./router.js');

const PASS = 'admin-pass-long-enough';
let db;

const makeRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  return res;
};

/** Issue a request. `auth: true` presents the admin pass. */
const call = async (method, path, { body, query = {}, auth = false } = {}) => {
  const res = makeRes();
  const req = {
    method,
    body,
    query: { path: path.split('/').filter(Boolean), ...query },
    headers: auth ? { authorization: `Bearer ${PASS}` } : {},
  };
  await handler(req, res);
  return res;
};

const scoreboardOf = (name) => ({
  sourceFilename: name,
  recordedAt: '2026-01-01T00:00:00Z',
  players: [{ name: 'Pvt. Smith', steamId: '76561198000000001', kills: 3, deaths: 1 }],
  meta: { map: 'Bloody Lane', mode: 'Skirmish', area: null, winner: 'USA' },
});
const summaryOf = (id, name) => ({
  id, eventId: 'ssl', sourceFilename: name, recordedAt: '2026-01-01T00:00:00Z',
  map: 'Bloody Lane', mode: 'Skirmish', area: null, winner: 'USA',
});

beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await truncateAll(db);
  process.env.ADMIN_PASS = PASS;
});

describe('auth', () => {
  it('accepts the admin pass and rejects everything else', async () => {
    expect((await call('GET', 'auth', { auth: true })).body).toEqual({ admin: true, configured: true });
    expect((await call('GET', 'auth')).statusCode).toBe(401);
  });

  it('refuses every write when no admin pass is configured at all', async () => {
    delete process.env.ADMIN_PASS;
    const res = await call('POST', 'events', { body: { slug: 'ssl' }, auth: true });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/No admin pass is configured/);
  });

  it('refuses a pass too short to be worth having', async () => {
    process.env.ADMIN_PASS = 'short';
    expect((await call('GET', 'auth', { auth: true })).statusCode).toBe(401);
  });
});

describe('events', () => {
  it('creates an event, and only the owner may', async () => {
    expect((await call('POST', 'events', { body: { slug: 'ssl', name: 'SSL' } })).statusCode).toBe(401);

    const created = await call('POST', 'events', {
      body: { slug: 'ssl', name: 'SSL', published: true, seasons: [{ id: 's1', name: 'Season 1', weekIds: ['w1'] }] },
      auth: true,
    });
    expect(created.statusCode).toBe(201);
    expect(created.body.event).toMatchObject({ slug: 'ssl', name: 'SSL', published: true, scoreboardCount: 0 });
    expect(created.body.event.seasons).toEqual([{ id: 's1', name: 'Season 1', weekIds: ['w1'] }]);
  });

  it('rejects a slug that would not survive a URL', async () => {
    const res = await call('POST', 'events', { body: { slug: 'Not A Slug!' }, auth: true });
    expect(res.statusCode).toBe(400);
  });

  it('lists only published events, and hides an unpublished one from the public', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', name: 'SSL', published: true }, auth: true });
    await call('POST', 'events', { body: { slug: 'snf', name: 'SNF', published: false }, auth: true });

    const list = await call('GET', 'events');
    expect(list.body.events.map((e) => e.slug)).toEqual(['ssl']);

    expect((await call('GET', 'events/snf')).statusCode).toBe(404);
    expect((await call('GET', 'events/snf', { auth: true })).body.event.name).toBe('SNF');
  });

  it('drops an event out of the directory when it is unpublished again', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    await call('POST', 'events', { body: { slug: 'ssl', published: false }, auth: true });
    expect((await call('GET', 'events')).body.events).toEqual([]);
  });

  it('ignores server-owned fields a caller tries to set', async () => {
    const res = await call('POST', 'events', {
      body: { slug: 'ssl', createdAt: '1999-01-01T00:00:00Z', scoreboardCount: 9999 },
      auth: true,
    });
    expect(res.body.event.createdAt).not.toBe('1999-01-01T00:00:00Z');
    expect(res.body.event.scoreboardCount).toBe(0);
  });
});

describe('scoreboards', () => {
  const seed = async () => {
    await call('POST', 'events', { body: { slug: 'ssl', name: 'SSL', published: true }, auth: true });
    await call('PUT', 'events/ssl/scoreboard', {
      query: { id: 'ssl::round1.csv' },
      body: { record: { scoreboard: scoreboardOf('round1.csv') }, summary: summaryOf('ssl::round1.csv', 'round1.csv') },
      auth: true,
    });
  };

  it('saves a round and serves it back to anyone', async () => {
    await seed();
    const list = await call('GET', 'events/ssl/scoreboards');
    expect(list.body.scoreboards).toHaveLength(1);
    expect(list.body.scoreboards[0].map).toBe('Bloody Lane');

    const one = await call('GET', 'events/ssl/scoreboard', { query: { id: 'ssl::round1.csv' } });
    expect(one.body.scoreboard.scoreboard.sourceFilename).toBe('round1.csv');
  });

  it('keeps the event’s scoreboard count in step', async () => {
    await seed();
    expect((await call('GET', 'events/ssl')).body.event.scoreboardCount).toBe(1);
    await call('DELETE', 'events/ssl/scoreboard', { query: { id: 'ssl::round1.csv' }, auth: true });
    expect((await call('GET', 'events/ssl')).body.event.scoreboardCount).toBe(0);
  });

  it('keeps an attached replay when the round is uploaded again', async () => {
    await seed();
    const id = 'ssl::round1.csv';
    await call('PUT', 'events/ssl/replay', { query: { id, idx: '0' }, body: { chunk: 'AAAA', total: 1 }, auth: true });
    await call('PUT', 'events/ssl/scoreboard', {
      query: { id },
      body: { record: { scoreboard: scoreboardOf('round1.csv') }, summary: summaryOf(id, 'round1.csv') },
      auth: true,
    });
    const list = await call('GET', 'events/ssl/scoreboards', { auth: true });
    expect(list.body.scoreboards[0].hasReplay).toBe(true);
  });

  it('refuses writes from a visitor', async () => {
    await seed();
    const res = await call('PUT', 'events/ssl/scoreboard', {
      query: { id: 'ssl::round2.csv' },
      body: { record: { scoreboard: scoreboardOf('round2.csv') }, summary: summaryOf('ssl::round2.csv', 'round2.csv') },
    });
    expect(res.statusCode).toBe(401);
    expect((await call('GET', 'events/ssl/scoreboards')).body.scoreboards).toHaveLength(1);
  });

  it('refuses an id that does not belong to the event', async () => {
    await seed();
    const res = await call('GET', 'events/ssl/scoreboard', { query: { id: 'other::round1.csv' } });
    expect(res.statusCode).toBe(400);
  });

  it('serves every round in one page when they fit, and says so', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    for (const n of ['a', 'b', 'c']) {
      await call('PUT', 'events/ssl/scoreboard', {
        query: { id: `ssl::${n}.csv` },
        body: { record: { scoreboard: scoreboardOf(`${n}.csv`) }, summary: summaryOf(`ssl::${n}.csv`, `${n}.csv`) },
        auth: true,
      });
    }
    const page = await call('GET', 'events/ssl/scoreboards', { query: { full: '1' } });
    expect(page.body.items.map((i) => i.id)).toEqual(['ssl::a.csv', 'ssl::b.csv', 'ssl::c.csv']);
    // One page, so a client knows immediately there is nothing else to ask for.
    expect(page.body).toMatchObject({ page: 0, pages: 1, next: null });
  });

  it('numbers its pages, so a client can ask for them all at once', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    for (const n of ['a', 'b', 'c']) {
      await call('PUT', 'events/ssl/scoreboard', {
        query: { id: `ssl::${n}.csv` },
        body: { record: { scoreboard: scoreboardOf(`${n}.csv`) }, summary: summaryOf(`ssl::${n}.csv`, `${n}.csv`) },
        auth: true,
      });
    }
    // Page boundaries come from the payload sizes alone, so asking twice gives
    // the same answer — which is what makes fetching them in parallel safe.
    const first = await call('GET', 'events/ssl/scoreboards', { query: { full: '1', page: '0' } });
    const again = await call('GET', 'events/ssl/scoreboards', { query: { full: '1', page: '0' } });
    expect(again.body.items.map((i) => i.id)).toEqual(first.body.items.map((i) => i.id));

    // A page past the end clamps rather than erroring, so a stale count is safe.
    const past = await call('GET', 'events/ssl/scoreboards', { query: { full: '1', page: '99' } });
    expect(past.body.page).toBe(first.body.pages - 1);
  });

  it('leaves the join/leave log out of a bulk read, and includes it when asked', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    const sb = { ...scoreboardOf('a.csv'), joinLeaves: [{ tsInRound: '00:01', name: 'Pvt. Smith', steamId: '1', action: 'joined' }] };
    await call('PUT', 'events/ssl/scoreboard', {
      query: { id: 'ssl::a.csv' },
      body: { record: { scoreboard: sb }, summary: summaryOf('ssl::a.csv', 'a.csv') },
      auth: true,
    });

    const lean = await call('GET', 'events/ssl/scoreboards', { query: { full: '1' } });
    expect(lean.body.items[0].scoreboard.joinLeaves).toBeUndefined();

    const full = await call('GET', 'events/ssl/scoreboards', { query: { full: '1', log: '1' } });
    expect(full.body.items[0].scoreboard.joinLeaves).toHaveLength(1);

    // The stored round is untouched either way — one round read whole still has it.
    const one = await call('GET', 'events/ssl/scoreboard', { query: { id: 'ssl::a.csv' } });
    expect(one.body.scoreboard.scoreboard.joinLeaves).toHaveLength(1);
  });
});

describe('assignments and aliases', () => {
  beforeEach(async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
  });

  it('round-trips season-scoped pins, readable by anyone', async () => {
    await call('PUT', 'events/ssl/assignments', {
      body: { assignments: { overall: { '765611980000': '1stTX' }, s2: { '765611980000': '2ndSC' } } },
      auth: true,
    });
    const res = await call('GET', 'events/ssl/assignments');
    expect(res.body.assignments.s2['765611980000']).toBe('2ndSC');
  });

  it('round-trips aliases and refuses an unauthenticated write', async () => {
    expect((await call('PUT', 'events/ssl/aliases', { body: { aliases: { overall: { a: 'b' } } } })).statusCode).toBe(401);
    await call('PUT', 'events/ssl/aliases', { body: { aliases: { overall: { a: 'b' } } }, auth: true });
    expect((await call('GET', 'events/ssl/aliases')).body.aliases).toEqual({ overall: { a: 'b' } });
  });
});

describe('tracker state', () => {
  beforeEach(async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
  });

  it('is readable by anyone once the event is published, writable only by the owner', async () => {
    expect((await call('PUT', 'events/ssl/tracker', { body: { state: { weeks: [] } } })).statusCode).toBe(401);

    await call('PUT', 'events/ssl/tracker', { body: { state: { weeks: [] } }, auth: true });
    expect((await call('GET', 'events/ssl/tracker')).body.state).toEqual({ weeks: [] });
  });

  it('stays hidden while the event is unpublished', async () => {
    await call('PUT', 'events/ssl/tracker', { body: { state: { weeks: [] } }, auth: true });
    await call('POST', 'events', { body: { slug: 'ssl', published: false }, auth: true });

    expect((await call('GET', 'events/ssl/tracker')).statusCode).toBe(404);
    expect((await call('GET', 'events/ssl/tracker', { auth: true })).body.state).toEqual({ weeks: [] });
  });
});

describe('deleting an event', () => {
  it('takes its scoreboards and side tables with it', async () => {
    await call('POST', 'events', { body: { slug: 'ssl', published: true }, auth: true });
    await call('PUT', 'events/ssl/scoreboard', {
      query: { id: 'ssl::a.csv' },
      body: { record: { scoreboard: scoreboardOf('a.csv') }, summary: summaryOf('ssl::a.csv', 'a.csv') },
      auth: true,
    });
    await call('PUT', 'events/ssl/aliases', { body: { aliases: { overall: { a: 'b' } } }, auth: true });

    expect((await call('DELETE', 'events/ssl', { auth: true })).body).toEqual({ deleted: true, scoreboards: 1 });
    expect((await call('GET', 'events/ssl')).statusCode).toBe(404);
    expect((await call('GET', 'events')).body.events).toEqual([]);
    // The rounds and the side tables go with it, by foreign key.
    expect((await db.query('SELECT count(*)::int AS n FROM wor_scoreboards'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM wor_event_docs'))[0].n).toBe(0);
  });
});

describe('failure modes', () => {
  it('405s an unsupported method and 404s an unknown resource', async () => {
    expect((await call('PATCH', 'events')).statusCode).toBe(405);
    expect((await call('GET', 'nonsense')).statusCode).toBe(404);
  });
});
