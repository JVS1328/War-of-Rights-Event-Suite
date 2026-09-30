import { apiDelete, apiGet, apiPut, qs } from '../cloud/api';
import { packReplay as packAny, unpackReplay as unpackAny } from './replayPack.js';
import { parseReplayCsv, timestampFromFilename } from './replayParser';
import { parseArtyCsv, replayFilenameForArty } from './artyParser';
import { hmsToSec } from './killAlign';
import { matchToRounds } from './matchRounds';
import type { Scoreboard, Team } from '../stats/types';
import type { ScoreboardSummary } from '../stats/StatsRepository';

/**
 * A round's replay, in and out of the database (see api/_lib/router.js).
 *
 * What is stored is one packed container (replayPack.js) cut into base64
 * chunks, each a request of its own so no one body nears the platform's cap.
 * Chunks go up tail first and chunk 0 last: chunk 0 is what makes the server
 * count a replay as attached, so a half-finished upload is never offered.
 */

export type Replay = NonNullable<ReturnType<typeof parseReplayCsv>>;
export type Arty = ReturnType<typeof parseArtyCsv>;

/** Matches REPLAY_CHUNK_CHARS in api/_lib/router.js; a multiple of 4, so every chunk decodes alone. */
const CHUNK_CHARS = 2_000_000;

export const packReplay = (replay: Replay, arty: Arty | null): Uint8Array => packAny(replay, arty);

export function unpackReplay(packed: Uint8Array): { replay: Replay; arty: Arty | null } {
  return unpackAny(packed) as { replay: Replay; arty: Arty | null };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const path = (slug: string, id: string, idx?: number) =>
  `/events/${encodeURIComponent(slug)}/replay${qs({ id, idx: idx === undefined ? undefined : String(idx) })}`;

export async function uploadReplay(slug: string, scoreboardId: string, packed: Uint8Array): Promise<void> {
  const text = toBase64(packed);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) chunks.push(text.slice(i, i + CHUNK_CHARS));
  const total = chunks.length;
  for (let idx = total - 1; idx >= 0; idx--) {
    await apiPut(path(slug, scoreboardId, idx), { chunk: chunks[idx], total });
  }
}

export async function downloadReplay(slug: string, scoreboardId: string) {
  const first = await apiGet<{ chunk: string; total: number }>(path(slug, scoreboardId, 0));
  const rest = await Promise.all(
    Array.from({ length: first.total - 1 }, (_, i) =>
      apiGet<{ chunk: string }>(path(slug, scoreboardId, i + 1)).then((r) => r.chunk)),
  );
  const parts = [first.chunk, ...rest].map(fromBase64);
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { joined.set(p, at); at += p.length; }
  return unpackReplay(joined);
}

export const detachReplay = (slug: string, scoreboardId: string) =>
  apiDelete(path(slug, scoreboardId));

// --- What the viewer is handed -------------------------------------------

const TEAM_CODE: Record<Team, number> = { USA: 1, CSA: 2 };

/**
 * The viewer's scoreboard props, from the site's own scoreboard. The viewer was
 * written against the log-analyzer's parser, which kept the CSV's numeric team
 * codes; the kill's `tsInRound` is the same wall-clock column it called `time`.
 */
export function viewerPropsFor(sb: Scoreboard) {
  return {
    kills: sb.kills.map((k) => ({
      time: k.tsInRound,
      killer: k.killer,
      killerTeam: k.killerTeam ? TEAM_CODE[k.killerTeam] : null,
      killerSteamId: k.killerSteamId,
      victim: k.victim,
      victimTeam: k.victimTeam ? TEAM_CODE[k.victimTeam] : null,
      victimSteamId: k.victimSteamId,
      victimFormation: k.victimFormation,
      cause: k.cause,
    })),
    finalCasualties: sb.meta.casualties
      ? { usa: sb.meta.casualties.USA?.total, csa: sb.meta.casualties.CSA?.total }
      : null,
    scoreboard: { roster: sb.roster ?? [], players: sb.players ?? [] },
  };
}

// --- Attaching a batch of files -------------------------------------------

export interface ParsedUpload {
  filename: string;
  replay: Replay;
  arty: Arty | null;
}

/**
 * Read a picked batch of files into replays, each with its `_arty.csv`
 * companion when one came along. Anything that is neither is reported back.
 */
export async function readReplayFiles(files: File[]): Promise<{ uploads: ParsedUpload[]; skipped: string[] }> {
  const artyByReplay = new Map<string, Arty>();
  const replays: { filename: string; replay: Replay }[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const text = await file.text();
    if (/_arty\.csv$/i.test(file.name)) {
      artyByReplay.set(replayFilenameForArty(file.name), parseArtyCsv(text));
      continue;
    }
    const replay = parseReplayCsv(text);
    if (replay) replays.push({ filename: file.name, replay });
    else skipped.push(file.name);
  }
  return {
    uploads: replays.map((r) => ({ ...r, arty: artyByReplay.get(r.filename) ?? null })),
    skipped,
  };
}

const msOf = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/**
 * Which round each upload belongs to: the round-start time both files record,
 * then filename order for files too old to carry one. A round that already has
 * a replay is only ever replaced by a start-time match, never by ordering.
 * Returns the matched round id per upload (null when none fits).
 */
export function matchUploads(
  uploads: ParsedUpload[],
  rounds: ScoreboardSummary[],
): (string | null)[] {
  const { assignments } = matchToRounds(
    rounds.map((r) => ({
      id: r.id,
      ts: Number.isFinite(msOf(r.recordedAt)) ? msOf(r.recordedAt) : null,
      startSec: hmsToSec(r.roundStartTime ?? null),
      attached: !!r.hasReplay,
    })),
    uploads.map((u) => ({
      ts: timestampFromFilename(u.filename)?.getTime() ?? null,
      startSec: Number.isFinite(u.replay.meta.roundStartSec) ? u.replay.meta.roundStartSec : null,
    })),
  );
  return uploads.map((_, i) => (assignments as Record<number, string>)[i] ?? null);
}
