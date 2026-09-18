/**
 * Season initiative.
 *
 * One roll at the start of a season decides which side acts first. From there
 * the first move alternates every turn, so neither side keeps the advantage -
 * the same shape as the Grand Campaign's coin flip and `monthStartedBy`.
 *
 * Only the winning side and the turn it was rolled on are stored; whose go it
 * is on any given turn is derived, so there is no per-turn state to keep in
 * sync or migrate.
 */

export const SIDES = ['USA', 'CSA'];

export const opposite = (side) => (side === 'USA' ? 'CSA' : 'USA');

/**
 * Roll for who acts first this season.
 *
 * @returns {{ firstSide: string, rolledOnTurn: number, rolledAt: string }}
 */
export function rollInitiative(turn = 1) {
  return {
    firstSide: SIDES[Math.floor(Math.random() * SIDES.length)],
    rolledOnTurn: turn,
    rolledAt: new Date().toISOString(),
  };
}

/**
 * Which side moves first on a given turn.
 *
 * Alternates from the side that won the roll: they lead on the turn it was
 * rolled for, the other side leads the turn after, and so on.
 *
 * @param {Object|null} initiative - Campaign initiative state
 * @param {number} turn - Turn to resolve
 * @returns {string|null} 'USA' | 'CSA', or null if no roll has happened
 */
export function getFirstSideForTurn(initiative, turn) {
  if (!initiative?.firstSide) return null;
  if (initiative.alternate === false) return initiative.firstSide;

  const elapsed = (turn ?? 1) - (initiative.rolledOnTurn ?? 1);
  // Negative elapsed (a turn before the roll) still alternates correctly.
  return Math.abs(elapsed % 2) === 0
    ? initiative.firstSide
    : opposite(initiative.firstSide);
}

/**
 * Both sides in the order they act on a given turn.
 *
 * @returns {string[]} e.g. ['CSA', 'USA'], or [] when no roll has happened
 */
export function getTurnOrder(initiative, turn) {
  const first = getFirstSideForTurn(initiative, turn);
  return first ? [first, opposite(first)] : [];
}

/** Has a season initiative roll happened yet? */
export const hasInitiative = (initiative) => !!initiative?.firstSide;
