import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { startTestDb, truncateAll } from './testDb.js';
import { parseReplayCsv } from '../../src/replay/replayParser.js';
import { packReplay } from '../../src/replay/replayPack.js';
import { REPLAY_CSV } from '../../src/replay/synthetic.js';

const { default: handler } = await import('./router.js');

const PASS = 'admin-pass-long-enough';
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
    method, body,
    query: { path: path.split('/').filter(Boolean), ...query },
    headers: auth ? { authorization: `Bearer ${PASS}` } : {},
  }, res);
  return res;
};

const REPLAY_B64 = Buffer.from(packReplay(parseReplayCsv(REPLAY_CSV), null)).toString('base64');
const idOf = (n) => `ssl::round${n}.csv`;

/** A round in a season night (or not), won by `winner`, the loser having lost a man at the start. */
async function putRound(n, { winner = n % 2 ? 'USA' : 'CSA', inSeason = true, setup = {} } = {}) {
  const loser = winner === 'USA' ? 'CSA' : 'USA';
  const meta = { map: 'Antietam', mode: 'Skirmish', area: 'The Cornfield', winner, moraleUsa: 'Breaking', moraleCsa: 'Engaged',
                 roundStartTime: '14:00:00', roundEndTime: '14:00:03', ...setup };
  const kills = [{ tsInRound: '14:00:00', killer: 'x', killerTeam: winner, victim: 'y', victimTeam: loser, victimFormation: 'oob', cause: 'Minie' }];
  const res = await call('PUT', 'events/ssl/scoreboard', {
    query: { id: idOf(n) },
    body: {
      record: { scoreboard: { sourceFilename: `round${n}.csv`, meta, kills }, ...(inSeason ? { binding: { weekId: 'w1', round: 1 } } : {}) },
      summary: { sourceFilename: `round${n}.csv`, map: 'Antietam', mode: 'Skirmish', area: 'The Cornfield', winner,
                 ...(inSeason ? { binding: { weekId: 'w1', round: 1 } } : {}) },
    },
    auth: true,
  });
  expect(res.statusCode).toBe(200);
}
const attach = (n, chunk = REPLAY_B64) =>
  call('PUT', 'events/ssl/replay', { query: { id: idOf(n), idx: '0' }, body: { chunk, total: 1 }, auth: true });
const sampleOf = async (n) => (await db.query(
  `SELECT version, sample FROM wor_round_samples WHERE event_slug = 'ssl' AND scoreboard_id = $1`, [idOf(n)]))[0];
const model = () => call('GET', 'round-model');

beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db?.close(); });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.PUBS_API_URL; });
beforeEach(async () => {
  process.env.ADMIN_PASS = PASS;
  await truncateAll(db);
  await call('POST', 'events', { body: { slug: 'ssl', name: 'SSL', published: true }, auth: true });
});

describe('round model: training samples', () => {
  it('works out a round\'s sample when its replay lands', async () => {
    await putRound(1);
    expect((await attach(1)).statusCode).toBe(200);
    const row = await sampleOf(1);
    expect(row.sample.key).toBe('antietam|skirmish|the cornfield');
    expect(row.sample.side['2'].lost[0]).toBe(5);       // the loser's out-of-line death, at its ticket cost
  });
  it('keeps a replay it cannot read without failing the upload', async () => {
    await putRound(1);
    expect((await attach(1, Buffer.from('not a replay').toString('base64'))).statusCode).toBe(200);
    expect((await sampleOf(1)).sample).toBeNull();
  });
  it('forgets the sample when the replay is detached', async () => {
    await putRound(1);
    await attach(1);
    await call('DELETE', 'events/ssl/replay', { query: { id: idOf(1) }, auth: true });
    expect(await sampleOf(1)).toBeUndefined();
  });
  it('backfills replays attached before samples existed', async () => {
    await putRound(1);
    await attach(1);
    await db.query('DELETE FROM wor_round_samples');
    await model();
    expect((await sampleOf(1)).sample).not.toBeNull();
  });
});

describe('round model: training', () => {
  it('has no model before any round has a replay', async () => {
    await putRound(1);
    const res = await model();
    expect(res.statusCode).toBe(200);
    expect(res.body.model).toBeNull();
  });
  it('trains on every round with a replay, in a season or not, and refits only when they change', async () => {
    await putRound(1); await attach(1);
    await putRound(99, { inSeason: false }); await attach(99);
    const first = await model();
    expect(first.body.model.source).toBe('regimental event');
    expect(first.body.model.rounds).toBe(2);
    expect(first.headers['cache-control']).toMatch(/public/);
    const trainedAt = first.body.model.trainedAt;

    expect((await model()).body.model.trainedAt).toBe(trainedAt);   // nothing changed: the stored model
    await call('DELETE', 'events/ssl/replay', { query: { id: idOf(99) }, auth: true });
    expect((await model()).body.model.rounds).toBe(1);               // refitted: one round fewer
  });
  it('takes the attacker and ticket pools from the scoreboard\'s own round setup', async () => {
    await putRound(1, { setup: { defendingTeam: 'CSA', ticketsUsa: 122, ticketsCsa: 122, ticketsLeftUsa: 0, ticketsLeftCsa: 90, popRoundPeak: 100 } });
    await attach(1);
    for (const n of [2, 3, 4, 5]) await putRound(n, { setup: { ticketsUsa: 122, ticketsCsa: 122, popRoundPeak: 100 } });
    const { calib } = (await model()).body.model;
    expect(calib.roles['antietam|skirmish|the cornfield']).toBe(1);          // CSA defends: USA attacks
    expect(calib.pools['antietam|skirmish|the cornfield']).toEqual({ 1: 1.22, 2: 1.22 });
  });
});

describe('round model: starting from the PUBS model', () => {
  // The dashboard's model: same fit, its own rounds, an area events haven't played.
  async function publicModel() {
    await putRound(1); await attach(1);
    const { model: m } = (await model()).body;
    await db.query('DELETE FROM wor_round_model');
    return { ...m, source: 'PUBS', rounds: 205, calib: { ...m.calib, limits: { 'x|y|z': 1800 } },
             areas: { 'x|y|z': { rounds: 40, usaWins: 20, bands: {} } } };
  }
  const servePublic = (body) => {
    process.env.PUBS_API_URL = 'https://pubs.example';
    const fetch = vi.fn(async () => ({ ok: true, json: async () => body }));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };

  it('fills in its calibration, history and fit from the PUBS model', async () => {
    const pub = await publicModel();
    const fetch = servePublic({ model: pub });
    const m = (await model()).body.model;
    expect(String(fetch.mock.calls[0][0])).toBe('https://pubs.example/api/round-model');
    expect(m).toMatchObject({ source: 'regimental event', rounds: 1, prior: { source: 'PUBS', rounds: 205 } });
    expect(m.calib.limits['x|y|z']).toBe(1800);
    expect(m.areas['x|y|z'].source).toBe('PUBS');
  });
  it('shows the PUBS model before events have any round', async () => {
    servePublic({ model: await publicModel() });
    await call('DELETE', 'events/ssl/replay', { query: { id: idOf(1) }, auth: true });
    expect((await model()).body.model).toMatchObject({ rounds: 0, prior: { rounds: 205 } });
  });
  it('trains on its own when the dashboard does not answer', async () => {
    await putRound(1); await attach(1);
    process.env.PUBS_API_URL = 'https://pubs.example';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect((await model()).body.model).toMatchObject({ rounds: 1, prior: null });
  });
});
