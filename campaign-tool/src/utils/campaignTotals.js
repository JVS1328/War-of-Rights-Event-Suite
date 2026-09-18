/**
 * The figures the masthead score strip is made of.
 *
 * The tracker's masthead and the "Butcher's Bill" panel both used to run
 * these reduces, and a shared link ran a third copy. One place now, so the
 * numbers cannot drift apart.
 */

/** A territory's points, whichever field the map author used. */
export const territoryVP = (t) => t.victoryPoints ?? t.pointValue ?? 0;

/**
 * Victory points by side.
 *
 * With `instantVP` off, ground still changing hands does not count for the
 * new owner until the transition finishes.
 */
export const vpTotals = (territories = [], instantVP = true) => {
  const sum = (side) =>
    territories
      .filter(t => t.owner === side)
      .filter(t => instantVP || !t.transitionState?.isTransitioning)
      .reduce((total, t) => total + territoryVP(t), 0);
  return { USA: sum('USA'), CSA: sum('CSA') };
};

/** How much ground each side holds. */
export const ownedCounts = (territories = []) => ({
  USA: territories.filter(t => t.owner === 'USA').length,
  CSA: territories.filter(t => t.owner === 'CSA').length,
  NEUTRAL: territories.filter(t => t.owner === 'NEUTRAL').length,
  total: territories.length,
});

/** Casualties inflicted, across every battle on the record. */
export const casualtyTotals = (battles = []) =>
  battles.reduce(
    (totals, battle) => {
      const usa = battle.casualties?.USA || 0;
      const csa = battle.casualties?.CSA || 0;
      return { usa: totals.usa + usa, csa: totals.csa + csa, total: totals.total + usa + csa };
    },
    { usa: 0, csa: 0, total: 0 }
  );

/** Battles settled, and battles still open. */
export const battleCounts = (battles = []) => ({
  fought: battles.filter(b => b.status !== 'pending' && b.winner).length,
  pending: battles.filter(b => b.status === 'pending' || !b.winner).length,
});
