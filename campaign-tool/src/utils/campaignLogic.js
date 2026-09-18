// Core campaign mechanics and logic
import {
  calculateBattleCPCost
} from './cpSystem';
import { isTerritorySupplied } from './supplyLines';
import {
  getBattleCostMultipliers,
  getEffect,
  shouldHoldFirstLoss,
  spendHoldFirstLoss,
  spendOffenseUse,
  getAttackRange,
} from './doctrines';

/**
 * How many of a region's neighbours a side holds. Used by Interior Lines,
 * which rewards a consolidated front and punishes an overextended one.
 */
export const countFriendlyNeighbours = (territory, territories, side) => {
  if (!territory?.adjacentTerritories || !side) return 0;
  const byId = new Map(territories.map(t => [t.id, t]));
  return territory.adjacentTerritories.reduce(
    (n, id) => n + (byId.get(id)?.owner === side ? 1 : 0), 0);
};

/**
 * Process battle result and update campaign state
 * Handles territory ownership changes and CP system
 *
 * @param {Object} campaign - Current campaign state
 * @param {Object} battle - Battle data to process
 * @param {Object} [options] - { skipCommanderPool } when the commander pool
 *   was already updated for this battle (pending → completed transition)
 * @returns {Object} Updated campaign state
 */
export const processBattleResult = (campaign, battle, options = {}) => {
  const territory = campaign.territories.find(t => t.id === battle.territoryId);
  if (!territory) return campaign;

  // Store previous owner for CP calculations
  const previousOwner = territory.owner;

  // Determine territory-based defender (could be NEUTRAL for territory ownership)
  const territoryDefender = battle.attacker === 'USA' ?
    (previousOwner === 'CSA' ? 'CSA' : 'NEUTRAL') :
    (previousOwner === 'USA' ? 'USA' : 'NEUTRAL');

  // Opposing team is always the other faction (never NEUTRAL) - used for SP tracking
  const opposingTeam = battle.attacker === 'USA' ? 'CSA' : 'USA';

  // === CP SYSTEM PROCESSING (if enabled) ===
  let cpCostAttacker = 0;
  let cpCostDefender = 0;  // Cost for the opposing team (whoever shows up to fight)

  if (campaign.cpSystemEnabled) {
    // Check if manual CP loss was provided
    if (battle.manualCPLoss) {
      // Manual mode: use provided CP values
      cpCostAttacker = battle.manualCPLoss.attacker || 0;
      cpCostDefender = battle.manualCPLoss.defender || 0;
    } else {
      // Auto mode: calculate CP costs
      const attackerCasualties = battle.casualties?.[battle.attacker] || 0;
      const opposingCasualties = battle.casualties?.[opposingTeam] || 0;
      const totalCasualties = attackerCasualties + opposingCasualties;

      // Check if defending territory is isolated (no adjacent friendly territories)
      const isDefenderIsolated = territoryDefender !== 'NEUTRAL' &&
        previousOwner === territoryDefender &&
        !isTerritorySupplied(territory, campaign.territories);

      // Build baseCosts from campaign settings
      const baseCosts = {
        attackEnemy: campaign.settings?.baseAttackCostEnemy ?? 75,
        attackNeutral: campaign.settings?.baseAttackCostNeutral ?? 50,
        defenseFriendly: campaign.settings?.baseDefenseCostFriendly ?? 25,
        defenseNeutral: campaign.settings?.baseDefenseCostNeutral ?? 50
      };

      const cpResult = calculateBattleCPCost({
        territoryPointValue: territory.pointValue || territory.victoryPoints || 10,
        territoryOwner: previousOwner,
        attacker: battle.attacker,
        winner: battle.winner,
        attackerCasualties,
        defenderCasualties: opposingCasualties,
        abilityActive: battle.abilityUsed === battle.attacker,
        isDefenderIsolated,
        baseCosts,
        // Stance-bucketed losses (in formation / skirmish / out of line).
        // Absent on battles recorded before ticket costs existed.
        attackerBuckets: battle.casualtyBuckets?.[battle.attacker] || null,
        defenderBuckets: battle.casualtyBuckets?.[opposingTeam] || null,
        ticketMode: campaign.settings?.ticketCostEnabled === true,
        ticketCostDivisor: campaign.settings?.ticketCostDivisor ?? 100,
        vpCurve: campaign.settings?.vpCurve || 'linear',
        doctrineMultipliers: getBattleCostMultipliers(campaign, {
          attacker: battle.attacker,
          defender: opposingTeam,
          won: battle.winner === battle.attacker,
          held: battle.winner === opposingTeam,
          pointValue: territory.pointValue || territory.victoryPoints || 0,
          friendlyNeighbours: countFriendlyNeighbours(territory, campaign.territories, opposingTeam),
          offenseDeclaredBy: battle.doctrineUsed || null,
        })
      });

      cpCostAttacker = cpResult.attackerLoss;
      cpCostDefender = cpResult.defenderLoss;
    }

    // Validate CP availability (should have been checked in UI, but validate here)
    const attackerCP = battle.attacker === 'USA' ? campaign.combatPowerUSA : campaign.combatPowerCSA;
    const opposingCP = opposingTeam === 'USA' ? campaign.combatPowerUSA : campaign.combatPowerCSA;

    if (attackerCP < cpCostAttacker) {
      console.warn(`Insufficient CP for attacker. Required: ${cpCostAttacker}, Available: ${attackerCP}`);
      cpCostAttacker = Math.max(0, attackerCP);
    }

    if (opposingCP < cpCostDefender) {
      console.warn(`Insufficient CP for defender. Required: ${cpCostDefender}, Available: ${opposingCP}`);
      cpCostDefender = Math.max(0, opposingCP);
    }
  }

  // Calculate VP gained from territory capture (if ownership changed)
  const territoryVP = territory.victoryPoints || territory.pointValue || 0;

  // Handle failed attacks on neutral territories
  const failedNeutralAttackToEnemy = campaign.settings?.failedNeutralAttackToEnemy !== false;
  const usaAbilityActive = battle.abilityUsed === 'USA';
  let finalWinner = battle.winner;

  if (previousOwner === 'NEUTRAL' && battle.winner !== battle.attacker) {
    // Attacker lost against neutral territory
    // Special Orders 191 (USA ability): Failed attacks keep territory neutral
    if (usaAbilityActive && battle.attacker === 'USA') {
      // USA ability active: keep neutral regardless of setting
      finalWinner = 'NEUTRAL';
      battle.winner = 'NEUTRAL';
    } else if (failedNeutralAttackToEnemy) {
      // Setting ON: transfer to enemy
      const enemy = battle.attacker === 'USA' ? 'CSA' : 'USA';
      finalWinner = enemy;
      battle.winner = enemy;
    } else {
      // Setting OFF: keep neutral
      finalWinner = 'NEUTRAL';
      battle.winner = 'NEUTRAL';
    }
  }

  // === DOCTRINE: RAID (Stuart's Ride) ===
  // A raid substitutes for an attack rather than adding one: the region never
  // changes hands, but a successful raid leaves it earning its owner nothing.
  const raidCfg = battle.doctrineUsed === battle.attacker
    ? getEffect(campaign, battle.attacker, 'raid', { offenseDeclared: true })
    : null;
  const isRaid = !!raidCfg;
  if (isRaid) {
    finalWinner = previousOwner;
    battle.winner = battle.winner; // recorded result stands; the ground does not move
    battle.wasRaid = true;
  }

  // === DOCTRINE: IRON BRIGADE ===
  // Once a season, a major region the defender would lose falls NEUTRAL and
  // stays contested instead of flipping to the attacker.
  let holdFirstLossApplied = false;
  if (!isRaid && finalWinner === battle.attacker && previousOwner === opposingTeam
      && shouldHoldFirstLoss(campaign, opposingTeam, territoryVP)) {
    finalWinner = 'NEUTRAL';
    battle.winner = 'NEUTRAL';
    battle.heldByDoctrine = opposingTeam;
    holdFirstLossApplied = true;
  }

  const ownershipChanged = previousOwner !== finalWinner;

  // === CAPTURE BOUNTY ===
  // Seized depots and stores refund part of an attack that actually takes
  // ground, so a successful assault isn't a net loss. Paid at the moment of
  // capture, which is what the transition window delays. Off (0) by default.
  const captureBounty = campaign.settings?.captureBounty ?? 0;
  if (!isRaid && captureBounty > 0 && finalWinner === battle.attacker && ownershipChanged) {
    const bountyVP = territory.pointValue || territory.victoryPoints || 0;
    cpCostAttacker = Math.max(0, cpCostAttacker - Math.round(bountyVP * captureBounty));
  }

  // Update territory ownership
  territory.owner = finalWinner;

  // Create updated campaign
  let updatedCampaign = { ...campaign };

  // === VP CAPTURE SYSTEM ===
  const instantVPGains = campaign.settings?.instantVPGains !== false; // Default to true

  if (ownershipChanged) {
    if (instantVPGains) {
      // INSTANT MODE: Award VP immediately
      battle.victoryPointsAwarded = territoryVP;

      // Clear any existing transition state
      delete territory.transitionState;
    } else {
      // GRADUAL MODE: Enter transition state, no VP awarded yet
      battle.victoryPointsAwarded = 0;
      const transitionTurns = campaign.settings?.captureTransitionTurns || 2;

      // Scorched Earth (defender) lengthens the window; Grand Army Advance
      // (attacker, declared) removes it so the capture consolidates at once.
      const denial = getEffect(campaign, previousOwner, 'captureDenialTurns', {}) || 0;
      const skip = battle.doctrineUsed === battle.attacker
        && getEffect(campaign, battle.attacker, 'skipTransitionOnCapture', { offenseDeclared: true });

      const turns = skip ? 0 : transitionTurns + denial;

      if (turns > 0) {
        territory.transitionState = {
          isTransitioning: true,
          turnsRemaining: turns,
          totalTurns: turns,
          previousOwner: previousOwner,
          capturedOnTurn: battle.turn
        };
      } else {
        battle.victoryPointsAwarded = territoryVP;
        delete territory.transitionState;
      }
    }
  } else if (isRaid && battle.winner === battle.attacker) {
    // The raider won: the ground stays put but earns its owner nothing while
    // the damage is repaired. Reuses the transition window, which already
    // pays neither side any supply or victory points.
    battle.victoryPointsAwarded = 0;
    const denialTurns = raidCfg.denialTurns || 2;
    territory.transitionState = {
      isTransitioning: true,
      turnsRemaining: denialTurns,
      totalTurns: denialTurns,
      previousOwner: previousOwner,
      capturedOnTurn: battle.turn,
      raided: true
    };
  } else {
    // No ownership change (shouldn't happen, but handle it)
    battle.victoryPointsAwarded = 0;
  }

  // === DOCTRINE: FORTIFY THE HEIGHTS ===
  // Holding refunds part of the defender's own bill. Folding refunds nothing,
  // so the doctrine rewards actually holding rather than simply defending.
  const heldDefense = !isRaid && previousOwner === opposingTeam && finalWinner === opposingTeam;
  if (heldDefense) {
    const refund = getEffect(campaign, opposingTeam, 'defenseRefundOnHold', { held: true });
    if (refund > 0) {
      cpCostDefender = Math.max(0, cpCostDefender - Math.round(cpCostDefender * refund));
    }
  }

  // Update battle record with CP data
  battle.cpCostAttacker = cpCostAttacker;
  battle.cpCostDefender = cpCostDefender;
  battle.defender = opposingTeam;

  // === UPDATE VP BASED ON TERRITORY OWNERSHIP ===
  // Recalculate VP totals from all territories
  let usaVP = 0;
  let csaVP = 0;

  campaign.territories.forEach(t => {
    const vp = t.victoryPoints || t.pointValue || 0;

    // Only count VP if:
    // 1. Instant VP mode, OR
    // 2. Gradual mode AND territory is not transitioning
    const shouldCountVP = instantVPGains || !t.transitionState?.isTransitioning;

    if (shouldCountVP) {
      if (t.owner === 'USA') {
        usaVP += vp;
      } else if (t.owner === 'CSA') {
        csaVP += vp;
      }
    }
  });

  updatedCampaign.victoryPointsUSA = usaVP;
  updatedCampaign.victoryPointsCSA = csaVP;

  // === DEDUCT CP (if enabled) ===
  if (campaign.cpSystemEnabled) {
    // Deduct attacker CP
    if (battle.attacker === 'USA') {
      updatedCampaign.combatPowerUSA = Math.max(0, campaign.combatPowerUSA - cpCostAttacker);
    } else {
      updatedCampaign.combatPowerCSA = Math.max(0, campaign.combatPowerCSA - cpCostAttacker);
    }

    // Deduct opposing team CP (they always show up to fight)
    if (opposingTeam === 'USA') {
      updatedCampaign.combatPowerUSA = Math.max(0, campaign.combatPowerUSA - cpCostDefender);
    } else {
      updatedCampaign.combatPowerCSA = Math.max(0, campaign.combatPowerCSA - cpCostDefender);
    }

    // Add CP history entries
    const cpHistory = [...(campaign.cpHistory || [])];

    // Attacker CP history
    cpHistory.push({
      turn: battle.turn,
      date: battle.date,
      action: `Battle: ${territory.name} (Attacker)`,
      side: battle.attacker,
      cpChange: -cpCostAttacker,
      newBalance: battle.attacker === 'USA' ? updatedCampaign.combatPowerUSA : updatedCampaign.combatPowerCSA,
      battleId: battle.id
    });

    // Defender CP history (opposing team always has SP costs)
    cpHistory.push({
      turn: battle.turn,
      date: battle.date,
      action: `Battle: ${territory.name} (Defender)`,
      side: opposingTeam,
      cpChange: -cpCostDefender,
      newBalance: opposingTeam === 'USA' ? updatedCampaign.combatPowerUSA : updatedCampaign.combatPowerCSA,
      battleId: battle.id
    });

    updatedCampaign.cpHistory = cpHistory;
  }

  // Add to battle history
  updatedCampaign.battles = [...campaign.battles, battle];

  // Update territory capture history
  if (!territory.captureHistory) {
    territory.captureHistory = [];
  }
  territory.captureHistory.push({
    turn: battle.turn,
    owner: battle.winner,
    battleId: battle.id
  });

  // === HANDLE ABILITY COOLDOWN ===
  if (battle.abilityUsed) {
    const abilityCooldown = campaign.settings?.abilityCooldown || 2;

    // Ensure abilities object exists in updatedCampaign
    if (!updatedCampaign.abilities) {
      updatedCampaign.abilities = {
        USA: { name: 'Special Orders 191', cooldown: 0, lastUsedTurn: null },
        CSA: { name: 'Valley Supply Lines', cooldown: 0, lastUsedTurn: null }
      };
    }

    // Set cooldown for the ability that was used
    updatedCampaign.abilities[battle.abilityUsed] = {
      ...updatedCampaign.abilities[battle.abilityUsed],
      cooldown: abilityCooldown,
      lastUsedTurn: battle.turn
    };
  }

  // === HANDLE COMMANDER SYSTEM ===
  if (battle.commanders) {
    // Initialize regiment structures if needed
    if (!updatedCampaign.regimentStats) {
      updatedCampaign.regimentStats = {};
    }
    if (!updatedCampaign.commanderPool) {
      updatedCampaign.commanderPool = { USA: [], CSA: [] };
    }

    // Calculate VP change for each side
    const vpGainedUSA = ownershipChanged && battle.winner === 'USA' ? territoryVP : 0;
    const vpGainedCSA = ownershipChanged && battle.winner === 'CSA' ? territoryVP : 0;
    const vpLostUSA = ownershipChanged && previousOwner === 'USA' ? territoryVP : 0;
    const vpLostCSA = ownershipChanged && previousOwner === 'CSA' ? territoryVP : 0;

    // Process each side's commander
    ['USA', 'CSA'].forEach(side => {
      const commander = battle.commanders[side];
      if (!commander) return;

      const regimentId = commander.id;

      // Initialize stats for this regiment if needed
      if (!updatedCampaign.regimentStats[regimentId]) {
        updatedCampaign.regimentStats[regimentId] = {
          wins: 0,
          losses: 0,
          casualties: 0,
          spLost: 0,
          vpGained: 0,
          vpLost: 0,
          battles: []
        };
      }

      const stats = updatedCampaign.regimentStats[regimentId];
      const isWinner = battle.winner === side;
      const sideCasualties = battle.casualties?.[side] || 0;
      const sideSpLost = side === battle.attacker ? cpCostAttacker : cpCostDefender;
      const sideVpGained = side === 'USA' ? vpGainedUSA : vpGainedCSA;
      const sideVpLost = side === 'USA' ? vpLostUSA : vpLostCSA;

      // Update stats
      if (isWinner) {
        stats.wins += 1;
      } else {
        stats.losses += 1;
      }
      stats.casualties += sideCasualties;
      stats.spLost += sideSpLost;
      stats.vpGained += sideVpGained;
      stats.vpLost += sideVpLost;

      // Add battle to regiment history
      stats.battles.push({
        battleId: battle.id,
        turn: battle.turn,
        territoryName: territory.name,
        mapName: battle.mapName,
        role: side === battle.attacker ? 'Attacker' : 'Defender',
        won: isWinner,
        casualties: sideCasualties,
        spLost: sideSpLost,
        vpGained: sideVpGained,
        vpLost: sideVpLost
      });

    });

    // A battle first saved as pending already took its commanders out of the
    // pool; completing it later must not charge the pool twice.
    if (!options.skipCommanderPool) {
      updatedCampaign = applyCommanderPoolUpdate(updatedCampaign, battle);
    }
  }

  // === DOCTRINE BOOKKEEPING ===
  // Spend the active use only once the battle actually resolves, and burn the
  // Iron Brigade charge only on the loss it saved.
  if (battle.doctrineUsed) {
    updatedCampaign = spendOffenseUse(updatedCampaign, battle.doctrineUsed);
  }
  if (holdFirstLossApplied) {
    updatedCampaign = spendHoldFirstLoss(updatedCampaign, opposingTeam);
  }

  return updatedCampaign;
};

/**
 * Regiments a side may still be drawn from.
 * An empty pool is the "everyone is available" state used by fresh campaigns.
 *
 * The benched regiment — the one whose turn emptied the pool and triggered a
 * refill — is skipped so nobody leads two battles running. It is only held
 * back while there is somebody else to draw.
 *
 * @param {Array} regiments - One side's regiments ([{ id, name }])
 * @param {Array} pool - One side's commander pool (regiment IDs)
 * @param {Object|null} benched - Regiment sitting out this draw ({ id, name })
 * @returns {Array} Regiments still eligible to command
 */
export const getAvailableCommanders = (regiments, pool, benched = null) => {
  const all = regiments || [];
  const ids = pool || [];
  const inPool = ids.length === 0 ? all : all.filter(r => ids.includes(r.id));

  if (!benched) return inPool;
  const eligible = inPool.filter(r => r.id !== benched.id);
  return eligible.length > 0 ? eligible : inPool;
};

/**
 * Reserve (or clear) the commander who will lead a side in its next battle.
 *
 * Reserving withdraws the regiment from the pool right away — a commander
 * rolled on the campaign map is off the board even before the battle is
 * recorded. Any previously reserved regiment goes back into the pool so
 * re-rolling never loses a name.
 *
 * @param {Object} campaign - Current campaign state
 * @param {'USA'|'CSA'} side - Side to reserve for
 * @param {Object|null} regiment - Regiment ({ id, name }) or null to clear
 * @returns {Object} Updated campaign state
 */
export const reserveCommander = (campaign, side, regiment) => {
  const regiments = campaign.regiments?.[side] || [];
  let pool = [...(campaign.commanderPool?.[side] || [])];
  const previous = campaign.pendingCommanders?.[side] || null;
  let benched = campaign.benchedCommanders?.[side] || null;

  // Release the previously reserved regiment back into the pool.
  if (previous && previous.id !== regiment?.id) {
    if (benched?.id === previous.id) {
      // That reservation is what emptied the pool and triggered the refill,
      // so undo it whole — bench included — rather than leaving the rotation
      // reset by a roll that never happened.
      pool = [...(benched.restorePool || pool)];
      benched = null;
    } else if (!pool.includes(previous.id) && regiments.some(r => r.id === previous.id)) {
      pool.push(previous.id);
    }
  }

  let nextPool = pool;
  if (regiment) {
    nextPool = pool.filter(id => id !== regiment.id);

    if (nextPool.length === 0 && regiments.length > 0) {
      // Everyone has had a turn. Refill with the whole roster — including
      // whoever just drew — but bench them for one draw so they can't lead
      // back-to-back. With a single regiment there's nobody else to bench for.
      nextPool = regiments.map(r => r.id);
      benched = regiments.length > 1
        ? { id: regiment.id, name: regiment.name, restorePool: [...pool] }
        : null;
    } else {
      // A new commander is up, so the previous bench has been served.
      benched = null;
    }
  }

  return {
    ...campaign,
    commanderPool: {
      ...(campaign.commanderPool || { USA: [], CSA: [] }),
      [side]: nextPool
    },
    pendingCommanders: {
      ...(campaign.pendingCommanders || { USA: null, CSA: null }),
      [side]: regiment ? { id: regiment.id, name: regiment.name } : null
    },
    benchedCommanders: {
      ...(campaign.benchedCommanders || { USA: null, CSA: null }),
      [side]: benched
    }
  };
};

/**
 * Remove selected commanders from the pool and refresh the pool if empty.
 * Called for both pending and completed battles.
 *
 * Commanders rolled ahead of time on the campaign map are already out of the
 * pool, so recording their battle only releases the reservation. A battle
 * fought by someone *other* than the reserved commander withdraws whoever
 * actually led and puts the reserved regiment back into rotation.
 *
 * @param {Object} campaign - Current campaign state
 * @param {Object} battle - Battle data (only battle.commanders is used)
 * @returns {Object} Updated campaign state
 */
export const applyCommanderPoolUpdate = (campaign, battle) => {
  if (!battle.commanders) return campaign;

  let updated = campaign;

  ['USA', 'CSA'].forEach(side => {
    const commander = battle.commanders[side];
    if (!commander) return;

    const reserved = updated.pendingCommanders?.[side];
    if (!reserved || reserved.id !== commander.id) {
      updated = reserveCommander(updated, side, commander);
    }

    // The reservation was consumed by this battle.
    updated = {
      ...updated,
      pendingCommanders: {
        ...(updated.pendingCommanders || { USA: null, CSA: null }),
        [side]: null
      }
    };
  });

  return updated;
};

/**
 * How many steps each region sits from a side's own territory.
 * 1 means it borders their line. Used for doctrine attack reach.
 */
export const getDistanceFromLine = (campaign, side) => {
  const byId = new Map(campaign.territories.map(t => [t.id, t]));
  const dist = new Map();
  const queue = [];

  for (const t of campaign.territories) {
    if (t.owner === side) { dist.set(t.id, 0); queue.push(t.id); }
  }

  while (queue.length) {
    const id = queue.shift();
    const d = dist.get(id);
    for (const nid of byId.get(id)?.adjacentTerritories || []) {
      if (!dist.has(nid)) { dist.set(nid, d + 1); queue.push(nid); }
    }
  }
  return dist;
};

/**
 * May this side attack this region?
 *
 * Plain adjacency by default. A declared offensive doctrine can extend the
 * reach - Foot Cavalry to two steps, Stuart's Ride to three, Anaconda Plan to
 * anywhere with water access - which is what `doctrineDeclared` selects.
 *
 * @param {Object} campaign
 * @param {string} territoryId
 * @param {'USA'|'CSA'} attacker
 * @param {Object} [opts] - { doctrineDeclared } when the side is spending a use
 */
export const canAttackTerritory = (campaign, territoryId, attacker, opts = {}) => {
  const territory = campaign.territories.find(t => t.id === territoryId);
  if (!territory) return false;

  // Can't attack your own ground.
  if (territory.owner === attacker) return false;

  if (!campaign.settings?.requireAdjacentAttack) return true;

  const range = opts.doctrineDeclared
    ? getAttackRange(campaign, attacker, {
        isWaterAccess: !!territory.hasWaterAccess,
        pointValue: territory.pointValue || territory.victoryPoints || 0,
      })
    : 1;

  if (!isFinite(range)) return true; // Anaconda Plan against a water region

  const dist = getDistanceFromLine(campaign, attacker).get(territory.id);
  return dist !== undefined && dist <= range;
};

export const calculateVictoryPoints = (campaign) => {
  let usaVP = 0;
  let csaVP = 0;

  // VP from territory ownership only
  campaign.territories.forEach(territory => {
    const vp = territory.victoryPoints || territory.pointValue || 0;
    if (territory.owner === 'USA') {
      usaVP += vp;
    } else if (territory.owner === 'CSA') {
      csaVP += vp;
    }
  });

  return { usaVP, csaVP };
};

export const getTerritoryStats = (campaign) => {
  const stats = {
    USA: { count: 0, totalVP: 0, capitals: 0 },
    CSA: { count: 0, totalVP: 0, capitals: 0 },
    NEUTRAL: { count: 0, totalVP: 0, capitals: 0 }
  };

  campaign.territories.forEach(territory => {
    const owner = territory.owner;
    stats[owner].count++;
    stats[owner].totalVP += territory.victoryPoints;
    if (territory.isCapital) {
      stats[owner].capitals++;
    }
  });

  return stats;
};

/**
 * Process territory capture transitions at turn end
 * Decrements transition timers and awards VP when complete
 *
 * @param {Object} campaign - Current campaign state
 * @returns {Object} Updated campaign with progressed transitions
 */
export const processTransitioningTerritories = (campaign) => {
  const instantVPGains = campaign.settings?.instantVPGains !== false;

  // If instant VP mode, no transitions to process
  if (instantVPGains) {
    return campaign;
  }

  const updatedCampaign = { ...campaign };
  const transitionEvents = [];
  let vpChanges = { USA: 0, CSA: 0 };

  // Process each territory's transition state
  campaign.territories.forEach(territory => {
    if (territory.transitionState?.isTransitioning) {
      const transition = territory.transitionState;

      // Decrement turns remaining
      transition.turnsRemaining -= 1;

      // Check if transition is complete
      if (transition.turnsRemaining <= 0) {
        // Award VP to the current owner
        const territoryVP = territory.victoryPoints || territory.pointValue || 0;

        if (territory.owner === 'USA') {
          vpChanges.USA += territoryVP;
        } else if (territory.owner === 'CSA') {
          vpChanges.CSA += territoryVP;
        }

        // Log transition completion
        transitionEvents.push({
          territoryId: territory.id,
          territoryName: territory.name,
          owner: territory.owner,
          vpAwarded: territoryVP,
          turn: campaign.currentTurn
        });

        // Clear transition state
        delete territory.transitionState;
      }
    }
  });

  // Recalculate VP totals
  let usaVP = 0;
  let csaVP = 0;

  campaign.territories.forEach(t => {
    const vp = t.victoryPoints || t.pointValue || 0;
    const shouldCountVP = !t.transitionState?.isTransitioning;

    if (shouldCountVP) {
      if (t.owner === 'USA') {
        usaVP += vp;
      } else if (t.owner === 'CSA') {
        csaVP += vp;
      }
    }
  });

  updatedCampaign.victoryPointsUSA = usaVP;
  updatedCampaign.victoryPointsCSA = csaVP;

  // Store transition events for logging/history
  if (transitionEvents.length > 0) {
    updatedCampaign.lastTransitionEvents = transitionEvents;
  }

  return updatedCampaign;
};