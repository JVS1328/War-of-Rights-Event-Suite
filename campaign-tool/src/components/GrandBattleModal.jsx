import { useState, useMemo, useEffect } from 'react';
import { Modal, Row, Tag, SIDE_TEXT } from './ui/Primitives';
import {
  findAttackTargets,
  findSupporters,
  findTerritoryAtSvgPoint,
  describeBattleLocation,
} from '../utils/grandCampaignLogic';
import {
  getAvailableMapsForTerritory,
  selectMapsForPickBan,
  rollTerrainType,
  resolveTerrainMaps,
  isConquestMap,
} from '../utils/mapSelection';
import {
  rollWeatherCondition,
  rollTimeCondition,
  WEATHER_CONDITIONS,
  TIME_CONDITIONS,
} from '../utils/battleConditions';

/**
 * GrandBattleModal — two-step attack initiator.
 *
 *   Step 1: pick target + optional supporter per side.
 *   Step 2: roll terrain + weather + time, draw 3 maps from that terrain's
 *           deck (honouring the campaign map cooldown), defender bans 1,
 *           attacker picks 1. That map + all three rolls are committed to
 *           the pending battle.
 */
const GrandBattleModal = ({ campaign, onCreate, onCancel }) => {
  const gc = campaign?.grandCampaign;
  const attackerId = gc?.currentTokenId;
  const attacker = gc?.tokens.find(t => t.id === attackerId);

  const [step, setStep] = useState(1);
  const [targetId, setTargetId] = useState(null);
  const [attackerSupportId, setAttackerSupportId] = useState(null);
  const [defenderSupportId, setDefenderSupportId] = useState(null);

  const targets = useMemo(
    () => attackerId ? findAttackTargets(campaign, attackerId) : [],
    [campaign, attackerId]
  );
  const attackerSupports = useMemo(
    () => attackerId ? findSupporters(campaign, attackerId, [targetId].filter(Boolean)) : [],
    [campaign, attackerId, targetId]
  );
  const defenderSupports = useMemo(
    () => targetId ? findSupporters(campaign, targetId, [attackerSupportId].filter(Boolean)) : [],
    [campaign, targetId, attackerSupportId]
  );

  const defender = useMemo(
    () => targetId ? gc.tokens.find(t => t.id === targetId) : null,
    [gc, targetId]
  );
  const defenderTerritory = useMemo(
    () => defender?.position ? findTerritoryAtSvgPoint(campaign, defender.position) : null,
    [campaign, defender]
  );
  const locationLabel = useMemo(
    () => defender?.position ? describeBattleLocation(campaign, defender.position) : null,
    [campaign, defender]
  );

  // Terrain / weather / time roll state
  const [terrainResult, setTerrainResult] = useState(null);    // { terrainType, roll, total }
  const [weatherResult, setWeatherResult] = useState(null);    // { condition, weight, total }
  const [timeResult, setTimeResult] = useState(null);
  const [mapCards, setMapCards] = useState([]);
  const [cooldownMaps, setCooldownMaps] = useState(new Map());
  const [bannedMap, setBannedMap] = useState(null);
  const [pickedMap, setPickedMap] = useState(null);

  // Conquest is auto-derived from the picked map against the campaign's
  // terrain groups (maps that live in any "*Conquest" group). A sides-swap
  // coin is flipped automatically the first time a conquest map is picked.
  const terrainGroupsForConquest = campaign.settings?.terrainGroups || {};
  const isConquest = pickedMap ? isConquestMap(pickedMap, terrainGroupsForConquest) : false;
  const [sidesSwapped, setSidesSwapped] = useState(false);
  const [conquestFlipForMap, setConquestFlipForMap] = useState(null);

  const terrainWeights = defenderTerritory?.terrainWeights;
  const terrainGroups = campaign.settings?.terrainGroups || {};
  const mapCooldownTurns = campaign.settings?.mapCooldownTurns ?? 2;

  // Kick off all three rolls once, the first time step 2 opens.
  useEffect(() => {
    if (step !== 2) return;
    if (!terrainResult && terrainWeights) {
      setTerrainResult(rollTerrainType(terrainWeights));
    }
    if (!weatherResult) {
      setWeatherResult(rollWeatherCondition(campaign.settings?.weatherWeights));
    }
    if (!timeResult) {
      setTimeResult(rollTimeCondition(campaign.settings?.timeWeights));
    }
  }, [step, terrainResult, terrainWeights, weatherResult, timeResult, campaign]);

  // Recompute map pool whenever the terrain roll changes.
  useEffect(() => {
    if (step !== 2) return;
    const rolledTerrainType = terrainResult?.terrainType || null;
    // Resolve the map pool using the rolled terrain type; falls back to
    // territory.maps / territory.terrainGroup / ALL_MAPS inside the util.
    const pool = resolveTerrainMaps(
      defenderTerritory || { maps: null, terrainGroup: null },
      terrainGroups,
      rolledTerrainType
    );
    // Apply cooldown using the shared helper — pass a pseudo-territory with
    // explicit maps so it respects our rolled pool, and reuse its cooldown map.
    const { availableMaps, cooldownMaps: cdMap } = getAvailableMapsForTerritory(
      { maps: pool },
      campaign.battles,
      campaign.currentTurn,
      terrainGroups,
      mapCooldownTurns
    );
    setMapCards(selectMapsForPickBan(availableMaps, 3));
    setCooldownMaps(cdMap);
    setBannedMap(null);
    setPickedMap(null);
  }, [step, terrainResult, defenderTerritory, terrainGroups, mapCooldownTurns, campaign.battles, campaign.currentTurn]);

  // Auto-flip the sides-swap coin the first time we land on a particular
  // conquest map. Changing to a different conquest map reflips; switching
  // away and back also reflips. Re-flip button lets the player reroll.
  useEffect(() => {
    if (!isConquest) {
      if (conquestFlipForMap !== null) setConquestFlipForMap(null);
      return;
    }
    if (conquestFlipForMap !== pickedMap) {
      setSidesSwapped(Math.random() < 0.5);
      setConquestFlipForMap(pickedMap);
    }
  }, [isConquest, pickedMap, conquestFlipForMap]);

  if (!attacker) return null;

  const commit = () => {
    if (!pickedMap || !targetId) return;
    onCreate({
      attackerId,
      defenderId: targetId,
      attackerSupportId: attackerSupportId || null,
      defenderSupportId: defenderSupportId || null,
      mapName: pickedMap,
      terrainType: terrainResult?.terrainType || null,
      weather: weatherResult ? {
        id: weatherResult.condition.id,
        name: weatherResult.condition.name,
      } : null,
      time: timeResult ? {
        id: timeResult.condition.id,
        name: timeResult.condition.name,
      } : null,
      isConquest,
      sidesSwapped: isConquest ? sidesSwapped : false,
    });
  };

  const reflipConquest = () => setSidesSwapped(Math.random() < 0.5);

  const reset = () => {
    setBannedMap(null);
    setPickedMap(null);
    setMapCards([]);
    setTerrainResult(null);
    setWeatherResult(null);
    setTimeResult(null);
    setStep(1);
  };

  const num = (n) => (n || 0).toLocaleString('en-US');
  const terrainOptions = terrainWeights ? Object.keys(terrainWeights) : [];

  /** A rolled condition: the result set large, with a re-roll and an override. */
  const rollBox = (label, value, onRoll, options, selected, onPick, foot = null) => (
    <div className="ui-box">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-eyebrow">{label}</span>
        <button onClick={onRoll} className="ui-btn ui-btn-sm ui-btn-quiet">
          {value ? 'Re-roll' : 'Roll'}
        </button>
      </div>
      <div className="font-bold text-[15px] mt-0.5">{value || '—'}</div>
      <select
        value={selected}
        onChange={onPick}
        aria-label={`Set the ${label.toLowerCase()} by hand`}
        className="ui-field !py-0.5 text-xs mt-1"
      >
        <option value="">— pick by hand —</option>
        {options}
      </select>
      {foot}
    </div>
  );

  const footer = step === 1 ? (
    <>
      <button onClick={onCancel} className="ui-btn flex-1">Cancel</button>
      <button
        onClick={() => setStep(2)}
        disabled={!targetId}
        className="ui-btn ui-btn-primary flex-1"
      >
        Roll for the ground
      </button>
    </>
  ) : (
    <>
      <button onClick={reset} className="ui-btn flex-1">Back</button>
      <button onClick={onCancel} className="ui-btn flex-1">Cancel</button>
      <button
        onClick={commit}
        disabled={!pickedMap}
        className="ui-btn ui-btn-primary flex-1"
      >
        Confirm &amp; end turn
      </button>
    </>
  );

  return (
    <Modal
      title={step === 1 ? 'Declare an attack' : 'Ground, weather and hour'}
      subtitle={step === 1
        ? 'Name the formation to be struck, and any that come up in support.'
        : 'Roll the conditions, the defender strikes a map out, the attacker takes one.'}
      width="max-w-lg"
      onClose={onCancel}
      footer={footer}
    >
      <Row
        label="Attacking with"
        value={
          <>
            <span className={SIDE_TEXT[attacker.side]}>{attacker.name}</span>
            <span className="text-ink-3 font-normal">
              {' · '}{num(attacker.manpower)} men · fatigue {attacker.fatigue}
            </span>
          </>
        }
      />
      {step === 2 && defender && (
        <Row
          label="Against"
          value={
            <>
              <span className={SIDE_TEXT[defender.side]}>{defender.name}</span>
              {locationLabel && (
                <span className="text-ink-3 font-normal"> · {locationLabel}</span>
              )}
            </>
          }
        />
      )}

      {step === 1 && (
        <>
          <div className="mt-4">
            <div className="ui-eyebrow mb-1">The target — enemy within reach</div>
            {targets.length === 0 ? (
              <p className="ui-empty">No enemy formation stands within reach.</p>
            ) : (
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Formation</th>
                    <th className="num">Men</th>
                    <th className="num">Fatigue</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map(t => {
                    const chosen = targetId === t.id;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => { setTargetId(t.id); setDefenderSupportId(null); }}
                        data-open={chosen}
                        className={`cursor-pointer ${chosen ? 'font-bold' : ''}`}
                      >
                        <td>
                          <span className={SIDE_TEXT[t.side]}>{t.name}</span>
                          {chosen && <Tag tone="mark" className="ml-1.5">Chosen</Tag>}
                        </td>
                        <td className="num tabular">{num(t.manpower)}</td>
                        <td className="num tabular">{t.fatigue}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {targetId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="ui-label" htmlFor="attacker-support">
                  In support of the attack
                </label>
                <select
                  id="attacker-support"
                  value={attackerSupportId || ''}
                  onChange={e => setAttackerSupportId(e.target.value || null)}
                  className="ui-field"
                >
                  <option value="">— none —</option>
                  {attackerSupports.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.side}) — {num(t.manpower)} men</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ui-label" htmlFor="defender-support">
                  In support of the defence
                </label>
                <select
                  id="defender-support"
                  value={defenderSupportId || ''}
                  onChange={e => setDefenderSupportId(e.target.value || null)}
                  className="ui-field"
                >
                  <option value="">— none —</option>
                  {defenderSupports.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.side}) — {num(t.manpower)} men</option>
                  ))}
                </select>
              </div>
              <p className="ui-hint sm:col-span-2">One formation a side, at the most.</p>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          {/* Conquest auto-detected from the picked map. When active the
              sides-swap coin is rolled on the fly; the player can re-flip
              or leave it. Draws are permitted only on conquest maps. */}
          {isConquest && (
            <div className="ui-box mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="ui-eyebrow">Conquest map — draws allowed, payout split</span>
                <button onClick={reflipConquest} className="ui-btn ui-btn-sm ui-btn-quiet">
                  Re-flip
                </button>
              </div>
              <div className="font-bold mt-0.5">
                {sidesSwapped ? 'Tails — the sides are swapped' : 'Heads — both play their own colours'}
              </div>
            </div>
          )}

          <div className="mt-4">
            {!terrainWeights ? (
              <div className="ui-box">
                <div className="ui-eyebrow">Terrain</div>
                <p className="ui-hint">
                  The defender's ground carries no terrain weights — the map pool
                  falls back to that territory's own maps, or the global pool.
                </p>
              </div>
            ) : (
              rollBox(
                'Terrain',
                terrainResult?.terrainType,
                () => terrainWeights && setTerrainResult(rollTerrainType(terrainWeights)),
                terrainOptions.map(t => <option key={t} value={t}>{t}</option>),
                terrainResult?.terrainType || '',
                e => setTerrainResult(e.target.value ? { terrainType: e.target.value, roll: 0, total: 0 } : null),
                terrainResult && terrainResult.total > 0 ? (
                  <div className="ui-hint mt-1 tabular">
                    rolled {terrainResult.roll.toFixed(1)} of {terrainResult.total}
                  </div>
                ) : null
              )
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {rollBox(
              'Weather',
              weatherResult?.condition?.name,
              () => setWeatherResult(rollWeatherCondition(campaign.settings?.weatherWeights)),
              Object.values(WEATHER_CONDITIONS).map(c => <option key={c.id} value={c.id}>{c.name}</option>),
              weatherResult?.condition?.id || '',
              e => e.target.value && setWeatherResult({ condition: WEATHER_CONDITIONS[e.target.value], weight: 0, total: 0 })
            )}
            {rollBox(
              'Hour',
              timeResult?.condition?.name,
              () => setTimeResult(rollTimeCondition(campaign.settings?.timeWeights)),
              Object.values(TIME_CONDITIONS).map(c => <option key={c.id} value={c.id}>{c.name}</option>),
              timeResult?.condition?.id || '',
              e => e.target.value && setTimeResult({ condition: TIME_CONDITIONS[e.target.value], weight: 0, total: 0 })
            )}
          </div>

          <p className="ui-hint mt-3">
            Drawn from{' '}
            {defenderTerritory
              ? <>the <span className="not-italic font-bold">{terrainResult?.terrainType || '—'}</span> deck
                in <span className="not-italic font-bold">{defenderTerritory.name}</span></>
              : 'the global fallback pool'}
            {cooldownMaps.size > 0 && (
              <> · {cooldownMaps.size} resting out a {mapCooldownTurns}-turn cooldown</>
            )}
          </p>

          {mapCards.length === 0 ? (
            <p className="ui-empty">
              No map is free just now — the pool is empty or every map is resting.
              Go back and roll different ground, or pick another target.
            </p>
          ) : (
            <div className="mt-3">
              <div className="ui-eyebrow mb-1">
                {!bannedMap
                  ? `The defence strikes one of ${mapCards.length} out`
                  : !pickedMap
                    ? `The attack takes one of the remaining ${mapCards.length - 1}`
                    : 'The ground is settled'}
              </div>
              <div className="flex flex-col gap-1.5">
                {mapCards.map(m => {
                  const isBanned = bannedMap === m;
                  const isPicked = pickedMap === m;
                  const selectableByDefender = !bannedMap;
                  const selectableByAttacker = bannedMap && !pickedMap && !isBanned;
                  const handler = () => {
                    if (selectableByDefender) setBannedMap(m);
                    else if (selectableByAttacker) setPickedMap(m);
                  };
                  return (
                    <button
                      key={m}
                      onClick={handler}
                      disabled={isBanned || (!selectableByDefender && !selectableByAttacker && !isPicked)}
                      className={`ui-box flex items-baseline justify-between gap-2 text-left transition ${
                        isPicked ? 'bg-paper-2' : ''
                      } ${isBanned ? 'opacity-60' : 'hover:bg-paper-2'}`}
                    >
                      <span className={`font-bold ${isBanned ? 'line-through text-ink-3' : ''}`}>{m}</span>
                      {isBanned && <Tag tone="mark">Struck out</Tag>}
                      {isPicked && <Tag tone="good">Taken</Tag>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default GrandBattleModal;
