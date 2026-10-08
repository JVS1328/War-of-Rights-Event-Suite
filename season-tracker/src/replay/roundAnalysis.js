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
import { alignKills, teamOf } from './killAlign.js';
import { roundStateAt } from './eventsParser.js';
import { areaFacts } from './areaFacts.js';

export const GRID_S = 5;            // side states every 5 s of round time
const ANCHOR_S = 60;                // a side's spawn = where it stood its first 60 s on the field
const VEL_S = 30;                   // movement measured over the last 30 s
const LOADING_S = 120;              // men alive only counts once both sides have had time to load in
const ALIVE_S = 120;                // men alive: each side's average over the last 2 min, not this instant
const CONTACT_M = 100;              // a company is "in contact" with an enemy this close
const STANCE_TICKETS = { in_form: 1, skirm: 3, oob: 5 };   // a death's ticket cost by stance
/** Tickets a side lost, from its casualties by stance ({ inForm, skirm, oob }), or null without them. */
export const ticketCost = (c) => (c && [c.inForm, c.skirm, c.oob].every(Number.isFinite)
  ? c.inForm * STANCE_TICKETS.in_form + c.skirm * STANCE_TICKETS.skirm + c.oob * STANCE_TICKETS.oob : null);
// The server's population from the replay: its peak on the field, × this, is the
// scoreboard's peak. ponytail: measured on 207 PUBS rounds (r = 0.995, IQR 0.08)
// -- re-measure if the game changes how it counts players.
const ON_FIELD_TO_POP = 1.16;
// A side's starting tickets are all it gets, and a casualty costs its stance
// tickets × TICKET_POP / the server's population: the more players, the less
// each one is worth. ponytail: measured 17-20 against the HUD on 15 PUBS
// Skirmish rounds (2026-10-06) -- re-measure if the game changes it.
export const TICKET_POP = 18;
const peakOnField = (side, n) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, side[1].alive[i] + side[2].alive[i]); return m; };
// Each side's losses so far, every death at its stance tickets over the population when it fell -- the
// peak on the field up to then × ON_FIELD_TO_POP -- so a moment's ticket share uses only what was known
// at it, as the overlay's live odds do. Divided by a side's pool per player (starting tickets ÷
// TICKET_POP) it is that share. Worked out once per round.
const perPop = new WeakMap();
function lossPerPop(states) {
  if (!perPop.has(states)) {
    const { side, t } = states, out = { 1: new Float64Array(t.length), 2: new Float64Array(t.length) };
    let peak = 0;
    for (let i = 0; i < t.length; i++) {
      peak = Math.max(peak, side[1].alive[i] + side[2].alive[i]);
      const pop = Math.max(10, peak * ON_FIELD_TO_POP);
      for (const s of TEAMS) out[s][i] = (i ? out[s][i - 1] : 0) + (side[s].lost[i] - (i ? side[s].lost[i - 1] : 0)) / pop;
    }
    perPop.set(states, out);
  }
  return perPop.get(states);
}
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
  let readyT = 0;
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
    readyT = Math.max(readyT, t0 + ANCHOR_S);
  }
  // readyT: both spawns set -- the overlay's live odds start here
  const frames = { readyT };
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
export function sideStates(replay, kills = [], events = null) {
  const frames = sideFrames(replay);
  if (!frames) return null;
  const { x, y } = replay.tracks, P = replay.playerCount, ft = replay.frameTimes;
  const endT = ft[replay.frameCount - 1] || 0;
  const n = Math.floor(endT / GRID_S) + 1;
  const t = new Float64Array(n);
  const mk = () => ({ alive: new Float64Array(n), mean: new Float64Array(n).fill(NaN), front: new Float64Array(n).fill(NaN), lost: new Float64Array(n), spent: new Float64Array(n).fill(NaN) });
  const side = { 1: mk(), 2: mk() };
  const seen = new Float64Array(n);
  const seenSet = new Set();
  const byTs = [...kills].filter((k) => Number.isFinite(k.ts)).sort((a, b) => a.ts - b.ts);
  const lost = { 1: 0, 2: 0 };
  let ki = 0, lastF = -1;
  // the HUD's ticket count, less its reads across a stage change: recorders up to 2026-10-08 read a
  // side a stage off there until its next ticket loss (wor_overlay engine.cpp read_round_info)
  const hud = events?.filter((e) => !(e.event === 'tickets'
    && events.some((m) => m.event === 'morale' && m.team === e.team && Math.abs(m.t - e.t) < 1)));
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
    // the HUD's own count, where the replay has it (_events.csv): it also sees what deaths don't,
    // like Conquest's point bleed and Contention's held-cap stage drop
    const now = hud?.length ? roundStateAt(hud, t[i]).teams : null;
    for (const s of TEAMS) {
      const a = us[s], st = side[s];
      st.alive[i] = a.length; st.lost[i] = lost[s];
      if (/laststand|finalpush/i.test(now?.[s].morale ?? '')) st.spent[i] = 1;
      else if (now?.[s].pct != null) st.spent[i] = clamp01(1 - now[s].pct / 100);
      if (!a.length) continue;
      st.mean[i] = a.reduce((m, v) => m + v, 0) / a.length;
      st.front[i] = quantile(Float64Array.from(a).sort(), 0.9);
    }
  }
  return { t, side, seen, frames, peak: peakOnField(side, n), readyT: frames.readyT };
}

// --- training samples ------------------------------------------------------------
// A round's contribution to the win model, stored once when its replay arrives:
// its side states, rounded. Nothing in it depends on the calibration (time limits,
// attackers), so stored samples stay good as that is re-learned. Bump
// SAMPLE_VERSION whenever sideStates changes, and stored samples are rebuilt.
export const SAMPLE_VERSION = 2;
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);

/**
 * A stored replay (as recorded) plus its scoreboard kills and round events → its training sample, or null.
 * @param {any} recorded @param {any[]} kills @param {number | null} [roundEndT] @param {any[] | null} [events]
 */
export function sampleFromRecording(recorded, kills, roundEndT = null, events = null) {
  const replay = fillTimeline(recorded, Number.isFinite(roundEndT) ? roundEndT : null);
  const st = sideStates(replay, alignKills(kills, replay.meta), events);
  if (!st) return null;
  const pack = (side) => Object.fromEntries(['alive', 'mean', 'front', 'lost', 'spent'].map((k) => [k, Array.from(side[k], r3)]));
  return { v: SAMPLE_VERSION, key: replayAreaKey(replay.meta), seen: Array.from(st.seen), side: { 1: pack(st.side[1]), 2: pack(st.side[2]) } };
}

/**
 * What a round's scoreboard (or replay header) knows for certain, from recorders
 * of 2026-10-05 on, onto its side states for winFeatures:
 *   defendingTeam                     'USA' | 'CSA' | 1 | 2 (Skirmish only) -> states.defending
 *   startTicketsUsa, startTicketsCsa  each side's starting tickets          -> states.startTickets
 *   finalPushTime                     the Final Push timer, s (Skirmish)    -> states.finalPushS
 * Where it's blank, the game's own setup for the area (`key`, areaFacts) stands in;
 * where that doesn't know the area either, the calibration's inference (roles, pools).
 */
export function withRoundFacts(states, { defendingTeam = null, startTicketsUsa = null, startTicketsCsa = null, finalPushTime = null } = {}, key = null) {
  if (!states) return states;
  const pos = (v) => (Number(v) > 0 ? Number(v) : null);
  const game = key ? areaFacts(key) : null;
  states.defending = teamOf(defendingTeam) ?? game?.defending ?? null;
  states.startTickets = { 1: pos(startTicketsUsa) ?? game?.tickets[1] ?? null, 2: pos(startTicketsCsa) ?? game?.tickets[2] ?? null };
  states.finalPushS = pos(finalPushTime) ?? game?.finalPushS ?? null;
  return states;
}

/**
 * A stored sample back into the side states winFeatures and frontByMinute read;
 * `facts` the round's known setup (withRoundFacts).
 */
export function statesFromSample(sample, facts = {}) {
  const n = sample.seen.length;
  const un = (a) => Float64Array.from(a ?? { length: n }, (v) => (v == null ? NaN : v));
  const side = (s) => ({ alive: un(s.alive), mean: un(s.mean), front: un(s.front), lost: un(s.lost), spent: un(s.spent) });
  const sides = { 1: side(sample.side[1]), 2: side(sample.side[2]) };
  return withRoundFacts({ t: Float64Array.from({ length: n }, (_, i) => i * GRID_S), seen: Float64Array.from(sample.seen), side: sides, peak: peakOnField(sides, n) }, facts, sample.key);
}

/** The model's inputs at grid point i, from side 1's (USA's) point of view. */
export const WIN_FEATURES = ['lossDiff', 'lossUsa', 'lossCsa', 'alive', 'front', 'mean', 'vel', 'r', 'late',
  'r_late', 'r_front', 'r_front_late', 'loss_late', 'alive_late', 'area', 'area_early',
  'poolUsa', 'poolCsa', 'poolDiff', 'breakUsa', 'breakCsa', 'fpUsa', 'fpCsa', 'fpLeftUsa', 'fpLeftCsa',
  'lsUsa', 'lsCsa', 'lsLeftUsa', 'lsLeftCsa'];

const AREA_SHRINK = 10;   // an area's win rate is pulled toward its prior by this many rounds
/**
 * USA's win rate on this area across every scoreboard (calib.rates), as a
 * logit: { usa, n } shrunk toward `p0` (another model's rate there, or 50%).
 * Training leaves the round's own result out (`minus`: its winner).
 */
export function areaLogit(calib, key, minus = null) {
  const e = calib?.rates?.[key];
  if (!e) return 0;
  const n = Math.max(0, e.n - (minus ? 1 : 0)), usa = Math.min(n, Math.max(0, e.usa - (minus === 1 ? 1 : 0)));
  return Math.log((usa + AREA_SHRINK * e.p0) / (n - usa + AREA_SHRINK * (1 - e.p0)));
}

export function winFeatures(states, i, calib = {}, key = '', minus = null) {
  const { side, seen, t } = states, a = side[1], b = side[2];
  const scale = Math.max(10, seen[i]);
  const lag = Math.max(0, i - VEL_S / GRID_S);
  const z = (v) => (Number.isFinite(v) ? v : 0);
  const limit = calib.limits?.[key] ?? calib.defaultLimit ?? DEFAULT_LIMIT_S;
  // +1: USA attacks, -1: USA defends, 0: unknown -- the round's own defender (withRoundFacts), else the area's
  const r = states.defending ? (states.defending === 2 ? 1 : -1) : calib.roles?.[key] ?? 0;
  const late = clamp01(t[i] / limit);
  const lossDiff = (b.lost[i] - a.lost[i]) / scale;
  const front = z(a.front[i] - b.front[i]);
  const area = areaLogit(calib, key, minus);
  // each side's share of its tickets spent: the HUD's where known, else its losses so far over its pool
  // per player -- its real starting tickets (withRoundFacts) or the area's (calib.pools), in stance tickets
  const perPopLost = lossPerPop(states);
  const pool = (s, j = i) => {
    if (Number.isFinite(side[s].spent?.[j])) return side[s].spent[j];
    const k = states.startTickets?.[s] ? states.startTickets[s] / TICKET_POP : calib.pools?.[key]?.[s] ?? calib.poolDefault?.[s];
    return k ? clamp01(perPopLost[s][j] / k) : 0;
  };
  const pu = pool(1), pc = pool(2);
  // Final Push: the Skirmish attacker out of tickets, still spawning but against a deadline -- its
  // timer, or the round's own clock if that runs out first -- and how much of the timer is left
  const fp = { 1: 0, 2: 0 }, fpLeft = { 1: 0, 2: 0 };
  const att = states.defending ? 3 - states.defending : null;
  if (att && states.finalPushS > 0 && pool(att) >= 1) {
    let out = i;
    while (out > 0 && pool(att, out - 1) >= 1) out--;
    fp[att] = 1;
    fpLeft[att] = Math.max(0, (Math.min(t[out] + states.finalPushS, limit) - t[i]) / states.finalPushS);
  }
  // Last Stand: any other side out of tickets -- no respawns, the men it has are all it gets -- and
  // that x the share of the round's clock it still has to hold out. Against a side that still has
  // tickets it nearly always loses (2 of 78 PUBS rounds); the head count alone kept it near 6-20 %
  const ls = { 1: +(pu >= 1 && att !== 1), 2: +(pc >= 1 && att !== 2) };
  // men alive, each side's average over the last ALIVE_S: a charge that's cut down or a respawn wave
  // landing moves it over minutes, not all at once (on 211 PUBS rounds: more accurate, and two thirds
  // fewer 15-point jumps in 30 s). Early on, one side's men are often still loading in: a head start
  // in numbers there means nothing
  const recent = (arr) => { let s = 0, k = 0; for (let j = Math.max(0, i - ALIVE_S / GRID_S + 1); j <= i; j++, k++) s += arr[j]; return s / k; };
  const alive = Math.log((recent(a.alive) + 1) / (recent(b.alive) + 1)) * clamp01(t[i] / LOADING_S);
  const f = {
    lossDiff, lossUsa: a.lost[i] / scale, lossCsa: b.lost[i] / scale, alive, front,
    mean: z(a.mean[i] - b.mean[i]),
    vel: z((a.mean[i] - a.mean[lag]) - (b.mean[i] - b.mean[lag])),
    r, late, r_late: r * late, r_front: r * front, r_front_late: r * front * late,
    loss_late: lossDiff * late, alive_late: alive * late,
    area, area_early: area * (1 - late),
    poolUsa: pu, poolCsa: pc, poolDiff: pc - pu, breakUsa: Math.max(0, pu - 0.5) ** 2, breakCsa: Math.max(0, pc - 0.5) ** 2,
    fpUsa: fp[1], fpCsa: fp[2], fpLeftUsa: fpLeft[1], fpLeftCsa: fpLeft[2],
    lsUsa: ls[1], lsCsa: ls[2], lsLeftUsa: ls[1] * (1 - late), lsLeftCsa: ls[2] * (1 - late),
  };
  return WIN_FEATURES.map((k) => f[k]);
}

/**
 * P(USA wins) at every grid point, or null without a model. `winner`, when the
 * round's result is known, is left out of the area's win rate it already counts.
 */
export function winProbability(states, model, key, winner = null) {
  if (!states || model?.win?.features?.join() !== WIN_FEATURES.join()) return null;   // none, or fitted on other features
  const { intercept, coef } = model.win;
  return Float64Array.from(states.t, (_, i) =>
    sigmoid(winFeatures(states, i, model.calib, key, winner).reduce((s, v, j) => s + v * coef[j], intercept)));
}

/**
 * The round's biggest momentum swings: the largest changes in win chance over
 * windowS, greedy and non-overlapping, each with what happened in it.
 */
export function swings(states, pUsa, kills = [], { windowS = 60, count = 5, minDelta = 0.1 } = {}) {
  if (!pUsa) return [];
  const w = Math.max(1, Math.round(windowS / GRID_S)), cands = [];
  for (let i = w; i < pUsa.length; i++) if (Number.isFinite(pUsa[i - w])) cands.push({ i0: i - w, i1: i, d: pUsa[i] - pUsa[i - w] });
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
  const tick = 1 / (replay.meta?.sampleRateHz || 2);   // a frame counts until the next, capped at two ticks over a gap   // a sample counts for at most two sample periods
  const out = [];
  for (const who of people(replay)) {
    let timeS = 0, holds = 0, longestS = 0, carriedM = 0, team = who.team;
    for (const p of who.stints) {
      let run = 0, prevFlag = false;
      for (let f = 0; f < replay.frameCount; f++) {
        const j = f * P + p;
        const flag = !Number.isNaN(x[j]) && leaderOf(lk[j]) === LEADER_KIND.FLAG;
        if (flag) {
          const dt = Math.min(2 * tick, (ft[f + 1] ?? ft[f] + tick) - ft[f]);
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
 * What happened on each patch of ground (cellM square, in world meters): how
 * long each side's men spent there (man-seconds), how many of each side fell
 * there (`deaths`: computeDeaths' list), which companies held it longest, and
 * when it was first and last occupied. The heatmap is drawn from it, and
 * hovering the heatmap reads it (areaSummary).
 */
export function areaStats(replay, deaths = [], label = () => null, cellM = 25) {
  const { x, y } = replay.tracks, P = replay.playerCount, ft = replay.frameTimes;
  const tick = 1 / (replay.meta?.sampleRateHz || 2);   // a frame counts until the next, capped at two ticks over a gap
  const cells = new Map();   // cx * 4096 + cy → stats
  const companyName = new Map();
  const at = (wx, wy) => {
    const cx = Math.floor(wx / cellM), cy = Math.floor(wy / cellM), k = cx * 4096 + cy;
    let c = cells.get(k);
    if (!c) cells.set(k, c = { x: cx * cellM, y: cy * cellM, s: { 1: 0, 2: 0 }, dead: { 1: 0, 2: 0 }, first: Infinity, last: -Infinity, by: new Map() });
    return c;
  };
  const keys = replay.players.map((p, i) => {
    const k = `${p.team}|${p.regimentCrc}|${p.company}`;
    if (!companyName.has(k)) companyName.set(k, { team: p.team, name: label(i) });
    else if (!companyName.get(k).name) companyName.get(k).name = label(i);
    return k;
  });
  for (let f = 0; f < replay.frameCount; f++) {
    const dt = Math.min(2 * tick, (ft[f + 1] ?? ft[f] + tick) - ft[f]);
    for (let p = 0; p < P; p++) {
      const j = f * P + p, team = replay.players[p].team;
      if (Number.isNaN(x[j]) || (team !== 1 && team !== 2)) continue;
      const c = at(x[j], y[j]);
      c.s[team] += dt;
      c.first = Math.min(c.first, ft[f]); c.last = Math.max(c.last, ft[f]);
      c.by.set(keys[p], (c.by.get(keys[p]) ?? 0) + dt);
    }
  }
  for (const d of deaths) if (d.team === 1 || d.team === 2) at(d.x, d.y).dead[d.team]++;
  const max = { s: 0, dead: 0 };
  for (const c of cells.values()) {
    max.s = Math.max(max.s, c.s[1], c.s[2]);
    max.dead = Math.max(max.dead, c.dead[1], c.dead[2]);
  }
  return { cellM, cells, max, companyName };
}

/**
 * The ground made up of `cells` (areaStats' cells -- the caller picks them, e.g.
 * those under the cursor): each side's man-seconds and dead there, the
 * companies that held it longest, and when it was first and last occupied.
 * Null where nobody ever was.
 */
export function areaSummary(stats, cells) {
  const out = { s: { 1: 0, 2: 0 }, dead: { 1: 0, 2: 0 }, first: Infinity, last: -Infinity };
  const by = new Map();
  for (const c of cells) {
    for (const t of TEAMS) { out.s[t] += c.s[t]; out.dead[t] += c.dead[t]; }
    out.first = Math.min(out.first, c.first); out.last = Math.max(out.last, c.last);
    for (const [k, v] of c.by) by.set(k, (by.get(k) ?? 0) + v);
  }
  if (!out.s[1] && !out.s[2] && !out.dead[1] && !out.dead[2]) return null;
  out.companies = [...by].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, s]) => ({ ...stats.companyName.get(k), s }));
  return out;
}

/**
 * areaStats as a smooth density per side, for drawing: on the cell grid over
 * the occupied ground (cell (i, j) is world (x0 + i·cellM, y0 + j·cellM)),
 * each side's man-seconds ('presence') or dead ('deaths') blurred with a
 * Gaussian of sigma `sigmaCells`. `max` is the larger side's peak.
 */
export function heatDensity(stats, kind, sigmaCells = 1.5) {
  const { cellM, cells } = stats, pad = Math.ceil(3 * sigmaCells);
  if (!cells.size) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells.values()) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y);
  }
  x0 -= pad * cellM; y0 -= pad * cellM;
  const w = Math.round((x1 - x0) / cellM) + pad + 1, h = Math.round((y1 - y0) / cellM) + pad + 1;
  const kernel = Array.from({ length: 2 * pad + 1 }, (_, k) => Math.exp(-((k - pad) ** 2) / (2 * sigmaCells ** 2)));
  const d = {};
  let max = 0;
  for (const t of TEAMS) {
    const a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (const c of cells.values()) a[Math.round((c.y - y0) / cellM) * w + Math.round((c.x - x0) / cellM)] = kind === 'deaths' ? c.dead[t] : c.s[t];
    // separable blur: rows into b, then columns back into a
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let v = 0;
      for (let k = -pad; k <= pad; k++) if (i + k >= 0 && i + k < w) v += a[j * w + i + k] * kernel[k + pad];
      b[j * w + i] = v;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let v = 0;
      for (let k = -pad; k <= pad; k++) if (j + k >= 0 && j + k < h) v += b[(j + k) * w + i] * kernel[k + pad];
      a[j * w + i] = v;
      max = Math.max(max, v);
    }
    d[t] = a;
  }
  return { x0, y0, cellM, w, h, d, max };
}

/**
 * Where `grid` (w × h, row-major) crosses `level`, by marching squares: segments
 * [x0, y0, x1, y1] in grid units, sample (i, j) at (i, j). A square with a
 * corner `keep` (same shape, optional) rules out is skipped.
 */
export function isoSegments(grid, w, h, level, keep = null) {
  const out = [], t = (a, b) => (level - a) / (b - a);
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const k = j * w + i;
    if (keep && !(keep[k] && keep[k + 1] && keep[k + w] && keep[k + w + 1])) continue;
    const a = grid[k], b = grid[k + 1], c = grid[k + w + 1], d = grid[k + w];   // clockwise from (i, j)
    const p = [];   // crossings on the top, right, bottom and left edges, in that order
    if ((a >= level) !== (b >= level)) p.push([i + t(a, b), j]);
    if ((b >= level) !== (c >= level)) p.push([i + 1, j + t(b, c)]);
    if ((c >= level) !== (d >= level)) p.push([i + 1 - t(c, d), j + 1]);
    if ((d >= level) !== (a >= level)) p.push([i, j + 1 - t(d, a)]);
    if (p.length === 2) out.push([...p[0], ...p[1]]);
    else if (p.length === 4) {
      // a saddle: the centre decides which pair of opposite corners is cut off
      const aSide = (a + b + c + d) / 4 >= level === a >= level;
      if (aSide) out.push([...p[0], ...p[1]], [...p[2], ...p[3]]);
      else out.push([...p[3], ...p[0]], [...p[1], ...p[2]]);
    }
  }
  return out;
}

/**
 * The line of contact at one frame: where the two sides' hold on the ground
 * balances. Each man holds the ground around him (a Gaussian of sigmaM); the
 * front is where USA's hold equals CSA's, wherever the two together are worth
 * at least `minHold` men -- so it runs between the armies, wraps any pocket of
 * one inside the other, and stops where nobody is. World-space segments
 * [x0, y0, x1, y1].
 */
export function frontLine(replay, frame, { cellM = 20, sigmaM = 50, minHold = 1 } = {}) {
  const { x, y } = replay.tracks, P = replay.playerCount, base = frame * P;
  const men = [];
  for (let p = 0; p < P; p++) {
    const team = replay.players[p].team;
    if ((team === 1 || team === 2) && !Number.isNaN(x[base + p])) men.push([x[base + p], y[base + p], team]);
  }
  if (!men.some((m) => m[2] === 1) || !men.some((m) => m[2] === 2)) return [];
  const R = Math.ceil((3 * sigmaM) / cellM);
  const x0 = Math.min(...men.map((m) => m[0])) - R * cellM, y0 = Math.min(...men.map((m) => m[1])) - R * cellM;
  const w = Math.ceil((Math.max(...men.map((m) => m[0])) - x0) / cellM) + R + 1;
  const h = Math.ceil((Math.max(...men.map((m) => m[1])) - y0) / cellM) + R + 1;
  const diff = new Float32Array(w * h), total = new Float32Array(w * h);
  for (const [mx, my, team] of men) {
    const ci = Math.round((mx - x0) / cellM), cj = Math.round((my - y0) / cellM), sign = team === 1 ? 1 : -1;
    for (let j = Math.max(0, cj - R); j <= Math.min(h - 1, cj + R); j++) {
      for (let i = Math.max(0, ci - R); i <= Math.min(w - 1, ci + R); i++) {
        const v = Math.exp(-((x0 + i * cellM - mx) ** 2 + (y0 + j * cellM - my) ** 2) / (2 * sigmaM ** 2));
        diff[j * w + i] += sign * v; total[j * w + i] += v;
      }
    }
  }
  const keep = total.map((v) => +(v >= minHold));
  return isoSegments(diff, w, h, 0, keep)
    .map(([a, b, c, d]) => [x0 + a * cellM, y0 + b * cellM, x0 + c * cellM, y0 + d * cellM]);
}

/**
 * Everything the Analysis panel shows, in one pass. `model` is the round model
 * (roundModelFit.js), or null. The
 * replay's header gives the round's defender and starting tickets where it has them.
 */
export function analyseRound(replay, kills, model, label, events = null) {
  const { defendingTeam, ticketsUsa, ticketsCsa, finalPushTime } = replay.meta;
  const states = withRoundFacts(sideStates(replay, kills, events),
    { defendingTeam, startTicketsUsa: ticketsUsa, startTicketsCsa: ticketsCsa, finalPushTime }, replayAreaKey(replay.meta));
  const key = replayAreaKey(replay.meta);
  // as the overlay had it live: nothing until both spawns are set, each moment from what was known then
  const pUsa = winProbability(states, model, key, teamOf(replay.meta.winner))
    ?.map((p, i) => (states.t[i] < states.readyT ? NaN : p)) ?? null;
  return {
    key, states, pUsa,
    swings: swings(states, pUsa, kills),
    history: model?.areas?.[key] ?? null,
    facts: model?.calib?.facts?.[key] ?? null,
    fronts: states ? { 1: frontByMinute(states, 1), 2: frontByMinute(states, 2) } : null,
    companies: companySheet(replay, states, kills, label),
    flags: flagBearers(replay),
    distance: distanceTravelled(replay),
  };
}
