// Player directory: joins replay players to the attached scoreboard's roster
// (and player rows) by in-game name, resolving each replay player's regiment,
// company, in-game role (class/rank) and SteamID.
//
// The replay is the spine — it carries names + positions but only opaque
// regiment CRCs. The scoreboard's roster section carries the human-readable
// in-game regiment/company/class/rank + SteamID64 per player. We match the two
// by name so the viewer can show "who was in which regiment/company" on hover
// and group the side panel by regiment/company.
//
// Everything degrades gracefully: with no scoreboard (or a roster-less one) we
// still resolve a community regiment from the name tag (the same matcher the
// rest of the suite uses) and simply carry null SteamIDs / roles.

import { regimentLabel } from './regiments';
import { UNTAGGED } from '../stats/regimentMatcher';
import { regimentNameByCrc } from '../stats/inGameRegiments';

// Steam profile URL for a SteamID64 string. Returns null for empty ids.
export function steamProfileUrl(steamId) {
  if (!steamId) return null;
  // Only 17-digit SteamID64s make a valid /profiles/ link; anything else is
  // passed through as-is (Steam resolves vanity ids under /id/, but scoreboards
  // export numeric ids, so /profiles/ is the right base).
  return `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}`;
}

// Combine class + rank into a single human role label, e.g. "Officer · Colonel".
// Returns null when neither is present.
export function roleLabel(className, rank) {
  const parts = [className, rank].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

// Normalized lookup key for name matching (trim + lowercase).
function nameKey(name) {
  return (name || '').trim().toLowerCase();
}

// Short company label for a dense chip, e.g. "A Company" → "A", "B Coy" → "B".
// Falls back to the full string when there's no "company" suffix to strip.
export function shortCompany(company) {
  if (!company) return null;
  const stripped = company.replace(/\s*(company|coy|co\.?)\s*$/i, '').trim();
  return stripped || company;
}

// Group a list of player entries ({ index, name, ... }) for the side panel,
// `by` either the in-game regiment ('regiment': details[].groupRegiment) or
// the community name tag ('tag': details[].tagRegiment).
// Returns an array of { regiment, entries, count, companies: [{company,count}] }
// sorted by regiment name with UNTAGGED last.
export function groupEntriesByRegiment(entries, details, by = 'regiment') {
  const groups = new Map();
  for (const e of entries) {
    const d = details[e.index] || {};
    const reg = (by === 'tag' ? d.tagRegiment : d.groupRegiment) || UNTAGGED;
    if (!groups.has(reg)) groups.set(reg, { regiment: reg, entries: [], companyCounts: new Map() });
    const g = groups.get(reg);
    g.entries.push(e);
    const coy = d.company || null;
    if (coy) g.companyCounts.set(coy, (g.companyCounts.get(coy) || 0) + 1);
  }
  const arr = [...groups.values()].map((g) => ({
    regiment: g.regiment,
    entries: g.entries,
    count: g.entries.length,
    companies: [...g.companyCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([company, count]) => ({ company, count })),
  }));
  arr.sort((a, b) => {
    if (a.regiment === UNTAGGED && b.regiment !== UNTAGGED) return 1;
    if (b.regiment === UNTAGGED && a.regiment !== UNTAGGED) return -1;
    return a.regiment.localeCompare(b.regiment);
  });
  return arr;
}

// Build a directory for one replay + its (optional) scoreboard.
// Returns:
//   details:   Array indexed by replay player index →
//              { name, steamId, regiment, company, className, rank, role,
//                tagRegiment, groupRegiment }
//     - company/className/rank/steamId come from the scoreboard (null when
//       unknown). regiment is the scoreboard roster's, else the replay's own
//       in-game regiment (its regiment_crc, via the overlay's unit table).
//     - tagRegiment is the community name-tag regiment (always resolved).
//     - groupRegiment is the label to group by: the in-game regiment when we
//       have one, else the name-tag regiment, else UNTAGGED.
//   hasRoster: the scoreboard carried a roster section.
//   hasSteam:  at least one player resolved a SteamID.
export function buildPlayerDirectory(replay, scoreboard) {
  const rosterByName = new Map();
  const steamByName = new Map();

  if (scoreboard) {
    for (const r of scoreboard.roster || []) {
      const k = nameKey(r.name);
      if (k && !rosterByName.has(k)) rosterByName.set(k, r);
      if (k && r.steamId && !steamByName.has(k)) steamByName.set(k, r.steamId);
    }
    for (const p of scoreboard.players || []) {
      const k = nameKey(p.name);
      if (k && p.steamId && !steamByName.has(k)) steamByName.set(k, p.steamId);
    }
  }

  let hasRoster = false;
  let hasSteam = false;

  const details = (replay.players || []).map((p) => {
    const k = nameKey(p.name);
    const r = rosterByName.get(k) || null;
    if (r) hasRoster = true;

    const steamId = (r && r.steamId) || steamByName.get(k) || null;
    if (steamId) hasSteam = true;

    const regiment = (r && r.regiment) || regimentNameByCrc(p.regimentCrc);
    const company = (r && r.company) || null;
    const className = (r && r.className) || null;
    const rank = (r && r.rank) || null;
    const tagRegiment = regimentLabel(p.name);
    // Prefer the in-game regiment; fall back to the name-tag regiment so
    // grouping still works for replay-only rounds. UNTAGGED is the last resort.
    const groupRegiment = regiment || (tagRegiment !== UNTAGGED ? tagRegiment : null) || UNTAGGED;

    return {
      name: p.name,
      steamId,
      regiment,
      company,
      className,
      rank,
      role: roleLabel(className, rank),
      tagRegiment,
      groupRegiment,
    };
  });

  return { details, hasRoster, hasSteam };
}
