// Where and when players went down, for the replay's death markers.
//
// The replay only records the living (the recorder drops dead players), so a
// death -- or any despawn, like a disconnect -- is a player who was on the
// field one frame and gone the next. It is judged per PERSON, across all of
// their stints (utils/replayParser splits a side / company swap into separate
// entries), so switching sides is not a death. The marker sits where they
// were last seen and lasts until they are back on the field (any stint) --
// or for good when markers never fade.

import { LEADER_KIND, leaderOf } from './replayParser.js';
import { lastIndexLE } from './killAlign.js';

// [{ t, until, x, y, team, officer, name, player }] sorted by t. t = the first
// frame they were missing; until = the frame they reappeared (Infinity if
// never); player = the replay.players index of the stint they fell in.
export function computeDeaths(replay) {
  const { frameCount: F, playerCount: P, frameTimes } = replay;
  const { x, y, lk } = replay.tracks;
  const byName = new Map();
  replay.players.forEach((p, i) => {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(i);
  });

  const deaths = [];
  for (const stints of byName.values()) {
    let last = null;      // { f, i } where they were last on the field
    let open = null;      // death waiting for its respawn
    for (let f = 0; f < F; f++) {
      const i = stints.find((s) => !Number.isNaN(x[f * P + s]));
      if (i !== undefined) {
        if (open) { open.until = frameTimes[f]; open = null; }
        last = { f, i };
      } else if (last && last.f === f - 1) {
        const slot = last.f * P + last.i;
        open = {
          t: frameTimes[f], until: Infinity,
          x: x[slot], y: y[slot],
          team: replay.players[last.i].team,
          officer: leaderOf(lk[slot]) === LEADER_KIND.OFFICER,
          name: replay.players[last.i].name,
          player: last.i,
        };
        deaths.push(open);
      }
    }
  }
  return deaths.sort((a, b) => a.t - b.t);
}

// Deaths to draw at round time `now`, each with its opacity. With a fade
// (finite fadeS) a marker shows while they are down and younger than fadeS,
// fading to nothing; with no fade (Infinity) every death so far stays.
export function deathsAt(deaths, now, fadeS) {
  const fades = Number.isFinite(fadeS);
  const out = [];
  for (const d of deaths) {
    if (d.t > now) break;
    if (!fades) { out.push({ d, alpha: 1 }); continue; }
    const age = now - d.t;
    if (now >= d.until || age >= fadeS) continue;
    out.push({ d, alpha: 1 - age / fadeS });
  }
  return out;
}

// The scoreboard kill log is to the second and the replay a few Hz, so a
// kill lands within a few seconds of the frame its victim vanished.
const KILL_SLACK_S = 3;
const nameKey = (name) => (name || '').trim().toLowerCase();

// Each death with `kill`: the scoreboard kill (killer, cause, victimFormation
// ...) of that victim nearest to when they vanished, or null (a disconnect, or
// no kill log). `kills` is killAlign's { ts, events }, sorted by ts.
export function withKills(deaths, kills) {
  return deaths.map((d) => {
    let kill = null, best = KILL_SLACK_S;
    for (let i = lastIndexLE(kills.ts, d.t + KILL_SLACK_S); i >= 0 && kills.ts[i] >= d.t - KILL_SLACK_S; i--) {
      const ev = kills.events[i];
      const dt = Math.abs(ev.ts - d.t);
      if (dt <= best && nameKey(ev.victim) === nameKey(d.name)) { best = dt; kill = ev; }
    }
    return { ...d, kill };
  });
}

// The death `name` is down from at round time `now`, or null while they are
// on the field (or before they first spawn).
export function downAt(deaths, name, now) {
  for (let i = deaths.length - 1; i >= 0; i--) {
    const d = deaths[i];
    if (d.name === name && d.t <= now) return now < d.until ? d : null;
  }
  return null;
}
