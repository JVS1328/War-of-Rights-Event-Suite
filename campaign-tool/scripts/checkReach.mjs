#!/usr/bin/env node
/**
 * Reach check.
 *
 *   cd campaign-tool && node scripts/checkReach.mjs
 *
 * There is no test runner in this project; `test-validation.js` at the package
 * root is the precedent. This asserts the rules in `src/utils/reach.js` and
 * `src/utils/orders.js` against a real Eastern Theatre campaign: plain reach,
 * Foot Cavalry's two steps, the Anaconda Plan over water, landing rights, and
 * that your own ground is never a target.
 *
 * Plain node cannot import the app's source directly - the modules use
 * extensionless specifiers and the chain from `defaultCampaign.js` reaches
 * `terrainPatterns.jsx`, which node will not parse. Rather than restructure the
 * check around that, it bundles the modules in memory with esbuild (already a
 * Vite dependency) and imports the result. JSX is compiled away to an inert
 * factory, since nothing here renders anything.
 *
 * Prints PASS/FAIL per assertion; exits non-zero if any fail.
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundle = await esbuild.build({
  stdin: {
    contents: `
      export { createEasternTheatreCampaign } from './src/data/defaultCampaign.js';
      export * from './src/utils/reach.js';
      export * from './src/utils/orders.js';
      export { getDistanceFromLine } from './src/utils/campaignLogic.js';
    `,
    resolveDir: ROOT,
    sourcefile: 'checkReach-entry.js',
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.jsx': 'jsx', '.svg': 'text' },
  // Nothing under test renders; compile JSX to an inert factory so React is
  // never needed and the bundle stays self-contained.
  jsx: 'transform',
  jsxFactory: '__el',
  jsxFragment: '__frag',
  banner: { js: 'const __el = (t, p, ...c) => ({ t, p, c }); const __frag = "fragment";' },
});

const {
  createEasternTheatreCampaign,
  getReach,
  declareOrders,
  withdrawOrders,
  getOrders,
  isOrderLocked,
  hasLandingRights,
  sideDueToAct,
  getDistanceFromLine,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

/** Hand the named regions to a side, leaving the rest of the map alone. */
const withOwners = (campaign, owners) => ({
  ...campaign,
  territories: campaign.territories.map(t =>
    (owners[t.id] ? { ...t, owner: owners[t.id] } : t)),
});

const nameOf = (campaign, id) =>
  campaign.territories.find(t => t.id === id)?.name || id;

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------
//
// The template as shipped, except that the Confederacy has been pushed back to
// a single region - Northern Virginia - so every distance from its line is
// short, known, and easy to read in a failure message:
//
//   va-northern     0  the line itself
//   md-western      1  borders it
//   md-north        2
//   md-baltimore    2  and has water access
//   pa-southeast    3
//   pa-central      3  and has none
//   ga-augusta      -  no path to it at all through the adjacency lists

const base = createEasternTheatreCampaign();
const campaign = {
  ...base,
  territories: base.territories.map(t =>
    (t.id === 'va-northern'
      ? { ...t, owner: 'CSA' }
      : t.owner === 'CSA' ? { ...t, owner: 'NEUTRAL' } : t)),
};

console.log(`Eastern Theatre: ${campaign.territories.length} regions, ` +
  `requireAdjacentAttack=${campaign.settings.requireAdjacentAttack}`);

const dist = getDistanceFromLine(campaign, 'CSA');
console.log('Distances from the CSA line — ' +
  ['md-western', 'md-north', 'md-baltimore', 'pa-southeast', 'pa-central', 'ga-augusta']
    .map(id => `${id} ${dist.get(id) ?? 'unreachable'}`).join(', ') + '\n');

console.log('--- Data flags ---');
const water = campaign.territories.filter(t => t.hasWaterAccess);
const urban = campaign.territories.filter(t => t.isUrban);
check(`water access is set on some ground (${water.length} regions)`, water.length > 0);
check(`urban is set on some ground (${urban.length} regions)`, urban.length > 0);
check('va-tidewater has water access', !!campaign.territories.find(t => t.id === 'va-tidewater')?.hasWaterAccess);
check('il-chicago has no water access', !campaign.territories.find(t => t.id === 'il-chicago')?.hasWaterAccess);
check('va-richmond is urban', !!campaign.territories.find(t => t.id === 'va-richmond')?.isUrban);

// ---------------------------------------------------------------------------
console.log('\n--- Plain reach (no doctrine, no landing) ---');
const plain = getReach(campaign, 'CSA');

check('own ground is never in reach',
  plain.get('va-northern')?.ok === false && plain.get('va-northern')?.reason === 'your own ground',
  JSON.stringify(plain.get('va-northern')));

check('one step from the line is in reach',
  plain.get('md-western')?.ok === true,
  JSON.stringify(plain.get('md-western')));

check('two steps out is not, and says so',
  plain.get('md-north')?.ok === false && plain.get('md-north')?.reason === '2 steps beyond your line',
  JSON.stringify(plain.get('md-north')));

check('three steps out is not, and says so',
  plain.get('pa-southeast')?.ok === false && plain.get('pa-southeast')?.reason === '3 steps beyond your line',
  JSON.stringify(plain.get('pa-southeast')));

check('ground with no path to the line says that instead of a step count',
  plain.get('ga-augusta')?.ok === false && plain.get('ga-augusta')?.reason === 'not connected to your line',
  JSON.stringify(plain.get('ga-augusta')));

check('every region on the map has an entry',
  plain.size === campaign.territories.length,
  `${plain.size} of ${campaign.territories.length}`);

check('water ground out of reach hints at a landing',
  plain.get('md-baltimore')?.ok === false && plain.get('md-baltimore')?.hint === 'a landing would reach it',
  JSON.stringify(plain.get('md-baltimore')));

check('dry ground out of reach hints at nothing (no doctrine drafted)',
  plain.get('pa-central')?.hint === null,
  JSON.stringify(plain.get('pa-central')));

// ---------------------------------------------------------------------------
console.log('\n--- Foot Cavalry (CSA, attackRange 2) ---');
const footCav = {
  ...campaign,
  doctrines: {
    ...campaign.doctrines,
    CSA: { offense: 'foot-cavalry', defense: 'stone-wall', usesSpent: 0, holdFirstLossSpent: false },
  },
};

const undeclared = getReach(footCav, 'CSA');
check('undeclared, two steps out is still out of reach',
  undeclared.get('md-north')?.ok === false,
  JSON.stringify(undeclared.get('md-north')));
check('undeclared, the hint names Foot Cavalry',
  undeclared.get('md-north')?.hint === 'Foot Cavalry would reach it',
  JSON.stringify(undeclared.get('md-north')));

const declared = getReach(footCav, 'CSA', { doctrineDeclared: true });
check('declared, two steps out is in reach',
  declared.get('md-north')?.ok === true,
  JSON.stringify(declared.get('md-north')));
check('declared, three steps out is still not',
  declared.get('pa-southeast')?.ok === false
    && declared.get('pa-southeast')?.reason === '3 steps beyond your line',
  JSON.stringify(declared.get('pa-southeast')));
check('declared, own ground is still out',
  declared.get('va-northern')?.reason === 'your own ground');

const spent = {
  ...footCav,
  doctrines: { ...footCav.doctrines, CSA: { ...footCav.doctrines.CSA, usesSpent: 2 } },
};
check('with no uses left, no doctrine hint is offered',
  getReach(spent, 'CSA').get('md-north')?.hint === null,
  JSON.stringify(getReach(spent, 'CSA').get('md-north')));

// ---------------------------------------------------------------------------
console.log('\n--- Anaconda Plan (USA, unlimited range over water) ---');
// A small Union line in Maryland, with the far South in Confederate hands.
const anaconda = withOwners({
  ...base,
  doctrines: {
    ...base.doctrines,
    USA: { offense: 'anaconda-plan', defense: 'fortify-the-heights', usesSpent: 0, holdFirstLossSpent: false },
  },
}, {
  'md-baltimore': 'USA',
  'sc-charleston': 'CSA',   // water access, a very long way from Maryland
  'sc-upstate': 'CSA',      // no water access, the same distance away
});

const anacondaOff = getReach(anaconda, 'USA');
check('undeclared, Charleston is out of reach',
  anacondaOff.get('sc-charleston')?.ok === false,
  JSON.stringify(anacondaOff.get('sc-charleston')));
check('undeclared, the hint names the Anaconda Plan',
  anacondaOff.get('sc-charleston')?.hint === 'the Anaconda Plan would reach it',
  JSON.stringify(anacondaOff.get('sc-charleston')));

const anacondaOn = getReach(anaconda, 'USA', { doctrineDeclared: true });
check('declared, Charleston is in reach over water',
  anacondaOn.get('sc-charleston')?.ok === true,
  JSON.stringify(anacondaOn.get('sc-charleston')));
check('declared, dry inland ground the same distance away is not',
  anacondaOn.get('sc-upstate')?.ok === false,
  JSON.stringify(anacondaOn.get('sc-upstate')));
check('declared, and the reason given is the missing water',
  anacondaOn.get('sc-upstate')?.reason === 'no water access',
  JSON.stringify(anacondaOn.get('sc-upstate')));
check('declared, own ground is still never a target',
  anacondaOn.get('md-baltimore')?.reason === 'your own ground');

// ---------------------------------------------------------------------------
console.log('\n--- Landing rights ---');
const landingBoard = withOwners(base, { 'md-baltimore': 'USA', 'sc-charleston': 'CSA' });

// Declared on turn 1; the campaign moves on to turn 2.
const declaredLanding = declareOrders(landingBoard, 'USA', { action: 'landing' }, 1);
check('declareOrders does not mutate the campaign it was given',
  landingBoard.orders === undefined,
  JSON.stringify(landingBoard.orders));
check('the order is on the record',
  getOrders(declaredLanding, 1).USA?.action === 'landing',
  JSON.stringify(getOrders(declaredLanding, 1)));
check('the other side gave none',
  getOrders(declaredLanding, 1).CSA === null);

const turn2 = { ...declaredLanding, currentTurn: 2 };
check('the rights stand on the turn after the declaration',
  hasLandingRights(turn2, 'USA') === true);
check('and not for the other side',
  hasLandingRights(turn2, 'CSA') === false);
check('and not on the turn they were declared',
  hasLandingRights(declaredLanding, 'USA', 1) === false);
check('nor the turn after that, unused',
  hasLandingRights({ ...turn2, currentTurn: 3 }, 'USA') === false);

const landingReach = getReach(turn2, 'USA', { landing: true });
check('landing: distant water ground is in reach',
  landingReach.get('sc-charleston')?.ok === true,
  JSON.stringify(landingReach.get('sc-charleston')));
check('landing: distant dry ground is not',
  landingReach.get('sc-upstate')?.ok === false,
  JSON.stringify(landingReach.get('sc-upstate')));
check('landing: and the reason is the missing water',
  landingReach.get('sc-upstate')?.reason === 'no water access',
  JSON.stringify(landingReach.get('sc-upstate')));
check('landing: own ground is still out of reach',
  landingReach.get('md-baltimore')?.reason === 'your own ground');
check('landing: no landing hint on ground already reachable by sea',
  landingReach.get('sc-charleston')?.hint === null);

// Spending the right: a battle recorded with landing = true.
const landed = {
  ...turn2,
  battles: [{
    id: 'b1', turn: 2, territoryId: 'sc-charleston', mapName: 'Drill Camp',
    attacker: 'USA', winner: null, status: 'pending', landing: true,
  }],
};
check('recording the landing spends the right',
  hasLandingRights(landed, 'USA') === false);
check('and locks that side\'s orders for the turn',
  isOrderLocked(landed, 'USA', 2) === true);
check('the other side is not locked',
  isOrderLocked(landed, 'CSA', 2) === false);

// ---------------------------------------------------------------------------
console.log('\n--- Orders bookkeeping ---');
const ordered = declareOrders(landingBoard, 'CSA', { action: 'attack', doctrine: true, standingOrder: true }, 1);
check('an attack keeps its doctrine and standing order',
  ordered.orders[1].CSA.doctrine === true && ordered.orders[1].CSA.standingOrder === true,
  JSON.stringify(ordered.orders[1].CSA));

const defending = declareOrders(landingBoard, 'CSA', { action: 'defend', doctrine: true, standingOrder: true }, 1);
check('a defence spends nothing',
  defending.orders[1].CSA.doctrine === false && defending.orders[1].CSA.standingOrder === false,
  JSON.stringify(defending.orders[1].CSA));

check('an unknown action is refused outright',
  declareOrders(landingBoard, 'CSA', { action: 'besiege' }, 1) === landingBoard);

const withdrawn = withdrawOrders(ordered, 'CSA', 1);
check('withdrawing takes the order back off the table',
  getOrders(withdrawn, 1).CSA === null,
  JSON.stringify(getOrders(withdrawn, 1)));
check('withdrawing does not mutate the campaign it was given',
  getOrders(ordered, 1).CSA?.action === 'attack');

check('no orders at all reads as no orders, not an error',
  getOrders(landingBoard, 1).USA === null && getOrders(landingBoard, 1).CSA === null);

// sideDueToAct needs an initiative roll to have an opinion.
check('with no initiative rolled, nobody is due',
  sideDueToAct(landingBoard) === null);

const rolled = {
  ...landingBoard,
  currentTurn: 1,
  initiative: { firstSide: 'CSA', rolledOnTurn: 1, rolledAt: new Date().toISOString() },
};
check('the first mover is due first',
  sideDueToAct(rolled) === 'CSA');
check('once it has ordered, the other side is due',
  sideDueToAct(declareOrders(rolled, 'CSA', { action: 'attack' }, 1)) === 'USA');
check('once both have, nobody is',
  sideDueToAct(
    declareOrders(declareOrders(rolled, 'CSA', { action: 'attack' }, 1), 'USA', { action: 'defend' }, 1),
  ) === null);

// ---------------------------------------------------------------------------
console.log('\n--- Adjacency setting off ---');
const openBoard = {
  ...campaign,
  settings: { ...campaign.settings, requireAdjacentAttack: false },
};
const open = getReach(openBoard, 'CSA');
check('with adjacency off, distant ground is in reach',
  open.get('sc-charleston')?.ok === true,
  JSON.stringify(open.get('sc-charleston')));
check('with adjacency off, own ground still is not',
  open.get('va-northern')?.ok === false && open.get('va-northern')?.reason === 'your own ground');

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`} — ` +
  `${nameOf(campaign, 'va-northern')} held the line.`);
process.exit(failures === 0 ? 0 : 1);
