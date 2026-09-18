/**
 * The masthead standfirst — the italic line under the headline.
 *
 * One to three short sentences, built only from figures the campaign record
 * actually holds. Nothing is invented: no volume numbers, no weather, no
 * casualty flourishes. If a fact is missing its sentence is simply dropped.
 */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Small counts read better spelled out; anything larger stays a numeral. */
const count = (n) => {
  const word = n >= 0 && n <= 10 ? WORDS[n] : String(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
};

const SIDE_NAME = { USA: 'The Union', CSA: 'The Confederacy' };

/**
 * @param {Object}  facts
 * @param {number}  facts.usaVP            Union victory points
 * @param {number}  facts.csaVP            Confederate victory points
 * @param {string}  [facts.vpLabel]        'VP' by default; anything else is used verbatim
 * @param {?string} [facts.movesFirst]     'USA' | 'CSA' — who opens the turn, if rolled
 * @param {number}  [facts.pendingCount]   engagements awaiting a result
 * @param {?string} [facts.pendingPlace]   where, when exactly one is pending
 * @returns {string} the standfirst, or '' when there is nothing true to say
 */
export function buildStandfirst({
  usaVP = 0,
  csaVP = 0,
  vpLabel = 'VP',
  movesFirst = null,
  pendingCount = 0,
  pendingPlace = null,
} = {}) {
  const unit = vpLabel === 'VP' ? 'points' : vpLabel;
  const sentences = [];

  // 1. Where the war stands.
  const margin = Math.abs(usaVP - csaVP);
  if (usaVP === csaVP) {
    sentences.push(`The two sides stand dead even at ${usaVP} ${unit}.`);
  } else {
    const leader = usaVP > csaVP ? 'USA' : 'CSA';
    sentences.push(`${SIDE_NAME[leader]} leads by ${margin} ${unit}.`);
  }

  // 2. Who opens the turn, when the initiative has been rolled.
  if (SIDE_NAME[movesFirst]) {
    sentences.push(`${SIDE_NAME[movesFirst]} holds the first move.`);
  }

  // 3. What is still undecided — named, if there is only the one.
  if (pendingCount === 1) {
    sentences.push(
      pendingPlace
        ? `One engagement stands unresolved at ${pendingPlace}.`
        : 'One engagement stands unresolved.'
    );
  } else if (pendingCount > 1) {
    sentences.push(`${count(pendingCount)} engagements stand unresolved.`);
  }

  return sentences.join(' ');
}

export default buildStandfirst;
