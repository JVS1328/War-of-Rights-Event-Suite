/**
 * Which matchups a night actually ran.
 *
 * Most nights run one: two lead units, both rounds. Playoff and
 * single-round-lead nights can run a different pair in each round — 8th OH v
 * II Corps, then MSG v FSB — and a schedule that prints only the first hides
 * half the night. A round with no lead of its own falls back to the night's,
 * which is how the points table and the Elo replay read it too.
 */

export interface LeadPair {
  a: string | null;
  b: string | null;
}

export interface NightLeadsInput {
  leadA?: string | null;
  leadB?: string | null;
  leadA_r1?: string | null;
  leadB_r1?: string | null;
  leadA_r2?: string | null;
  leadB_r2?: string | null;
  isPlayoffs?: boolean;
  isSingleRoundLeads?: boolean;
  round1Winner?: 'A' | 'B' | null;
  round2Winner?: 'A' | 'B' | null;
}

export interface NightLeads {
  /** Round one's pair, or the night's single one. Null when no lead is set. */
  first: LeadPair | null;
  /** Round two's, only when it differs from the first. */
  second: LeadPair | null;
}

const pair = (a?: string | null, b?: string | null): LeadPair | null =>
  a || b ? { a: a || null, b: b || null } : null;

/** The pair that led each round: its own on a split-lead night, else the night's. */
export function roundLeads(w: NightLeadsInput): [LeadPair | null, LeadPair | null] {
  if (!(w.isPlayoffs || w.isSingleRoundLeads)) {
    const night = pair(w.leadA, w.leadB);
    return [night, night];
  }
  return [
    pair(w.leadA_r1 || w.leadA, w.leadB_r1 || w.leadB),
    pair(w.leadA_r2 || w.leadA, w.leadB_r2 || w.leadB),
  ];
}

/**
 * Who won each round, by name: the winning side's lead that round, or "Team A"
 * when it had none. Null for a round with no result yet.
 */
export function roundWinners(w: NightLeadsInput): [string | null, string | null] {
  const [p1, p2] = roundLeads(w);
  const name = (side: 'A' | 'B' | null | undefined, p: LeadPair | null) =>
    side ? (side === 'A' ? p?.a : p?.b) || `Team ${side}` : null;
  return [name(w.round1Winner, p1), name(w.round2Winner, p2)];
}

export function nightLeadPairs(w: NightLeadsInput): NightLeads {
  const [r1, r2] = roundLeads(w);
  const same = r1?.a === r2?.a && r1?.b === r2?.b;
  return {
    // One round set is still one matchup, whichever round it was.
    first: r1 || r2,
    second: !r1 || same ? null : r2,
  };
}
