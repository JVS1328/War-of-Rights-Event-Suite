import { Fragment, useState } from 'react';
import { Section, SectionHead, SectionBody, Tag, Row, EmptyState, SIDE_TEXT } from './ui/Primitives';

/**
 * Returns of Engagements — the ledger of battles fought, most recent turn
 * first: the turn, the ground, who carried it, and what it cost both sides.
 *
 * A line opens onto the full return for that engagement, and on to the
 * recorder for a battle still to be settled.
 */
const BattleHistory = ({ battles, territories, onEditBattle, campaign = null }) => {
  const [expandedBattle, setExpandedBattle] = useState(null);

  const toggleExpand = (battleId) => {
    setExpandedBattle(expandedBattle === battleId ? null : battleId);
  };

  const getTerritoryName = (territoryId) => {
    if (territoryId === 'grand-campaign') return null;
    const territory = territories.find(t => t.id === territoryId);
    return territory ? territory.name : 'Unknown';
  };

  // Grand Campaign battles name the formations that met instead of a
  // territory, with the place as a label underneath.
  const getGrandBattleSubtitle = (battle) => {
    const gc = campaign?.grandCampaign;
    if (!gc) return null;
    const tokenName = (id) => gc.tokens.find(t => t.id === id)?.name || 'Unknown';
    const attackerName = tokenName(battle.attackerTokenId);
    const defenderName = tokenName(battle.defenderTokenId);
    const pieces = [`${attackerName} vs ${defenderName}`];
    if (battle.attackerSupportId) pieces.push(`(+ ${tokenName(battle.attackerSupportId)})`);
    if (battle.defenderSupportId) pieces.push(`(+ ${tokenName(battle.defenderSupportId)})`);
    const locationLabel = battle.locationLabel || getTerritoryName(battle.territoryId) || null;
    return { header: pieces.join(' '), location: locationLabel };
  };

  // Grand Campaign returns filed before battles carried a date show a dash.
  const formatDate = (isoString) =>
    !isoString ? '—' : new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  const isPending = (battle) => battle.status === 'pending' || !battle.winner;

  const placeOf = (battle) =>
    battle.mode === 'grand'
      ? (battle.locationLabel || getTerritoryName(battle.territoryId) || 'Unknown')
      : getTerritoryName(battle.territoryId);

  // Sort battles by turn (most recent first)
  const sortedBattles = [...battles].sort((a, b) => b.turn - a.turn);

  const num = (n) => (n || 0).toLocaleString('en-US');

  const detail = (battle) => {
    const pending = isPending(battle);
    const grand = battle.mode === 'grand' ? getGrandBattleSubtitle(battle) : null;

    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-9">
          <Row label="Recorded" value={formatDate(battle.date)} />
          <Row label="Ground" value={placeOf(battle) || 'Unknown'} />
          <Row
            label="Attacker"
            value={<span className={SIDE_TEXT[battle.attacker]}>{battle.attacker}</span>}
          />
          <Row
            label="Carried by"
            value={
              pending
                ? <span className="italic text-mark">still to be settled</span>
                : <span className={SIDE_TEXT[battle.winner]}>{battle.winner}</span>
            }
          />
          {battle.victoryPointsAwarded > 0 && (
            <Row
              label="Victory points"
              value={<span className="text-good">+{battle.victoryPointsAwarded}</span>}
            />
          )}
          {battle.mode === 'grand' && battle.terrainType && (
            <Row label="Terrain" value={battle.terrainType} />
          )}
          {battle.mode === 'grand' && battle.weather?.name && (
            <Row label="Weather" value={battle.weather.name} />
          )}
          {battle.mode === 'grand' && battle.time?.name && (
            <Row label="Light" value={battle.time.name} />
          )}
          {battle.commanders?.USA && (
            <Row
              label="Union commander"
              value={<span className={SIDE_TEXT.USA}>{battle.commanders.USA.name}</span>}
            />
          )}
          {battle.commanders?.CSA && (
            <Row
              label="Confederate commander"
              value={<span className={SIDE_TEXT.CSA}>{battle.commanders.CSA.name}</span>}
            />
          )}
          {grand && campaign?.grandCampaign && (() => {
            const gc = campaign.grandCampaign;
            const t = (id) => gc.tokens.find(x => x.id === id)?.name || '—';
            return (
              <>
                <Row label="Attacking formation" value={t(battle.attackerTokenId)} />
                <Row label="Defending formation" value={t(battle.defenderTokenId)} />
                {battle.attackerSupportId && (
                  <Row label="Attacker support" value={t(battle.attackerSupportId)} />
                )}
                {battle.defenderSupportId && (
                  <Row label="Defender support" value={t(battle.defenderSupportId)} />
                )}
              </>
            );
          })()}
        </div>

        {/* The butcher's bill for this engagement alone. */}
        {battle.casualties && (battle.casualties.USA > 0 || battle.casualties.CSA > 0) && (
          <div className="mt-3">
            <div className="ui-eyebrow mb-1">Casualties</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-9">
              <Row
                label={<span className={SIDE_TEXT.USA}>Union</span>}
                value={num(battle.casualties.USA)}
              />
              <Row
                label={<span className={SIDE_TEXT.CSA}>Confederate</span>}
                value={num(battle.casualties.CSA)}
              />
            </div>
          </div>
        )}

        {battle.notes && (
          <div className="mt-3">
            <div className="ui-eyebrow mb-1">Remarks</div>
            <p className="text-ink-2 italic">{battle.notes}</p>
          </div>
        )}

        {onEditBattle && (
          <div className="ui-toolbar mt-3 mb-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditBattle(battle);
              }}
              className={`ui-btn ui-btn-sm ${pending ? 'ui-btn-primary' : ''}`}
            >
              {pending ? 'Settle this engagement' : 'Edit the return'}
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <Section>
      <SectionHead
        title="Returns of Engagements"
        meta={battles.length ? 'click a line to open it' : null}
      />
      <SectionBody>
        {battles.length === 0 ? (
          <EmptyState
            title="Nothing yet returned from the field."
            hint="Engagements and their outcomes are entered here as they are fought."
          />
        ) : (
          <div className="ui-scroll max-h-none sm:max-h-[26rem]">
            <table className="ui-table">
              {/* The column labels earn their keep on a wide sheet; on a phone
                  the lines are already stacked and read for themselves. */}
              <thead className="hidden sm:table-header-group">
                <tr>
                  <th className="num w-9">Turn</th>
                  <th>Engagement</th>
                  <th className="num w-[4.5rem]">Carried</th>
                  <th className="num w-32">Cas. USA / CSA</th>
                </tr>
              </thead>
              <tbody>
                {sortedBattles.map(battle => {
                  const isOpen = expandedBattle === battle.id;
                  const pending = isPending(battle);
                  const grand = battle.mode === 'grand' ? getGrandBattleSubtitle(battle) : null;
                  const place = placeOf(battle);

                  return (
                    <Fragment key={battle.id}>
                      <tr
                        className={`cursor-pointer ${isOpen ? 'font-bold' : ''}`}
                        data-open={isOpen}
                        onClick={() => toggleExpand(battle.id)}
                      >
                        <td className="num w-9 text-ink-3">T{battle.turn}</td>
                        <td>
                          <b>{battle.mapName}</b>
                          {place && <span className="text-ink-2 font-normal"> · {place}</span>}
                          {grand && (
                            <div className="text-ink-3 italic text-xs font-normal">{grand.header}</div>
                          )}
                        </td>
                        <td className="num w-[4.5rem]">
                          {pending
                            ? <span className="italic text-mark text-xs">pending</span>
                            : <Tag tone={battle.winner}>{battle.winner}</Tag>}
                        </td>
                        <td className="num w-[5.5rem] text-ink-2">
                          {pending
                            ? <span className="text-ink-3">—</span>
                            : <>{num(battle.casualties?.USA)} / {num(battle.casualties?.CSA)}</>}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={4} className="!py-0">
                            <div className="ui-line-body">{detail(battle)}</div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionBody>
    </Section>
  );
};

export default BattleHistory;
