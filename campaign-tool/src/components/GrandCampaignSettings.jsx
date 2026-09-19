import { GRAND_CAMPAIGN_DEFAULTS } from '../data/grandCampaign';
import { Section, SectionHead, SectionBody } from './ui/Primitives';

/**
 * GrandCampaignSettings — compact form for all Grand Campaign tunables.
 *
 * Renders as a single section inside the existing SettingsModal. Receives the
 * current gcSettings and an onChange callback that fires with the next full
 * settings object whenever any field is edited.
 */

// Group definitions drive the rendering — keeps the JSX from becoming a wall.
const FIELD_GROUPS = [
  {
    title: 'Starting Pools',
    fields: [
      { key: 'startingTreasury', label: 'Starting Treasury ($)', type: 'number' },
      { key: 'startingManpower', label: 'Starting Manpower (pool)', type: 'number' },
      { key: 'startingTokenStrength', label: 'Token Starting Strength', type: 'number' },
    ],
  },
  {
    title: 'Monthly Income (per owned city)',
    fields: [
      { key: 'incomePerCity', label: 'Money / city / month', type: 'number' },
      { key: 'manpowerPerCity', label: 'Manpower / city / month', type: 'number' },
    ],
  },
  {
    title: 'Battle Rewards',
    fields: [
      { key: 'moneyPerBattleWin', label: 'Money per battle won', type: 'number' },
      { key: 'moneyPerCityCapture', label: 'Money per city/fort captured', type: 'number' },
    ],
  },
  {
    title: 'Replenishment (at a friendly city/fort, ends turn)',
    fields: [
      { key: 'replenishMoneyCost', label: 'Treasury cost', type: 'number' },
      { key: 'replenishManpowerCost', label: 'National manpower cost', type: 'number' },
      { key: 'replenishYield', label: 'Men added to token', type: 'number' },
    ],
  },
  {
    title: 'Garrison',
    fields: [
      { key: 'maxGarrison', label: 'Max men per garrison', type: 'number' },
      { key: 'garrisonCasPer100', label: 'Counter-cas per 100 garrison men', type: 'number' },
    ],
  },
  {
    title: 'Movement (inches per MP)',
    fields: [
      { key: 'movementPointsPerTurn', label: 'MP per turn', type: 'number' },
      { key: 'marchInchesPerMP', label: 'March', type: 'number' },
      { key: 'riverInchesPerMP', label: 'River', type: 'number' },
      { key: 'railInchesPerMP', label: 'Rail', type: 'number' },
      { key: 'riverCrossCost', label: 'River crossing cost (MP)', type: 'number' },
      { key: 'milesPerInch', label: 'Miles per board inch (display)', type: 'number', step: '0.5' },
    ],
  },
  {
    title: 'Proximity (inches)',
    fields: [
      { key: 'railSnapInches', label: 'Rail snap distance', type: 'number', step: '0.1' },
      { key: 'riverSnapInches', label: 'River snap distance', type: 'number', step: '0.1' },
      { key: 'combatAdjacencyInches', label: 'Combat adjacency', type: 'number', step: '0.1' },
      { key: 'supportRangeInches', label: 'Supporter range', type: 'number', step: '0.1' },
      { key: 'tokenFootprintInches', label: 'Token footprint (collision)', type: 'number', step: '0.1' },
      { key: 'svgUnitsPerInch', label: 'SVG units per inch (map calibration)', type: 'number' },
    ],
  },
  {
    title: 'Combat Casualty Modifiers (% added to raw casualties)',
    fields: [
      { key: 'fatigueCasPct', label: 'Fatigue — per point', type: 'number' },
      { key: 'winterAttackerCasPct', label: 'Winter — attacker', type: 'number' },
      { key: 'trainRiverCasPct', label: 'Train or river', type: 'number' },
    ],
  },
  {
    title: 'Last Stand',
    fields: [
      { key: 'lastStandMin', label: 'Lower bound (wipe below this)', type: 'number' },
      { key: 'lastStandMax', label: 'Upper bound (enter last stand ≤)', type: 'number' },
    ],
  },
  {
    title: 'Retreat (march-MP)',
    fields: [
      { key: 'retreatMP', label: 'Decisive loser / LS winner', type: 'number' },
      { key: 'retreatMPDraw', label: 'Conquest draw (each side)', type: 'number' },
    ],
  },
  {
    title: 'Territory Influence',
    fields: [
      { key: 'influencePerToken', label: 'Influence per occupying token / month', type: 'number' },
      { key: 'influenceThreshold', label: 'Influence to fully capture a territory', type: 'number' },
    ],
  },
  {
    title: 'Victory',
    fields: [
      { key: 'vpToWin', label: 'VP to win', type: 'number' },
      { key: 'vpPerCapitalCapture', label: 'VP per capital captured', type: 'number' },
      { key: 'vpPerTokenWipe', label: 'VP per token wiped', type: 'number' },
    ],
  },
];

const GrandCampaignSettings = ({ gcSettings, onChange }) => {
  const s = { ...GRAND_CAMPAIGN_DEFAULTS, ...(gcSettings || {}) };

  const set = (key, raw) => {
    const value = raw === '' ? 0 : Number(raw);
    onChange({ ...s, [key]: Number.isFinite(value) ? value : 0 });
  };

  const setWinterMonths = (raw) => {
    const months = raw.split(',')
      .map(x => parseInt(x.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 12);
    onChange({ ...s, winterMonths: months });
  };

  return (
    <Section>
      <SectionHead title="Grand Campaign" />
      <SectionBody>
        {FIELD_GROUPS.map(group => (
          <div key={group.title} className="mb-4">
            <div className="ui-eyebrow mb-1.5">{group.title}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {group.fields.map(f => (
                <label key={f.key} className="block">
                  <span className="ui-label">{f.label}</span>
                  <input
                    type={f.type}
                    step={f.step || '1'}
                    value={s[f.key]}
                    onChange={e => set(f.key, e.target.value)}
                    className="ui-field tabular"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Winter months — a comma-separated list */}
        <div className="mb-4">
          <div className="ui-eyebrow mb-1.5">Winter months</div>
          <label className="block">
            <span className="ui-label">Month numbers 1–12, separated by commas (12,1,2 by default)</span>
            <input
              type="text"
              value={(s.winterMonths || []).join(',')}
              onChange={e => setWinterMonths(e.target.value)}
              className="ui-field tabular"
            />
          </label>
        </div>

        <p className="ui-hint">
          All values are kept in campaign.grandCampaign.settings. Live state — pools, tokens, map
          features — is not reset by a change here; only what happens next uses the new values.
        </p>
      </SectionBody>
    </Section>
  );
};

export default GrandCampaignSettings;
