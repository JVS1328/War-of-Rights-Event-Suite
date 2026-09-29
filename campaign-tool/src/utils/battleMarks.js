/**
 * Which battles the plate marks, and what each mark needs to know.
 *
 * Shared by the tracker and the share payload, so a shared board marks the
 * same fights, in the same weather, as the admin's.
 */

/** Battles still to be fought. */
export const pendingBattles = (campaign) =>
  (campaign?.battles || []).filter(b => b.status === 'pending' || !b.winner);

/** Battles fought this turn or last - the ones whose smoke is still about. */
export const recentBattles = (campaign) =>
  (campaign?.battles || []).filter(
    b => b.status === 'completed' && b.winner && b.turn >= (campaign.currentTurn ?? 0) - 1);

/**
 * How the beaten side came off the field, by what it lost against what it
 * cost the victors: a rout at twice or worse (the dispatch's "one-sided
 * business"), a fighting withdrawal when it was close, a retreat between.
 */
export const lossOf = (b) => {
  const winner = b.winner;
  if (winner !== 'USA' && winner !== 'CSA') return null;
  const won = b.casualties?.[winner] || 0;
  const lost = b.casualties?.[winner === 'USA' ? 'CSA' : 'USA'] || 0;
  if (!won && !lost) return 'retreat';
  const ratio = lost / Math.max(1, won);
  return ratio >= 2 ? 'rout' : ratio < 1.2 ? 'withdrawal' : 'retreat';
};

/**
 * What a battle's mark shows: who fought it, who won, in what conditions,
 * how the loser came off, and whether it was fought this turn - the field
 * still smoulders - or before, when the victors have dug in.
 */
export const markDetail = (b, currentTurn) => ({
  attacker: b.attacker || null,
  winner: b.winner || null,
  weather: b.conditions?.weather || null,
  time: b.conditions?.time || null,
  fresh: b.turn >= (currentTurn ?? 0),
  loss: lossOf(b),
});

/**
 * Details by territory for every marked battle. A pending battle wins over a
 * finished one on the same ground; otherwise the later battle does.
 *
 * @returns {{ [territoryId]: { attacker, winner, weather, time, fresh, loss } }}
 */
export const battleMarkDetails = (campaign) =>
  Object.fromEntries([...recentBattles(campaign), ...pendingBattles(campaign)]
    .filter(b => b.territoryId)
    .map(b => [b.territoryId, markDetail(b, campaign.currentTurn)]));
