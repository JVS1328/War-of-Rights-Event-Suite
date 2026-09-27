import { useState } from 'react';
import MapView from './MapView';
import RegimentStats from './RegimentStats';
import TerritoryList from './TerritoryList';
import { GRAND_CAMPAIGN_DEFAULTS } from '../data/grandCampaign';
import {
  Masthead, ScoreStrip, Section, SectionHead, SectionBody, Row, SIDE_TEXT,
} from './ui/Primitives';
import { vpTotals, ownedCounts } from '../utils/campaignTotals';
import { num } from '../utils/format';

/**
 * The read-only edition: the same sheet the tracker prints, set from a share
 * payload instead of live campaign state.
 *
 * The roll of territories is the tracker's own component, fed this payload's
 * pending battles and SP settings — there is no second copy of that table.
 */
const SIDE_NAME = { USA: 'Union', CSA: 'Confederate' };

const SharedMapView = ({ shareData }) => {
  const [selectedId, setSelectedId] = useState(null);
  // The side whose reach the plate shows, once the reader picks one; until
  // then it follows whichever side the admin's own sheet is set to.
  const [reachPick, setReachPick] = useState(null);

  const {
    territories,
    pendingTerritoryIds = [],
    grandCampaign: gc = null,
    dispatch = [],
  } = shareData;
  const isGC = !!gc;
  const live = !!shareData.live;

  // A live link swaps the board out under the reader, so the selection is
  // held by id and looked up afresh each time.
  const selectedTerritory = territories.find(t => t.id === selectedId) || null;

  // Each side's reach, worked out by the tracker when it published. Older
  // links carry none, and the plate dims nothing.
  const reachBySide = shareData.reach || null;
  const reachSide = reachPick || shareData.reachSide || 'USA';
  const reach = reachSide !== 'off' ? (reachBySide?.[reachSide] || null) : null;
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
  const landingDeclaredBy =
    ['USA', 'CSA'].find(side => shareData.orders?.[side]?.action === 'landing') || null;
  const landingRightsFor =
    ['USA', 'CSA'].find(side => shareData.landingRights?.[side]) || null;

  // Named in the standfirst only when there is exactly one to name.
  const pendingPlace = pendingTerritoryIds.length === 1
    ? (territories.find(t => t.id === pendingTerritoryIds[0])?.name || null)
    : null;

  const noteParts = [
    isGC && `Grand Campaign · first to ${GRAND_CAMPAIGN_DEFAULTS.vpToWin} VP`,
    live && 'Live',
  ].filter(Boolean);

  const casualties = shareData.casualties || { usa: 0, csa: 0, total: 0 };
  const fought = shareData.battleCount || 0;
  const perEngagement = fought > 0 ? Math.round(casualties.total / fought) : 0;

  // Whose reach the plate shows: the same wash the tracker prints for the
  // side its sheet is set to.
  const reachToggle = reachBySide && (
    <div className="ui-segment mr-2" aria-label="Ground in reach">
      {['USA', 'CSA'].map(side => (
        <button
          key={side}
          type="button"
          onClick={() => setReachPick(side)}
          data-active={reachSide === side}
          data-side={side}
          title={`Dim the ground the ${SIDE_NAME[side]} side cannot attack this turn`}
        >
          {SIDE_NAME[side]} reach
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

  return (
    <div className="app-shell">
      <div className="page">
        <Masthead
          campaignName={shareData.name}
          turn={shareData.turn}
          date={shareData.date || null}
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
            usaSP={shareData.cpEnabled ? shareData.cpUSA : null}
            csaSP={shareData.cpEnabled ? shareData.cpCSA : null}
            usaNote={shareData.cpEnabled ? `+${num((shareData.income || vp).USA)} per turn` : null}
            csaNote={shareData.cpEnabled ? `+${num((shareData.income || vp).CSA)} per turn` : null}
            usaTerritories={owned.USA}
            csaTerritories={owned.CSA}
            neutralTerritories={owned.NEUTRAL}
          />
        </Masthead>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] gap-x-9 mt-7 items-start">
          <div className="min-w-0">
            <MapView
              territories={territories}
              selectedTerritory={selectedTerritory}
              onTerritoryClick={handleTerritoryClick}
              onTerritoryDoubleClick={handleTerritoryClick}
              pendingBattleTerritoryIds={pendingTerritoryIds}
              recentBattleTerritoryIds={shareData.recentTerritoryIds}
              battleDetails={shareData.battleDetails}
              spSettings={shareData.spSettings}
              atlasStyle={shareData.atlasStyle === true}
              season={shareData.season}
              terrainViz={shareData.terrainViz}
              tokens={gc?.tokens || null}
              mapFeatures={gc?.mapFeatures || null}
              influenceThreshold={influenceThreshold}
              reach={reach}
              reachSide={reach ? reachSide : null}
              toolbarExtra={reachToggle}
              rivers={!isGC}
              readOnly
            />
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

            {/* The turn's write-up, carried along with the link. */}
            {dispatch.length > 0 && (
              <Section>
                <SectionHead title="Latest Intelligence" meta={`Turn ${shareData.turn}`} />
                <SectionBody>
                  {dispatch.map((paragraph, i) => (
                    <p key={i} className={`${i === 0 ? 'dropcap' : 'mt-2 text-justify'} text-[14.5px]`}>
                      {paragraph}
                    </p>
                  ))}
                </SectionBody>
              </Section>
            )}

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
