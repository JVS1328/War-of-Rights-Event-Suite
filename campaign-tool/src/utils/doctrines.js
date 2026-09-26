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

/** Turns a doctrine rests after it fires. One setting for both slots. */
export const getDoctrineCooldown = (campaign) =>
  Math.max(1, campaign?.settings?.abilityCooldown || 2);

/** Turns left before a side's doctrine in this slot may fire again. 0 = ready. */
export const getCooldown = (campaign, side, slot) =>
  campaign?.doctrines?.[side]?.cooldown?.[slot] || 0;

/** Is a side's doctrine in this slot drafted and off cooldown? */
export const isReady = (campaign, side, slot) =>
  !!getSideDoctrines(campaign, side)[slot] && getCooldown(campaign, side, slot) === 0;

/** "ready", or how long it has left to rest. */
export const cooldownLabel = (turns) =>
  turns > 0 ? `resting · ${turns} turn${turns === 1 ? '' : 's'}` : 'ready';

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
  if (when.regionIn && !when.regionIn.some(k => ctx.regionKinds?.includes(k))) return null;
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
 * battle (`ctx.offenseDeclared`) - the declaration was only allowed while the
 * doctrine was ready. Defensive ones count whenever they are off cooldown.
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
  if (defense?.effects && key in defense.effects && isReady(campaign, side, 'defense')) {
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
 * `defenseFired` says whether the defender's own doctrine changed the bill,
 * which is what puts it on cooldown.
 *
 * @returns {{ attacker: number, defender: number, defenseFired: boolean }}
 */
export function getBattleCostMultipliers(campaign, { attacker, defender, won, held, pointValue, friendlyNeighbours, offenseDeclaredBy }) {
  const atkCtx = { won, held, pointValue, friendlyNeighbours, offenseDeclared: offenseDeclaredBy === attacker };
  const defCtx = { won, held, pointValue, friendlyNeighbours, offenseDeclared: offenseDeclaredBy === defender };

  const againstAttacker = getMultiplier(campaign, defender, 'enemyAttackerCostMult', defCtx);
  const ownDefense = getMultiplier(campaign, defender, 'ownDefenseCostMult', defCtx);

  return {
    attacker: getMultiplier(campaign, attacker, 'attackerCostMult', atkCtx) * againstAttacker,
    defender: ownDefense * getMultiplier(campaign, attacker, 'defenderCostMult', atkCtx),
    defenseFired: againstAttacker !== 1 || ownDefense !== 1,
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

/**
 * What kinds of ground a region counts as, for doctrines that care.
 * Urban is the region's own flag; farmland is a region whose map deck is
 * weighted heaviest toward the Farmlands group.
 */
export function regionKinds(territory) {
  const kinds = [];
  if (territory?.isUrban) kinds.push('urban');
  const weights = Object.values(territory?.terrainWeights || {});
  const farm = territory?.terrainWeights?.Farmlands || 0;
  if (farm > 0 && farm === Math.max(...weights)) kinds.push('farmland');
  return kinds;
}

/** Per-region income multiplier from each owner's doctrine, for calculateCPGeneration. */
export const getIncomeMult = (campaign) => (territory) =>
  getMultiplier(campaign, territory.owner, 'incomeMult', { regionKinds: regionKinds(territory) });

/** Raid config when the declared offensive doctrine substitutes a raid. */
export function getRaid(campaign, side, ctx = {}) {
  return getEffect(campaign, side, 'raid', { ...ctx, offenseDeclared: true });
}

/** Put a side's doctrine in this slot on cooldown: it has just fired. */
export function startCooldown(campaign, side, slot) {
  const doctrines = campaign.doctrines || {};
  const forSide = doctrines[side] || {};
  return {
    ...campaign,
    doctrines: {
      ...doctrines,
      [side]: {
        ...forSide,
        cooldown: { ...forSide.cooldown, [slot]: getDoctrineCooldown(campaign) },
      },
    },
  };
}

/**
 * One turn of rest for every doctrine. Run when the turn advances, after
 * anything that fired this turn has started its cooldown, so a doctrine used
 * on turn 3 with a cooldown of 2 is ready again on turn 5.
 */
export function tickCooldowns(campaign) {
  if (!campaign?.doctrines) return campaign;
  const doctrines = { ...campaign.doctrines };
  for (const side of ['USA', 'CSA']) {
    const cd = doctrines[side]?.cooldown;
    if (!cd) continue;
    doctrines[side] = {
      ...doctrines[side],
      cooldown: Object.fromEntries(
        Object.entries(cd).map(([slot, n]) => [slot, Math.max(0, (n || 0) - 1)])),
    };
  }
  return { ...campaign, doctrines };
}

/**
 * Would this side's doctrine save a region it is about to lose?
 * Iron Brigade: a major region falls NEUTRAL instead of flipping.
 */
export function shouldHoldFirstLoss(campaign, side, pointValue) {
  const cfg = getEffect(campaign, side, 'holdFirstLoss', {});
  if (!cfg) return false;
  return (pointValue ?? 0) >= (cfg.minPointValue ?? 0);
}

/** Has the season been drafted? */
export const isDrafted = (campaign) =>
  !!(campaign?.doctrines?.USA?.offense && campaign?.doctrines?.USA?.defense
    && campaign?.doctrines?.CSA?.offense && campaign?.doctrines?.CSA?.defense);
