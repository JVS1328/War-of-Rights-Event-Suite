/**
 * Reach: what ground a side may actually go at this turn.
 *
 * One calculation per (side, declaration), consumed by the plate, the roll and
 * the recorder, so all three dim and explain the same regions. The answer for
 * every region is worked out in a single pass - the distance map is built once
 * per call rather than once per region - and returned as a Map the callers can
 * look up by territory id.
 *
 * Three things can put a region in reach:
 *
 *   - plain adjacency: one step from the side's own line;
 *   - a declared offensive doctrine: Foot Cavalry two steps, Stuart's Ride
 *     three, the Anaconda Plan anywhere with water access;
 *   - landing rights earned by declaring a landing last turn: anywhere with
 *     water access, adjacency ignored.
 *
 * With the campaign's `requireAdjacentAttack` setting off, none of it applies
 * and everything that is not your own ground is in reach.
 *
 * Where a region is out of reach the entry carries a `reason` - what to print
 * on the tooltip or beside the disabled option - and, where a different set of
 * orders would have put it in reach, a `hint` saying which.
 */

import { getDistanceFromLine } from './campaignLogic';
import { getAttackRange, getSideDoctrines, getUsesRemaining } from './doctrines';

/**
 * How the range-extending doctrines are named in a hint. Written out rather
 * than derived so "the Anaconda Plan" keeps its article and the others do not.
 */
const HINT_NAMES = {
  'foot-cavalry': 'Foot Cavalry',
  'stuarts-ride': "Stuart's Ride",
  'anaconda-plan': 'the Anaconda Plan',
};

const IN_REACH = Object.freeze({ ok: true, reason: null, hint: null });

/**
 * Every region's standing with one side, under one set of orders.
 *
 * @param {Object} campaign
 * @param {'USA'|'CSA'} side - the side doing the attacking
 * @param {Object} [declaration]
 * @param {boolean} [declaration.doctrineDeclared=false] - the side is spending a doctrine use
 * @param {boolean} [declaration.landing=false] - the side holds landing rights this turn
 * @returns {Map<string, { ok: boolean, reason: string|null, hint: string|null }>}
 */
export const getReach = (campaign, side, { doctrineDeclared = false, landing = false } = {}) => {
  const reach = new Map();
  const territories = campaign?.territories || [];
  if (!territories.length) return reach;

  // Adjacency off: the only ground out of reach is your own.
  const enforced = !!campaign?.settings?.requireAdjacentAttack;

  // One breadth-first sweep out from the side's line, shared by every region.
  const distances = enforced ? getDistanceFromLine(campaign, side) : null;

  // The offensive doctrine the side drafted, and whether it could still be
  // spent. A hint for a doctrine with no uses left would be a false promise.
  const { offense } = getSideDoctrines(campaign, side);
  const offersRange = !doctrineDeclared
    && !!offense?.effects?.attackRange
    && getUsesRemaining(campaign, side) > 0;
  const hintName = offense ? (HINT_NAMES[offense.id] || offense.name) : null;

  for (const t of territories) {
    if (t.owner === side) {
      reach.set(t.id, { ok: false, reason: 'your own ground', hint: null });
      continue;
    }
    if (!enforced) {
      reach.set(t.id, IN_REACH);
      continue;
    }

    const isWater = !!t.hasWaterAccess;
    const pointValue = t.pointValue || t.victoryPoints || 0;
    const dist = distances.get(t.id);

    // Landing rights ignore adjacency entirely, but only over water.
    if (landing && isWater) {
      reach.set(t.id, IN_REACH);
      continue;
    }

    // What the declared orders are worth here, and how much of that came from
    // the region having water access (the Anaconda Plan, and nothing else so
    // far, reaches further over water than over land).
    const ctx = { pointValue };
    const range = doctrineDeclared
      ? getAttackRange(campaign, side, { ...ctx, isWaterAccess: isWater })
      : 1;
    const landRange = doctrineDeclared
      ? getAttackRange(campaign, side, { ...ctx, isWaterAccess: false })
      : 1;
    const waterRange = doctrineDeclared
      ? getAttackRange(campaign, side, { ...ctx, isWaterAccess: true })
      : 1;

    if (!isFinite(range) || (dist !== undefined && dist <= range)) {
      reach.set(t.id, IN_REACH);
      continue;
    }

    // --- Out of reach. Say why. ---------------------------------------
    // Where the extra reach on offer was water reach and this ground has no
    // water, that is the useful thing to say; the step count is beside the
    // point.
    const waterOnly = landing || waterRange > landRange;
    const reason = waterOnly && !isWater
      ? 'no water access'
      : dist === undefined
        ? 'not connected to your line'
        : `${dist} steps beyond your line`;

    // --- And what would have reached it. ------------------------------
    let hint = null;
    if (offersRange) {
      const would = getAttackRange(campaign, side, { ...ctx, isWaterAccess: isWater });
      if (!isFinite(would) || (dist !== undefined && dist <= would)) hint = `${hintName} would reach it`;
    }
    if (!hint && !landing && isWater) hint = 'a landing would reach it';

    reach.set(t.id, { ok: false, reason, hint });
  }

  return reach;
};
