import { useState, useEffect } from 'react';
import { X, Swords, Save, AlertCircle, Dice6, Cloud, Sun, CloudRain, Moon, Users, RotateCw, Clock, Edit3 } from 'lucide-react';
import { ALL_MAPS } from '../data/territories';
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
import { useSpinRoll } from '../utils/useSpinRoll';
import CommanderSpinner from './CommanderSpinner';

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

  // Team ability state
  const [abilityActive, setAbilityActive] = useState(editingBattle?.abilityUsed ? true : false);

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
      ...ticketOptions
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
  }, [selectedTerritory, attacker, winner, casualties, casualtyBuckets, territories, campaign, abilityActive, isManualCPMode]);

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

  const getWinnerColor = (side) => {
    return side === 'USA' ? 'bg-union-500 hover:bg-union-500' : 'bg-rebel-500 hover:bg-rebel-500';
  };

  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="ui-modal-head">
          <div className="ui-modal-title">
            {isEditMode ? <Edit3 className="w-5 h-5" /> : <Swords className="w-5 h-5" />}
            {isEditMode ? 'Edit Battle' : 'Record Battle'}
            <span className="ui-badge ui-badge-neutral ml-1">
              Turn {isEditMode ? editingBattle.turn : currentTurn}
            </span>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-quiet ui-btn-icon" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="ui-modal-body ui-scroll">
          {/* Form */}
          <div className="space-y-4">
            {/* Territory Selection */}
            <div>
              <label className="ui-label">
                Territory <span className="text-rebel-400">*</span>
              </label>
              <select
                value={selectedTerritory}
                onChange={(e) => setSelectedTerritory(e.target.value)}
                className="ui-field"
              >
                <option value="">Select territory...</option>
                {territories.map(territory => (
                  <option key={territory.id} value={territory.id}>
                    {territory.name} ({territory.owner}) - {territory.victoryPoints} VP
                  </option>
                ))}
              </select>
            </div>

            {/* Territory Info Display */}
            {selectedTerritory && (
              <div className="ui-inset p-3">
                {(() => {
                  const territory = territories.find(t => t.id === selectedTerritory);
                  const adjacentIds = territory.adjacentTerritories || [];
                  const adjacentTerritoryObjects = adjacentIds
                    .map(id => territories.find(t => t.id === id))
                    .filter(Boolean);
                  const isSupplied = territory.owner === 'NEUTRAL' ? null : isTerritorySupplied(territory, territories);

                  return (
                    <>
                      <div className="text-sm text-mist-400 mb-1">Selected Territory:</div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-white font-semibold">{territory.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-mist-400 text-sm">
                            Owner: <span className={`font-semibold ${
                              territory.owner === 'USA' ? 'text-union-400' :
                              territory.owner === 'CSA' ? 'text-rebel-400' :
                              'text-mist-400'
                            }`}>{territory.owner}</span>
                          </span>
                          <span className="text-brass-400 text-sm">
                            ({allTerritoryMaps.length} maps)
                          </span>
                          <span className="text-green-400 font-semibold text-sm">
                            {territory.victoryPoints} VP
                          </span>
                        </div>
                      </div>

                      {/* Supply Status */}
                      {territory.owner !== 'NEUTRAL' && (
                        <div className={`text-xs px-2 py-1 rounded inline-block mb-2 ${
                          isSupplied
                            ? 'bg-green-900/50 text-green-400 border border-green-700'
                            : 'bg-rebel-900/50 text-rebel-400 border border-rebel-500'
                        }`}>
                          {isSupplied ? '✓ Supplied' : '⚠ ENCIRCLED (2x defense cost)'}
                        </div>
                      )}

                      {/* Adjacent Territories */}
                      <div className="mt-2 pt-2 border-t border-ink-700">
                        <div className="text-xs text-mist-400 mb-1">
                          Adjacent Territories ({adjacentIds.length} defined, {adjacentTerritoryObjects.length} found):
                        </div>
                        {adjacentTerritoryObjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {adjacentTerritoryObjects.map(adj => (
                              <span
                                key={adj.id}
                                className={`text-xs px-2 py-0.5 rounded ${
                                  adj.owner === 'USA'
                                    ? 'bg-union-900/50 text-union-400 border border-union-500'
                                    : adj.owner === 'CSA'
                                    ? 'bg-rebel-900/50 text-rebel-400 border border-rebel-500'
                                    : 'bg-ink-700 text-mist-300 border border-ink-600'
                                }`}
                              >
                                {adj.name} ({adj.owner})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-mist-500 italic">
                            {adjacentIds.length > 0
                              ? `IDs not found in territories: ${adjacentIds.join(', ')}`
                              : 'No adjacencies defined for this territory'}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Attacker Selection */}
            <div>
              <label className="ui-label">
                Attacker
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setAttacker('USA')}
                  className={`flex-1 px-4 py-2 rounded font-semibold transition ${
                    attacker === 'USA'
                      ? 'bg-union-500 text-white'
                      : 'bg-ink-800 text-mist-300 hover:bg-ink-700'
                  }`}
                >
                  USA
                </button>
                <button
                  onClick={() => setAttacker('CSA')}
                  className={`flex-1 px-4 py-2 rounded font-semibold transition ${
                    attacker === 'CSA'
                      ? 'bg-rebel-500 text-white'
                      : 'bg-ink-800 text-mist-300 hover:bg-ink-700'
                  }`}
                >
                  CSA
                </button>
              </div>
            </div>

            {/* Team Ability */}
            <div className="ui-inset p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-sm font-semibold text-brass-400 mb-1">
                    {abilities[attacker]?.name}
                  </div>
                  <div className="text-xs text-mist-400">
                    {attacker === 'USA'
                      ? 'Failed attacks keep territory neutral, wins triple CSA SP loss'
                      : 'Reduces attack SP loss by 50%'}
                  </div>
                </div>
                {abilities[attacker]?.cooldown > 0 && (
                  <div className="text-xs bg-orange-900/50 text-orange-300 px-2 py-1 rounded border border-orange-700">
                    Cooldown: {abilities[attacker].cooldown} turns
                  </div>
                )}
              </div>

              <button
                onClick={() => setAbilityActive(!abilityActive)}
                disabled={abilities[attacker]?.cooldown > 0}
                className={`w-full px-4 py-2 rounded font-semibold transition flex items-center justify-center gap-2 ${
                  abilities[attacker]?.cooldown > 0
                    ? 'bg-ink-700 cursor-not-allowed opacity-50 text-mist-400'
                    : abilityActive
                    ? attacker === 'USA'
                      ? 'bg-union-500 hover:bg-union-500 text-white'
                      : 'bg-rebel-500 hover:bg-rebel-500 text-white'
                    : 'bg-ink-700 hover:bg-ink-600 text-white'
                }`}
              >
                {abilityActive ? '✓ Ability Active' : 'Use Ability'}
              </button>

              {abilityActive && (
                <div className="mt-2 p-2 bg-green-900/30 border border-green-700 rounded text-xs text-green-300">
                  ✓ Ability will be activated for this battle
                </div>
              )}
            </div>

            {/* Terrain Type Roll */}
            {needsTerrainRoll && selectedTerritory && (() => {
              const territory = territories.find(t => t.id === selectedTerritory);
              if (!territory?.terrainWeights) return null;
              const weights = territory.terrainWeights;
              const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

              return (
                <div className="ui-inset p-4">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm text-mist-300 font-semibold">
                      Terrain Type
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={handleTerrainRoll}
                        disabled={terrainSpinning}
                        className={`flex items-center gap-2 px-3 py-1.5 text-white rounded text-sm font-semibold transition ${
                          terrainSpinning
                            ? 'bg-ink-700 cursor-not-allowed opacity-50'
                            : 'bg-brass-500 hover:bg-brass-400'
                        }`}
                      >
                        {terrainSpinning ? (
                          <RotateCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Dice6 className="w-4 h-4" />
                        )}
                        {terrainSpinning ? 'Rolling...' : terrainRollResult ? 'Re-roll' : 'Roll'}
                      </button>
                      {!terrainSpinning && (
                        <select
                          value={terrainRollResult?.terrainType || ''}
                          onChange={(e) => handleTerrainManualSelect(e.target.value)}
                          className="px-2 py-1.5 rounded bg-ink-700 border border-ink-600 text-white text-sm cursor-pointer hover:bg-ink-600 transition"
                        >
                          <option value="" disabled>Pick</option>
                          {Object.keys(weights).map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Weight Distribution */}
                  <div className="flex rounded overflow-hidden h-6 mb-3">
                    {Object.entries(weights).map(([type, weight]) => (
                      <div
                        key={type}
                        style={{ flex: weight }}
                        className={`flex items-center justify-center text-xs font-medium text-mist-300 bg-ink-700 border-r border-ink-600 last:border-r-0 ${
                          terrainRollResult?.terrainType === type ? 'bg-ink-600 ring-1 ring-brass-400 z-10' : ''
                        } ${terrainRollResult && terrainRollResult.terrainType !== type ? 'opacity-40' : ''}`}
                      >
                        {type} {weight}/{totalWeight}
                      </div>
                    ))}
                  </div>

                  {/* Spinner Display */}
                  <div className={`bg-ink-850 rounded-lg p-4 min-h-[56px] flex items-center justify-center border-2 transition-colors ${
                    terrainSpinning ? 'border-brass-400' : terrainRollResult ? 'border-ink-600' : 'border-ink-700'
                  }`}>
                    {terrainSpinning ? (
                      <div className="flex items-center gap-3">
                        <RotateCw className="w-5 h-5 text-mist-400 animate-spin" />
                        <span className="text-white font-bold text-lg animate-pulse">
                          {terrainDisplayName || '...'}
                        </span>
                      </div>
                    ) : terrainRollResult ? (
                      <div className="text-center">
                        <span className="text-white font-bold text-lg">
                          {terrainRollResult.terrainType}
                        </span>
                        <span className="text-xs text-mist-400 ml-3">
                          ({availableMaps.length} maps available)
                        </span>
                      </div>
                    ) : (
                      <span className="text-mist-400 text-sm">
                        Roll to determine the terrain type for this battle
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Map Selection */}
            <div>
              <label className="ui-label">
                Map <span className="text-rebel-400">*</span>
              </label>

              {/* Pick/Ban UI - shown when 2+ maps in pool */}
              {selectedTerritory && pickBanMaps.length >= 2 && (
                <div className="ui-inset p-4">
                  {/* Pick/Ban Header */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm font-semibold text-brass-400">
                      Map Pick/Ban ({pickBanMaps.length} maps)
                    </div>
                    {pickBanActive && (
                      <div className={`text-xs px-2 py-1 rounded border ${
                        getBanningTeam() === 'USA'
                          ? 'bg-union-900/50 text-union-400 border-union-500'
                          : 'bg-rebel-900/50 text-rebel-400 border-rebel-500'
                      }`}>
                        {getBanningTeam()} bans ({bannedMaps.length + 1}/{pickBanMaps.length - 1})
                      </div>
                    )}
                    {!pickBanActive && selectedMap && (
                      <div className="text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700">
                        Map Selected
                      </div>
                    )}
                  </div>

                  {/* Pick/Ban Instructions */}
                  {pickBanActive && (
                    <div className="text-xs text-mist-400 mb-3">
                      {defender} (Defender) bans first. Click a map to ban it.
                    </div>
                  )}

                  {/* Map Grid */}
                  <div className="space-y-2">
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
                          className={`w-full px-3 py-2 rounded text-left text-sm transition flex justify-between items-center ${
                            isSelected
                              ? 'bg-green-600 text-white cursor-default'
                              : isBanned
                              ? 'bg-ink-850 text-mist-500 cursor-not-allowed line-through'
                              : 'bg-ink-700 text-white hover:bg-ink-600'
                          }`}
                        >
                          <span>{mapName}</span>
                          {isBanned && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              bannedBy === 'USA'
                                ? 'bg-union-900/50 text-union-400'
                                : 'bg-rebel-900/50 text-rebel-400'
                            }`}>
                              Banned by {bannedBy}
                            </span>
                          )}
                          {isSelected && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs bg-green-700 px-2 py-0.5 rounded">Playing</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${attacker === 'USA' ? 'bg-union-900/60 text-union-400' : 'bg-rebel-900/60 text-rebel-400'}`}>
                                {attacker} ATK
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${defender === 'USA' ? 'bg-union-900/60 text-union-400' : 'bg-rebel-900/60 text-rebel-400'}`}>
                                {defender} DEF
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Ban Progress */}
                  {pickBanActive && (
                    <div className="mt-3 flex gap-1">
                      {Array.from({ length: pickBanMaps.length - 1 }, (_, i) => (
                        <div
                          key={i}
                          className={`flex-1 h-1 rounded ${
                            i < bannedMaps.length
                              ? (i % 2 === 0
                                ? (defender === 'USA' ? 'bg-union-500' : 'bg-rebel-500')
                                : (attacker === 'USA' ? 'bg-union-500' : 'bg-rebel-500'))
                              : 'bg-ink-700'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Fallback dropdown - shown when no pick/ban (0 available or auto-selected) */}
              {selectedTerritory && pickBanMaps.length === 0 && !selectedMap && (
                <select
                  value={selectedMap}
                  onChange={(e) => setSelectedMap(e.target.value)}
                  className="ui-field"
                >
                  <option value="">Select map... ({availableMaps.length} available)</option>
                  {availableMaps.map(map => (
                    <option key={map} value={map}>{map}</option>
                  ))}
                </select>
              )}

              {/* Auto-selected single map indicator */}
              {selectedTerritory && pickBanMaps.length === 0 && selectedMap && (
                <div className="ui-inset p-4">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-semibold text-brass-400">Map</div>
                    <div className="text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700">
                      Auto-Selected
                    </div>
                  </div>
                  <div className="mt-2 px-3 py-2 bg-green-600 text-white rounded text-sm font-medium flex justify-between items-center">
                    <span>{selectedMap}</span>
                    <div className="flex gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${attacker === 'USA' ? 'bg-union-900/60 text-union-400' : 'bg-rebel-900/60 text-rebel-400'}`}>
                        {attacker} ATK
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${defender === 'USA' ? 'bg-union-900/60 text-union-400' : 'bg-rebel-900/60 text-rebel-400'}`}>
                        {defender} DEF
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-mist-400">
                    Only 1 map available for this territory
                  </div>
                </div>
              )}

              {!selectedTerritory && (
                <select
                  disabled
                  className="w-full px-3 py-2 bg-ink-800 text-white rounded border border-ink-700 opacity-50 cursor-not-allowed"
                >
                  <option>Select a territory first...</option>
                </select>
              )}

              {/* Map cooldown information - Campaign-wide */}
              {selectedTerritory && cooldownMaps.size > 0 && (
                <div className="mt-2 p-3 bg-ink-800/50 rounded border border-ink-700">
                  <div className="text-xs text-brass-400 font-semibold mb-2">
                    Maps on Cooldown - Campaign-Wide ({cooldownMaps.size})
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {Array.from(cooldownMaps.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([mapName, turn]) => (
                        <div key={mapName} className="text-xs text-mist-400 flex justify-between items-center">
                          <span className="truncate">{mapName}</span>
                          <span className="text-orange-400 ml-2 whitespace-nowrap">
                            {getMapCooldownMessage(mapName, cooldownMaps, currentTurn, campaign?.settings?.mapCooldownTurns ?? 2)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Battle Conditions - Separate Weather & Time Rolls */}
            <div className="ui-inset p-4">
              <label className="text-sm text-mist-300 font-semibold block mb-3">
                Battle Conditions
              </label>
              <div className="grid grid-cols-2 gap-3">
                {/* Weather Roll */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-mist-400 font-semibold">Weather</span>
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
                      className={`ui-btn ui-btn-sm ${weatherRoll.spinning ? 'opacity-50 cursor-not-allowed' : 'ui-btn-primary'}`}
                    >
                      {weatherRoll.spinning
                        ? <RotateCw className="w-3 h-3 animate-spin" />
                        : <Dice6 className="w-3 h-3" />}
                      {weatherRoll.spinning ? 'Rolling…' : weatherResult ? 'Re-roll' : 'Roll'}
                    </button>
                  </div>
                  {/* Weather weight bar */}
                  {(() => {
                    const weights = campaign?.settings?.weatherWeights || DEFAULT_WEATHER_WEIGHTS;
                    const total = Object.values(weights).reduce((s, w) => s + w, 0);
                    return (
                      <div className="flex rounded overflow-hidden h-4 mb-2">
                        {Object.entries(weights).filter(([,w]) => w > 0).map(([id, weight]) => (
                          <div
                            key={id}
                            style={{ flex: weight }}
                            className={`flex items-center justify-center text-[9px] font-medium text-mist-300 bg-ink-700 border-r border-ink-600 last:border-r-0 ${
                              weatherResult?.condition?.id === id ? 'bg-ink-600 ring-1 ring-brass-400 z-10' : ''
                            } ${weatherResult && weatherResult.condition?.id !== id ? 'opacity-40' : ''}`}
                          >
                            {Math.round(weight / total * 100)}%
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {weatherRoll.spinning ? (
                    <div className="p-3 rounded border-2 border-brass-400 text-center">
                      <div className="font-semibold text-brass-300 text-sm animate-pulse">
                        {weatherRoll.display}
                      </div>
                      <div className="text-xs text-mist-500 mt-0.5">rolling…</div>
                    </div>
                  ) : weatherResult ? (
                    <div className={`p-3 rounded border ${
                      weatherResult.condition.id === 'clear'
                        ? 'bg-yellow-900/30 border-yellow-700'
                        : weatherResult.condition.id === 'rain'
                        ? 'bg-union-900/30 border-union-500'
                        : 'bg-purple-900/30 border-purple-700'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {weatherResult.condition.id === 'clear' ? (
                          <Sun className="w-4 h-4 text-yellow-400" />
                        ) : weatherResult.condition.id === 'rain' ? (
                          <Cloud className="w-4 h-4 text-union-400" />
                        ) : (
                          <CloudRain className="w-4 h-4 text-purple-400" />
                        )}
                        <span className="font-semibold text-white text-sm">
                          {weatherResult.condition.name}
                        </span>
                      </div>
                      <div className="text-xs text-mist-400">
                        {weatherResult.condition.description}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded border border-ink-700 text-center text-mist-500 text-xs">
                      Roll to determine weather
                    </div>
                  )}
                </div>

                {/* Time of Day Roll */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-mist-400 font-semibold">Time of Day</span>
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
                      className={`ui-btn ui-btn-sm ${timeRoll.spinning ? 'opacity-50 cursor-not-allowed' : 'ui-btn-primary'}`}
                    >
                      {timeRoll.spinning
                        ? <RotateCw className="w-3 h-3 animate-spin" />
                        : <Dice6 className="w-3 h-3" />}
                      {timeRoll.spinning ? 'Rolling…' : timeResult ? 'Re-roll' : 'Roll'}
                    </button>
                  </div>
                  {/* Time weight bar */}
                  {(() => {
                    const weights = campaign?.settings?.timeWeights || DEFAULT_TIME_WEIGHTS;
                    const total = Object.values(weights).reduce((s, w) => s + w, 0);
                    return (
                      <div className="flex rounded overflow-hidden h-4 mb-2">
                        {Object.entries(weights).filter(([,w]) => w > 0).map(([id, weight]) => (
                          <div
                            key={id}
                            style={{ flex: weight }}
                            className={`flex items-center justify-center text-[9px] font-medium text-mist-300 bg-ink-700 border-r border-ink-600 last:border-r-0 ${
                              timeResult?.condition?.id === id ? 'bg-ink-600 ring-1 ring-brass-400 z-10' : ''
                            } ${timeResult && timeResult.condition?.id !== id ? 'opacity-40' : ''}`}
                          >
                            {Math.round(weight / total * 100)}%
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {timeRoll.spinning ? (
                    <div className="p-3 rounded border-2 border-brass-400 text-center">
                      <div className="font-semibold text-brass-300 text-sm animate-pulse">
                        {timeRoll.display}
                      </div>
                      <div className="text-xs text-mist-500 mt-0.5">rolling…</div>
                    </div>
                  ) : timeResult ? (
                    <div className={`p-3 rounded border ${
                      timeResult.condition.id === 'dawn'
                        ? 'bg-orange-900/30 border-orange-700'
                        : timeResult.condition.id === 'standard'
                        ? 'bg-ink-700/50 border-ink-600'
                        : timeResult.condition.id === 'dusk'
                        ? 'bg-brass-900/30 border-brass-500'
                        : 'bg-indigo-900/30 border-indigo-700'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Moon className={`w-4 h-4 ${
                          timeResult.condition.id === 'night'
                            ? 'text-indigo-400'
                            : 'text-brass-400'
                        }`} />
                        <span className="font-semibold text-white text-sm">
                          {timeResult.condition.name}
                        </span>
                      </div>
                      <div className="text-xs text-mist-400">
                        {timeResult.condition.description}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded border border-ink-700 text-center text-mist-500 text-xs">
                      Roll to determine time of day
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Commander Selection */}
            {(campaign?.regiments?.USA?.length > 0 || campaign?.regiments?.CSA?.length > 0) && (
              <div className="ui-inset p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-brass-400" />
                  <label className="text-sm text-mist-300 font-semibold">
                    Battle Commanders
                  </label>
                </div>
                <div className="text-xs text-mist-400 mb-3">
                  Spin to randomly select the commanding regiment for each side
                </div>
                {preRolledSides.length > 0 && (
                  <div className="text-xs text-green-400 mb-3 flex items-center gap-2">
                    <Dice6 className="w-3 h-3" />
                    Pre-selected from the campaign map roll ({preRolledSides.join(' & ')}). Hit
                    "Change" to put a regiment back in the pool and pick again.
                  </div>
                )}
                <CommanderSpinner
                  regiments={campaign.regiments}
                  commanderPool={campaign.commanderPool}
                  benchedCommanders={campaign.benchedCommanders}
                  selectedCommanders={selectedCommanders}
                  onSelect={handleCommanderSelect}
                />
              </div>
            )}

            {/* Winner Selection */}
            <div>
              <label className="ui-label">
                Winner
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setWinner('USA')}
                  className={`flex-1 px-4 py-2 rounded font-semibold transition ${
                    winner === 'USA'
                      ? 'bg-union-500 text-white'
                      : 'bg-ink-800 text-mist-300 hover:bg-ink-700'
                  }`}
                >
                  USA Victory
                </button>
                <button
                  onClick={() => setWinner('CSA')}
                  className={`flex-1 px-4 py-2 rounded font-semibold transition ${
                    winner === 'CSA'
                      ? 'bg-rebel-500 text-white'
                      : 'bg-ink-800 text-mist-300 hover:bg-ink-700'
                  }`}
                >
                  CSA Victory
                </button>
              </div>
              {winner && (
                <button
                  onClick={() => setWinner('')}
                  className="mt-2 text-xs text-mist-400 hover:text-mist-300 transition"
                >
                  Clear winner (save as pending)
                </button>
              )}
              {!winner && (
                <div className="mt-2 flex items-center gap-2 text-xs text-brass-400">
                  <Clock className="w-3 h-3" />
                  No winner selected - battle will be saved as pending
                </div>
              )}
            </div>

            {/* Casualties */}
            <div>
              <label className="ui-label">
                Casualties (Optional)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {['USA', 'CSA'].map((side) => {
                  const sideColor = side === 'USA' ? 'text-union-400' : 'text-rebel-400';
                  const td = avgTd(side);
                  return (
                    <div key={side}>
                      <label className={`block text-xs ${sideColor} mb-1`}>{side} Casualties</label>
                      <input
                        type="number"
                        min="0"
                        value={ticketMode ? bucketTotal(side) : casualties[side]}
                        onChange={(e) => setCasualties({ ...casualties, [side]: e.target.value })}
                        className={`ui-field ${ticketMode ? 'opacity-70 cursor-not-allowed' : ''}`}
                        placeholder="0"
                        readOnly={ticketMode}
                        title={ticketMode ? 'Total is the sum of the three stance rows below' : undefined}
                      />

                      {ticketMode && (
                        <div className="mt-2 pl-2 border-l-2 border-ink-700 space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-mist-500">
                            Losses by stance
                          </div>
                          {[
                            { key: 'inForm', label: 'In Formation', weight: 1 },
                            { key: 'skirm', label: 'Skirmishing', weight: 3 },
                            { key: 'oob', label: 'Out of Line', weight: 5 },
                          ].map(({ key, label, weight }) => (
                            <div key={key} className="flex items-center gap-2">
                              <label className="flex-1 text-[11px] text-mist-400">
                                {label}
                                <span className="text-mist-600 ml-1">×{weight}</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={casualtyBuckets[side][key] || 0}
                                onChange={(e) => updateBucket(side, key, e.target.value)}
                                className="ui-field w-20 py-1 text-xs"
                                placeholder="0"
                              />
                            </div>
                          ))}
                          <div className="text-[10px] text-mist-500 pt-1">
                            {td != null ? (
                              <>
                                ×Td <span className="text-brass-400 font-semibold">{td.toFixed(2)}</span>
                                {' · '}
                                {(bucketTotal(side) * td).toFixed(0)} ticket damage
                              </>
                            ) : (
                              'Enter losses to see ticket damage'
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SP Cost Display */}
            {campaign?.cpSystemEnabled && selectedTerritory && (
              <div className="ui-inset p-4">
                <div className="text-sm font-semibold text-brass-400 mb-3 flex items-center justify-between">
                  <span>Supply Point Costs</span>
                  {isManualCPMode && (
                    <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-1 rounded border border-purple-700">
                      Manual Mode
                    </span>
                  )}
                </div>
                
                <div className="space-y-3">
                  {/* Current SP Pools */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-ink-850 rounded p-2">
                      <div className="text-mist-400 text-xs mb-1">USA SP Pool</div>
                      <div className="text-union-400 font-bold text-lg">{campaign.combatPowerUSA || 0}</div>
                    </div>
                    <div className="bg-ink-850 rounded p-2">
                      <div className="text-mist-400 text-xs mb-1">CSA SP Pool</div>
                      <div className="text-rebel-400 font-bold text-lg">{campaign.combatPowerCSA || 0}</div>
                    </div>
                  </div>
                  
                  <div className="border-t border-ink-700"></div>
                  
                  {/* Battle SP Costs - Manual Mode */}
                  {isManualCPMode && (
                    <div className="space-y-3">
                      <div className="text-xs text-mist-400 mb-2">
                        Enter SP loss for each side:
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-brass-400 mb-1 font-semibold">
                            {attacker} (Attacker) SP Loss
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={manualCPLoss.attacker}
                            onChange={(e) => setManualCPLoss({ ...manualCPLoss, attacker: e.target.value })}
                            className="w-full px-3 py-2 bg-ink-850 text-white rounded border border-ink-700 focus:border-brass-400 outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-brass-400 mb-1 font-semibold">
                            {(() => {
                              const territory = territories.find(t => t.id === selectedTerritory);
                              return attacker === 'USA' ?
                                (territory?.owner === 'CSA' ? 'CSA' : 'Defender') :
                                (territory?.owner === 'USA' ? 'USA' : 'Defender');
                            })()} SP Loss
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={manualCPLoss.defender}
                            onChange={(e) => setManualCPLoss({ ...manualCPLoss, defender: e.target.value })}
                            className="w-full px-3 py-2 bg-ink-850 text-white rounded border border-ink-700 focus:border-brass-400 outline-none"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Battle SP Costs - Auto Mode */}
                  {!isManualCPMode && (
                    <div className="space-y-2 text-sm">
                      <div className="bg-ink-850 rounded p-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-mist-300 font-semibold">
                            {attacker} (Attacker)
                          </span>
                          <span className={`font-bold text-lg ${
                            attacker === 'USA' ? 'text-union-400' : 'text-rebel-400'
                          }`}>
                            -{estimatedCPCost.attacker} SP
                          </span>
                        </div>
                        <div className="text-xs text-mist-400 mb-1">
                          {(() => {
                            const territory = territories.find(t => t.id === selectedTerritory);
                            const isNeutral = territory?.owner === 'NEUTRAL';
                            const baseCP = isNeutral
                              ? (campaign?.settings?.baseAttackCostNeutral ?? 50)
                              : (campaign?.settings?.baseAttackCostEnemy ?? 75);
                            const vpBase = campaign?.settings?.vpBase || 1;
                            const vpCurve = campaign?.settings?.vpCurve || 'linear';
                            const vpMultiplier = getVPMultiplier(territory?.pointValue || territory?.victoryPoints || 10, vpBase, vpCurve);
                            if (ticketMode) {
                              const divisor = campaign?.settings?.ticketCostDivisor ?? 100;
                              return `Your ticket damage × ${vpMultiplier} (VP mult) × ${baseCP}/${divisor} SP per ticket`;
                            }
                            return `Base: ${baseCP} × ${vpMultiplier} (VP mult) × (your casualties ÷ total casualties)`;
                          })()}
                        </div>
                        <div className="text-xs text-brass-400">
                          {ticketMode ? `${maxCPCost.attacker} SP per 1k tickets` : `Max: ${maxCPCost.attacker} SP`} • Attacking {(() => {
                            const territory = territories.find(t => t.id === selectedTerritory);
                            return territory?.owner === 'NEUTRAL' ? 'neutral' : 'enemy';
                          })()} territory
                        </div>
                        <div className="text-xs text-mist-500 mt-1 italic">
                          Attackers pay more SP - the aggressor's burden
                        </div>
                      </div>
                      
                      {(() => {
                        const territory = territories.find(t => t.id === selectedTerritory);
                        const defender = attacker === 'USA' ? 'CSA' : 'USA';

                        const isNeutral = territory.owner === 'NEUTRAL';
                        const isFriendly = territory.owner === defender;
                        // Defender base cost from settings
                        const baseCP = isFriendly
                          ? (campaign?.settings?.baseDefenseCostFriendly ?? 25)
                          : (campaign?.settings?.baseDefenseCostNeutral ?? 50);
                        const vpBase = campaign?.settings?.vpBase || 1;
                        const vpCurve = campaign?.settings?.vpCurve || 'linear';
                        const vpMultiplier = getVPMultiplier(territory?.pointValue || territory?.victoryPoints || 10, vpBase, vpCurve);

                        return (
                          <div className="bg-ink-850 rounded p-3">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-mist-300 font-semibold">
                                {defender} (Defender)
                              </span>
                              <span className={`font-bold text-lg ${
                                defender === 'USA' ? 'text-union-400' : 'text-rebel-400'
                              }`}>
                                -{estimatedCPCost.defender} SP
                              </span>
                            </div>
                            <div className="text-xs text-mist-400 mb-1">
                              {ticketMode
                                ? `Your ticket damage × ${vpMultiplier} (VP mult) × ${baseCP}/${campaign?.settings?.ticketCostDivisor ?? 100} SP per ticket`
                                : `Base: ${baseCP} × ${vpMultiplier} (VP mult) × (your casualties ÷ total casualties)`}
                            </div>
                            <div className="text-xs text-brass-400">
                              {ticketMode
                                ? `${maxCPCost.defender} SP per 1k tickets`
                                : `Max: ${maxCPCost.defender} SP`} • Defending {isFriendly ? 'friendly' : 'neutral'} territory
                            </div>
                            <div className="text-xs text-mist-500 mt-1 italic">
                              {isFriendly
                                ? 'Lower cost defending your own territory'
                                : 'Higher cost defending neutral ground - no home advantage'}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Blocking Error - Attack Impossible */}
                {cpBlockingError && (
                  <div className="mt-3 p-3 bg-rebel-900/50 border-2 border-rebel-500 rounded flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-rebel-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-rebel-400 font-bold text-sm mb-1">ATTACK BLOCKED</div>
                      <span className="text-rebel-400 text-sm">{cpBlockingError}</span>
                    </div>
                  </div>
                )}
                
                {/* Non-blocking Warning */}
                {!cpBlockingError && cpWarning && (
                  <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-500 rounded flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <span className="text-yellow-300 text-sm">{cpWarning}</span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="ui-label">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="ui-field resize-none"
                rows="3"
                placeholder="Add any additional notes about this battle..."
              />
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="ui-modal-foot">
            <button
              onClick={handleSubmit}
              disabled={winner && campaign?.cpSystemEnabled && cpBlockingError}
              className={`ui-btn flex-1 ${
                winner && campaign?.cpSystemEnabled && cpBlockingError
                  ? 'ui-btn-danger'
                  : 'ui-btn-primary'
              }`}
            >
              {!winner ? (
                <>
                  <Clock className="w-4 h-4" />
                  {isEditMode ? 'Update as Pending' : 'Save as Pending'}
                </>
              ) : isEditMode ? (
                <>
                  <Edit3 className="w-4 h-4" />
                  Update Battle
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {winner && campaign?.cpSystemEnabled && cpBlockingError
                    ? 'Attack Blocked - Insufficient SP'
                    : campaign?.cpSystemEnabled && cpWarning
                    ? 'Record Battle (Warning)'
                    : 'Record Battle'}
                </>
              )}
            </button>
            <button onClick={onClose} className="ui-btn ui-btn-ghost flex-1">
              Cancel
            </button>
        </div>
      </div>
    </div>
  );
};

export default BattleRecorder;