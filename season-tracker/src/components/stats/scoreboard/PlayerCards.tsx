// Stacked player cards for the round's unit views — the drawer is too narrow
// for a wide table, so each man gets a card with his role line, k/d, stance
// splits and killfeed breakdowns. Shared by the Players tab and the In-game
// units tab so a man reads the same under either grouping.
import type { ReactNode } from 'react';
import { roleLine } from '../drawerPrimitives';
import type { ScoreboardPlayer, RosterEntry } from '../../../stats/types';
import { avgTicketCost, AVG_TD_LABEL, AVG_TK_LABEL } from '../../../stats/labels';
import { formatTicket } from './UnitStatRow';
import { LevelBadge } from '../../../replay/LevelBadge';
import {
  type KillStance,
  type CauseIndex,
  type CauseCounts,
  type UnitAgg,
  killedWithOf,
  diedToOf,
  playerKey,
} from './playersModel';

/**
 * A man's card as one unit knew him, rather than as the round did — his figures
 * for a single posting, the identity he held there, and a line saying how long
 * he stayed. Supplied by the In-game units tab, where a man who moved company
 * appears under each unit he served in.
 */
export interface PlayerCardSlice {
  agg: UnitAgg;
  /** The posting's own regiment / company / rank / class for the role line. */
  entry?: RosterEntry;
  /** Time served here, and what share of his round these figures are. */
  note?: ReactNode;
  /** His round is divided between postings, so the round-wide lines say so. */
  split: boolean;
}

/** cause → count entries, most common first. */
export function sortedCauses(counts: CauseCounts): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function PlayerCardList({
  rows,
  isOfficer,
  lookup,
  killStance,
  causeIndex,
  onOpenPlayer,
  indent = false,
  sliceOf,
}: {
  rows: ScoreboardPlayer[];
  isOfficer: (name: string) => boolean;
  lookup: (p: ScoreboardPlayer) => RosterEntry | undefined;
  killStance: (p: ScoreboardPlayer) => KillStance;
  causeIndex: CauseIndex;
  onOpenPlayer: (key: string) => void;
  indent?: boolean;
  /** Read the card as one posting rather than the whole round. */
  sliceOf?: (p: ScoreboardPlayer) => PlayerCardSlice | undefined;
}) {
  return (
    <ul>
      {rows.map((p) => {
        const slice = sliceOf?.(p);
        const r = slice?.entry ?? lookup(p);
        // Full in-game identity (Regiment · Co. X · Rank · Class), matching the
        // player profile's round cards.
        const role = roleLine({
          regiment: r?.regiment,
          company: r?.company,
          rank: r?.rank,
          className: r?.className,
          battery: r ? /batter/i.test(r.regiment ?? '') : false,
        });
        // Figures: the posting's when a slice is supplied, else the round's.
        const agg = slice?.agg;
        const stance = killStance(p);
        const ks: KillStance = agg
          ? { inForm: agg.killInForm, skirm: agg.killSkirm, oob: agg.killOob }
          : stance;
        const kills = agg ? agg.kills : p.kills;
        const deaths = agg ? agg.deaths : p.deaths;
        const dIn = agg ? agg.inForm : p.deathsInForm;
        const dSk = agg ? agg.skirm : p.deathsSkirm;
        const dOob = agg ? agg.oob : p.deathsOob;
        const kd = deaths > 0 ? kills / deaths : kills;
        // The killfeed says nothing about which posting a man held at the time,
        // so his weapons stay a round-wide reading and the label says as much.
        const roundWide = slice?.split ?? false;
        const killedWith = sortedCauses(killedWithOf(p, causeIndex));
        const diedTo = sortedCauses(diedToOf(p, causeIndex));
        return (
          <li
            key={playerKey(p)}
            style={{
              borderTop: '1px solid var(--line)',
              padding: indent ? '7px 13px 7px 26px' : '7px 13px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {isOfficer(p.name) && (
                <span style={{ color: 'var(--live)', flex: 'none' }} title="officer">★</span>
              )}
              <button onClick={() => onOpenPlayer(playerKey(p))} className="wor-name" style={{ textAlign: 'left' }}>
                {p.name}
              </button>
              <LevelBadge level={p.level} />
              <span className="rule" />
              <span className="meta" style={{ display: 'flex', gap: 10, flex: 'none' }}>
                <span>K/D <b style={{ color: 'var(--ink)', fontWeight: 400 }}>{kd.toFixed(2)}</b></span>
                <span title={AVG_TD_LABEL} style={{ cursor: 'help' }}>
                  ×Td <b style={{ color: 'var(--ink)', fontWeight: 400 }}>
                    {formatTicket(avgTicketCost(dIn, dSk, dOob))}
                  </b>
                </span>
                <span title={AVG_TK_LABEL} style={{ cursor: 'help' }}>
                  ×Tk <b style={{ color: 'var(--ink)', fontWeight: 400 }}>
                    {formatTicket(avgTicketCost(ks.inForm, ks.skirm, ks.oob))}
                  </b>
                </span>
              </span>
            </div>
            {role && <div className="note" style={{ marginTop: 3 }}>{role}</div>}
            {slice?.note && <div className="note" style={{ marginTop: 3 }}>{slice.note}</div>}
            <div style={{ marginTop: 3, color: 'var(--ink-2)' }}>
              {kills} kills · {deaths} deaths
            </div>
            <div className="note" style={{ marginTop: 3 }}>
              d: <b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{dIn}</b> form ·{' '}
              <b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{dSk}</b> skirm ·{' '}
              <b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{dOob}</b> ool
            </div>
            <div className="note" style={{ marginTop: 3 }}>
              k: <b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{ks.inForm}</b> form ·{' '}
              <b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{ks.skirm}</b> skirm ·{' '}
              <b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{ks.oob}</b> ool
            </div>
            {killedWith.length > 0 && (
              <div className="note" style={{ marginTop: 3 }}>
                <span className="cap">killed with{roundWide ? ' (round)' : ''} </span>
                <CauseInline data={killedWith} />
              </div>
            )}
            {diedTo.length > 0 && (
              <div className="note" style={{ marginTop: 3 }}>
                <span className="cap">died to{roundWide ? ' (round)' : ''} </span>
                <CauseInline data={diedTo} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A compact inline cause breakdown ("Rifle ×3 62% · Bayonet 38%") with each
 * weapon's share.
 *
 * The share is of the killfeed's own total, never of the scoreboard's kill or
 * death column. They are different sources and they do not always agree — the
 * feed can carry victims the column does not — and dividing one by the other
 * produced shares summing to 245%. `recorded` is the column's figure, shown
 * alongside only when it disagrees, so the gap is visible instead of silently
 * distorting every percentage.
 */
export function CauseInline({ data, recorded }: { data: [string, number][]; recorded?: number }) {
  const denom = data.reduce((s, [, n]) => s + n, 0);
  return (
    <span>
      {data.map(([cause, n], i) => (
        <span key={cause}>
          {i > 0 && ' · '}
          <span style={{ textTransform: 'capitalize', color: 'var(--ink-2)' }}>{cause}</span>
          {n > 1 && <span style={{ color: 'var(--ink-3)' }}> ×{n}</span>}
          {denom > 0 && (
            <span style={{ color: 'var(--ink-3)' }}> {Math.round((n / denom) * 100)}%</span>
          )}
        </span>
      ))}
      {recorded != null && recorded !== denom && (
        <span
          style={{ color: 'var(--ink-3)' }}
          title={`The killfeed has ${denom}; the scoreboard column records ${recorded}. Shares are of the ${denom} the feed accounts for.`}
        >
          {' '}· {denom} of {recorded} in the feed
        </span>
      )}
    </span>
  );
}

/**
 * The unit-level "killed with" / "died to" strip that sits under an expanded
 * unit header — every member's killfeed rolled up.
 */
export function UnitCauseSummary({
  killedWith,
  diedTo,
  kills,
  deaths,
  indent = false,
}: {
  killedWith: [string, number][];
  diedTo: [string, number][];
  kills: number;
  deaths: number;
  indent?: boolean;
}) {
  if (killedWith.length === 0 && diedTo.length === 0) return null;
  return (
    <div
      className="note"
      style={{
        borderTop: '1px solid var(--line)',
        background: 'var(--surface)',
        padding: indent ? '7px 13px 7px 26px' : '7px 13px',
      }}
    >
      <div>
        <span className="cap">unit killed with </span>
        {killedWith.length > 0 ? <CauseInline data={killedWith} recorded={kills} /> : <span>—</span>}
      </div>
      <div>
        <span className="cap">unit died to </span>
        {diedTo.length > 0 ? <CauseInline data={diedTo} recorded={deaths} /> : <span>—</span>}
      </div>
    </div>
  );
}
