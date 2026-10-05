import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { startTestDb, truncateAll } from '../../api/_lib/testDb.js';
import { parseScoreboard } from './parseScoreboard';
import { buildStatsBundle } from './statsBundle';
import type { StoredScoreboard } from './StatsRepository';

/**
 * Does the database actually hold a scoreboard, or a lossy summary of one?
 *
 * This walks a real overlay CSV the whole way — parse, publish, store in
 * Postgres, read back as a visitor — and demands the round that comes out is
 * the round that went in, field for field. It is the test that says a migration
 * is safe.
 */
const { default: handler } = await import('../../api/_lib/router.js');
const { ApiStatsRepository } = await import('./ApiStatsRepository');
const { setAdminToken } = await import('../cloud/session');

const PASS = 'admin-pass-long-enough';
let db: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>; close: () => Promise<void> };

/**
 * A real overlay scoreboard with every section in it — the same fixture the
 * parser's own tests use, so this measures the storage layer rather than a
 * hand-written approximation of the format.
 */
const CSV = `round_start_time,21:06:35
round_end_time,21:44:35
round_duration_s,2279
map,Antietam
mode,Skirmish
area,Roulette Lane
era,ACW
winner,CSA
morale_usa,Breaking
morale_csa,LastStand
defending_team,CSA
final_push_time,146
tickets_usa,122
tickets_csa,122
tickets_left_usa,31
tickets_left_csa,0

name,team,kills,deaths,kd,deaths_in_form,deaths_skirm,deaths_oob,steam_id,level
Frosty,1,4,2,2.00,1,1,0,76561199085016851,56
Ferg,1,1,3,0.33,2,1,0,76561198881020357,

officer,team,regiment,company,branch,rank,commanded,commanded_avg,start,end,duration_s,pct_round,steam_id
Frosty,1,Graham's Battery,A Company,Artillery,Major,14,11,21:16:14,21:35:45,1170,51,76561199085016851
Nuke,1,14th Indiana,B Company,Infantry,Lt. Colonel,45,36,21:06:40,21:44:35,2274,100,76561198062666289

team,regiment,company,name,class,rank,duration_s,pct_round,steam_id
USA,Graham's Battery,A Company,Frosty,Officer,Major,1928,85,76561199085016851
USA,Graham's Battery,A Company,Ferg,NCO,Sergeant Major,1957,86,76561198881020357
USA,Unenlisted,,Drifter,,,,,76561197964860269

team,regiment,company,name,class,rank,start,end,duration_s,pct_round,steam_id
USA,Graham's Battery,A Company,Ferg,NCO,Sergeant Major,21:06:39,21:35:34,1735,76,76561198881020357
USA,14th Indiana,B Company,Ferg,Private,,21:35:40,21:44:35,535,23,76561198881020357
USA,Graham's Battery,A Company,Frosty,Officer,Major,21:06:39,21:35:45,1746,77,76561199085016851

time,killer,killer_steam_id,killer_team,victim,victim_steam_id,victim_team,victim_formation,cause,cat,sub
21:07:19,,,0,Frosty,76561199085016851,1,skirm,Env,5,0

time,player,steam_id,event
21:07:00,Ferg,76561198881020357,joined
`;

const makeRes = () => {
  const res: Record<string, unknown> = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (o: unknown) => { res.body = o; return res; };
  return res as { statusCode: number; body: unknown; status: (c: number) => unknown; json: (o: unknown) => unknown };
};

const fakeFetch = async (url: string, init?: RequestInit) => {
  const [path, search = ''] = String(url).replace('/api/db', '').split('?');
  const req = {
    method: init?.method ?? 'GET',
    url,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    query: { ...Object.fromEntries(new URLSearchParams(search)), path: path.split('/').filter(Boolean) },
    headers: (init?.headers ?? {}) as Record<string, string>,
  };
  const res = makeRes();
  await handler(req, res);
  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    text: async () => JSON.stringify(res.body),
    json: async () => res.body,
  } as Response;
};

beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await truncateAll(db);
  process.env.ADMIN_PASS = PASS;
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  vi.stubGlobal('fetch', fakeFetch);
  setAdminToken(PASS);
  await fakeFetch('/api/db/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PASS}` },
    body: JSON.stringify({ slug: 'ssl', name: 'SSL', published: true }),
  });
});

describe('a scoreboard, all the way to Postgres and back', () => {
  it('parses every section the overlay writes', () => {
    const sb = parseScoreboard(CSV, 'round1.csv');
    expect(sb.players).toHaveLength(2);
    expect(sb.officers).toHaveLength(2);
    expect(sb.roster).toHaveLength(3);
    expect(sb.service ?? []).toHaveLength(3);
    expect(sb.kills).toHaveLength(1);
    expect(sb.joinLeaves).toHaveLength(1);
    expect(sb.meta.map).toBe('Antietam');
    expect(sb.meta.winner).toBe('CSA');
  });

  it('comes back out of the database identical, field for field', async () => {
    const repo = new ApiStatsRepository();
    const original = parseScoreboard(CSV, 'round1.csv');

    await repo.saveScoreboard('ssl', original, { weekId: 'w1', round: 2 });
    repo.invalidate();

    const [back] = await repo.readAllScoreboards('ssl', { withJoinLog: true });
    expect(back.scoreboard).toEqual(original);
    expect(back.binding).toEqual({ weekId: 'w1', round: 2 });
  });

  it('leaves the join/leave log out of the read the screens make', async () => {
    const repo = new ApiStatsRepository();
    const original = parseScoreboard(CSV, 'round1.csv');
    expect(original.joinLeaves.length).toBeGreaterThan(0);

    await repo.saveScoreboard('ssl', original);
    repo.invalidate();

    // No stat or view reads that log, and it is a twelfth of what a round
    // weighs — so the request a visitor waits on does not carry it.
    const [lean] = await repo.readAllScoreboards('ssl');
    expect(lean.scoreboard.joinLeaves).toBeUndefined();
    expect(lean.scoreboard.players).toEqual(original.players);
    expect(lean.scoreboard.kills).toEqual(original.kills);

    // It is still in the database — nothing was thrown away on the way in.
    repo.invalidate();
    const full = await repo.getScoreboard('ssl::round1.csv');
    expect(full?.scoreboard.joinLeaves).toEqual(original.joinLeaves);
  });

  it('keeps a steam id as a string, so a SteamID64 is not rounded off', async () => {
    const repo = new ApiStatsRepository();
    await repo.saveScoreboard('ssl', parseScoreboard(CSV, 'round1.csv'));
    repo.invalidate();

    const [back] = await repo.readAllScoreboards('ssl');
    const id = back.scoreboard.players[0].steamId;
    expect(typeof id).toBe('string');
    expect(id).toBe('76561199085016851');
    // A SteamID64 is past Number.MAX_SAFE_INTEGER, so anything that treated it
    // as a number on the way through would hand back different digits. This is
    // the hazard the assertion above is guarding against.
    expect(String(Number(id))).not.toBe(id);
  });

  it('publishes the whole scoreboard — joinLeaves included — when asked for a full bundle', async () => {
    const original = parseScoreboard(CSV, 'round1.csv');
    const stored: StoredScoreboard[] = [{ id: 'x::round1.csv', eventId: 'x', scoreboard: original }];

    const lean = buildStatsBundle(stored, {});
    const full = buildStatsBundle(stored, {}, {}, [], [], undefined, undefined, { full: true });

    // A share link stays pasteable; the database gets the record.
    expect(lean.scoreboards[0].scoreboard.joinLeaves).toEqual([]);
    expect(full.scoreboards[0].scoreboard.joinLeaves).toEqual(original.joinLeaves);
  });

  it('survives a publish and a pull back down, still identical', async () => {
    const repo = new ApiStatsRepository();
    const original = parseScoreboard(CSV, 'round1.csv');
    const stored: StoredScoreboard[] = [{ id: 'x::round1.csv', eventId: 'x', scoreboard: original }];
    const bundle = buildStatsBundle(stored, {}, {}, [], [], undefined, undefined, { full: true });

    await repo.importEventStats('ssl', bundle);
    repo.invalidate();

    const exported = await repo.exportEventStats('ssl', [], [], { full: true });
    expect(exported.scoreboards[0].scoreboard).toEqual(original);
  });

  it('fills the summary columns a list view reads, without touching the payload', async () => {
    const repo = new ApiStatsRepository();
    await repo.saveScoreboard('ssl', parseScoreboard(CSV, 'round1.csv'), { weekId: 'w1', round: 2 });

    const rows = await db.query(
      'SELECT source_filename, map, mode, area, winner, week_id, round FROM wor_scoreboards',
    );
    expect(rows[0]).toMatchObject({
      source_filename: 'round1.csv',
      map: 'Antietam',
      mode: 'Skirmish',
      area: 'Roulette Lane',
      winner: 'CSA',
      week_id: 'w1',
      round: 2,
    });
  });
});
