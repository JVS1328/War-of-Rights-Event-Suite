// One-to-one matching of a batch of uploads onto an event's rounds.
//
// Ported from the log-analyzer, where the rounds were replays and the batch was
// scoreboards. Here it runs the other way -- the rounds are the event's
// scoreboards and the batch is replay files -- and the logic is symmetric, so
// only the names changed. `attached` marks a round that already has a replay,
// which the fuzzy fallback must never take over.

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

// Assign a *batch* of items to rounds as a one-to-one matching, so two
// items can never collapse onto the same round.
//
// Why not just "nearest replay by filename time"? Replay and item
// filenames are stamped at different points in the round (e.g. the replay when
// recording is saved, the item when the round starts/ends), so a
// item's filename time can sit closer to the *neighbouring* round's
// replay than to its own. Absolute-nearest then piles several items onto
// one round. We avoid that in two layers:
//
//   1. Content match (offset-immune): both files know the round's actual start
//      wall-clock — the replay via `roundStartSec` (derived from sample hms),
//      the item via `round_start_time`. Equal start times identify the
//      same round no matter what the filenames say. Matched greedily by
//      smallest start-time delta, 1:1. A same-session sanity window on the
//      filename times (when both are present) rejects a different day that
//      happens to share a clock time.
//   2. Filename order-pairing (fallback for older files with no start times):
//      remaining rounds and items are each sorted by filename time and
//      paired by rank. A consistent replay↔item offset shifts every
//      file the same way, so rank order still lines the true pairs up; and
//      pairing by rank is 1:1 by construction.
//
// `rounds`:      [{ id, ts|null, startSec|null, attached? }]
// `items`: [{ ts|null, startSec|null }]  (matched by array index)
// Returns { assignments: { [itemIndex]: roundId }, unmatched: number[] }.
export function matchToRounds(rounds, items, opts = {}) {
  const {
    startToleranceSec = 180,           // start-time slop for a content match
    timeToleranceMs = 60 * 60 * 1000,  // filename-time window for the fallback
    sanityWindowMs = 6 * 60 * 60 * 1000, // reject cross-day content collisions
  } = opts;

  const assignments = {};
  const usedRounds = new Set();
  const usedItems = new Set();

  // --- layer 1: content match on round-start seconds ---
  const candidates = [];
  items.forEach((it, si) => {
    if (it == null || it.startSec == null) return;
    rounds.forEach((r) => {
      if (r.startSec == null) return;
      const d = secWrapDiff(it.startSec, r.startSec);
      if (d > startToleranceSec) return;
      // Same-session guard: if both carry a filename time, they must be within
      // the session window so a next-day round at the same clock time can't
      // false-match.
      if (it.ts != null && r.ts != null && Math.abs(it.ts - r.ts) > sanityWindowMs) return;
      candidates.push({ si, rid: r.id, d });
    });
  });
  // Smallest start-time delta wins; deterministic tiebreak keeps output stable.
  candidates.sort((a, b) => a.d - b.d || a.si - b.si || (a.rid < b.rid ? -1 : a.rid > b.rid ? 1 : 0));
  for (const c of candidates) {
    if (usedItems.has(c.si) || usedRounds.has(c.rid)) continue;
    assignments[c.si] = c.rid;
    usedItems.add(c.si);
    usedRounds.add(c.rid);
  }

  // --- layer 2: filename-time order pairing for whatever is left ---
  // Only rounds that don't already carry a item are eligible here — a
  // fuzzy fallback must never clobber an existing attachment by mere ordering.
  const remRounds = rounds
    .filter(r => !usedRounds.has(r.id) && !r.attached && r.ts != null)
    .sort((a, b) => a.ts - b.ts);
  const remItems = items
    .map((it, si) => ({ it, si }))
    .filter(x => x.it != null && !usedItems.has(x.si) && x.it.ts != null)
    .sort((a, b) => a.it.ts - b.it.ts);
  const n = Math.min(remRounds.length, remItems.length);
  for (let k = 0; k < n; k++) {
    const r = remRounds[k];
    const { it, si } = remItems[k];
    if (Math.abs(r.ts - it.ts) <= timeToleranceMs) {
      assignments[si] = r.id;
      usedItems.add(si);
      usedRounds.add(r.id);
    }
  }

  const unmatched = [];
  items.forEach((_, si) => { if (!(si in assignments)) unmatched.push(si); });
  return { assignments, unmatched };
}
