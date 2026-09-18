import { getDoctrine } from '../data/doctrines';

/**
 * Doctrine resolution.
 *
 * Doctrines declare *what* they change (data/doctrines.js); this module works
 * out whether a given effect applies right now and what it's worth. Keeping
 * that here means the battle, income and targeting code each gain one small
 * lookup rather than a growing switch over doctrine names.
 */

const EMPTY = Object.freeze({});

/**
 * A side's drafted doctrines, or empty when the season hasn't been drafted.
 *
 * @param {Object} campaign
 * @param {'USA'|'CSA'} side
 * @returns {{ offense: Object|null, defense: Object|null }}
 */
export function getSideDoctrines(campaign, side) {
  const picks = campaign?.doctrines?.[side] || EMPTY;
  return {
    offense: getDoctrine(picks.offense),
    defense: getDoctrine(picks.defense),
  };
}

/** Uses left on a side's active (offensive) doctrine this season. */
export function getUsesRemaining(campaign, side) {
  const { offense } = getSideDoctrines(campaign, side);
  if (!offense || offense.kind !== 'active') return 0;
  const spent = campaign?.doctrines?.[side]?.usesSpent || 0;
  return Math.max(0, (offense.uses ?? 0) - spent);
}

/** Can this side declare its offensive doctrine on a battle right now? */
export const canUseOffense = (campaign, side) => getUsesRemaining(campaign, side) > 0;

/**
 * Evaluate a declared effect against the current battle context.
 *
 * An effect is either a bare value, or `{ value, when }` where every condition
 * in `when` must hold. Returns null when it doesn't apply.
 */
function resolveEffect(effect, ctx) {
  if (effect === undefined || effect === null) return null;
  if (typeof effect !== 'object' || Array.isArray(effect)) return effect;
  if (!('value' in effect)) return effect; // plain config object, e.g. raid

  const when = effect.when;
  if (!when) return effect.value;

  if (when.onWin && !ctx.won) return null;
  if (when.onHold && !ctx.held) return null;
  if (when.isUrban && !ctx.isUrban) return null;
  if (when.isWaterAccess && !ctx.isWaterAccess) return null;
  if (when.minPointValue != null && (ctx.pointValue ?? 0) < when.minPointValue) return null;
  if (when.minFriendlyNeighbours != null
      && (ctx.friendlyNeighbours ?? 0) < when.minFriendlyNeighbours) return null;

  return effect.value;
}

/**
 * Read one effect off a side's doctrines.
 *
 * Offensive doctrines only count when the side actually declared them on this
 * battle (`ctx.offenseDeclared`); defensive ones are always on.
 *
 * @param {Object} campaign
 * @param {'USA'|'CSA'} side - whose doctrines to read
 * @param {string} key - an EFFECT_KEYS key
 * @param {Object} ctx - battle context
 * @returns {*} the resolved value, or null
 */
export function getEffect(campaign, side, key, ctx = {}) {
  const { offense, defense } = getSideDoctrines(campaign, side);

  if (ctx.offenseDeclared && offense?.effects && key in offense.effects) {
    const v = resolveEffect(offense.effects[key], ctx);
    if (v !== null) return v;
  }
  if (defense?.effects && key in defense.effects) {
    const v = resolveEffect(defense.effects[key], ctx);
    if (v !== null) return v;
  }
  return null;
}

/** Same as getEffect but returns 1 when absent, for multiplying costs. */
export function getMultiplier(campaign, side, key, ctx = {}) {
  const v = getEffect(campaign, side, key, ctx);
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : 1;
}

/**
 * The cost multipliers for one battle, for both sides.
 *
 * Attacker cost is touched by the attacker's own offensive doctrine and by the
 * defender's defensive one; defender cost by the defender's own doctrine and
 * by the attacker's offensive one. Each side's modifiers compose.
 *
 * @returns {{ attacker: number, defender: number }}
 */
export function getBattleCostMultipliers(campaign, { attacker, defender, won, held, pointValue, friendlyNeighbours, offenseDeclaredBy }) {
  const atkCtx = { won, held, pointValue, friendlyNeighbours, offenseDeclared: offenseDeclaredBy === attacker };
  const defCtx = { won, held, pointValue, friendlyNeighbours, offenseDeclared: offenseDeclaredBy === defender };

  return {
    attacker:
      getMultiplier(campaign, attacker, 'attackerCostMult', atkCtx) *
      getMultiplier(campaign, defender, 'enemyAttackerCostMult', defCtx),
    defender:
      getMultiplier(campaign, defender, 'ownDefenseCostMult', defCtx) *
      getMultiplier(campaign, attacker, 'defenderCostMult', atkCtx),
  };
}

/**
 * How far from its own line a side may attack.
 * 1 is plain adjacency; a doctrine may extend it.
 */
export function getAttackRange(campaign, side, ctx = {}) {
  const v = getEffect(campaign, side, 'attackRange', { ...ctx, offenseDeclared: true });
  return typeof v === 'number' && v >= 1 ? v : 1;
}

/** Raid config when the declared offensive doctrine substitutes a raid. */
export function getRaid(campaign, side, ctx = {}) {
  return getEffect(campaign, side, 'raid', { ...ctx, offenseDeclared: true });
}

/** Spend one use of a side's offensive doctrine. */
export function spendOffenseUse(campaign, side) {
  const doctrines = campaign.doctrines || {};
  const forSide = doctrines[side] || {};
  return {
    ...campaign,
    doctrines: {
      ...doctrines,
      [side]: { ...forSide, usesSpent: (forSide.usesSpent || 0) + 1 },
    },
  };
}

/** Consume the one-shot "hold the first major loss" charge. */
export function spendHoldFirstLoss(campaign, side) {
  const doctrines = campaign.doctrines || {};
  const forSide = doctrines[side] || {};
  return {
    ...campaign,
    doctrines: {
      ...doctrines,
      [side]: { ...forSide, holdFirstLossSpent: true },
    },
  };
}

/**
 * Would this side's doctrine save a region it is about to lose?
 * Iron Brigade: once a season, a major region falls NEUTRAL instead of flipping.
 */
export function shouldHoldFirstLoss(campaign, side, pointValue) {
  const cfg = getEffect(campaign, side, 'holdFirstLoss', {});
  if (!cfg) return false;
  if (campaign?.doctrines?.[side]?.holdFirstLossSpent) return false;
  return (pointValue ?? 0) >= (cfg.minPointValue ?? 0);
}

/** Has the season been drafted? */
export const isDrafted = (campaign) =>
  !!(campaign?.doctrines?.USA?.offense && campaign?.doctrines?.USA?.defense
    && campaign?.doctrines?.CSA?.offense && campaign?.doctrines?.CSA?.defense);
