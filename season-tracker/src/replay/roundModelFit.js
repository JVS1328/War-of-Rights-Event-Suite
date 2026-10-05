// Fitting the replay viewer's round model -- the win chance and the "this
// ground" history -- from stored training samples (roundAnalysis.sampleFromRecording).
//
// Each app trains its own on its own rounds, automatically: the PUBS dashboard
// on its public rounds, the season tracker on its events' season rounds, which
// are played differently. Both call fitRoundModel; the viewer just reads the
// result. Pure: no I/O.
//
// The model:
//   win    — a logistic regression for P(USA wins) on roundAnalysis.winFeatures:
//            the state of the fight every 5 s. Each round weighs the same.
//   calib  — what a replay can't say about itself, learned from every scoreboard:
//            each area's time limit (where rounds that ran to time cluster) and
//            attacker (the side that ends in Final Push rather than Last Stand).
//   areas  — per area, each side's leading-edge progress minute by minute in the
//            rounds it won and lost (quartiles).
//   validation — how it does on rounds it never saw (out of fold, by round).
//
// A model can start from another (`prior`): the season tracker starts from the
// PUBS dashboard's, which has far more rounds. Its fit is then pulled toward
// the prior's rather than toward 50%, so with few rounds of its own it is
// nearly the prior and with many it is its own; the prior's calibration fills
// in areas it hasn't learned (calibrate's `base`), and its history the ground
// it has none of. Never the other way round.
import {
  winFeatures, WIN_FEATURES, frontByMinute, areaKey, statesFromSample, SAMPLE_VERSION, DEFAULT_LIMIT_S,
} from './roundAnalysis.js';
import { teamOf } from './killAlign.js';

export const MIN_ROUNDS = 1;       // any round is something; `rounds` and `validation` say how much
const FOLDS = 5;
const RIDGE = 1;                   // L2 on standardized coefficients and the intercept (toward 50%), so a handful of rounds can't run away
const PRIOR_RIDGE = 5;             // L2 toward a prior's instead: it holds about as hard as 25 rounds would
const MIN_BAND_ROUNDS = 3;         // a minute's band needs this many rounds behind it

// "FinalPush", "Final Push", "final_push" — the two apps write morale differently.
const morale = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** A round to learn from: it had a winner and somebody fought (both sides still Battle Ready = nobody did). */
export const usableRound = ({ winner, moraleUsa, moraleCsa }) =>
  teamOf(winner) != null && !(morale(moraleUsa) === 'battleready' && morale(moraleCsa) === 'battleready');

/** A model another can start from: fitted on these features from these samples, else null. */
const usablePrior = (m) => (m?.version === SAMPLE_VERSION && m.win?.features?.join() === WIN_FEATURES.join() ? m : null);

/**
 * Time limits and attackers per area from scoreboards: [{ map, mode, area, durationS, moraleUsa, moraleCsa }],
 * over `base` (another calibration) where these boards don't settle an area.
 */
export function calibrate(boards, base = null) {
  const limits = {}, roles = {};
  for (const [key, rs] of Map.groupBy(boards, (b) => areaKey(b.map, b.mode, b.area))) {
    // the time limit: the densest 60 s band of durations past 40 min, if ≥ 5 rounds sit in it
    const d = rs.map((r) => r.durationS).filter((v) => v >= 2400).sort((a, b) => a - b);
    let best = [0, 0];
    for (let i = 0, j = 0; i < d.length; i++) { while (j < d.length && d[j] <= d[i] + 60) j++; if (j - i > best[1]) best = [i, j - i]; }
    if (best[1] >= 5) limits[key] = d[best[0] + (best[1] >> 1)];
    // the attacker ends in Final Push, the defender in Last Stand
    const usa = rs.filter((r) => morale(r.moraleUsa) === 'finalpush' || morale(r.moraleCsa) === 'laststand').length;
    const csa = rs.filter((r) => morale(r.moraleCsa) === 'finalpush' || morale(r.moraleUsa) === 'laststand').length;
    if (usa + csa >= 5 && Math.max(usa, csa) / (usa + csa) >= 0.75) roles[key] = usa > csa ? 1 : -1;
  }
  return { defaultLimit: DEFAULT_LIMIT_S, limits: { ...base?.limits, ...limits }, roles: { ...base?.roles, ...roles } };
}

/**
 * The model from rounds [{ id, winner, sample }] (winner 1 / 2) and a calibration,
 * starting from `prior` (another model) if given, or null with neither a usable
 * round nor a prior. Validation needs two rounds; with fewer it is null.
 */
export function fitRoundModel(rounds, calib, { source = '', prior = null } = {}) {
  prior = usablePrior(prior);
  const usable = rounds.filter((r) => r.sample?.v === SAMPLE_VERSION && (r.winner === 1 || r.winner === 2))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (usable.length < MIN_ROUNDS && !prior) return null;
  const rows = [], fronts = new Map();
  usable.forEach((r, ri) => {
    const states = statesFromSample(r.sample), n = states.t.length;
    for (let i = 0; i < n; i++) rows.push({ x: winFeatures(states, i, calib, r.sample.key), y: +(r.winner === 1), w: 1 / n, fold: ri % FOLDS, round: ri });
    if (!fronts.has(r.sample.key)) fronts.set(r.sample.key, []);
    fronts.get(r.sample.key).push({ winner: r.winner, f: { 1: frontByMinute(states, 1), 2: frontByMinute(states, 2) } });
  });

  const final = rows.length ? fit(rows, prior?.win) : prior.win;
  const priorAreas = Object.fromEntries(Object.entries(prior?.areas ?? {}).map(([k, a]) => [k, { ...a, source: a.source ?? prior.source }]));
  return {
    version: SAMPLE_VERSION,
    source,
    trainedAt: new Date().toISOString(),
    rounds: usable.length,
    prior: prior && { source: prior.source, rounds: prior.rounds ?? prior.validation?.rounds ?? 0 },
    validation: usable.length < 2 ? null : validate(rows, Math.min(FOLDS, usable.length), prior?.win),
    win: { features: WIN_FEATURES, intercept: round5(final.intercept), coef: final.coef.map(round5) },
    calib,
    areas: { ...priorAreas, ...areaHistory(fronts, source) },
  };
}

// Out of fold, by round: what it does on rounds it never saw.
function validate(rows, folds, prior) {
  const oof = new Array(rows.length);
  for (let k = 0; k < folds; k++) {
    const m = fit(rows.filter((r) => r.fold !== k), prior);
    rows.forEach((r, i) => { if (r.fold === k) oof[i] = m.predict(r.x); });
  }
  const byRound = [...Map.groupBy(rows.map((r, i) => ({ ...r, p: oof[i] })), (r) => r.round).values()];
  const firstHalf = byRound.flatMap((rs) => rs.slice(0, Math.ceil(rs.length / 2)));
  const roundMean = byRound.map((rs) => [rs.reduce((s, r) => s + r.p, 0) / rs.length, rs[0].y]);
  return {
    rounds: byRound.length,
    // share of moments, averaged per round, at which it favoured the side that went on to win
    accuracy: round3(byRound.reduce((s, rs) => s + rs.filter((r) => (r.p > 0.5) === !!r.y).length / rs.length, 0) / byRound.length),
    aucRoundMean: round3(auc(roundMean.map((r) => r[0]), roundMean.map((r) => r[1]))),
    aucFirstHalf: round3(auc(firstHalf.map((r) => r.p), firstHalf.map((r) => r.y))),
    logLoss: round3(-rows.reduce((s, r, i) => s + r.w * Math.log(Math.min(1 - 1e-9, Math.max(1e-9, r.y ? oof[i] : 1 - oof[i]))), 0)
      / rows.reduce((s, r) => s + r.w, 0)),
  };
}

// Each side's front, minute by minute, in the rounds it won / lost: quartiles where ≥ MIN_BAND_ROUNDS ran that long.
function areaHistory(fronts, source) {
  const q = (a, p) => a[Math.min(a.length - 1, Math.round(p * (a.length - 1)))];
  const areas = {};
  for (const [key, rs] of fronts) {
    const bands = {};
    for (const s of [1, 2]) {
      bands[s] = {};
      for (const [outcome, won] of [['won', true], ['lost', false]]) {
        const curves = rs.filter((r) => (r.winner === s) === won).map((r) => r.f[s]);
        const band = Array.from({ length: Math.max(0, ...curves.map((c) => c.length)) }, (_, m) => {
          const v = curves.map((c) => c[m]).filter(Number.isFinite).sort((a, b) => a - b);
          return v.length >= MIN_BAND_ROUNDS ? [q(v, 0.25), q(v, 0.5), q(v, 0.75)].map(round3) : null;
        });
        while (band.length && !band[band.length - 1]) band.pop();
        bands[s][outcome] = band;
      }
    }
    if (Object.values(bands).some((b) => b.won.length || b.lost.length)) {
      areas[key] = { source, rounds: rs.length, usaWins: rs.filter((r) => r.winner === 1).length, bands };
    }
  }
  return areas;
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const round5 = (v) => Math.round(v * 1e5) / 1e5;

// Logistic regression by IRLS with a ridge on standardized features -- toward
// `prior` ({ intercept, coef } on raw features) if given, else toward 0 (50%);
// returns raw-feature coefficients.
function fit(data, prior = null) {
  const d = WIN_FEATURES.length, W = data.reduce((s, r) => s + r.w, 0);
  const mu = WIN_FEATURES.map((_, j) => data.reduce((s, r) => s + r.w * r.x[j], 0) / W);
  const sd = WIN_FEATURES.map((_, j) => Math.sqrt(data.reduce((s, r) => s + r.w * (r.x[j] - mu[j]) ** 2, 0) / W) || 1);
  const Z = data.map((r) => [1, ...r.x.map((v, j) => (v - mu[j]) / sd[j])]);
  const target = prior
    ? [prior.intercept + prior.coef.reduce((s, c, j) => s + c * mu[j], 0), ...prior.coef.map((c, j) => c * sd[j])]
    : new Array(d + 1).fill(0);
  const lambda = prior ? PRIOR_RIDGE : RIDGE;
  let b = [...target];
  for (let it = 0; it < 50; it++) {
    const g = new Array(d + 1).fill(0), H = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
    data.forEach((r, i) => {
      const z = Z[i], p = 1 / (1 + Math.exp(-z.reduce((s, v, j) => s + v * b[j], 0))), wt = r.w * p * (1 - p);
      for (let j = 0; j <= d; j++) { g[j] += r.w * (r.y - p) * z[j]; for (let k = 0; k <= d; k++) H[j][k] += wt * z[j] * z[k]; }
    });
    for (let j = 0; j <= d; j++) { g[j] -= lambda * (b[j] - target[j]); H[j][j] += lambda; }
    const step = solve(H, g);
    b = b.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  const coef = b.slice(1).map((v, j) => v / sd[j]);
  const intercept = b[0] - coef.reduce((s, c, j) => s + c * mu[j], 0);
  return { intercept, coef, predict: (x) => 1 / (1 + Math.exp(-(intercept + x.reduce((s, v, j) => s + v * coef[j], 0)))) };
}

// Gaussian elimination with partial pivoting.
function solve(A, rhs) {
  const n = rhs.length, M = A.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) x[r] = (M[r][n] - M[r].slice(r + 1, n).reduce((s, v, k) => s + v * x[r + 1 + k], 0)) / M[r][r];
  return x;
}

// P(a random winner scores above a random loser), ties counted half.
function auc(scores, labels) {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  let pos = 0, sumPos = 0;
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (labels[idx[k]]) { pos++; sumPos += rank; }
    i = j + 1;
  }
  const neg = labels.length - pos;
  return pos && neg ? (sumPos - (pos * (pos + 1)) / 2) / (pos * neg) : NaN;
}
