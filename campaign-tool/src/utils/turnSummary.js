/**
 * Turn Dispatch: the end-of-turn summary.
 *
 * Takes the battle records belonging to a single turn and writes them up as a
 * field dispatch. Who marched, who bled, what changed hands, and how the war
 * looks as the armies step off into the next month. TurnSummary.jsx renders the
 * structured result; `formatTurnSummaryText` flattens it to Discord text.
 *
 * Everything here is pure and deterministic. Word choice varies from battle to
 * battle, but every choice is seeded off stable ids, so the dispatch you pasted
 * into Discord last week still matches the one on screen today.
 */

import { MONTH_NAMES, MONTHS_PER_TURN, formatCampaignDate } from './dateSystem';
import { WEATHER_CONDITIONS, TIME_CONDITIONS } from './battleConditions';

// ============================================================================
// DETERMINISTIC VARIATION
// ============================================================================

/** FNV-1a. Small, fast, and stable across sessions, which is the point. */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick one entry from `options`, always the same one for the same `seed`. */
function pick(options, seed) {
  if (!options || options.length === 0) return '';
  return options[hashString(String(seed)) % options.length];
}

const ROMAN_PAIRS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function toRoman(n) {
  let remaining = Math.max(1, Math.floor(n));
  let out = '';
  for (const [value, numeral] of ROMAN_PAIRS) {
    while (remaining >= value) {
      out += numeral;
      remaining -= value;
    }
  }
  return out;
}

const num = (n) => (n || 0).toLocaleString('en-US');
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ============================================================================
// VOICE: how each side gets talked about
// ============================================================================

const SIDE_ADJECTIVE = { USA: 'Federal', CSA: 'Confederate', NEUTRAL: 'neutral' };
const SIDE_PLURAL = { USA: 'Federals', CSA: 'Confederates', NEUTRAL: 'locals' };
const SIDE_CAPITAL = { USA: 'Washington', CSA: 'Richmond' };

// All plural, so "…were thrown back" agrees no matter which one is drawn.
const SIDE_ARMY = {
  USA: ['the Federals', 'the Union columns', 'the boys in blue', 'the Federal brigades'],
  CSA: ['the Confederates', 'the Rebel columns', 'the boys in butternut', 'the Confederate brigades'],
};

/** "the Federals" / "the Rebel columns", varied but stable per seed. */
const army = (side, seed) => pick(SIDE_ARMY[side] || ['the army'], seed);
const adjective = (side) => SIDE_ADJECTIVE[side] || side;
const plural = (side) => SIDE_PLURAL[side] || side;
const capitalOf = (side) => SIDE_CAPITAL[side] || side;

// ============================================================================
// SEASON, WEATHER, LIGHT
// ============================================================================

const SEASON_LINES = {
  winter: [
    'The pikes are frozen iron, and the men march with rags bound over their shoes.',
    'Winter smoke hangs over both camps; the war grinds on regardless of the weather.',
    'Snow lies in the fence corners, and every creek crossing costs an hour and a wagon.',
  ],
  spring: [
    'The thaw has turned every road in the theatre into a river of mud.',
    'Green comes up over ground that was fought across last season.',
    'The rains have the fords swollen and the pontoon trains cursing.',
  ],
  summer: [
    'Dust hangs behind every column, and the canteens run dry before noon.',
    'High summer, and the heat puts down nearly as many men as the volleys do.',
    'Wheat stands ripe in fields that will be trampled flat before the month is out.',
  ],
  autumn: [
    'The leaves are turning, and both armies know the campaigning season is short.',
    'Frost comes early to the high ground, and the generals are in a hurry.',
    'Shortening days and cold rain press hard on the marching order.',
  ],
};

function seasonOf(month) {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

const WEATHER_CLAUSE = {
  clear: ['The sky stayed clear', 'Fine weather held', 'There was not a cloud over the field'],
  rain: ['A steady rain came down', 'It had rained since before dawn', 'Rain fell through the morning'],
  inclement: [
    'Rain came down in sheets',
    'A downpour turned the ground to soup',
    'The weather was foul enough to drown a man',
  ],
};

// Several stems per time of day, or every dispatch opens the same way.
const LIGHT_CLAUSE = {
  dawn: [
    'the fighting opened at first light',
    'the first volleys came at dawn',
    'the lines went in before the mist had burned off',
  ],
  standard: [
    'the fighting opened in the full of the day',
    'the action ran through the middle of the day',
    'the lines went in with the sun high',
  ],
  dusk: [
    'the fighting opened as the light failed',
    'the action ran on into the dusk',
    'the last of the light went while they fought',
  ],
  night: [
    'the fighting opened in pitch darkness',
    'they went at it blind in the dark',
    'the action carried on by muzzle flash',
  ],
};

// ============================================================================
// ACTION VOCABULARY
// ============================================================================

const ADVANCE_VERBS = [
  'came on',
  'stepped off',
  'pressed the attack',
  'went forward',
  'drove in',
  'made their push',
];

const ATTACKER_WON = [
  'and carried the position',
  'and took the ground for keeps',
  'and broke the line wide open',
  'and swept the field clear',
  'and would not be stopped',
];

const ATTACKER_LOST = [
  'and were thrown back',
  'and broke on the defence',
  'and left the field to the defenders',
  'and could not budge them',
  'and came apart short of the objective',
];

const SCALE_LABELS = [
  { max: 400, label: 'a sharp little affair' },
  { max: 1200, label: 'a stand-up fight' },
  { max: 2500, label: 'a general engagement' },
  { max: Infinity, label: 'a slaughter pen' },
];

const LOPSIDED = [
  'It was one-sided business from the first volley.',
  'The losing side paid for every yard and got nothing for it.',
  'One side lost better than twice what the other did.',
];

const NEAR_RUN = [
  'It was a near-run thing, decided by minutes.',
  'Either side could have had it.',
  'Both sides walked off convinced they had nearly had it.',
];

const BLOODY = [
  'Both armies left more men on that ground than either could spare.',
  'The stretcher parties worked until dark and were not finished.',
  'Whole companies came out of it commanded by corporals.',
];

const scaleLabel = (total) => SCALE_LABELS.find(s => total <= s.max).label;

// ============================================================================
// SHARED HELPERS
// ============================================================================

/** Territory (or map-feature) VP for a battle's ground. */
const territoryVP = (territory) =>
  territory ? (territory.victoryPoints ?? territory.pointValue ?? 0) : 0;

/**
 * Who held the ground going into this battle.
 * captureHistory gets an entry per resolved battle, so the entry immediately
 * before ours is the owner at the time the guns opened. Returns null for a
 * territory's very first battle, where history can't tell us.
 */
function previousOwnerOf(territory, battle) {
  const history = territory?.captureHistory || [];
  const index = history.findIndex(h => h.battleId === battle.id);
  return index > 0 ? history[index - 1].owner : null;
}

/** Human name for the ability a side spent, falling back to the defaults. */
function abilityName(campaign, side) {
  const fallback = { USA: 'Special Orders 191', CSA: 'Valley Supply Lines' };
  return campaign?.abilities?.[side]?.name || fallback[side] || 'their special order';
}

/**
 * Weather, light, and terrain scene-setter for one battle. The map name is
 * already in the engagement's headline, so this line only adds what the
 * headline can't: the sky, the light, and the lie of the ground.
 *
 * Standard battles store condition ids; Grand Campaign battles store the
 * rolled condition objects. Both carry the same ids underneath.
 */
function sceneLine(battle, seed) {
  const weatherId = battle.conditions?.weather || battle.weather?.id || null;
  const timeId = battle.conditions?.time || battle.time?.id || null;

  const weather = weatherId
    ? pick(WEATHER_CLAUSE[weatherId] || [WEATHER_CONDITIONS[weatherId]?.name], seed + ':w')
    : null;
  const light = timeId
    ? (LIGHT_CLAUSE[timeId]
        ? pick(LIGHT_CLAUSE[timeId], seed + ':t')
        : TIME_CONDITIONS[timeId]
          ? `the fighting opened at ${TIME_CONDITIONS[timeId].name.toLowerCase()}`
          : null)
    : null;
  const terrainWord = battle.terrainType ? String(battle.terrainType).toLowerCase() : null;
  const terrain = terrainWord ? `${terrainWord} ground` : null;

  if (weather && light && terrain) return `${weather}, and ${light} over ${terrain}.`;
  if (weather && light) return `${weather}, and ${light}.`;
  if (weather && terrain) return `${weather} on ${terrain}.`;
  if (light && terrain) return `${capitalize(light)} over ${terrain}.`;
  if (weather) return `${weather}.`;
  if (light) return `${capitalize(light)}.`;
  if (terrain) return `The ground was ${terrainWord}.`;
  return null;
}

/**
 * Some regiment names are numbered ("4th NC"), others are initialisms ("CQB").
 * Numbered ones want a definite article; initialisms very much do not.
 */
const unitName = (name) => (/^\d/.test(name) ? `the ${name}` : name);

/** "the Confederates, with the 4th NC at the head of the column," */
function forceWithCommander(side, commanderName, seed) {
  const base = army(side, seed);
  if (!commanderName) return base;
  const unit = unitName(commanderName);
  return pick([
    `${base}, with ${unit} at the head of the column,`,
    `${base} under ${unit}`,
    `${capitalize(unit)} and ${base} behind them`,
  ], seed + ':cmd');
}

// ============================================================================
// STANDARD-CAMPAIGN ENGAGEMENT NARRATION
// ============================================================================

function narrateStandardBattle(campaign, battle, territory, index) {
  const seed = `${battle.id}:${battle.turn}`;
  const attacker = battle.attacker;
  const defender = battle.defender || (attacker === 'USA' ? 'CSA' : 'USA');
  const winner = battle.winner;
  const attackerWon = winner === attacker;

  const vp = territoryVP(territory);
  const name = territory?.name || 'unnamed ground';
  const previousOwner = previousOwnerOf(territory, battle);
  const changedHands = previousOwner != null
    ? previousOwner !== winner
    : (battle.victoryPointsAwarded || 0) > 0;

  const attackerCommander = battle.commanders?.[attacker]?.name || null;
  const defenderCommander = battle.commanders?.[defender]?.name || null;

  const attackerCasualties = battle.casualties?.[attacker] || 0;
  const defenderCasualties = battle.casualties?.[defender] || 0;
  const totalCasualties = attackerCasualties + defenderCasualties;

  const spEnabled = !!campaign.cpSystemEnabled;
  const attackerSP = spEnabled ? (battle.cpCostAttacker || 0) : null;
  const defenderSP = spEnabled ? (battle.cpCostDefender || 0) : null;

  // --- Sentence 1: the action -------------------------------------------
  const verb = pick(ADVANCE_VERBS, seed + ':verb');
  const outcome = pick(attackerWon ? ATTACKER_WON : ATTACKER_LOST, seed + ':out');
  const force = forceWithCommander(attacker, attackerCommander, seed);
  const action = `${capitalize(force)} ${verb} at ${name} ${outcome}.`;

  // --- Sentence 2: the bill ---------------------------------------------
  let cost = null;
  if (totalCasualties > 0) {
    const opener = pick(
      ['The bill came to', 'The butcher\'s bill:', 'When the returns came in:'],
      seed + ':bill'
    );
    const spClause = spEnabled
      ? ` That cost ${capitalOf(attacker)} ${num(attackerSP)} SP and ` +
        `${capitalOf(defender)} ${num(defenderSP)}.`
      : '';
    cost = `${opener} ${num(attackerCasualties)} ${plural(attacker)} against ` +
      `${num(defenderCasualties)} ${plural(defender)}.${spClause}`;
  } else if (spEnabled && (attackerSP || defenderSP)) {
    cost = `No returns were filed, but the supply trains still paid: ` +
      `${num(attackerSP)} SP ${adjective(attacker)}, ${num(defenderSP)} SP ${adjective(defender)}.`;
  }

  // --- Sentence 3: the character of the fight ---------------------------
  let character = null;
  if (totalCasualties > 0) {
    const ratio = Math.max(attackerCasualties, defenderCasualties) /
      Math.max(1, Math.min(attackerCasualties, defenderCasualties));
    if (ratio >= 2) character = pick(LOPSIDED, seed + ':lop');
    else if (ratio <= 1.1) character = pick(NEAR_RUN, seed + ':near');
    else if (totalCasualties >= 2500) character = pick(BLOODY, seed + ':bloody');
  }

  // --- Ability flavour ---------------------------------------------------
  let ability = null;
  if (battle.abilityUsed) {
    const usedBy = battle.abilityUsed;
    const label = abilityName(campaign, usedBy);
    if (usedBy === 'CSA') {
      ability = `${label} kept the wagons rolling and cut the ${adjective(usedBy)} reckoning in half.`;
    } else if (usedBy === 'USA' && attackerWon) {
      ability = `Federal officers had ${label} before the first shot, and the Confederacy paid three times over for it.`;
    } else if (usedBy === 'USA') {
      ability = `${label} bought nothing except keeping the ground out of Southern hands.`;
    } else {
      ability = `${label} was spent on this one.`;
    }
  }

  // --- Sentence 4: what it bought ----------------------------------------
  let consequence;
  if (winner === 'NEUTRAL') {
    consequence = `${name} stays neutral ground, and nobody's colours fly over it tonight.`;
  } else if (changedHands && attackerWon) {
    consequence = `${name} changes hands. ${num(vp)} VP to the ${adjective(winner)} column` +
      (defenderCommander ? `, and ${unitName(defenderCommander)} falls back off the position.` : '.');
  } else if (changedHands && !attackerWon) {
    // A failed attack on neutral ground handed to the defender by the rules.
    consequence = `The ground passes to the ${adjective(winner)} side by default. ` +
      `The ${num(vp)} VP the attack was meant to take went the other way instead.`;
  } else if (!attackerWon) {
    consequence = defenderCommander
      ? `The colours over ${name} do not change; ${unitName(defenderCommander)} still held the position when the firing died.`
      : `The colours over ${name} do not change.`;
  } else {
    consequence = `${name} is held, but nothing on the map moved for it.`;
  }

  const prose = [sceneLine(battle, seed), action, ability, cost, character, consequence]
    .filter(Boolean)
    .join(' ');

  return {
    id: battle.id,
    ordinal: toRoman(index + 1),
    mode: 'standard',
    title: name,
    subtitle: battle.mapName || null,
    vp,
    attacker,
    defender,
    winner,
    attackerWon,
    changedHands,
    attackerCommander,
    defenderCommander,
    attackerCasualties,
    defenderCasualties,
    totalCasualties,
    attackerSP,
    defenderSP,
    abilityUsed: battle.abilityUsed || null,
    abilityLabel: battle.abilityUsed ? abilityName(campaign, battle.abilityUsed) : null,
    scale: totalCasualties > 0 ? scaleLabel(totalCasualties) : null,
    notes: battle.notes || null,
    scene: sceneLine(battle, seed),
    prose,
  };
}

// ============================================================================
// GRAND-CAMPAIGN ENGAGEMENT NARRATION
// ============================================================================

function narrateGrandBattle(campaign, battle, index) {
  const gc = campaign.grandCampaign;
  const seed = `${battle.id}:${battle.turn}`;
  const tokenName = (id) => gc.tokens.find(t => t.id === id)?.name || null;

  const attacker = battle.attacker;
  const defender = battle.defender || (attacker === 'USA' ? 'CSA' : 'USA');
  const isDraw = battle.winner === 'DRAW';
  const attackerWon = battle.winner === attacker;

  const attackerToken = tokenName(battle.attackerTokenId);
  const defenderToken = tokenName(battle.defenderTokenId);
  const attackerSupport = tokenName(battle.attackerSupportId);
  const defenderSupport = tokenName(battle.defenderSupportId);

  const attackerCasualties = battle.casualties?.attackerTotal || 0;
  const defenderCasualties = battle.casualties?.defenderTotal || 0;
  const totalCasualties = attackerCasualties + defenderCasualties;
  const place = battle.locationLabel || battle.mapName || 'open country';

  // Formations destroyed this month, credited to the battle they died in.
  const participants = [
    battle.attackerTokenId, battle.defenderTokenId,
    battle.attackerSupportId, battle.defenderSupportId,
  ].filter(Boolean);
  const wipes = (gc.vpEvents || [])
    .filter(e => e.type === 'wipe' && e.turn === battle.turn && participants.includes(e.tokenId))
    .map(e => ({ name: tokenName(e.tokenId), by: e.side, vp: e.vp }));

  const verb = pick(ADVANCE_VERBS, seed + ':verb');
  const outcome = isDraw
    ? 'and neither side could clear the other off it'
    : pick(attackerWon ? ATTACKER_WON : ATTACKER_LOST, seed + ':out');

  const attackerForce = attackerSupport
    ? `${attackerToken}, with ${attackerSupport} coming up in support,`
    : attackerToken;
  const defenderForce = defenderSupport
    ? `${defenderToken} and ${defenderSupport}`
    : defenderToken;

  const action = `${attackerForce || capitalize(army(attacker, seed))} ${verb} against ` +
    `${defenderForce || army(defender, seed)} at ${place} ${outcome}.`;

  const cost = totalCasualties > 0
    ? `${num(attackerCasualties)} ${plural(attacker)} went down against ` +
      `${num(defenderCasualties)} ${plural(defender)}.`
    : null;

  const wipeLine = wipes.length
    ? wipes.map(w =>
        `${w.name} ceased to exist as a fighting formation, worth ${w.vp} VP to the ${adjective(w.by)} cause.`
      ).join(' ')
    : null;

  // Location labels come out of the map ("the Shenandoah near Front Royal"),
  // so they need a capital when they open the sentence.
  const consequence = isDraw
    ? capitalize(`${place} is left contested, both formations still on the ground.`)
    : capitalize(`${place} belongs to the ${adjective(battle.winner)} side when the firing dies.`);

  const prose = [sceneLine(battle, seed), action, cost, wipeLine, consequence]
    .filter(Boolean)
    .join(' ');

  return {
    id: battle.id,
    ordinal: toRoman(index + 1),
    mode: 'grand',
    title: place,
    subtitle: battle.mapName || null,
    vp: null,
    attacker,
    defender,
    winner: battle.winner,
    attackerWon,
    isDraw,
    attackerToken,
    defenderToken,
    attackerSupport,
    defenderSupport,
    attackerCasualties,
    defenderCasualties,
    totalCasualties,
    attackerSP: null,
    defenderSP: null,
    wipes,
    scale: totalCasualties > 0 ? scaleLabel(totalCasualties) : null,
    notes: battle.notes || null,
    scene: sceneLine(battle, seed),
    prose,
  };
}

// ============================================================================
// STANDINGS
// ============================================================================

function buildStandings(campaign, engagements, targetTurn) {
  const territories = campaign.territories || [];
  const instantVPGains = campaign.settings?.instantVPGains !== false;

  const heldVP = (side) => territories
    .filter(t => t.owner === side)
    .filter(t => instantVPGains || !t.transitionState?.isTransitioning)
    .reduce((sum, t) => sum + territoryVP(t), 0);

  const usaVP = campaign.victoryPointsUSA ?? heldVP('USA');
  const csaVP = campaign.victoryPointsCSA ?? heldVP('CSA');

  const countOwned = (side) => territories.filter(t => t.owner === side).length;

  // Cumulative dead across every resolved battle, both modes.
  let usaTotal = 0;
  let csaTotal = 0;
  for (const b of campaign.battles || []) {
    if (b.mode === 'grand') {
      if (!b.casualties) continue;
      const atk = b.casualties.attackerTotal || 0;
      const def = b.casualties.defenderTotal || 0;
      if (b.attacker === 'USA') { usaTotal += atk; csaTotal += def; }
      else { csaTotal += atk; usaTotal += def; }
    } else {
      usaTotal += b.casualties?.USA || 0;
      csaTotal += b.casualties?.CSA || 0;
    }
  }

  const turnCasualties = engagements.reduce((acc, e) => {
    acc[e.attacker] = (acc[e.attacker] || 0) + e.attackerCasualties;
    acc[e.defender] = (acc[e.defender] || 0) + e.defenderCasualties;
    return acc;
  }, { USA: 0, CSA: 0 });

  const gc = campaign.grandCampaign;

  // Standard campaigns move VP by taking ground; the Grand Campaign moves it
  // by wiping formations and storming capitals, which is logged as vpEvents.
  const vpSwing = engagements.reduce((acc, e) => {
    if (e.changedHands && e.winner && e.winner !== 'NEUTRAL' && e.vp) {
      acc[e.winner] = (acc[e.winner] || 0) + e.vp;
    }
    return acc;
  }, { USA: 0, CSA: 0 });

  if (gc) {
    for (const event of gc.vpEvents || []) {
      if (event.turn === targetTurn && (event.side === 'USA' || event.side === 'CSA')) {
        vpSwing[event.side] += event.vp || 0;
      }
    }
  }

  return {
    usaVP,
    csaVP,
    leader: usaVP === csaVP ? null : usaVP > csaVP ? 'USA' : 'CSA',
    margin: Math.abs(usaVP - csaVP),
    spEnabled: !!campaign.cpSystemEnabled,
    usaSP: campaign.combatPowerUSA || 0,
    csaSP: campaign.combatPowerCSA || 0,
    territories: {
      USA: countOwned('USA'),
      CSA: countOwned('CSA'),
      NEUTRAL: countOwned('NEUTRAL'),
      total: territories.length,
    },
    casualties: { USA: usaTotal, CSA: csaTotal, total: usaTotal + csaTotal },
    turnCasualties,
    vpSwing,
    grand: gc ? {
      vpToWin: gc.settings?.vpToWin ?? null,
      pools: gc.pools,
      cities: {
        USA: (gc.mapFeatures?.cities || []).filter(c => c.side === 'USA').length,
        CSA: (gc.mapFeatures?.cities || []).filter(c => c.side === 'CSA').length,
      },
    } : null,
  };
}

// ============================================================================
// CAMPAIGN-LEVEL COLOUR
// ============================================================================

/** One sentence on where the war stands, keyed off the turn's VP swing. */
function momentumLine(standings, engagements, seed) {
  const { vpSwing, leader, margin } = standings;
  const net = (vpSwing.USA || 0) - (vpSwing.CSA || 0);

  if (engagements.length === 0) {
    return pick([
      'No general engagement was fought this turn. The pickets traded shots and the staff traded paper.',
      'A quiet turn, spent foraging and drilling while the commissary caught up.',
      'Nothing came to a general action. Both armies spent the month looking at each other.',
    ], seed + ':quiet');
  }

  if (net === 0) {
    return leader
      ? `Nothing moved on the map worth the powder. The ${adjective(leader)} side still leads by ${num(margin)} VP.`
      : 'Nothing moved on the map worth the powder, and the two sides remain dead even.';
  }

  const gainer = net > 0 ? 'USA' : 'CSA';
  const swing = Math.abs(net);
  const verdict = leader === gainer
    ? `The ${adjective(gainer)} lead widens to ${num(margin)} VP.`
    : leader
      ? `Even so, the ${adjective(leader)} side holds the lead at ${num(margin)} VP.`
      : 'That brings the two sides level.';

  return `${capitalize(adjective(gainer))} arms took ${num(swing)} VP off the board this turn. ${verdict}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build the structured dispatch for one turn.
 *
 * @param {Object} campaign - Current campaign state
 * @param {number} [turn] - Turn to summarise (defaults to the current turn)
 * @returns {Object|null} Dispatch data, or null without a campaign
 */
export function buildTurnSummary(campaign, turn = null) {
  if (!campaign) return null;

  const targetTurn = turn ?? campaign.currentTurn;
  const isGrand = !!campaign.grandCampaign;
  const monthsPerTurn = isGrand ? 1 : MONTHS_PER_TURN;

  // Date labels. The campaign date on the record is the turn *currently* being
  // played, so a dispatch for an older turn has to walk the calendar back.
  const date = campaign.campaignDate || null;
  const monthIndex = date
    ? (date.month - 1) + (targetTurn - campaign.currentTurn) * monthsPerTurn
    : null;
  const shiftDate = (offsetTurns) => {
    if (!date) return null;
    const absolute = (date.year * 12) + (date.month - 1) +
      (targetTurn - campaign.currentTurn + offsetTurns) * monthsPerTurn;
    return formatCampaignDate({ month: (absolute % 12) + 1, year: Math.floor(absolute / 12) });
  };

  const dateLabel = shiftDate(0);
  const nextDateLabel = shiftDate(1);
  const month = monthIndex != null ? (((monthIndex % 12) + 12) % 12) + 1 : null;
  const seed = `${campaign.name || 'campaign'}:${targetTurn}`;

  const turnBattles = (campaign.battles || []).filter(b => b.turn === targetTurn);
  const resolved = turnBattles.filter(b => b.status === 'completed' && b.winner);
  const pendingBattles = turnBattles.filter(b => b.status === 'pending' || !b.winner);

  const engagements = resolved.map((battle, i) => {
    if (battle.mode === 'grand' && campaign.grandCampaign) {
      return narrateGrandBattle(campaign, battle, i);
    }
    const territory = (campaign.territories || []).find(t => t.id === battle.territoryId);
    return narrateStandardBattle(campaign, battle, territory, i);
  });

  const pending = pendingBattles.map(battle => {
    const territory = (campaign.territories || []).find(t => t.id === battle.territoryId);
    return {
      id: battle.id,
      title: battle.mode === 'grand'
        ? (battle.locationLabel || 'Grand Campaign')
        : (territory?.name || 'Unknown ground'),
      subtitle: battle.mapName || null,
      attacker: battle.attacker,
      vp: territory ? territoryVP(territory) : null,
    };
  });

  const standings = buildStandings(campaign, engagements, targetTurn);

  // Cities and forts that changed hands this month (Grand Campaign only).
  const captures = isGrand
    ? [
        ...(campaign.grandCampaign.mapFeatures?.cities || []),
        ...(campaign.grandCampaign.mapFeatures?.forts || []),
      ]
        .filter(f => (f.capturedBy || []).some(c => c.month === targetTurn))
        .map(f => ({
          name: f.name || 'an unnamed post',
          side: (f.capturedBy || []).filter(c => c.month === targetTurn).slice(-1)[0].side,
          isCapital: !!f.isCapital,
        }))
    : [];

  return {
    turn: targetTurn,
    week: targetTurn,
    nextTurn: targetTurn + 1,
    campaignName: campaign.name || 'Campaign',
    isGrand,
    dateLabel,
    nextDateLabel,
    monthName: month ? MONTH_NAMES[month - 1] : null,
    seasonLine: month ? pick(SEASON_LINES[seasonOf(month)], seed) : null,
    engagements,
    pending,
    captures,
    standings,
    // Standings are always live campaign state. That reads correctly for the
    // turn just closed (and for the one in progress), but paging back to an
    // older dispatch must not pretend the numbers are historical.
    retrospective: targetTurn < campaign.currentTurn - 1,
    standingsLabel: targetTurn < campaign.currentTurn - 1
      ? `The ledger as it stands today (Turn ${campaign.currentTurn})`
      : `The ledger heading into ${nextDateLabel || `Turn ${targetTurn + 1}`}`,
    momentum: momentumLine(standings, engagements, seed),
    closing: nextDateLabel
      ? `Map and campaign state as the armies step off into ${nextDateLabel} (Turn ${targetTurn + 1}).`
      : `Map and campaign state heading into Turn ${targetTurn + 1}.`,
  };
}

/** Turns available to summarise: every turn that saw a battle, plus this one. */
export function getSummarisableTurns(campaign) {
  if (!campaign) return [];
  const turns = new Set((campaign.battles || []).map(b => b.turn).filter(t => Number.isFinite(t)));
  turns.add(campaign.currentTurn);
  return [...turns].sort((a, b) => a - b);
}

/**
 * The dispatch reduced to plain prose paragraphs: the season line, one
 * paragraph per engagement, then the momentum line. No headings, no figures
 * tables — this is what "Latest Intelligence" prints in the share view, where
 * the reader has no campaign state to page through.
 *
 * `prose` is a joined string today, but tolerate an array so a future
 * multi-paragraph narration flattens rather than stringifies.
 *
 * @param {Object} summary - Result of buildTurnSummary
 * @returns {string[]} Paragraphs, in reading order
 */
export function buildDispatchParagraphs(summary) {
  if (!summary) return [];
  return [
    summary.seasonLine,
    ...(summary.engagements || []).flatMap(e => (Array.isArray(e.prose) ? e.prose : [e.prose])),
    summary.momentum,
  ].filter(Boolean);
}

/**
 * Flatten a dispatch to text for pasting into Discord.
 *
 * @param {Object} summary - Result of buildTurnSummary
 * @param {Object} [options]
 * @param {boolean} [options.markdown=true] - Emit Discord markdown emphasis
 * @param {string|null} [options.shareUrl=null] - Share link appended at the end
 * @returns {string} The dispatch as text
 */
export function formatTurnSummaryText(summary, options = {}) {
  if (!summary) return '';
  const { markdown = true, shareUrl = null } = options;

  const b = (s) => (markdown ? `**${s}**` : s);
  const i = (s) => (markdown ? `*${s}*` : s);
  const lines = [];

  // --- Heading -----------------------------------------------------------
  lines.push(b(`Turn ${summary.turn} · Week ${summary.week} of ${summary.campaignName}`));
  if (summary.dateLabel) lines.push(i(summary.dateLabel));
  if (summary.seasonLine) {
    lines.push('');
    lines.push(i(summary.seasonLine));
  }

  // --- Engagements -------------------------------------------------------
  if (summary.engagements.length === 0) {
    lines.push('');
    lines.push(summary.momentum);
  } else {
    for (const e of summary.engagements) {
      lines.push('');
      const vpBit = e.vp ? ` · ${e.vp} VP` : '';
      const mapBit = e.subtitle ? ` ${i(`(${e.subtitle})`)}` : '';
      lines.push(b(`${e.ordinal}. ${String(e.title).toUpperCase()}${vpBit}`) + mapBit);
      lines.push(e.prose);
      if (e.notes) lines.push(i(`Note: ${e.notes}`));
    }
  }

  // --- Captures (Grand Campaign) ----------------------------------------
  if (summary.captures.length > 0) {
    lines.push('');
    lines.push(b('Taken this month'));
    for (const c of summary.captures) {
      lines.push(`• ${c.name}${c.isCapital ? ' (capital)' : ''}, now ${c.side}`);
    }
  }

  // --- Still to be fought -----------------------------------------------
  if (summary.pending.length > 0) {
    lines.push('');
    lines.push(b('Still to be fought'));
    for (const p of summary.pending) {
      lines.push(`• ${p.title}${p.subtitle ? `, ${p.subtitle}` : ''} (${p.attacker} attacking)`);
    }
  }

  // --- Standings ---------------------------------------------------------
  const s = summary.standings;
  lines.push('');
  lines.push(b(summary.standingsLabel));
  lines.push(`USA ${num(s.usaVP)} VP · CSA ${num(s.csaVP)} VP` +
    (s.leader ? ` (${s.leader} leads by ${num(s.margin)})` : ' (dead even)'));
  if (s.spEnabled) {
    lines.push(`Supply: USA ${num(s.usaSP)} SP · CSA ${num(s.csaSP)} SP`);
  }
  if (s.grand) {
    lines.push(`Treasury: USA $${num(s.grand.pools?.USA?.treasury)} · CSA $${num(s.grand.pools?.CSA?.treasury)}`);
    lines.push(`Manpower: USA ${num(s.grand.pools?.USA?.manpower)} · CSA ${num(s.grand.pools?.CSA?.manpower)}`);
    lines.push(`Cities: USA ${s.grand.cities.USA} · CSA ${s.grand.cities.CSA}`);
  }
  if (s.territories.total > 0) {
    lines.push(`Ground: USA ${s.territories.USA} · CSA ${s.territories.CSA} · Neutral ${s.territories.NEUTRAL}`);
  }
  lines.push(`Dead and wounded, all told: ${num(s.casualties.total)} ` +
    `(USA ${num(s.casualties.USA)} · CSA ${num(s.casualties.CSA)})`);

  if (summary.engagements.length > 0) {
    lines.push('');
    lines.push(summary.momentum);
  }

  // --- Sign-off ----------------------------------------------------------
  lines.push('');
  lines.push(i(summary.closing));
  if (shareUrl) lines.push(shareUrl);

  return lines.join('\n');
}
