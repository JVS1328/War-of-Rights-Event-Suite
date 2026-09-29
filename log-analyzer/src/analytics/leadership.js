// Leadership & officers over time.
//
// The replay's per-sample leader_kind (NONE / OFFICER / FLAG) lets us track who
// anchored the line and when leaders fell off the field, per team, cheaply and
// reliably (no scoreboard needed).

import { LEADER_KIND, leaderOf } from '../utils/replayParser';

// Officers / flag-bearers present per frame, per team.
// Returns { usaOfficers, usaFlags, csaOfficers, csaFlags } number[].
export function leadershipOverTime(replay) {
  const { frameCount: F, playerCount: P } = replay;
  const { x, lk } = replay.tracks;
  const teams = replay.players.map((p) => p.team);
  const usaOfficers = new Array(F).fill(0);
  const usaFlags = new Array(F).fill(0);
  const csaOfficers = new Array(F).fill(0);
  const csaFlags = new Array(F).fill(0);
  for (let f = 0; f < F; f++) {
    const base = f * P;
    for (let p = 0; p < P; p++) {
      if (Number.isNaN(x[base + p])) continue;
      const kind = leaderOf(lk[base + p]);
      const t = teams[p];
      if (kind === LEADER_KIND.OFFICER) {
        if (t === 1) usaOfficers[f]++;
        else if (t === 2) csaOfficers[f]++;
      } else if (kind === LEADER_KIND.FLAG) {
        if (t === 1) usaFlags[f]++;
        else if (t === 2) csaFlags[f]++;
      }
    }
  }
  return { usaOfficers, usaFlags, csaOfficers, csaFlags };
}

// Per-player leadership spans: the frames a player spent as officer/flag. Used
// to list "who led, and for how long." Returns [{ name, team, kind, frames,
// seconds }] sorted by seconds desc, one row per (player, kind) that ever led.
export function leaderSpans(replay) {
  const { frameCount: F, playerCount: P } = replay;
  const { x, lk } = replay.tracks;
  const dt = 1 / (replay.meta.sampleRateHz || 2);
  const rows = [];
  for (let p = 0; p < P; p++) {
    let officerFrames = 0;
    let flagFrames = 0;
    for (let f = 0; f < F; f++) {
      if (Number.isNaN(x[f * P + p])) continue;
      const kind = leaderOf(lk[f * P + p]);
      if (kind === LEADER_KIND.OFFICER) officerFrames++;
      else if (kind === LEADER_KIND.FLAG) flagFrames++;
    }
    const meta = replay.players[p];
    if (officerFrames > 0) {
      rows.push({ name: meta.name, team: meta.team, kind: 'officer', frames: officerFrames, seconds: officerFrames * dt });
    }
    if (flagFrames > 0) {
      rows.push({ name: meta.name, team: meta.team, kind: 'flag', frames: flagFrames, seconds: flagFrames * dt });
    }
  }
  return rows.sort((a, b) => b.seconds - a.seconds);
}

// Flag-bearers: everyone who carried the colors during the round, ranked by the
// longest time they stayed alive holding the flag within a SINGLE life. A
// "life" is a continuous run of sampled frames; when a player dies (drops off
// the sample) their life — and that carry — ends, so a long unbroken carry
// outranks the same total time spread across several deaths. Also reports total
// time on the colors and how many separate times they picked them up.
// Returns [{ name, team, bestLifeSeconds, totalSeconds, pickups }] sorted by
// bestLifeSeconds desc.
export function flagBearers(replay) {
  const { frameCount: F, playerCount: P } = replay;
  const { x, lk } = replay.tracks;
  const dt = 1 / (replay.meta.sampleRateHz || 2);
  const rows = [];
  for (let p = 0; p < P; p++) {
    let bestLifeFrames = 0;   // most flag-frames within any one life
    let lifeFlagFrames = 0;   // flag-frames in the current life
    let totalFlagFrames = 0;
    let pickups = 0;
    let alivePrev = false;
    let hadFlagPrev = false;
    for (let f = 0; f < F; f++) {
      const i = f * P + p;
      if (Number.isNaN(x[i])) {           // dead / off-field: end the life
        if (lifeFlagFrames > bestLifeFrames) bestLifeFrames = lifeFlagFrames;
        lifeFlagFrames = 0;
        alivePrev = false;
        hadFlagPrev = false;
        continue;
      }
      if (!alivePrev) lifeFlagFrames = 0; // a fresh life begins
      const hasFlag = leaderOf(lk[i]) === LEADER_KIND.FLAG;
      if (hasFlag) {
        if (!hadFlagPrev) pickups++;
        lifeFlagFrames++;
        totalFlagFrames++;
        if (lifeFlagFrames > bestLifeFrames) bestLifeFrames = lifeFlagFrames;
      }
      alivePrev = true;
      hadFlagPrev = hasFlag;
    }
    if (lifeFlagFrames > bestLifeFrames) bestLifeFrames = lifeFlagFrames; // flush final life
    if (totalFlagFrames > 0) {
      const meta = replay.players[p];
      rows.push({
        name: meta.name,
        team: meta.team,
        bestLifeSeconds: bestLifeFrames * dt,
        totalSeconds: totalFlagFrames * dt,
        pickups,
      });
    }
  }
  return rows.sort((a, b) => b.bestLifeSeconds - a.bestLifeSeconds || b.totalSeconds - a.totalSeconds);
}
