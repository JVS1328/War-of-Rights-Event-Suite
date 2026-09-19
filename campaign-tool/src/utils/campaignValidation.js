/**
 * Campaign State Validation Utility
 *
 * Provides comprehensive validation for campaign import/export operations.
 * Ensures all critical state fields are present and valid.
 *
 * Following SOLID principles:
 * - Single Responsibility: Only handles campaign state validation
 * - Open/Closed: Extendable for new validation rules
 */

import { DEFAULT_INCOME_PER_VP, DEFAULT_CAPTURE_BOUNTY } from './cpSystem';

export const CAMPAIGN_VERSION = '1.0.0';

/**
 * Validates the complete campaign state structure
 * @param {Object} data - The campaign data to validate
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export const validateCampaignState = (data) => {
  const errors = [];

  // === CORE IDENTIFICATION ===
  if (!data.id || typeof data.id !== 'string') {
    errors.push('Missing or invalid campaign ID');
  }
  if (!data.name || typeof data.name !== 'string') {
    errors.push('Missing or invalid campaign name');
  }
  if (!data.startDate || typeof data.startDate !== 'string') {
    errors.push('Missing or invalid start date');
  }

  // === TURN & TIME SYSTEM ===
  if (typeof data.currentTurn !== 'number' || data.currentTurn < 1) {
    errors.push('Missing or invalid current turn (must be >= 1)');
  }

  // Validate campaign date object
  if (!data.campaignDate || typeof data.campaignDate !== 'object') {
    errors.push('Missing campaign date object');
  } else {
    const { month, year, turn, displayString } = data.campaignDate;

    if (typeof month !== 'number' || month < 1 || month > 12) {
      errors.push('Invalid campaign date month (must be 1-12)');
    }
    if (typeof year !== 'number' || year < 1861 || year > 1865) {
      errors.push('Invalid campaign date year (must be 1861-1865)');
    }
    if (typeof turn !== 'number' || turn < 1) {
      errors.push('Invalid campaign date turn');
    }
    if (!displayString || typeof displayString !== 'string') {
      errors.push('Missing campaign date display string');
    }
  }

  // === VICTORY POINTS ===
  if (typeof data.victoryPointsUSA !== 'number' || data.victoryPointsUSA < 0) {
    errors.push('Missing or invalid USA victory points');
  }
  if (typeof data.victoryPointsCSA !== 'number' || data.victoryPointsCSA < 0) {
    errors.push('Missing or invalid CSA victory points');
  }

  // === TERRITORIES ===
  if (!Array.isArray(data.territories)) {
    errors.push('Missing or invalid territories array');
  } else if (data.territories.length === 0) {
    errors.push('Territories array is empty');
  } else {
    // Validate territory structure
    data.territories.forEach((territory, index) => {
      if (!territory.id || typeof territory.id !== 'string') {
        errors.push(`Territory ${index}: Missing or invalid ID`);
      }
      if (!territory.name || typeof territory.name !== 'string') {
        errors.push(`Territory ${index}: Missing or invalid name`);
      }
      if (!['USA', 'CSA', 'NEUTRAL'].includes(territory.owner)) {
        errors.push(`Territory ${index}: Invalid owner (must be USA, CSA, or NEUTRAL)`);
      }

      // Accept either victoryPoints OR pointValue (they're synonyms)
      const vpValue = territory.victoryPoints ?? territory.pointValue;
      if (typeof vpValue !== 'number' || vpValue < 0) {
        errors.push(`Territory ${index}: Invalid victory/point value`);
      }

      // adjacentTerritories is optional - can be empty or missing
      // (will be auto-calculated if needed)
      if (territory.adjacentTerritories !== undefined && !Array.isArray(territory.adjacentTerritories)) {
        errors.push(`Territory ${index}: Invalid adjacent territories (must be array if present)`);
      }

      // For rendering, territory needs EITHER:
      // 1. svgPath + center (state-based territories), OR
      // 2. countyFips (county-based territories - paths generated at runtime)
      const hasCountyFips = Array.isArray(territory.countyFips) && territory.countyFips.length > 0;
      const hasSvgPath = territory.svgPath && typeof territory.svgPath === 'string';
      const hasCenter = territory.center && typeof territory.center.x === 'number' && typeof territory.center.y === 'number';

      if (!hasCountyFips && !hasSvgPath) {
        errors.push(`Territory ${index}: Missing SVG path or county FIPS codes`);
      }
      if (!hasCountyFips && !hasCenter) {
        errors.push(`Territory ${index}: Missing center coordinates (required for non-county territories)`);
      }
    });
  }

  // === COMBAT POWER SYSTEM ===
  if (typeof data.combatPowerUSA !== 'number' || data.combatPowerUSA < 0) {
    errors.push('Missing or invalid USA combat power');
  }
  if (typeof data.combatPowerCSA !== 'number' || data.combatPowerCSA < 0) {
    errors.push('Missing or invalid CSA combat power');
  }
  if (typeof data.cpSystemEnabled !== 'boolean') {
    errors.push('Missing or invalid CP system enabled flag');
  }

  if (!Array.isArray(data.cpHistory)) {
    errors.push('Missing or invalid CP history array');
  }

  // === CAMPAIGN STYLE / GRAND CAMPAIGN ===
  // campaignStyle is optional; absent means legacy territory-VP campaign.
  if (data.campaignStyle !== undefined && typeof data.campaignStyle !== 'string') {
    errors.push('Invalid campaignStyle (must be string if present)');
  }
  if (data.campaignStyle === 'grand') {
    if (!data.grandCampaign || typeof data.grandCampaign !== 'object') {
      errors.push('Grand Campaign style requires a grandCampaign state block');
    } else {
      const gc = data.grandCampaign;
      if (typeof gc.phase !== 'string') errors.push('grandCampaign.phase missing');
      if (!Array.isArray(gc.tokens)) errors.push('grandCampaign.tokens must be an array');
      if (!gc.pools || !gc.pools.USA || !gc.pools.CSA) errors.push('grandCampaign.pools missing USA/CSA');
      if (!gc.bags || !Array.isArray(gc.bags.USA) || !Array.isArray(gc.bags.CSA)) {
        errors.push('grandCampaign.bags missing or malformed');
      }
      if (!gc.mapFeatures || typeof gc.mapFeatures !== 'object') {
        errors.push('grandCampaign.mapFeatures missing');
      }
    }
  }

  // === BATTLES ===
  if (!Array.isArray(data.battles)) {
    errors.push('Missing or invalid battles array');
  } else {
    // Validate battle structure for non-empty arrays
    data.battles.forEach((battle, index) => {
      if (!battle.id || typeof battle.id !== 'string') {
        errors.push(`Battle ${index}: Missing or invalid ID`);
      }
      if (typeof battle.turn !== 'number' || battle.turn < 1) {
        errors.push(`Battle ${index}: Invalid turn number`);
      }
      if (!battle.territoryId || typeof battle.territoryId !== 'string') {
        errors.push(`Battle ${index}: Missing or invalid territory ID`);
      }
      if (!battle.mapName || typeof battle.mapName !== 'string') {
        errors.push(`Battle ${index}: Missing or invalid map name`);
      }
      if (!['USA', 'CSA'].includes(battle.attacker)) {
        errors.push(`Battle ${index}: Invalid attacker (must be USA or CSA)`);
      }
      if (battle.winner != null && !['USA', 'CSA'].includes(battle.winner)) {
        errors.push(`Battle ${index}: Invalid winner (must be USA, CSA, or null for pending battles)`);
      }
    });
  }

  // === SETTINGS ===
  // Settings validation is lenient - missing values will be normalized with defaults
  if (!data.settings || typeof data.settings !== 'object') {
    errors.push('Missing settings object');
  } else {
    // Core boolean settings - only error if present but wrong type
    const { allowTerritoryRecapture, requireAdjacentAttack, casualtyTracking } = data.settings;

    if (allowTerritoryRecapture !== undefined && typeof allowTerritoryRecapture !== 'boolean') {
      errors.push('Settings: Invalid allowTerritoryRecapture flag (must be boolean)');
    }
    if (requireAdjacentAttack !== undefined && typeof requireAdjacentAttack !== 'boolean') {
      errors.push('Settings: Invalid requireAdjacentAttack flag (must be boolean)');
    }
    if (casualtyTracking !== undefined && typeof casualtyTracking !== 'boolean') {
      errors.push('Settings: Invalid casualtyTracking flag (must be boolean)');
    }

    // CP system settings - only validate if cpSystemEnabled and values are present
    // Missing values will be normalized with defaults during import
    if (data.cpSystemEnabled) {
      const { startingCP, turnsPerYear, campaignStartDate, campaignEndDate } = data.settings;

      if (startingCP !== undefined && (typeof startingCP !== 'number' || startingCP < 0)) {
        errors.push('Settings: Invalid starting CP value (must be >= 0)');
      }
      if (turnsPerYear !== undefined && (typeof turnsPerYear !== 'number' || turnsPerYear < 1)) {
        errors.push('Settings: Invalid turns per year (must be >= 1)');
      }
      if (campaignStartDate !== undefined && typeof campaignStartDate !== 'object') {
        errors.push('Settings: Invalid campaign start date (must be object)');
      }
      if (campaignEndDate !== undefined && typeof campaignEndDate !== 'object') {
        errors.push('Settings: Invalid campaign end date (must be object)');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Calculate which territories are adjacent based on shared states/counties
 * @param {Array} territories - All campaign territories
 * @returns {Object} Map of territory ID to array of adjacent territory IDs
 */
const calculateTerritoryAdjacency = (territories) => {
  const adjacencyMap = {};

  territories.forEach(territory => {
    const adjacent = new Set();

    // Find territories that share states or are geographically adjacent
    territories.forEach(other => {
      if (territory.id === other.id) return;

      // Check for shared states
      if (territory.states && other.states) {
        const sharedStates = territory.states.some(s => other.states.includes(s));
        if (sharedStates) {
          adjacent.add(other.id);
        }
      }

      // Check for shared counties
      if (territory.counties && other.counties) {
        const sharedCounties = territory.counties.some(c => other.counties.includes(c));
        if (sharedCounties) {
          adjacent.add(other.id);
        }
      }

      // For state-based territories, check if states are geographically adjacent
      // This would require state adjacency data - for now, we'll be permissive
    });

    adjacencyMap[territory.id] = Array.from(adjacent);
  });

  return adjacencyMap;
};

/**
 * Normalize and sanitize campaign territory data
 * Ensures both pointValue and victoryPoints exist, adds adjacentTerritories
 * @param {Object} campaign - Campaign data to normalize
 * @returns {Object} Normalized campaign data
 */
const normalizeCampaignData = (campaign) => {
  // Spread first, so anything this function has no opinion about survives the
  // round trip untouched. There is no allow-list here and deliberately so:
  // `campaign.orders` (orders of the day, keyed by turn), and the per-battle
  // `landing` / `reachOverridden` flags, are carried through by this spread and
  // by the battles array being left alone below. A save written before those
  // existed simply has none, which every reader treats as "no orders given".
  const normalized = { ...campaign };

  // Normalize territories
  if (Array.isArray(normalized.territories)) {
    // First pass: normalize individual territory fields
    normalized.territories = normalized.territories.map(t => {
      const vpValue = t.victoryPoints ?? t.pointValue ?? 1;

      return {
        ...t,
        // Ensure both fields exist for backward compatibility
        victoryPoints: vpValue,
        pointValue: vpValue,
        // Ensure adjacentTerritories exists (will be calculated below)
        adjacentTerritories: t.adjacentTerritories || []
      };
    });

    // Second pass: auto-calculate adjacencies if missing or empty
    const adjacencyMap = calculateTerritoryAdjacency(normalized.territories);
    normalized.territories = normalized.territories.map(t => ({
      ...t,
      adjacentTerritories: t.adjacentTerritories.length > 0
        ? t.adjacentTerritories
        : adjacencyMap[t.id] || []
    }));
  }

  // Normalize settings with defaults for missing values
  if (normalized.settings) {
    // Whether this campaign bills supply by ticket damage. Several other
    // defaults have to follow it rather than being chosen independently.
    const ticketOn = normalized.settings.ticketCostEnabled ?? false;

    normalized.settings = {
      // Core settings with defaults
      allowTerritoryRecapture: normalized.settings.allowTerritoryRecapture ?? true,
      requireAdjacentAttack: normalized.settings.requireAdjacentAttack ?? false,
      casualtyTracking: normalized.settings.casualtyTracking ?? true,
      instantVPGains: normalized.settings.instantVPGains ?? true,
      captureTransitionTurns: normalized.settings.captureTransitionTurns ?? 2,
      failedNeutralAttackToEnemy: normalized.settings.failedNeutralAttackToEnemy ?? true,

      // CP system settings with defaults
      startingCP: normalized.settings.startingCP ?? 500,
      cpGenerationEnabled: normalized.settings.cpGenerationEnabled ?? true,
      cpCalculationMode: normalized.settings.cpCalculationMode ?? 'auto',
      vpBase: normalized.settings.vpBase ?? 1,
      turnsPerYear: normalized.settings.turnsPerYear ?? 6,
      abilityCooldown: normalized.settings.abilityCooldown ?? 2,

      // Base SP cost settings with defaults
      baseAttackCostEnemy: normalized.settings.baseAttackCostEnemy ?? 75,
      baseAttackCostNeutral: normalized.settings.baseAttackCostNeutral ?? 50,
      baseDefenseCostFriendly: normalized.settings.baseDefenseCostFriendly ?? 25,
      baseDefenseCostNeutral: normalized.settings.baseDefenseCostNeutral ?? 50,

      // (season initiative lives on the campaign, not in settings)
      // Ticket-weighted losses. Defaults OFF so an existing campaign keeps
      // costing exactly what it did before; new campaigns turn it on.
      ticketCostEnabled: ticketOn,
      ticketCostDivisor: normalized.settings.ticketCostDivisor ?? 100,
      vpCurve: normalized.settings.vpCurve ?? 'linear',
      // Income has to default on the same scale as costs. A campaign that
      // predates these keys has no incomePerVP, and falling back to 1 while
      // ticket costs are on pays a side its raw VP total per turn against
      // battles costing thousands - the pools drain with nothing replacing
      // them. Default with the cost scale, not against it.
      incomePerVP: normalized.settings.incomePerVP ?? (ticketOn ? DEFAULT_INCOME_PER_VP : 1),
      captureBounty: normalized.settings.captureBounty ?? (ticketOn ? DEFAULT_CAPTURE_BOUNTY : 0),

      // Season length. 0 disables the turn cap and leaves the campaign
      // running to its end date as before.
      seasonLengthTurns: normalized.settings.seasonLengthTurns ?? 0,
      capitalVictoryEnabled: normalized.settings.capitalVictoryEnabled ?? false,

      // Presentation only - no effect on play, so it defaults on everywhere
      // rather than being held back for existing campaigns. An explicit false
      // is still respected.
      atlasStyle: normalized.settings.atlasStyle ?? true,

      // Terrain map groups & visualization (preserve existing if present)
      terrainGroups: normalized.settings.terrainGroups ?? undefined,
      terrainViz: normalized.settings.terrainViz ?? undefined,

      // Campaign date settings (preserve existing if present)
      campaignStartDate: normalized.settings.campaignStartDate ?? {
        month: 4,
        year: 1861,
        turn: 1,
        displayString: 'April 1861'
      },
      campaignEndDate: normalized.settings.campaignEndDate ?? {
        month: 12,
        year: 1865,
        turn: 30,
        displayString: 'December 1865'
      }
    };
  }

  // Ensure cpHistory exists
  if (!Array.isArray(normalized.cpHistory)) {
    normalized.cpHistory = [];
  }

  // Ensure battles exists
  if (!Array.isArray(normalized.battles)) {
    normalized.battles = [];
  }

  // Preserve Grand Campaign block as-is; downstream hooks handle migrations.
  if (normalized.campaignStyle === 'grand' && normalized.grandCampaign) {
    normalized.grandCampaign = { ...normalized.grandCampaign };
  }

  return normalized;
};

/**
 * Validates and sanitizes imported campaign data
 * @param {Object} data - Raw imported data
 * @returns {Object} { success: boolean, campaign?: Object, error?: string }
 */
export const validateImportedCampaign = (data) => {
  // Check if data exists
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      error: 'Invalid data: Not a valid JSON object'
    };
  }

  // Perform comprehensive validation
  const validation = validateCampaignState(data);

  if (!validation.isValid) {
    const errorList = validation.errors.join('\n• ');
    return {
      success: false,
      error: `Campaign validation failed:\n\n• ${errorList}`
    };
  }

  // Version compatibility check (for future use)
  if (data.version && data.version !== CAMPAIGN_VERSION) {
    console.warn(`Campaign version mismatch: imported ${data.version}, expected ${CAMPAIGN_VERSION}`);
    // For now, we'll allow different versions, but log a warning
  }

  // Normalize data to ensure all required fields exist
  const normalizedCampaign = normalizeCampaignData(data);

  return {
    success: true,
    campaign: normalizedCampaign
  };
};

/**
 * Prepares campaign data for export
 * Adds metadata and version information
 * @param {Object} campaign - Current campaign state
 * @returns {Object} Export-ready campaign data
 */
export const prepareCampaignExport = (campaign) => {
  return {
    ...campaign,
    version: CAMPAIGN_VERSION,
    exportDate: new Date().toISOString(),
    exportedBy: 'War of Rights Campaign Tracker'
  };
};

/**
 * Generate a human-readable error message for import failures
 * @param {string} errorMessage - The error message
 * @returns {string} Formatted error message
 */
export const formatImportError = (errorMessage) => {
  return `Failed to import campaign file.\n\n${errorMessage}\n\nPlease ensure you're importing a valid campaign file exported from this application.`;
};
