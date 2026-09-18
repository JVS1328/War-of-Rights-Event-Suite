import { useState } from 'react';
import {
  Map, Trophy, Calendar, MapPin, ChevronDown, ChevronRight, Star, ExternalLink,
  Skull, DollarSign, Users, Swords, Eye, Map as MapIcon
} from 'lucide-react';
import MapView from './MapView';
import RegimentStats from './RegimentStats';
import { isTerritorySupplied } from '../utils/supplyLines';
import { getMaxBattleCPCosts, getVPMultiplier } from '../utils/cpSystem';
import { GRAND_CAMPAIGN_DEFAULTS } from '../data/grandCampaign';
import { Card, CardHead, CardBody, Badge, Row, ScoreBoard, SIDE_TEXT } from './ui/Primitives';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'USA', label: 'USA' },
  { key: 'CSA', label: 'CSA' },
  { key: 'NEUTRAL', label: 'Neutral' },
];

const SharedMapView = ({ shareData }) => {
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [expandedTerritory, setExpandedTerritory] = useState(null);
  const [filterOwner, setFilterOwner] = useState('ALL');

  const { territories, pendingTerritoryIds = [], grandCampaign: gc = null } = shareData;
  const isGC = !!gc;
  const influenceThreshold = isGC ? GRAND_CAMPAIGN_DEFAULTS.influenceThreshold : 0;

  // VP calculations (mirrors CampaignStats logic)
  const usaTerritoryVP = territories
    .filter(t => t.owner === 'USA')
    .filter(t => shareData.instantVP || !t.transitionState?.isTransitioning)
    .reduce((sum, t) => sum + (t.victoryPoints || 0), 0);

  const csaTerritoryVP = territories
    .filter(t => t.owner === 'CSA')
    .filter(t => shareData.instantVP || !t.transitionState?.isTransitioning)
    .reduce((sum, t) => sum + (t.victoryPoints || 0), 0);

  const filteredTerritories = territories.filter(t =>
    filterOwner === 'ALL' ? true : t.owner === filterOwner
  );

  const sortedTerritories = [...filteredTerritories].sort((a, b) => {
    if (a.owner !== b.owner) {
      const ownerOrder = { USA: 0, CSA: 1, NEUTRAL: 2 };
      return ownerOrder[a.owner] - ownerOrder[b.owner];
    }
    return b.victoryPoints - a.victoryPoints;
  });

  const handleTerritoryClick = (territory) => {
    setSelectedTerritory(prev => prev?.id === territory.id ? null : territory);
  };

  const toggleExpand = (territoryId) => {
    setExpandedTerritory(expandedTerritory === territoryId ? null : territoryId);
  };

  const owned = (side) => territories.filter(t => t.owner === side).length;
  const territoryTotal = territories.length || 1;

  // Rendered under the campaign name on a wide screen, and on a row of its
  // own once the name and the Open Tracker button fill that one.
  const campaignMeta = (
    <>
      <span className="text-mist-400">Turn {shareData.turn}</span>
      {shareData.date && (
        <>
          <span className="text-ink-600">·</span>
          <span>{shareData.date}</span>
        </>
      )}
      <span className="text-ink-600">·</span>
      <span>{shareData.battleCount} {shareData.battleCount === 1 ? 'battle' : 'battles'}</span>
      {shareData.pendingCount > 0 && (
        <span className="ui-badge ui-badge-warn">{shareData.pendingCount} pending</span>
      )}
      {isGC && <span className="ui-badge ui-badge-neutral">Grand Campaign</span>}
    </>
  );

  return (
    <div className="app-shell">
      {/* ── App bar ─────────────────────────────────────────────────── */}
      <header className="app-bar sticky top-0 z-30">
        <div className="max-w-[110rem] mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 sm:gap-x-4">
          <div className="flex flex-1 items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brass-900 border border-brass-500/40 grid place-items-center shrink-0">
              <Map className="w-5 h-5 text-brass-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-mist-100 truncate leading-tight">{shareData.name}</h1>
              <div className="hidden sm:flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5 text-xs text-mist-500">
                {campaignMeta}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="ui-badge ui-badge-neutral py-1.5 px-2.5 hidden sm:inline-flex">
              <Eye className="w-3.5 h-3.5" />
              Read-only
            </span>
            <a
              href={window.location.origin + window.location.pathname}
              className="ui-btn ui-btn-ghost"
              title="Open the campaign tracker"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Open Tracker</span>
            </a>
          </div>

          <div className="flex sm:hidden w-full items-center flex-wrap gap-x-2 gap-y-1 text-xs text-mist-500">
            {campaignMeta}
          </div>
        </div>
      </header>

      <div className="max-w-[110rem] mx-auto px-3 sm:px-6 py-4 sm:py-5">
        {/* Map + stats */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5 mb-4 sm:mb-5 items-start">
          <div className="xl:col-span-2">
            <MapView
              territories={territories}
              selectedTerritory={selectedTerritory}
              onTerritoryClick={handleTerritoryClick}
              onTerritoryDoubleClick={handleTerritoryClick}
              pendingBattleTerritoryIds={pendingTerritoryIds}
              spSettings={shareData.spSettings}
              atlasStyle={shareData.atlasStyle === true}
              terrainViz={shareData.terrainViz}
              tokens={gc?.tokens || null}
              mapFeatures={gc?.mapFeatures || null}
              influenceThreshold={influenceThreshold}
              readOnly
            />
          </div>

          <div className="space-y-4">
            {/* Grand Campaign — pools, VP (capital captures / token wipes), token counts. */}
            {isGC && (() => {
              const alive = (side) => gc.tokens.filter(t => t.side === side && t.status !== 'wiped').length;
              const wiped = (side) => gc.tokens.filter(t => t.side === side && t.status === 'wiped').length;
              return (
                <Card className="border-brass-500/30">
                  <CardHead icon={Swords} title="Grand Campaign" meta="first to 10 VP" />
                  <CardBody className="space-y-4">
                    <ScoreBoard usaVP={gc.vpUSA} csaVP={gc.vpCSA} />
                    <div className="space-y-2 pt-3 border-t border-ink-700">
                      {['USA', 'CSA'].map(side => (
                        <Row
                          key={`treasury-${side}`}
                          label={
                            <span className="flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5" />
                              <span className={SIDE_TEXT[side]}>{side}</span> Treasury
                            </span>
                          }
                          value={`$${gc.pools[side].treasury.toLocaleString()}`}
                        />
                      ))}
                      {['USA', 'CSA'].map(side => (
                        <Row
                          key={`manpower-${side}`}
                          label={
                            <span className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              <span className={SIDE_TEXT[side]}>{side}</span> Manpower
                            </span>
                          }
                          value={gc.pools[side].manpower.toLocaleString()}
                        />
                      ))}
                      {['USA', 'CSA'].map(side => (
                        <Row
                          key={`tokens-${side}`}
                          label={<><span className={SIDE_TEXT[side]}>{side}</span> Tokens</>}
                          value={
                            <>
                              {alive(side)}
                              {wiped(side) > 0 && (
                                <span className="text-mist-500 text-xs font-normal ml-1">
                                  +{wiped(side)} wiped
                                </span>
                              )}
                            </>
                          }
                        />
                      ))}
                    </div>
                  </CardBody>
                </Card>
              );
            })()}

            {/* Victory points */}
            <Card>
              <CardHead
                icon={Trophy}
                title={isGC ? 'Territory VP' : 'Victory Points'}
                meta={isGC ? 'flavor only' : null}
              />
              <CardBody>
                <ScoreBoard
                  usaVP={usaTerritoryVP}
                  csaVP={csaTerritoryVP}
                  usaSP={shareData.cpEnabled ? shareData.cpUSA : null}
                  csaSP={shareData.cpEnabled ? shareData.cpCSA : null}
                />
              </CardBody>
            </Card>

            {/* Territory control */}
            <Card>
              <CardHead icon={MapIcon} title="Territory Control" meta={`${territories.length} total`} />
              <CardBody className="space-y-3">
                <div className="ui-meter">
                  <div className="bg-union-500" style={{ width: `${(owned('USA') / territoryTotal) * 100}%` }} />
                  <div className="bg-rebel-500" style={{ width: `${(owned('CSA') / territoryTotal) * 100}%` }} />
                  <div className="bg-ink-500 flex-1" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {['USA', 'CSA', 'NEUTRAL'].map(side => (
                    <div key={side} className="ui-inset py-2">
                      <div className={`text-[11px] font-bold tracking-widest ${SIDE_TEXT[side]}`}>{side}</div>
                      <div className="text-xl font-bold text-mist-100 tabular">{owned(side)}</div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Campaign info */}
            <Card>
              <CardHead icon={Calendar} title="Campaign Info" />
              <CardBody className="space-y-2.5">
                <Row label="Turn" value={shareData.turn} />
                {shareData.date && <Row label="Date" value={shareData.date} />}
                <Row
                  label="Battles fought"
                  value={
                    <>
                      {shareData.battleCount}
                      {shareData.pendingCount > 0 && (
                        <span className="text-brass-300 font-normal text-xs ml-1.5">
                          +{shareData.pendingCount} pending
                        </span>
                      )}
                    </>
                  }
                />

                {shareData.casualties?.total > 0 && (
                  <div className="pt-3 mt-1 border-t border-ink-700 space-y-2.5">
                    <div className="ui-eyebrow flex items-center gap-1.5">
                      <Skull className="w-3.5 h-3.5" />
                      Casualties
                    </div>
                    <Row label={<span className={SIDE_TEXT.USA}>USA</span>} value={shareData.casualties.usa.toLocaleString()} />
                    <Row label={<span className={SIDE_TEXT.CSA}>CSA</span>} value={shareData.casualties.csa.toLocaleString()} />
                    <Row label="Total" value={shareData.casualties.total.toLocaleString()} />
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        {/* Regiment leaderboard */}
        {shareData.regiments && (
          <div className="mb-5">
            <RegimentStats
              campaign={{ regiments: shareData.regiments, regimentStats: shareData.regimentStats || {} }}
            />
          </div>
        )}

        {/* Territory list */}
        <Card>
          <CardHead
            icon={MapPin}
            title="Territories"
            meta={filteredTerritories.length}
            actions={
              <div className="ui-segment">
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
          <CardBody className="!p-2">
            <div className="ui-scroll max-h-none sm:max-h-[32rem] p-1 grid grid-cols-1 lg:grid-cols-2 gap-1.5 items-start">
              {sortedTerritories.map(territory => {
                const supplied = isTerritorySupplied(territory, territories);
                const isNeutral = territory.owner === 'NEUTRAL';
                const hasPending = pendingTerritoryIds.includes(territory.id);
                const isOpen = expandedTerritory === territory.id;
                const neighbors = territory.adjacentTerritories
                  .map(id => territories.find(t => t.id === id))
                  .filter(Boolean);

                return (
                  <div key={territory.id} className="ui-listitem" data-open={isOpen}>
                    <div
                      className="ui-listitem-head"
                      onClick={() => {
                        toggleExpand(territory.id);
                        handleTerritoryClick(territory);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-brass-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-mist-500 shrink-0" />
                        )}
                        {territory.isCapital && (
                          <Star className="w-3.5 h-3.5 text-brass-400 fill-brass-400 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-mist-100 truncate">{territory.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasPending && <Badge tone="warn">Battle</Badge>}
                        {!isNeutral && !supplied && (
                          <Badge tone="warn" className="!text-orange-300 !border-orange-500/40 !bg-orange-950">
                            Isolated
                          </Badge>
                        )}
                        <Badge tone={territory.owner}>{territory.owner}</Badge>
                        <span className="text-sm font-bold text-mist-100 tabular">
                          {territory.victoryPoints}
                          <span className="text-[10px] text-mist-500 ml-0.5">VP</span>
                        </span>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="ui-listitem-body space-y-2.5">
                        <Row
                          label="Current Owner"
                          value={<span className={SIDE_TEXT[territory.owner]}>{territory.owner}</span>}
                        />
                        <Row label="Victory Points" value={territory.victoryPoints} />
                        {!isNeutral && (
                          <Row
                            label="Supply Status"
                            value={
                              <span className={supplied ? 'text-emerald-400' : 'text-orange-400'}>
                                {supplied ? 'Supplied' : 'Isolated'}
                              </span>
                            }
                          />
                        )}
                        {territory.isCapital && (
                          <Row
                            label="Type"
                            value={
                              <span className="flex items-center gap-1 text-brass-300">
                                <Star className="w-3 h-3 fill-brass-300" />
                                Capital
                              </span>
                            }
                          />
                        )}

                        {territory.transitionState?.isTransitioning && (
                          <div className="pt-2.5 border-t border-ink-700 space-y-2">
                            <div className="ui-eyebrow text-orange-300">Ownership transfer in progress</div>
                            <Row label="Turns remaining" value={territory.transitionState.turnsRemaining} />
                            <Row
                              label="Previous owner"
                              value={
                                <span className={SIDE_TEXT[territory.transitionState.previousOwner]}>
                                  {territory.transitionState.previousOwner}
                                </span>
                              }
                            />
                          </div>
                        )}

                        {hasPending && (
                          <div className="pt-2.5 border-t border-ink-700">
                            <div className="ui-eyebrow text-brass-300">Battle ongoing</div>
                          </div>
                        )}

                        {/* SP cost info */}
                        {shareData.spSettings && (() => {
                          const sp = shareData.spSettings;
                          const vp = territory.victoryPoints || 1;
                          const vpMult = getVPMultiplier(vp, sp.vpBase);
                          const attacker = isNeutral ? 'Either side' : (territory.owner === 'USA' ? 'CSA' : 'USA');
                          const defender = isNeutral ? 'Opposing side' : territory.owner;
                          const defenderSide = isNeutral ? 'USA' : (territory.owner === 'USA' ? 'USA' : 'CSA');
                          const isIsolated = !isNeutral && !supplied;
                          const attackBase = isNeutral ? sp.attackNeutral : sp.attackEnemy;
                          const defenseBase = isNeutral ? sp.defenseNeutral : sp.defenseFriendly;
                          const { attackerMax, defenderMax } = getMaxBattleCPCosts(
                            vp, territory.owner, defenderSide,
                            sp.vpBase, isIsolated, {
                              attackNeutral: sp.attackNeutral,
                              attackEnemy: sp.attackEnemy,
                              defenseFriendly: sp.defenseFriendly,
                              defenseNeutral: sp.defenseNeutral,
                            }
                          );

                          return (
                            <div className="pt-2.5 border-t border-ink-700">
                              <div className="ui-eyebrow mb-1.5">Max SP Loss</div>
                              <div className="space-y-1.5">
                                <div className="ui-inset p-2">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-mist-300">{attacker} (Attacker)</span>
                                    <span className="text-orange-400 font-bold tabular">-{attackerMax} SP</span>
                                  </div>
                                  <div className="text-[10px] text-mist-500 mt-1">
                                    {attackBase} base × {vpMult} VP mult • Attacking {isNeutral ? 'neutral' : 'enemy'} territory
                                  </div>
                                </div>
                                <div className="ui-inset p-2">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-mist-300">{defender} (Defender)</span>
                                    <span className="text-orange-400 font-bold tabular">-{defenderMax} SP</span>
                                  </div>
                                  <div className="text-[10px] text-mist-500 mt-1">
                                    {defenseBase} base × {vpMult} VP mult{isIsolated ? ' × 2 (isolated)' : ''} • Defending {isNeutral ? 'neutral' : 'friendly'} territory
                                  </div>
                                  {isIsolated && (
                                    <div className="text-[10px] text-rebel-400 mt-0.5">
                                      2× cost — territory is cut off from supply
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {neighbors.length > 0 && (
                          <div className="pt-2.5 border-t border-ink-700">
                            <div className="ui-eyebrow mb-1.5">Neighbors</div>
                            <div className="flex flex-wrap gap-1">
                              {neighbors.map(n => (
                                <Badge key={n.id} tone={n.owner}>{n.name}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default SharedMapView;
