import { CAMPAIGN_TEMPLATES } from '../data/defaultCampaign';

/**
 * Who held what, and when.
 *
 * Ground only changes hands in battle, so the board at any turn is today's
 * board with the later fighting on each piece of ground undone. A battle
 * leaves its ground with `battle.winner` - already rewritten to whoever ended
 * up holding it when a fight on neutral ground was lost or Iron Brigade held
 * it - except a raid, which leaves the ground where it was.
 */

const otherSide = (side) => (side === 'USA' ? 'CSA' : 'USA');

// The board each template opens on, built once and only when an old battle
// needs it.
const openings = new Map();
const openingOwner = (campaign, territoryId) => {
  const key = campaign.mapTemplate;
  if (!CAMPAIGN_TEMPLATES[key] || key === 'custom') return undefined;
  if (!openings.has(key)) {
    const fresh = CAMPAIGN_TEMPLATES[key].create();
    openings.set(key, new Map(fresh.territories.map(t => [t.id, t.owner])));
  }
  return openings.get(key).get(territoryId);
};

/**
 * Who held the ground going into a battle.
 *
 * Battles record it since it was first needed. Older ones are read back from
 * what the campaign kept: the ground's capture history, a capture this battle
 * set consolidating, the board the campaign opened on, and failing all of
 * those the fight itself - an attack that carried was made on the other
 * side's ground, one that failed was held.
 *
 * @param {Object} campaign
 * @param {Object} battle - a completed battle
 * @returns {string} 'USA' | 'CSA' | 'NEUTRAL'
 */
export const ownerBefore = (campaign, battle) => {
  if (battle.previousOwner) return battle.previousOwner;
  const territory = (campaign.territories || []).find(t => t.id === battle.territoryId);
  const history = territory?.captureHistory || [];
  const index = history.findIndex(h => h.battleId === battle.id);
  if (index > 0) return history[index - 1].owner;
  const ts = territory?.transitionState;
  if (ts?.isTransitioning && !ts.raided && ts.capturedOnTurn === battle.turn && territory.owner === battle.winner) {
    return ts.previousOwner;
  }
  return openingOwner(campaign, battle.territoryId)
    ?? (battle.winner === battle.attacker ? otherSide(battle.attacker) : battle.winner);
};

/** Whether a battle moved its ground from one holder to another. */
export const changedHands = (campaign, battle) =>
  !battle.wasRaid && ownerBefore(campaign, battle) !== battle.winner;

/**
 * The board at the close of `turn`, as it stood heading into the next: who
 * held each territory, and any capture still consolidating.
 *
 * Ground not fought over since keeps its owner as it stands today, so an
 * admin's own edits to the board are never undone. A consolidating capture
 * runs the campaign's transition length from the turn it was taken, counted
 * down at each turn's close; one that consolidated at once awarded its VP in
 * the battle, and one still running today gives its own exact length.
 *
 * @param {Object} campaign
 * @param {number} turn
 * @returns {Map<string, { owner: string, transitionState: Object|null }>}
 */
export const boardAtTurn = (campaign, turn) => {
  const territories = campaign.territories || [];
  const board = new Map(territories.map(t => [t.id, { owner: t.owner, transitionState: null }]));
  const gradual = campaign.settings?.instantVPGains === false;

  // Each piece of ground's fights, in the order they were settled.
  const byGround = new Map();
  const fought = (campaign.battles || [])
    .filter(b => b.status === 'completed' && b.winner && board.has(b.territoryId))
    .sort((a, b) => a.turn - b.turn);
  for (const b of fought) {
    if (!byGround.has(b.territoryId)) byGround.set(b.territoryId, []);
    byGround.get(b.territoryId).push(b);
  }

  for (const territory of territories) {
    const battles = byGround.get(territory.id);
    if (!battles) continue;
    let owner = ownerBefore(campaign, battles[0]);
    let taken = null; // the last capture by then: { battle, from }
    for (const b of battles) {
      if (b.turn > turn) break;
      if (b.wasRaid || b.winner === owner) continue;
      taken = { battle: b, from: owner };
      owner = b.winner;
    }
    const entry = board.get(territory.id);
    if (battles.some(b => b.turn > turn)) entry.owner = owner;

    if (gradual && taken && !taken.battle.victoryPointsAwarded) {
      const ts = territory.transitionState;
      const since = taken.battle.turn;
      const total = ts?.capturedOnTurn === since && !ts.raided
        ? ts.totalTurns
        : (campaign.settings?.captureTransitionTurns || 2);
      const remaining = total - (turn - since + 1);
      if (remaining > 0) {
        entry.transitionState = {
          isTransitioning: true, turnsRemaining: remaining, totalTurns: total,
          previousOwner: taken.from, capturedOnTurn: since,
        };
      }
    }
  }
  return board;
};
