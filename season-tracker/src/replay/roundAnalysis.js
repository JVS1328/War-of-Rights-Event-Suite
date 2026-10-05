// What a replay says about how its round went: the viewer's Analysis panel and
// heatmap layer, and -- through sampleFromRecording/winFeatures -- the training
// of the round model (roundModelFit.js), which each app runs on its own rounds
// with this very module, so the model always sees the features it was trained on.
//
// Pure functions over a parsed replay (after fillTimeline) and the scoreboard
// kills aligned to replay t_s (killAlign: { ts, victimTeam, killerTeam,
// victimFormation, victim, killer }). Nothing here touches React or the DOM.

import { YARDS_PER_METER, resolveMapSlug } from './mapCalibration.js';
import { LEADER_KIND, leaderOf, isMounted } from './replayParser.js';
import { fillTimeline } from './timeline.js';
import { alignKills } from './killAlign.js';

export const GRID_S = 5;            // side states every 5 s of round time
const ANCHOR_S = 60;                // a side's spawn = where it stood its first 60 s on the field
const VEL_S = 30;                   // movement measured over the last 30 s
const LOADING_S = 120;              // men alive only counts once both sides have had time to load in
const CONTACT_M = 100;              // a company is "in contact" with an enemy this close
const STANCE_TICKETS = { in_form: 1, skirm: 3, oob: 5 };   // a death's ticket cost by stance
const MAX_STEP_MPS = 20;            // faster than any horse: a respawn or teleport, not travel
export const DEFAULT_LIMIT_S = 2700;

const TEAMS = [1, 2];
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
const medianOf = (a) => quantile(Float64Array.from(a).sort(), 0.5);

/** The key the round model files calibration and history under: map slug, mode, area. */
export function areaKey(map, mode, area) {
  return [resolveMapSlug(map) || String(map || '').toLowerCase(), String(mode || '').toLowerCase(), String(area || '').toLowerCase()].join('|');
}
export const replayAreaKey = (meta) => areaKey(meta.map, meta.mode, meta.area);

/** Index of the last frame at or before t. */
function frameAt(frameTimes, t) {
  let lo = 0, hi = frameTimes.length - 1;
  if (hi < 0 || t <= frameTimes[0]) return 0;
  if (t >= frameTimes[hi]) return hi;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (frameTimes[mid] <= t) lo = mid; else hi = mid; }
  return lo;
}

/**
 * Each side's spawn (mean position over its first ANCHOR_S on the field) and the
 * frame the round is read in from that side: u = 0 at its own spawn, 1 at the
 * enemy's, v the lateral offset on the same scale. Null when a side never shows.
 */
export function sideFrames(replay) {
  const { x, y } = replay.tracks, P = replay.playerCount, F = replay.frameCount, ft = replay.frameTimes;
  const anchor = {};
  for (const s of TEAMS) {
    let t0 = null, sx = 0, sy = 0, n = 0;
    for (let f = 0; f < F && (t0 == null || ft[f] <= t0 + ANCHOR_S); f++) {
      for (let p = 0; p < P; p++) {
        if (replay.players[p].team !== s || Number.isNaN(x[f * P + p])) continue;
        if (t0 == null) t0 = ft[f];
        sx += x[f * P + p]; sy += y[f * P + p]; n++;
      }
    }
    if (!n) return null;
    anchor[s] = [sx / n, sy / n];
  }
  const frames = {};
  for (const s of TEAMS) {
    const [ox, oy] = anchor[s], [ex, ey] = anchor[3 - s];
    const D = Math.hypot(ex - ox, ey - oy) || 1, ax = (ex - ox) / D, ay = (ey - oy) / D;
    frames[s] = {
      spawnDistM: D,
      u: (px, py) => ((px - ox) * ax + (py - oy) * ay) / D,
      v: (px, py) => ((px - ox) * -ay + (py - oy) * ax) / D,
    };
  }
  return frames;
}

/**
 * Both sides' state every GRID_S of the round: men alive, mean and leading-edge
 * (90th percentile) progress toward the enemy spawn, ticket losses so far, and
 * how many players have been on the field so far (the scale tickets run on).
 */
export function sideStates(replay, kills = []) {
  const frames = sideFrames(replay);
  if (!frames) return null;
  const { x, y } = replay.tracks, P = replay.playerCount, ft = replay.frameTimes;
  const endT = ft[replay.frameCount - 1] || 0;
  const n = Math.floor(endT / GRID_S) + 1;
  const t = new Float64Array(n);
  const mk = () => ({ alive: new Float64Array(n), mean: new Float64Array(n).fill(NaN), front: new Float64Array(n).fill(NaN), lost: new Float64Array(n) });
  const side = { 1: mk(), 2: mk() };
  const seen = new Float64Array(n);
  const seenSet = new Set();
  const byTs = [...kills].filter((k) => Number.isFinite(k.ts)).sort((a, b) => a.ts - b.ts);
  const lost = { 1: 0, 2: 0 };
  let ki = 0, lastF = -1;
  for (let i = 0; i < n; i++) {
    t[i] = i * GRID_S;
    const f = frameAt(ft, t[i]);
    // everyone sampled since the previous grid point counts as having been on the field
    for (let g = lastF + 1; g <= f; g++) for (let p = 0; p < P; p++) if (!Number.isNaN(x[g * P + p])) seenSet.add(replay.players[p].name);
    lastF = f;
    seen[i] = seenSet.size;
    const us = { 1: [], 2: [] };
    for (let p = 0; p < P; p++) {
      const s = replay.players[p].team, j = f * P + p;
      if ((s !== 1 && s !== 2) || Number.isNaN(x[j])) continue;
      us[s].push(frames[s].u(x[j], y[j]));
    }
    while (ki < byTs.length && byTs[ki].ts <= t[i]) {
      const k = byTs[ki++];
      if (k.victimTeam === 1 || k.victimTeam === 2) lost[k.victimTeam] += STANCE_TICKETS[k.victimFormation] ?? 1;
    }
    for (const s of TEAMS) {
      const a = us[s], st = side[s];
      st.alive[i] = a.length; st.lost[i] = lost[s];
      if (!a.length) continue;
      st.mean[i] = a.reduce((m, v) => m + v, 0) / a.length;
      st.front[i] = quantile(Float64Array.from(a).sort(), 0.9);
    }
  }
  return { t, side, seen, frames };
}

// --- training samples ------------------------------------------------------------
// A round's contribution to the win model, stored once when its replay arrives:
// its side states, rounded. Nothing in it depends on the calibration (time limits,
// attackers), so stored samples stay good as that is re-learned. Bump
// SAMPLE_VERSION whenever sideStates changes, and stored samples are rebuilt.
export const SAMPLE_VERSION = 1;
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);

/**
 * A stored replay (as recorded) plus its scoreboard kills → its training sample, or null.
 * @param {any} recorded @param {any[]} kills @param {number | null} [roundEndT]
 */
export function sampleFromRecording(recorded, kills, roundEndT = null) {
  const replay = fillTimeline(recorded, Number.isFinite(roundEndT) ? roundEndT : null);
  const st = sideStates(replay, alignKills(kills, replay.meta));
  if (!st) return null;
  const pack = (side) => Object.fromEntries(['alive', 'mean', 'front', 'lost'].map((k) => [k, Array.from(side[k], r3)]));
  return { v: SAMPLE_VERSION, key: replayAreaKey(replay.meta), seen: Array.from(st.seen), side: { 1: pack(st.side[1]), 2: pack(st.side[2]) } };
}

/** A stored sample back into the side states winFeatures and frontByMinute read. */
export function statesFromSample(sample) {
  const n = sample.seen.length;
  const un = (a) => Float64Array.from(a, (v) => (v == null ? NaN : v));
  const side = (s) => ({ alive: un(s.alive), mean: un(s.mean), front: un(s.front), lost: un(s.lost) });
  return { t: Float64Array.from({ length: n }, (_, i) => i * GRID_S), seen: Float64Array.from(sample.seen), side: { 1: side(sample.side[1]), 2: side(sample.side[2]) } };
}

/** The model's inputs at grid point i, from side 1's (USA's) point of view. */
export const WIN_FEATURES = ['lossDiff', 'lossUsa', 'lossCsa', 'alive', 'front', 'mean', 'vel', 'r', 'late',
  'r_late', 'r_front', 'r_front_late', 'loss_late', 'alive_late'];
export function winFeatures(states, i, calib = {}, key = '') {
  const { side, seen, t } = states, a = side[1], b = side[2];
  const scale = Math.max(10, seen[i]);
  const lag = Math.max(0, i - VEL_S / GRID_S);
  const z = (v) => (Number.isFinite(v) ? v : 0);
  const limit = calib.limits?.[key] ?? calib.defaultLimit ?? DEFAULT_LIMIT_S;
  const r = calib.roles?.[key] ?? 0;               // +1: USA attacks here, -1: USA defends, 0: unknown
  const late = clamp01(t[i] / limit);
  const lossDiff = (b.lost[i] - a.lost[i]) / scale;
  // early on, one side's men are often still loading in: a head start in numbers there means nothing
  const alive = Math.log((a.alive[i] + 1) / (b.alive[i] + 1)) * clamp01(t[i] / LOADING_S);
  const front = z(a.front[i] - b.front[i]);
  const f = {
    lossDiff, lossUsa: a.lost[i] / scale, lossCsa: b.lost[i] / scale, alive, front,
    mean: z(a.mean[i] - b.mean[i]),
    vel: z((a.mean[i] - a.mean[lag]) - (b.mean[i] - b.mean[lag])),
    r, late, r_late: r * late, r_front: r * front, r_front_late: r * front * late,
    loss_late: lossDiff * late, alive_late: alive * late,
  };
  return WIN_FEATURES.map((k) => f[k]);
}

/** P(USA wins) at every grid point, or null without a model. */
export function winProbability(states, model, key) {
  if (!states || !model?.win) return null;
  const { intercept, coef } = model.win;
  return Float64Array.from(states.t, (_, i) =>
    sigmoid(winFeatures(states, i, model.calib, key).reduce((s, v, j) => s + v * coef[j], intercept)));
}

/**
 * The round's biggest momentum swings: the largest changes in win chance over
 * windowS, greedy and non-overlapping, each with what happened in it.
 */
export function swings(states, pUsa, kills = [], { windowS = 60, count = 5, minDelta = 0.1 } = {}) {
  if (!pUsa) return [];
  const w = Math.max(1, Math.round(windowS / GRID_S)), cands = [];
  for (let i = w; i < pUsa.length; i++) cands.push({ i0: i - w, i1: i, d: pUsa[i] - pUsa[i - w] });
  cands.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const taken = [], out = [];
  for (const c of cands) {
    if (out.length >= count || Math.abs(c.d) < minDelta) break;
    if (taken.some(([a, b]) => c.i0 < b && c.i1 > a)) continue;
    taken.push([c.i0, c.i1]);
    const t0 = states.t[c.i0], t1 = states.t[c.i1];
    const deaths = { 1: 0, 2: 0 };
    for (const k of kills) if (k.ts > t0 && k.ts <= t1 && (k.victimTeam === 1 || k.victimTeam === 2)) deaths[k.victimTeam]++;
    const advanceYd = {};
    for (const s of TEAMS) {
      const fr = states.side[s].front;
      advanceYd[s] = Number.isFinite(fr[c.i1] - fr[c.i0]) ? (fr[c.i1] - fr[c.i0]) * states.frames[s].spawnDistM * YARDS_PER_METER : null;
    }
    out.push({ t0, t1, p0: pUsa[c.i0], p1: pUsa[c.i1], deaths, advanceYd });
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/** A side's leading-edge progress (0 own spawn … 1 enemy spawn) once a minute, for the area history. */
export function frontByMinute(states, team) {
  const out = [];
  for (let m = 0; m * 60 <= states.t[states.t.length - 1]; m++) out.push(states.side[team].front[Math.min(states.t.length - 1, (m * 60) / GRID_S)]);
  return out;
}

// --- per player and per company -------------------------------------------------

// One entry per person (a side or company swap splits a player into stints).
function people(replay) {
  const by = new Map();
  replay.players.forEach((p, i) => {
    let e = by.get(p.name);
    if (!e) by.set(p.name, e = { name: p.name, stints: [], team: p.team });
    e.stints.push(i);
  });
  return [...by.values()];
}

/**
 * Distance each person covered on the field, in yards: the sum of their moves
 * between consecutive samples while alive, leaving out respawns and teleports
 * (anything faster than a galloping horse). Mounted yards are counted apart.
 */
export function distanceTravelled(replay) {
  const { x, y, lk } = replay.tracks, P = replay.playerCount, ft = replay.frameTimes;
  return people(replay).map((who) => {
    let m = 0, mounted = 0, aliveS = 0, team = who.team, bestFrames = -1;
    for (const p of who.stints) {
      let frames = 0;
      for (let f = 1; f < replay.frameCount; f++) {
        const a = (f - 1) * P + p, b = f * P + p;
        if (Number.isNaN(x[a]) || Number.isNaN(x[b])) continue;
        const dt = ft[f] - ft[f - 1], d = Math.hypot(x[b] - x[a], y[b] - y[a]);
        frames++; aliveS += dt;
        if (dt <= 0 || d > MAX_STEP_MPS * dt) continue;
        m += d;
        if (isMounted(lk[b])) mounted += d;
      }
      if (frames > bestFrames) { bestFrames = frames; team = replay.players[p].team; }
    }
    return { name: who.name, team, yards: m * YARDS_PER_METER, mountedYards: mounted * YARDS_PER_METER, aliveS };
  }).sort((a, b) => b.yards - a.yards);
}

/**
 * Everyone who carried a flag: total time on it, how many separate times they
 * took it up (a pickup after a gap, death or swap counts again), the longest
 * single carry, and the yards they carried it.
 */
export function flagBearers(replay) {
  const { x, y, lk } = replay.tracks, P = replay.playerCount, ft = replay.frameTimes;
  const step = 2 / (replay.meta?.sampleRateHz || 2);   // a sample counts for at most two sample periods
  const out = [];
  for (const who of people(replay)) {
    let timeS = 0, holds = 0, longestS = 0, carriedM = 0, team = who.team;
    for (const p of who.stints) {
      let run = 0, prevFlag = false;
      for (let f = 0; f < replay.frameCount; f++) {
        const j = f * P + p;
        const flag = !Number.isNaN(x[j]) && leaderOf(lk[j]) === LEADER_KIND.FLAG;
        if (flag) {
          const dt = Math.min(step, (ft[f + 1] ?? ft[f] + step / 2) - ft[f]);
          if (!prevFlag) { holds++; run = 0; team = replay.players[p].team; }
          run += dt; timeS += dt;
          if (prevFlag) {
            const d = Math.hypot(x[j] - x[j - P], y[j] - y[j - P]);
            if (d <= MAX_STEP_MPS * (ft[f] - ft[f - 1])) carriedM += d;
          }
          longestS = Math.max(longestS, run);
        }
        prevFlag = flag;
      }
    }
    if (holds) out.push({ name: who.name, team, timeS, holds, longestS, carriedYards: carriedM * YARDS_PER_METER });
  }
  return out.sort((a, b) => b.timeS - a.timeS);
}

/**
 * Each company's round, descriptively (a company = the replay's side +
 * regiment + company). `label(playerIndex)` names it -- the viewer passes the
 * roster's regiment/company. Per company: men who served in it, average alive,
 * kills and deaths, share of its time in contact (enemy within CONTACT_M), its
 * typical distance to the nearest enemy, share of its time in the front third
 * of its side, and the ground it gained from first to last appearance.
 */
export function companySheet(replay, states, kills = [], label = () => null) {
  if (!states) return [];
  const { x, y } = replay.tracks, P = replay.playerCount, ft = replay.frameTimes;
  const keyOf = (p) => `${p.team}|${p.regimentCrc}|${p.company}`;
  const comps = new Map();
  replay.players.forEach((p, i) => {
    if (p.team !== 1 && p.team !== 2) return;
    let c = comps.get(keyOf(p));
    if (!c) comps.set(keyOf(p), c = { key: keyOf(p), team: p.team, members: new Set(), idx: [], labels: new Map() });
    c.members.add(p.name); c.idx.push(i);
    const l = label(i);
    if (l) c.labels.set(l, (c.labels.get(l) ?? 0) + 1);
  });
  const list = [...comps.values()];
  // named by most of its men: one roster row can disagree with the rest
  for (const c of list) c.label = [...c.labels].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const byName = new Map();
  for (const c of list) for (const n of c.members) if (!byName.has(n)) byName.set(n, c);
  for (const c of list) Object.assign(c, { kills: 0, deaths: 0, aliveSum: 0, pts: 0, contact: 0, front: 0, dists: [], uFirst: null, uLast: null });
  for (const k of kills) {
    const v = byName.get(k.victim); if (v && k.victimTeam === v.team) v.deaths++;
    const kk = byName.get(k.killer); if (kk && k.killerTeam === kk.team && k.victimTeam !== kk.team) kk.kills++;
  }
  for (let i = 0; i < states.t.length; i++) {
    const f = frameAt(ft, states.t[i]);
    const pos = { 1: [], 2: [] };
    for (let p = 0; p < P; p++) {
      const s = replay.players[p].team, j = f * P + p;
      if ((s === 1 || s === 2) && !Number.isNaN(x[j])) pos[s].push([x[j], y[j]]);
    }
    const centres = [];
    for (const c of list) {
      const xs = [], ys = [];
      for (const p of c.idx) { const j = f * P + p; if (!Number.isNaN(x[j])) { xs.push(x[j]); ys.push(y[j]); } }
      c.pts++; c.aliveSum += xs.length;
      if (!xs.length) continue;
      const cx = medianOf(xs), cy = medianOf(ys);
      let best = Infinity;
      for (const [ex, ey] of pos[3 - c.team]) best = Math.min(best, Math.hypot(ex - cx, ey - cy));
      if (Number.isFinite(best)) { c.dists.push(best); if (best <= CONTACT_M) c.contact++; }
      const u = states.frames[c.team].u(cx, cy);
      c.uFirst ??= u; c.uLast = u;
      centres.push([c, u]);
    }
    for (const s of TEAMS) {
      const mine = centres.filter(([c]) => c.team === s).sort((a, b) => a[1] - b[1]);
      mine.forEach(([c], r) => { if (mine.length > 1 && r >= (2 * (mine.length - 1)) / 3) c.front++; });
    }
  }
  return list.map((c) => {
    const present = c.dists.length || 1;
    return {
      key: c.key, team: c.team, label: c.label, men: c.members.size,
      avgAlive: c.aliveSum / Math.max(1, c.pts), kills: c.kills, deaths: c.deaths,
      contactPct: c.contact / present, frontPct: c.front / present,
      medianEnemyYd: c.dists.length ? medianOf(c.dists) * YARDS_PER_METER : null,
      gainedYd: c.uFirst == null ? null : (c.uLast - c.uFirst) * states.frames[c.team].spawnDistM * YARDS_PER_METER,
    };
  }).sort((a, b) => a.team - b.team || b.men - a.men);
}

/**
 * Where each side spent the round (kind 'presence': a sample per player per
 * frame) or where its men fell ('deaths': computeDeaths' list), binned on a
 * cellM grid in world meters.
 */
export function heatGrid(replay, kind, deaths = [], cellM = 20) {
  const cells = new Map();   // "cx,cy" → { 1: n, 2: n }
  const add = (wx, wy, team) => {
    if (team !== 1 && team !== 2) return;
    const k = `${Math.floor(wx / cellM)},${Math.floor(wy / cellM)}`;
    let c = cells.get(k); if (!c) cells.set(k, c = { 1: 0, 2: 0 });
    c[team]++;
  };
  if (kind === 'deaths') for (const d of deaths) add(d.x, d.y, d.team);
  else {
    const { x, y } = replay.tracks, P = replay.playerCount;
    for (let f = 0; f < replay.frameCount; f++) for (let p = 0; p < P; p++) {
      const j = f * P + p;
      if (!Number.isNaN(x[j])) add(x[j], y[j], replay.players[p].team);
    }
  }
  let max = 0;
  const out = [...cells].map(([k, c]) => {
    const [cx, cy] = k.split(',').map(Number);
    max = Math.max(max, c[1], c[2]);
    return { x: cx * cellM, y: cy * cellM, 1: c[1], 2: c[2] };
  });
  return { cellM, cells: out, max };
}

/** Everything the Analysis panel shows, in one pass. `model` is the round model (roundModelFit.js), or null. */
export function analyseRound(replay, kills, model, label) {
  const states = sideStates(replay, kills);
  const key = replayAreaKey(replay.meta);
  const pUsa = winProbability(states, model, key);
  return {
    key, states, pUsa,
    swings: swings(states, pUsa, kills),
    history: model?.areas?.[key] ?? null,
    fronts: states ? { 1: frontByMinute(states, 1), 2: frontByMinute(states, 2) } : null,
    companies: companySheet(replay, states, kills, label),
    flags: flagBearers(replay),
    distance: distanceTravelled(replay),
  };
}
