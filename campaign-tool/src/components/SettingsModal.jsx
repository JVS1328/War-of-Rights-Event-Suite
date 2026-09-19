import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { Modal, Section, SectionHead, SectionBody, Tag, SIDE_TEXT } from './ui/Primitives';

/**
 * A ruled setting line: what it is, what it means, and the field that sets it.
 * Declared out here rather than inside the modal so that typing in a field
 * doesn't remount the line under the cursor.
 */
const Setting = ({ label, hint, children }) => (
  <label className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-paper-3 py-2">
    <span className="min-w-[12rem] flex-1">
      <span className="ui-label mb-0 block">{label}</span>
      {hint && <span className="ui-hint block">{hint}</span>}
    </span>
    <span className="shrink-0">{children}</span>
  </label>
);

/** The same line, with a checkbox in place of the field. */
const Check = ({ checked, onChange, label, hint }) => (
  <label className="flex cursor-pointer items-start gap-3 border-b border-paper-3 py-2">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="mt-1 h-4 w-4 shrink-0 accent-ink"
    />
    <span className="min-w-0">
      <span className="block font-bold">{label}</span>
      {hint && <span className="ui-hint block">{hint}</span>}
    </span>
  </label>
);

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

  /** The odds of a weighted roll: the bar, then the shares spelled out. */
  const oddsStrip = (entries) => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    const shown = entries.filter(([, w]) => w > 0);
    return (
      <>
        <div className="ui-bar">
          {shown.map(([id, weight], i) => (
            <i key={id} style={{ flex: weight }} className={i % 2 ? 'bg-paper-3' : 'bg-ink-3'} />
          ))}
        </div>
        <div className="ui-hint mt-1">
          {shown.map(([id, weight], i) => (
            <span key={id}>
              {i > 0 && <span className="text-ink-3"> · </span>}
              {id} {total > 0 ? Math.round((weight / total) * 100) : 0}%
            </span>
          ))}
        </div>
      </>
    );
  };

  /** One weighted-roll table: conditions down the side, weights in the column. */
  const weightTable = (label, conditions, weights, setWeights, defaults) => (
    <div>
      <div className="ui-eyebrow mb-1.5">{label}</div>
      {oddsStrip(Object.entries(conditions).map(([, cond]) => [cond.name, weights[cond.id] ?? 0]))}
      <table className="ui-table mt-2">
        <thead>
          <tr>
            <th>Condition</th>
            <th className="num">Weight</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(conditions).map(([key, cond]) => (
            <tr key={key}>
              <td>{cond.name}</td>
              <td className="num">
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={weights[cond.id] ?? 0}
                  onChange={(e) => setWeights({ ...weights, [cond.id]: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="ui-field w-16 py-0.5 text-right text-sm tabular"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => setWeights({ ...defaults })}
        className="ui-btn ui-btn-quiet ui-btn-sm mt-1 !px-0"
      >
        Reset to defaults
      </button>
    </div>
  );

  /** One side's roll of regiments, with the line that adds to it. */
  const regimentColumn = (side, label) => (
    <div>
      <div className={`ui-eyebrow mb-1 ${SIDE_TEXT[side]}`}>
        {label} — {regiments[side].length}
      </div>
      {regiments[side].length === 0 ? (
        <p className="ui-hint">None on the roll.</p>
      ) : (
        <div className="ui-scroll max-h-40">
          <table className="ui-table">
            <tbody>
              {regiments[side].map(regiment => (
                <tr key={regiment.id}>
                  <td className="truncate">{regiment.name}</td>
                  <td className="num w-12">
                    <button
                      onClick={() => removeRegiment(side, regiment.id)}
                      className="ui-btn ui-btn-icon ui-btn-sm ui-btn-danger"
                      title="Remove regiment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          placeholder="Regiment name…"
          value={newRegimentName[side]}
          onChange={(e) => setNewRegimentName({ ...newRegimentName, [side]: e.target.value })}
          onKeyPress={(e) => e.key === 'Enter' && addRegiment(side)}
          className="ui-field text-sm"
        />
        <button onClick={() => addRegiment(side)} className="ui-btn ui-btn-sm" title="Add regiment">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      dismissible={false}
      title="Campaign settings"
      subtitle="The rules of the campaign, the pools they draw on, and the regiments on the roll."
      width="max-w-3xl"
      onClose={onClose}
      footer={
        <>
          <button onClick={handleSubmit} className="ui-btn ui-btn-primary flex-1">
            Save settings
          </button>
          <button onClick={onClose} className="ui-btn flex-1">
            Cancel
          </button>
        </>
      }
    >
      {/* Grand Campaign — only for campaigns run in that style */}
      {isGrandCampaign && gcSettings && (
        <GrandCampaignSettings gcSettings={gcSettings} onChange={setGcSettings} />
      )}

      {/* ---------- The campaign ---------- */}
      <Section>
        <SectionHead title="The campaign" />
        <SectionBody>
          <label className="ui-label">Campaign name</label>
          <input
            type="text"
            value={settings.name}
            onChange={(e) => updateSetting('name', e.target.value)}
            className="ui-field"
          />
        </SectionBody>
      </Section>

      {/* ---------- Game rules ---------- */}
      <Section>
        <SectionHead title="Game rules" />
        <SectionBody>
          <Check
            checked={settings.allowTerritoryRecapture}
            onChange={(e) => updateSetting('allowTerritoryRecapture', e.target.checked)}
            label="Allow territory recapture"
            hint="Territories can change hands more than once during the campaign"
          />
          <Check
            checked={settings.requireAdjacentAttack}
            onChange={(e) => updateSetting('requireAdjacentAttack', e.target.checked)}
            label="Require adjacent attacks"
            hint="A side may only attack territories bordering ground it already holds"
          />
          <Check
            checked={settings.casualtyTracking}
            onChange={(e) => updateSetting('casualtyTracking', e.target.checked)}
            label="Track casualties"
            hint="Record the butcher's bill for each battle"
          />
          <Check
            checked={settings.failedNeutralAttackToEnemy !== false}
            onChange={(e) => updateSetting('failedNeutralAttackToEnemy', e.target.checked)}
            label="A failed attack on neutral ground falls to the enemy"
            hint="When enabled, a failed attack on a neutral territory hands control to the opposing side"
          />
          <Check
            checked={settings.instantVPGains !== false}
            onChange={(e) => updateSetting('instantVPGains', e.target.checked)}
            label="Instant VP gains"
            hint="Award victory points the moment a region is taken"
          />

          {settings.instantVPGains === false && (
            <Setting
              label="Capture transition (turns)"
              hint="Turns required to fully capture a region and gain its VP"
            >
              <input
                type="number"
                min="1"
                max="10"
                value={settings.captureTransitionTurns || 2}
                onChange={(e) => updateSetting('captureTransitionTurns', parseInt(e.target.value))}
                className="ui-field w-24 tabular"
              />
            </Setting>
          )}

          <Check
            checked={settings.atlasStyle === true}
            onChange={(e) => updateSetting('atlasStyle', e.target.checked)}
            label="1860s atlas style"
            hint="Draw the campaign as a period map plate — parchment ground, hand-coloured washes instead of screen colours, sepia borders and paper grain."
          />

          <Setting
            label="Season length (turns)"
            hint="The campaign resolves on this turn, scored on territory VP with remaining SP as the tiebreaker — so a side behind on the map has to come out and attack before the clock runs out. 0 disables the cap and runs to the campaign end date instead."
          >
            <input
              type="number"
              min="0"
              max="60"
              value={settings.seasonLengthTurns ?? 0}
              onChange={(e) => updateSetting('seasonLengthTurns', parseInt(e.target.value) || 0)}
              className="ui-field w-24 tabular"
            />
          </Setting>

          <Check
            checked={settings.capitalVictoryEnabled === true}
            onChange={(e) => updateSetting('capitalVictoryEnabled', e.target.checked)}
            label="Capital victory"
            hint="Holding every enemy capital at once wins immediately. Replaces total territorial control, which needs the whole map and can never realistically fire."
          />

          <Setting
            label="Map cooldown (turns)"
            hint="Once a map is played on a territory it cannot be played again for this many turns. 0 disables the cooldown."
          >
            <input
              type="number"
              min="0"
              max="20"
              value={settings.mapCooldownTurns ?? 2}
              onChange={(e) => updateSetting('mapCooldownTurns', Math.max(0, parseInt(e.target.value) || 0))}
              className="ui-field w-24 tabular"
            />
          </Setting>
        </SectionBody>
      </Section>

      {/* ---------- Supply points ---------- */}
      <Section>
        <SectionHead title="Supply points" />
        <SectionBody>
          <Setting label="Starting SP per side" hint="Opening supply pool for each faction">
            <input
              type="number"
              min="0"
              step="50"
              value={settings.startingCP || 500}
              onChange={(e) => updateSetting('startingCP', parseInt(e.target.value) || 0)}
              className="ui-field w-28 tabular"
            />
          </Setting>
          <Setting
            label="VP base (multiplier)"
            hint="The VP worth one multiple — 1 for county maps, 5 for state maps"
          >
            <input
              type="number"
              min="1"
              max="20"
              value={settings.vpBase || 1}
              onChange={(e) => updateSetting('vpBase', parseInt(e.target.value) || 1)}
              className="ui-field w-28 tabular"
            />
          </Setting>

          <Check
            checked={settings.ticketCostEnabled === true}
            onChange={(e) => updateSetting('ticketCostEnabled', e.target.checked)}
            label="Ticket-weighted losses"
            hint={
              <>
                Bill supply by ticket damage (1× in formation, 3× skirmishing, 5× out of line)
                instead of a share of a fixed maximum, so how a side fought drives the cost.
                The battle recorder gains a stance breakdown under each side's casualty total.{' '}
                <b className="not-italic text-ink">
                  Raise starting SP and income per VP to match — ticket damage runs some 20×
                  larger than casualty-share costs.
                </b>
              </>
            }
          />

          {settings.ticketCostEnabled && (() => {
            // Income and costs have to sit on the same scale. Show what this
            // campaign actually generates per turn against what a battle
            // actually costs, so a mismatch is visible rather than something
            // you notice three turns in.
            const perVP = settings.incomePerVP ?? 1;
            const vp = (campaign.territories || []).reduce((acc, t) => {
              const v = (t.pointValue || t.victoryPoints || 0) * perVP;
              if (t.owner === 'USA') acc.usa += v;
              else if (t.owner === 'CSA') acc.csa += v;
              return acc;
            }, { usa: 0, csa: 0 });
            const income = Math.round((vp.usa + vp.csa) / 2);

            // A typical battle on this map: mid-value region, ~1,200
            // casualties at an average ticket cost of 2.2.
            const divisor = settings.ticketCostDivisor ?? 100;
            const midVP = 4;
            const mult = settings.vpCurve === 'compressed' ? 1 + (midVP - 1) * 0.5 : midVP;
            const typicalBattle = Math.round(2640 * mult * ((settings.baseAttackCostEnemy ?? 75) / divisor));
            // Two battle-roles per side per turn (one attack, one defence).
            const burn = Math.round(typicalBattle * 1.35);
            const ratio = burn > 0 ? income / burn : 0;
            const outOfScale = ratio < 0.15;

            return (
              <>
                {outOfScale && (
                  <div className="ui-box border-mark mt-3">
                    <Tag tone="mark">Income is not on the ticket scale</Tag>
                    <p className="mt-1 text-ink-2">
                      This campaign generates about <b>{income.toLocaleString()} SP per side per turn</b> against
                      roughly <b>{burn.toLocaleString()} SP</b> of battle costs — so pools only drain.
                      Income per VP is set to {perVP}, the old casualty-share scale.
                    </p>
                    <button
                      onClick={() => updateSetting('incomePerVP', 20)}
                      className="ui-btn ui-btn-primary ui-btn-sm mt-2"
                    >
                      Rescale income to 20 per VP
                    </button>
                  </div>
                )}

                <p className="ui-hint mt-2">
                  At these settings: <b className="not-italic text-ink">{income.toLocaleString()} SP/turn</b> income
                  against <b className="not-italic text-ink">~{burn.toLocaleString()} SP/turn</b> spent
                  ({Math.round(ratio * 100)}% covered).
                </p>

                <Setting
                  label="Income per VP each turn"
                  hint="SP generated per point of territory held"
                >
                  <input
                    type="number"
                    min="1"
                    value={settings.incomePerVP ?? 1}
                    onChange={(e) => updateSetting('incomePerVP', parseInt(e.target.value) || 1)}
                    className="ui-field w-28 tabular"
                  />
                </Setting>
                <Setting
                  label="SP per N tickets"
                  hint="Divisor: base costs read as SP per this many tickets"
                >
                  <input
                    type="number"
                    min="1"
                    value={settings.ticketCostDivisor ?? 100}
                    onChange={(e) => updateSetting('ticketCostDivisor', parseInt(e.target.value) || 100)}
                    className="ui-field w-28 tabular"
                  />
                </Setting>
              </>
            );
          })()}

          <Check
            checked={settings.vpCurve === 'compressed'}
            onChange={(e) => updateSetting('vpCurve', e.target.checked ? 'compressed' : 'linear')}
            label="Compressed VP multiplier"
            hint="A 7-point capital costs 4× a 1-point county rather than 7×, so a single capital assault can't decide a season on its own."
          />

          <Setting
            label="Capture bounty (SP per VP)"
            hint="Supply refunded to the attacker on a successful capture — seized depots and stores — paid at once rather than waiting out the transition window. 0 disables it."
          >
            <input
              type="number"
              min="0"
              value={settings.captureBounty ?? 0}
              onChange={(e) => updateSetting('captureBounty', parseInt(e.target.value) || 0)}
              className="ui-field w-28 tabular"
            />
          </Setting>

          <div className="mt-4">
            <div className="ui-eyebrow">Base SP loss</div>
            <p className="ui-hint mb-1">
              {settings.ticketCostEnabled
                ? `Read as SP per ${settings.ticketCostDivisor ?? 100} tickets of damage, before VP multipliers`
                : 'The base SP loss values, before VP multipliers are applied'}
            </p>
            <Setting label="Attacking enemy ground">
              <input
                type="number"
                min="0"
                step="5"
                value={settings.baseAttackCostEnemy ?? 75}
                onChange={(e) => updateSetting('baseAttackCostEnemy', parseInt(e.target.value) || 0)}
                className="ui-field w-28 tabular"
              />
            </Setting>
            <Setting label="Attacking neutral ground">
              <input
                type="number"
                min="0"
                step="5"
                value={settings.baseAttackCostNeutral ?? 50}
                onChange={(e) => updateSetting('baseAttackCostNeutral', parseInt(e.target.value) || 0)}
                className="ui-field w-28 tabular"
              />
            </Setting>
            <Setting label="Defending friendly ground">
              <input
                type="number"
                min="0"
                step="5"
                value={settings.baseDefenseCostFriendly ?? 25}
                onChange={(e) => updateSetting('baseDefenseCostFriendly', parseInt(e.target.value) || 0)}
                className="ui-field w-28 tabular"
              />
            </Setting>
            <Setting label="Defending neutral ground">
              <input
                type="number"
                min="0"
                step="5"
                value={settings.baseDefenseCostNeutral ?? 50}
                onChange={(e) => updateSetting('baseDefenseCostNeutral', parseInt(e.target.value) || 0)}
                className="ui-field w-28 tabular"
              />
            </Setting>
          </div>

          <div className="mt-4">
            <div className="ui-eyebrow mb-1">How SP losses are reckoned</div>
            <div className="ui-segment">
              <button
                onClick={() => updateSetting('cpCalculationMode', 'auto')}
                data-active={(settings.cpCalculationMode || 'auto') === 'auto'}
              >
                Reckoned
              </button>
              <button
                onClick={() => updateSetting('cpCalculationMode', 'manual')}
                data-active={settings.cpCalculationMode === 'manual'}
              >
                By hand
              </button>
            </div>
            <p className="ui-hint mt-1">
              {(settings.cpCalculationMode || 'auto') === 'auto'
                ? 'Worked out from territory VP and the casualties returned.'
                : 'Each side’s SP loss is typed into the battle record.'}
            </p>
          </div>
        </SectionBody>
      </Section>

      {/* ---------- Team abilities ---------- */}
      <Section>
        <SectionHead title="Standing orders" />
        <SectionBody>
          <Setting
            label="Ability cooldown (turns)"
            hint="Turns before an ability may be called on again"
          >
            <input
              type="number"
              min="1"
              max="10"
              value={settings.abilityCooldown || 2}
              onChange={(e) => updateSetting('abilityCooldown', parseInt(e.target.value))}
              className="ui-field w-24 tabular"
            />
          </Setting>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <div className={`font-bold ${SIDE_TEXT.CSA}`}>Valley Supply Lines — CSA</div>
              <p className="ui-hint">When attacking: attack SP loss reduced by half.</p>
            </div>
            <div>
              <div className={`font-bold ${SIDE_TEXT.USA}`}>Special Orders 191 — USA</div>
              <p className="ui-hint">
                When attacking: failed attacks on neutral territories keep them neutral (if that
                rule is enabled), and successful attacks triple CSA SP loss.
              </p>
            </div>
          </div>
        </SectionBody>
      </Section>

      {/* ---------- Battle conditions ---------- */}
      <Section>
        <SectionHead title="Battle conditions" />
        <SectionBody>
          <p className="ui-hint mb-3">
            The roll weights for weather and time of day. The heavier the weight, the likelier
            the face.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-9 gap-y-5">
            {weightTable('Weather', WEATHER_CONDITIONS, weatherWeights, setWeatherWeights, DEFAULT_WEATHER_WEIGHTS)}
            {weightTable('Time of day', TIME_CONDITIONS, timeWeights, setTimeWeights, DEFAULT_TIME_WEIGHTS)}
          </div>
        </SectionBody>
      </Section>

      {/* ---------- Terrain map groups ---------- */}
      <Section>
        <SectionHead title="Terrain map groups" />
        <SectionBody>
          <p className="ui-hint mb-2">
            Reusable map groups by terrain. A territory can name a terrain group instead of
            individual maps; the location mapsets (Antietam, Harpers Ferry, South Mountain) stay
            assigned to territories directly.
          </p>

          {Object.keys(terrainGroups).length === 0 ? (
            <p className="ui-empty">No terrain groups defined.</p>
          ) : (
            Object.entries(terrainGroups).map(([groupName, maps]) => {
              const isOpen = expandedGroup === groupName;
              const viz = terrainViz[groupName] || defaultVizEntry();

              return (
                <div key={groupName} className="ui-line" data-open={isOpen}>
                  <div className="ui-line-head">
                    <button
                      onClick={() => setExpandedGroup(isOpen ? null : groupName)}
                      className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                    >
                      <span className="truncate">{groupName}</span>
                      <span className="ui-hint">{maps.length} maps</span>
                    </button>
                    <button
                      onClick={() => removeTerrainGroup(groupName)}
                      className="ui-btn ui-btn-icon ui-btn-sm ui-btn-danger"
                      title={`Remove ${groupName} group`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="ui-line-body">
                      {/* How the group is drawn on the plate */}
                      <div className="ui-eyebrow mb-1.5">Drawn on the map as</div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <label className="flex items-center gap-1.5">
                          <span className="ui-label mb-0">Pattern</span>
                          <select
                            value={viz.patternType}
                            onChange={(e) => updateVizField(groupName, 'patternType', e.target.value)}
                            className="ui-field w-auto py-0.5 text-sm"
                          >
                            {Object.entries(PATTERN_TYPES).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <span className="ui-label mb-0">Ink</span>
                          <input
                            type="color"
                            value={viz.color}
                            onChange={(e) => updateVizField(groupName, 'color', e.target.value)}
                            className="h-6 w-8 cursor-pointer border border-rule bg-transparent p-0"
                          />
                        </label>
                        <label className="flex items-center gap-1.5">
                          <span className="ui-label mb-0">Second ink</span>
                          <input
                            type="color"
                            value={viz.colorAlt}
                            onChange={(e) => updateVizField(groupName, 'colorAlt', e.target.value)}
                            className="h-6 w-8 cursor-pointer border border-rule bg-transparent p-0"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={viz.densityScaling}
                            onChange={(e) => updateVizField(groupName, 'densityScaling', e.target.checked)}
                            className="h-3.5 w-3.5 accent-ink"
                          />
                          <span className="ui-label mb-0">Density scaling</span>
                        </label>
                        <svg width="48" height="24" className="shrink-0 border border-rule bg-paper-2">
                          <defs>{generateTerrainPatterns(`preview-${groupName}`, viz)}</defs>
                          <rect
                            width="48" height="24"
                            fill={`url(#terrain-preview-${groupName}${viz.densityScaling ? '-dense' : ''})`}
                            opacity="0.6"
                          />
                        </svg>
                      </div>

                      {/* Which maps belong to it */}
                      <div className="ui-eyebrow mt-3 mb-1">Maps in this group</div>
                      <div className="ui-scroll max-h-48">
                        {ALL_MAPS.map(mapName => (
                          <label
                            key={mapName}
                            className="flex cursor-pointer items-center gap-2 border-b border-paper-3 py-1 text-sm hover:bg-paper-2"
                          >
                            <input
                              type="checkbox"
                              checked={maps.includes(mapName)}
                              onChange={() => toggleMapInGroup(groupName, mapName)}
                              className="h-3.5 w-3.5 accent-ink"
                            />
                            <span>{mapName}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="New group name…"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTerrainGroup()}
              className="ui-field text-sm"
            />
            <button
              onClick={addTerrainGroup}
              disabled={!newGroupName.trim() || terrainGroups[newGroupName.trim()]}
              className="ui-btn ui-btn-sm"
            >
              <Plus className="w-4 h-4" />
              Add group
            </button>
          </div>
        </SectionBody>
      </Section>

      {/* ---------- Regiments ---------- */}
      <Section>
        <SectionHead title="The roll of regiments" />
        <SectionBody>
          <p className="ui-hint mb-3">
            Commanders are drawn from these rolls, one regiment to a side, for every battle.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-9 gap-y-5">
            {regimentColumn('USA', 'Union')}
            {regimentColumn('CSA', 'Confederate')}
          </div>
        </SectionBody>
      </Section>
    </Modal>
  );
};

export default SettingsModal;
