// Event model + localStorage persistence for the Replay Suite.
//
// An EVENT is a night of rounds. Each ROUND *is* a replay (the spine), with an
// optional scoreboard attached for kill/casualty enrichment.
//
//   Event { id, name, createdAt, rounds: Round[] }
//   Round {
//     id,                 // == replayId (stable FNV hash of filename+counts); dedupes re-uploads
//     replayId,           // IndexedDB key for the full pose payload
//     filename,           // replay CSV filename
//     ts,                 // ms epoch parsed from filename (ordering + scoreboard matching) | null
//     meta,               // light copy of replay.meta + frame/player counts (for round cards)
//     scoreboard,         // parsed scoreboard object (kills/metadata/players) | null
//     scoreboardFilename, // attached scoreboard's filename | null
//   }
//
// The full replay payload lives in IndexedDB (utils/replayStore), NOT here, so
// localStorage stays small — rounds carry only `replayId`. Replays are
// rehydrated into an in-memory Map on load.

const STORAGE_KEY = 'WarOfRightsReplaySuite';

export function loadEvent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const evt = JSON.parse(raw);
    if (!evt || !Array.isArray(evt.rounds)) return null;
    return evt;
  } catch {
    return null;
  }
}

export function saveEvent(event) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
  } catch (err) {
    console.warn('Failed to persist event to localStorage', err);
  }
}

export function newEvent(name = 'Untitled Event') {
  return {
    id: `evt_${Date.now().toString(36)}`,
    name,
    createdAt: Date.now(),
    rounds: [],
  };
}

// Build a Round from a parsed replay + its filename + the stable replayId.
// `tsFromFilename` is injected (utils/replayParser.timestampFromFilename) to
// avoid a circular import and keep this module pure-ish.
export function makeRound(replayId, filename, parsedReplay, tsFromFilename) {
  const d = tsFromFilename ? tsFromFilename(filename) : null;
  return {
    id: replayId,
    replayId,
    filename,
    ts: d ? d.getTime() : null,
    meta: {
      ...parsedReplay.meta,
      frameCount: parsedReplay.frameCount,
      playerCount: parsedReplay.playerCount,
    },
    scoreboard: null,
    scoreboardFilename: null,
    // Companion replay_<stamp>_arty.csv, parsed (utils/artyParser): impacts +
    // gun/caisson change points. Optional, attached like the scoreboard.
    arty: null,
    artyFilename: null,
  };
}

// Insert or replace a round in the event, keeping rounds ordered by timestamp
// (rounds with no parseable timestamp sort to the end, in insertion order).
export function upsertRound(event, round) {
  const rounds = event.rounds.filter(r => r.id !== round.id);
  rounds.push(round);
  rounds.sort((a, b) => {
    if (a.ts == null && b.ts == null) return 0;
    if (a.ts == null) return 1;
    if (b.ts == null) return -1;
    return a.ts - b.ts;
  });
  return { ...event, rounds };
}

// Pick the round whose replay timestamp is nearest a scoreboard's timestamp,
// within `toleranceMs`. Returns the round id, or null. Used to auto-attach an
// uploaded scoreboard to the right replay round.
//
// NOTE: for a *batch* of scoreboards prefer matchScoreboardsToRounds — calling
// this once per scoreboard has no cross-scoreboard memory, so two scoreboards
// whose nearest round is the same one both resolve to it and the second
// silently overwrites the first (they "merge" onto one round).
export function nearestRoundForTimestamp(event, ts, toleranceMs = 60 * 60 * 1000) {
  if (ts == null) return null;
  let best = null;
  let bestDelta = Infinity;
  for (const r of event.rounds) {
    if (r.ts == null) continue;
    const delta = Math.abs(r.ts - ts);
    if (delta < bestDelta && delta <= toleranceMs) { bestDelta = delta; best = r.id; }
  }
  return best;
}

// "HH:MM:SS" → seconds-since-midnight, or null. Tolerates 1- or 2-digit hours.
function hmsToSec(hms) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(hms || '').trim());
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

// Absolute distance between two seconds-since-midnight values, aware of the
// midnight wrap (23:59 and 00:01 are 2 minutes apart, not ~24h).
function secWrapDiff(a, b) {
  const d = Math.abs(a - b);
  return d > 43200 ? 86400 - d : d;
}

// Assign a *batch* of scoreboards to rounds as a one-to-one matching, so two
// scoreboards can never collapse onto the same round.
//
// Why not just "nearest replay by filename time"? Replay and scoreboard
// filenames are stamped at different points in the round (e.g. the replay when
// recording is saved, the scoreboard when the round starts/ends), so a
// scoreboard's filename time can sit closer to the *neighbouring* round's
// replay than to its own. Absolute-nearest then piles several scoreboards onto
// one round. We avoid that in two layers:
//
//   1. Content match (offset-immune): both files know the round's actual start
//      wall-clock — the replay via `roundStartSec` (derived from sample hms),
//      the scoreboard via `round_start_time`. Equal start times identify the
//      same round no matter what the filenames say. Matched greedily by
//      smallest start-time delta, 1:1. A same-session sanity window on the
//      filename times (when both are present) rejects a different day that
//      happens to share a clock time.
//   2. Filename order-pairing (fallback for older files with no start times):
//      remaining rounds and scoreboards are each sorted by filename time and
//      paired by rank. A consistent replay↔scoreboard offset shifts every
//      file the same way, so rank order still lines the true pairs up; and
//      pairing by rank is 1:1 by construction.
//
// `rounds`:      [{ id, ts|null, startSec|null, hasScoreboard? }]
// `scoreboards`: [{ ts|null, startSec|null }]  (matched by array index)
// Returns { assignments: { [scoreboardIndex]: roundId }, unmatched: number[] }.
export function matchScoreboardsToRounds(rounds, scoreboards, opts = {}) {
  const {
    startToleranceSec = 180,           // start-time slop for a content match
    timeToleranceMs = 60 * 60 * 1000,  // filename-time window for the fallback
    sanityWindowMs = 6 * 60 * 60 * 1000, // reject cross-day content collisions
  } = opts;

  const assignments = {};
  const usedRounds = new Set();
  const usedSbs = new Set();

  // --- layer 1: content match on round-start seconds ---
  const candidates = [];
  scoreboards.forEach((sb, si) => {
    if (sb == null || sb.startSec == null) return;
    rounds.forEach((r) => {
      if (r.startSec == null) return;
      const d = secWrapDiff(sb.startSec, r.startSec);
      if (d > startToleranceSec) return;
      // Same-session guard: if both carry a filename time, they must be within
      // the session window so a next-day round at the same clock time can't
      // false-match.
      if (sb.ts != null && r.ts != null && Math.abs(sb.ts - r.ts) > sanityWindowMs) return;
      candidates.push({ si, rid: r.id, d });
    });
  });
  // Smallest start-time delta wins; deterministic tiebreak keeps output stable.
  candidates.sort((a, b) => a.d - b.d || a.si - b.si || (a.rid < b.rid ? -1 : a.rid > b.rid ? 1 : 0));
  for (const c of candidates) {
    if (usedSbs.has(c.si) || usedRounds.has(c.rid)) continue;
    assignments[c.si] = c.rid;
    usedSbs.add(c.si);
    usedRounds.add(c.rid);
  }

  // --- layer 2: filename-time order pairing for whatever is left ---
  // Only rounds that don't already carry a scoreboard are eligible here — a
  // fuzzy fallback must never clobber an existing attachment by mere ordering.
  const remRounds = rounds
    .filter(r => !usedRounds.has(r.id) && !r.hasScoreboard && r.ts != null)
    .sort((a, b) => a.ts - b.ts);
  const remSbs = scoreboards
    .map((sb, si) => ({ sb, si }))
    .filter(x => x.sb != null && !usedSbs.has(x.si) && x.sb.ts != null)
    .sort((a, b) => a.sb.ts - b.sb.ts);
  const n = Math.min(remRounds.length, remSbs.length);
  for (let k = 0; k < n; k++) {
    const r = remRounds[k];
    const { sb, si } = remSbs[k];
    if (Math.abs(r.ts - sb.ts) <= timeToleranceMs) {
      assignments[si] = r.id;
      usedSbs.add(si);
      usedRounds.add(r.id);
    }
  }

  const unmatched = [];
  scoreboards.forEach((_, si) => { if (!(si in assignments)) unmatched.push(si); });
  return { assignments, unmatched };
}

// Round-start seconds-since-midnight a scoreboard exposes for content matching,
// or null. Uses the explicit round_start_time metadata (the real round start),
// not the first-kill fallback in `startTime`.
export function scoreboardStartSec(scoreboard) {
  return hmsToSec(scoreboard?.metadata?.round_start_time);
}
