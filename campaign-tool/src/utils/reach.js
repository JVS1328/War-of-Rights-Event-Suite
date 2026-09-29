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
 * Reach over water - a landing, or the Anaconda Plan - comes up water the side
 * already holds: the region must lie on a waterway (the sea and tidewater, or
 * the Western rivers; see `utils/waterways.js`) that some water region of the
 * side's own lies on too. Holding Cincinnati puts the whole of the Western
 * rivers in reach, and none of the coast. Where the map cannot tell which
 * water a region is on - no county geography, or a region ticked for water by
 * hand that the map does not place on either - the older rule stands and any
 * water region will do.
 *
 * With the campaign's `requireAdjacentAttack` setting off, none of it applies
 * and everything that is not your own ground is in reach.
 *
 * A side whose orders make no attack this turn (defend, or a landing being
 * declared) has nothing in reach at all, whatever the adjacency setting.
 *
 * Where a region is out of reach the entry carries a `reason` - what to print
 * on the tooltip or beside the disabled option - and, where a different set of
 * orders would have put it in reach, a `hint` saying which.
 */

import { getDistanceFromLine } from './campaignLogic';
import { getAttackRange, getSideDoctrines, isReady } from './doctrines';
import { attackBarred, getOrders, hasLandingRights, withdrawOrders } from './orders';
import { getWaterways, waterwayList } from './waterways';

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
 * @param {Map|null} [declaration.waterways] - from getWaterways; worked out when not given
 * @returns {Map<string, { ok: boolean, reason: string|null, hint: string|null }>}
 */
export const getReach = (campaign, side, { doctrineDeclared = false, landing = false, waterways } = {}) => {
  const reach = new Map();
  const territories = campaign?.territories || [];
  if (!territories.length) return reach;

  // The water the side holds, and whether a region can be come at by it.
  const ways = waterways === undefined ? getWaterways(campaign) : waterways;
  const held = heldWaterways(campaign, side, ways);
  const waysOf = (t) => ways?.get(t.id) || [];
  const byWaterFrom = (t) => {
    const own = waysOf(t);
    return own.length === 0 || own.some(k => held.has(k));
  };

  // Orders that make no attack put everything out of reach, for the same reason.
  const barred = attackBarred(campaign, side);

  // Adjacency off: the only ground out of reach is your own.
  const enforced = !!campaign?.settings?.requireAdjacentAttack;

  // One breadth-first sweep out from the side's line, shared by every region.
  const distances = enforced ? getDistanceFromLine(campaign, side) : null;

  // The offensive doctrine the side drafted, and whether it could still be
  // declared. A hint for a doctrine still resting would be a false promise.
  const { offense } = getSideDoctrines(campaign, side);
  const offersRange = !doctrineDeclared
    && !!offense?.effects?.attackRange
    && isReady(campaign, side, 'offense');
  const hintName = offense ? (HINT_NAMES[offense.id] || offense.name) : null;

  for (const t of territories) {
    if (t.owner === side) {
      reach.set(t.id, { ok: false, reason: 'your own ground', hint: null });
      continue;
    }
    if (barred) {
      reach.set(t.id, { ok: false, reason: barred, hint: null });
      continue;
    }
    if (!enforced) {
      reach.set(t.id, IN_REACH);
      continue;
    }

    const isWater = !!t.hasWaterAccess;
    // Water the side can come at it by: water access, on water it holds.
    const byWater = isWater && byWaterFrom(t);
    const pointValue = t.pointValue || t.victoryPoints || 0;
    const dist = distances.get(t.id);

    // Landing rights ignore adjacency entirely, but only over water it holds.
    if (landing && byWater) {
      reach.set(t.id, IN_REACH);
      continue;
    }

    // What the declared orders are worth here, and how much of that came from
    // the region having water access (the Anaconda Plan, and nothing else so
    // far, reaches further over water than over land).
    const ctx = { pointValue };
    const range = doctrineDeclared
      ? getAttackRange(campaign, side, { ...ctx, isWaterAccess: byWater })
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
      : waterOnly && !byWater
        ? `no ${side} ground on ${waterwayList(waysOf(t))}`
      : dist === undefined
        ? 'not connected to your line'
        : `${dist} steps beyond your line`;

    // --- And what would have reached it. ------------------------------
    let hint = null;
    if (offersRange) {
      const would = getAttackRange(campaign, side, { ...ctx, isWaterAccess: byWater });
      if (!isFinite(would) || (dist !== undefined && dist <= would)) hint = `${hintName} would reach it`;
    }
    if (!hint && !landing && byWater) hint = 'a landing would reach it';

    reach.set(t.id, { ok: false, reason, hint });
  }

  return reach;
};

/**
 * The waterways a side holds: those of every water region it owns. A set of
 * keys from utils/waterways.js; empty when the map has no geography.
 */
export const heldWaterways = (campaign, side, ways = getWaterways(campaign)) => {
  const held = new Set();
  if (!ways) return held;
  for (const t of campaign?.territories || []) {
    if (t.owner !== side || !t.hasWaterAccess) continue;
    for (const key of ways.get(t.id) || []) held.add(key);
  }
  return held;
};

/**
 * Whether a side reaches by water this turn, and how: 'landing' when it holds
 * landing rights, 'doctrine' when it has declared a doctrine whose reach runs
 * over water (the Anaconda Plan), otherwise null.
 */
export const waterReach = (campaign, side) => {
  if (hasLandingRights(campaign, side)) return 'landing';
  const order = getOrders(campaign)[side];
  if (!order?.doctrine || order.action === 'defend') return null;
  const range = getSideDoctrines(campaign, side).offense?.effects?.attackRange;
  return range?.when?.isWaterAccess ? 'doctrine' : null;
};

/**
 * A side's reach under the orders it has actually given this turn: the
 * doctrine counts only when declared on an attack, and landing rights only
 * when the side holds them. The tracker's plate and a share link both read
 * reach through here, so the two dim the same ground.
 */
export const getSideReach = (campaign, side, waterways) => {
  const order = getOrders(campaign)[side];
  return getReach(campaign, side, {
    doctrineDeclared: !!(order?.doctrine && order.action !== 'defend'),
    landing: hasLandingRights(campaign, side),
    waterways,
  });
};

/**
 * What a side could reach this turn under each set of orders open to it,
 * whatever it has actually ordered: attacking plainly, with a landing, with
 * its range doctrine declared (when it drafted one that is ready, or has
 * declared it), or with both. The share view has no campaign to work reach
 * out from, so a link carries these for its readers to try.
 *
 * Null when adjacency is not enforced, where nothing is ever out of reach
 * but a side's own ground.
 *
 * @returns {{ doctrine: string|null, doctrineByWater: boolean,
 *   maps: Array<Map|null> } | null} maps indexed [plain, landing, doctrine,
 *   both]; null where that option is not open
 */
export const getReachOptions = (campaign, side, waterways) => {
  if (!campaign?.settings?.requireAdjacentAttack) return null;
  // As if the side were attacking, whatever its orders say.
  const attacking = withdrawOrders(campaign, side);
  const { offense } = getSideDoctrines(campaign, side);
  const range = offense?.effects?.attackRange;
  const declared = !!getOrders(campaign)[side]?.doctrine;
  const doctrine = range && (declared || isReady(campaign, side, 'offense')) ? offense.name : null;
  const canLand = (campaign.territories || []).some(t => t.hasWaterAccess);
  const at = (doctrineDeclared, landing) =>
    ((doctrineDeclared && !doctrine) || (landing && !canLand)
      ? null
      : getReach(attacking, side, { doctrineDeclared, landing, waterways }));
  return {
    doctrine,
    doctrineByWater: !!range?.when?.isWaterAccess,
    maps: [at(false, false), at(false, true), at(true, false), at(true, true)],
  };
};
