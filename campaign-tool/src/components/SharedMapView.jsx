import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from './MapView';
import RegimentStats from './RegimentStats';
import TerritoryList from './TerritoryList';
import { GRAND_CAMPAIGN_DEFAULTS } from '../data/grandCampaign';
import {
  Masthead, ScoreStrip, Section, SectionHead, SectionBody, Row, SIDE_TEXT,
} from './ui/Primitives';
import { vpTotals, ownedCounts } from '../utils/campaignTotals';
import { num } from '../utils/format';
import { waterwayList } from '../utils/waterways';

/**
 * The read-only edition: the same sheet the tracker prints, set from a share
 * payload instead of live campaign state.
 *
 * The roll of territories is the tracker's own component, fed this payload's
 * pending battles and SP settings — there is no second copy of that table.
 *
 * A link that carries the turns already played can be paged back through:
 * the plate, the score and the dispatch all turn back to how that turn
 * closed. Supply, orders and reach belong to the turn being played, so they
 * are left off a turn gone by.
 */
const SIDE_NAME = { USA: 'Union', CSA: 'Confederate' };

const SharedMapView = ({ shareData }) => {
  const [selectedId, setSelectedId] = useState(null);
  // The side whose reach the plate shows, once the reader picks one; until
  // then it follows whichever side the admin's own sheet is set to.
  const [reachPick, setReachPick] = useState(null);
  // Orders the reader is trying for a side - its doctrine, a landing - to see
  // what they would reach. Untouched, the plate shows the orders given.
  const [tries, setTries] = useState({});
  // The turn on the plate: null for the turn being played, else a past one.
  const [viewTurn, setViewTurn] = useState(null);

  const { grandCampaign: gc = null, history = [] } = shareData;
  const isGC = !!gc;
  const live = !!shareData.live;

  const past = history.find(h => h.turn === viewTurn) || null;
  const turns = [...history.map(h => h.turn), shareData.turn];
  const turnIndex = past ? turns.indexOf(past.turn) : turns.length - 1;
  const stepTurn = (by) => {
    const next = turns[turnIndex + by];
    if (next != null) setViewTurn(next === shareData.turn ? null : next);
  };

  // The board for the turn on the plate. Held steady between renders so the
  // map only redraws its ground when the turn actually changes.
  const territories = useMemo(() => (past
    ? shareData.territories.map((t, i) => ({ ...t, owner: past.owners[i], transitionState: past.transitions[i] }))
    : shareData.territories), [shareData.territories, past]);
  const pendingTerritoryIds = past ? [] : (shareData.pendingTerritoryIds || []);
  const recentTerritoryIds = past ? past.recentTerritoryIds : shareData.recentTerritoryIds;
  const battleDetails = past ? past.battleDetails : shareData.battleDetails;
  const dispatch = past ? past.dispatch : (shareData.dispatch || []);

  // A live link swaps the board out under the reader, so the selection is
  // held by id and looked up afresh each time.
  const selectedTerritory = territories.find(t => t.id === selectedId) || null;

  // Each side's reach, worked out by the tracker when it published. Older
  // links carry none, and the plate dims nothing.
  const reachBySide = shareData.reach || null;
  const reachSide = reachPick || shareData.reachSide || 'USA';
  // The same reach under other orders, worked out when the link was made.
  // Older links carry none, and offer nothing to try.
  const options = shareData.reachOptions?.[reachSide] || null;
  const tried = tries[reachSide] || null;
  const plan = tried || {
    doctrine: !!shareData.orders?.[reachSide]?.doctrine && shareData.orders[reachSide].action !== 'defend',
    landing: !!shareData.landingRights?.[reachSide],
  };
  const reach = past || reachSide === 'off' ? null
    : tried && options ? options.maps[(plan.doctrine ? 2 : 0) + (plan.landing ? 1 : 0)]
      : (reachBySide?.[reachSide] || null);
  const tryOrder = (key) => setTries(t => ({ ...t, [reachSide]: { ...plan, [key]: !plan[key] } }));
  const influenceThreshold = isGC ? GRAND_CAMPAIGN_DEFAULTS.influenceThreshold : 0;

  const vp = vpTotals(territories, !!shareData.instantVP);
  const owned = ownedCounts(territories);
  // A Grand Campaign is scored by capital captures and token wipes; territory
  // VP is flavour there, so the sheet leads with the score that decides it.
  const score = isGC ? { USA: gc.vpUSA || 0, CSA: gc.vpCSA || 0 } : vp;

  const handleTerritoryClick = (territory) => {
    setSelectedId(prev => (prev === territory.id ? null : territory.id));
  };

  // The transports, as the payload carries them. Older links have neither
  // field, which decodes to no orders and no rights — and so says nothing.
  const landingDeclaredBy = past ? null
    : ['USA', 'CSA'].find(side => shareData.orders?.[side]?.action === 'landing') || null;
  const landingRightsFor = past ? null
    : ['USA', 'CSA'].find(side => shareData.landingRights?.[side]) || null;

  // Named in the standfirst only when there is exactly one to name.
  const pendingPlace = pendingTerritoryIds.length === 1
    ? (territories.find(t => t.id === pendingTerritoryIds[0])?.name || null)
    : null;

  // Where the side on the plate can go by water this turn, said in words: the
  // dimming shows it, this says why.
  const waterNote = (() => {
    if (!reach) return null;
    const kind = !tried ? shareData.waterReach?.[reachSide]
      : plan.landing ? 'landing'
        : plan.doctrine && options?.doctrineByWater ? 'doctrine' : null;
    if (!kind) return null;
    const held = shareData.heldWaterways?.[reachSide];
    const what = kind === 'landing'
      ? (tried ? `A ${SIDE_NAME[reachSide]} landing` : `The ${SIDE_NAME[reachSide]} landing this turn`)
      : (tried
        ? `With ${options.doctrine} declared, the ${SIDE_NAME[reachSide]} side`
        : `The ${SIDE_NAME[reachSide]} doctrine declared this turn`);
    const may = tried ? 'could go' : 'may go';
    const where = !held
      ? `${may} to any water region`
      : held.length
        ? `${may} to any water region on ${waterwayList(held)}, where it holds ground`
        : 'has no water region of its own to sail from, and reaches nothing by water';
    return `${what} ${where}.`;
  })();

  const noteParts = [
    isGC && `Grand Campaign · first to ${GRAND_CAMPAIGN_DEFAULTS.vpToWin} VP`,
    past ? `Looking back from Turn ${shareData.turn}` : live && 'Live',
  ].filter(Boolean);

  const casualties = (past ? past.casualties : shareData.casualties) || { usa: 0, csa: 0, total: 0 };
  const fought = (past ? past.battleCount : shareData.battleCount) || 0;
  const perEngagement = fought > 0 ? Math.round(casualties.total / fought) : 0;

  // Paging through the turns already played, back to the one being played.
  const turnPager = history.length > 0 && (
    <div className="flex items-center gap-1 mr-2" aria-label="Turn on the plate">
      <button
        type="button"
        onClick={() => stepTurn(-1)}
        disabled={turnIndex <= 0}
        className="ui-btn ui-btn-quiet ui-btn-icon"
        title="Previous turn"
        aria-label="Previous turn"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="ui-eyebrow tabular px-1 min-w-[4.5rem] text-center">Turn {turns[turnIndex]}</span>
      <button
        type="button"
        onClick={() => stepTurn(1)}
        disabled={!past}
        className="ui-btn ui-btn-quiet ui-btn-icon"
        title="Next turn"
        aria-label="Next turn"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      {past && (
        <button type="button" onClick={() => setViewTurn(null)} className="ui-btn ui-btn-sm"
                title={`Back to the turn being played (Turn ${shareData.turn})`}>
          Now
        </button>
      )}
    </div>
  );

  // Whose reach the plate shows: the same wash the tracker prints for the
  // side its sheet is set to. Reach belongs to the turn being played.
  const reachToggle = !past && reachBySide && (
    <div className="ui-segment mr-2" aria-label="Ground in reach">
      <span className="ui-eyebrow">Reach</span>
      {['USA', 'CSA'].map(side => (
        <button
          key={side}
          type="button"
          onClick={() => setReachPick(side)}
          data-active={reachSide === side}
          data-side={side}
          aria-label={`${SIDE_NAME[side]} reach`}
          title={`Dim the ground the ${SIDE_NAME[side]} side cannot attack this turn`}
        >
          {SIDE_NAME[side]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setReachPick('off')}
        data-active={reachSide === 'off'}
        title="Show the whole board at full strength"
      >
        Off
      </button>
    </div>
  );

  // Try the side's doctrine, a landing, or both, and see what they reach -
  // as if the side were attacking this turn, whatever it has ordered.
  const orderTrials = !past && reachSide !== 'off' && options && (options.doctrine || options.maps[1]) && (
    <div className="ui-segment mr-2" aria-label="Try other orders">
      {[
        options.doctrine && ['doctrine', options.doctrine, `declaring ${options.doctrine}`, `without ${options.doctrine}`],
        options.maps[1] && ['landing', 'Landing', 'with a landing', 'without a landing'],
      ].filter(Boolean).map(([key, label, withIt, withoutIt]) => (
        <button
          key={key}
          type="button"
          onClick={() => tryOrder(key)}
          aria-pressed={plan[key]}
          data-active={plan[key]}
          data-side={reachSide}
          title={`Show what the ${SIDE_NAME[reachSide]} side would reach ${plan[key] ? withoutIt : withIt}`}
        >
          {plan[key] ? '✓ ' : '+ '}{label}
        </button>
      ))}
      {tried && (
        <button type="button" onClick={() => setTries(t => ({ ...t, [reachSide]: null }))}
                title="Back to the orders actually given">
          As ordered
        </button>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <div className="page">
        <Masthead
          campaignName={shareData.name}
          turn={past ? past.turn : shareData.turn}
          date={past ? past.date : (shareData.date || null)}
          battlesFought={fought}
          pendingCount={pendingTerritoryIds.length}
          pendingPlace={pendingPlace}
          landingDeclaredBy={landingDeclaredBy}
          landingRightsFor={landingRightsFor}
          note={noteParts.length ? `${noteParts.join(' · ')} · read-only` : 'Read-only'}
          usaVP={score.USA}
          csaVP={score.CSA}
          actions={
            <a
              href={window.location.origin + window.location.pathname}
              className="ui-btn ui-btn-sm"
              title="Open the campaign tracker"
            >
              Open the tracker ↗
            </a>
          }
        >
          <ScoreStrip
            usaVP={score.USA}
            csaVP={score.CSA}
            usaSP={shareData.cpEnabled && !past ? shareData.cpUSA : null}
            csaSP={shareData.cpEnabled && !past ? shareData.cpCSA : null}
            usaNote={shareData.cpEnabled && !past ? `+${num((shareData.income || vp).USA)} per turn` : null}
            csaNote={shareData.cpEnabled && !past ? `+${num((shareData.income || vp).CSA)} per turn` : null}
            usaTerritories={owned.USA}
            csaTerritories={owned.CSA}
            neutralTerritories={owned.NEUTRAL}
          />
        </Masthead>

        {/* The plate across the full width of the page. */}
        <div className="map-row mt-7">
          <MapView
            territories={territories}
            selectedTerritory={selectedTerritory}
            onTerritoryClick={handleTerritoryClick}
            onTerritoryDoubleClick={handleTerritoryClick}
            pendingBattleTerritoryIds={pendingTerritoryIds}
            recentBattleTerritoryIds={recentTerritoryIds}
            battleDetails={battleDetails}
            spSettings={shareData.spSettings}
            atlasStyle={shareData.atlasStyle === true}
            season={shareData.season}
            terrainViz={shareData.terrainViz}
            tokens={gc?.tokens || null}
            mapFeatures={gc?.mapFeatures || null}
            influenceThreshold={influenceThreshold}
            reach={reach}
            reachSide={reach ? reachSide : null}
            toolbarExtra={<>{reachToggle}{orderTrials}{turnPager}</>}
            rivers={!isGC}
            relief
            waterways={shareData.waterways}
            readOnly
          />
          {waterNote && <p className="ui-hint mt-2">≈ {waterNote}</p>}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] gap-x-9 items-start">
          <div className="min-w-0">
            {/* The turn's write-up, carried along with the link - or the
                write-up of the turn paged back to - set in newspaper columns
                across the wide side of the page. */}
            {dispatch.length > 0 && (
              <Section>
                <SectionHead title={past ? 'From the Record' : 'Latest Intelligence'}
                             meta={`Turn ${past ? past.turn : shareData.turn}`} />
                <SectionBody>
                  <div className="lg:columns-2 gap-x-9">
                    {dispatch.map((paragraph, i) => (
                      <p key={i} className={`${i === 0 ? 'dropcap' : 'mt-2 text-justify'} text-[14.5px]`}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </SectionBody>
              </Section>
            )}
          </div>

          <div className="min-w-0">
            {/* What the campaign has cost. */}
            <Section>
              <SectionHead
                title="The Butcher's Bill"
                meta={fought > 0 ? `${fought} ${fought === 1 ? 'engagement' : 'engagements'}` : null}
              />
              <SectionBody>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-x-6">
                  <Row label={<span className={SIDE_TEXT.USA}>Union</span>} value={num(casualties.usa)} />
                  <Row label={<span className={SIDE_TEXT.CSA}>Confederate</span>} value={num(casualties.csa)} />
                  <Row label="Total" value={num(casualties.total)} />
                  <Row label="Per engagement" value={num(perEngagement)} />
                </div>
              </SectionBody>
            </Section>

            {/* Grand Campaign — pools, VP (capital captures / token wipes),
                token counts. */}
            {isGC && (() => {
              const alive = (side) => gc.tokens.filter(t => t.side === side && t.status !== 'wiped').length;
              const wiped = (side) => gc.tokens.filter(t => t.side === side && t.status === 'wiped').length;
              return (
                <Section>
                  <SectionHead title="The Grand Campaign" meta="first to 10 VP" />
                  <SectionBody>
                    {['USA', 'CSA'].map(side => (
                      <Row
                        key={`treasury-${side}`}
                        label={<><span className={SIDE_TEXT[side]}>{side}</span> treasury</>}
                        value={`$${num(gc.pools[side].treasury)}`}
                      />
                    ))}
                    {['USA', 'CSA'].map(side => (
                      <Row
                        key={`manpower-${side}`}
                        label={<><span className={SIDE_TEXT[side]}>{side}</span> manpower</>}
                        value={num(gc.pools[side].manpower)}
                      />
                    ))}
                    {['USA', 'CSA'].map(side => (
                      <Row
                        key={`tokens-${side}`}
                        label={<><span className={SIDE_TEXT[side]}>{side}</span> formations</>}
                        value={
                          <>
                            {alive(side)}
                            {wiped(side) > 0 && (
                              <span className="ui-hint ml-1.5">{wiped(side)} destroyed</span>
                            )}
                          </>
                        }
                      />
                    ))}
                  </SectionBody>
                </Section>
              );
            })()}
          </div>
        </div>

        {/* Regiment leaderboard */}
        {shareData.regiments && (
          <RegimentStats
            campaign={{ regiments: shareData.regiments, regimentStats: shareData.regimentStats || {} }}
          />
        )}

        <TerritoryList
          territories={territories}
          onTerritorySelect={handleTerritoryClick}
          spSettings={shareData.spSettings}
          pendingTerritoryIds={pendingTerritoryIds}
          reach={reach}
          waterways={shareData.waterways}
        />

        <footer className="mt-10 pt-2.5 border-t-[3px] border-double border-rule text-center ui-hint">
          {live
            ? <>Set live from the campaign record, Turn {shareData.turn} · updates as the campaign is played</>
            : <>Set from the campaign record at the close of Turn {shareData.turn}</>}
          <span className="mx-2">✦</span>Shared read-only
          <span className="mx-2">✦</span>Figures are casualties inflicted
        </footer>
      </div>
    </div>
  );
};

export default SharedMapView;
