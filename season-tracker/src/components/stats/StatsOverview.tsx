/**
 * Stats → Overview, built to the prototype's spec (V.overview).
 *
 * Three panels and no more: what got imported, who is at the top of it, and
 * the rounds that arrived most recently. The leader columns each carry a
 * minimum where the ratio would otherwise be won by whoever played least — a
 * 3.00 K/D over two rounds is noise, and the prototype says so in the heading
 * rather than quietly filtering.
 */
import { causeLabel, FORMATION_LABEL, TICKET_WEIGHT, weaponLabel } from '../../stats/labels';
import type { computeCombatTotals, Overview, PlayerStatRow, RoundSummary } from '../../stats/statsEngine';
import type { Team } from '../../stats/types';

/** Minimums, so a ratio is not won by a player who barely played. */
const KD_MIN_ROUNDS = 8;
const TD_MIN_DEATHS = 15;

const pc = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const when = (r: string | null) => (r ? `${r.slice(0, 10)} ${r.slice(11, 16)}` : '—');
const dur = (s: number | null) =>
  s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** A player's name without the unit tag the game bolts onto the front. */
const bare = (name: string) => name.replace(/^\s*[[(<|]?[^\s\])>|]{1,12}[\])>|]\s*/, '').trim() || name;

function Leaders({
  title,
  rows,
  fmt,
  onOpenPlayer,
}: {
  title: string;
  rows: PlayerStatRow[];
  fmt: (p: PlayerStatRow) => string;
  onOpenPlayer?: (key: string) => void;
}) {
  return (
    <div className="col">
      <div className="cap" style={{ marginBottom: 7 }}>{title}</div>
      {rows.map((p, i) => (
        <div key={p.key} className="bteam" style={{ borderBottom: '1px solid var(--line)', padding: '5px 0' }}>
          <span>
            <span className={`pos${i === 0 ? ' q' : ''}`}>{i + 1}</span>{' '}
            <button
              className="wor-name"
              onClick={() => onOpenPlayer?.(p.key)}
              style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}
            >
              {bare(p.name)}
            </button>{' '}
            <span className="tag q">{p.regiment}</span>
          </span>
          <span className="s" style={{ fontWeight: 600, color: 'var(--ink)' }}>{fmt(p)}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="note">Nobody clears the minimum yet.</p>}
    </div>
  );
}

/** A run of counts as bars against the largest. One ink, ordered by size. */
function Bars({ data }: { data: [string, number][] }) {
  const max = data.reduce((m, [, v]) => Math.max(m, v), 0);
  const total = data.reduce((s, [, v]) => s + v, 0);
  if (max === 0) return <p className="note">No data.</p>;
  return (
    <div>
      {data.map(([label, n]) => (
        <div key={label} className="bteam" style={{ padding: '4px 0', gap: 10 }}>
          <span style={{ color: 'var(--ink-2)', minWidth: 108 }}>{label}</span>
          <span style={{ flex: 1, height: 7, background: 'var(--sunken)', display: 'block' }}>
            <i style={{ display: 'block', height: '100%', width: `${(n / max) * 100}%`, background: 'var(--ink-3)' }} />
          </span>
          <span className="s" style={{ color: 'var(--ink)', minWidth: 42, textAlign: 'right' }}>{n}</span>
          <span className="s" style={{ minWidth: 34, textAlign: 'right' }}>{pc(n, total)}%</span>
        </div>
      ))}
    </div>
  );
}

export function StatsOverview({
  o,
  players,
  rounds,
  combat,
  hasData,
  scopeName,
  roundsPlayed,
  onOpenRound,
  onOpenPlayer,
  readOnly = false,
}: {
  o: Overview;
  players: PlayerStatRow[];
  rounds: RoundSummary[];
  combat: ReturnType<typeof computeCombatTotals>;
  hasData: boolean;
  /** Season or event this covers — the panel's meta line. */
  scopeName: string;
  /** Rounds the tracker has scheduled, so imports read as a share of them. */
  roundsPlayed?: number;
  /** On the public site there is no Import screen to point an empty page at. */
  readOnly?: boolean;
  onOpenRound?: (filename: string) => void;
  onOpenPlayer?: (key: string) => void;
}) {
  if (!hasData) {
    return (
      <div className="panel">
        <header className="ph"><h2>Imported stats</h2><span className="rule" /><span className="meta">{scopeName}</span></header>
        <div className="pb">
          <p className="note">
            {readOnly
              ? 'No rounds have been imported for this event yet. When they are, every figure on this page fills in from them.'
              : 'Nothing imported yet. Drop scoreboard files on the Import screen and every figure on this page fills in from them.'}
          </p>
        </div>
      </div>
    );
  }

  const kpis: [string, string | number, string][] = [
    ['Rounds imported', o.totalRounds, roundsPlayed != null ? `of ${roundsPlayed} played` : 'scoreboards on file'],
    ['USA wins', o.usaWins, `${pc(o.usaWins, o.totalRounds)}% of rounds`],
    ['CSA wins', o.csaWins, `${pc(o.csaWins, o.totalRounds)}%${o.draws ? ` · ${o.draws} drawn` : ''}`],
    ['Players', o.distinctPlayers, 'unique by steam id'],
    ['Units seen', o.distinctRegiments, 'matched to the registry'],
    ['Kills', o.totalKills.toLocaleString(), 'from the killfeed'],
  ];

  const byK = [...players].sort((a, b) => b.kills - a.kills).slice(0, 5);
  const byKd = players
    .filter((p) => p.rounds >= KD_MIN_ROUNDS)
    .sort((a, b) => b.kd - a.kd)
    .slice(0, 5);
  const byTd = players
    .filter((p) => p.deaths >= TD_MIN_DEATHS && p.avgTd != null)
    .sort((a, b) => a.avgTd! - b.avgTd!)
    .slice(0, 5);

  /** Non-zero counts, largest first, keys passed through `label`. */
  const ranked = (counts: Record<string, number>, label = (k: string) => k): [string, number][] =>
    Object.entries(counts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [label(k), v]);
  const stanceFor = (team: Team): [string, number][] => {
    const c = combat.casualties[team];
    return [
      [`${FORMATION_LABEL.in_form} · ${TICKET_WEIGHT.in_form} tkt`, c.inForm],
      [`${FORMATION_LABEL.skirm} · ${TICKET_WEIGHT.skirm} tkt`, c.skirm],
      [`${FORMATION_LABEL.oob} · ${TICKET_WEIGHT.oob} tkt`, c.oob],
    ];
  };

  return (
    <>
      <div className="panel">
        <header className="ph"><h2>Imported stats</h2><span className="rule" /><span className="meta">{scopeName}</span></header>
        <div className="pb flush">
          <div className="kpis">
            {kpis.map(([h, v, x]) => (
              <div className="kpi" key={h}>
                <div className="cap">{h}</div>
                <div className="v">{v}</div>
                <div className="h">{x}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <header className="ph">
          <h2>Leaders</h2><span className="rule" />
          <span className="meta">minimum rounds applied where it matters</span>
        </header>
        <div className="pb flush">
          <div className="cols">
            <Leaders title="Most kills" rows={byK} fmt={(p) => String(p.kills)} onOpenPlayer={onOpenPlayer} />
            <Leaders
              title={`Best K/D · ${KD_MIN_ROUNDS}+ rounds`}
              rows={byKd}
              fmt={(p) => p.kd.toFixed(2)}
              onOpenPlayer={onOpenPlayer}
            />
            <Leaders
              title={`Cheapest deaths · ${TD_MIN_DEATHS}+`}
              rows={byTd}
              fmt={(p) => p.avgTd!.toFixed(1)}
              onOpenPlayer={onOpenPlayer}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <header className="ph">
          <h2>Latest rounds</h2><span className="rule" />
          <span className="meta">click through to the matchup</span>
        </header>
        <div className="pb flush scroll-x">
          <table>
            <thead>
              <tr>
                <th>When</th><th>Map</th><th>Winner</th>
                <th className="num">USA cas</th><th className="num">CSA cas</th>
                <th className="num">Men</th><th className="num">Length</th>
              </tr>
            </thead>
            <tbody>
              {rounds.slice(0, 6).map((r) => (
                <tr key={r.sourceFilename} className="click" onClick={() => onOpenRound?.(r.sourceFilename)}>
                  <td style={{ color: 'var(--ink-3)' }}>{when(r.recordedAt)}</td>
                  <td className="wor-name">
                    {r.map}
                    {r.area && <span style={{ color: 'var(--ink-3)' }}> · {r.area}</span>}
                  </td>
                  <td>{r.winner ? <span className={`tag ${r.winner.toLowerCase()}`}>{r.winner}</span> : <span className="tag q">draw</span>}</td>
                  <td className="num">{r.usaCasualties}</td>
                  <td className="num">{r.csaCasualties}</td>
                  <td className="num" style={{ color: 'var(--ink-3)' }}>{r.popPeak ?? r.players}</td>
                  <td className="num" style={{ color: 'var(--ink-3)' }}>{dur(r.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <header className="ph">
          <h2>What killed them</h2><span className="rule" />
          <span className="meta">
            {(combat.casualties.USA.total + combat.casualties.CSA.total).toLocaleString()} men lost
          </span>
        </header>
        <div className="pb flush">
          <div className="cols">
            {(['USA', 'CSA'] as Team[]).map((t) => (
              <div className="col" key={t}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className={`tag ${t.toLowerCase()}`}>{t}</span>
                  <span className="rule" />
                  <span className="meta">{combat.casualties[t].total.toLocaleString()} total</span>
                </div>
                <Bars data={ranked(combat.deathsByWeapon[t], weaponLabel)} />
                <div className="cap" style={{ margin: '13px 0 5px' }}>By stance</div>
                <Bars data={stanceFor(t)} />
                <div className="cap" style={{ margin: '13px 0 5px' }}>Tickets lost by cause</div>
                <Bars data={ranked(combat.ticketsLostByCause[t], causeLabel)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
