/**
 * A round read as a matchup.
 *
 * The scoreboard already records everything per side; this turns it into the
 * two things a reader wants — a scoreline, and one line per metric showing who
 * won it — plus a few plain-language notes drawn from the same numbers.
 *
 * Pure: takes a Scoreboard, returns data. No React, no formatting beyond what
 * the numbers mean.
 */
import type { Scoreboard, Team, TeamCasualties } from './types';
import { TICKET_WEIGHT } from './labels';
import type { SpineRow, SpineTextRow } from '../components/ui/spineModel';

/** Stance-weighted ticket cost of a side's casualties (1 · 3 · 5). */
export function ticketCost(c: TeamCasualties): number {
  return c.inForm * TICKET_WEIGHT.in_form + c.skirm * TICKET_WEIGHT.skirm + c.oob * TICKET_WEIGHT.oob;
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
const sum = (m: Record<string, number>, keys: string[]) =>
  keys.reduce((t, k) => t + (m[k] ?? 0), 0);

/**
 * Weapon keys the guns account for: canister and shell, and nothing else. The
 * meta block's `round` key is the smoothbore's round ball — an infantry
 * projectile — not artillery round shot, and counting it here inflated every
 * artillery figure by whatever the muskets did.
 */
const ARTILLERY_KEYS = ['canister', 'shell'];

export interface MatchupScore {
  /** Enemy men this side put down — the objective in a ticket mode. */
  usaInflicted: number;
  csaInflicted: number;
  winner: Team | null;
  usaTicketsLost: number;
  csaTicketsLost: number;
}

export function matchupScore(sb: Scoreboard): MatchupScore {
  const u = sb.meta.casualties.USA;
  const c = sb.meta.casualties.CSA;
  return {
    usaInflicted: c.total,
    csaInflicted: u.total,
    winner: sb.meta.winner,
    usaTicketsLost: ticketCost(u),
    csaTicketsLost: ticketCost(c),
  };
}

/**
 * One row per metric, USA on the left. Rows where a smaller number is better
 * carry `lower`, so the spine marks the right winner rather than the bigger bar.
 */
export function matchupRows(sb: Scoreboard): (SpineRow | SpineTextRow)[] {
  const u = sb.meta.casualties.USA;
  const c = sb.meta.casualties.CSA;
  const uT = ticketCost(u);
  const cT = ticketCost(c);
  const uW = sb.meta.deathsByWeapon.USA;
  const cW = sb.meta.deathsByWeapon.CSA;

  const rows: (SpineRow | SpineTextRow)[] = [
    { label: 'Casualties inflicted', sub: 'enemy men lost', a: c.total, b: u.total },
    { label: 'Casualties taken', sub: 'lower is better', a: u.total, b: c.total, lower: true },
    // Damage dealt is the other side's ticket loss.
    { label: 'Ticket damage dealt', sub: 'stance weighted', a: cT, b: uT },
    {
      label: 'Held the line',
      sub: '% of losses, in formation',
      a: pct(u.inForm, u.total),
      b: pct(c.inForm, c.total),
      aText: `${pct(u.inForm, u.total)}%`,
      bText: `${pct(c.inForm, c.total)}%`,
    },
    {
      label: 'Caught out of line',
      sub: '% of losses · lower better',
      a: pct(u.oob, u.total),
      b: pct(c.oob, c.total),
      aText: `${pct(u.oob, u.total)}%`,
      bText: `${pct(c.oob, c.total)}%`,
      lower: true,
    },
  ];

  // Cost per death only means something once a side has actually lost someone.
  if (u.total > 0 && c.total > 0) {
    const uAvg = uT / u.total;
    const cAvg = cT / c.total;
    rows.push({
      label: 'Cost per death',
      sub: 'tickets · lower better',
      a: uAvg,
      b: cAvg,
      aText: uAvg.toFixed(1),
      bText: cAvg.toFixed(1),
      lower: true,
    });
  }

  const uMelee = uW.melee ?? 0;
  const cMelee = cW.melee ?? 0;
  if (uMelee || cMelee) {
    rows.push({ label: 'Melee deaths', sub: 'lost at bayonet point', a: uMelee, b: cMelee, lower: true });
  }
  const uArt = sum(uW, ARTILLERY_KEYS);
  const cArt = sum(cW, ARTILLERY_KEYS);
  if (uArt || cArt) {
    rows.push({
      label: 'Artillery deaths',
      sub: 'canister and shell',
      a: uArt,
      b: cArt,
      lower: true,
    });
  }

  if (sb.meta.moraleUsa || sb.meta.moraleCsa) {
    rows.push({
      label: 'Morale at the end',
      aText: spaceCamel(sb.meta.moraleUsa),
      bText: spaceCamel(sb.meta.moraleCsa),
      text: true,
    });
  }
  const { ticketsLeftUsa: uLeft, ticketsLeftCsa: cLeft, ticketsUsa: uStart, ticketsCsa: cStart } = sb.meta;
  if (uLeft != null && cLeft != null) {
    rows.push({
      label: 'Tickets left',
      sub: 'at the end',
      a: uLeft,
      b: cLeft,
      aText: ticketsText(uLeft, uStart),
      bText: ticketsText(cLeft, cStart),
    });
  }
  return rows;
}

/** "31 / 122": tickets left of the side's start, or the start alone when the end is unknown. */
export function ticketsText(left: number | null | undefined, start: number | null | undefined): string {
  if (left == null) return start == null ? '—' : String(start);
  return start == null ? String(left) : `${left} / ${start}`;
}

/** "FinalPush" -> "Final Push"; the overlay reports morale in camel case. */
export function spaceCamel(v: string | null): string {
  if (!v) return '—';
  return v.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export interface MatchupKey {
  /** Which side the note is about, for colouring. */
  side: Team | null;
  title: string;
  body: string;
}

const SIDE_WORDS: Record<Team, { adj: string; noun: string }> = {
  USA: { adj: 'Union', noun: 'the Union' },
  CSA: { adj: 'Confederate', noun: 'the Confederacy' },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Plain-language notes about the round, written from the rows above. Returns
 * an empty list when there is no winner (a draw has no story to tell yet).
 */
export function matchupKeys(sb: Scoreboard): MatchupKey[] {
  const winner = sb.meta.winner;
  if (!winner) return [];
  const loser: Team = winner === 'USA' ? 'CSA' : 'USA';
  const w = sb.meta.casualties[winner];
  const l = sb.meta.casualties[loser];
  if (w.total === 0 && l.total === 0) return [];

  const keys: MatchupKey[] = [];
  const W = SIDE_WORDS[winner];
  const L = SIDE_WORDS[loser];

  keys.push({
    side: winner,
    title: `${W.adj} discipline`,
    body:
      `${pct(w.inForm, w.total)}% of ${W.adj} losses came in formation against ` +
      `${pct(l.inForm, l.total)}% for ${L.noun}. A death in formation costs one ticket; the rest cost three or five.`,
  });

  if (l.oob > 0) {
    const oolCost = l.oob * TICKET_WEIGHT.oob;
    keys.push({
      side: loser,
      title: 'Caught out of line',
      body:
        `${cap(L.noun)} lost ${l.oob} men out of line — ${oolCost} tickets, ` +
        `${pct(oolCost, ticketCost(l))}% of everything given up, off ${pct(l.oob, l.total)}% of the casualties.`,
    });
  }

  // The winner does not always win the ticket exchange; say which happened.
  const wDealt = ticketCost(l);
  const lDealt = ticketCost(w);
  keys.push({
    side: null,
    title: 'The margin',
    body:
      wDealt >= lDealt
        ? `${cap(W.noun)} won the ticket exchange ${wDealt} to ${lDealt} — a ${wDealt - lDealt}-ticket margin.`
        : `${cap(W.noun)} won on bodies, not tickets: more men killed, but the heavier ticket loss — ` +
          `${lDealt} dealt against ${wDealt}. Cheap deaths in formation covered the gap.`,
  });

  return keys;
}
