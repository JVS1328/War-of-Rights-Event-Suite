import { useState } from 'react';
import { X, Settings, Save, Plus, Trash2, Users, MapPin, ChevronDown, ChevronRight, Cloud, Sun, CloudRain, Moon, Eye } from 'lucide-react';
import { ALL_MAPS, DEFAULT_TERRAIN_GROUPS } from '../data/territories';
import {
  WEATHER_CONDITIONS,
  TIME_CONDITIONS,
  DEFAULT_WEATHER_WEIGHTS,
  DEFAULT_TIME_WEIGHTS
} from '../utils/battleConditions';
import { PATTERN_TYPES, DEFAULT_TERRAIN_VIZ, defaultVizEntry, generateTerrainPatterns } from '../utils/terrainPatterns.jsx';
import GrandCampaignSettings from './GrandCampaignSettings';
import { GRAND_CAMPAIGN_DEFAULTS } from '../data/grandCampaign';

const SettingsModal = ({ campaign, onSave, onClose }) => {
  const [settings, setSettings] = useState({
    name: campaign.name,
    ...campaign.settings
  });

  // Regiment management state
  const [regiments, setRegiments] = useState({
    USA: campaign.regiments?.USA || [],
    CSA: campaign.regiments?.CSA || []
  });
  const [newRegimentName, setNewRegimentName] = useState({ USA: '', CSA: '' });

  // Terrain groups state
  const [terrainGroups, setTerrainGroups] = useState(
    campaign.settings?.terrainGroups || { ...DEFAULT_TERRAIN_GROUPS }
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroup, setExpandedGroup] = useState(null);

  // Terrain visualization config — per-group pattern type, colors, density scaling
  const [terrainViz, setTerrainViz] = useState(
    campaign.settings?.terrainViz || { ...DEFAULT_TERRAIN_VIZ }
  );

  // Battle conditions weights state
  const [weatherWeights, setWeatherWeights] = useState(
    campaign.settings?.weatherWeights || { ...DEFAULT_WEATHER_WEIGHTS }
  );
  const [timeWeights, setTimeWeights] = useState(
    campaign.settings?.timeWeights || { ...DEFAULT_TIME_WEIGHTS }
  );

  // Grand Campaign settings — only editable when the campaign is in GC mode.
  const isGrandCampaign = campaign.campaignStyle === 'grand';
  const [gcSettings, setGcSettings] = useState(
    isGrandCampaign
      ? { ...GRAND_CAMPAIGN_DEFAULTS, ...(campaign.grandCampaign?.settings || {}) }
      : null
  );

  const handleSubmit = () => {
    onSave({ ...settings, terrainGroups, terrainViz, regiments, weatherWeights, timeWeights, gcSettings });
  };

  const updateSetting = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  const addRegiment = (side) => {
    const name = newRegimentName[side].trim();
    if (!name) return;

    const newRegiment = {
      id: `${side.toLowerCase()}-${Date.now()}`,
      name: name
    };

    setRegiments({
      ...regiments,
      [side]: [...regiments[side], newRegiment]
    });
    setNewRegimentName({ ...newRegimentName, [side]: '' });
  };

  const removeRegiment = (side, regimentId) => {
    setRegiments({
      ...regiments,
      [side]: regiments[side].filter(r => r.id !== regimentId)
    });
  };

  // Terrain group management
  const addTerrainGroup = () => {
    const name = newGroupName.trim();
    if (!name || terrainGroups[name]) return;
    setTerrainGroups({ ...terrainGroups, [name]: [] });
    setTerrainViz({ ...terrainViz, [name]: defaultVizEntry() });
    setNewGroupName('');
    setExpandedGroup(name);
  };

  const removeTerrainGroup = (groupName) => {
    const updatedGroups = { ...terrainGroups };
    delete updatedGroups[groupName];
    setTerrainGroups(updatedGroups);
    const updatedViz = { ...terrainViz };
    delete updatedViz[groupName];
    setTerrainViz(updatedViz);
    if (expandedGroup === groupName) setExpandedGroup(null);
  };

  // Terrain viz helpers
  const updateVizField = (groupName, field, value) => {
    setTerrainViz({ ...terrainViz, [groupName]: { ...(terrainViz[groupName] || defaultVizEntry()), [field]: value } });
  };

  const toggleMapInGroup = (groupName, mapName) => {
    const maps = terrainGroups[groupName] || [];
    const updated = maps.includes(mapName)
      ? maps.filter(m => m !== mapName)
      : [...maps, mapName];
    setTerrainGroups({ ...terrainGroups, [groupName]: updated });
  };

  return (
    <div className="ui-modal-backdrop">
      <div className="ui-modal max-w-2xl">
        <div className="ui-modal-head">
          <div className="ui-modal-title">
            <Settings className="w-5 h-5" />
            Campaign Settings
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-quiet ui-btn-icon" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="ui-modal-body ui-scroll">
          {/* Form */}
          <div className="space-y-5">
            {/* Grand Campaign section — only shown for GC style campaigns */}
            {isGrandCampaign && gcSettings && (
              <GrandCampaignSettings
                gcSettings={gcSettings}
                onChange={setGcSettings}
              />
            )}

            {/* Campaign Info */}
            <div className="ui-inset p-4">
              <h3 className="ui-title mb-4">Campaign Information</h3>
              <div>
                <label className="ui-label">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => updateSetting('name', e.target.value)}
                  className="ui-field"
                />
              </div>
            </div>

            {/* Game Rules */}
            <div className="ui-inset p-4">
              <h3 className="ui-title mb-4">Game Rules</h3>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.allowTerritoryRecapture}
                    onChange={(e) => updateSetting('allowTerritoryRecapture', e.target.checked)}
                    className="w-4 h-4 mt-1 shrink-0 rounded border-ink-600 bg-ink-850 text-brass-400 focus:ring-brass-400"
                  />
                  <div>
                    <div className="text-white font-semibold">Allow Territory Recapture</div>
                    <div className="text-xs text-mist-400">
                      Territories can change hands multiple times during the campaign
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.requireAdjacentAttack}
                    onChange={(e) => updateSetting('requireAdjacentAttack', e.target.checked)}
                    className="w-4 h-4 mt-1 shrink-0 rounded border-ink-600 bg-ink-850 text-brass-400 focus:ring-brass-400"
                  />
                  <div>
                    <div className="text-white font-semibold">Require Adjacent Territory Attacks</div>
                    <div className="text-xs text-mist-400">
                      Can only attack territories adjacent to owned territories
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.casualtyTracking}
                    onChange={(e) => updateSetting('casualtyTracking', e.target.checked)}
                    className="w-4 h-4 mt-1 shrink-0 rounded border-ink-600 bg-ink-850 text-brass-400 focus:ring-brass-400"
                  />
                  <div>
                    <div className="text-white font-semibold">Track Casualties</div>
                    <div className="text-xs text-mist-400">
                      Record casualty counts for each battle
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.failedNeutralAttackToEnemy !== false}
                    onChange={(e) => updateSetting('failedNeutralAttackToEnemy', e.target.checked)}
                    className="w-4 h-4 mt-1 shrink-0 rounded border-ink-600 bg-ink-850 text-brass-400 focus:ring-brass-400"
                  />
                  <div>
                    <div className="text-white font-semibold">Failed Attack on Neutral Territories Falls to Enemy Hands?</div>
                    <div className="text-xs text-mist-400">
                      When enabled, a failed attack on a neutral territory transfers control to the opposing side
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.instantVPGains !== false}
                    onChange={(e) => updateSetting('instantVPGains', e.target.checked)}
                    className="w-4 h-4 mt-1 shrink-0 rounded border-ink-600 bg-ink-850 text-brass-400 focus:ring-brass-400"
                  />
                  <div>
                    <div className="text-white font-semibold">Instant VP Gains</div>
                    <div className="text-xs text-mist-400">
                      Award victory points immediately upon capturing a region
                    </div>
                  </div>
                </label>

                {settings.instantVPGains === false && (
                  <div className="ml-7 mt-2 bg-ink-850 rounded-lg p-3 border border-ink-700">
                    <label className="block">
                      <div className="text-white font-semibold mb-2 text-sm">
                        Capture Transition Duration (turns)
                      </div>
                      <div className="text-xs text-mist-400 mb-2">
                        Number of turns required to fully capture a region and gain its VP
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={settings.captureTransitionTurns || 2}
                        onChange={(e) => updateSetting('captureTransitionTurns', parseInt(e.target.value))}
                        className="w-24 px-3 py-2 bg-ink-800 text-white rounded border border-ink-700 focus:border-brass-400 outline-none"
                      />
                    </label>
                  </div>
                )}

                <div className="mt-3 bg-ink-850 rounded-lg p-3 border border-ink-700">
                  <label className="block">
                    <div className="text-white font-semibold mb-2 text-sm">
                      Season Length (turns)
                    </div>
                    <div className="text-xs text-mist-400 mb-2">
                      The campaign resolves on this turn, scored on territory VP with
                      remaining SP as the tiebreaker — so a side behind on the map has to
                      come out and attack before the clock runs out. 0 disables the cap
                      and runs to the campaign end date instead.
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={settings.seasonLengthTurns ?? 0}
                      onChange={(e) => updateSetting('seasonLengthTurns', parseInt(e.target.value) || 0)}
                      className="w-24 px-3 py-2 bg-ink-800 text-white rounded border border-ink-700 focus:border-brass-400 outline-none"
                    />
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer mt-3 pt-3 border-t border-ink-700">
                    <input
                      type="checkbox"
                      checked={settings.capitalVictoryEnabled === true}
                      onChange={(e) => updateSetting('capitalVictoryEnabled', e.target.checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-white font-semibold text-sm">
                        Capital victory
                      </div>
                      <div className="text-xs text-mist-400 mt-1">
                        Holding every enemy capital at once wins immediately. Replaces
                        total territorial control, which needs the whole map and can
                        never realistically fire.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="mt-3 bg-ink-850 rounded-lg p-3 border border-ink-700">
                  <label className="block">
                    <div className="text-white font-semibold mb-2 text-sm">
                      Map Cooldown (turns)
                    </div>
                    <div className="text-xs text-mist-400 mb-2">
                      After a map is played on a territory, it cannot be played again for this many turns.
                      Set to 0 to disable map cooldown.
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={settings.mapCooldownTurns ?? 2}
                      onChange={(e) => updateSetting('mapCooldownTurns', Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-24 px-3 py-2 bg-ink-800 text-white rounded border border-ink-700 focus:border-brass-400 outline-none"
                    />
                  </label>
                </div>
              </div>
            </div>
  
            {/* Supply Points System */}
            <div className="ui-inset p-4">
              <h3 className="ui-title mb-4">Supply Points (SP) System</h3>
              <div className="space-y-4">
                {/* Starting SP/VP */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-white font-semibold mb-2 text-sm">
                      Starting SP per side
                    </div>
                    <div className="text-xs text-mist-400 mb-2">
                      Initial Supply Points pool for each faction
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={settings.startingCP || 500}
                      onChange={(e) => updateSetting('startingCP', parseInt(e.target.value) || 0)}
                      className="ui-field"
                    />
                  </label>
                  <label className="block">
                    <div className="text-white font-semibold mb-2 text-sm">
                      VP Base (Multiplier)
                    </div>
                    <div className="text-xs text-mist-400 mb-2">
                      Base VP for 1x multiplier (1 for county maps, 5 for state maps)
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.vpBase || 1}
                      onChange={(e) => updateSetting('vpBase', parseInt(e.target.value) || 1)}
                      className="ui-field"
                    />
                  </label>
                </div>

                {/* Ticket-weighted losses */}
                <div className="ui-inset p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.ticketCostEnabled === true}
                      onChange={(e) => updateSetting('ticketCostEnabled', e.target.checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-white font-semibold text-sm">
                        Ticket-weighted losses
                      </div>
                      <div className="text-xs text-mist-400 mt-1">
                        Bill supply by ticket damage (1× In Formation, 3× Skirmish,
                        5× Out of Line) instead of a share of a fixed maximum, so how a
                        side fought drives the cost. Battle Recorder gains a stance
                        breakdown under each side's casualty total.
                        <span className="text-brass-400"> Raise Starting SP and Income per VP to match —
                        ticket damage runs ~20× larger than casualty-share costs.</span>
                      </div>
                    </div>
                  </label>

                  {settings.ticketCostEnabled && (
                    <div className="grid grid-cols-2 gap-3 mt-3 pl-7">
                      <label className="block">
                        <div className="text-brass-300 font-semibold mb-1 text-sm">
                          Income per VP / turn
                        </div>
                        <div className="text-xs text-mist-400 mb-1">
                          SP generated per point of territory held
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={settings.incomePerVP ?? 1}
                          onChange={(e) => updateSetting('incomePerVP', parseInt(e.target.value) || 1)}
                          className="ui-field"
                        />
                      </label>
                      <label className="block">
                        <div className="text-brass-300 font-semibold mb-1 text-sm">
                          SP per N tickets
                        </div>
                        <div className="text-xs text-mist-400 mb-1">
                          Divisor: base costs read as SP per this many tickets
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={settings.ticketCostDivisor ?? 100}
                          onChange={(e) => updateSetting('ticketCostDivisor', parseInt(e.target.value) || 100)}
                          className="ui-field"
                        />
                      </label>
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer mt-3 pt-3 border-t border-ink-700">
                    <input
                      type="checkbox"
                      checked={settings.vpCurve === 'compressed'}
                      onChange={(e) => updateSetting('vpCurve', e.target.checked ? 'compressed' : 'linear')}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-white font-semibold text-sm">
                        Compressed VP multiplier
                      </div>
                      <div className="text-xs text-mist-400 mt-1">
                        A 7-point capital costs 4× a 1-point county rather than 7×, so a
                        single capital assault can't decide a season on its own.
                      </div>
                    </div>
                  </label>

                  <label className="block mt-3 pt-3 border-t border-ink-700">
                    <div className="text-white font-semibold mb-1 text-sm">
                      Capture bounty (SP per VP)
                    </div>
                    <div className="text-xs text-mist-400 mb-2">
                      Supply refunded to the attacker on a successful capture — seized
                      depots and stores — paid immediately rather than waiting out the
                      transition window. 0 disables it.
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={settings.captureBounty ?? 0}
                      onChange={(e) => updateSetting('captureBounty', parseInt(e.target.value) || 0)}
                      className="ui-field"
                    />
                  </label>
                </div>

                {/* Base SP Cost Settings */}
                <div>
                  <div className="text-white font-semibold mb-2">Base SP Loss Values</div>
                  <div className="text-xs text-mist-400 mb-3">
                    {settings.ticketCostEnabled
                      ? `Read as SP per ${settings.ticketCostDivisor ?? 100} tickets of damage, before VP multipliers`
                      : 'Configure the base SP loss values before VP multipliers are applied'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <div className="text-brass-300 font-semibold mb-1 text-sm">
                        Attack Enemy Territory
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={settings.baseAttackCostEnemy ?? 75}
                        onChange={(e) => updateSetting('baseAttackCostEnemy', parseInt(e.target.value) || 0)}
                        className="ui-field"
                      />
                    </label>
                    <label className="block">
                      <div className="text-brass-300 font-semibold mb-1 text-sm">
                        Attack Neutral Territory
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={settings.baseAttackCostNeutral ?? 50}
                        onChange={(e) => updateSetting('baseAttackCostNeutral', parseInt(e.target.value) || 0)}
                        className="ui-field"
                      />
                    </label>
                    <label className="block">
                      <div className="text-brass-300 font-semibold mb-1 text-sm">
                        Defend Friendly Territory
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={settings.baseDefenseCostFriendly ?? 25}
                        onChange={(e) => updateSetting('baseDefenseCostFriendly', parseInt(e.target.value) || 0)}
                        className="ui-field"
                      />
                    </label>
                    <label className="block">
                      <div className="text-brass-300 font-semibold mb-1 text-sm">
                        Defend Neutral Territory
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={settings.baseDefenseCostNeutral ?? 50}
                        onChange={(e) => updateSetting('baseDefenseCostNeutral', parseInt(e.target.value) || 0)}
                        className="ui-field"
                      />
                    </label>
                  </div>
                </div>

                {/* SP Calculation Mode */}
                <div>
                  <label className="block">
                    <div className="text-white font-semibold mb-2">
                      SP Loss Calculation Mode
                    </div>
                    <div className="text-xs text-mist-400 mb-2">
                      Choose how SP losses are calculated during battles
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => updateSetting('cpCalculationMode', 'auto')}
                        className={`flex-1 px-4 py-2 rounded font-semibold transition ${
                          (settings.cpCalculationMode || 'auto') === 'auto'
                            ? 'bg-brass-500 text-white'
                            : 'bg-ink-850 text-mist-300 hover:bg-ink-800'
                        }`}
                      >
                        <div className="text-sm font-bold">Auto Calculate</div>
                        <div className="text-xs mt-1 opacity-80">Based on VP & casualties</div>
                      </button>
                      <button
                        onClick={() => updateSetting('cpCalculationMode', 'manual')}
                        className={`flex-1 px-4 py-2 rounded font-semibold transition ${
                          settings.cpCalculationMode === 'manual'
                            ? 'bg-brass-500 text-white'
                            : 'bg-ink-850 text-mist-300 hover:bg-ink-800'
                        }`}
                      >
                        <div className="text-sm font-bold">Manual Entry</div>
                        <div className="text-xs mt-1 opacity-80">Enter SP loss manually</div>
                      </button>
                    </div>
                  </label>
                </div>
              </div>
            </div>
  
            {/* Team Abilities */}
            <div className="ui-inset p-4">
              <h3 className="ui-title mb-4">Team Abilities</h3>
              <div>
                <label className="block">
                  <div className="text-white font-semibold mb-2">
                    Ability Cooldown (turns)
                  </div>
                  <div className="text-xs text-mist-400 mb-2">
                    Number of turns before an ability can be used again after activation
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.abilityCooldown || 2}
                    onChange={(e) => updateSetting('abilityCooldown', parseInt(e.target.value))}
                    className="w-24 px-3 py-2 bg-ink-850 text-white rounded border border-ink-700 focus:border-brass-400 outline-none"
                  />
                </label>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="bg-ink-850 rounded p-3">
                    <div className="text-rebel-400 font-semibold mb-1">Valley Supply Lines (CSA)</div>
                    <div className="text-mist-300 text-xs">
                      When attacking: Attack SP loss reduced by 50%
                    </div>
                  </div>
                  <div className="bg-ink-850 rounded p-3">
                    <div className="text-union-400 font-semibold mb-1">Special Orders 191 (USA)</div>
                    <div className="text-mist-300 text-xs">
                      When attacking: Failed attacks on neutral territories keep them neutral (if setting enabled),
                      successful attacks triple CSA SP loss
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Battle Conditions Weights */}
            <div className="ui-inset p-4">
              <h3 className="text-lg font-semibold text-brass-300 mb-2">Battle Conditions</h3>
              <p className="text-xs text-mist-400 mb-4">
                Adjust the roll weights for weather and time of day. Higher weight = more likely to be rolled.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Weather Weights */}
                <div>
                  <div className="text-white font-semibold mb-2 text-sm flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-mist-400" />
                    Weather
                  </div>
                  {/* Preview bar */}
                  {(() => {
                    const total = Object.values(weatherWeights).reduce((s, w) => s + w, 0);
                    return (
                      <div className="flex rounded overflow-hidden h-5 mb-3">
                        {Object.entries(weatherWeights).filter(([,w]) => w > 0).map(([id, weight]) => (
                          <div
                            key={id}
                            style={{ flex: weight }}
                            className="flex items-center justify-center text-[9px] font-medium text-mist-300 bg-ink-700 border-r border-ink-600 last:border-r-0"
                          >
                            {total > 0 ? `${Math.round(weight / total * 100)}%` : ''}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="space-y-2">
                    {Object.entries(WEATHER_CONDITIONS).map(([key, cond]) => (
                      <div key={key} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {cond.id === 'clear' ? <Sun className="w-3.5 h-3.5 text-yellow-400 shrink-0" /> :
                           cond.id === 'rain' ? <Cloud className="w-3.5 h-3.5 text-union-400 shrink-0" /> :
                           <CloudRain className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                          <span className="text-white text-xs truncate">{cond.name}</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={weatherWeights[cond.id] ?? 0}
                          onChange={(e) => setWeatherWeights({ ...weatherWeights, [cond.id]: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-14 px-2 py-1 bg-ink-850 text-white rounded border border-ink-700 focus:border-brass-400 outline-none text-xs text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setWeatherWeights({ ...DEFAULT_WEATHER_WEIGHTS })}
                    className="mt-2 text-xs text-mist-400 hover:text-mist-300 transition"
                  >
                    Reset to defaults
                  </button>
                </div>

                {/* Time Weights */}
                <div>
                  <div className="text-white font-semibold mb-2 text-sm flex items-center gap-2">
                    <Moon className="w-4 h-4 text-mist-400" />
                    Time of Day
                  </div>
                  {/* Preview bar */}
                  {(() => {
                    const total = Object.values(timeWeights).reduce((s, w) => s + w, 0);
                    return (
                      <div className="flex rounded overflow-hidden h-5 mb-3">
                        {Object.entries(timeWeights).filter(([,w]) => w > 0).map(([id, weight]) => (
                          <div
                            key={id}
                            style={{ flex: weight }}
                            className="flex items-center justify-center text-[9px] font-medium text-mist-300 bg-ink-700 border-r border-ink-600 last:border-r-0"
                          >
                            {total > 0 ? `${Math.round(weight / total * 100)}%` : ''}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="space-y-2">
                    {Object.entries(TIME_CONDITIONS).map(([key, cond]) => (
                      <div key={key} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <Moon className={`w-3.5 h-3.5 shrink-0 ${cond.id === 'night' ? 'text-indigo-400' : 'text-brass-400'}`} />
                          <span className="text-white text-xs truncate">{cond.name}</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={timeWeights[cond.id] ?? 0}
                          onChange={(e) => setTimeWeights({ ...timeWeights, [cond.id]: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-14 px-2 py-1 bg-ink-850 text-white rounded border border-ink-700 focus:border-brass-400 outline-none text-xs text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setTimeWeights({ ...DEFAULT_TIME_WEIGHTS })}
                    className="mt-2 text-xs text-mist-400 hover:text-mist-300 transition"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            </div>

            {/* Terrain Map Groups */}
            <div className="ui-inset p-4">
              <h3 className="text-lg font-semibold text-brass-300 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Terrain Map Groups
              </h3>
              <p className="text-xs text-mist-400 mb-4">
                Define reusable map groups by terrain type. Territories can reference a terrain group
                instead of individual maps. Location-specific mapsets (Antietam, Harpers Ferry, South Mountain)
                remain assigned directly to territories.
              </p>

              {/* Existing Groups */}
              <div className="space-y-2 mb-4">
                {Object.keys(terrainGroups).length === 0 ? (
                  <div className="text-xs text-mist-500 italic">No terrain groups defined</div>
                ) : (
                  Object.entries(terrainGroups).map(([groupName, maps]) => (
                    <div key={groupName} className="bg-ink-850 rounded border border-ink-700">
                      {/* Group Header */}
                      <div className="flex items-center justify-between px-3 py-2">
                        <button
                          onClick={() => setExpandedGroup(expandedGroup === groupName ? null : groupName)}
                          className="flex items-center gap-2 text-left flex-1"
                        >
                          {expandedGroup === groupName
                            ? <ChevronDown className="w-4 h-4 text-mist-400" />
                            : <ChevronRight className="w-4 h-4 text-mist-400" />
                          }
                          <span className="text-white font-semibold text-sm">{groupName}</span>
                          <span className="text-xs text-mist-400">({maps.length} maps)</span>
                        </button>
                        <button
                          onClick={() => removeTerrainGroup(groupName)}
                          className="p-1 hover:bg-rebel-500 rounded transition"
                          title={`Remove ${groupName} group`}
                        >
                          <Trash2 className="w-3 h-3 text-rebel-400" />
                        </button>
                      </div>

                      {/* Expanded: Visualization + Map Checklist */}
                      {expandedGroup === groupName && (
                        <div className="px-3 pb-3 border-t border-ink-800">
                          {/* Visualization Editor */}
                          {(() => {
                            const viz = terrainViz[groupName] || defaultVizEntry();
                            return (
                              <div className="mt-2 mb-3 bg-ink-900 rounded p-2.5 border border-ink-700">
                                <div className="text-xs text-mist-400 font-semibold mb-2 flex items-center gap-1.5">
                                  <Eye className="w-3 h-3" /> Map Visualization
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                  {/* Pattern type */}
                                  <label className="flex items-center gap-1.5">
                                    <span className="text-xs text-mist-400">Pattern</span>
                                    <select
                                      value={viz.patternType}
                                      onChange={(e) => updateVizField(groupName, 'patternType', e.target.value)}
                                      className="px-1.5 py-0.5 bg-ink-800 text-white rounded border border-ink-700 text-xs outline-none focus:border-brass-400"
                                    >
                                      {Object.entries(PATTERN_TYPES).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  {/* Colors */}
                                  <label className="flex items-center gap-1.5">
                                    <span className="text-xs text-mist-400">Color</span>
                                    <input
                                      type="color"
                                      value={viz.color}
                                      onChange={(e) => updateVizField(groupName, 'color', e.target.value)}
                                      className="w-6 h-6 rounded border border-ink-700 cursor-pointer bg-transparent"
                                    />
                                  </label>
                                  <label className="flex items-center gap-1.5">
                                    <span className="text-xs text-mist-400">Alt</span>
                                    <input
                                      type="color"
                                      value={viz.colorAlt}
                                      onChange={(e) => updateVizField(groupName, 'colorAlt', e.target.value)}
                                      className="w-6 h-6 rounded border border-ink-700 cursor-pointer bg-transparent"
                                    />
                                  </label>
                                  {/* Density scaling toggle */}
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={viz.densityScaling}
                                      onChange={(e) => updateVizField(groupName, 'densityScaling', e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-ink-600 bg-ink-800 text-brass-400 focus:ring-brass-400"
                                    />
                                    <span className="text-xs text-mist-400">Density scaling</span>
                                  </label>
                                  {/* Live preview */}
                                  <svg width="48" height="24" className="rounded border border-ink-700 bg-ink-850 shrink-0">
                                    <defs>
                                      {generateTerrainPatterns(`preview-${groupName}`, viz)}
                                    </defs>
                                    <rect
                                      width="48" height="24"
                                      fill={`url(#terrain-preview-${groupName}${viz.densityScaling ? '-dense' : ''})`}
                                      opacity="0.6"
                                    />
                                  </svg>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Map Checklist */}
                          <div className="text-xs text-mist-400 mb-2">
                            Select maps for this terrain group:
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {ALL_MAPS.map(mapName => (
                              <label key={mapName} className="flex items-center gap-2 cursor-pointer hover:bg-ink-800 rounded px-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={maps.includes(mapName)}
                                  onChange={() => toggleMapInGroup(groupName, mapName)}
                                  className="w-3.5 h-3.5 rounded border-ink-600 bg-ink-800 text-brass-400 focus:ring-brass-400"
                                />
                                <span className="text-white text-xs">{mapName}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add New Group */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTerrainGroup()}
                  className="flex-1 px-2 py-1 bg-ink-850 text-white rounded border border-ink-700 focus:border-brass-400 outline-none text-sm"
                />
                <button
                  onClick={addTerrainGroup}
                  disabled={!newGroupName.trim() || terrainGroups[newGroupName.trim()]}
                  className="px-3 py-1 bg-brass-500 hover:bg-brass-500 disabled:bg-ink-700 disabled:cursor-not-allowed text-white rounded transition text-sm font-semibold flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Group
                </button>
              </div>
            </div>

            {/* Regiment Management */}
            <div className="ui-inset p-4">
              <h3 className="text-lg font-semibold text-brass-300 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Regiment Management
              </h3>
              <p className="text-xs text-mist-400 mb-4">
                Add regiments for each side. Commanders will be randomly selected from these lists for each battle.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* USA Regiments */}
                <div>
                  <div className="text-union-400 font-semibold mb-2 text-sm">USA Regiments ({regiments.USA.length})</div>
                  <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                    {regiments.USA.length === 0 ? (
                      <div className="text-xs text-mist-500 italic">No regiments added</div>
                    ) : (
                      regiments.USA.map(regiment => (
                        <div key={regiment.id} className="flex items-center justify-between bg-ink-850 rounded px-2 py-1">
                          <span className="text-white text-sm truncate">{regiment.name}</span>
                          <button
                            onClick={() => removeRegiment('USA', regiment.id)}
                            className="p-1 hover:bg-rebel-500 rounded transition"
                            title="Remove regiment"
                          >
                            <Trash2 className="w-3 h-3 text-rebel-400" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Regiment name..."
                      value={newRegimentName.USA}
                      onChange={(e) => setNewRegimentName({ ...newRegimentName, USA: e.target.value })}
                      onKeyPress={(e) => e.key === 'Enter' && addRegiment('USA')}
                      className="ui-field text-sm"
                    />
                    <button
                      onClick={() => addRegiment('USA')}
                      className="ui-btn ui-btn-union ui-btn-sm"
                      title="Add regiment"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* CSA Regiments */}
                <div>
                  <div className="text-rebel-400 font-semibold mb-2 text-sm">CSA Regiments ({regiments.CSA.length})</div>
                  <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                    {regiments.CSA.length === 0 ? (
                      <div className="text-xs text-mist-500 italic">No regiments added</div>
                    ) : (
                      regiments.CSA.map(regiment => (
                        <div key={regiment.id} className="flex items-center justify-between bg-ink-850 rounded px-2 py-1">
                          <span className="text-white text-sm truncate">{regiment.name}</span>
                          <button
                            onClick={() => removeRegiment('CSA', regiment.id)}
                            className="p-1 hover:bg-rebel-500 rounded transition"
                            title="Remove regiment"
                          >
                            <Trash2 className="w-3 h-3 text-rebel-400" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Regiment name..."
                      value={newRegimentName.CSA}
                      onChange={(e) => setNewRegimentName({ ...newRegimentName, CSA: e.target.value })}
                      onKeyPress={(e) => e.key === 'Enter' && addRegiment('CSA')}
                      className="ui-field text-sm"
                    />
                    <button
                      onClick={() => addRegiment('CSA')}
                      className="ui-btn ui-btn-rebel ui-btn-sm"
                      title="Add regiment"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="ui-modal-foot">
          <button onClick={handleSubmit} className="ui-btn ui-btn-primary flex-1">
            <Save className="w-4 h-4" />
            Save Settings
          </button>
          <button onClick={onClose} className="ui-btn ui-btn-ghost flex-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;