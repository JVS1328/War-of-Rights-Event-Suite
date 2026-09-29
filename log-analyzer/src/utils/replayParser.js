// Parse a replay CSV (as written by wor_overlay/replay.cpp) into a compact
// in-memory structure suited to the viewer's scrub-by-frame access.
//
// Header is a list of `key,value` lines until a blank line, then a row of
// column names, then sample rows. Each row is one (player, sample-tick).
// All samples sharing a t_s belong to one frame.
//
// The parser collapses player metadata (team / branch / regiment / company)
// to a per-player record and stores per-frame pose as parallel typed arrays
// keyed by (frameIndex, playerIndex). Missing samples are encoded as NaN in
// the x track so the renderer can skip them without an extra bitmap.

import { resolveMapSlug } from './mapCalibration.js';

// Lightweight CSV-line splitter. Replay rows don't contain quoted fields in
// practice (names with commas are quoted by replay.cpp's csv_escape), so we
// handle quotes correctly but keep the path tight.
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // CSV "" → literal "
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// Detect "looks like a replay CSV" without committing to the full parse.
// Used by the upload handler to route between scoreboard and replay paths.
export function looksLikeReplayCsv(text) {
  // Cheap check on the first ~500 bytes — the header lives there.
  const head = text.slice(0, 1000).toLowerCase();
  return head.startsWith('map,') && head.includes('sample_rate_hz');
}

const LEADER_NONE    = 0;
const LEADER_OFFICER = 1;
const LEADER_FLAG    = 2;
export const LEADER_KIND = { NONE: LEADER_NONE, OFFICER: LEADER_OFFICER, FLAG: LEADER_FLAG };

// tracks.lk packs two per-frame facts into one byte: the leader kind in the
// low bits and "on a horse" in bit 7 (recorders from 2026-09-28 write a
// `mounted` column; older replays leave it 0). Keeping it in the existing
// byte means the IDB codec and share links carry it with no format change.
// Always read lk through these.
const MOUNTED_BIT = 0x80;
export const leaderOf = (v) => v & 0x7f;
export const isMounted = (v) => (v & MOUNTED_BIT) !== 0;

// players[].branch
export const BRANCH = { UNKNOWN: 0, INFANTRY: 1, ARTILLERY: 2, CAVALRY: 3 };

function encodeLeader(s) {
  if (s === 'officer') return LEADER_OFFICER;
  if (s === 'flag')    return LEADER_FLAG;
  return LEADER_NONE;
}

function encodeBranch(s) {
  if (s === 'inf')  return 1;
  if (s === 'arty') return 2;
  if (s === 'cav')  return 3;
  return 0;
}

// Main entry point. Returns the structured replay or null when the file
// doesn't look like a replay. Throws on a corrupt-but-replay-shaped file.
export function parseReplayCsv(text) {
  if (!looksLikeReplayCsv(text)) return null;

  // Strip a leading BOM, normalize newlines. The BOM is written as the
  // escape rather than a literal char so it isn't flagged as irregular
  // whitespace in source.
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  // --- header ---
  const meta = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; break; }
    const idx = line.indexOf(',');
    if (idx < 0) { i++; continue; }
    meta[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    i++;
  }

  // --- column header row ---
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) throw new Error('Replay CSV missing column header');
  const cols = splitCsvLine(lines[i]).map(s => s.trim().toLowerCase());
  i++;

  const COL = {
    t_s:          cols.indexOf('t_s'),
    hms:          cols.indexOf('hms'),
    name:         cols.indexOf('name'),
    team:         cols.indexOf('team'),
    x:            cols.indexOf('x'),
    y:            cols.indexOf('y'),
    z:            cols.indexOf('z'),
    fwd_x:        cols.indexOf('fwd_x'),
    fwd_y:        cols.indexOf('fwd_y'),
    branch:       cols.indexOf('branch'),
    role_idx:     cols.indexOf('role_idx'),
    leader_kind:  cols.indexOf('leader_kind'),
    regiment_crc: cols.indexOf('regiment_crc'),
    company:      cols.indexOf('company'),
    mounted:      cols.indexOf('mounted'),
  };
  if (COL.t_s < 0 || COL.name < 0 || COL.team < 0 || COL.x < 0 || COL.y < 0) {
    throw new Error('Replay CSV missing required columns');
  }

  // --- first pass: collect unique frame timestamps + unique player stints ---
  // A "player" here is one continuous identity: a name on one team, in one
  // regiment and company. Someone who swaps sides, changes company, or leaves
  // and rejoins elsewhere mid-round becomes a separate entry per stint, so
  // every consumer that treats players[].team / regiment / company as fixed
  // (colours, rosters, per-team analytics) stays right. Entries sharing a name
  // are the same person; the viewer's follow hops between them.
  // We stream the body twice (cheap; the file is text already in memory) so
  // we can size typed arrays exactly.
  const stintKey = (parts) => [parts[COL.name], parts[COL.team],
                               parts[COL.regiment_crc], parts[COL.company]].join('\u0001');
  const playerIdx = new Map();   // stint key → idx
  const playerMeta = [];         // idx → { name, team, branch, regimentCrc, company, lastRoleIdx }
  const frameTimes = [];         // idx → t_s

  // We also remember the most-recent t_s seen so we can detect frame breaks
  // without a sort. Replay rows are written in t_s-monotonic order by the
  // recorder, so a strict-greater comparison is the frame boundary.
  let lastTs = -Infinity;

  for (let li = i; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const parts = splitCsvLine(line);
    if (parts.length < cols.length) continue;
    const ts = parseFloat(parts[COL.t_s]);
    if (!Number.isFinite(ts)) continue;
    if (ts > lastTs) { frameTimes.push(ts); lastTs = ts; }

    const name = parts[COL.name];
    const key = stintKey(parts);
    if (!playerIdx.has(key)) {
      playerIdx.set(key, playerMeta.length);
      playerMeta.push({
        name,
        team:         parseInt(parts[COL.team], 10) || 0,
        branch:       encodeBranch(parts[COL.branch]),
        roleIdx:      parseInt(parts[COL.role_idx], 10) || 0,
        regimentCrc:  parts[COL.regiment_crc] || '',
        company:      parseInt(parts[COL.company], 10) || 0,
      });
    }
  }

  const F = frameTimes.length;
  const P = playerMeta.length;
  if (F === 0 || P === 0) throw new Error('Replay CSV had no usable rows');

  // --- typed arrays sized (F * P) ---
  // x[NaN] sentinels the "this player wasn't sampled this frame" case so
  // the renderer can do a single isNaN check instead of consulting a
  // separate bitmap.
  const x  = new Float32Array(F * P);
  const y  = new Float32Array(F * P);
  const z  = new Float32Array(F * P);
  const fx = new Float32Array(F * P);
  const fy = new Float32Array(F * P);
  const lk = new Uint8Array(F * P);
  x.fill(NaN);

  // --- second pass: fill tracks ---
  // Also captures the first row's hms so we can pin the round's t_s = 0
  // wallclock without relying on the header (the recorder has shipped both
  // `round_started_at` and `round_ended_at` variants over time, and we
  // want a deterministic answer either way).
  let frame = -1;
  let frameTs = -Infinity;
  let firstHms = '';
  for (let li = i; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const parts = splitCsvLine(line);
    if (parts.length < cols.length) continue;
    const ts = parseFloat(parts[COL.t_s]);
    if (!Number.isFinite(ts)) continue;
    if (ts > frameTs) {
      frame++;
      frameTs = ts;
      if (frame === 0 && COL.hms >= 0) firstHms = parts[COL.hms] || '';
    }

    const pi = playerIdx.get(stintKey(parts));
    if (pi === undefined) continue;
    const slot = frame * P + pi;
    x[slot]  = parseFloat(parts[COL.x]);
    y[slot]  = parseFloat(parts[COL.y]);
    z[slot]  = parseFloat(parts[COL.z]);
    fx[slot] = parseFloat(parts[COL.fwd_x]);
    fy[slot] = parseFloat(parts[COL.fwd_y]);
    lk[slot] = encodeLeader(parts[COL.leader_kind])
             | (COL.mounted >= 0 && parts[COL.mounted] === '1' ? MOUNTED_BIT : 0);
  }

  // Compute the round-start wallclock in seconds-since-midnight. Authoritative
  // source is "first sample's wallclock minus its t_s" — the recorder's
  // header fields drift in name and may be missing entirely.
  let roundStartSec = null;
  if (firstHms) {
    const m = firstHms.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (m) {
      const firstSec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
      roundStartSec = firstSec - frameTimes[0];
      // Days roll over at 86400 — normalize so kill-time comparisons stay
      // within [0, 86400).
      while (roundStartSec < 0) roundStartSec += 86400;
    }
  }

  // Best-effort first/last frame per player for the side list (used to dim
  // players who haven't joined yet / have left).
  for (let p = 0; p < P; p++) {
    let first = -1, last = -1;
    for (let f = 0; f < F; f++) {
      if (!Number.isNaN(x[f * P + p])) {
        if (first < 0) first = f;
        last = f;
      }
    }
    playerMeta[p].firstFrame = first;
    playerMeta[p].lastFrame  = last;
  }

  return {
    meta: {
      map:           meta.map || '',
      mapSlug:       resolveMapSlug(meta.map),
      mode:          meta.mode || '',
      area:          meta.area || '',
      winner:        meta.winner || '',
      // Both header field names have shipped over the recorder's history.
      // We expose whichever is present and additionally store the derived
      // round-start in seconds-since-midnight (roundStartSec), which the
      // viewer uses to align scoreboard kill times to replay t_s.
      startedAt:     meta.round_started_at || meta.round_ended_at || '',
      roundStartSec,
      sampleRateHz:  parseFloat(meta.sample_rate_hz) || 2.0,
      sampleCount:   parseInt(meta.samples, 10) || 0,
    },
    players: playerMeta,
    frameTimes: Float32Array.from(frameTimes),
    tracks: { x, y, z, fx, fy, lk },
    frameCount:  F,
    playerCount: P,
  };
}

// Extract a Date from a filename like replay_YYYYMMDD_HHMMSS.csv or
// scoreboard_YYYYMMDD_HHMMSS.csv. Returns null on no match. Used by the
// matcher to pair replays with scoreboards by adjacency.
export function timestampFromFilename(name) {
  if (!name) return null;
  const m = name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [_, Y, Mo, D, H, Mi, S] = m;
  return new Date(
    parseInt(Y, 10), parseInt(Mo, 10) - 1, parseInt(D, 10),
    parseInt(H, 10), parseInt(Mi, 10),     parseInt(S, 10),
  );
}
