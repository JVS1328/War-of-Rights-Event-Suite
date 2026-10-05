import { describe, it, expect } from 'vitest';
import pako from 'pako';
import { REPLAY_CSV } from './synthetic.js';
import { parseReplayCsv } from './replayParser';
import { encodeQuantReplay } from './quantReplay.js';
import {
  packReplay, unpackReplay, viewerPropsFor, matchUploads, splitRoundFiles, describeAttach, readReplayFiles,
} from './replayStore';
import type { Replay } from './replayStore';
import type { Scoreboard } from '../stats/types';
import type { ScoreboardSummary } from '../stats/StatsRepository';

const replay = parseReplayCsv(REPLAY_CSV) as Replay;
const arty = { impacts: [[1.7, 0, 2205.6, 3413.3]], pieces: [] };
const events = [{ t: 0, event: 'morale', team: 1, value: 'BattleReady', pct: null }];
const EVENTS_CSV = 't_s,hms,event,team,value,pct\r\n0.00,20:41:07,morale,USA,BattleReady,\r\n';

describe('packReplay / unpackReplay', () => {
  it('round-trips the replay and its artillery', () => {
    const { replay: back, arty: backArty } = unpackReplay(packReplay(replay, arty as never));
    expect(back.meta).toEqual(replay.meta);
    expect(back.players).toEqual(replay.players);
    expect(back.frameCount).toBe(replay.frameCount);
    expect(back.tracks.x[0]).toBeCloseTo(replay.tracks.x[0], 0);
    expect(Number.isNaN(back.tracks.x[3 * replay.playerCount + 2])).toBe(true); // Carol unsampled
    expect(backArty).toEqual(arty);
  });

  it('carries a round with no artillery file', () => {
    expect(unpackReplay(packReplay(replay, null)).arty).toBeNull();
  });

  it('carries the round events, and unpacks a blob from before them', () => {
    expect(unpackReplay(packReplay(replay, null, events)).events).toEqual(events);
    expect(unpackReplay(packReplay(replay, arty as never)).events).toBeNull();
    // packed the old way: a header of { arty } alone
    const header = new TextEncoder().encode(JSON.stringify({ arty }));
    const body = new Uint8Array(encodeQuantReplay(replay));
    const raw = new Uint8Array(5 + header.byteLength + body.byteLength);
    raw[0] = 1;
    new DataView(raw.buffer).setUint32(1, header.byteLength, true);
    raw.set(header, 5);
    raw.set(body, 5 + header.byteLength);
    const old = unpackReplay(pako.deflateRaw(raw));
    expect(old.arty).toEqual(arty);
    expect(old.events).toBeNull();
    expect(old.replay.frameCount).toBe(replay.frameCount);
  });
});

describe('viewerPropsFor', () => {
  const sb = {
    meta: { casualties: { USA: { total: 7 }, CSA: { total: 9 } } },
    roster: [{ name: 'Bob', steamId: '7656', regiment: '1st Texas' }],
    players: [],
    kills: [{
      tsInRound: '14:00:01', killer: 'Carol', killerTeam: 'CSA', killerSteamId: null,
      victim: 'Bob', victimTeam: 'USA', victimSteamId: '7656', victimFormation: 'in_form', cause: 'Minie',
    }],
  } as unknown as Scoreboard;

  it('hands the viewer its team codes and wall-clock kill times', () => {
    const props = viewerPropsFor(sb);
    expect(props.kills[0]).toMatchObject({
      time: '14:00:01', killerTeam: 2, victimTeam: 1, victimFormation: 'in_form', cause: 'Minie',
    });
    expect(props.finalCasualties).toEqual({ usa: 7, csa: 9 });
    expect(props.scoreboard.roster[0].regiment).toBe('1st Texas');
  });
});

describe('matchUploads', () => {
  const round = (id: string, recordedAt: string, roundStartTime: string, hasReplay = false) =>
    ({ id, recordedAt, roundStartTime, hasReplay } as ScoreboardSummary);
  const upload = (filename: string, roundStartSec: number) =>
    ({ filename, replay: { meta: { roundStartSec } }, arty: null, events: null }) as never;

  it('pairs each replay with the round that started when it did', () => {
    const rounds = [
      round('ssl::a', '2026-07-18T20:00:00', '20:00:00'),
      round('ssl::b', '2026-07-18T20:13:00', '20:13:00'),
    ];
    // Replay files are stamped at round end, so by filename alone the first
    // replay sits nearer round b than round a.
    const uploads = [
      upload('replay_20260718_202700.csv', 20 * 3600 + 13 * 60 + 3),
      upload('replay_20260718_201200.csv', 20 * 3600 + 2),
    ];
    expect(matchUploads(uploads, rounds)).toEqual(['ssl::b', 'ssl::a']);
  });

  it('leaves a replay no round fits unmatched', () => {
    const rounds = [round('ssl::a', '2026-07-18T20:00:00', '20:00:00')];
    expect(matchUploads([upload('replay_20260801_120000.csv', 12 * 3600)], rounds)).toEqual([null]);
  });
});

describe('splitRoundFiles', () => {
  it('sorts one mixed pick into scoreboards and replays', async () => {
    const file = (name: string, text: string) => new File([text], name, { type: 'text/csv' });
    const board = file('scoreboard_20260930_210000.csv', 'key,value\nmap,Antietam\n');
    const rep = file('replay_20260930_210000.csv', REPLAY_CSV);
    const art = file('replay_20260930_210000_arty.csv', 't_s,x,y\n');
    const ev = file('replay_20260930_210000_events.csv', EVENTS_CSV);
    const { scoreboards, replays } = await splitRoundFiles([board, rep, art, ev]);
    expect(scoreboards).toEqual([board]);
    expect(replays).toEqual([rep, art, ev]);
  });
});

describe('readReplayFiles', () => {
  it('pairs each replay with its events by name', async () => {
    const file = (name: string, text: string) => new File([text], name, { type: 'text/csv' });
    const { uploads, skipped } = await readReplayFiles([
      file('replay_20261005_204107_events.csv', EVENTS_CSV),
      file('replay_20261005_204107.csv', REPLAY_CSV),
      file('replay_20261005_210000.csv', REPLAY_CSV),
      file('notes.csv', 'hello'),
    ]);
    expect(uploads.map((u) => [u.filename, u.events])).toEqual([
      ['replay_20261005_204107.csv', events],
      ['replay_20261005_210000.csv', null],
    ]);
    expect(skipped).toEqual(['notes.csv']);
  });
});

describe('describeAttach', () => {
  it('names what could not be placed', () => {
    expect(describeAttach({ attached: ['a'], unplaced: ['r.csv'], skipped: [] }))
      .toBe('1 replay attached. No round started when r.csv did — attach it by hand.');
  });
});
