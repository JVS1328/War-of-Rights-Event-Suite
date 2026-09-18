/**
 * Grand Campaign — Tabletop ruleset adaptation.
 *
 * Adapts Maj. Tindall's Grand Campaign Tabletop Ruleset to a digital board:
 * token-based units, inch-measured movement, manually-placed cities / forts /
 * stations / railways / rivers, national manpower & treasury pools, fatigue,
 * garrisons, last stand, and a 10-VP victory condition driven by capital
 * captures and token wipes.
 *
 * Territory control remains on the Eastern Theatre map but is flavor only in
 * this mode — VP and SP do not come from territories. Territory ownership is
 * still consulted for one thing: initial token placement must be on friendly-
 * controlled ground.
 */

import { createMaryland1862Territories } from './marylandCampaign1862';
import { getDefaultStartDate } from '../utils/dateSystem';
import { CAMPAIGN_VERSION } from '../utils/campaignValidation';
import { DEFAULT_TERRAIN_GROUPS } from './territories';
import { DEFAULT_TERRAIN_VIZ } from '../utils/terrainPatterns.jsx';

export const GRAND_CAMPAIGN_STYLE = 'grand';

// ---------------------------------------------------------------------------
// Default settings — every value is player-editable via SettingsModal.
// ---------------------------------------------------------------------------
export const GRAND_CAMPAIGN_DEFAULTS = {
  // Starting pools
  startingTreasury: 8000,
  startingManpower: 10000,
  startingTokenStrength: 2000,

  // Economy (per turn/month, per owned city)
  incomePerCity: 50,
  manpowerPerCity: 100,

  // Battle rewards
  moneyPerBattleWin: 400,
  moneyPerCityCapture: 750,

  // Replenishment (active turn action, must be in city/fort)
  replenishMoneyCost: 200,
  replenishManpowerCost: 100,
  replenishYield: 100,

  // Garrison
  maxGarrison: 500,
  garrisonCasPer100: 100,

  // Movement — expressed in SVG "inches" (a map-calibration constant).
  movementPointsPerTurn: 2,
  marchInchesPerMP: 2,
  riverInchesPerMP: 3,
  railInchesPerMP: 4,
  riverCrossCost: 1,

  // Proximity rules
  railSnapInches: 0.5,         // how close a token must be to a rail segment to use rail movement
  riverSnapInches: 0.5,        // same for rivers (embark threshold)
  combatAdjacencyInches: 2,    // attacker must be within this range of defender — defaults to 1 march-MP
  supportRangeInches: 2,       // supporting unit must be within this range — defaults to 1 march-MP
  tokenFootprintInches: 0.3,   // collision radius — tokens cannot overlap within this distance

  // Combat casualty modifiers (percentage, added to raw WoR casualty count)
  fatigueCasPct: 5,
  winterAttackerCasPct: 25,
  trainRiverCasPct: 15,

  // Last stand thresholds
  lastStandMin: 100,
  lastStandMax: 500,

  // Retreat distances in march-MP. Decisive loser (and LS winner's "may
  // retreat") uses retreatMP; a conquest draw uses retreatMPDraw for both
  // engaged tokens per rules.
  retreatMP: 4,
  retreatMPDraw: 2,

  // Victory
  vpToWin: 10,
  vpPerCapitalCapture: 2,
  vpPerTokenWipe: 2,

  // Territory influence: each occupying token shifts the territory ±
  // influencePerToken per month toward their side; at ±influenceThreshold
  // the territory flips owner.
  influenceThreshold: 5,
  influencePerToken: 1,

  // Winter months (1-12). Attacker takes extra casualties on these months.
  winterMonths: [12, 1, 2],

  // Map calibration — all inch-measurements are multiplied by this to get
  // SVG units. The map editor should set this once territories are drawn.
  svgUnitsPerInch: 10,

  // Display conversion — every tabletop inch represents this many real-world
  // miles on the board. Used only for human-readable ruler / movement UI;
  // internal math stays in SVG units. Distances are rounded up to whole
  // miles for clarity.
  milesPerInch: 5,
};

// ---------------------------------------------------------------------------
// Schema factories (kept tiny & explicit — KISS).
// ---------------------------------------------------------------------------

/**
 * Create a token. A token is 1:1 with a regiment.
 */
export const createToken = ({ id, regimentId, name, side, manpower }) => ({
  id,
  regimentId,
  name,
  side,
  manpower,
  fatigue: 0,
  position: null,          // {x, y} in SVG units, null = not yet placed
  movementPointsUsed: 0,
  lastActionMonth: 0,
  garrisonedAt: null,      // { featureId, men }
  inCombat: false,         // true when a pending battle references this token
  status: 'active',        // 'active' | 'last-stand' | 'wiped'
  // When set, the token is riding a rail or a river. Movement is then
  // constrained to stay along that feature's polyline; march is unavailable
  // until the player explicitly disembarks.
  boarded: null,           // null | { type: 'rail' | 'river', featureId: string }
});

/**
 * Create a point-type map feature (city / fort / station).
 *
 * `garrison` stores detached men from a friendly token: { side, men }. Only
 * cities and forts can host garrisons per rules.
 */
export const createMapPoint = ({ id, name, kind, x, y, side = 'NEUTRAL', isCapital = false }) => ({
  id,
  name,
  kind,          // 'city' | 'fort' | 'station'
  side,          // 'USA' | 'CSA' | 'NEUTRAL'
  x,
  y,
  isCapital,
  capturedBy: [], // history of capture events, each: { side, month }
  garrison: null, // { side: 'USA'|'CSA', men: number } | null
});

/**
 * Create a polyline-type map feature (railway / river).
 */
export const createMapLine = ({ id, name, kind, points }) => ({
  id,
  name,
  kind,          // 'railway' | 'river'
  points,        // [{x,y}, ...]
});

/**
 * Create the grandCampaign block — the self-contained state for this mode.
 */
export const createGrandCampaignState = (settings = {}) => {
  const s = { ...GRAND_CAMPAIGN_DEFAULTS, ...settings };
  return {
    // Setup & turn state
    phase: 'setup-coinflip',   // 'setup-coinflip' | 'setup-placement' | 'playing' | 'ended'
    coinFlipWinner: null,      // 'USA' | 'CSA' — set when the coin flip resolves
    monthStartedBy: null,      // which side drew first this month
    activeSide: null,          // whose draw is pending or whose token is currently acting
    currentTokenId: null,      // token actively taking its turn (null between draws)
    lastDrawnTokenId: null,    // for "next turn" display

    // Draw bags — token IDs still to draw this month vs. already drawn
    bags: {
      USA: [],
      CSA: [],
      discardUSA: [],
      discardCSA: [],
    },

    // National pools
    pools: {
      USA: { treasury: s.startingTreasury, manpower: s.startingManpower },
      CSA: { treasury: s.startingTreasury, manpower: s.startingManpower },
    },

    // Tokens (first-class board entities)
    tokens: [],

    // Manually placed map overlays
    mapFeatures: {
      cities: [],
      forts: [],
      stations: [],
      railways: [],
      rivers: [],
    },

    // VP events (for audit: each capital capture / token wipe)
    vpEvents: [],

    // Settings (all editable)
    settings: s,
  };
};

// ---------------------------------------------------------------------------
// Template — a new campaign using the Eastern Theatre (MD/WV/VA/PA) map.
// ---------------------------------------------------------------------------
export const createGrandCampaign = () => {
  const baseTerritories = createMaryland1862Territories();
  // Seed influence from each territory's starting owner so the map renders
  // at full saturation on day one.
  const threshold = GRAND_CAMPAIGN_DEFAULTS.influenceThreshold;
  const territories = baseTerritories.map(t => ({
    ...t,
    influence:
      t.owner === 'USA' ? threshold :
      t.owner === 'CSA' ? -threshold :
      0,
  }));
  const campaignDate = getDefaultStartDate();

  return {
    // === VERSION ===
    version: CAMPAIGN_VERSION,

    // === CAMPAIGN INFO ===
    id: Date.now().toString(),
    name: 'Grand Campaign',
    startDate: new Date().toISOString(),
    currentTurn: 1,           // == current month in GC terms
    campaignStyle: GRAND_CAMPAIGN_STYLE,

    // Territory VP is flavor-only in GC mode — victory points below come from
    // capital captures & token wipes, tracked in grandCampaign.vpEvents.
    victoryPointsUSA: 0,
    victoryPointsCSA: 0,
    territories,
    battles: [],
    customMap: null,
    mapTemplate: 'grand-campaign',
    isCountyView: true,

    // Existing CP system is disabled in GC mode but retained for shape so the
    // validator is happy and legacy components don't choke.
    combatPowerUSA: 0,
    combatPowerCSA: 0,
    campaignDate,
    cpSystemEnabled: false,
    cpHistory: [],

    // Abilities block retained for shape — unused in GC.
    abilities: {
      USA: { name: 'Special Orders 191', cooldown: 0, lastUsedTurn: null },
      CSA: { name: 'Valley Supply Lines', cooldown: 0, lastUsedTurn: null },
    },

    // Regiments live here (1:1 with tokens in GC).
    regiments: { USA: [], CSA: [] },
    commanderPool: { USA: [], CSA: [] },
    pendingCommanders: { USA: null, CSA: null },
    benchedCommanders: { USA: null, CSA: null },
    regimentStats: {},

    // Grand Campaign specific state
    grandCampaign: createGrandCampaignState(),

    // Standard settings block (shared with other templates for compatibility).
    settings: {
      allowTerritoryRecapture: true,
      requireAdjacentAttack: false,
      casualtyTracking: true,
      instantVPGains: false,
      captureTransitionTurns: 0,
      failedNeutralAttackToEnemy: false,
      startingCP: 0,
      cpGenerationEnabled: false,
      cpCalculationMode: 'auto',
      vpBase: 1,
      campaignStartDate: campaignDate,
      campaignEndDate: { month: 12, year: 1865, turn: 30, displayString: 'December 1865' },
      turnsPerYear: 6,
      abilityCooldown: 2,
      mapCooldownTurns: 2,
      terrainGroups: { ...DEFAULT_TERRAIN_GROUPS },
      terrainViz: { ...DEFAULT_TERRAIN_VIZ },

      // Presentation, not rules — draws the board as a period map plate, the
      // same way every other template does. Purely how the board looks.
      atlasStyle: true,
    },
  };
};
