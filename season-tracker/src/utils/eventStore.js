// v2 schema for the season tracker: events contain seasons, with a unit
// registry at the event level. Single source of truth for defaults and
// migration from the legacy flat shape.

import { latestSeason, nextSeasonName } from './seasonOrder';

export const SCHEMA_VERSION = 2;

export const DEFAULT_TEAM_NAMES = { A: 'USA', B: 'CSA' };

export const DEFAULT_POINT_SYSTEM = {
  winLead: 4,
  winAssist: 2,
  lossLead: 0,
  lossAssist: 1,
  bonus2_0Lead: 0,
  bonus2_0Assist: 1,
  balancePoints: 0,
  balancePointsStyle: 'perNight',
};

export const DEFAULT_ELO_SYSTEM = {
  initialElo: 1500,
  kFactorStandard: 96,
  kFactorProvisional: 128,
  provisionalRounds: 10,
  sweepBonusMultiplier: 1.25,
  leadMultiplier: 2.0,
  sizeInfluence: 1.0,
  playoffMultiplier: 1.25,
};

// Event-level Elo config. Map and unit-on-side history feed expected
// win-probability via Bayesian-shrunk Elo equivalents:
//   adj = weight × eloEquivOf(wins/total) × total / (total + priorRounds)
// All prior rounds in the event (and across events under 'global' scope)
// are used; `priorRounds` is the regularization strength — the sample size
// at which the historical rate reaches half its asymptotic Elo equivalent.
// Defaults are non-zero so map / unit history actually shape Elo out of the
// box; the shrinkage protects new events with thin samples from noise.
export const DEFAULT_ELO_CONFIG = {
  mapWeight: 1.0,
  unitWeight: 1.0,
  priorRounds: 10,
  carryAlpha: 0.5,
  mapStatsScope: 'event', // 'event' | 'global'
};

// 'conference' splits the field in two and crowns each side before a
// championship; 'knockout' seeds the whole field on points and pairs 1-vs-N
// down the bracket, which is the only shape that copes with a group count
// other than two. Seasons saved before the knockout existed have no
// bracketStyle, so every read of it falls back to 'conference'.
export const makeDefaultPlayoffConfig = () => ({
  enabled: false,
  bracketStyle: 'conference',
  useDivisions: false,
  teamsPerDivision: 2,
  wildcardTeams: 0,
  roundFormats: { wildcard: 1, divisional: 1, conference: 2, finals: 2 },
});

export const makeDefaultBalancerSettings = () => ({
  teammateWeight: 1.0,
  avgDiffWeight: 1.0,
  regimentCountWeight: 0.75,
  rangeSimilarityWeight: 0.50,
  divisionOppositionWeight: 0,
  // Skill-based post-season balancing (per the passed proposal): evens out
  // playoff-pedigree units across both sides during playoff weeks. Defaults to
  // 0 (off) so it never affects regular-season balancing; tune per-season.
  postSeasonSkillWeight: 0,
  balanceOptionCount: 3,
});

// --- ID + slug helpers -----------------------------------------------------

let _idCounter = 0;
const newId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;

export const newEventId = () => newId('evt');
export const newSeasonId = () => newId('sea');

export const slugifyUnitName = (name) => {
  const base = String(name ?? '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'unit';
};

// Build a registry from a flat list of unit names. Collisions on slug get
// -2, -3 suffixes to keep ids unique within the event.
export const buildRegistryFromNames = (names, existing = {}) => {
  const registry = { ...existing };
  const existingByName = new Map();
  for (const [id, entry] of Object.entries(registry)) {
    if (entry?.name) existingByName.set(entry.name, id);
  }
  const usedIds = new Set(Object.keys(registry));

  for (const rawName of names) {
    const name = String(rawName ?? '').trim();
    if (!name) continue;
    if (existingByName.has(name)) continue;

    const base = slugifyUnitName(name);
    let id = base;
    let n = 2;
    while (usedIds.has(id)) {
      id = `${base}-${n++}`;
    }
    usedIds.add(id);
    existingByName.set(name, id);
    registry[id] = { name };
  }

  return registry;
};

export const findUnitIdByName = (registry, name) => {
  if (!registry || !name) return null;
  for (const [id, entry] of Object.entries(registry)) {
    if (entry?.name === name) return id;
  }
  return null;
};

// --- Default factories -----------------------------------------------------

export const makeDefaultSeason = (overrides = {}) => ({
  id: newSeasonId(),
  name: 'Season 1',
  units: [],
  nonTokenUnits: [],
  weeks: [],
  selectedWeek: null,
  teamNames: { ...DEFAULT_TEAM_NAMES },
  pointSystem: { ...DEFAULT_POINT_SYSTEM },
  manualAdjustments: {},
  unitPlayerCounts: {},
  divisions: [],
  mapCooldown: 0,
  playoffConfig: makeDefaultPlayoffConfig(),
  balancerSettings: makeDefaultBalancerSettings(),
  ...overrides,
});

export const makeDefaultEvent = (overrides = {}) => ({
  id: newEventId(),
  name: 'Default Event',
  unitRegistry: {},
  eloSystem: { ...DEFAULT_ELO_SYSTEM },
  eloConfig: { ...DEFAULT_ELO_CONFIG },
  // Maps a tracker token → scoreboard regiment label(s) for per-unit stats.
  // Each regiment is claimed by at most one token across the event.
  tokenRegiments: {},
  seasons: [],
  ...overrides,
});

export const makeDefaultAppState = () => {
  const season = makeDefaultSeason();
  const event = makeDefaultEvent({ seasons: [season] });
  return {
    schemaVersion: SCHEMA_VERSION,
    activeEventId: event.id,
    activeSeasonId: season.id,
    events: [event],
  };
};

// --- Migration -------------------------------------------------------------

const migrateBalancerSettings = (saved) => {
  const defaults = makeDefaultBalancerSettings();
  if (!saved) return defaults;
  const merged = { ...defaults, ...saved };
  if (saved.gapWeight !== undefined && saved.regimentCountWeight === undefined) {
    merged.regimentCountWeight = saved.gapWeight;
  }
  if (saved.minDiffWeight !== undefined && saved.rangeSimilarityWeight === undefined) {
    merged.rangeSimilarityWeight = saved.minDiffWeight;
  }
  delete merged.gapWeight;
  delete merged.minDiffWeight;
  return merged;
};

// Strip legacy bias fields off any week object; the bias system was removed
// in v2 and the engine derives map adjustments from outcome history instead.
const stripLegacyBiasFields = (weeks) =>
  (weeks || []).map(({ mapBiases, eloBiasPercentages, ...rest }) => rest);

// Wrap a legacy flat-shape state into a v2 app state with one event and one
// season. Used at load time, on file import, and on share import.
export const migrateLegacyFlatToV2 = (legacy, { eventName = 'Default Event', seasonName = 'Season 1' } = {}) => {
  const allNames = new Set();
  (legacy.units || []).forEach(n => n && allNames.add(n));
  (legacy.nonTokenUnits || []).forEach(n => n && allNames.add(n));
  (legacy.weeks || []).forEach(week => {
    (week.teamA || []).forEach(n => n && allNames.add(n));
    (week.teamB || []).forEach(n => n && allNames.add(n));
  });

  const unitRegistry = buildRegistryFromNames([...allNames]);

  const season = makeDefaultSeason({
    name: seasonName,
    units: legacy.units || [],
    nonTokenUnits: legacy.nonTokenUnits || [],
    weeks: stripLegacyBiasFields(legacy.weeks || []),
    selectedWeek: legacy.selectedWeek ?? null,
    teamNames: legacy.teamNames || { ...DEFAULT_TEAM_NAMES },
    pointSystem: { ...DEFAULT_POINT_SYSTEM, ...(legacy.pointSystem || {}) },
    manualAdjustments: legacy.manualAdjustments || {},
    unitPlayerCounts: legacy.unitPlayerCounts || {},
    divisions: legacy.divisions || [],
    mapCooldown: legacy.mapCooldown || 0,
    playoffConfig: { ...makeDefaultPlayoffConfig(), ...(legacy.playoffConfig || {}) },
    balancerSettings: migrateBalancerSettings(legacy.balancerSettings),
  });

  const event = makeDefaultEvent({
    name: eventName,
    unitRegistry,
    eloSystem: { ...DEFAULT_ELO_SYSTEM, ...(legacy.eloSystem || {}) },
    seasons: [season],
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    activeEventId: event.id,
    activeSeasonId: season.id,
    events: [event],
  };
};

// Entry point: detects v2 vs legacy and migrates as needed. `null` produces
// a fresh default app state.
export const migrateToV2 = (raw) => {
  if (!raw) return makeDefaultAppState();
  if (raw.schemaVersion === SCHEMA_VERSION && Array.isArray(raw.events)) return raw;
  return migrateLegacyFlatToV2(raw);
};

// --- Active accessors ------------------------------------------------------

export const getActiveEvent = (appState) =>
  appState?.events?.find(e => e.id === appState.activeEventId) ?? appState?.events?.[0] ?? null;

export const getActiveSeason = (appState) => {
  const event = getActiveEvent(appState);
  if (!event) return null;
  return event.seasons.find(s => s.id === appState.activeSeasonId) ?? latestSeason(event.seasons);
};

// Which season an event opens on when nothing has been picked yet: the most
// recent one. Import order doesn't say which season is current, so the number
// in the name decides — see utils/seasonOrder.
export const defaultSeasonIdFor = (event) => latestSeason(event?.seasons || [])?.id ?? null;

// Point the app state at the active event's most recent season. Applied when
// the tracker loads: a season tracker is nearly always about the season being
// played now, not whichever one happened to be imported last.
export const openOnLatestSeason = (appState) => {
  const seasonId = defaultSeasonIdFor(getActiveEvent(appState));
  return seasonId ? { ...appState, activeSeasonId: seasonId } : appState;
};

export const updateActiveSeason = (appState, updater) => {
  const eventId = appState.activeEventId;
  const seasonId = appState.activeSeasonId;
  return {
    ...appState,
    events: appState.events.map(e =>
      e.id !== eventId ? e : {
        ...e,
        seasons: e.seasons.map(s => s.id !== seasonId ? s : updater(s)),
      }
    ),
  };
};

export const updateActiveEvent = (appState, updater) => {
  const eventId = appState.activeEventId;
  return {
    ...appState,
    events: appState.events.map(e => e.id !== eventId ? e : updater(e)),
  };
};

// --- Event/season lifecycle ------------------------------------------------

export const setActiveEvent = (appState, eventId) => {
  const event = appState.events.find(e => e.id === eventId);
  if (!event) return appState;
  return { ...appState, activeEventId: eventId, activeSeasonId: defaultSeasonIdFor(event) };
};

export const setActiveSeason = (appState, seasonId) => {
  const event = getActiveEvent(appState);
  if (!event?.seasons.some(s => s.id === seasonId)) return appState;
  return { ...appState, activeSeasonId: seasonId };
};

// Append a new event with a single fresh season. The new event becomes active.
export const addEvent = (appState, name = 'New Event') => {
  const season = makeDefaultSeason({ name: 'Season 1' });
  const event = makeDefaultEvent({ name, seasons: [season] });
  return {
    ...appState,
    events: [...appState.events, event],
    activeEventId: event.id,
    activeSeasonId: season.id,
  };
};

export const renameActiveEvent = (appState, name) =>
  updateActiveEvent(appState, e => ({ ...e, name }));

// Remove the active event. Falls back to the previous (or first remaining)
// event. Refuses if it's the last one — callers should keep at least one.
export const removeActiveEvent = (appState) => {
  if (appState.events.length <= 1) return appState;
  const idx = appState.events.findIndex(e => e.id === appState.activeEventId);
  const remaining = appState.events.filter(e => e.id !== appState.activeEventId);
  const nextEvent = remaining[Math.max(0, idx - 1)] ?? remaining[0];
  return {
    ...appState,
    events: remaining,
    activeEventId: nextEvent.id,
    activeSeasonId: nextEvent.seasons[0]?.id ?? null,
  };
};

// Add a season to the active event. The new season inherits the active
// season's roster (units and player counts) so picking up a follow-up
// doesn't require re-adding every regiment, but starts with empty weeks.
export const addSeasonToActiveEvent = (appState, name) => {
  const event = getActiveEvent(appState);
  if (!event) return appState;
  const prev = getActiveSeason(appState);
  const season = makeDefaultSeason({
    name: name || nextSeasonName(event.seasons),
    units: prev ? [...prev.units] : [],
    nonTokenUnits: prev ? [...prev.nonTokenUnits] : [],
    unitPlayerCounts: prev ? { ...prev.unitPlayerCounts } : {},
    teamNames: prev ? { ...prev.teamNames } : { ...DEFAULT_TEAM_NAMES },
    pointSystem: prev ? { ...prev.pointSystem } : { ...DEFAULT_POINT_SYSTEM },
  });
  return {
    ...appState,
    events: appState.events.map(e =>
      e.id !== event.id ? e : { ...e, seasons: [...e.seasons, season] }
    ),
    activeSeasonId: season.id,
  };
};

export const renameActiveSeason = (appState, name) =>
  updateActiveSeason(appState, s => ({ ...s, name }));

export const removeActiveSeason = (appState) => {
  const event = getActiveEvent(appState);
  if (!event || event.seasons.length <= 1) return appState;
  const remaining = event.seasons.filter(s => s.id !== appState.activeSeasonId);
  return {
    ...appState,
    events: appState.events.map(e =>
      e.id !== event.id ? e : { ...e, seasons: remaining }
    ),
    activeSeasonId: latestSeason(remaining)?.id ?? null,
  };
};

// Append an externally-imported season to the active event, merging that
// season's unit names into the event's registry so all rosters keep working.
// Returns updated appState with the new season as active.
export const appendSeasonToActiveEvent = (appState, importedSeason, importedRegistryNames = []) => {
  const event = getActiveEvent(appState);
  if (!event) return appState;
  const allNames = new Set(importedRegistryNames);
  (importedSeason.units || []).forEach(n => n && allNames.add(n));
  (importedSeason.nonTokenUnits || []).forEach(n => n && allNames.add(n));
  (importedSeason.weeks || []).forEach(w => {
    (w.teamA || []).forEach(n => n && allNames.add(n));
    (w.teamB || []).forEach(n => n && allNames.add(n));
  });
  const mergedRegistry = buildRegistryFromNames([...allNames], event.unitRegistry);
  const updatedEvent = {
    ...event,
    unitRegistry: mergedRegistry,
    seasons: [...event.seasons, importedSeason],
  };
  return {
    ...appState,
    events: appState.events.map(e => e.id !== event.id ? e : updatedEvent),
    activeSeasonId: importedSeason.id,
  };
};

// --- Unit registry mutations ----------------------------------------------

// Ensure a unit name is in the active event's registry. Returns updated
// appState; idempotent on existing names.
export const ensureUnitInRegistry = (appState, name) => {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return appState;
  return updateActiveEvent(appState, e =>
    findUnitIdByName(e.unitRegistry, trimmed)
      ? e
      : { ...e, unitRegistry: buildRegistryFromNames([trimmed], e.unitRegistry) }
  );
};

// Replace a unit name everywhere it appears in one season: rosters, leads,
// lookups, casualties and swaps. Pure; the registry is the caller's business.
const renameUnitInSeason = (season, oldName, newName) => {
  const renameInArr = (arr) => (arr || []).map(u => u === oldName ? newName : u);
  const renameKey = (obj) => {
    if (!obj || !(oldName in obj)) return obj;
    const { [oldName]: val, ...rest } = obj;
    return { ...rest, [newName]: val };
  };
  const renameLead = (v) => v === oldName ? newName : v;

  return {
    ...season,
    units: renameInArr(season.units),
    nonTokenUnits: renameInArr(season.nonTokenUnits),
    unitPlayerCounts: renameKey(season.unitPlayerCounts),
    manualAdjustments: renameKey(season.manualAdjustments),
    divisions: (season.divisions || []).map(d => ({ ...d, units: renameInArr(d.units) })),
    weeks: (season.weeks || []).map(week => ({
      ...week,
      teamA: renameInArr(week.teamA),
      teamB: renameInArr(week.teamB),
      leadA: renameLead(week.leadA),
      leadB: renameLead(week.leadB),
      leadA_r1: renameLead(week.leadA_r1),
      leadB_r1: renameLead(week.leadB_r1),
      leadA_r2: renameLead(week.leadA_r2),
      leadB_r2: renameLead(week.leadB_r2),
      unitPlayerCounts: renameKey(week.unitPlayerCounts),
      roundSwaps: week.roundSwaps && {
        r1: renameInArr(week.roundSwaps.r1),
        r2: renameInArr(week.roundSwaps.r2),
      },
      weeklyCasualties: week.weeklyCasualties && Object.fromEntries(
        Object.entries(week.weeklyCasualties).map(([side, rounds]) => [
          side,
          Object.fromEntries(
            Object.entries(rounds).map(([rk, byUnit]) => [rk, renameKey(byUnit)])
          ),
        ])
      ),
    })),
  };
};

// Replace a unit name everywhere it appears in the event: registry entry and
// every season. The unit's id stays stable so historical references resolve
// unchanged.
export const renameUnitInEvent = (appState, oldName, newName) => {
  const trimmedNew = String(newName ?? '').trim();
  if (!trimmedNew || trimmedNew === oldName) return appState;

  return updateActiveEvent(appState, event => {
    const id = findUnitIdByName(event.unitRegistry, oldName);
    if (!id) return event;
    if (findUnitIdByName(event.unitRegistry, trimmedNew)) return event; // collision

    return {
      ...event,
      unitRegistry: { ...event.unitRegistry, [id]: { ...event.unitRegistry[id], name: trimmedNew } },
      seasons: event.seasons.map(season => renameUnitInSeason(season, oldName, trimmedNew)),
    };
  });
};

// Rename a unit in the active season only. Other seasons keep the old name,
// so the registry keeps it too; a new name not yet in the registry is added.
// Refuses a name already on this season's roster — that would be a merge.
export const renameUnitInActiveSeason = (appState, oldName, newName) => {
  const trimmedNew = String(newName ?? '').trim();
  if (!trimmedNew || trimmedNew === oldName) return appState;
  const season = getActiveSeason(appState);
  if (!season || (season.units || []).includes(trimmedNew)) return appState;

  return updateActiveSeason(
    ensureUnitInRegistry(appState, trimmedNew),
    s => renameUnitInSeason(s, oldName, trimmedNew),
  );
};

// Remove a unit from the registry. Soft-deletes by stripping the registry
// entry; references in historical week data remain so old rounds still show
// the original participant. Use only when the unit has no roster appearance
// in any current season — caller should check.
export const removeUnitFromRegistry = (appState, unitName) =>
  updateActiveEvent(appState, event => {
    const id = findUnitIdByName(event.unitRegistry, unitName);
    if (!id) return event;
    const { [id]: _, ...rest } = event.unitRegistry;
    return { ...event, unitRegistry: rest };
  });

// Returns true if a unit is referenced anywhere in the event (rosters, leads,
// stats, etc.). Useful before a hard-delete of a registry entry.
export const isUnitReferencedInEvent = (event, unitName) => {
  for (const season of event.seasons) {
    if ((season.units || []).includes(unitName)) return true;
    if ((season.nonTokenUnits || []).includes(unitName)) return true;
    if (season.unitPlayerCounts?.[unitName]) return true;
    if (season.manualAdjustments?.[unitName]) return true;
    for (const w of season.weeks || []) {
      if ((w.teamA || []).includes(unitName)) return true;
      if ((w.teamB || []).includes(unitName)) return true;
    }
  }
  return false;
};

// Flatten the active event/season into the legacy shape. Used by code paths
// (share, export) that haven't been rewritten for v2 yet — phase 4.
export const flattenActiveToLegacy = (appState) => {
  const event = getActiveEvent(appState);
  const season = getActiveSeason(appState);
  if (!event || !season) return null;
  return {
    units: season.units,
    nonTokenUnits: season.nonTokenUnits,
    weeks: season.weeks,
    selectedWeek: season.selectedWeek,
    teamNames: season.teamNames,
    pointSystem: season.pointSystem,
    manualAdjustments: season.manualAdjustments,
    eloSystem: event.eloSystem,
    eloConfig: event.eloConfig,
    unitPlayerCounts: season.unitPlayerCounts,
    divisions: season.divisions,
    mapCooldown: season.mapCooldown,
    playoffConfig: season.playoffConfig,
    balancerSettings: season.balancerSettings,
  };
};
