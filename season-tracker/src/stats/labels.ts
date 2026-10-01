import type { Formation } from './types';

/** Display labels for victim formation / death stance. */
export const FORMATION_LABEL: Record<Formation, string> = {
  in_form: 'In Formation',
  skirm: 'Skirmish',
  oob: 'Out of Line',
};

/**
 * Display names for the meta block's deaths-by-weapon keys, which are terse
 * enough to be read as something they aren't: `round` is the smoothbore's
 * round ball, an infantry projectile, and nothing to do with artillery round
 * shot. Only canister and shell come from the guns.
 */
export const WEAPON_LABEL: Record<string, string> = {
  canister: 'Canister',
  shell: 'Shell',
  minie: 'Minié ball',
  round: 'Round ball',
  compression: 'Compression bullet',
  pellet: 'Pellet',
  pistol: 'Pistol',
  hexagonal: 'Hexagonal bullet',
  melee: 'Melee',
  env: 'Environment',
};

/** A weapon key's display name; an unknown key is capitalised as it stands. */
export function weaponLabel(key: string): string {
  return WEAPON_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** A killfeed cause ("Minie", "Env") in the same words as its weapon key; unknown causes as written. */
export function causeLabel(cause: string): string {
  return WEAPON_LABEL[cause.toLowerCase()] ?? cause;
}

/** Short labels for dense table headers. */
export const FORMATION_SHORT: Record<Formation, string> = {
  in_form: 'IF',
  skirm: 'Sk',
  oob: 'OoL',
};

/** Per-stance ticket weights (game rules): IF costs 1, Skirmish 3, Out of Line 5. */
export const TICKET_WEIGHT: Record<Formation, number> = { in_form: 1, skirm: 3, oob: 5 };

/** Tooltip for ×Td — tickets you cost your team per death. */
export const AVG_TD_LABEL = 'Avg ticket cost per death (1·In Formation + 3·Skirmish + 5·Out of Line) ÷ deaths — tickets you cost your team';

/** Tooltip for ×Tk — tickets you drained from the enemy per kill. */
export const AVG_TK_LABEL = 'Avg ticket value per kill (1·In Formation + 3·Skirmish + 5·Out of Line) ÷ kills — weighted by the formation each victim died in';

/** Tooltip for a single round's ticket-damage-inflicted share (round drawer). */
export const TICKET_INFLICTED_LABEL =
  'Ticket damage inflicted: share of the team\'s ticket drain on the enemy this round (this unit\'s ×Tk-weighted kills ÷ the team\'s total).';

/** Tooltip for a single round's ticket-damage-received share (round drawer). */
export const TICKET_RECEIVED_LABEL =
  'Ticket damage received: share of the team\'s ticket losses this round (this unit\'s ×Td-weighted deaths ÷ the team\'s total).';

/** Tooltip for the cumulative (per-round-averaged) ticket-damage-inflicted share. */
export const AVG_TICKET_INFLICTED_LABEL =
  'Avg ticket damage inflicted: this unit\'s share of its team\'s ticket drain on the enemy, averaged across every round it played.';

/** Tooltip for the cumulative (per-round-averaged) ticket-damage-received share. */
export const AVG_TICKET_RECEIVED_LABEL =
  'Avg ticket damage received: this unit\'s share of its team\'s ticket losses, averaged across every round it played.';

/** Tooltip for kill rate (KR) — offensive output normalized by unit size. */
export const KILL_RATE_LABEL =
  'Kill rate: kills ÷ players fielded — average kills per player, a size-normalized measure of a unit\'s offensive output (higher is better)';

/** Tooltip for loss rate (LR) — casualties normalized by unit size. */
export const LOSS_RATE_LABEL =
  'Loss rate: casualties ÷ players fielded — average losses per player, a size-normalized measure of how hard a unit was hit (lower is better)';

/**
 * Per-player rate for kill rate / loss rate: a count (kills or casualties)
 * divided by the players who produced it. Returns null when there were no
 * players, so the caller renders "—".
 *
 * For a single round `players` is that round's head count. Aggregated across
 * rounds `players` is the total player-rounds fielded (sum of per-round head
 * counts), so the pooled rate stays a per-round-per-player average that reads
 * on the same scale as any one round's value.
 */
export function perPlayerRate(count: number, players: number): number | null {
  return players > 0 ? count / players : null;
}

/** Format a kill/loss rate to two decimals, or "—" when null. */
export function formatRate(rate: number | null): string {
  return rate == null ? '—' : rate.toFixed(2);
}

/**
 * Average ticket cost across in-form / skirmish / out-of-line counts. Returns
 * null when there are none (caller renders "—"). Used for both ×Td (deaths)
 * and ×Tk (kills bucketed by victim formation).
 */
export function avgTicketCost(inForm: number, skirm: number, oob: number): number | null {
  const total = inForm + skirm + oob;
  if (total <= 0) return null;
  const weighted = TICKET_WEIGHT.in_form * inForm + TICKET_WEIGHT.skirm * skirm + TICKET_WEIGHT.oob * oob;
  return weighted / total;
}

export function formatAvgT(avg: number | null): string {
  return avg == null ? '—' : `×${avg.toFixed(1)}`;
}

/**
 * Total ticket damage from formation-bucketed kills or deaths: the per-stance
 * weights summed (IF·1 + Sk·3 + OoL·5). Unlike the ×T *average* this is additive
 * across players and units, so a unit's damage is the sum of its members' and
 * per-unit shares add up to the team total. Multiplying ×Td/×Tk by a unit's
 * classified deaths/kills yields the same figure (avg × count), matching how the
 * metric reads off the drawer.
 */
export function ticketDamage(inForm: number, skirm: number, oob: number): number {
  return TICKET_WEIGHT.in_form * inForm + TICKET_WEIGHT.skirm * skirm + TICKET_WEIGHT.oob * oob;
}

/** A part÷total share as a 0–1 fraction, or null when the total is zero. */
export function pctShare(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

/** Format a 0–1 fraction as a whole-number percent ("42%"), or "—" when null. */
export function formatPct(fraction: number | null): string {
  return fraction == null ? '—' : `${Math.round(fraction * 100)}%`;
}

/**
 * Trim a trailing "Company" word off a roster company label so "A Company" reads
 * as "A" where the surrounding UI already supplies the "Co." prefix. Bare labels
 * ("A", "1st") pass through unchanged, and a value that is only "Company" falls
 * back to itself rather than collapsing to an empty string.
 */
export function formatCompany(company: string): string {
  const trimmed = company.replace(/\s*\bcompany\s*$/i, '').trim();
  return trimmed || company;
}
