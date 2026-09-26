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

/** What a battle's mark shows: who fought it, who won, and in what conditions. */
export const markDetail = (b) => ({
  attacker: b.attacker || null,
  winner: b.winner || null,
  weather: b.conditions?.weather || null,
  time: b.conditions?.time || null,
});

/**
 * Details by territory for every marked battle. A pending battle wins over a
 * finished one on the same ground; otherwise the later battle does.
 *
 * @returns {{ [territoryId]: { attacker, winner, weather, time } }}
 */
export const battleMarkDetails = (campaign) =>
  Object.fromEntries([...recentBattles(campaign), ...pendingBattles(campaign)]
    .filter(b => b.territoryId)
    .map(b => [b.territoryId, markDetail(b)]));
