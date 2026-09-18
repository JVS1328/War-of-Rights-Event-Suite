import { useState } from 'react';
import MapView from './MapView';
import RegimentStats from './RegimentStats';
import TerritoryList from './TerritoryList';
import { GRAND_CAMPAIGN_DEFAULTS } from '../data/grandCampaign';
import {
  Masthead, ScoreStrip, Section, SectionHead, SectionBody, Row, SIDE_TEXT,
} from './ui/Primitives';
import { vpTotals, ownedCounts } from '../utils/campaignTotals';

/**
 * The read-only edition: the same sheet the tracker prints, set from a share
 * payload instead of live campaign state.
 *
 * The roll of territories is the tracker's own component, fed this payload's
 * pending battles and SP settings — there is no second copy of that table.
 */
const SharedMapView = ({ shareData }) => {
  const [selectedTerritory, setSelectedTerritory] = useState(null);

  const {
    territories,
    pendingTerritoryIds = [],
    grandCampaign: gc = null,
    dispatch = [],
  } = shareData;
  const isGC = !!gc;
  const influenceThreshold = isGC ? GRAND_CAMPAIGN_DEFAULTS.influenceThreshold : 0;

  const vp = vpTotals(territories, !!shareData.instantVP);
  const owned = ownedCounts(territories);

  const handleTerritoryClick = (territory) => {
    setSelectedTerritory(prev => (prev?.id === territory.id ? null : territory));
  };

  // Named in the standfirst only when there is exactly one to name.
  const pendingPlace = pendingTerritoryIds.length === 1
    ? (territories.find(t => t.id === pendingTerritoryIds[0])?.name || null)
    : null;

  const casualties = shareData.casualties || { usa: 0, csa: 0, total: 0 };
  const fought = shareData.battleCount || 0;
  const perEngagement = fought > 0 ? Math.round(casualties.total / fought) : 0;
  const num = (n) => (n || 0).toLocaleString('en-US');

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
          note={isGC ? 'Grand Campaign · read-only' : 'Read-only'}
          usaVP={vp.USA}
          csaVP={vp.CSA}
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
            usaVP={vp.USA}
            csaVP={vp.CSA}
            usaSP={shareData.cpEnabled ? shareData.cpUSA : null}
            csaSP={shareData.cpEnabled ? shareData.cpCSA : null}
            usaNote={shareData.cpEnabled ? `+${vp.USA} per turn` : null}
            csaNote={shareData.cpEnabled ? `+${vp.CSA} per turn` : null}
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
              spSettings={shareData.spSettings}
              atlasStyle={shareData.atlasStyle === true}
              terrainViz={shareData.terrainViz}
              tokens={gc?.tokens || null}
              mapFeatures={gc?.mapFeatures || null}
              influenceThreshold={influenceThreshold}
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
                    <Row
                      label="Victory points"
                      value={
                        <>
                          <span className={SIDE_TEXT.USA}>{gc.vpUSA}</span>
                          <span className="text-ink-3"> — </span>
                          <span className={SIDE_TEXT.CSA}>{gc.vpCSA}</span>
                        </>
                      }
                    />
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
        />

        <footer className="mt-10 pt-2.5 border-t-[3px] border-double border-rule text-center ui-hint">
          Set from the campaign record at the close of Turn {shareData.turn}
          <span className="mx-2">✦</span>Shared read-only
          <span className="mx-2">✦</span>Figures are casualties inflicted
        </footer>
      </div>
    </div>
  );
};

export default SharedMapView;
