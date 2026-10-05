import { unpackReplay } from '../../src/replay/replayPack.js';
import { sampleFromRecording, SAMPLE_VERSION } from '../../src/replay/roundAnalysis.js';
import { calibrate, fitRoundModel, usableRound } from '../../src/replay/roundModelFit.js';
import { viewerKills, roundLengthS, teamOf } from '../../src/replay/killAlign.js';
import * as store from './store.js';

/**
 * The replay viewer's round model for regimental events -- trained here, on the
 * rounds events have put into a season with a replay attached, and kept up to
 * date without anyone running anything:
 *
 *   - a round's training sample is worked out when its replay lands (the upload's
 *     last chunk), from the replay and the round's own scoreboard;
 *   - asking for the model refits it when anything it is fitted from has changed
 *     since -- a round added, moved into a season, re-scored or deleted -- and
 *     otherwise answers with the stored one;
 *   - replays attached before any of this existed get their samples a few per
 *     request, so the model fills in on its own after a deploy.
 *
 * It is the same fit as the PUBS dashboard's (src/replay/roundModelFit.js) on
 * different rounds: events are played differently, so they get their own model.
 */

/** Samples backfilled per request: bounded, so a request stays well inside the function's time. */
const BACKFILL_PER_REQUEST = 3;

/** Work out and store one round's training sample. A replay that can't be read stores null. */
export async function sampleRound(slug, id) {
  const [bytes, record] = await Promise.all([store.getReplayBytes(slug, id), store.getScoreboard(slug, id)]);
  if (!bytes || !record) return;
  let sample = null;
  try {
    const sb = record.scoreboard;
    sample = sampleFromRecording(unpackReplay(bytes).replay, viewerKills(sb.kills), roundLengthS(sb.meta));
  } catch {
    sample = null;   // a broken or foreign replay: nothing to learn from, nothing to retry
  }
  await store.putRoundSample(slug, id, SAMPLE_VERSION, sample);
}

/** The current model ({ model, inputs }; model null while there are too few rounds), refitted if stale. */
export async function currentRoundModel() {
  for (const { slug, id } of await store.roundsNeedingSamples(SAMPLE_VERSION, BACKFILL_PER_REQUEST)) {
    await sampleRound(slug, id);
  }
  const inputs = await store.roundModelInputs();
  const saved = await store.getRoundModel();
  if (saved && saved.inputs === inputs) return saved;

  const rows = await store.roundModelData();
  const calib = calibrate(rows.map((r) => ({
    map: r.map, mode: r.mode, area: r.area, durationS: roundLengthS(r.meta),
    moraleUsa: r.meta?.moraleUsa, moraleCsa: r.meta?.moraleCsa,
  })));
  const rounds = rows
    .filter((r) => r.inSeason && r.sample && usableRound({ winner: r.winner, moraleUsa: r.meta?.moraleUsa, moraleCsa: r.meta?.moraleCsa }))
    .map((r) => ({ id: `${r.slug}/${r.id}`, winner: teamOf(r.winner), sample: r.sample }));
  const model = fitRoundModel(rounds, calib, { source: 'regimental event' });
  await store.putRoundModel(model, inputs);
  return { model, inputs };
}
