import { INITIAL_TERRITORIES } from './territories';
import { getDefaultStartDate } from '../utils/dateSystem';
import {
  DEFAULT_STARTING_CP,
  DEFAULT_STARTING_CP_TICKETS,
  DEFAULT_INCOME_PER_VP,
  DEFAULT_CAPTURE_BOUNTY,
  DEFAULT_SEASON_LENGTH_TURNS
} from '../utils/cpSystem';

import { getStateByAbbr, calculateGroupCenter } from './usaStates';
import { CAMPAIGN_VERSION } from '../utils/campaignValidation';
import { createEasternTheatreTerritories, calculateInitialVP as calcEasternVP } from './easternTheatreCounties';
import { createMaryland1862Territories, calculateInitialVP as calcMaryland1862VP } from './marylandCampaign1862';
import { DEFAULT_TERRAIN_GROUPS } from './territories';
import { DEFAULT_TERRAIN_VIZ } from '../utils/terrainPatterns.jsx';
import { createGrandCampaign } from './grandCampaign';

/**
 * The Season 2 ruleset, applied to every newly created campaign.
 *
 * Losses are billed by ticket damage (1× In Formation, 3× Skirmish,
 * 5× Out of Line) rather than as a share of a fixed maximum, so how a side
 * fought drives the supply bill. Pools and income scale to match, since ticket
 * damage runs roughly 20-25× larger than the old casualty-share costs.
 *
 * Existing campaigns are unaffected: the settings normaliser defaults all of
 * this off, so a save without these keys keeps costing exactly what it did.
 *
 * Every constant here is provisional - they are derived from Season 1 casualty
 * counts and an assumed ×2.2 average ticket cost. Recalibrate against real
 * avgTd figures once Season 2 has a few battles on the board.
 * See CAMPAIGN_BALANCE_AUDIT_S1.md Part 4.
 */
const SEASON_RULESET = {
  // Ticket-weighted supply costs
  ticketCostEnabled: true,
  ticketCostDivisor: 100, // base costs read as SP per 100 tickets
  vpCurve: 'compressed',  // a 7-point capital costs 4× a 1-point county, not 7×
  incomePerVP: DEFAULT_INCOME_PER_VP,
  startingCP: DEFAULT_STARTING_CP_TICKETS,
  captureBounty: DEFAULT_CAPTURE_BOUNTY,

  // Season resolution
  seasonLengthTurns: DEFAULT_SEASON_LENGTH_TURNS,
  capitalVictoryEnabled: true,
};

/**
 * Helper to add SVG path data to a territory based on state abbreviation
 */
function addSvgPath(territory, stateAbbr) {
  const state = getStateByAbbr(stateAbbr);
  if (state) {
    return {
      ...territory,
      svgPath: state.svgPath,
      center: state.center
    };
  }
  return territory;
}

/**
 * Create default Civil War campaign with 20 territories
 * Based on CP System Specification
 */
function createCivilWarTerritories() {
  // Territory definitions with strategic groupings
  const territories = [
    // === USA STARTING TERRITORIES (50 VP total) ===
    // Capital region (15pt)
    addSvgPath({
      id: 'maryland',
      name: 'Maryland',
      owner: 'USA',
      pointValue: 15,
      victoryPoints: 15,
      adjacentTerritories: ['pennsylvania', 'virginia', 'west-virginia', 'delaware'],
      captureHistory: []
    }, 'MD'),
    // Major territories (10pt each = 20pt)
    addSvgPath({
      id: 'pennsylvania',
      name: 'Pennsylvania',
      owner: 'USA',
      pointValue: 10,
      victoryPoints: 10,
      adjacentTerritories: ['ohio', 'maryland', 'new-york'],
      captureHistory: []
    }, 'PA'),
    addSvgPath({
      id: 'ohio',
      name: 'Ohio',
      owner: 'USA',
      pointValue: 10,
      victoryPoints: 10,
      adjacentTerritories: ['pennsylvania', 'indiana', 'kentucky', 'west-virginia'],
      captureHistory: []
    }, 'OH'),
    // Minor territories (5pt each = 15pt)
    addSvgPath({
      id: 'new-york',
      name: 'New York',
      owner: 'USA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['pennsylvania', 'new-england'],
      captureHistory: []
    }, 'NY'),
    addSvgPath({
      id: 'illinois',
      name: 'Illinois',
      owner: 'USA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['indiana', 'missouri', 'iowa'],
      captureHistory: []
    }, 'IL'),
    addSvgPath({
      id: 'michigan',
      name: 'Michigan',
      owner: 'USA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['indiana', 'ohio', 'wisconsin'],
      captureHistory: []
    }, 'MI'),

    // === CSA STARTING TERRITORIES (55 VP total) ===
    // Capital (15pt)
    addSvgPath({
      id: 'virginia',
      name: 'Virginia',
      owner: 'CSA',
      pointValue: 15,
      victoryPoints: 15,
      adjacentTerritories: ['maryland', 'west-virginia', 'north-carolina'],
      captureHistory: []
    }, 'VA'),
    // Major territories (10pt each = 20pt)
    addSvgPath({
      id: 'south-carolina',
      name: 'South Carolina',
      owner: 'CSA',
      pointValue: 10,
      victoryPoints: 10,
      adjacentTerritories: ['north-carolina', 'georgia'],
      captureHistory: []
    }, 'SC'),
    addSvgPath({
      id: 'georgia',
      name: 'Georgia',
      owner: 'CSA',
      pointValue: 10,
      victoryPoints: 10,
      adjacentTerritories: ['south-carolina', 'alabama', 'tennessee', 'north-carolina'],
      captureHistory: []
    }, 'GA'),
    // Minor territories (5pt each = 20pt)
    addSvgPath({
      id: 'alabama',
      name: 'Alabama',
      owner: 'CSA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['georgia', 'mississippi', 'tennessee'],
      captureHistory: []
    }, 'AL'),
    addSvgPath({
      id: 'mississippi',
      name: 'Mississippi',
      owner: 'CSA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['alabama', 'louisiana', 'tennessee', 'arkansas'],
      captureHistory: []
    }, 'MS'),
    addSvgPath({
      id: 'louisiana',
      name: 'Louisiana',
      owner: 'CSA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['mississippi', 'arkansas', 'texas'],
      captureHistory: []
    }, 'LA'),
    addSvgPath({
      id: 'texas',
      name: 'Texas',
      owner: 'CSA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['louisiana', 'arkansas'],
      captureHistory: []
    }, 'TX'),

    // === NEUTRAL BORDER STATES (45 VP total) ===
    // Major border states (10pt each = 30pt)
    addSvgPath({
      id: 'kentucky',
      name: 'Kentucky',
      owner: 'NEUTRAL',
      pointValue: 10,
      victoryPoints: 10,
      adjacentTerritories: ['ohio', 'west-virginia', 'virginia', 'tennessee', 'missouri', 'indiana'],
      captureHistory: []
    }, 'KY'),
    addSvgPath({
      id: 'missouri',
      name: 'Missouri',
      owner: 'NEUTRAL',
      pointValue: 10,
      victoryPoints: 10,
      adjacentTerritories: ['illinois', 'kentucky', 'tennessee', 'arkansas', 'kansas'],
      captureHistory: []
    }, 'MO'),
    addSvgPath({
      id: 'tennessee',
      name: 'Tennessee',
      owner: 'CSA',
      pointValue: 10,
      victoryPoints: 10,
      adjacentTerritories: ['kentucky', 'virginia', 'north-carolina', 'georgia', 'alabama', 'mississippi', 'arkansas', 'missouri'],
      captureHistory: []
    }, 'TN'),
    // Minor border states (5pt each = 15pt)
    addSvgPath({
      id: 'delaware',
      name: 'Delaware',
      owner: 'USA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['maryland', 'pennsylvania'],
      captureHistory: []
    }, 'DE'),
    addSvgPath({
      id: 'west-virginia',
      name: 'West Virginia',
      owner: 'NEUTRAL',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['ohio', 'pennsylvania', 'maryland', 'virginia', 'kentucky'],
      captureHistory: []
    }, 'WV'),
    addSvgPath({
      id: 'north-carolina',
      name: 'North Carolina',
      owner: 'CSA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['virginia', 'tennessee', 'georgia', 'south-carolina'],
      captureHistory: []
    }, 'NC'),
    addSvgPath({
      id: 'arkansas',
      name: 'Arkansas',
      owner: 'CSA',
      pointValue: 5,
      victoryPoints: 5,
      adjacentTerritories: ['missouri', 'tennessee', 'mississippi', 'louisiana', 'texas'],
      captureHistory: []
    }, 'AR')
  ];

  return territories;
}

/**
 * Create a default campaign template
 * Now includes CP system fields
 */
export const createDefaultCampaign = (customMap = null) => {
  // Use custom map territories if provided, otherwise use Civil War default
  const territories = customMap
    ? customMap.territories.map(t => ({
        ...t,
        captureHistory: [],
        owner: t.initialOwner,
        pointValue: t.victoryPoints || t.pointValue || 10, // Ensure pointValue exists
      }))
    : createCivilWarTerritories();

  // Get default campaign start date (April 1861)
  const campaignDate = getDefaultStartDate();

  // Calculate initial VP from territories
  const initialVP = calculateTerritoryVP(territories);

  return {
    // === VERSION ===
    version: CAMPAIGN_VERSION,

    // === EXISTING FIELDS (preserved for backward compatibility) ===
    id: Date.now().toString(),
    name: 'New Campaign',
    startDate: new Date().toISOString(),
    currentTurn: 1,
    victoryPointsUSA: initialVP.usa, // Calculate from territories
    victoryPointsCSA: initialVP.csa, // Calculate from territories
    territories,
    battles: [],
    customMap: customMap || null,
    mapTemplate: customMap ? 'custom' : 'civil-war-default',

    // === NEW CP SYSTEM FIELDS ===
    combatPowerUSA: DEFAULT_STARTING_CP_TICKETS,
    combatPowerCSA: DEFAULT_STARTING_CP_TICKETS,
    campaignDate: campaignDate,
    cpSystemEnabled: true,
    cpHistory: [],

    // === SEASON INITIATIVE ===
    // Rolled once at the start of a season; the first move alternates each
    // turn from there. Null until the roll happens.
    initiative: null,

    // === SEASON DOCTRINES ===
    // Drafted before turn 1: one offensive (active, limited uses) and one
    // defensive (passive) per side, locked for the season.
    doctrines: {
      USA: { offense: null, defense: null, usesSpent: 0, holdFirstLossSpent: false },
      CSA: { offense: null, defense: null, usesSpent: 0, holdFirstLossSpent: false },
    },

    // === TEAM ABILITIES ===
    abilities: {
      USA: {
        name: 'Special Orders 191',
        cooldown: 0, // 0 means available
        lastUsedTurn: null
      },
      CSA: {
        name: 'Valley Supply Lines',
        cooldown: 0, // 0 means available
        lastUsedTurn: null
      }
    },

    // === REGIMENT SYSTEM ===
    regiments: {
      USA: [],  // Array of { id, name }
      CSA: []   // Array of { id, name }
    },
    commanderPool: {
      USA: [],  // IDs of regiments still available for selection
      CSA: []   // IDs of regiments still available for selection
    },
    pendingCommanders: {
      USA: null, // { id, name } rolled ahead of the next battle
      CSA: null
    },
    benchedCommanders: {
      USA: null, // { id, name } sitting out one draw after a pool refill
      CSA: null
    },
    regimentStats: {}, // { regimentId: { wins, losses, casualties, spLost, vpGained, vpLost, battles: [] } }

    // Settings with both old and new fields
    settings: {
      // Core settings
      allowTerritoryRecapture: true,
      requireAdjacentAttack: false,
      casualtyTracking: true,

      // VP system settings
      instantVPGains: true,
      captureTransitionTurns: 2,

      // Territory capture rules
      failedNeutralAttackToEnemy: true,

      // New CP system settings
      ...SEASON_RULESET,
      cpGenerationEnabled: true,
      cpCalculationMode: 'auto', // 'auto' or 'manual'
      vpBase: 5, // VP multiplier base - state-level maps use higher VP values
      campaignStartDate: getDefaultStartDate(),
      campaignEndDate: {
        month: 12,
        year: 1865,
        turn: 30,
        displayString: 'December 1865'
      },
      turnsPerYear: 6,

      // Team abilities settings
      abilityCooldown: 2,

      // Map cooldown
      mapCooldownTurns: 2,

      // Terrain map groups
      terrainGroups: { ...DEFAULT_TERRAIN_GROUPS },
      terrainViz: { ...DEFAULT_TERRAIN_VIZ }
    }
  };
};

/**
 * Default settings factory (backward compatible)
 */
export const getDefaultSettings = () => ({
  // Core settings
  allowTerritoryRecapture: true,
  requireAdjacentAttack: false,
  casualtyTracking: true,

  // VP system settings
  instantVPGains: true,
  captureTransitionTurns: 2,

  // Territory capture rules
  failedNeutralAttackToEnemy: true,

  // New CP settings
  startingCP: DEFAULT_STARTING_CP,
  cpGenerationEnabled: true,
  cpCalculationMode: 'auto', // 'auto' or 'manual'
  vpBase: 5, // VP multiplier base - adjust based on map VP scale
  campaignStartDate: getDefaultStartDate(),
  campaignEndDate: {
    month: 12,
    year: 1865,
    turn: 30,
    displayString: 'December 1865'
  },
  turnsPerYear: 6,

  // Team abilities settings
  abilityCooldown: 2,

  // Map cooldown
  mapCooldownTurns: 2,

  // Terrain map groups
  terrainGroups: { ...DEFAULT_TERRAIN_GROUPS },
  terrainViz: { ...DEFAULT_TERRAIN_VIZ }
});

/**
 * Helper to calculate total VP for each side from territories
 * Used for victory condition checks
 */
export const calculateTerritoryVP = (territories) => {
  let usaVP = 0;
  let csaVP = 0;

  territories.forEach(territory => {
    const vpValue = territory.pointValue || territory.victoryPoints || 0;

    if (territory.owner === 'USA') {
      usaVP += vpValue;
    } else if (territory.owner === 'CSA') {
      csaVP += vpValue;
    }
  });

  return { usa: usaVP, csa: csaVP };
};

/**
 * Create an Eastern Theatre county-based campaign
 * This uses county groupings as territories for a more detailed map
 */
export const createEasternTheatreCampaign = () => {
  const territories = createEasternTheatreTerritories();
  const campaignDate = getDefaultStartDate();
  const initialVP = calcEasternVP();

  return {
    // === VERSION ===
    version: CAMPAIGN_VERSION,

    // === CAMPAIGN INFO ===
    id: Date.now().toString(),
    name: 'Eastern Theatre Campaign',
    startDate: new Date().toISOString(),
    currentTurn: 1,
    victoryPointsUSA: initialVP.usa,
    victoryPointsCSA: initialVP.csa,
    territories,
    battles: [],
    customMap: null,
    mapTemplate: 'eastern-theatre-counties',
    isCountyView: true,

    // === CP SYSTEM FIELDS ===
    combatPowerUSA: DEFAULT_STARTING_CP_TICKETS,
    combatPowerCSA: DEFAULT_STARTING_CP_TICKETS,
    campaignDate: campaignDate,
    cpSystemEnabled: true,
    cpHistory: [],

    // === SEASON INITIATIVE ===
    // Rolled once at the start of a season; the first move alternates each
    // turn from there. Null until the roll happens.
    initiative: null,

    // === SEASON DOCTRINES ===
    // Drafted before turn 1: one offensive (active, limited uses) and one
    // defensive (passive) per side, locked for the season.
    doctrines: {
      USA: { offense: null, defense: null, usesSpent: 0, holdFirstLossSpent: false },
      CSA: { offense: null, defense: null, usesSpent: 0, holdFirstLossSpent: false },
    },

    // === TEAM ABILITIES ===
    abilities: {
      USA: {
        name: 'Special Orders 191',
        cooldown: 0,
        lastUsedTurn: null
      },
      CSA: {
        name: 'Valley Supply Lines',
        cooldown: 0,
        lastUsedTurn: null
      }
    },

    // === REGIMENT SYSTEM ===
    regiments: {
      USA: [],
      CSA: []
    },
    commanderPool: {
      USA: [],
      CSA: []
    },
    pendingCommanders: {
      USA: null,
      CSA: null
    },
    benchedCommanders: {
      USA: null,
      CSA: null
    },
    regimentStats: {},

    // Settings
    settings: {
      allowTerritoryRecapture: true,
      requireAdjacentAttack: true, // Adjacency matters more with county-level detail
      casualtyTracking: true,
      instantVPGains: true,
      captureTransitionTurns: 2,
      failedNeutralAttackToEnemy: true,
      ...SEASON_RULESET,
      cpGenerationEnabled: true,
      cpCalculationMode: 'auto',
      vpBase: 1, // County-level maps use VP scale 1-5
      campaignStartDate: getDefaultStartDate(),
      campaignEndDate: {
        month: 12,
        year: 1865,
        turn: 30,
        displayString: 'December 1865'
      },
      turnsPerYear: 6,
      abilityCooldown: 2,
      terrainGroups: { ...DEFAULT_TERRAIN_GROUPS },
      terrainViz: { ...DEFAULT_TERRAIN_VIZ }
    }
  };
};

/**
 * Create the Eastern Theatre of the War campaign
 * Full Civil War campaign: April 1861 - December 1865
 * County-based map covering MD, WV, VA, and PA
 */
export const createMaryland1862Campaign = () => {
  const territories = createMaryland1862Territories();
  const initialVP = calcMaryland1862VP();

  // Campaign starts April 1861
  const campaignDate = getDefaultStartDate();

  return {
    // === VERSION ===
    version: CAMPAIGN_VERSION,

    // === CAMPAIGN INFO ===
    id: Date.now().toString(),
    name: 'Eastern Theatre of the War',
    startDate: new Date().toISOString(),
    currentTurn: 1,
    victoryPointsUSA: initialVP.usa,
    victoryPointsCSA: initialVP.csa,
    territories,
    battles: [],
    customMap: null,
    mapTemplate: 'eastern-theatre',
    isCountyView: true,

    // === CP SYSTEM FIELDS ===
    // Ticket-scale pool, matching settings.startingCP below.
    combatPowerUSA: DEFAULT_STARTING_CP_TICKETS,
    combatPowerCSA: DEFAULT_STARTING_CP_TICKETS,
    campaignDate: campaignDate,
    cpSystemEnabled: true,
    cpHistory: [],

    // === SEASON INITIATIVE ===
    // Rolled once at the start of a season; the first move alternates each
    // turn from there. Null until the roll happens.
    initiative: null,

    // === SEASON DOCTRINES ===
    // Drafted before turn 1: one offensive (active, limited uses) and one
    // defensive (passive) per side, locked for the season.
    doctrines: {
      USA: { offense: null, defense: null, usesSpent: 0, holdFirstLossSpent: false },
      CSA: { offense: null, defense: null, usesSpent: 0, holdFirstLossSpent: false },
    },

    // === TEAM ABILITIES ===
    // Special Orders 191: Union discovered Lee's battle plans
    // Valley Supply Lines: CSA supply through Shenandoah
    abilities: {
      USA: {
        name: 'Special Orders 191',
        cooldown: 0,
        lastUsedTurn: null
      },
      CSA: {
        name: 'Valley Supply Lines',
        cooldown: 0,
        lastUsedTurn: null
      }
    },

    // === REGIMENT SYSTEM ===
    regiments: {
      USA: [],
      CSA: []
    },
    commanderPool: {
      USA: [],
      CSA: []
    },
    pendingCommanders: {
      USA: null,
      CSA: null
    },
    benchedCommanders: {
      USA: null,
      CSA: null
    },
    regimentStats: {},

    // Settings for the Eastern Theatre Campaign
    settings: {
      allowTerritoryRecapture: true,
      requireAdjacentAttack: true, // Adjacency matters with county-level detail
      casualtyTracking: true,
      instantVPGains: true,
      captureTransitionTurns: 1,
      failedNeutralAttackToEnemy: true,
      ...SEASON_RULESET,

      cpGenerationEnabled: true,
      cpCalculationMode: 'auto',
      vpBase: 1, // County-level maps use VP scale 1-7
      campaignStartDate: campaignDate,
      campaignEndDate: {
        month: 12,
        year: 1865,
        turn: 30,
        displayString: 'December 1865'
      },
      turnsPerYear: 6, // 2 months per turn
      abilityCooldown: 2,
      terrainGroups: { ...DEFAULT_TERRAIN_GROUPS },
      terrainViz: { ...DEFAULT_TERRAIN_VIZ }
    }
  };
};

/**
 * Available campaign templates
 */
export const CAMPAIGN_TEMPLATES = {
  'civil-war-default': {
    name: 'Civil War (State View)',
    description: 'Classic campaign with state-level territories',
    create: createDefaultCampaign
  },
  'eastern-theatre-counties': {
    name: 'Eastern Theatre (County View)',
    description: 'Detailed county-grouped regions for the Eastern Theatre',
    create: createEasternTheatreCampaign
  },
  'eastern-theatre': {
    name: 'Eastern Theatre of the War',
    description: 'Full Civil War campaign (April 1861 - December 1865) with county-based regions across MD, WV, VA, and PA',
    create: createMaryland1862Campaign
  },
  'grand-campaign': {
    name: 'Grand Campaign',
    description: 'Tabletop ruleset adaptation — token-based units, inch-measured movement, manpower/treasury pools, cities/forts/stations/rails/rivers placed on the Eastern Theatre map. Victory at 10 VP via capital captures and token wipes.',
    create: createGrandCampaign
  }
};