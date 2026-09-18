import { useState } from 'react';
import { ChevronDown, ChevronRight, Skull, Clock, Edit3 } from 'lucide-react';
import { Section, SectionHead, SectionBody, Tag, Row, EmptyState, SIDE_TEXT } from './ui/Primitives';

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

  // Grand Campaign battles use token names + a location label instead of a
  // territory name as their subtitle.
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

  const formatDate = (isoString) =>
    new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  const isPending = (battle) => battle.status === 'pending' || !battle.winner;

  // Sort battles by turn (most recent first)
  const sortedBattles = [...battles].sort((a, b) => b.turn - a.turn);

  return (
    <Section>
      <SectionHead title="Battle History" meta={battles.length || null} />
      <SectionBody className="!p-2">
        {battles.length === 0 ? (
          <EmptyState title="No battles recorded yet" hint="Recorded battles and their outcomes will appear here." />
        ) : (
          <div className="ui-scroll max-h-none sm:max-h-[26rem] p-1 space-y-1.5">
            {sortedBattles.map(battle => {
              const isOpen = expandedBattle === battle.id;
              const pending = isPending(battle);
              return (
                <div key={battle.id} className="ui-line" data-open={isOpen}>
                  <div className="ui-line-head" onClick={() => toggleExpand(battle.id)}>
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-brass-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-mist-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="ui-eyebrow shrink-0">T{battle.turn}</span>
                          <span className="text-sm font-semibold text-mist-100 truncate">{battle.mapName}</span>
                        </div>
                        {(() => {
                          if (battle.mode === 'grand') {
                            const sub = getGrandBattleSubtitle(battle);
                            if (!sub) return null;
                            return (
                              <div className="text-xs text-mist-400 mt-0.5 truncate">
                                {sub.header}
                                {sub.location && <span className="text-mist-500"> — {sub.location}</span>}
                              </div>
                            );
                          }
                          const name = getTerritoryName(battle.territoryId);
                          return name ? <div className="text-xs text-mist-500 mt-0.5 truncate">{name}</div> : null;
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pending ? (
                        <Tag tone="warn">
                          <Clock className="w-3 h-3" />
                          Pending
                        </Tag>
                      ) : (
                        <>
                          <Tag tone={battle.winner}>{battle.winner} won</Tag>
                          {battle.victoryPointsAwarded > 0 && (
                            <span className="text-sm font-bold text-emerald-400 tabular">
                              +{battle.victoryPointsAwarded}
                              <span className="text-[10px] text-mist-500 ml-0.5">VP</span>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="ui-line-body">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                        <Row label="Date" value={formatDate(battle.date)} />
                        <Row
                          label="Location"
                          value={
                            battle.mode === 'grand'
                              ? (battle.locationLabel || getTerritoryName(battle.territoryId) || 'Unknown')
                              : (getTerritoryName(battle.territoryId) || 'Unknown')
                          }
                        />
                        <Row
                          label="Attacker"
                          value={<span className={SIDE_TEXT[battle.attacker]}>{battle.attacker}</span>}
                        />
                        <Row
                          label="Winner"
                          value={
                            pending ? (
                              <span className="text-brass-300 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            ) : (
                              <span className={SIDE_TEXT[battle.winner]}>{battle.winner}</span>
                            )
                          }
                        />
                        {battle.mode === 'grand' && battle.terrainType && (
                          <Row label="Terrain" value={battle.terrainType} />
                        )}
                        {battle.mode === 'grand' && battle.weather?.name && (
                          <Row label="Weather" value={battle.weather.name} />
                        )}
                        {battle.mode === 'grand' && battle.time?.name && (
                          <Row label="Time" value={battle.time.name} />
                        )}
                        {battle.commanders?.USA && (
                          <Row
                            label="USA Commander"
                            value={<span className="text-union-400">{battle.commanders.USA.name}</span>}
                          />
                        )}
                        {battle.commanders?.CSA && (
                          <Row
                            label="CSA Commander"
                            value={<span className="text-rebel-400">{battle.commanders.CSA.name}</span>}
                          />
                        )}
                        {battle.mode === 'grand' && campaign?.grandCampaign && (() => {
                          const gc = campaign.grandCampaign;
                          const t = (id) => gc.tokens.find(x => x.id === id)?.name || '—';
                          return (
                            <>
                              <Row label="Attacker Token" value={t(battle.attackerTokenId)} />
                              <Row label="Defender Token" value={t(battle.defenderTokenId)} />
                              {battle.attackerSupportId && (
                                <Row label="Attacker Support" value={t(battle.attackerSupportId)} />
                              )}
                              {battle.defenderSupportId && (
                                <Row label="Defender Support" value={t(battle.defenderSupportId)} />
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Casualties */}
                      {battle.casualties && (battle.casualties.USA > 0 || battle.casualties.CSA > 0) && (
                        <div className="mt-3 pt-3 border-t border-ink-700">
                          <div className="ui-eyebrow flex items-center gap-1.5 mb-2">
                            <Skull className="w-3.5 h-3.5" />
                            Casualties
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            <Row label={<span className={SIDE_TEXT.USA}>USA</span>} value={battle.casualties.USA.toLocaleString()} />
                            <Row label={<span className={SIDE_TEXT.CSA}>CSA</span>} value={battle.casualties.CSA.toLocaleString()} />
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {battle.notes && (
                        <div className="mt-3 pt-3 border-t border-ink-700">
                          <div className="ui-eyebrow mb-1.5">Notes</div>
                          <p className="text-sm text-mist-300">{battle.notes}</p>
                        </div>
                      )}

                      {onEditBattle && (
                        <div className="mt-3 pt-3 border-t border-ink-700">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditBattle(battle);
                            }}
                            className={`ui-btn ui-btn-block ui-btn-sm ${pending ? 'ui-btn-primary' : ''}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            {pending ? 'Complete Battle' : 'Edit Battle'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionBody>
    </Section>
  );
};

export default BattleHistory;
