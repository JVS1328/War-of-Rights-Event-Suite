import { Section, SectionHead, SectionBody, Tag, SIDE_TEXT } from './ui/Primitives';
import { findAttackTargets, findStrongholdAtToken, canReplenish, canBoardRail, canBoardRiver } from '../utils/grandCampaignLogic';

/**
 * Orders of the Day — whose turn it is in a Grand Campaign month.
 *
 * The month heads the section; the acting formation is ruled off below it with
 * the orders it may give; the bags and the two national pools are set as
 * ledgers. Buttons:
 *   - Draw the next token: starts the next token's turn (from activeSide's bag)
 *   - End turn: ends the currently-drawn token's turn, flips activeSide
 */
const TurnTracker = ({ campaign, onDrawNext, onEndTurn, onBeginMove, turnMoveActive, onAttack, onReplenish, onGarrison, onBoardRail, onBoardRiver, onDisembark }) => {
  const gc = campaign?.grandCampaign;
  if (!gc || gc.phase !== 'playing') return null;

  const currentToken = gc.tokens.find(t => t.id === gc.currentTokenId);
  const activeSide = gc.activeSide;
  // Prefer the real calendar label (April 1861 → May 1861 → …) over the raw
  // turn counter. Falls back to "Month N" if a date isn't tracked.
  const monthLabel = campaign.campaignDate?.displayString
    || `Month ${campaign.currentTurn}`;

  const num = (n) => (n || 0).toLocaleString('en-US');

  // The pools, per side: treasury and manpower with what a month adds,
  // cities held, engagements won, men lost, and victory points.
  const cities = (side) => gc.mapFeatures.cities.filter(c => c.side === side).length;
  const wins = (side) =>
    campaign.battles.filter(b => b.status === 'completed' && b.winner === side).length;

  // Casualties suffered per side across every resolved GC battle.
  // casualties.{attacker,defender}Total are the modified numbers we actually
  // took off tokens, including support splits.
  const casualties = { USA: 0, CSA: 0 };
  for (const b of campaign.battles) {
    if (b.mode !== 'grand' || b.status !== 'completed' || !b.casualties) continue;
    if (casualties[b.attacker] != null) casualties[b.attacker] += b.casualties.attackerTotal || 0;
    if (casualties[b.defender] != null) casualties[b.defender] += b.casualties.defenderTotal || 0;
  }

  const vp = { USA: campaign.victoryPointsUSA || 0, CSA: campaign.victoryPointsCSA || 0 };
  const vpToWin = gc.settings.vpToWin;

  // The orders this formation may give. `primary` marks the one filled
  // button — moving while it still has the feet for it, ending the turn
  // when it hasn't.
  const mpLeft = currentToken
    ? gc.settings.movementPointsPerTurn - (currentToken.movementPointsUsed || 0)
    : 0;
  const canMove = !!onBeginMove && !!currentToken && mpLeft > 0 && currentToken.status !== 'wiped';

  const orders = currentToken ? [
    canMove && {
      key: 'move',
      label: turnMoveActive ? 'Cancel move' : 'Move',
      onClick: onBeginMove,
      primary: true,
    },
    onAttack && currentToken.status === 'active' && findAttackTargets(campaign, currentToken.id).length > 0 && {
      key: 'attack',
      label: 'Attack',
      onClick: onAttack,
    },
    onReplenish && canReplenish(campaign, currentToken.id).ok && {
      key: 'replenish',
      label: 'Replenish',
      onClick: onReplenish,
      title: 'Buy men at this city or fort',
    },
    onGarrison && findStrongholdAtToken(campaign, currentToken.id) && currentToken.status === 'active' && {
      key: 'garrison',
      label: 'Garrison',
      onClick: onGarrison,
      title: 'Leave men in this stronghold',
    },
    onBoardRail && !currentToken.boarded && canBoardRail(campaign, currentToken.id).ok && {
      key: 'rail',
      label: 'Board the rail',
      onClick: onBoardRail,
      title: 'Board the train at this stop (ends the turn)',
    },
    onBoardRiver && !currentToken.boarded && canBoardRiver(campaign, currentToken.id).ok && {
      key: 'river',
      label: 'Take to the river',
      onClick: onBoardRiver,
      title: 'Embark onto the river (ends the turn)',
    },
    onDisembark && currentToken.boarded && {
      key: 'disembark',
      label: 'Disembark',
      onClick: onDisembark,
      title: 'Put the men ashore (ends the turn)',
    },
    {
      key: 'end',
      label: 'End turn',
      onClick: onEndTurn,
      primary: !canMove,
    },
  ].filter(Boolean) : [];

  return (
    <Section>
      <SectionHead
        title={monthLabel}
        meta={gc.monthStartedBy ? `month started by ${gc.monthStartedBy}` : null}
      />
      <SectionBody>
        {/* Who has the initiative this moment, and what they may do with it. */}
        <div className="ui-box">
          <div className="ui-eyebrow">Now acting</div>
          {currentToken ? (
            <>
              <div className={`text-lg font-bold leading-tight ${SIDE_TEXT[currentToken.side]}`}>
                {currentToken.name}
                {currentToken.status === 'last-stand' && (
                  <Tag tone="mark" className="ml-2">Last stand</Tag>
                )}
              </div>
              <div className="text-ink-2 text-[13px] tabular mt-0.5">
                {currentToken.movementPointsUsed || 0} of {gc.settings.movementPointsPerTurn} MP spent
                <span className="text-ink-3"> · </span>
                {num(currentToken.manpower)} men
                <span className="text-ink-3"> · </span>
                fatigue {currentToken.fatigue}
                {currentToken.boarded && (
                  <>
                    <span className="text-ink-3"> · </span>
                    <span className="italic">aboard the {currentToken.boarded.type}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {orders.map(o => (
                  <button
                    key={o.key}
                    onClick={o.onClick}
                    title={o.title}
                    className={`ui-btn ui-btn-sm ${o.primary ? 'ui-btn-primary' : ''}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] mt-0.5">
                No formation drawn. The{' '}
                <span className={`font-bold ${SIDE_TEXT[activeSide]}`}>{activeSide}</span> bag is next.
              </div>
              <button onClick={onDrawNext} className="ui-btn ui-btn-primary ui-btn-block mt-2.5">
                Draw the next token
              </button>
            </>
          )}
        </div>

        {/* The bags. */}
        <div className="overflow-x-auto mt-4">
          <table className="ui-table">
            <thead>
              <tr>
                <th>The bags</th>
                <th className="num">To draw</th>
                <th className="num">Discarded</th>
              </tr>
            </thead>
            <tbody>
              {['USA', 'CSA'].map(side => (
                <tr key={side}>
                  <td className={`font-bold ${SIDE_TEXT[side]}`}>{side}</td>
                  <td className="num font-bold">{gc.bags[side].length}</td>
                  <td className="num text-ink-2">{gc.bags[side === 'USA' ? 'discardUSA' : 'discardCSA'].length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* The national pools. The smaller figure under the treasury and the
            men is what a month adds at the cities each side holds. */}
        <div className="overflow-x-auto mt-4">
          {/* Seven columns in a narrow measure: the gutters come in so the
              whole ledger still fits a phone. */}
          <table className="ui-table [&_th+th]:pl-2 [&_td+td]:pl-2">
            <thead>
              <tr>
                <th>Pool</th>
                <th className="num">Treasury</th>
                <th className="num">Men</th>
                <th className="num">Cities</th>
                <th className="num">Won</th>
                <th className="num">Lost</th>
                <th className="num">V.P.</th>
              </tr>
            </thead>
            <tbody>
              {['USA', 'CSA'].map(side => (
                <tr key={side}>
                  <td className={`font-bold ${SIDE_TEXT[side]}`}>{side}</td>
                  <td className="num">
                    <div className="font-bold">${num(gc.pools[side].treasury)}</div>
                    <div className="text-ink-3 text-[11px]">
                      +${num(cities(side) * gc.settings.incomePerCity)}
                    </div>
                  </td>
                  <td className="num">
                    <div className="font-bold">{num(gc.pools[side].manpower)}</div>
                    <div className="text-ink-3 text-[11px]">
                      +{num(cities(side) * gc.settings.manpowerPerCity)}
                    </div>
                  </td>
                  <td className="num">{cities(side)}</td>
                  <td className="num">{wins(side)}</td>
                  <td className="num">{num(casualties[side])}</td>
                  <td className="num font-bold whitespace-nowrap">
                    {vp[side]}
                    <span className="text-ink-3 font-normal"> / {vpToWin}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="ui-hint mt-2">
          When both bags are empty the month rolls over: the treasuries take
          their income, the depots their men, and the first draw changes hands.
          The smaller figures are what one month adds, at ${gc.settings.incomePerCity} and{' '}
          {gc.settings.manpowerPerCity} men for every city held.
        </p>
      </SectionBody>
    </Section>
  );
};

export default TurnTracker;
