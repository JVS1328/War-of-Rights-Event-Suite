// Align scoreboard kill wallclocks to replay round-time (t_s).
//
// Extracted from ReplayViewer so the after-action analytics modules and the
// viewer share one implementation. A scoreboard kill carries a wallclock
// "HH:MM:SS"; the replay's t_s=0 wallclock (roundStartSec, seconds since
// midnight) lets us convert a kill time into the replay's frame timeline.

// Parse "HH:MM:SS" into seconds since midnight. Returns null on bad input.
export function hmsToSec(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

// Recover the round's t_s=0 wallclock from replay meta. The parser computes
// this directly from "first sample's hms minus its t_s" and stores it in
// meta.roundStartSec — authoritative. Falls back to the recorder's
// round_started_at / round_ended_at header.
export function roundStartSec(meta) {
  if (Number.isFinite(meta?.roundStartSec)) return meta.roundStartSec;
  return hmsToSec(meta?.startedAt);
}

// Map a scoreboard kill wallclock to replay-frame t_s. Handles a day rollover
// in the rare case of a round straddling midnight.
export function killToReplayTs(killTime, startSec) {
  const k = hmsToSec(killTime);
  if (k == null || startSec == null) return null;
  let dt = k - startSec;
  if (dt < -3600) dt += 86400;
  return dt;
}

// Binary-search for the index of the last element with ts <= targetTs.
// Returns -1 when target is before the first element.
export function lastIndexLE(sortedTs, targetTs) {
  if (sortedTs.length === 0 || targetTs < sortedTs[0]) return -1;
  let lo = 0, hi = sortedTs.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTs[mid] <= targetTs) lo = mid;
    else hi = mid;
  }
  return sortedTs[hi] <= targetTs ? hi : lo;
}
