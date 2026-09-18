import { Fragment, useState } from 'react';
import { getMaxBattleCPCosts, getVPMultiplier } from '../utils/cpSystem';
import { isTerritorySupplied } from '../utils/supplyLines';
import { Section, SectionHead, SectionBody, Tag, Row, SIDE_TEXT } from './ui/Primitives';
import { territoryVP } from '../utils/campaignTotals';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'USA', label: 'Union' },
  { key: 'CSA', label: 'Confederate' },
  { key: 'NEUTRAL', label: 'Neutral' },
  { key: 'CUT', label: 'Cut off' },
];

const COLUMNS = [
  { side: 'USA', label: 'Union' },
  { side: 'CSA', label: 'Confederate' },
  { side: 'NEUTRAL', label: 'Neutral' },
];

/**
 * The Roll of Territories — the register of ground held, set in three ruled
 * columns, one per side. A line opens to the same detail the tracker used to
 * show inside a list item.
 *
 * Rendered identically by the tracker and by the read-only share view; the
 * share view passes its own `pendingTerritoryIds` and `spSettings` instead of
 * keeping a second copy of this table.
 */
const TerritoryList = ({
  territories,
  onTerritorySelect,
  spSettings = null,
  pendingTerritoryIds = [],
}) => {
  const [expandedTerritory, setExpandedTerritory] = useState(null);
  const [filterOwner, setFilterOwner] = useState('ALL');

  // Neutral ground has no supply line to cut, so it reports neither state.
  const suppliedOf = (t) =>
    t.owner === 'NEUTRAL' ? null : isTerritorySupplied(t, territories);

  const matchesFilter = (t) =>
    filterOwner === 'ALL' ? true
      : filterOwner === 'CUT' ? suppliedOf(t) === false
        : t.owner === filterOwner;

  const shown = territories.filter(matchesFilter);

  const toggleExpand = (territoryId) => {
    setExpandedTerritory(expandedTerritory === territoryId ? null : territoryId);
  };

  const detail = (territory) => {
    const isNeutral = territory.owner === 'NEUTRAL';
    const supplied = suppliedOf(territory);
    const hasPending = pendingTerritoryIds.includes(territory.id);
    const neighbours = (territory.adjacentTerritories || [])
      .map(id => territories.find(t => t.id === id))
      .filter(Boolean);

    return (
      <>
        <Row
          label="Owner"
          value={<span className={SIDE_TEXT[territory.owner]}>{territory.owner}</span>}
        />
        <Row label="Victory points" value={territoryVP(territory)} />
        {!isNeutral && (
          <Row
            label="Supply"
            value={
              supplied
                ? <span className="text-good">Supplied</span>
                : <Tag tone="mark">Cut off</Tag>
            }
          />
        )}
        {territory.isCapital && <Row label="Standing" value="Capital ★" />}
        {territory.mapName && <Row label="Map" value={territory.mapName} />}

        {territory.transitionState?.isTransitioning && (
          <>
            <Row
              label="Changing hands"
              value={<Tag tone="mark">{territory.transitionState.turnsRemaining} turns left</Tag>}
            />
            <Row
              label="Previous owner"
              value={
                <span className={SIDE_TEXT[territory.transitionState.previousOwner]}>
                  {territory.transitionState.previousOwner}
                </span>
              }
            />
          </>
        )}

        {hasPending && <Row label="Engagement" value={<Tag tone="mark">Pending</Tag>} />}

        {territory.captureHistory?.length > 0 && (
          <div className="mt-2">
            <div className="ui-eyebrow mb-1">Taken</div>
            {territory.captureHistory.slice(-3).reverse().map((capture, idx) => (
              <Row
                key={idx}
                label={`Turn ${capture.turn}`}
                value={<span className={SIDE_TEXT[capture.owner]}>{capture.owner}</span>}
              />
            ))}
          </div>
        )}

        {spSettings && (() => {
          const vp = territoryVP(territory) || 1;
          const vpMult = getVPMultiplier(vp, spSettings.vpBase);
          const attacker = isNeutral ? 'Either side' : (territory.owner === 'USA' ? 'CSA' : 'USA');
          const defender = isNeutral ? 'Opposing side' : territory.owner;
          const defenderSide = isNeutral ? 'USA' : territory.owner;
          const isIsolated = supplied === false;
          const attackBase = isNeutral ? spSettings.attackNeutral : spSettings.attackEnemy;
          const defenseBase = isNeutral ? spSettings.defenseNeutral : spSettings.defenseFriendly;
          const { attackerMax, defenderMax } = getMaxBattleCPCosts(
            vp, territory.owner, defenderSide,
            spSettings.vpBase, isIsolated, {
              attackNeutral: spSettings.attackNeutral,
              attackEnemy: spSettings.attackEnemy,
              defenseFriendly: spSettings.defenseFriendly,
              defenseNeutral: spSettings.defenseNeutral,
            }
          );

          return (
            <div className="mt-2">
              <div className="ui-eyebrow mb-1">Most a side can lose here</div>
              <Row
                label={`${attacker} attacking`}
                value={<span className="text-mark">−{attackerMax} SP</span>}
              />
              <div className="ui-hint">
                {attackBase} base × {vpMult} VP · {isNeutral ? 'neutral' : 'enemy'} ground
              </div>
              <Row
                label={`${defender} defending`}
                value={<span className="text-mark">−{defenderMax} SP</span>}
              />
              <div className="ui-hint">
                {defenseBase} base × {vpMult} VP{isIsolated ? ' × 2, cut off' : ''} ·{' '}
                {isNeutral ? 'neutral' : 'friendly'} ground
              </div>
            </div>
          );
        })()}

        {neighbours.length > 0 && (
          <div className="mt-2">
            <div className="ui-eyebrow mb-1">Borders</div>
            <div className="text-ink-2">
              {neighbours.map((n, i) => (
                <span key={n.id}>
                  {i > 0 && <span className="text-ink-3"> · </span>}
                  <span className={SIDE_TEXT[n.owner]}>{n.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  const column = ({ side, label }) => {
    const rows = shown
      .filter(t => t.owner === side)
      .sort((a, b) => territoryVP(b) - territoryVP(a));
    const vp = rows.reduce((sum, t) => sum + territoryVP(t), 0);

    return (
      <div key={side}>
        <div
          className={`flex justify-between items-baseline pt-3 pb-1 border-b border-rule text-xs font-bold uppercase tracking-[0.16em] ${SIDE_TEXT[side]}`}
        >
          <span>{label}</span>
          <span className="font-normal tracking-[0.08em] text-ink-3 tabular">
            {rows.length} · {vp} v.p.
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="ui-empty">None on the roll.</p>
        ) : (
          <table className="ui-table">
            <tbody>
              {rows.map(territory => {
                const isOpen = expandedTerritory === territory.id;
                const supplied = suppliedOf(territory);
                return (
                  <Fragment key={territory.id}>
                    <tr
                      className={`cursor-pointer ${isOpen ? 'font-bold' : ''}`}
                      data-open={isOpen}
                      onClick={() => {
                        toggleExpand(territory.id);
                        onTerritorySelect?.(territory);
                      }}
                    >
                      <td>
                        {territory.name}
                        {territory.isCapital && <span className="text-ink-3 text-xs ml-1.5">★</span>}
                      </td>
                      <td className="num w-9">{territoryVP(territory)}</td>
                      <td className="num w-[4.75rem]">
                        {supplied === null ? (
                          <span className="text-ink-3">—</span>
                        ) : supplied ? (
                          <span className="italic text-ink-3 text-xs">supplied</span>
                        ) : (
                          <Tag tone="mark">cut off</Tag>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={3} className="!py-0">
                          <div className="ui-line-body">{detail(territory)}</div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <Section>
      <SectionHead
        title="The Roll of Territories"
        meta={`${territories.length} in all`}
        actions={
          <div className="ui-segment mx-auto">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilterOwner(f.key)}
                data-active={filterOwner === f.key}
                data-side={f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />
      <SectionBody>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-9">
          {COLUMNS.map(column)}
        </div>
      </SectionBody>
    </Section>
  );
};

export default TerritoryList;
