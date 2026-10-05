import { useMemo, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { EmptyHint, Picker, Pill } from '../ui';
import type { PlayerDetail, PlayerRoundRow, PlayerStatRow, PlayerType } from '../../stats/statsEngine';
import { splitPlayerRounds, SPLIT_LABELS } from '../../stats/playerSplits';
import { StanceBar } from '../ui/StanceBar';
import { Cell, CauseTable, kdStr, whenOf, teamTone, roleLine } from './drawerPrimitives';
import { formatAvgT, FORMATION_SHORT, AVG_TD_LABEL, AVG_TK_LABEL } from '../../stats/labels';
import { LevelBadge } from '../../replay/LevelBadge';

const ord = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

/**
 * One headline figure with where it sits in the field. The bar under it is the
 * percentile, not the value — a K/D of 2.4 means nothing until you know whether
 * that is 3rd of 200 or 3rd of 4.
 */
function Ranked({
  head,
  value,
  rank,
  total,
  hint,
}: {
  head: string;
  value: ReactNode;
  rank: number | null;
  total: number;
  hint: string;
}) {
  return (
    <div className="kpi">
      <div className="cap">{head}</div>
      <div className="v">{value}</div>
      <div className="h">
        {rank != null && total > 0 && (
          <><b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{ord(rank)}</b> of {total} · </>
        )}
        {hint}
      </div>
      {rank != null && total > 0 && (
        <div className="pctbar"><i style={{ width: `${(1 - (rank - 1) / total) * 100}%` }} /></div>
      )}
    </div>
  );
}

/**
 * Every round as one bar, oldest left. Height is kills, and a won round is set
 * in ink where a lost one is ghosted — so a run of form reads as a shape before
 * any number is looked at.
 */
function Form({ rounds }: { rounds: PlayerRoundRow[] }) {
  if (rounds.length === 0) return null;
  const ordered = [...rounds].sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''));
  const max = Math.max(1, ...ordered.map((r) => r.kills));
  const wins = ordered.filter((r) => r.won === true).length;
  const losses = ordered.filter((r) => r.won === false).length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <span className="cap">Form</span>
        <span className="rule" />
        <span className="cap">{wins}–{losses} across {ordered.length} rounds · most recent right</span>
      </div>
      <div className="form">
        {ordered.map((r) => (
          <i
            key={r.sourceFilename}
            className={r.won ? 'w' : undefined}
            style={{ height: Math.max(4, (r.kills / max) * 34) }}
            title={`${r.map} — ${r.kills}K ${r.deaths}D${r.won == null ? '' : r.won ? ' · won' : ' · lost'}`}
          />
        ))}
      </div>
      <div className="leg">
        <span><i style={{ background: 'var(--ink)' }} />won</span>
        <span><i style={{ background: 'var(--ink)', opacity: 0.2 }} />lost</span>
        <span>bar height = kills</span>
      </div>
    </div>
  );
}

/** Rounds most-recent first (undated rounds sort last). */
function byRecentFirst(rounds: PlayerRoundRow[]): PlayerRoundRow[] {
  return [...rounds].sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));
}

/** Compact ‹ 1/N › pager shared by the player drawer's paginated sections. */
function Pager({
  page,
  pageCount,
  offset,
  shown,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  offset: number;
  shown: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="pager">
      <span>{offset + 1}–{offset + shown} of {total}</span>
      <span className="pg">
        <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0} aria-label="Previous page">‹</button>
        <span>{page + 1}/{pageCount}</span>
        <button
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          aria-label="Next page"
        >
          ›
        </button>
      </span>
    </div>
  );
}

/** "Rounds played": every round the player fielded, as rich cards, 4 per page. */
function RoundsPlayedSection({ rounds, onOpenRound }: { rounds: PlayerRoundRow[]; onOpenRound: (filename: string) => void }) {
  const PAGE = 4;
  const [page, setPage] = useState(0);
  const ordered = useMemo(() => byRecentFirst(rounds), [rounds]);
  if (ordered.length === 0) return null;
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE));
  const current = Math.min(page, pageCount - 1);
  const offset = current * PAGE;
  const pageRows = ordered.slice(offset, offset + PAGE);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <span className="cap">Rounds played</span>
        <span className="rule" />
        <span className="cap">{ordered.length} total</span>
      </div>
      <div className="mapgrid">
        {pageRows.map((r) => (
          <RecentRoundCard key={r.sourceFilename} r={r} onOpen={() => onOpenRound(r.sourceFilename)} />
        ))}
      </div>
      <Pager page={current} pageCount={pageCount} offset={offset} shown={pageRows.length} total={ordered.length} onPage={setPage} />
    </div>
  );
}

/**
 * Compact inline "cause → count" line for a single round (killed with / died to),
 * styled to match the card's formation breakdown. Rendered with spans instead of
 * the tabular {@link CauseTable} because the card is a <button>, which may not
 * contain a <table>. Falls back to an em dash when the killfeed has no rows.
 */
function RoundCauseLine({ label, data }: { label: string; data: Record<string, number> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <span className="cap">{label} </span>
      {rows.length === 0 ? (
        <span style={{ color: 'var(--ink-3)' }}>—</span>
      ) : (
        rows.map(([cause, count], i) => (
          <span key={cause}>
            {i > 0 ? ' · ' : ''}
            <span style={{ textTransform: 'capitalize', color: 'var(--ink-2)' }}>{cause}</span>{' '}
            <span style={{ color: 'var(--ink)' }}>{count}</span>
          </span>
        ))
      )}
    </div>
  );
}

/** Rich per-round card: in-game role + the player's full stats for that round. */
function RecentRoundCard({ r, onOpen }: { r: PlayerRoundRow; onOpen: () => void }) {
  const role = roleLine(r);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mapcard"
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="wor-name" style={{ fontSize: 13 }}>
          {r.map}
          {r.area ? <span style={{ color: 'var(--ink-3)' }}> · {r.area}</span> : ''}
        </span>
        <span className="rule" />
        <Pill tone={teamTone(r.team)}>{r.team}</Pill>
      </div>
      <div className="cap" style={{ marginTop: 3 }}>{whenOf(r.recordedAt)}</div>
      <div className="note" style={{ marginTop: 5, color: 'var(--ink-2)' }}>
        {role || <span style={{ color: 'var(--ink-3)' }}>no roster info</span>}
      </div>
      <div className="kpis" style={{ marginTop: 9, border: '1px solid var(--line)' }}>
        <Cell label="Kills" value={r.kills} />
        <Cell label="Deaths" value={r.deaths} />
        <Cell label="K/D" value={kdStr(r.kills, r.deaths)} />
        <Cell label="×Td" value={formatAvgT(r.avgTd)} title={AVG_TD_LABEL} />
        <Cell label="×Tk" value={formatAvgT(r.avgTk)} title={AVG_TK_LABEL} />
      </div>
      <dl className="mapdl">
        <dt>Deaths</dt>
        <dd>
          {r.deathsInForm} {FORMATION_SHORT.in_form} · {r.deathsSkirm} {FORMATION_SHORT.skirm} ·{' '}
          {r.deathsOob} {FORMATION_SHORT.oob}
        </dd>
        <dt>Kills</dt>
        <dd>
          {r.killsInForm} {FORMATION_SHORT.in_form} · {r.killsSkirm} {FORMATION_SHORT.skirm} ·{' '}
          {r.killsOob} {FORMATION_SHORT.oob}
        </dd>
      </dl>
      <div className="note" style={{ marginTop: 7 }}>
        <RoundCauseLine label="killed with" data={r.killsByCause} />
        <RoundCauseLine label="died to" data={r.deathsByCause} />
      </div>
    </button>
  );
}

/** Compact per-round table (every round, dense), paginated. */
function PerRoundTable({ rounds, onOpenRound }: { rounds: PlayerRoundRow[]; onOpenRound: (filename: string) => void }) {
  const PAGE = 12;
  const [page, setPage] = useState(0);
  const ordered = useMemo(() => byRecentFirst(rounds), [rounds]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE));
  const current = Math.min(page, pageCount - 1);
  const offset = current * PAGE;
  const pageRows = ordered.slice(offset, offset + PAGE);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <span className="cap">Per round</span>
        <span className="rule" />
        <span className="cap">click a round for its scoreboard</span>
      </div>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Map · Area</th>
              <th className="num">K</th>
              <th className="num">D</th>
              <th className="num">K/D</th>
              <th className="num" title="In Formation / Skirmish / Out of Line deaths">
                {FORMATION_SHORT.in_form}/{FORMATION_SHORT.skirm}/{FORMATION_SHORT.oob}
              </th>
              <th className="num" title={AVG_TD_LABEL}>×Td</th>
              <th className="num" title={AVG_TK_LABEL}>×Tk</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={`${r.sourceFilename}-${offset + i}`} className="click" onClick={() => onOpenRound(r.sourceFilename)}>
                <td style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{whenOf(r.recordedAt)}</td>
                <td className="wor-name">
                  {r.map}
                  {r.area ? <span style={{ color: 'var(--ink-3)' }}> · {r.area}</span> : ''}
                </td>
                <td className="num">{r.kills}</td>
                <td className="num" style={{ color: 'var(--ink-2)' }}>{r.deaths}</td>
                <td className="num">{kdStr(r.kills, r.deaths)}</td>
                <td className="num" style={{ color: 'var(--ink-2)' }}>
                  {r.deathsInForm}/{r.deathsSkirm}/{r.deathsOob}
                </td>
                <td className="num" style={{ color: 'var(--ink-2)' }}>{formatAvgT(r.avgTd)}</td>
                <td className="num" style={{ color: 'var(--ink-2)' }}>{formatAvgT(r.avgTk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={current} pageCount={pageCount} offset={offset} shown={pageRows.length} total={ordered.length} onPage={setPage} />
    </div>
  );
}

// The round screen lives in its own tabbed module; re-exported here so the one
// import site stays a single line.
export { RoundScreen } from './scoreboard/RoundScreen';

/**
 * The same four context slices units get, for a player: a good K/D means
 * something different if it was all earned defending.
 *
 * Collapsed by default — this is the second question about a player, not the
 * first — and a slice with no rounds is left out rather than shown at zero.
 */
function SplitsSection({ rounds }: { rounds: PlayerRoundRow[] }) {
  const splits = useMemo(() => splitPlayerRounds(rounds), [rounds]);
  const shown = SPLIT_LABELS.map(({ key, label }) => ({ label, slice: splits[key] })).filter(
    (s) => s.slice.rounds > 0,
  );
  if (shown.length === 0) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <span className="cap">Splits</span>
        <span className="rule" />
        <span className="cap">the same breakdowns, sliced by context</span>
      </div>
      {shown.map(({ label, slice }) => (
        <details key={label} className="panel" style={{ marginBottom: 9 }}>
          <summary className="ph area-h" style={{ listStyle: 'none' }}>
            <h2>{label}</h2>
            <span className="rule" />
            <span className="meta">
              {slice.rounds}rd · {slice.kills}K/{slice.deaths}D · {slice.kd.toFixed(2)} K/D ·{' '}
              <span title={AVG_TD_LABEL}>×Td {formatAvgT(slice.avgTd)}</span> ·{' '}
              <span title={AVG_TK_LABEL}>×Tk {formatAvgT(slice.avgTk)}</span>
            </span>
          </summary>
          <div className="pb">
            <div className="cols">
              <div className="col"><StanceBar counts={slice.casualtiesByFormation} label="Where they were caught" /></div>
              <div className="col"><StanceBar counts={slice.killsByFormation} label="Where their victims were caught" /></div>
            </div>
            <div className="cols" style={{ marginTop: 13 }}>
              <div className="col"><CauseTable title="Killed with" data={slice.killsByCause} /></div>
              <div className="col"><CauseTable title="Died to" data={slice.casualtiesByCause} /></div>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

/** Arm filters, mirroring the leaderboard so the two never disagree. */
const ARM_LABELS: { key: PlayerType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'inf', label: 'Infantry' },
  { key: 'cav', label: 'Cavalry' },
  { key: 'arty', label: 'Artillery' },
];

export function PlayerScreen({
  detail,
  onOpenRound,
  onOpenUnit,
  onPickPlayer,
  onCompare,
  type,
  onType,
  field = [],
}: {
  detail: PlayerDetail | null;
  onOpenRound: (filename: string) => void;
  /** Jump to the card for the unit this player is scored under. */
  onOpenUnit?: (unit: string) => void;
  onPickPlayer?: (key: string) => void;
  onCompare?: (key: string) => void;
  type: PlayerType;
  onType: (t: PlayerType) => void;
  /** The leaderboard this player sits in, so each figure can carry its rank. */
  field?: PlayerStatRow[];
}) {
  // Ranked ascending for the two figures where less is better: a cheap death
  // and a low death count are good, and ranking them high-first would put the
  // worst player at the top of the bar.
  const LOWER_IS_BETTER = new Set(['deaths', 'avgTd']);
  const fieldSize = field.length;
  const rankOf = (k: 'kills' | 'deaths' | 'kd' | 'rounds' | 'avgTd' | 'avgTk'): number | null => {
    if (!detail || fieldSize === 0) return null;
    const low = LOWER_IS_BETTER.has(k);
    const val = (p: PlayerStatRow) => (p[k] ?? (low ? Infinity : -1)) as number;
    const sorted = [...field].sort((a, b) => (low ? val(a) - val(b) : val(b) - val(a)));
    const i = sorted.findIndex((p) => p.key === detail.key);
    return i < 0 ? null : i + 1;
  };
  // Alphabetical, because this is a name you are looking for rather than a
  // ranking you are reading — the leaderboard is where rank order belongs.
  const roster = [...field].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="panel">
        <div className="ctl">
          <span className="cap">Player</span>
          <Picker
            label="Player"
            width={300}
            value={detail?.key ?? null}
            options={roster.map((p) => ({ value: p.key, label: p.name, hint: p.regiment }))}
            onChange={(k) => onPickPlayer?.(k)}
            placeholder="name or unit"
            emptyText="no players imported"
          />
          {detail && onCompare && (
            <button className="gh" onClick={() => onCompare(detail.key)}>Compare</button>
          )}
          <span className="rule" />
          <span className="meta">{detail?.steamId ?? 'no steam id'}</span>
        </div>
      </div>

      <div className="panel">
        <header className="ph">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="mid wor-name">{detail?.name ?? 'Player'}</div>
              <LevelBadge level={detail?.level} size={30} />
            </div>
            {detail && (
              <div className="cap" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
                {onOpenUnit ? (
                  <button className="tag q" onClick={() => onOpenUnit(detail.regiment)}>{detail.regiment}</button>
                ) : (
                  <span className="tag q">{detail.regiment}</span>
                )}
                <span>{detail.isArtillery ? 'Artillery' : 'Infantry'}</span>
                <span>{detail.rounds} round{detail.rounds === 1 ? '' : 's'}</span>
              </div>
            )}
          </div>
          <span className="rule" />
        </header>
      <div className="ctl">
        <span className="cap">Branch</span>
        <div className="seg" role="group" aria-label="Arm of service">
          {ARM_LABELS.map(({ key, label }) => (
            <button key={key} onClick={() => onType(key)} aria-pressed={type === key}>{label}</button>
          ))}
        </div>
        <span className="rule" />
        <span className="meta">from the in-game regiment</span>
      </div>
      {!detail ? (
        <EmptyHint>
          {type === 'all' ? 'No data' : `No ${ARM_LABELS.find((a) => a.key === type)?.label.toLowerCase()} rounds for this player`}
        </EmptyHint>
      ) : (
        <div className="pb">
          {detail.steamId && (
            <a
              href={`https://steamcommunity.com/profiles/${detail.steamId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="gh"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 11 }}
              title="Open Steam profile in a new tab"
            >
              <ExternalLink size={11} /> Steam profile
            </a>
          )}

          {detail.aliases.length > 0 && (
            <p className="note" style={{ marginBottom: 11 }}>
              also known as: {detail.aliases.slice(0, 4).join(', ')}
              {detail.aliases.length > 4 && ' …'}
            </p>
          )}

          <div className="kpis" style={{ border: '1px solid var(--line)' }}>
            <Ranked head="Kills" value={detail.kills} rank={rankOf('kills')} total={fieldSize}
                    hint={`${(detail.kills / Math.max(1, detail.rounds)).toFixed(1)} per round`} />
            <Ranked head="Deaths" value={detail.deaths} rank={rankOf('deaths')} total={fieldSize}
                    hint={`${(detail.deaths / Math.max(1, detail.rounds)).toFixed(1)} per round`} />
            <Ranked head="K/D" value={detail.kd.toFixed(2)} rank={rankOf('kd')} total={fieldSize}
                    hint="kills ÷ deaths" />
            <Ranked head="Rounds" value={detail.rounds} rank={rankOf('rounds')} total={fieldSize}
                    hint="scoreboards they appear on" />
            <Ranked head="Cost per death" value={formatAvgT(detail.avgTd)} rank={rankOf('avgTd')} total={fieldSize}
                    hint="tickets · ×Td · lower is better" />
            <Ranked head="Value per kill" value={formatAvgT(detail.avgTk)} rank={rankOf('avgTk')} total={fieldSize}
                    hint="tickets · ×Tk" />
          </div>

          <div style={{ marginTop: 18 }}><Form rounds={detail.perRound} /></div>

          <div className="cols" style={{ marginTop: 18 }}>
            <div className="col">
              <StanceBar
                counts={{ in_form: detail.deathsInForm, skirm: detail.deathsSkirm, oob: detail.deathsOob }}
                label="Deaths by stance"
              />
            </div>
            <div className="col">
              <StanceBar
                counts={{ in_form: detail.killsInForm, skirm: detail.killsSkirm, oob: detail.killsOob }}
                label="Kills by victim stance"
              />
            </div>
          </div>

          <div className="cols" style={{ marginTop: 18 }}>
            <div className="col"><CauseTable title="Killed with" data={detail.killsByCause} /></div>
            <div className="col"><CauseTable title="Died to" data={detail.deathsByCause} /></div>
          </div>

          <div style={{ marginTop: 18 }}><SplitsSection rounds={detail.perRound} /></div>

          {detail.perRound.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <RoundsPlayedSection key={`rp-${detail.key}-${type}`} rounds={detail.perRound} onOpenRound={onOpenRound} />
            </div>
          )}

          {detail.perRound.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <PerRoundTable key={`pr-${detail.key}-${type}`} rounds={detail.perRound} onOpenRound={onOpenRound} />
            </div>
          )}
        </div>
      )}
      </div>
    </>
  );
}
