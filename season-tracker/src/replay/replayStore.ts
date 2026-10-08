import { apiDelete, apiGet, apiPut, qs } from '../cloud/api';
import { packReplay as packAny, unpackReplay as unpackAny } from './replayPack.js';
import { looksLikeReplayCsv, parseReplayCsv, timestampFromFilename } from './replayParser';
import { parseArtyCsv, replayFilenameForArty } from './artyParser';
import { isEventsFilename, parseEventsCsv, replayFilenameForEvents } from './eventsParser';
import { hmsToSec, viewerKills, roundLengthS } from './killAlign';
import { matchToRounds } from './matchRounds';
import type { Scoreboard } from '../stats/types';
import type { ScoreboardSummary } from '../stats/StatsRepository';
import { cloudStatsRepo } from '../stats/repo';

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
export type RoundEvents = ReturnType<typeof parseEventsCsv>;

/** Matches REPLAY_CHUNK_CHARS in api/_lib/router.js; a multiple of 4, so every chunk decodes alone. */
const CHUNK_CHARS = 2_000_000;

export const packReplay = (replay: Replay, arty: Arty | null, events: RoundEvents | null = null): Uint8Array =>
  packAny(replay, arty, events);

export function unpackReplay(packed: Uint8Array): { replay: Replay; arty: Arty | null; events: RoundEvents | null } {
  return unpackAny(packed) as { replay: Replay; arty: Arty | null; events: RoundEvents | null };
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

/**
 * The viewer's scoreboard props, from the site's own scoreboard. The viewer was
 * written against the log-analyzer's parser, which kept the CSV's numeric team
 * codes; the kill's `tsInRound` is the same wall-clock column it called `time`
 * (killAlign.viewerKills, shared with the round-model training on the server).
 */
export function viewerPropsFor(sb: Scoreboard) {
  return {
    kills: viewerKills(sb.kills),
    finalCasualties: sb.meta.casualties
      ? { usa: sb.meta.casualties.USA?.total, csa: sb.meta.casualties.CSA?.total }
      : null,
    scoreboard: { roster: sb.roster ?? [], players: sb.players ?? [] },
    roundEndT: roundLengthS(sb.meta),
    popStart: sb.meta.popRoundStart ?? null,
  };
}

// --- Attaching a batch of files -------------------------------------------

export interface ParsedUpload {
  filename: string;
  replay: Replay;
  arty: Arty | null;
  events: RoundEvents | null;
}

/**
 * Read a picked batch of files into replays, each with its `_arty.csv` and
 * `_events.csv` companions when they came along. Anything else is reported back.
 */
export async function readReplayFiles(files: File[]): Promise<{ uploads: ParsedUpload[]; skipped: string[] }> {
  const artyByReplay = new Map<string, Arty>();
  const eventsByReplay = new Map<string, RoundEvents>();
  const replays: { filename: string; replay: Replay }[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const text = await file.text();
    if (isArtyFile(file)) {
      artyByReplay.set(replayFilenameForArty(file.name), parseArtyCsv(text));
      continue;
    }
    if (isEventsFilename(file.name)) {
      eventsByReplay.set(replayFilenameForEvents(file.name), parseEventsCsv(text));
      continue;
    }
    const replay = parseReplayCsv(text);
    if (replay) replays.push({ filename: file.name, replay });
    else skipped.push(file.name);
  }
  return {
    uploads: replays.map((r) => ({
      ...r, arty: artyByReplay.get(r.filename) ?? null, events: eventsByReplay.get(r.filename) ?? null,
    })),
    skipped,
  };
}

/** A replay's artillery companion, which only its name gives away (as does the events one). */
const isArtyFile = (file: File) => /_arty\.csv$/i.test(file.name);

/**
 * Sort one mixed pick into scoreboards and replays (each replay with its
 * `_arty.csv` and `_events.csv`). Only a file's head is read; a replay's header says what it is.
 */
export async function splitRoundFiles(files: File[]): Promise<{ scoreboards: File[]; replays: File[] }> {
  const scoreboards: File[] = [];
  const replays: File[] = [];
  for (const file of files) {
    const isReplay = isArtyFile(file) || isEventsFilename(file.name) || looksLikeReplayCsv(await file.slice(0, 1000).text());
    (isReplay ? replays : scoreboards).push(file);
  }
  return { scoreboards, replays };
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

export interface AttachReport {
  /** Round ids that now carry a replay. */
  attached: string[];
  /** Replays no round started with. */
  unplaced: string[];
  /** Files that were neither a replay nor one of its companions. */
  skipped: string[];
}

/**
 * Attach a picked batch of replays to an event's rounds in the database: each
 * lands on the round that started when it did. `onStep` reports progress.
 */
export async function attachReplayBatch(
  slug: string,
  files: File[],
  rounds: ScoreboardSummary[],
  onStep?: (text: string) => void,
): Promise<AttachReport> {
  onStep?.('Reading replays');
  const { uploads, skipped } = await readReplayFiles(files);
  const placed = matchUploads(uploads, rounds);
  const attached: string[] = [];
  const unplaced: string[] = [];
  const total = placed.filter(Boolean).length;
  for (const [i, u] of uploads.entries()) {
    const id = placed[i];
    if (!id) { unplaced.push(u.filename); continue; }
    onStep?.(`Uploading replay ${attached.length + 1} of ${total}`);
    await uploadReplay(slug, id, packReplay(u.replay, u.arty, u.events));
    attached.push(id);
  }
  return { attached, unplaced, skipped };
}

/** One line on how a batch went, for the screen that picked it. */
export function describeAttach({ attached, unplaced, skipped }: AttachReport): string {
  const n = attached.length;
  return [
    `${n} replay${n === 1 ? '' : 's'} attached.`,
    unplaced.length ? ` No round started when ${unplaced.join(', ')} did — attach ${unplaced.length === 1 ? 'it' : 'those'} by hand.` : '',
    skipped.length ? ` Not a replay: ${skipped.join(', ')}.` : '',
  ].join('');
}

/**
 * Attach replays picked alongside their scoreboards. A replay can only sit on
 * a round the database has, so any of `scoreboards` it does not have yet go up
 * first; the next Publish brings their night bindings along.
 */
export async function attachWithRounds(
  slug: string,
  files: File[],
  scoreboards: Scoreboard[],
  onStep?: (text: string) => void,
): Promise<AttachReport> {
  const known = new Set((await cloudStatsRepo.listScoreboards({ eventId: slug })).map((r) => r.sourceFilename));
  const missing = scoreboards.filter((sb) => !known.has(sb.sourceFilename));
  for (const [i, sb] of missing.entries()) {
    onStep?.(`Uploading round ${i + 1} of ${missing.length}`);
    await cloudStatsRepo.saveScoreboard(slug, sb);
  }
  try {
    return await attachReplayBatch(slug, files, await cloudStatsRepo.listScoreboards({ eventId: slug }), onStep);
  } finally {
    cloudStatsRepo.invalidate(slug);
  }
}
