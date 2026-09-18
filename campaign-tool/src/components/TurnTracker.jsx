import { Calendar, Archive, Flag, SkipForward, Play, DollarSign, Users, Footprints, Swords, Package, Shield, Train, Waves, LogOut, Trophy, MapPin, Skull, Medal } from 'lucide-react';
import { findAttackTargets, findStrongholdAtToken, canReplenish, canBoardRail, canBoardRiver } from '../utils/grandCampaignLogic';

/**
 * TurnTracker — the "whose turn is it" HUD for Grand Campaign.
 *
 * Shows current month, active side, current token, bag/discard counts, and
 * the national pools. Buttons:
 *   - Draw Next Token: starts the next token's turn (from activeSide's bag)
 *   - End Turn: ends the currently-drawn token's turn, flips activeSide
 */
const TurnTracker = ({ campaign, onDrawNext, onEndTurn, onBeginMove, turnMoveActive, onAttack, onReplenish, onGarrison, onBoardRail, onBoardRiver, onDisembark }) => {
  const gc = campaign?.grandCampaign;
  if (!gc || gc.phase !== 'playing') return null;

  const currentToken = gc.tokens.find(t => t.id === gc.currentTokenId);
  const activeSide = gc.activeSide;
  const sideColor = activeSide === 'USA' ? 'text-union-400' : 'text-rebel-400';
  const bagUSA = gc.bags.USA.length;
  const bagCSA = gc.bags.CSA.length;
  const discardUSA = gc.bags.discardUSA.length;
  const discardCSA = gc.bags.discardCSA.length;
  // Prefer the real calendar label (April 1861 → May 1861 → …) over the raw
  // turn counter. Falls back to "Month N" if a date isn't tracked.
  const monthLabel = campaign.campaignDate?.displayString
    || `Month ${campaign.currentTurn}`;

  return (
    <div className="ui-section border-brass-500/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="ui-title">
          <Calendar className="w-5 h-5" /> {monthLabel}
        </h3>
        <div className="text-xs text-mist-400">
          {gc.monthStartedBy && (
            <>Month started by <span className={gc.monthStartedBy === 'USA' ? 'text-union-400' : 'text-rebel-400'}>
              {gc.monthStartedBy}
            </span></>
          )}
        </div>
      </div>

      {/* Current turn indicator */}
      <div className="bg-ink-900 rounded p-3 mb-3">
        <div className="flex items-center gap-2 text-xs text-mist-400 mb-1">
          <Flag className="w-3.5 h-3.5" /> Now acting
        </div>
        {currentToken ? (
          <>
            <div className={`text-xl font-bold ${sideColor}`}>{currentToken.name}</div>
            <div className="text-[11px] text-mist-300 mt-1">
              MP used: <span className="text-white">{currentToken.movementPointsUsed || 0}</span>
              {' / '}{gc.settings.movementPointsPerTurn}
              {' · '}Manpower: <span className="text-white">{currentToken.manpower}</span>
              {' · '}Fatigue: <span className="text-white">{currentToken.fatigue}</span>
              {currentToken.status === 'last-stand' && <span className="text-orange-400 ml-1 font-bold">LAST STAND</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {onBeginMove && (currentToken.movementPointsUsed || 0) < gc.settings.movementPointsPerTurn && currentToken.status !== 'wiped' && (
                <button
                  onClick={onBeginMove}
                  className={`flex-1 min-w-[80px] rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1 ${
                    turnMoveActive
                      ? 'bg-brass-500 hover:bg-brass-400 text-white'
                      : 'bg-brass-500 hover:bg-brass-500 text-white'
                  }`}
                >
                  <Footprints className="w-4 h-4" />
                  {turnMoveActive ? 'Cancel' : 'Move'}
                </button>
              )}
              {onAttack && currentToken.status === 'active' && findAttackTargets(campaign, currentToken.id).length > 0 && (
                <button
                  onClick={onAttack}
                  className="flex-1 min-w-[80px] bg-rebel-500 hover:bg-rebel-500 text-white rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1"
                >
                  <Swords className="w-4 h-4" /> Attack
                </button>
              )}
              {onReplenish && canReplenish(campaign, currentToken.id).ok && (
                <button
                  onClick={onReplenish}
                  className="ui-btn ui-btn-primary ui-btn-sm flex-1 min-w-[80px]"
                  title="Replenish at city/fort"
                >
                  <Package className="w-4 h-4" /> Replenish
                </button>
              )}
              {onGarrison && findStrongholdAtToken(campaign, currentToken.id) && currentToken.status === 'active' && (
                <button
                  onClick={onGarrison}
                  className="flex-1 min-w-[80px] bg-ink-600 hover:bg-ink-500 text-white rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1"
                  title="Garrison men here"
                >
                  <Shield className="w-4 h-4" /> Garrison
                </button>
              )}
              {onBoardRail && !currentToken.boarded && canBoardRail(campaign, currentToken.id).ok && (
                <button
                  onClick={onBoardRail}
                  className="flex-1 min-w-[80px] bg-brass-500 hover:bg-brass-500 text-white rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1"
                  title="Board the train at this stop (ends turn)"
                >
                  <Train className="w-4 h-4" /> Board Rail
                </button>
              )}
              {onBoardRiver && !currentToken.boarded && canBoardRiver(campaign, currentToken.id).ok && (
                <button
                  onClick={onBoardRiver}
                  className="flex-1 min-w-[80px] bg-sky-700 hover:bg-sky-600 text-white rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1"
                  title="Embark onto the river (ends turn)"
                >
                  <Waves className="w-4 h-4" /> Embark River
                </button>
              )}
              {onDisembark && currentToken.boarded && (
                <button
                  onClick={onDisembark}
                  className="flex-1 min-w-[80px] bg-ink-700 hover:bg-ink-600 text-white rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1"
                  title="Disembark (ends turn)"
                >
                  <LogOut className="w-4 h-4" /> Disembark
                </button>
              )}
              <button
                onClick={onEndTurn}
                className="flex-1 min-w-[80px] bg-union-500 hover:bg-union-500 text-white rounded py-1.5 text-sm font-semibold flex items-center justify-center gap-1"
              >
                <SkipForward className="w-4 h-4" /> End
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-mist-400 italic mb-2">
              No token drawn. Active side: <span className={sideColor + ' font-semibold'}>{activeSide}</span>.
            </div>
            <button
              onClick={onDrawNext}
              className="ui-btn ui-btn-primary ui-btn-sm ui-btn-block"
            >
              <Play className="w-4 h-4" /> Draw Next Token
            </button>
          </>
        )}
      </div>

      {/* Bag state */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-ink-900 rounded p-2">
          <div className="text-[10px] uppercase tracking-wide text-union-400 mb-1">USA Bag</div>
          <div className="text-xs text-mist-300 flex items-center gap-1">
            <Archive className="w-3 h-3" /> Draw: <span className="text-white font-semibold">{bagUSA}</span>
            <span className="mx-1">·</span> Disc: <span className="text-mist-400">{discardUSA}</span>
          </div>
        </div>
        <div className="bg-ink-900 rounded p-2">
          <div className="text-[10px] uppercase tracking-wide text-rebel-400 mb-1">CSA Bag</div>
          <div className="text-xs text-mist-300 flex items-center gap-1">
            <Archive className="w-3 h-3" /> Draw: <span className="text-white font-semibold">{bagCSA}</span>
            <span className="mx-1">·</span> Disc: <span className="text-mist-400">{discardCSA}</span>
          </div>
        </div>
      </div>

      {/* National pools — treasury / manpower / monthly income preview /
          cities / battle wins / total casualties suffered / current VP. */}
      {(() => {
        const cityUSA = gc.mapFeatures.cities.filter(c => c.side === 'USA').length;
        const cityCSA = gc.mapFeatures.cities.filter(c => c.side === 'CSA').length;
        const winsUSA = campaign.battles.filter(b => b.status === 'completed' && b.winner === 'USA').length;
        const winsCSA = campaign.battles.filter(b => b.status === 'completed' && b.winner === 'CSA').length;
        const incomePerCity = gc.settings.incomePerCity;
        const manpowerPerCity = gc.settings.manpowerPerCity;
        const incomeUSA = cityUSA * incomePerCity;
        const incomeCSA = cityCSA * incomePerCity;
        const manpowerRegenUSA = cityUSA * manpowerPerCity;
        const manpowerRegenCSA = cityCSA * manpowerPerCity;

        // Total casualties suffered per side across every resolved GC
        // battle. casualties.{attacker,defender}Total are the modified
        // numbers we actually took off tokens, including support splits.
        let casUSA = 0, casCSA = 0;
        for (const b of campaign.battles) {
          if (b.mode !== 'grand' || b.status !== 'completed' || !b.casualties) continue;
          const atkSide = b.attacker;
          const defSide = b.defender;
          if (atkSide === 'USA') casUSA += b.casualties.attackerTotal || 0;
          else if (atkSide === 'CSA') casCSA += b.casualties.attackerTotal || 0;
          if (defSide === 'USA') casUSA += b.casualties.defenderTotal || 0;
          else if (defSide === 'CSA') casCSA += b.casualties.defenderTotal || 0;
        }
        const vpUSA = campaign.victoryPointsUSA || 0;
        const vpCSA = campaign.victoryPointsCSA || 0;
        const vpToWin = gc.settings.vpToWin;

        const sideCard = (label, tone, treasury, manpower, income, manpowerRegen, wins, cities, casualties, vp) => (
          <div className="bg-ink-900 rounded p-2">
            <div className={`text-[10px] uppercase tracking-wide ${tone} mb-1`}>{label}</div>
            <div className="text-xs text-mist-300 flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-green-400" />
              <span className="text-white font-semibold">${treasury.toLocaleString()}</span>
              <span className="text-[10px] text-green-400/80 ml-auto">+${income}/mo</span>
            </div>
            <div className="text-xs text-mist-300 flex items-center gap-1 mt-0.5">
              <Users className="w-3 h-3 text-brass-400" />
              <span className="text-white font-semibold">{manpower.toLocaleString()}</span>
              <span className="text-[10px] text-brass-400/80 ml-auto">+{manpowerRegen}/mo</span>
            </div>
            <div className="text-xs text-mist-300 flex items-center gap-1 mt-0.5 pt-1 border-t border-ink-800">
              <MapPin className="w-3 h-3 text-mist-400" />
              <span className="text-white">{cities}</span>
              <span className="text-[10px] text-mist-500">cities</span>
              <Trophy className="w-3 h-3 text-mist-400 ml-auto" />
              <span className="text-white">{wins}</span>
              <span className="text-[10px] text-mist-500">wins</span>
            </div>
            <div className="text-xs text-mist-300 flex items-center gap-1 mt-0.5">
              <Skull className="w-3 h-3 text-mist-400" />
              <span className="text-white">{casualties.toLocaleString()}</span>
              <span className="text-[10px] text-mist-500">lost</span>
              <Medal className="w-3 h-3 text-brass-400 ml-auto" />
              <span className="text-brass-300 font-semibold">{vp}</span>
              <span className="text-[10px] text-mist-500">/ {vpToWin} VP</span>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-2 gap-2">
            {sideCard('USA Pool', 'text-union-400', gc.pools.USA.treasury, gc.pools.USA.manpower, incomeUSA, manpowerRegenUSA, winsUSA, cityUSA, casUSA, vpUSA)}
            {sideCard('CSA Pool', 'text-rebel-400', gc.pools.CSA.treasury, gc.pools.CSA.manpower, incomeCSA, manpowerRegenCSA, winsCSA, cityCSA, casCSA, vpCSA)}
          </div>
        );
      })()}

      <div className="text-[10px] text-mist-500 mt-2 italic">
        When both bags empty, the month rolls over: income, manpower regen, and the first drawer flips. Per-month adds shown above reflect {gc.settings.incomePerCity}$ and {gc.settings.manpowerPerCity} manpower per owned city.
      </div>
    </div>
  );
};

export default TurnTracker;
