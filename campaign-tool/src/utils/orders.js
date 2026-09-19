/**
 * Orders of the Day.
 *
 * A side declares what it intends before it picks the ground: the action it
 * takes this turn, and whether it spends its drafted offensive doctrine and its
 * standing order on it. Declaring first is the whole point - the reach rules
 * (see `utils/reach.js`) can then be worked out and shown on the plate before
 * anyone commits to a battle.
 *
 * Each side takes exactly one action per turn:
 *
 *   attack   - go at a region. The ordinary case.
 *   defend   - make no attack this turn.
 *   landing  - put transports to sea. Nothing happens this turn; on the turn
 *              AFTER, the side may attack any enemy or neutral region with
 *              water access, ignoring adjacency, at the normal cost. The right
 *              lapses unused at the end of that turn.
 *
 * State lives on `campaign.orders`, keyed by turn:
 *
 *   campaign.orders = {
 *     [turn]: {
 *       USA: { action, doctrine, standingOrder, declaredAt } | undefined,
 *       CSA: { ... } | undefined,
 *     }
 *   }
 *
 * The map is optional. A campaign saved before orders existed simply has none,
 * and every reader here treats that as "no orders given" rather than an error.
 *
 * Everything in this module is pure: `declareOrders` and `withdrawOrders`
 * return a new campaign and never touch the one handed to them.
 */

import { getTurnOrder } from './initiative';

/** The three things a side may order. Exactly one per side per turn. */
export const ORDER_ACTIONS = ['attack', 'defend', 'landing'];

const EMPTY_ORDERS = Object.freeze({ USA: null, CSA: null });

/**
 * Both sides' orders for a turn.
 *
 * @param {Object} campaign
 * @param {number} [turn] - defaults to the current turn
 * @returns {{ USA: Object|null, CSA: Object|null }} null per side when unordered
 */
export const getOrders = (campaign, turn = campaign?.currentTurn) => {
  const forTurn = campaign?.orders?.[turn];
  if (!forTurn) return { ...EMPTY_ORDERS };
  return {
    USA: forTurn.USA || null,
    CSA: forTurn.CSA || null,
  };
};

/**
 * Record one side's orders for a turn.
 *
 * A side that elects to defend makes no attack, so it spends nothing: the
 * doctrine and standing-order flags are forced off rather than stored and
 * quietly ignored later.
 *
 * @param {Object} campaign
 * @param {'USA'|'CSA'} side
 * @param {{ action: string, doctrine?: boolean, standingOrder?: boolean }} order
 * @param {number} [turn] - defaults to the current turn
 * @returns {Object} a new campaign (the same one back if the order is invalid)
 */
export const declareOrders = (
  campaign,
  side,
  { action, doctrine = false, standingOrder = false } = {},
  turn = campaign?.currentTurn,
) => {
  if (!campaign || (side !== 'USA' && side !== 'CSA')) return campaign;
  if (!ORDER_ACTIONS.includes(action)) return campaign;

  const spends = action !== 'defend';
  const orders = campaign.orders || {};

  return {
    ...campaign,
    orders: {
      ...orders,
      [turn]: {
        ...(orders[turn] || {}),
        [side]: {
          action,
          doctrine: spends && !!doctrine,
          standingOrder: spends && !!standingOrder,
          declaredAt: new Date().toISOString(),
        },
      },
    },
  };
};

/**
 * Take one side's orders back off the table.
 *
 * @param {Object} campaign
 * @param {'USA'|'CSA'} side
 * @param {number} [turn] - defaults to the current turn
 * @returns {Object} a new campaign, or the same one when there was nothing to withdraw
 */
export const withdrawOrders = (campaign, side, turn = campaign?.currentTurn) => {
  if (!campaign?.orders?.[turn]?.[side]) return campaign;

  const forTurn = { ...campaign.orders[turn] };
  delete forTurn[side];

  const orders = { ...campaign.orders };
  if (Object.keys(forTurn).length) orders[turn] = forTurn;
  else delete orders[turn];

  return { ...campaign, orders };
};

/**
 * Are this side's orders now fixed?
 *
 * Once a battle has been put on the board with that side attacking - whether
 * it has been played yet or not - the orders it was recorded under can no
 * longer be changed out from under it.
 *
 * @returns {boolean}
 */
export const isOrderLocked = (campaign, side, turn = campaign?.currentTurn) =>
  (campaign?.battles || []).some(b => b.turn === turn && b.attacker === side);

/**
 * May this side land this turn?
 *
 * True when it declared a landing on the previous turn and has not yet spent
 * the right - a battle recorded with `landing: true` spends it, pending or
 * complete. Unused, the right lapses when the turn does.
 *
 * @returns {boolean}
 */
export const hasLandingRights = (campaign, side, turn = campaign?.currentTurn) => {
  const declared = campaign?.orders?.[turn - 1]?.[side];
  if (declared?.action !== 'landing') return false;

  return !(campaign?.battles || []).some(
    b => b.turn === turn && b.attacker === side && b.landing === true,
  );
};

/**
 * Whose orders the sheet is waiting on.
 *
 * The side that moves first this turn, if it has neither given orders nor put
 * a battle on the board; otherwise the other side on the same test; otherwise
 * null, which also covers a season whose initiative has not been rolled.
 *
 * @returns {'USA'|'CSA'|null}
 */
export const sideDueToAct = (campaign) => {
  const turn = campaign?.currentTurn;
  const order = getTurnOrder(campaign?.initiative, turn);
  if (!order.length) return null;

  const hasActed = (side) =>
    !!campaign?.orders?.[turn]?.[side] || isOrderLocked(campaign, side, turn);

  return order.find(side => !hasActed(side)) || null;
};
