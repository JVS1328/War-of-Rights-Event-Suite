import {
  isTerritorySupplied,
  ISOLATED_DEFENSE_MULTIPLIER
} from './supplyLines';

/**
 * Combat Power (CP) System Utilities
 * Based on Rising Storm 2: Vietnam mechanics
 *
 * This module provides CP cost calculation functions for the campaign system.
 * CP costs are based on territory VP value, casualties, and battle outcomes.
 */

// ============================================================================
// CONSTANTS - CP Cost Base Values
// ============================================================================

/**
 * Base CP cost for attacking a neutral territory (before VP multiplier)
 */
export const BASE_ATTACK_COST_NEUTRAL = 50;

/**
 * Base CP cost for attacking an enemy territory (before VP multiplier)
 */
export const BASE_ATTACK_COST_ENEMY = 75;

/**
 * Base CP cost for defending a neutral territory (before VP multiplier)
 */
export const BASE_DEFENSE_COST_NEUTRAL = 50;

/**
 * @deprecated BASE_DEFENSE_COST is replaced by BASE_DEFENSE_COST_FRIENDLY and BASE_DEFENSE_COST_NEUTRAL
 * Kept for backward compatibility
 */
export const BASE_DEFENSE_COST = 25;

/**
 * @deprecated DEFENDER_MAX_LOSS is no longer used - defender CP loss is now proportional like attacker
 * Kept for backward compatibility with any code that references it
 */
export const DEFENDER_MAX_LOSS = {
  NEUTRAL: 50,
  FRIENDLY: 25
};

/**
 * Base VP value for 1x multiplier
 * VP multipliers are calculated as: pointValue / VP_BASE
 * With rebalanced VP scale (1-5), minimum VP gets 1x multiplier.
 * Examples: 1 VP = 1x, 2 VP = 2x, 3 VP = 3x, 5 VP = 5x
 */
export const VP_BASE = 1;

/**
 * Default starting CP for both sides (legacy casualty-ratio scale)
 */
export const DEFAULT_STARTING_CP = 500;

// ============================================================================
// TICKET-WEIGHTED LOSSES
// ============================================================================

/**
 * Per-stance ticket weights, matching the War of Rights scoring rules and the
 * log analyzer's TICKET_WEIGHT (see log-analyzer/src/stats/labels.ts).
 * A death in formation costs the team 1 ticket, skirmishing 3, out of line 5.
 */
export const TICKET_WEIGHT = { inForm: 1, skirm: 3, oob: 5 };

/**
 * Converts raw ticket damage into SP. Base costs stay on their familiar
 * 25-75 scale and are read as "SP per 100 tickets", so the existing
 * attacker/defender and neutral/friendly relationships carry over unchanged.
 */
export const TICKET_COST_DIVISOR = 100;

/**
 * Starting SP when ticket costs are enabled. Ticket damage runs roughly 20-25x
 * larger than the old casualty-ratio costs, so the pool scales with it.
 * Derived from ~2 battles/side/turn at ~3,300 SP each against income of
 * ~2,600/turn, giving a ~10 turn season. Recalibrate once real avgTd data
 * from live battles is available - see CAMPAIGN_BALANCE_AUDIT_S1.md Part 4.
 */
export const DEFAULT_STARTING_CP_TICKETS = 40000;

/**
 * SP generated per point of territory value per turn when ticket costs are on.
 */
export const DEFAULT_INCOME_PER_VP = 20;

/**
 * SP refunded to the attacker per point of captured territory - seized depots
 * and stores. Sized to offset roughly half a typical attack: both the bounty
 * and the attack cost scale with point value, so the ratio stays near 50%
 * from a 1-point county up to a 7-point capital.
 *
 * Note this cannot by itself make attacking and defending an even choice.
 * With the attacker paying 75 per 100 tickets against the defender's 25, the
 * bounty needed to close that gap would make a successful attack free. What
 * actually balances the decision is the league rule that the attacker, not the
 * defender, picks which frontline region gets fought over.
 */
export const DEFAULT_CAPTURE_BOUNTY = 600;

/**
 * Turns in a season before the campaign resolves on territory VP.
 */
export const DEFAULT_SEASON_LENGTH_TURNS = 10;

/**
 * Total ticket damage from stance-bucketed casualties: 1*IF + 3*Skirm + 5*OoL.
 * Additive across units, so a side's total is the sum of its regiments'.
 *
 * @param {number} inForm - Deaths in formation
 * @param {number} skirm - Deaths while skirmishing
 * @param {number} oob - Deaths out of line
 * @returns {number} Weighted ticket damage
 */
export function ticketDamage(inForm = 0, skirm = 0, oob = 0) {
  return TICKET_WEIGHT.inForm * (inForm || 0)
    + TICKET_WEIGHT.skirm * (skirm || 0)
    + TICKET_WEIGHT.oob * (oob || 0);
}

/**
 * Resolve a side's ticket damage from whatever the battle record carries.
 *
 * Battles recorded with stance buckets use them directly. Older battles only
 * have a total casualty count, so every death is treated as in-formation
 * (weight 1) - the most conservative reading, and it keeps a legacy battle
 * from silently costing nothing on the ticket scale.
 *
 * @param {Object|null} buckets - { inForm, skirm, oob } or null
 * @param {number} totalCasualties - Fallback total when buckets are absent
 * @returns {number} Ticket damage
 */
export function resolveTicketDamage(buckets, totalCasualties = 0) {
  if (buckets && (buckets.inForm || buckets.skirm || buckets.oob)) {
    return ticketDamage(buckets.inForm, buckets.skirm, buckets.oob);
  }
  return Math.max(0, totalCasualties || 0);
}

/**
 * Average ticket cost per death - the ×Td figure from the log analyzer.
 * Ranges 1.0 (everyone held formation) to 5.0 (everyone died out of line).
 *
 * @param {Object|null} buckets - { inForm, skirm, oob }
 * @returns {number|null} Average ticket cost, or null when there are no deaths
 */
export function avgTicketCost(buckets) {
  if (!buckets) return null;
  const total = (buckets.inForm || 0) + (buckets.skirm || 0) + (buckets.oob || 0);
  if (total <= 0) return null;
  return ticketDamage(buckets.inForm, buckets.skirm, buckets.oob) / total;
}

// ============================================================================
// CP COST CALCULATION FUNCTIONS
// ============================================================================

/**
 * Get VP multiplier for a territory based on its point value
 * Calculates multiplier dynamically: pointValue / vpBase
 *
 * @param {number} pointValue - Territory point value (any positive number)
 * @param {number} vpBase - Base VP value for 1x multiplier (default: VP_BASE constant)
 * @returns {number} VP multiplier
 * @throws {Error} If territory point value is invalid
 */
export function getVPMultiplier(pointValue, vpBase = VP_BASE, curve = 'linear') {
  if (typeof pointValue !== 'number' || pointValue <= 0) {
    throw new Error(`Invalid territory point value: ${pointValue}. Must be a positive number.`);
  }

  const scaled = pointValue / vpBase;

  // Compressed curve: halves the slope above the base value, so a 7-point
  // capital costs 4x a 1-point county rather than 7x. Keeps capitals the
  // priciest ground on the board without letting one battle end a season.
  if (curve === 'compressed') {
    return 1 + (scaled - 1) * 0.5;
  }

  return scaled;
}

/**
 * Calculate CP loss for attacker based on casualties and territory ownership
 * Formula: BASE_ATTACK_COST * vpMultiplier * (casualties / totalCasualties)
 * Base cost is 50 for neutral territories, 75 for enemy territories (configurable)
 * Maximum possible: BASE_ATTACK_COST * vpMultiplier
 *
 * @param {number} pointValue - Territory point value (any positive number)
 * @param {number} casualties - Attacker casualties
 * @param {number} totalCasualties - Total casualties in the battle (both sides)
 * @param {boolean} isNeutralTerritory - Whether attacking neutral (true) or enemy (false) territory
 * @param {number} vpBase - Base VP value for 1x multiplier (from campaign settings)
 * @param {Object} baseCosts - Optional custom base costs { attackNeutral, attackEnemy }
 * @returns {number} CP loss (rounded to nearest integer)
 */
export function calculateAttackerCPLoss(pointValue, casualties, totalCasualties, isNeutralTerritory = false, vpBase = VP_BASE, baseCosts = {}, options = {}) {
  // Validate inputs
  if (typeof pointValue !== 'number' || pointValue <= 0) {
    throw new Error(`Invalid territory point value: ${pointValue}. Must be a positive number.`);
  }

  if (typeof casualties !== 'number' || casualties < 0) {
    throw new Error(`Invalid casualties: ${casualties}`);
  }

  if (typeof totalCasualties !== 'number' || totalCasualties < 0) {
    throw new Error(`Invalid total casualties: ${totalCasualties}`);
  }

  // Handle edge case of zero casualties
  if (totalCasualties === 0) {
    return 0;
  }

  // Determine base cost based on territory ownership (use custom values if provided)
  const attackNeutral = baseCosts.attackNeutral ?? BASE_ATTACK_COST_NEUTRAL;
  const attackEnemy = baseCosts.attackEnemy ?? BASE_ATTACK_COST_ENEMY;
  const baseCost = isNeutralTerritory ? attackNeutral : attackEnemy;

  const vpMultiplier = getVPMultiplier(pointValue, vpBase, options.vpCurve);

  // Ticket mode: cost scales with the weighted ticket damage this side took,
  // so how your men died drives the bill rather than just how many.
  if (options.ticketMode) {
    const divisor = options.ticketCostDivisor ?? TICKET_COST_DIVISOR;
    const tickets = resolveTicketDamage(options.buckets, casualties);
    return Math.round(tickets * vpMultiplier * (baseCost / divisor));
  }

  // Legacy mode: proportional share of a fixed maximum.
  const maxLoss = baseCost * vpMultiplier;
  const casualtyRatio = Math.min(1, casualties / totalCasualties);
  const cpLoss = maxLoss * casualtyRatio;

  return Math.round(cpLoss);
}

/**
 * Calculate CP loss for defender based on casualties
 *
 * Formula: BASE_DEFENSE_COST * vpMultiplier * (casualties / totalCasualties) * isolationMultiplier
 * Base cost is 25 for friendly territories, 50 for neutral territories (configurable)
 * Isolated territories (no adjacent friendly territories) cost 2x to defend
 * Proportional to casualties taken - the more casualties you take, the more CP you lose
 *
 * @param {number} pointValue - Territory point value (any positive number)
 * @param {number} casualties - Defender casualties
 * @param {number} totalCasualties - Total casualties in the battle (both sides)
 * @param {boolean} defenderWon - Whether the defender won the battle (no longer affects calculation)
 * @param {boolean} isFriendlyTerritory - Whether defending friendly (true) or neutral (false) territory
 * @param {number} vpBase - Base VP value for 1x multiplier (from campaign settings)
 * @param {boolean} isIsolated - Whether the territory is isolated from supply lines
 * @param {Object} baseCosts - Optional custom base costs { defenseFriendly, defenseNeutral }
 * @returns {number} CP loss (rounded to nearest integer)
 */
export function calculateDefenderCPLoss(pointValue, casualties, totalCasualties, defenderWon, isFriendlyTerritory, vpBase = VP_BASE, isIsolated = false, baseCosts = {}, options = {}) {
  // Validate inputs
  if (typeof pointValue !== 'number' || pointValue <= 0) {
    throw new Error(`Invalid territory point value: ${pointValue}. Must be a positive number.`);
  }

  if (typeof casualties !== 'number' || casualties < 0) {
    throw new Error(`Invalid casualties: ${casualties}`);
  }

  if (typeof totalCasualties !== 'number' || totalCasualties < 0) {
    throw new Error(`Invalid total casualties: ${totalCasualties}`);
  }

  // Handle edge case of zero casualties
  if (totalCasualties === 0) {
    return 0;
  }

  // Determine base cost based on territory ownership (use custom values if provided)
  const defenseFriendly = baseCosts.defenseFriendly ?? BASE_DEFENSE_COST;
  const defenseNeutral = baseCosts.defenseNeutral ?? BASE_DEFENSE_COST_NEUTRAL;
  const baseCost = isFriendlyTerritory ? defenseFriendly : defenseNeutral;

  // Apply isolation multiplier (2x for isolated territories)
  const isolationMultiplier = isIsolated ? ISOLATED_DEFENSE_MULTIPLIER : 1;

  const vpMultiplier = getVPMultiplier(pointValue, vpBase, options.vpCurve);

  // Ticket mode - see calculateAttackerCPLoss.
  if (options.ticketMode) {
    const divisor = options.ticketCostDivisor ?? TICKET_COST_DIVISOR;
    const tickets = resolveTicketDamage(options.buckets, casualties);
    return Math.round(tickets * vpMultiplier * isolationMultiplier * (baseCost / divisor));
  }

  // Legacy mode: proportional share of a fixed maximum.
  const maxLoss = baseCost * vpMultiplier * isolationMultiplier;
  const casualtyRatio = Math.min(1, casualties / totalCasualties);
  const cpLoss = maxLoss * casualtyRatio;

  return Math.round(cpLoss);
}

/**
 * Calculate CP losses for both sides in a battle
 * This is the main function to use for battle CP calculations
 *
 * @param {Object} params - Battle parameters
 * @param {number} params.territoryPointValue - Territory VP value (5, 10, or 15)
 * @param {string} params.territoryOwner - Current territory owner ('USA', 'CSA', or 'NEUTRAL')
 * @param {string} params.attacker - Attacking side ('USA' or 'CSA')
 * @param {string} params.winner - Battle winner ('USA' or 'CSA')
 * @param {number} params.attackerCasualties - Attacker casualties
 * @param {number} params.defenderCasualties - Defender casualties
 * @param {boolean} params.abilityActive - Whether the attacker's ability is active
 * @param {number} params.vpBase - Base VP value for 1x multiplier
 * @param {boolean} params.isDefenderIsolated - Whether the defending territory is isolated
 * @param {Object} params.baseCosts - Custom base costs { attackNeutral, attackEnemy, defenseFriendly, defenseNeutral }
 * @returns {Object} { attackerLoss: number, defenderLoss: number, defender: string }
 */
export function calculateBattleCPCost({
  territoryPointValue,
  territoryOwner,
  attacker,
  winner,
  attackerCasualties,
  defenderCasualties,
  abilityActive = false,
  vpBase = VP_BASE,
  isDefenderIsolated = false,
  baseCosts = {},
  attackerBuckets = null,
  defenderBuckets = null,
  ticketMode = false,
  ticketCostDivisor = TICKET_COST_DIVISOR,
  vpCurve = 'linear'
}) {
  // Determine defender (the side that is NOT attacking)
  // For neutral territories, the defender is the opposing side
  const defender = attacker === 'USA' ? 'CSA' : 'USA';

  const totalCasualties = attackerCasualties + defenderCasualties;

  // Determine if attacking neutral territory
  const isNeutralTerritory = territoryOwner === 'NEUTRAL';

  const sharedOptions = { ticketMode, ticketCostDivisor, vpCurve };

  // Calculate attacker CP loss (based on casualties and territory ownership)
  let attackerLoss = calculateAttackerCPLoss(
    territoryPointValue,
    attackerCasualties,
    totalCasualties,
    isNeutralTerritory,
    vpBase,
    baseCosts,
    { ...sharedOptions, buckets: attackerBuckets }
  );

  // Apply CSA ability: "Valley Supply Lines" - reduces attack CP loss by 50%
  if (abilityActive && attacker === 'CSA') {
    attackerLoss = Math.round(attackerLoss * 0.5);
  }

  // Calculate defender CP loss (if not NEUTRAL)
  let defenderLoss = 0;
  if (defender !== 'NEUTRAL') {
    const defenderWon = winner !== attacker;
    const isFriendlyTerritory = territoryOwner === defender;

    defenderLoss = calculateDefenderCPLoss(
      territoryPointValue,
      defenderCasualties,
      totalCasualties,
      defenderWon,
      isFriendlyTerritory,
      vpBase,
      isDefenderIsolated,
      baseCosts,
      { ...sharedOptions, buckets: defenderBuckets }
    );

    // Apply USA ability: "Special Orders 191" - triples CSA CP loss on attacker victory
    if (abilityActive && attacker === 'USA' && winner === 'USA' && defender === 'CSA') {
      defenderLoss = Math.round(defenderLoss * 3);
    }
  }

  return {
    attackerLoss,
    defenderLoss,
    defender
  };
}

/**
 * Check if a side can afford a battle based on CP cost
 * 
 * @param {Object} side - Side object with CP pool
 * @param {number} side.combatPower - Current CP pool
 * @param {number} cpCost - CP cost of the battle
 * @returns {boolean} True if side can afford the battle
 */
export function canAffordBattle(side, cpCost) {
  if (!side || typeof side.combatPower !== 'number') {
    throw new Error('Invalid side object');
  }
  
  if (typeof cpCost !== 'number' || cpCost < 0) {
    throw new Error(`Invalid CP cost: ${cpCost}`);
  }
  
  return side.combatPower >= cpCost;
}

/**
 * Calculate CP generation for both sides based on controlled territories
 * Isolated territories (not connected to friendly supply lines) generate 0 CP
 *
 * @param {Array} territories - Array of all territories
 * @returns {Object} CP generation for each side { usa: number, csa: number, isolatedUSA: Territory[], isolatedCSA: Territory[] }
 */
export function calculateCPGeneration(territories, incomePerVP = 1) {
  if (!Array.isArray(territories)) {
    throw new Error('Territories must be an array');
  }

  let usaCP = 0;
  let csaCP = 0;
  const isolatedUSA = [];
  const isolatedCSA = [];

  territories.forEach(territory => {
    const cpValue = (territory.pointValue || territory.victoryPoints || 0) * incomePerVP;

    if (territory.owner === 'USA') {
      if (isTerritorySupplied(territory, territories)) {
        usaCP += cpValue;
      } else {
        isolatedUSA.push(territory);
      }
    } else if (territory.owner === 'CSA') {
      if (isTerritorySupplied(territory, territories)) {
        csaCP += cpValue;
      } else {
        isolatedCSA.push(territory);
      }
    }
    // NEUTRAL territories generate no CP
  });

  return { usa: usaCP, csa: csaCP, isolatedUSA, isolatedCSA };
}

/**
 * Validate territory point value
 *
 * @param {number} pointValue - Point value to validate
 * @returns {boolean} True if valid
 */
export function isValidPointValue(pointValue) {
  return typeof pointValue === 'number' && pointValue > 0;
}

/**
 * Get maximum possible CP losses for a battle (for display purposes)
 *
 * @param {number} territoryPointValue - Territory VP value (any positive number)
 * @param {string} territoryOwner - Current territory owner
 * @param {string} defender - Defending side
 * @param {number} vpBase - Base VP value for 1x multiplier (from campaign settings)
 * @param {boolean} isDefenderIsolated - Whether the defending territory is isolated
 * @param {Object} baseCosts - Custom base costs { attackNeutral, attackEnemy, defenseFriendly, defenseNeutral }
 * @returns {Object} { attackerMax: number, defenderMax: number }
 */
export function getMaxBattleCPCosts(territoryPointValue, territoryOwner, defender, vpBase = VP_BASE, isDefenderIsolated = false, baseCosts = {}, options = {}) {
  const vpMultiplier = getVPMultiplier(territoryPointValue, vpBase, options.vpCurve);

  // Ticket mode has no ceiling - cost rises with ticket damage taken. The
  // comparable figure is the rate, so quote SP per PER_TICKETS of damage.
  const ticketMode = !!options.ticketMode;
  const perTickets = options.perTickets ?? 1000;
  const divisor = options.ticketCostDivisor ?? TICKET_COST_DIVISOR;
  const scale = ticketMode ? (perTickets / divisor) : 1;

  // Determine attacker max based on territory ownership (use custom values if provided)
  const isNeutralTerritory = territoryOwner === 'NEUTRAL';
  const attackNeutral = baseCosts.attackNeutral ?? BASE_ATTACK_COST_NEUTRAL;
  const attackEnemy = baseCosts.attackEnemy ?? BASE_ATTACK_COST_ENEMY;
  const attackerBaseCost = isNeutralTerritory ? attackNeutral : attackEnemy;
  const attackerMax = Math.round(attackerBaseCost * vpMultiplier * scale);

  // Defender max based on whether defending friendly or neutral territory
  // Isolated territories cost 2x to defend
  let defenderMax = 0;
  if (defender !== 'NEUTRAL') {
    const isFriendlyTerritory = territoryOwner === defender;
    const defenseFriendly = baseCosts.defenseFriendly ?? BASE_DEFENSE_COST;
    const defenseNeutral = baseCosts.defenseNeutral ?? BASE_DEFENSE_COST_NEUTRAL;
    const defenderBaseCost = isFriendlyTerritory ? defenseFriendly : defenseNeutral;
    const isolationMultiplier = isDefenderIsolated ? ISOLATED_DEFENSE_MULTIPLIER : 1;
    defenderMax = Math.round(defenderBaseCost * vpMultiplier * isolationMultiplier * scale);
  }

  return { attackerMax, defenderMax, ticketMode, perTickets };
}