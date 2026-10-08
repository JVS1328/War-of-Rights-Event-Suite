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

// Scoreboard kills on the replay's clock, sorted: each kill with `ts` (replay
// t_s) added. Kills without a parseable time -- or every kill, when the replay
// carries no start wallclock -- are dropped. The viewer's kill feed and the
// round-model training both read kills through this.
export function alignKills(kills, meta) {
  const startSec = roundStartSec(meta);
  if (startSec == null || !kills) return [];
  return kills
    .filter((k) => k?.time)
    .map((k) => ({ ts: killToReplayTs(k.time, startSec), ...k }))
    .filter((k) => k.ts != null)
    .sort((a, b) => a.ts - b.ts);
}

// --- scoreboard → replay glue ------------------------------------------------
// The replay viewer's hosts and the round-model training all read a round's
// scoreboard through these, so a kill means the same thing everywhere.

const TEAM_CODE = { usa: 1, csa: 2, 1: 1, 2: 2 };
/** 1 / 2 for USA / CSA however it is written ('USA', 'csa', 1), else null. */
export const teamOf = (t) => TEAM_CODE[String(t ?? '').toLowerCase()] ?? null;

/** A scoreboard's departures in the shape sideStates reads (via alignKills): { time, name } of each player who left. */
export const viewerLeaves = (joinLeaves) => (joinLeaves ?? []).filter((e) => e.action === 'left').map((e) => ({ time: e.tsInRound, name: e.name }));

/** A scoreboard's kills in the shape the viewer reads: killfeed rows, sides as 1 / 2. */
export function viewerKills(kills) {
  return (kills ?? []).map((k) => ({
    time: k.tsInRound,
    killer: k.killer,
    killerTeam: teamOf(k.killerTeam),
    killerSteamId: k.killerSteamId,
    victim: k.victim,
    victimTeam: teamOf(k.victimTeam),
    victimSteamId: k.victimSteamId,
    victimFormation: k.victimFormation,
    cause: k.cause,
  }));
}

/** The round's length in seconds -- its end in replay t_s: the overlay's own figure, else end − start. */
export function roundLengthS(meta) {
  if (meta?.roundDurationS != null) return meta.roundDurationS;
  const start = hmsToSec(meta?.roundStartTime ?? null);
  const end = hmsToSec(meta?.roundEndTime ?? null);
  if (start == null || end == null) return null;
  return end >= start ? end - start : end - start + 86400;
}
