import { useState, useEffect } from 'react';
import {
  calculateBattleCPCost,
  getMaxBattleCPCosts,
  getVPMultiplier
} from '../utils/cpSystem';
import {
  getAvailableMapsForTerritory,
  getMapCooldownMessage,
  selectMapsForPickBan,
  resolveTerrainMaps,
  rollTerrainType
} from '../utils/mapSelection';
import {
  rollWeatherCondition,
  rollTimeCondition,
  WEATHER_CONDITIONS,
  TIME_CONDITIONS,
  DEFAULT_WEATHER_WEIGHTS,
  DEFAULT_TIME_WEIGHTS
} from '../utils/battleConditions';
import { isTerritorySupplied } from '../utils/supplyLines';
import { countFriendlyNeighbours } from '../utils/campaignLogic';
import { useSpinRoll } from '../utils/useSpinRoll';
import { getDoctrine } from '../data/doctrines';
import { getUsesRemaining, getBattleCostMultipliers } from '../utils/doctrines';
import CommanderSpinner from './CommanderSpinner';
import { Modal, Row, Tag, SIDE_TEXT } from './ui/Primitives';

const BattleRecorder = ({ territories, currentTurn, onRecordBattle, onUpdateBattle, onClose, campaign, editingBattle, initialTerritoryId, onReserveCommander }) => {
  const isEditMode = !!editingBattle;

  const [selectedMap, setSelectedMap] = useState(editingBattle?.mapName || '');
  const [selectedTerritory, setSelectedTerritory] = useState(editingBattle?.territoryId || initialTerritoryId || '');
  const [attacker, setAttacker] = useState(editingBattle?.attacker || 'USA');
  const [winner, setWinner] = useState(editingBattle?.winner || '');
  const [casualties, setCasualties] = useState(editingBattle?.casualties || { USA: 0, CSA: 0 });
  const [notes, setNotes] = useState(editingBattle?.notes || '');

  // Ticket-weighted losses: deaths bucketed by the stance they happened in.
  // A death in formation costs 1 ticket, skirmishing 3, out of line 5, so the
  // supply bill reflects how a side fought and not just how many it lost.
  const ticketMode = campaign?.settings?.ticketCostEnabled === true;

  // Battles recorded before stance buckets existed only carry a total. Seed
  // that total into "in formation", matching the engine's fallback of reading
  // an unclassified death as 1 ticket, so editing one doesn't zero it out.
  const seedBuckets = (side) => {
    const saved = editingBattle?.casualtyBuckets?.[side];
    if (saved) {
      return { inForm: saved.inForm || 0, skirm: saved.skirm || 0, oob: saved.oob || 0 };
    }
    return { inForm: parseInt(editingBattle?.casualties?.[side]) || 0, skirm: 0, oob: 0 };
  };

  const [casualtyBuckets, setCasualtyBuckets] = useState({
    USA: seedBuckets('USA'),
    CSA: seedBuckets('CSA')
  });

  // Total casualties are the sum of the three stance buckets, so the total
  // field is derived rather than typed whenever ticket mode is on.
  const updateBucket = (side, key, rawValue) => {
    const value = Math.max(0, parseInt(rawValue) || 0);
    const next = { ...casualtyBuckets[side], [key]: value };
    setCasualtyBuckets({ ...casualtyBuckets, [side]: next });
    setCasualties(prev => ({ ...prev, [side]: next.inForm + next.skirm + next.oob }));
  };

  const bucketTotal = (side) => {
    const b = casualtyBuckets[side];
    return (b.inForm || 0) + (b.skirm || 0) + (b.oob || 0);
  };

  // ×Td — average ticket cost per death, 1.0 (all in formation) to 5.0 (all
  // out of line). The same figure the log analyzer reports per unit.
  const avgTd = (side) => {
    const total = bucketTotal(side);
    if (total <= 0) return null;
    const b = casualtyBuckets[side];
    return ((b.inForm || 0) + 3 * (b.skirm || 0) + 5 * (b.oob || 0)) / total;
  };

  // Battle conditions state (separate weather and time)
  const [weatherResult, setWeatherResult] = useState(
    editingBattle?.conditions?.weather
      ? { condition: WEATHER_CONDITIONS[editingBattle.conditions.weather] || { id: editingBattle.conditions.weather, name: editingBattle.conditions.weather, description: '' }, weight: 0, total: 0 }
      : null
  );
  const [timeResult, setTimeResult] = useState(
    editingBattle?.conditions?.time
      ? { condition: TIME_CONDITIONS[editingBattle.conditions.time] || { id: editingBattle.conditions.time, name: editingBattle.conditions.time, description: '' }, weight: 0, total: 0 }
      : null
  );

  // Commander selection state. New battles inherit whoever was rolled on the
  // campaign map (they're already reserved out of the pool).
  const [inheritedCommanders] = useState(() => {
    const pending = campaign?.pendingCommanders || { USA: null, CSA: null };
    return isEditMode
      ? { USA: null, CSA: null }
      : { USA: pending.USA || null, CSA: pending.CSA || null };
  });
  const [selectedCommanders, setSelectedCommanders] = useState(
    editingBattle?.commanders || { ...inheritedCommanders }
  );
  // Sides still showing the commander that was rolled on the map.
  const preRolledSides = ['USA', 'CSA'].filter(
    side => inheritedCommanders[side] && selectedCommanders[side]?.id === inheritedCommanders[side].id
  );

  // Team ability state (legacy, pre-doctrine campaigns)
  const [abilityActive, setAbilityActive] = useState(editingBattle?.abilityUsed ? true : false);

  // Season doctrine. The drafted offensive doctrine replaces the old fixed
  // ability; declaring it on a battle spends one of its season uses.
  const [doctrineActive, setDoctrineActive] = useState(!!editingBattle?.doctrineUsed);
  const draftedOffense = getDoctrine(campaign?.doctrines?.[attacker]?.offense);
  const doctrineUsesLeft = getUsesRemaining(campaign, attacker);

  // Manual CP loss state
  const [manualCPLoss, setManualCPLoss] = useState(editingBattle?.manualCPLoss || { attacker: 0, defender: 0 });

  // Roll animations. Each roll decides its result up front and the hook just
  // flickers through the faces before settling on it.
  const terrainRoll = useSpinRoll();
  const weatherRoll = useSpinRoll();
  const timeRoll = useSpinRoll();

  const terrainSpinning = terrainRoll.spinning;
  const terrainDisplayName = terrainRoll.display;

  // Reset ability and pick/ban when attacker changes
  useEffect(() => {
    setAbilityActive(false);
    setDoctrineActive(false);
    // Reset pick/ban since defender (who bans first) changes with attacker
    if (pickBanMaps.length > 0 && bannedMaps.length > 0) {
      setBannedMaps([]);
      setPickBanActive(true);
      setSelectedMap('');
    }
  }, [attacker]);

  // Initialize abilities if they don't exist (for backward compatibility)
  const abilities = campaign?.abilities || {
    USA: { name: 'Special Orders 191', cooldown: 0, lastUsedTurn: null },
    CSA: { name: 'Valley Supply Lines', cooldown: 0, lastUsedTurn: null }
  };

  // Map selection with cooldown enforcement
  const [availableMaps, setAvailableMaps] = useState([]);
  const [cooldownMaps, setCooldownMaps] = useState(new Map());
  const [allTerritoryMaps, setAllTerritoryMaps] = useState([]);

  // Pick/ban state
  const [pickBanMaps, setPickBanMaps] = useState([]); // 5 maps for pick/ban
  const [bannedMaps, setBannedMaps] = useState([]); // Maps that have been banned
  const [pickBanActive, setPickBanActive] = useState(false); // Whether pick/ban is in progress

  // Terrain roll state
  const [terrainRollResult, setTerrainRollResult] = useState(
    editingBattle?.terrainType ? { terrainType: editingBattle.terrainType, roll: 0, total: 0 } : null
  );
  const [needsTerrainRoll, setNeedsTerrainRoll] = useState(false);

  // CP cost estimation
  const [estimatedCPCost, setEstimatedCPCost] = useState({ attacker: 0, defender: 0 });
  const [maxCPCost, setMaxCPCost] = useState({ attacker: 0, defender: 0 });
  const [cpWarning, setCpWarning] = useState('');
  const [cpBlockingError, setCpBlockingError] = useState('');

  // Check if manual CP mode is enabled
  const isManualCPMode = campaign?.settings?.cpCalculationMode === 'manual';

  // Resolve maps and initialize pick/ban for a given territory + optional rolled terrain
  const initializeMaps = (territory, rolledTerrainType = null) => {
    const terrainGroups = campaign?.settings?.terrainGroups || {};

    const territoryMaps = resolveTerrainMaps(territory, terrainGroups, rolledTerrainType);
    setAllTerritoryMaps(territoryMaps);

    // Build cooldown-filtered list using the resolved maps
    const { availableMaps: available, cooldownMaps: cooldown } = getAvailableMapsForTerritory(
      // Pass a virtual territory with the resolved maps so cooldown filtering works
      { ...territory, maps: territoryMaps },
      campaign?.battles || [],
      currentTurn,
      {}, // terrainGroups already resolved above
      campaign?.settings?.mapCooldownTurns ?? 2
    );

    setAvailableMaps(available);
    setCooldownMaps(cooldown);

    // In edit mode, keep the existing map selection and skip pick/ban setup
    if (isEditMode && editingBattle?.mapName) {
      setPickBanMaps([]);
      setBannedMaps([]);
      setPickBanActive(false);
      return;
    }

    // Determine pick/ban pool size: 5 (5+), 3 (3-4), 2 (2), auto-select (1), none (0)
    let poolSize = 0;
    if (available.length >= 5) poolSize = 5;
    else if (available.length >= 3) poolSize = 3;
    else if (available.length === 2) poolSize = 2;

    if (poolSize >= 2) {
      setPickBanMaps(selectMapsForPickBan(available, poolSize));
      setBannedMaps([]);
      setPickBanActive(true);
      setSelectedMap('');
    } else if (available.length === 1) {
      setPickBanMaps([]);
      setBannedMaps([]);
      setPickBanActive(false);
      setSelectedMap(available[0]);
    } else {
      setPickBanMaps([]);
      setBannedMaps([]);
      setPickBanActive(false);
      setSelectedMap('');
    }
  };

  // Calculate available maps when territory changes
  useEffect(() => {
    if (!selectedTerritory) {
      setAvailableMaps([]);
      setCooldownMaps(new Map());
      setAllTerritoryMaps([]);
      if (!isEditMode) setSelectedMap('');
      setPickBanMaps([]);
      setBannedMaps([]);
      setPickBanActive(false);
      setNeedsTerrainRoll(false);
      setTerrainRollResult(null);
      return;
    }

    const territory = territories.find(t => t.id === selectedTerritory);
    if (!territory) return;

    // Check if this territory uses weighted terrain rolls
    const hasWeights = territory.terrainWeights && Object.keys(territory.terrainWeights).length > 0;
    if (hasWeights) {
      // In edit mode with an existing terrain type, use it directly
      if (isEditMode && editingBattle?.terrainType) {
        setNeedsTerrainRoll(true);
        initializeMaps(territory, editingBattle.terrainType);
        return;
      }
      // Pause for terrain roll - don't resolve maps yet
      setNeedsTerrainRoll(true);
      setTerrainRollResult(null);
      setAvailableMaps([]);
      setAllTerritoryMaps([]);
      setPickBanMaps([]);
      setBannedMaps([]);
      setPickBanActive(false);
      if (!isEditMode) setSelectedMap('');
      return;
    }

    // No weights - resolve maps directly
    setNeedsTerrainRoll(false);
    setTerrainRollResult(null);
    initializeMaps(territory);
  }, [selectedTerritory, territories, campaign, currentTurn]);

  // Handle terrain type roll with spinning animation
  const handleTerrainRoll = () => {
    const territory = territories.find(t => t.id === selectedTerritory);
    if (!territory?.terrainWeights || terrainRoll.spinning) return;

    const terrainTypes = Object.keys(territory.terrainWeights);
    if (terrainTypes.length === 0) return;

    // Decide the result first; the animation only reveals it.
    const result = rollTerrainType(territory.terrainWeights);
    setTerrainRollResult(null);

    terrainRoll.spin(terrainTypes, result.terrainType, () => {
      setTerrainRollResult(result);
      initializeMaps(territory, result.terrainType);
    });
  };

  const handleTerrainManualSelect = (terrainType) => {
    const territory = territories.find(t => t.id === selectedTerritory);
    if (!territory) return;
    const result = { terrainType, roll: 0, total: 0 };
    setTerrainRollResult(result);
    terrainRoll.setDisplay(terrainType);
    initializeMaps(territory, terrainType);
  };

  // Calculate estimated CP cost whenever relevant fields change (only in auto mode)
  useEffect(() => {
    if (!selectedTerritory || !campaign?.cpSystemEnabled || isManualCPMode) {
      setEstimatedCPCost({ attacker: 0, defender: 0 });
      setMaxCPCost({ attacker: 0, defender: 0 });
      setCpWarning('');
      setCpBlockingError('');
      return;
    }

    const territory = territories.find(t => t.id === selectedTerritory);
    if (!territory) return;

    // Determine defender - the opposing team always defends, even on neutral ground
    const defender = attacker === 'USA' ? 'CSA' : 'USA';

    // Get casualties
    const attackerCasualties = parseInt(casualties[attacker]) || 0;
    const defenderCasualties = parseInt(casualties[defender === 'USA' ? 'USA' : 'CSA']) || 0;

    const territoryPointValue = territory.pointValue || territory.victoryPoints || 10;

    // Get vpBase from campaign settings (default to 1 for backward compatibility)
    const vpBase = campaign?.settings?.vpBase || 1;

    // Build baseCosts object from campaign settings
    const baseCosts = {
      attackEnemy: campaign?.settings?.baseAttackCostEnemy ?? 75,
      attackNeutral: campaign?.settings?.baseAttackCostNeutral ?? 50,
      defenseFriendly: campaign?.settings?.baseDefenseCostFriendly ?? 25,
      defenseNeutral: campaign?.settings?.baseDefenseCostNeutral ?? 50
    };

    // Check if defending territory is isolated (no adjacent friendly territories)
    // Only applies when defender owns the territory
    const isDefenderIsolated = territory.owner === defender &&
      !isTerritorySupplied(territory, territories);

    const ticketOptions = {
      ticketMode,
      ticketCostDivisor: campaign?.settings?.ticketCostDivisor ?? 100,
      vpCurve: campaign?.settings?.vpCurve || 'linear'
    };

    // In ticket mode this is a rate (SP per 1,000 ticket damage) rather than a
    // ceiling, since cost rises with the damage taken and has no upper bound.
    const maxCosts = getMaxBattleCPCosts(territoryPointValue, territory.owner, defender, vpBase, isDefenderIsolated, baseCosts, ticketOptions);
    setMaxCPCost({ attacker: maxCosts.attackerMax, defender: maxCosts.defenderMax });

    // Calculate estimated CP costs using the new system
    const cpResult = calculateBattleCPCost({
      territoryPointValue,
      territoryOwner: territory.owner,
      attacker: attacker,
      winner: winner || attacker,
      attackerCasualties,
      defenderCasualties,
      abilityActive: abilityActive,
      vpBase: vpBase,
      isDefenderIsolated,
      baseCosts,
      attackerBuckets: ticketMode ? casualtyBuckets[attacker] : null,
      defenderBuckets: ticketMode ? casualtyBuckets[defender] : null,
      ...ticketOptions,
      // Preview the drafted doctrines exactly as processBattleResult will
      // apply them, including the one being declared on this battle.
      doctrineMultipliers: getBattleCostMultipliers(campaign, {
        attacker,
        defender,
        won: (winner || attacker) === attacker,
        held: (winner || attacker) === defender,
        pointValue: territoryPointValue,
        friendlyNeighbours: countFriendlyNeighbours(territory, territories, defender),
        offenseDeclaredBy: doctrineActive ? attacker : null,
      })
    });

    setEstimatedCPCost({ attacker: cpResult.attackerLoss, defender: cpResult.defenderLoss });

    // Check CP availability
    const attackerCP = attacker === 'USA' ? campaign.combatPowerUSA : campaign.combatPowerCSA;
    const defenderCP = defender === 'USA' ? campaign.combatPowerUSA :
                       defender === 'CSA' ? campaign.combatPowerCSA : 0;

    // BLOCKING ERROR: Check if attacker can afford maximum possible CP loss.
    // Ticket mode has no ceiling to check against - maxCosts is a rate there -
    // so only the estimate-based warnings below apply.
    if (!ticketMode && attackerCP < maxCosts.attackerMax) {
      setCpBlockingError(`Attack impossible! ${attacker} needs ${maxCosts.attackerMax} SP to attack this territory but only has ${attackerCP} SP available.`);
      setCpWarning('');
    } else {
      setCpBlockingError('');
      
      // Non-blocking warnings for estimated costs
      if (attackerCP < cpResult.attackerLoss) {
        setCpWarning(`Warning: Estimated SP cost (${cpResult.attackerLoss}) exceeds available SP (${attackerCP})`);
      } else if (defender !== 'NEUTRAL' && defenderCP < cpResult.defenderLoss) {
        setCpWarning(`Warning: ${defender} has insufficient SP. Required: ${cpResult.defenderLoss}, Available: ${defenderCP}`);
      } else {
        setCpWarning('');
      }
    }
  }, [selectedTerritory, attacker, winner, casualties, casualtyBuckets, territories, campaign, abilityActive, doctrineActive, isManualCPMode]);

  // Validate manual CP loss inputs
  useEffect(() => {
    if (!campaign?.cpSystemEnabled || !isManualCPMode || !selectedTerritory) {
      return;
    }

    const attackerCP = attacker === 'USA' ? campaign.combatPowerUSA : campaign.combatPowerCSA;
    const territory = territories.find(t => t.id === selectedTerritory);
    // Defender is always the opposing team, even on neutral ground
    const defender = attacker === 'USA' ? 'CSA' : 'USA';
    const defenderCP = defender === 'USA' ? campaign.combatPowerUSA : campaign.combatPowerCSA;

    const attackerLoss = parseInt(manualCPLoss.attacker) || 0;
    const defenderLoss = parseInt(manualCPLoss.defender) || 0;

    // Check if attacker can afford the specified CP loss
    if (attackerCP < attackerLoss) {
      setCpBlockingError(`Attack impossible! ${attacker} needs ${attackerLoss} SP but only has ${attackerCP} SP available.`);
      setCpWarning('');
    } else {
      setCpBlockingError('');
      
      // Non-blocking warning for defender
      if (defender !== 'NEUTRAL' && defenderCP < defenderLoss) {
        setCpWarning(`Warning: ${defender} has insufficient SP. Required: ${defenderLoss}, Available: ${defenderCP}`);
      } else {
        setCpWarning('');
      }
    }
  }, [manualCPLoss, selectedTerritory, attacker, campaign, territories, isManualCPMode]);

  // Pick/ban logic
  const defender = attacker === 'USA' ? 'CSA' : 'USA';
  const remainingMaps = pickBanMaps.filter(m => !bannedMaps.includes(m));

  // Ban order: Defender, Attacker, Defender, Attacker (4 bans total)
  const getBanningTeam = () => {
    const banCount = bannedMaps.length;
    return banCount % 2 === 0 ? defender : attacker;
  };

  const handleBan = (mapName) => {
    if (!pickBanActive || bannedMaps.includes(mapName)) return;

    const newBannedMaps = [...bannedMaps, mapName];
    setBannedMaps(newBannedMaps);

    // Auto-select when only 1 map remains
    if (newBannedMaps.length === pickBanMaps.length - 1) {
      const finalMap = pickBanMaps.find(m => !newBannedMaps.includes(m));
      setSelectedMap(finalMap);
      setPickBanActive(false);
    }
  };

  // Handle commander selection from spinner
  const handleCommanderSelect = (side, regiment) => {
    setSelectedCommanders(prev => ({ ...prev, [side]: regiment }));

    // Keep the campaign-level reservation in step so the pool shown here and
    // on the campaign map agree. Editing an old battle must not disturb it.
    if (!isEditMode && onReserveCommander) {
      onReserveCommander(side, regiment);
    }
  };

  const handleSubmit = () => {
    if (!selectedMap || !selectedTerritory) {
      alert('Please select a territory and map');
      return;
    }

    const isPending = !winner;

    // Only enforce CP checks for completed battles (with a winner)
    if (!isPending) {
      // HARD BLOCK: Prevent battle if attacker cannot afford maximum possible CP loss
      if (campaign?.cpSystemEnabled && cpBlockingError) {
        alert(cpBlockingError);
        return;
      }

      // Non-blocking warning for estimated costs
      if (campaign?.cpSystemEnabled && cpWarning) {
        if (!confirm(`${cpWarning}\n\nProceed anyway? (Battle will use available SP)`)) {
          return;
        }
      }
    }

    const battle = {
      id: isEditMode ? editingBattle.id : Date.now().toString(),
      turn: isEditMode ? editingBattle.turn : currentTurn,
      date: isEditMode ? editingBattle.date : new Date().toISOString(),
      territoryId: selectedTerritory,
      mapName: selectedMap,
      attacker,
      winner: winner || null,
      status: isPending ? 'pending' : 'completed',
      casualties: {
        USA: ticketMode ? bucketTotal('USA') : (parseInt(casualties.USA) || 0),
        CSA: ticketMode ? bucketTotal('CSA') : (parseInt(casualties.CSA) || 0)
      },
      // Stance buckets are stored alongside the total so past battles stay
      // auditable and can be recosted if the ticket weights are retuned.
      casualtyBuckets: ticketMode ? {
        USA: { ...casualtyBuckets.USA },
        CSA: { ...casualtyBuckets.CSA }
      } : (editingBattle?.casualtyBuckets || undefined),
      notes: notes.trim(),
      abilityUsed: abilityActive ? attacker : null,
      doctrineUsed: doctrineActive && draftedOffense ? attacker : null,
      manualCPLoss: isManualCPMode ? {
        attacker: parseInt(manualCPLoss.attacker) || 0,
        defender: parseInt(manualCPLoss.defender) || 0
      } : undefined,
      terrainType: terrainRollResult?.terrainType || (isEditMode ? editingBattle.terrainType : null),
      conditions: (weatherResult || timeResult) ? {
        weather: weatherResult?.condition?.id || null,
        weatherRoll: 0,
        time: timeResult?.condition?.id || null,
        timeRoll: 0
      } : (isEditMode ? editingBattle.conditions : null),
      commanders: {
        USA: selectedCommanders.USA ? { id: selectedCommanders.USA.id, name: selectedCommanders.USA.name } : null,
        CSA: selectedCommanders.CSA ? { id: selectedCommanders.CSA.id, name: selectedCommanders.CSA.name } : null
      }
    };

    if (isEditMode) {
      onUpdateBattle(battle);
    } else {
      onRecordBattle(battle);
    }
  };

  // The three stance buckets, in the order the ticket weights run.
  const STANCES = [
    { key: 'inForm', label: 'In formation', weight: 1 },
    { key: 'skirm', label: 'Skirmishing', weight: 3 },
    { key: 'oob', label: 'Out of line', weight: 5 },
  ];

  const territory = territories.find(t => t.id === selectedTerritory) || null;
  const blocked = winner && campaign?.cpSystemEnabled && cpBlockingError;

  /** A probability strip: the bar, then the odds spelled out underneath. */
  const oddsStrip = (entries, chosenKey) => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    return (
      <>
        <div className="ui-bar">
          {entries.map(([key, weight]) => (
            <i
              key={key}
              style={{ flex: weight }}
              className={chosenKey === key ? 'bg-ink' : 'bg-paper-3'}
            />
          ))}
        </div>
        <div className="ui-hint mt-1">
          {entries.map(([key, weight], i) => (
            <span key={key}>
              {i > 0 && <span className="text-ink-3"> · </span>}
              <span className={chosenKey === key ? 'not-italic font-bold text-ink' : undefined}>
                {key} {total > 0 ? Math.round((weight / total) * 100) : 0}%
              </span>
            </span>
          ))}
        </div>
      </>
    );
  };

  /** The reel a roll settles into: ruled, filled, the result set in ink. */
  const reel = (spinning, display, result, placeholder) => (
    <div className="mt-2 border border-rule bg-paper-2 px-3 py-3 text-center">
      {spinning ? (
        <div className="font-display text-lg font-bold animate-pulse">{display || '…'}</div>
      ) : result ? (
        result
      ) : (
        <div className="ui-hint">{placeholder}</div>
      )}
    </div>
  );

  return (
    <Modal
      title={isEditMode ? 'Edit a battle' : 'Record a battle'}
      subtitle={`Turn ${isEditMode ? editingBattle.turn : currentTurn} — leave the winner blank to file the engagement as pending.`}
      width="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={handleSubmit}
            disabled={blocked}
            className={`ui-btn flex-1 ${blocked ? 'ui-btn-danger' : 'ui-btn-primary'}`}
          >
            {!winner
              ? (isEditMode ? 'Update as pending' : 'Save as pending')
              : isEditMode
                ? 'Update battle'
                : blocked
                  ? 'Attack blocked — insufficient SP'
                  : campaign?.cpSystemEnabled && cpWarning
                    ? 'Record battle (warning)'
                    : 'Record battle'}
          </button>
          <button onClick={onClose} className="ui-btn flex-1">
            Cancel
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ---------- The ground ---------- */}
        <div>
          <label className="ui-label">
            Territory <span className="text-mark">*</span>
          </label>
          <select
            value={selectedTerritory}
            onChange={(e) => setSelectedTerritory(e.target.value)}
            className="ui-field"
          >
            <option value="">Select territory…</option>
            {territories.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.owner}) — {t.victoryPoints} VP
              </option>
            ))}
          </select>
        </div>

        {territory && (() => {
          const adjacentIds = territory.adjacentTerritories || [];
          const neighbours = adjacentIds
            .map(id => territories.find(t => t.id === id))
            .filter(Boolean);
          const isSupplied = territory.owner === 'NEUTRAL'
            ? null
            : isTerritorySupplied(territory, territories);

          return (
            <div className="ui-box">
              <div className="ui-eyebrow mb-1.5">The ground</div>
              <Row label="Territory" value={territory.name} />
              <Row
                label="Held by"
                value={<span className={SIDE_TEXT[territory.owner]}>{territory.owner}</span>}
              />
              <Row label="Victory points" value={territory.victoryPoints} />
              <Row label="Maps on the ground" value={allTerritoryMaps.length} />
              {isSupplied !== null && (
                <Row
                  label="Supply"
                  value={isSupplied
                    ? <span className="text-good">Supplied</span>
                    : <Tag tone="mark">Encircled — double defence</Tag>}
                />
              )}

              <div className="mt-2">
                <div className="ui-eyebrow mb-1">
                  Borders — {neighbours.length} of {adjacentIds.length} on the roll
                </div>
                {neighbours.length > 0 ? (
                  <div className="text-ink-2 text-sm">
                    {neighbours.map((adj, i) => (
                      <span key={adj.id}>
                        {i > 0 && <span className="text-ink-3"> · </span>}
                        <span className={SIDE_TEXT[adj.owner]}>{adj.name}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="ui-hint">
                    {adjacentIds.length > 0
                      ? `Not found on the roll: ${adjacentIds.join(', ')}`
                      : 'No adjacencies defined for this territory'}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ---------- Attacker ---------- */}
        <div>
          <div className="ui-label">Attacker</div>
          <div className="ui-segment">
            {['USA', 'CSA'].map(side => (
              <button
                key={side}
                onClick={() => setAttacker(side)}
                data-active={attacker === side}
                data-side={side}
              >
                {side}
              </button>
            ))}
          </div>
        </div>

        {/* ---------- Season doctrine, or the legacy standing order ---------- */}
        {draftedOffense ? (
          <div className="ui-box">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="ui-eyebrow">{attacker} offensive doctrine</div>
                <div className="font-bold">{draftedOffense.name}</div>
                <div className="ui-hint">{draftedOffense.rules}</div>
              </div>
              <Tag tone={doctrineUsesLeft > 0 ? 'neutral' : 'mark'}>
                {doctrineUsesLeft} use{doctrineUsesLeft === 1 ? '' : 's'} left
              </Tag>
            </div>

            <button
              onClick={() => setDoctrineActive(!doctrineActive)}
              disabled={doctrineUsesLeft <= 0 && !doctrineActive}
              className={`ui-btn ui-btn-block mt-3 ${doctrineActive ? 'ui-btn-primary' : ''}`}
            >
              {doctrineActive ? `${draftedOffense.name} declared` : 'Declare doctrine'}
            </button>

            {doctrineActive && (
              <p className="ui-hint mt-2">
                Spends one use when this battle is saved.
                {draftedOffense.action === 'substitute' && ' This replaces the attack — the region does not change hands.'}
              </p>
            )}
            {doctrineUsesLeft <= 0 && !doctrineActive && (
              <p className="ui-hint mt-2">No uses left this season.</p>
            )}
          </div>
        ) : (
          <div className="ui-box">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="ui-eyebrow">{attacker} standing order</div>
                <div className="font-bold">{abilities[attacker]?.name}</div>
                <div className="ui-hint">
                  {attacker === 'USA'
                    ? 'Failed attacks keep territory neutral, wins triple CSA SP loss'
                    : 'Reduces attack SP loss by 50%'}
                </div>
              </div>
              {abilities[attacker]?.cooldown > 0 && (
                <Tag tone="mark">{abilities[attacker].cooldown} turns to recover</Tag>
              )}
            </div>

            <button
              onClick={() => setAbilityActive(!abilityActive)}
              disabled={abilities[attacker]?.cooldown > 0}
              className={`ui-btn ui-btn-block mt-3 ${abilityActive ? 'ui-btn-primary' : ''}`}
            >
              {abilityActive ? 'Ability declared' : 'Use ability'}
            </button>

            {abilityActive && (
              <p className="ui-hint mt-2">The ability is spent on this battle.</p>
            )}
          </div>
        )}

        {/* ---------- Terrain roll ---------- */}
        {needsTerrainRoll && territory?.terrainWeights && (() => {
          const weights = territory.terrainWeights;
          const entries = Object.entries(weights);

          return (
            <div className="ui-box">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="ui-eyebrow">Terrain</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTerrainRoll}
                    disabled={terrainSpinning}
                    className="ui-btn ui-btn-sm"
                  >
                    {terrainSpinning ? 'Rolling…' : terrainRollResult ? 'Re-roll' : 'Roll'}
                  </button>
                  {!terrainSpinning && (
                    <select
                      value={terrainRollResult?.terrainType || ''}
                      onChange={(e) => handleTerrainManualSelect(e.target.value)}
                      className="ui-field w-auto py-1 text-sm"
                    >
                      <option value="" disabled>Pick</option>
                      {Object.keys(weights).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {oddsStrip(entries, terrainRollResult?.terrainType)}

              {reel(
                terrainSpinning,
                terrainDisplayName,
                terrainRollResult ? (
                  <>
                    <div className="font-display text-lg font-bold">
                      {terrainRollResult.terrainType}
                    </div>
                    <div className="ui-hint">{availableMaps.length} maps available</div>
                  </>
                ) : null,
                'Roll to determine the terrain for this battle'
              )}
            </div>
          );
        })()}

        {/* ---------- Map ---------- */}
        <div>
          <div className="ui-label">
            Map <span className="text-mark">*</span>
          </div>

          {/* Pick and ban, whenever the pool holds two or more */}
          {selectedTerritory && pickBanMaps.length >= 2 && (
            <div className="ui-box">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="ui-eyebrow">Pick and ban — {pickBanMaps.length} maps</div>
                {pickBanActive ? (
                  <Tag tone={getBanningTeam()}>
                    {getBanningTeam()} bans · {bannedMaps.length + 1} of {pickBanMaps.length - 1}
                  </Tag>
                ) : selectedMap ? (
                  <Tag tone="good">Map settled</Tag>
                ) : null}
              </div>

              {pickBanActive && (
                <p className="ui-hint mt-0.5">
                  {defender}, defending, bans first. Click a map to strike it out.
                </p>
              )}

              <div className="mt-2">
                {pickBanMaps.map((mapName) => {
                  const isBanned = bannedMaps.includes(mapName);
                  const isSelected = selectedMap === mapName;
                  const banIndex = bannedMaps.indexOf(mapName);
                  const bannedBy = banIndex >= 0
                    ? (banIndex % 2 === 0 ? defender : attacker)
                    : null;

                  return (
                    <button
                      key={mapName}
                      onClick={() => handleBan(mapName)}
                      disabled={!pickBanActive || isBanned}
                      className="flex w-full items-baseline justify-between gap-3 border-b border-paper-3 py-1.5 text-left last:border-b-0 enabled:hover:bg-paper-2 disabled:cursor-default"
                    >
                      <span className={
                        isBanned ? 'line-through text-ink-3'
                          : isSelected ? 'font-bold'
                            : 'text-ink'
                      }>
                        {mapName}
                      </span>
                      {isBanned && <Tag tone={bannedBy}>Banned by {bannedBy}</Tag>}
                      {isSelected && (
                        <span className="flex items-baseline gap-2.5 whitespace-nowrap">
                          <Tag tone="good">Playing</Tag>
                          <Tag tone={attacker}>{attacker} atk</Tag>
                          <Tag tone={defender}>{defender} def</Tag>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {pickBanActive && (
                <div className="ui-bar mt-2">
                  {Array.from({ length: pickBanMaps.length - 1 }, (_, i) => {
                    const banner = i % 2 === 0 ? defender : attacker;
                    return (
                      <i
                        key={i}
                        className={`flex-1 ${
                          i < bannedMaps.length
                            ? (banner === 'USA' ? 'bg-union' : 'bg-rebel')
                            : 'bg-paper-2'
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* No pick and ban: pick from what is left */}
          {selectedTerritory && pickBanMaps.length === 0 && !selectedMap && (
            <select
              value={selectedMap}
              onChange={(e) => setSelectedMap(e.target.value)}
              className="ui-field"
            >
              <option value="">Select map… ({availableMaps.length} available)</option>
              {availableMaps.map(map => (
                <option key={map} value={map}>{map}</option>
              ))}
            </select>
          )}

          {/* Only one map on the ground — settled without a ban */}
          {selectedTerritory && pickBanMaps.length === 0 && selectedMap && (
            <div className="ui-box">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="ui-eyebrow">The only map on this ground</div>
                <Tag tone="good">Settled</Tag>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{selectedMap}</span>
                <span className="flex items-baseline gap-2.5 whitespace-nowrap">
                  <Tag tone={attacker}>{attacker} atk</Tag>
                  <Tag tone={defender}>{defender} def</Tag>
                </span>
              </div>
            </div>
          )}

          {!selectedTerritory && (
            <select disabled className="ui-field opacity-50 cursor-not-allowed">
              <option>Select a territory first…</option>
            </select>
          )}

          {/* Maps resting, campaign-wide */}
          {selectedTerritory && cooldownMaps.size > 0 && (
            <div className="mt-3">
              <div className="ui-eyebrow mb-1">
                Maps resting, campaign-wide — {cooldownMaps.size}
              </div>
              <div className="ui-scroll max-h-32">
                {Array.from(cooldownMaps.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([mapName]) => (
                    <div
                      key={mapName}
                      className="flex items-baseline justify-between gap-3 border-b border-paper-3 py-1 text-[13px]"
                    >
                      <span className="truncate text-ink-2">{mapName}</span>
                      <span className="whitespace-nowrap text-mark">
                        {getMapCooldownMessage(mapName, cooldownMaps, currentTurn, campaign?.settings?.mapCooldownTurns ?? 2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ---------- Battle conditions ---------- */}
        <div className="ui-box">
          <div className="ui-eyebrow mb-2">Battle conditions</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {/* Weather */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="ui-label mb-0">Weather</span>
                <button
                  onClick={() => {
                    if (weatherRoll.spinning) return;
                    const result = rollWeatherCondition(campaign?.settings?.weatherWeights);
                    setWeatherResult(null);
                    weatherRoll.spin(
                      Object.values(WEATHER_CONDITIONS).map(c => c.name),
                      result.condition.name,
                      () => setWeatherResult(result)
                    );
                  }}
                  disabled={weatherRoll.spinning}
                  className="ui-btn ui-btn-sm"
                >
                  {weatherRoll.spinning ? 'Rolling…' : weatherResult ? 'Re-roll' : 'Roll'}
                </button>
              </div>

              {(() => {
                const weights = campaign?.settings?.weatherWeights || DEFAULT_WEATHER_WEIGHTS;
                const entries = Object.entries(weights)
                  .filter(([, w]) => w > 0)
                  .map(([id, w]) => [WEATHER_CONDITIONS[id]?.name || id, w]);
                const chosen = weatherResult
                  ? (WEATHER_CONDITIONS[weatherResult.condition.id]?.name || weatherResult.condition.id)
                  : null;
                return oddsStrip(entries, chosen);
              })()}

              {reel(
                weatherRoll.spinning,
                weatherRoll.display,
                weatherResult ? (
                  <>
                    <div className="font-bold">{weatherResult.condition.name}</div>
                    <div className="ui-hint">{weatherResult.condition.description}</div>
                  </>
                ) : null,
                'Roll to determine the weather'
              )}
            </div>

            {/* Time of day */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="ui-label mb-0">Time of day</span>
                <button
                  onClick={() => {
                    if (timeRoll.spinning) return;
                    const result = rollTimeCondition(campaign?.settings?.timeWeights);
                    setTimeResult(null);
                    timeRoll.spin(
                      Object.values(TIME_CONDITIONS).map(c => c.name),
                      result.condition.name,
                      () => setTimeResult(result)
                    );
                  }}
                  disabled={timeRoll.spinning}
                  className="ui-btn ui-btn-sm"
                >
                  {timeRoll.spinning ? 'Rolling…' : timeResult ? 'Re-roll' : 'Roll'}
                </button>
              </div>

              {(() => {
                const weights = campaign?.settings?.timeWeights || DEFAULT_TIME_WEIGHTS;
                const entries = Object.entries(weights)
                  .filter(([, w]) => w > 0)
                  .map(([id, w]) => [TIME_CONDITIONS[id]?.name || id, w]);
                const chosen = timeResult
                  ? (TIME_CONDITIONS[timeResult.condition.id]?.name || timeResult.condition.id)
                  : null;
                return oddsStrip(entries, chosen);
              })()}

              {reel(
                timeRoll.spinning,
                timeRoll.display,
                timeResult ? (
                  <>
                    <div className="font-bold">{timeResult.condition.name}</div>
                    <div className="ui-hint">{timeResult.condition.description}</div>
                  </>
                ) : null,
                'Roll to determine the time of day'
              )}
            </div>
          </div>
        </div>

        {/* ---------- Commanders ---------- */}
        {(campaign?.regiments?.USA?.length > 0 || campaign?.regiments?.CSA?.length > 0) && (
          <div className="ui-box">
            <div className="ui-eyebrow">Battle commanders</div>
            <p className="ui-hint mt-0.5">
              Spin to draw the commanding regiment for each side.
            </p>
            {preRolledSides.length > 0 && (
              <p className="ui-hint mt-1">
                Already drawn on the campaign map ({preRolledSides.join(' & ')}).
                “Change” returns a regiment to the pool and draws again.
              </p>
            )}
            <div className="mt-3">
              <CommanderSpinner
                regiments={campaign.regiments}
                commanderPool={campaign.commanderPool}
                benchedCommanders={campaign.benchedCommanders}
                selectedCommanders={selectedCommanders}
                onSelect={handleCommanderSelect}
              />
            </div>
          </div>
        )}

        {/* ---------- Winner ---------- */}
        <div>
          <div className="ui-label">Winner</div>
          <div className="ui-segment">
            <button onClick={() => setWinner('USA')} data-active={winner === 'USA'} data-side="USA">
              USA victory
            </button>
            <button onClick={() => setWinner('CSA')} data-active={winner === 'CSA'} data-side="CSA">
              CSA victory
            </button>
          </div>
          {winner ? (
            <button
              onClick={() => setWinner('')}
              className="ui-btn ui-btn-quiet ui-btn-sm mt-1 !px-0"
            >
              Clear winner — file as pending
            </button>
          ) : (
            <p className="ui-hint mt-1">
              No winner chosen — the engagement is filed as <Tag tone="mark">pending</Tag>
            </p>
          )}
        </div>

        {/* ---------- Casualties ---------- */}
        <div className="ui-box">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="ui-eyebrow">The butcher's bill</div>
            <span className="ui-hint">Optional</span>
          </div>

          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {['USA', 'CSA'].map((side) => {
              const td = avgTd(side);
              return (
                <div key={side}>
                  <label className={`ui-label ${SIDE_TEXT[side]}`}>{side} casualties</label>
                  <input
                    type="number"
                    min="0"
                    value={ticketMode ? bucketTotal(side) : casualties[side]}
                    onChange={(e) => setCasualties({ ...casualties, [side]: e.target.value })}
                    className={`ui-field tabular ${ticketMode ? 'opacity-70 cursor-not-allowed' : ''}`}
                    placeholder="0"
                    readOnly={ticketMode}
                    title={ticketMode ? 'Total is the sum of the three stance rows below' : undefined}
                  />

                  {ticketMode && (
                    <>
                      <table className="ui-table mt-2">
                        <thead>
                          <tr>
                            <th>Stance</th>
                            <th className="num">Weight</th>
                            <th className="num">Losses</th>
                          </tr>
                        </thead>
                        <tbody>
                          {STANCES.map(({ key, label, weight }) => (
                            <tr key={key}>
                              <td>{label}</td>
                              <td className="num text-ink-3">×{weight}</td>
                              <td className="num">
                                <input
                                  type="number"
                                  min="0"
                                  value={casualtyBuckets[side][key] || 0}
                                  onChange={(e) => updateBucket(side, key, e.target.value)}
                                  className="ui-field w-20 py-0.5 text-right text-sm tabular"
                                  placeholder="0"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="ui-hint mt-1">
                        {td != null ? (
                          <>
                            ×Td <b className="not-italic text-ink">{td.toFixed(2)}</b>
                            {' · '}
                            {(bucketTotal(side) * td).toFixed(0)} ticket damage
                          </>
                        ) : (
                          'Enter losses to see ticket damage'
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------- Supply point costs ---------- */}
        {campaign?.cpSystemEnabled && territory && (
          <div className="ui-box">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="ui-eyebrow">Supply point costs</div>
              {isManualCPMode && <Tag>Entered by hand</Tag>}
            </div>

            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Row
                label={<span className={SIDE_TEXT.USA}>USA pool</span>}
                value={`${campaign.combatPowerUSA || 0} SP`}
              />
              <Row
                label={<span className={SIDE_TEXT.CSA}>CSA pool</span>}
                value={`${campaign.combatPowerCSA || 0} SP`}
              />
            </div>

            {/* Entered by hand */}
            {isManualCPMode && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <label className="ui-label">{attacker}, attacking — SP lost</label>
                  <input
                    type="number"
                    min="0"
                    value={manualCPLoss.attacker}
                    onChange={(e) => setManualCPLoss({ ...manualCPLoss, attacker: e.target.value })}
                    className="ui-field tabular"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="ui-label">
                    {attacker === 'USA'
                      ? (territory.owner === 'CSA' ? 'CSA, defending' : 'Defender')
                      : (territory.owner === 'USA' ? 'USA, defending' : 'Defender')} — SP lost
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualCPLoss.defender}
                    onChange={(e) => setManualCPLoss({ ...manualCPLoss, defender: e.target.value })}
                    className="ui-field tabular"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Reckoned from the returns */}
            {!isManualCPMode && (() => {
              const isNeutral = territory.owner === 'NEUTRAL';
              const isFriendly = territory.owner === defender;
              const vpBase = campaign?.settings?.vpBase || 1;
              const vpCurve = campaign?.settings?.vpCurve || 'linear';
              const vpMultiplier = getVPMultiplier(
                territory?.pointValue || territory?.victoryPoints || 10, vpBase, vpCurve
              );
              const divisor = campaign?.settings?.ticketCostDivisor ?? 100;
              const attackBase = isNeutral
                ? (campaign?.settings?.baseAttackCostNeutral ?? 50)
                : (campaign?.settings?.baseAttackCostEnemy ?? 75);
              const defenceBase = isFriendly
                ? (campaign?.settings?.baseDefenseCostFriendly ?? 25)
                : (campaign?.settings?.baseDefenseCostNeutral ?? 50);

              const side = (label, who, loss, basis, ceiling, note) => (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1">
                    <span>
                      <span className={`font-bold ${SIDE_TEXT[who]}`}>{who}</span>
                      <span className="text-ink-2"> {label}</span>
                    </span>
                    <span className="font-bold tabular text-mark">−{loss} SP</span>
                  </div>
                  <p className="ui-hint mt-1">{basis}</p>
                  <p className="ui-hint">{ceiling}</p>
                  <p className="ui-hint">{note}</p>
                </div>
              );

              return (
                <>
                  {side(
                    'attacking',
                    attacker,
                    estimatedCPCost.attacker,
                    ticketMode
                      ? `Your ticket damage × ${vpMultiplier} (VP mult) × ${attackBase}/${divisor} SP per ticket`
                      : `Base ${attackBase} × ${vpMultiplier} (VP mult) × (your casualties ÷ total casualties)`,
                    `${ticketMode ? `${maxCPCost.attacker} SP per 1k tickets` : `Most it can cost: ${maxCPCost.attacker} SP`} · attacking ${isNeutral ? 'neutral' : 'enemy'} ground`,
                    'Attackers pay more — the aggressor’s burden.'
                  )}
                  {side(
                    'defending',
                    defender,
                    estimatedCPCost.defender,
                    ticketMode
                      ? `Your ticket damage × ${vpMultiplier} (VP mult) × ${defenceBase}/${divisor} SP per ticket`
                      : `Base ${defenceBase} × ${vpMultiplier} (VP mult) × (your casualties ÷ total casualties)`,
                    `${ticketMode ? `${maxCPCost.defender} SP per 1k tickets` : `Most it can cost: ${maxCPCost.defender} SP`} · defending ${isFriendly ? 'friendly' : 'neutral'} ground`,
                    isFriendly
                      ? 'Cheaper on its own ground.'
                      : 'Dearer on neutral ground — no home advantage.'
                  )}
                </>
              );
            })()}

            {cpBlockingError && (
              <div className="ui-box border-mark mt-3">
                <Tag tone="mark">Attack blocked</Tag>
                <p className="mt-1 text-mark">{cpBlockingError}</p>
              </div>
            )}

            {!cpBlockingError && cpWarning && (
              <div className="ui-box border-mark mt-3">
                <Tag tone="mark">Warning</Tag>
                <p className="mt-1 text-ink-2">{cpWarning}</p>
              </div>
            )}
          </div>
        )}

        {/* ---------- Notes ---------- */}
        <div>
          <label className="ui-label">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="ui-field resize-none"
            rows="3"
            placeholder="Anything worth recording about this engagement…"
          />
        </div>
      </div>
    </Modal>
  );
};

export default BattleRecorder;
