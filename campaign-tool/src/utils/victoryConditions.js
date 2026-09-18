/**
 * Victory Condition Checking Logic
 *
 * Supports both legacy system and new CP system
 * Priority order (CP system):
 * 1. CP Depletion (≤0 CP)
 * 2. Total Territorial Control (100% of territories)
 * 3. Date-based Victory (December 1865 - VP comparison)
 *
 * Legacy system checks only total territorial control (100% of territories)
 */

import { isCampaignOver } from './dateSystem';

/**
 * Main victory condition checker
 * Automatically detects which system to use based on campaign data
 * 
 * @param {Object} campaign - Campaign state
 * @returns {Object|null} Victory result or null if no victory
 */
export const checkVictoryConditions = (campaign) => {
  // Grand Campaign mode: VP from capital captures + token wipes.
  if (campaign.campaignStyle === 'grand' && campaign.grandCampaign) {
    return checkGrandCampaignVictory(campaign);
  }

  // Determine which system to use
  const useCPSystem = campaign.cpSystemEnabled &&
                      typeof campaign.combatPowerUSA === 'number' &&
                      typeof campaign.combatPowerCSA === 'number';

  if (useCPSystem) {
    // New CP system checks (priority order)
    const checks = [
      checkCPDepletion,
      checkCapitalVictory,
      checkTotalTerritorialControl,
      checkSeasonEnd,
      checkDateVictory
    ];

    for (const check of checks) {
      const result = check(campaign);
      if (result) return result;
    }
  } else {
    // Legacy system - only total territorial control (100%)
    const result = checkTotalTerritorialControl(campaign);
    if (result) return result;
  }

  return null;
};

// ============================================================================
// GRAND CAMPAIGN VICTORY
// ============================================================================

/**
 * Grand Campaign victory: first side to reach vpToWin wins. VP comes from
 * grandCampaign.vpEvents (capital captures + token wipes); the running
 * totals are tracked in victoryPointsUSA / victoryPointsCSA.
 */
const checkGrandCampaignVictory = (campaign) => {
  const target = campaign.grandCampaign?.settings?.vpToWin ?? 10;
  const vpUSA = campaign.victoryPointsUSA || 0;
  const vpCSA = campaign.victoryPointsCSA || 0;

  if (vpUSA >= target && vpUSA >= vpCSA) {
    return {
      winner: 'USA',
      type: 'Grand Campaign Victory',
      description: `USA reached ${vpUSA} VP (target ${target}) via capital captures and token wipes.`,
      vpUSA,
      vpCSA,
    };
  }
  if (vpCSA >= target && vpCSA >= vpUSA) {
    return {
      winner: 'CSA',
      type: 'Grand Campaign Victory',
      description: `CSA reached ${vpCSA} VP (target ${target}) via capital captures and token wipes.`,
      vpUSA,
      vpCSA,
    };
  }
  return null;
};

// ============================================================================
// NEW CP SYSTEM VICTORY CONDITIONS
// ============================================================================

/**
 * Check if either side has depleted CP (≤0)
 * Highest priority victory condition
 * 
 * @param {Object} campaign - Campaign state
 * @returns {Object|null} Victory result or null
 */
const checkCPDepletion = (campaign) => {
  if (campaign.combatPowerUSA <= 0) {
    return {
      winner: 'CSA',
      type: 'Supply Point Depletion',
      description: 'USA has exhausted their supply points and can no longer sustain the war effort',
      cpUSA: campaign.combatPowerUSA,
      cpCSA: campaign.combatPowerCSA
    };
  }

  if (campaign.combatPowerCSA <= 0) {
    return {
      winner: 'USA',
      type: 'Supply Point Depletion',
      description: 'CSA has exhausted their supply points and can no longer sustain the war effort',
      cpUSA: campaign.combatPowerUSA,
      cpCSA: campaign.combatPowerCSA
    };
  }

  return null;
};

/**
 * Check whether either side holds every capital on the map.
 *
 * Winning this way means taking all of the enemy's capitals while still
 * holding all of your own - a total decision, not an exchange.
 *
 * This is the reachable replacement for total territorial control, which needs
 * every region on the map and never fires in practice.
 *
 * @param {Object} campaign - Campaign state
 * @returns {Object|null} Victory result or null
 */
const checkCapitalVictory = (campaign) => {
  if (campaign.settings?.capitalVictoryEnabled !== true) return null;

  const capitals = campaign.territories.filter(t => t.isCapital);
  if (capitals.length === 0) return null;

  for (const side of ['USA', 'CSA']) {
    // Every capital on the board, held and settled. Taking the enemy's is not
    // enough on its own - you have to still be holding your own, so a side
    // cannot trade its capitals away and win on the exchange. A capital inside
    // its transition window doesn't count either: you have to hold it through
    // the counter-attack, not just touch it.
    const holdsAll = capitals.every(
      t => t.owner === side && !t.transitionState?.isTransitioning
    );

    if (holdsAll) {
      return {
        winner: side,
        type: 'Capital Victory',
        description: `${side} holds every capital on the map: ${capitals.map(t => t.name).join(', ')}`,
        capitals: capitals.map(t => t.name)
      };
    }
  }

  return null;
};

/**
 * Check if either side controls ALL territories (100%)
 * Second priority victory condition
 *
 * @param {Object} campaign - Campaign state
 * @returns {Object|null} Victory result or null
 */
const checkTotalTerritorialControl = (campaign) => {
  const usaTerritories = campaign.territories.filter(t => t.owner === 'USA');
  const csaTerritories = campaign.territories.filter(t => t.owner === 'CSA');
  const total = campaign.territories.length;

  if (usaTerritories.length === total) {
    return {
      winner: 'USA',
      type: 'Total Territorial Control',
      description: `USA controls all ${total} territories`,
      territoriesUSA: usaTerritories.length,
      territoriesCSA: csaTerritories.length
    };
  }

  if (csaTerritories.length === total) {
    return {
      winner: 'CSA',
      type: 'Total Territorial Control',
      description: `CSA controls all ${total} territories`,
      territoriesUSA: usaTerritories.length,
      territoriesCSA: csaTerritories.length
    };
  }

  return null;
};

/**
 * Check whether the season's turn cap has been reached.
 *
 * Scored on territory VP, with remaining SP only as a tiebreaker. SP is
 * deliberately not part of the score: the cheaper option each turn is to let
 * the enemy attack you, so a side that never attacks ends the season with the
 * bigger pool. Counting that pool would reward the passive play twice. With VP
 * as the scoreline, a side behind on the map has to come out and take ground
 * before the clock runs out.
 *
 * @param {Object} campaign - Campaign state
 * @returns {Object|null} Victory result or null
 */
const checkSeasonEnd = (campaign) => {
  const seasonLength = campaign.settings?.seasonLengthTurns ?? 0;
  if (!seasonLength || seasonLength <= 0) return null;
  if ((campaign.currentTurn || 0) < seasonLength) return null;

  const vp = calculateTerritoryVP(campaign.territories);
  const spUSA = campaign.combatPowerUSA ?? 0;
  const spCSA = campaign.combatPowerCSA ?? 0;

  const base = {
    type: 'Season End',
    vpUSA: vp.usa,
    vpCSA: vp.csa,
    cpUSA: spUSA,
    cpCSA: spCSA,
    turn: campaign.currentTurn
  };

  if (vp.usa !== vp.csa) {
    const winner = vp.usa > vp.csa ? 'USA' : 'CSA';
    return {
      ...base,
      winner,
      description: `Season ended on turn ${campaign.currentTurn}. ${winner} holds more territory: ${vp.usa} VP vs ${vp.csa} VP.`
    };
  }

  // Territory tied - fall back to who has more supply left.
  if (spUSA !== spCSA) {
    const winner = spUSA > spCSA ? 'USA' : 'CSA';
    return {
      ...base,
      winner,
      description: `Season ended on turn ${campaign.currentTurn} with territory tied at ${vp.usa} VP. ${winner} wins on remaining supply: ${spUSA} SP vs ${spCSA} SP.`
    };
  }

  return {
    ...base,
    winner: 'DRAW',
    description: `Season ended on turn ${campaign.currentTurn} with both sides on ${vp.usa} VP and ${spUSA} SP.`
  };
};

/**
 * Check if campaign has reached end date (December 1865)
 * Winner determined by VP (sum of controlled territory points)
 * Third priority victory condition
 *
 * @param {Object} campaign - Campaign state
 * @returns {Object|null} Victory result or null
 */
const checkDateVictory = (campaign) => {
  // Check if we have a campaign date
  if (!campaign.campaignDate) {
    return null;
  }

  // Get end date from settings or use default
  const endDate = campaign.settings?.campaignEndDate || {
    month: 12,
    year: 1865
  };

  // Check if campaign is over
  if (!isCampaignOver(campaign.campaignDate, endDate)) {
    return null;
  }

  // Calculate VP from controlled territories
  const vpCounts = calculateTerritoryVP(campaign.territories);

  if (vpCounts.usa > vpCounts.csa) {
    return {
      winner: 'USA',
      type: 'Campaign End - Victory Points',
      description: `Campaign ended in ${campaign.campaignDate.displayString}. USA controls ${vpCounts.usa} VP worth of territory vs CSA's ${vpCounts.csa} VP`,
      vpUSA: vpCounts.usa,
      vpCSA: vpCounts.csa,
      date: campaign.campaignDate.displayString
    };
  } else if (vpCounts.csa > vpCounts.usa) {
    return {
      winner: 'CSA',
      type: 'Campaign End - Victory Points',
      description: `Campaign ended in ${campaign.campaignDate.displayString}. CSA controls ${vpCounts.csa} VP worth of territory vs USA's ${vpCounts.usa} VP`,
      vpUSA: vpCounts.usa,
      vpCSA: vpCounts.csa,
      date: campaign.campaignDate.displayString
    };
  } else {
    return {
      winner: 'DRAW',
      type: 'Campaign End - Draw',
      description: `Campaign ended in ${campaign.campaignDate.displayString} with both sides controlling ${vpCounts.usa} VP worth of territory`,
      vpUSA: vpCounts.usa,
      vpCSA: vpCounts.csa,
      date: campaign.campaignDate.displayString
    };
  }
};

/**
 * Calculate total VP from controlled territories
 * Used for date-based victory condition
 * 
 * @param {Array} territories - All campaign territories
 * @returns {Object} VP totals { usa: number, csa: number }
 */
const calculateTerritoryVP = (territories) => {
  let usaVP = 0;
  let csaVP = 0;

  territories.forEach(territory => {
    // Support both pointValue (new) and victoryPoints (old)
    const vpValue = territory.pointValue || territory.victoryPoints || 0;

    if (territory.owner === 'USA') {
      usaVP += vpValue;
    } else if (territory.owner === 'CSA') {
      csaVP += vpValue;
    }
    // NEUTRAL territories contribute no VP
  });

  return { usa: usaVP, csa: csaVP };
};


// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current campaign status summary
 * Useful for displaying campaign progress
 * 
 * @param {Object} campaign - Campaign state
 * @returns {Object} Status summary
 */
export const getCampaignStatus = (campaign) => {
  const useCPSystem = campaign.cpSystemEnabled;
  const territoryVP = calculateTerritoryVP(campaign.territories);
  const usaTerritories = campaign.territories.filter(t => t.owner === 'USA').length;
  const csaTerritories = campaign.territories.filter(t => t.owner === 'CSA').length;
  const neutralTerritories = campaign.territories.filter(t => t.owner === 'NEUTRAL').length;

  const status = {
    turn: campaign.currentTurn,
    totalTerritories: campaign.territories.length,
    territoriesUSA: usaTerritories,
    territoriesCSA: csaTerritories,
    territoriesNeutral: neutralTerritories,
    territoryVPUSA: territoryVP.usa,
    territoryVPCSA: territoryVP.csa
  };

  if (useCPSystem) {
    status.cpUSA = campaign.combatPowerUSA;
    status.cpCSA = campaign.combatPowerCSA;
    status.campaignDate = campaign.campaignDate?.displayString || 'Unknown';
  }

  return status;
};