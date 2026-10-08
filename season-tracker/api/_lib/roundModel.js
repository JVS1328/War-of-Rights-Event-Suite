import { unpackReplay } from '../../src/replay/replayPack.js';
import { sampleFromRecording, ticketCost, SAMPLE_VERSION } from '../../src/replay/roundAnalysis.js';
import { calibrate, fitRoundModel, usableRound, FIT_VERSION } from '../../src/replay/roundModelFit.js';
import { viewerKills, roundLengthS, teamOf } from '../../src/replay/killAlign.js';
import * as store from './store.js';

/**
 * The replay viewer's round model for regimental events -- trained here, on
 * every round with a replay attached, across all events and seasons, however
 * few, and kept up to date without anyone running anything:
 *
 *   - a round's training sample is worked out when its replay lands (the upload's
 *     last chunk), from the replay and the round's own scoreboard;
 *   - asking for the model refits it when anything it is fitted from has changed
 *     since -- a round added, re-scored or deleted -- and
 *     otherwise answers with the stored one;
 *   - replays attached before any of this existed get their samples a few per
 *     request, so the model fills in on its own after a deploy.
 *
 * It is the same fit as the PUBS dashboard's (src/replay/roundModelFit.js) on
 * different rounds: events are played differently, so they get their own model.
 * It starts from the dashboard's public-round model, though, when PUBS_API_URL
 * points at the dashboard's backend: its calibration (time limits, attackers --
 * the game's, so the same in events) fills in what event rounds haven't
 * settled, its fit is where this one's starts from, and its history covers
 * ground events haven't fought over. Nothing goes back the other way.
 */

/** Samples backfilled per request: bounded, so a request stays well inside the function's time. */
const BACKFILL_PER_REQUEST = 3;
/** With a public model to start from, refit at least this often so its updates come through. */
const PRIOR_REFRESH_MS = 6 * 3600_000;

/** The PUBS dashboard's public-round model, or null (no PUBS_API_URL, or it didn't answer). */
async function publicModel() {
  if (!process.env.PUBS_API_URL) return null;
  try {
    const res = await fetch(new URL('/api/round-model', process.env.PUBS_API_URL), { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()).model ?? null) : null;
  } catch {
    return null;
  }
}

/** Work out and store one round's training sample. A replay that can't be read stores null. */
export async function sampleRound(slug, id) {
  const [bytes, record] = await Promise.all([store.getReplayBytes(slug, id), store.getScoreboard(slug, id)]);
  if (!bytes || !record) return;
  let sample = null;
  try {
    const sb = record.scoreboard;
    const { replay, events } = unpackReplay(bytes);
    sample = sampleFromRecording(replay, viewerKills(sb.kills), roundLengthS(sb.meta), events);
  } catch {
    sample = null;   // a broken or foreign replay: nothing to learn from, nothing to retry
  }
  await store.putRoundSample(slug, id, SAMPLE_VERSION, sample);
}

/** The current model ({ model, inputs, trainedAt }; model null with no round and no public model), refitted if stale. */
export async function currentRoundModel() {
  for (const { slug, id } of await store.roundsNeedingSamples(SAMPLE_VERSION, BACKFILL_PER_REQUEST)) {
    await sampleRound(slug, id);
  }
  const inputs = `${await store.roundModelInputs()}/${FIT_VERSION}`;
  const saved = await store.getRoundModel();
  const maxAge = process.env.PUBS_API_URL ? PRIOR_REFRESH_MS : Infinity;
  if (saved && saved.inputs === inputs && Date.now() - saved.trainedAt < maxAge) return saved;

  const [rows, prior] = await Promise.all([store.roundModelData(), publicModel()]);
  // the round's setup, where its scoreboard recorded it (2026-10-05 on), over the model's inference
  const facts = (meta) => ({
    defendingTeam: meta?.defendingTeam, startTicketsUsa: meta?.ticketsUsa, startTicketsCsa: meta?.ticketsCsa,
  });
  const calib = calibrate(rows.map((r) => ({
    map: r.map, mode: r.mode, area: r.area, durationS: roundLengthS(r.meta), winner: r.winner,
    moraleUsa: r.meta?.moraleUsa, moraleCsa: r.meta?.moraleCsa,
    casualtiesUsa: r.meta?.casualties?.USA?.total, casualtiesCsa: r.meta?.casualties?.CSA?.total,
    ticketsUsa: ticketCost(r.meta?.casualties?.USA), ticketsCsa: ticketCost(r.meta?.casualties?.CSA),
    pop: r.meta?.popRoundPeak ?? r.meta?.popRoundMax,
    ...facts(r.meta), ticketsLeftUsa: r.meta?.ticketsLeftUsa, ticketsLeftCsa: r.meta?.ticketsLeftCsa,
  })), prior?.calib, 'regimental event');
  const rounds = rows
    .filter((r) => r.sample && usableRound({ winner: r.winner, moraleUsa: r.meta?.moraleUsa, moraleCsa: r.meta?.moraleCsa }))
    .map((r) => ({
      id: `${r.slug}/${r.id}`, winner: teamOf(r.winner), sample: r.sample, pop: r.meta?.popRoundPeak ?? r.meta?.popRoundMax,
      ...facts(r.meta),
    }));
  const model = fitRoundModel(rounds, calib, { source: 'regimental event', prior });
  await store.putRoundModel(model, inputs);
  return { model, inputs, trainedAt: Date.now() };
}
