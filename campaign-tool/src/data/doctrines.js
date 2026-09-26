/**
 * Season doctrines.
 *
 * Each side drafts one Offensive and one Defensive doctrine before turn 1.
 * Picks are made blind, revealed together, and locked for the season.
 *
 *   - Offensive doctrines are DECLARED with the day's orders, then rest.
 *     They can be spent badly, which is the point.
 *   - Defensive doctrines FIRE on their own the first time they bite, then
 *     rest. Nothing to declare, so a defender never has to guess, and nothing
 *     is burned on a battle it made no difference to.
 *
 * Each side's two slots keep their own cooldown (settings.abilityCooldown
 * turns), so firing one never holds up the other. See utils/doctrines.js.
 *
 * HARD RULE: no doctrine ever grants a side a second action in a turn. Each
 * side takes exactly one action per turn - attack, or elect to defend - and a
 * doctrine may only change *how* that action resolves:
 *
 *   action: 'modify'     - the action happens as normal, with altered terms
 *   action: 'substitute' - the action is replaced by a different one
 *
 * There is deliberately no 'extra' kind, and `doctrines.test` asserts none
 * appears. Anything that reads like "and attack again" has to be reshaped
 * into a modifier or a substitution instead.
 *
 * Effects are declarative so the engine stays a small set of hook points
 * rather than a switch over doctrine names. See utils/doctrines.js.
 */

export const DOCTRINE_SLOTS = ['offense', 'defense'];

/** Every effect key the engine understands, with where it is applied. */
export const EFFECT_KEYS = {
  // --- battle cost (utils/cpSystem via utils/doctrines) ---
  attackerCostMult: 'Multiplies your cost when you are the attacker',
  defenderCostMult: 'Multiplies the enemy defender\'s cost when you attack',
  ownDefenseCostMult: 'Multiplies your cost when you are the defender',
  enemyAttackerCostMult: 'Multiplies the enemy\'s cost when they attack you',
  // --- post battle (utils/campaignLogic) ---
  defenseRefundOnHold: 'Fraction of your defense cost refunded if you hold',
  skipTransitionOnCapture: 'Captured regions consolidate immediately',
  captureDenialTurns: 'Turns the captor earns nothing from a region taken from you',
  holdFirstLoss: 'A lost major defense goes NEUTRAL instead of flipping',
  // --- income (utils/cpSystem) ---
  incomeMult: 'Multiplies income from the regions you hold, by kind: { urban, farmland }',
  // --- targeting (utils/reach getReach) ---
  attackRange: 'How many steps from your line you may attack',
  raid: 'Attack without capturing; denies the enemy the region\'s income',
};

/**
 * Conditions gate an effect. All listed conditions must hold.
 *   minPointValue      - target/defended region is worth at least N
 *   onWin              - only when you won the battle
 *   onHold             - only when you held as defender
 *   minFriendlyNeighbours - defended region has at least N friendly neighbours
 */

const D = (d) => Object.freeze(d);

export const DOCTRINES = {
  USA: {
    offense: [
      D({
        id: 'special-orders-191',
        name: 'Special Orders 191',
        side: 'USA', slot: 'offense', action: 'modify',
        blurb: 'Lee\'s orders, wrapped around three cigars. You know where he is.',
        rules: 'Your attack costs 40% less. If you also win, the defender pays double.',
        effects: {
          attackerCostMult: 0.6,
          defenderCostMult: { value: 2.0, when: { onWin: true } },
        },
      }),
      D({
        id: 'anaconda-plan',
        name: 'Anaconda Plan',
        side: 'USA', slot: 'offense', action: 'modify',
        blurb: 'The rivers and the coast are yours. Use them.',
        rules: 'Attack any enemy region on a coast or major river, ignoring adjacency. That attack costs 25% less.',
        effects: {
          attackerCostMult: 0.75,
          attackRange: { value: Infinity, when: { isWaterAccess: true } },
        },
      }),
      D({
        id: 'grand-army-advance',
        name: 'Grand Army Advance',
        side: 'USA', slot: 'offense', action: 'modify',
        blurb: 'The whole army moves at once, and does not stop to dig in.',
        rules: 'Your attack costs 25% less, and a region you capture consolidates immediately instead of spending a turn in transition.',
        effects: {
          attackerCostMult: 0.75,
          skipTransitionOnCapture: true,
        },
      }),
    ],
    defense: [
      D({
        id: 'fortify-the-heights',
        name: 'Fortify the Heights',
        side: 'USA', slot: 'defense', action: 'modify',
        blurb: 'Guns on the high ground, and time to place them.',
        rules: 'Attacks against you cost 25% more. If you hold, half your own cost is refunded.',
        effects: {
          enemyAttackerCostMult: 1.25,
          defenseRefundOnHold: 0.5,
        },
      }),
      D({
        id: 'quartermaster-corps',
        name: 'Quartermaster Corps',
        side: 'USA', slot: 'defense', action: 'modify',
        blurb: 'Depots, rolling stock, and clerks who can count.',
        rules: 'Urban regions you hold generate 15% more supply each turn, and farmland 5% more.',
        effects: { incomeMult: { urban: 1.15, farmland: 1.05 } },
      }),
      D({
        id: 'iron-brigade',
        name: 'Iron Brigade',
        side: 'USA', slot: 'defense', action: 'modify',
        blurb: 'The Black Hats do not break.',
        rules: 'A major region you lose (4 VP or more) is not taken - it falls to NEUTRAL and stays contested.',
        effects: { holdFirstLoss: { minPointValue: 4 } },
      }),
    ],
  },

  CSA: {
    offense: [
      D({
        id: 'valley-supply-lines',
        name: 'Valley Supply Lines',
        side: 'CSA', slot: 'offense', action: 'modify',
        blurb: 'The Shenandoah feeds the army and hides it.',
        rules: 'Your attack costs half.',
        effects: { attackerCostMult: 0.5 },
      }),
      D({
        id: 'foot-cavalry',
        name: 'Foot Cavalry',
        side: 'CSA', slot: 'offense', action: 'modify',
        blurb: 'Jackson\'s men marched further in a day than anyone thought possible.',
        rules: 'Attack a region up to two steps beyond your lines, at normal cost.',
        effects: { attackRange: 2 },
      }),
      D({
        id: 'stuarts-ride',
        name: "Stuart's Ride",
        side: 'CSA', slot: 'offense', action: 'substitute',
        blurb: 'Ride around the whole Union army and burn what you find.',
        rules: 'Instead of attacking, raid a region up to three steps away. You cannot take it, but on a win the enemy earns nothing from it for two turns and still pays to defend it. Your cost is halved.',
        effects: {
          attackerCostMult: 0.5,
          attackRange: 3,
          raid: { denialTurns: 2 },
        },
      }),
    ],
    defense: [
      D({
        id: 'stone-wall',
        name: 'Stone Wall',
        side: 'CSA', slot: 'defense', action: 'modify',
        blurb: 'There stands Jackson like a stone wall.',
        rules: 'If you hold a defense, the attacker pays 50% more.',
        effects: {
          enemyAttackerCostMult: { value: 1.5, when: { onHold: true } },
        },
      }),
      D({
        id: 'interior-lines',
        name: 'Interior Lines',
        side: 'CSA', slot: 'defense', action: 'modify',
        blurb: 'Shorter roads between your own armies than between theirs.',
        rules: 'Defending a region with two or more friendly neighbours costs you 40% less.',
        effects: {
          ownDefenseCostMult: { value: 0.6, when: { minFriendlyNeighbours: 2 } },
        },
      }),
      D({
        id: 'scorched-earth',
        name: 'Scorched Earth',
        side: 'CSA', slot: 'defense', action: 'modify',
        blurb: 'Leave them the ground and nothing on it.',
        rules: 'A region taken from you earns its captor no supply and no victory points for two turns.',
        effects: { captureDenialTurns: 2 },
      }),
    ],
  },
};

/** Flat list of every doctrine. */
export const ALL_DOCTRINES = Object.values(DOCTRINES)
  .flatMap(bySlot => Object.values(bySlot).flat());

/** Look a doctrine up by id. */
export const getDoctrine = (id) =>
  id ? ALL_DOCTRINES.find(d => d.id === id) || null : null;

/** The options a side may pick from for a slot. */
export const getDoctrineOptions = (side, slot) => DOCTRINES[side]?.[slot] || [];
