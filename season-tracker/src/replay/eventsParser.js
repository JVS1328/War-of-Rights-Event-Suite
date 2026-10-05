// Parse a replay's companion round-events CSV (replay_<stamp>_events.csv,
// written by wor_overlay/replay.cpp next to replay_<stamp>.csv): the round's
// state as the HUD shows it, one row per change.
//
// Columns: t_s,hms,event,team,value,pct
//   morale         team, HUD state (BattleReady / Engaged / TakingLosses /
//                  Breaking / FinalPush / LastStand)
//   tickets        team, tickets left (91.0) and `pct` = % of its tickets left
//   counter_attack the counter-attacking team, start|end
//   phase          Onslaught's HUD phase (Wave 3, Titan, Retreat...), no team
// Each kind opens with a baseline row when recording starts. t_s runs on the
// replay's round clock, so no alignment is needed.

const TEAM = { usa: 1, csa: 2 };

export function looksLikeEventsCsv(text) {
  return text.replace(/^﻿/, '').slice(0, 64).toLowerCase().startsWith('t_s,hms,event,team,value');
}

export const isEventsFilename = (name) => /_events\.csv$/i.test(String(name || ''));

// replay_20261005_204107.csv <-> replay_20261005_204107_events.csv
export const eventsFilenameFor = (replayFilename) => String(replayFilename || '').replace(/\.csv$/i, '_events.csv');
export const replayFilenameForEvents = (name) => String(name || '').replace(/_events(\.csv)$/i, '$1');

// [{ t, event, team: 0|1|2, value, pct: number|null }] sorted by t, or [] when
// the text isn't an events CSV. Fields hold no commas, so a plain split does.
export function parseEventsCsv(text) {
  if (typeof text !== 'string' || !looksLikeEventsCsv(text)) return [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const C = Object.fromEntries(lines[0].split(',').map((c, i) => [c.trim().toLowerCase(), i]));
  const out = [];
  for (let li = 1; li < lines.length; li++) {
    const p = lines[li].split(',');
    const t = parseFloat(p[C.t_s]);
    const event = (p[C.event] || '').trim();
    if (!Number.isFinite(t) || !event) continue;
    const pct = parseFloat(p[C.pct]);
    out.push({
      t, event,
      team: TEAM[(p[C.team] || '').trim().toLowerCase()] ?? 0,
      value: (p[C.value] || '').trim(),
      pct: Number.isFinite(pct) ? pct : null,
    });
  }
  return out.sort((a, b) => a.t - b.t);   // stable: same-t rows keep file order
}

// Index of the last event at or before t, or -1.
function lastAtOrBefore(events, t) {
  let lo = 0, hi = events.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/**
 * The round's state at time t: each team's latest morale and tickets left
 * (count and %), the team counter-attacking (0 for none) and Onslaught's phase.
 */
export function roundStateAt(events, t) {
  const side = () => ({ morale: null, tickets: null, pct: null });
  const state = { teams: { 1: side(), 2: side() }, counterAttack: 0, phase: null };
  // walk back from t: the first row seen of each kind (per team) is its latest
  const seen = new Set();
  for (let i = lastAtOrBefore(events ?? [], t); i >= 0 && seen.size < 6; i--) {
    const e = events[i], s = state.teams[e.team];
    const key = e.event === 'counter_attack' || e.event === 'phase' ? e.event : `${e.event}${e.team}`;
    if (seen.has(key)) continue;
    if (e.event === 'morale' && s) s.morale = e.value;
    else if (e.event === 'tickets' && s) {
      const v = parseFloat(e.value);
      s.tickets = Number.isFinite(v) ? v : null;
      s.pct = e.pct;
    } else if (e.event === 'counter_attack') state.counterAttack = e.value === 'start' ? e.team : 0;
    else if (e.event === 'phase') state.phase = e.value || null;
    else continue;
    seen.add(key);
  }
  return state;
}
