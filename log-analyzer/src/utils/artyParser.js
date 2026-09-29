// Parse a replay's companion artillery CSV (replay_<stamp>_arty.csv, written
// by wor_overlay/replay.cpp next to replay_<stamp>.csv) into a compact form
// that rides on the round like a scoreboard does -- small enough for
// localStorage and share links.
//
// Columns: t_s,hms,event,name,model,x,y,z,fwd_x,fwd_y,round,loaded,shell,case,canister
//   impact  -- one row per burst: x/y/z, `round` = the game's explosion type
//              (OrdnanceShell, OrdnanceCase, NapoleonShell, NapoleonCase,
//              MortarOrdnanceShell).
//   gun     -- every piece at every sample: model, pose, the round in the
//              barrel (shell/case/canister/blank) and whether it is rammed.
//   caisson -- every caisson at every sample: model, pose, rounds left.
// t_s runs on the same round clock as the replay's frames, so no alignment is
// needed.
//
// Guns and caissons sit still most of the round, so each piece keeps only its
// change points (moved, turned, or its load changed) plus a `gone` marker when
// it drops out of the samples -- a round's worth shrinks from tens of
// thousands of rows to a few hundred points.

const IMPACT_KIND = {
  ordnanceshell: 0, ordnancecase: 1, napoleonshell: 2, napoleoncase: 3, mortarordnanceshell: 4,
};
const ROUND_CODE = { shell: 0, case: 1, canister: 2 };

// Blast of a burst by impact kind, from the game's explosion table (see the
// overlay's arty.h kShellBlast / kCaseBlast): falloff radius in metres is
// where any kill chance ends. Case rows are 1 and 3.
export function impactFalloffM(kind) {
  return kind === 1 || kind === 3 ? 15 : 20;
}
export function impactLabel(kind) {
  return ['10-pdr shell', '10-pdr case', 'Napoleon shell', 'Napoleon case', 'Mortar shell'][kind] || 'Shell';
}

const MOVE_M = 0.5;          // a change point needs this much movement...
const TURN_COS = 0.9986;     // ...or ~3 degrees of turn, or any load change

export function looksLikeArtyCsv(text) {
  return text.replace(/^\uFEFF/, '').slice(0, 64).toLowerCase().startsWith('t_s,hms,event,');
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
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

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// Returns { impacts, pieces } or null when the text isn't an arty CSV.
//   impacts: [t, x, y, z, kind][] sorted by t
//   pieces:  { name, kind: 'gun'|'caisson', model, track }[]
//     track: [t, x, y, fx, fy, round, loaded, shell, case, canister][] with
//            [t, null] entries where the piece left the samples
export function parseArtyCsv(text) {
  if (!looksLikeArtyCsv(text)) return null;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const cols = splitCsvLine(lines[0]).map((s) => s.trim().toLowerCase());
  const C = Object.fromEntries(cols.map((c, i) => [c, i]));
  const num = (parts, k) => { const v = parseFloat(parts[C[k]]); return Number.isFinite(v) ? v : 0; };

  const impacts = [];
  const pieceRows = new Map();   // key -> { name, kind, model, rows: [] }
  const sampleTimes = [];        // distinct t_s of piece samples, in order
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const p = splitCsvLine(line);
    const t = parseFloat(p[C.t_s]);
    if (!Number.isFinite(t)) continue;
    const ev = p[C.event];
    if (ev === 'impact') {
      const kind = IMPACT_KIND[(p[C.round] || '').toLowerCase()];
      if (kind === undefined) continue;                      // not an artillery round
      impacts.push([r2(t), r2(num(p, 'x')), r2(num(p, 'y')), r2(num(p, 'z')), kind]);
    } else if (ev === 'gun' || ev === 'caisson') {
      if (sampleTimes[sampleTimes.length - 1] !== t) sampleTimes.push(t);
      const key = `${ev}|${p[C.name]}`;
      let piece = pieceRows.get(key);
      if (!piece) {
        piece = { name: p[C.name] || '', kind: ev, model: p[C.model] || '', rows: new Map() };
        pieceRows.set(key, piece);
      }
      piece.rows.set(t, [
        r2(t), r2(num(p, 'x')), r2(num(p, 'y')), r3(num(p, 'fwd_x')), r3(num(p, 'fwd_y')),
        ev === 'gun' ? (ROUND_CODE[p[C.round]] ?? -1) : -1,
        ev === 'gun' ? (p[C.loaded] === '1' ? 1 : 0) : 0,
        num(p, 'shell'), num(p, 'case'), num(p, 'canister'),
      ]);
    }
  }
  impacts.sort((a, b) => a[0] - b[0]);

  const pieces = [];
  for (const piece of pieceRows.values()) {
    const track = [];
    let last = null;
    for (const t of sampleTimes) {
      const s = piece.rows.get(t);
      if (!s) {
        if (last) { track.push([r2(t), null]); last = null; }
        continue;
      }
      const changed = !last
        || Math.hypot(s[1] - last[1], s[2] - last[2]) > MOVE_M
        || s[3] * last[3] + s[4] * last[4] < TURN_COS
        || s[5] !== last[5] || s[6] !== last[6]
        || s[7] !== last[7] || s[8] !== last[8] || s[9] !== last[9];
      if (changed) { track.push(s); last = s; }
    }
    if (track.length) pieces.push({ name: piece.name, kind: piece.kind, model: piece.model, track });
  }
  return { impacts, pieces };
}

// Index of the last entry whose [0] (time) is <= t, or -1.
function lastAtOrBefore(arr, t) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// A piece's state at round time t, or null when it isn't on the field then.
export function pieceAt(piece, t) {
  const i = lastAtOrBefore(piece.track, t);
  if (i < 0) return null;
  const s = piece.track[i];
  return s[1] === null ? null : s;
}

// Impacts in (t - windowS, t], oldest first.
export function impactsInWindow(arty, t, windowS) {
  const end = lastAtOrBefore(arty.impacts, t);
  const out = [];
  for (let i = end; i >= 0 && arty.impacts[i][0] > t - windowS; i--) out.push(arty.impacts[i]);
  return out.reverse();
}

// replay_20260928_203512_arty.csv -> replay_20260928_203512.csv
export function replayFilenameForArty(name) {
  return String(name || '').replace(/_arty(\.csv)$/i, '$1');
}

// Which gun fired each impact. The explosion carries no shooter, but a gun's
// track shows it firing (rammed -> not rammed), where it stood and where its
// bore pointed. An impact goes to the fire shortly before it with the same
// kind of round, whose bore points at it; the most exactly aimed wins.
// Mirrors the overlay's arty::attribute_impact (WoR-Radar arty.cpp).
export const SHOT_MAX_FLIGHT_S = 12;
export const SHOT_MAX_BEARING_DEG = 12;

function gunFires(arty) {
  const fires = [];
  for (const piece of arty.pieces) {
    if (piece.kind !== 'gun') continue;
    let prev = null;
    for (const s of piece.track) {
      if (s[1] === null) { prev = null; continue; }
      // Rammed with a shell or case, then not: fired. Canister never bursts.
      if (prev && prev[6] && !s[6] && (prev[5] === 0 || prev[5] === 1)) {
        fires.push({ t: s[0], x: prev[1], y: prev[2], fx: prev[3], fy: prev[4], isCase: prev[5] === 1, used: false });
      }
      prev = s;
    }
  }
  return fires.sort((a, b) => a.t - b.t);
}

// [{ x, y } | null] aligned with arty.impacts: where the firing gun stood.
export function impactSources(arty) {
  const fires = gunFires(arty);
  const cosMax = Math.cos((SHOT_MAX_BEARING_DEG * Math.PI) / 180);
  return arty.impacts.map(([t, x, y, , kind]) => {
    const isCase = kind === 1 || kind === 3;
    let best = null, bestCos = cosMax;
    for (const f of fires) {
      if (f.used || f.isCase !== isCase || f.t > t || t - f.t > SHOT_MAX_FLIGHT_S) continue;
      const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy), fl = Math.hypot(f.fx, f.fy);
      if (d < 10 || fl < 1e-4) continue;
      const c = (dx * f.fx + dy * f.fy) / (d * fl);
      if (c > bestCos) { bestCos = c; best = f; }
    }
    if (!best) return null;
    best.used = true;
    return { x: best.x, y: best.y };
  });
}
