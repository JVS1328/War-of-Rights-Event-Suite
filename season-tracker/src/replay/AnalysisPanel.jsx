// The replay viewer's Analysis panel: how the round went, from roundAnalysis.js.
// Everything here is drawing; the numbers come in on `analysis`.
import { useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

const TABS = [
  ['win', 'Win chance'], ['ground', 'This ground'], ['companies', 'Companies'], ['flags', 'Flags'], ['distance', 'Distance'],
];
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');
const yd = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} yd` : '—');

/**
 * @param {{ analysis: any, model: any, now: number, onSeek: (t: number) => void,
 *   onPickPlayer: (name: string) => void, teamNames: any, teamUi: any, formatTime: (s: number) => string }} props
 */
export default function AnalysisPanel({ analysis, model, now, onSeek, onPickPlayer, teamNames, teamUi, formatTime }) {
  const [tab, setTab] = useState('win');
  const side = (team) => <span className="wor-name" style={{ color: teamUi[team] }}>{teamNames[team] ?? team}</span>;
  const shared = { now, onSeek, teamNames, teamUi, formatTime };
  return (
    <div className="px-2 pb-2 space-y-2">
      <div className="seg flex-wrap">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}>{label}</button>
        ))}
      </div>
      {tab === 'win' && <WinTab analysis={analysis} model={model} {...shared} />}
      {tab === 'ground' && <GroundTab analysis={analysis} {...shared} />}
      {tab === 'companies' && (
        <RankTable
          rows={analysis.companies}
          search={(r) => r.label ?? ''}
          defaultSort="men"
          columns={[
            { key: 'label', label: 'Company', render: (r) => <span className="wor-name">{r.label ?? 'Unknown company'}</span> },
            { key: 'team', label: 'Side', render: (r) => side(r.team) },
            { key: 'men', label: 'Men', num: true },
            { key: 'avgAlive', label: 'Avg alive', num: true, render: (r) => r.avgAlive.toFixed(1) },
            { key: 'kills', label: 'Kills', num: true },
            { key: 'deaths', label: 'Deaths', num: true },
            { key: 'contactPct', label: 'In contact', num: true, render: (r) => pct(r.contactPct), title: 'Share of its time with an enemy within 100 m' },
            { key: 'frontPct', label: 'At the front', num: true, render: (r) => pct(r.frontPct), title: 'Share of its time in the front third of its side' },
            { key: 'medianEnemyYd', label: 'To enemy', num: true, render: (r) => yd(r.medianEnemyYd), title: 'Typical distance to the nearest enemy' },
            { key: 'gainedYd', label: 'Ground', num: true, render: (r) => yd(r.gainedYd), title: 'Ground gained toward the enemy spawn, first sighting to last' },
          ]}
          note="Descriptive, not a rating: who stood where, not whether it was right."
        />
      )}
      {tab === 'flags' && (
        <RankTable
          rows={analysis.flags}
          search={(r) => r.name}
          defaultSort="timeS"
          onRow={(r) => onPickPlayer(r.name)}
          columns={[
            { key: 'name', label: 'Bearer', render: (r) => <span className="wor-name">{r.name}</span> },
            { key: 'team', label: 'Side', render: (r) => side(r.team) },
            { key: 'timeS', label: 'On the flag', num: true, render: (r) => formatTime(r.timeS) },
            { key: 'holds', label: 'Times held', num: true },
            { key: 'longestS', label: 'Longest', num: true, render: (r) => formatTime(r.longestS) },
            { key: 'carriedYards', label: 'Carried', num: true, render: (r) => yd(r.carriedYards) },
          ]}
          empty="Nobody carried a flag this round."
        />
      )}
      {tab === 'distance' && (
        <RankTable
          rows={analysis.distance}
          search={(r) => r.name}
          defaultSort="yards"
          onRow={(r) => onPickPlayer(r.name)}
          columns={[
            { key: 'name', label: 'Player', render: (r) => <span className="wor-name">{r.name}</span> },
            { key: 'team', label: 'Side', render: (r) => side(r.team) },
            { key: 'yards', label: 'Travelled', num: true, render: (r) => yd(r.yards) },
            { key: 'mountedYards', label: 'Mounted', num: true, render: (r) => (r.mountedYards ? yd(r.mountedYards) : '—') },
            { key: 'aliveS', label: 'Time alive', num: true, render: (r) => formatTime(r.aliveS) },
            { key: 'pace', label: 'yd / min', num: true, value: (r) => (r.aliveS > 0 ? r.yards / (r.aliveS / 60) : 0), render: (r) => (r.aliveS > 0 ? Math.round(r.yards / (r.aliveS / 60)) : '—') },
          ]}
          note="Respawns and teleports aren't counted as travel."
        />
      )}
    </div>
  );
}

// --- win chance --------------------------------------------------------------

function WinTab({ analysis, model, now, onSeek, teamNames, teamUi, formatTime }) {
  const { states, pUsa, swings } = analysis;
  if (!pUsa) {
    return (
      <p className="text-[11px] text-text-2">
        {states ? 'The win model trains itself from recorded rounds, and there aren\'t enough yet.'
                : 'Not enough of either side was recorded to read the round.'}
      </p>
    );
  }
  const i = Math.max(0, Math.min(pUsa.length - 1, Math.round(now / (states.t[1] || 5))));
  const v = model?.validation, n = model?.rounds ?? v?.rounds;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3 text-xs flex-wrap">
        <span className="font-bold tabular-nums" style={{ color: teamUi[1] }}>{teamNames[1]} {pct(pUsa[i])}</span>
        <span className="font-bold tabular-nums" style={{ color: teamUi[2] }}>{teamNames[2]} {pct(1 - pUsa[i])}</span>
        <span className="text-text-2 text-[10px]">
          at {formatTime(states.t[i])} · from losses, numbers, both fronts and their movement, the clock and who attacks
          {n > 0 && ` · trained on ${n} ${model.source || 'past'} round${n === 1 ? '' : 's'}`}
          {v && `; on ones it hadn't seen it favoured the eventual winner ${pct(v.accuracy)} of the time`}
        </span>
      </div>
      <TimeChart tMax={states.t[states.t.length - 1]} now={now} onSeek={onSeek} formatTime={formatTime}
                 marks={swings.map((s) => [s.t0, s.t1])}>
        {({ x, y }) => <WinCurve t={states.t} p={pUsa} x={x} y={y} teamUi={teamUi} />}
      </TimeChart>
      {swings.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-1 mb-0.5">Biggest swings</div>
          <div className="space-y-0.5">
            {swings.map((s) => {
              const gainer = s.p1 > s.p0 ? 1 : 2;
              return (
                <button key={s.t0} onClick={() => onSeek(s.t0)}
                        className="w-full text-left text-[11px] px-1 py-0.5 rounded hover:bg-bg-2 flex flex-wrap gap-x-2 tabular-nums">
                  <span className="text-text-2">{formatTime(s.t0)}–{formatTime(s.t1)}</span>
                  <span style={{ color: teamUi[gainer] }}>
                    {teamNames[gainer]} {pct(gainer === 1 ? s.p0 : 1 - s.p0)} → {pct(gainer === 1 ? s.p1 : 1 - s.p1)}
                  </span>
                  <span className="text-text-1">
                    losses {s.deaths[1]}–{s.deaths[2]}
                    {[1, 2].map((t) => (Number.isFinite(s.advanceYd[t]) && Math.abs(s.advanceYd[t]) >= 20
                      ? ` · ${teamNames[t]} front ${s.advanceYd[t] > 0 ? '+' : ''}${Math.round(s.advanceYd[t])} yd` : ''))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WinCurve({ t, p, x, y, teamUi }) {
  const uid = useId();
  const line = Array.from(t, (tt, i) => `${x(tt)},${y(p[i])}`).join(' ');
  const area = `${x(t[0])},${y(0.5)} ${line} ${x(t[t.length - 1])},${y(0.5)}`;
  return (
    <>
      <defs>
        <clipPath id={`${uid}a`}><rect x="0" y="0" width="100%" height={y(0.5)} /></clipPath>
        <clipPath id={`${uid}b`}><rect x="0" y={y(0.5)} width="100%" height="100%" /></clipPath>
      </defs>
      <polygon points={area} fill={teamUi[1]} opacity="0.3" clipPath={`url(#${uid}a)`} />
      <polygon points={area} fill={teamUi[2]} opacity="0.3" clipPath={`url(#${uid}b)`} />
      <line x1={x(t[0])} x2={x(t[t.length - 1])} y1={y(0.5)} y2={y(0.5)} stroke="var(--color-border)" strokeDasharray="4 4" />
      <polyline points={line} fill="none" stroke="var(--color-text-0)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </>
  );
}

// --- this ground ---------------------------------------------------------------

function GroundTab({ analysis, now, onSeek, teamNames, formatTime }) {
  const [team, setTeam] = useState(1);
  const { history, fronts } = analysis;
  if (!fronts) return <p className="text-[11px] text-text-2">Not enough of either side was recorded to read the round.</p>;
  if (!history) return <p className="text-[11px] text-text-2">No past rounds on this ground to compare with.</p>;
  const bands = history.bands[team];
  const minutes = Math.max(fronts[team].length, bands.won.length, bands.lost.length);
  // fronts run past either spawn, so the scale follows the data (never narrower than spawn to spawn)
  const all = [...fronts[team], ...[...bands.won, ...bands.lost].flatMap((q) => q ?? [])].filter(Number.isFinite);
  const yDomain = [Math.min(0, ...all) - 0.05, Math.max(1, ...all) + 0.05];
  const won = team === 1 ? history.usaWins : history.rounds - history.usaWins;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <div className="seg">
          {[1, 2].map((t) => <button key={t} onClick={() => setTeam(t)} aria-pressed={team === t}>{teamNames[t]}</button>)}
        </div>
        <span className="text-text-1">
          How far forward {teamNames[team]}'s front got, against {history.rounds} past rounds here ({won} won, {history.rounds - won} lost)
        </span>
      </div>
      <TimeChart tMax={Math.max(1, minutes - 1) * 60} now={now} onSeek={onSeek} formatTime={formatTime}
                 yDomain={yDomain} yLabels={[[1, 'enemy spawn'], [0, 'own spawn']]}>
        {({ x, y }) => (
          <>
            <Band rows={bands.lost} x={x} y={y} color="#b23b3b" />
            <Band rows={bands.won} x={x} y={y} color="#2f7d4f" />
            <polyline fill="none" stroke="var(--color-text-0)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"
                      points={fronts[team].map((v, m) => (Number.isFinite(v) ? `${x(m * 60)},${y(v)}` : null)).filter(Boolean).join(' ')} />
          </>
        )}
      </TimeChart>
      <div className="flex gap-3 text-[10px] text-text-1">
        <span><span className="inline-block w-3 h-2 align-middle mr-1" style={{ background: '#2f7d4f55' }} />rounds {teamNames[team]} won (middle half)</span>
        <span><span className="inline-block w-3 h-2 align-middle mr-1" style={{ background: '#b23b3b55' }} />rounds it lost</span>
        <span><span className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: 'var(--color-text-0)' }} />this round</span>
      </div>
    </div>
  );
}

// An interquartile band with its median, broken where too few rounds ran that long.
function Band({ rows, x, y, color }) {
  const runs = [];
  let run = [];
  rows.forEach((r, m) => { if (r) run.push([m, r]); else if (run.length) { runs.push(run); run = []; } });
  if (run.length) runs.push(run);
  return runs.map((r) => (
    <g key={r[0][0]}>
      <polygon fill={color} opacity="0.22"
               points={[...r.map(([m, q]) => `${x(m * 60)},${y(q[2])}`), ...[...r].reverse().map(([m, q]) => `${x(m * 60)},${y(q[0])}`)].join(' ')} />
      <polyline fill="none" stroke={color} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
                points={r.map(([m, q]) => `${x(m * 60)},${y(q[1])}`).join(' ')} />
    </g>
  ));
}

// --- shared chart frame: time across, 0..1 up, the playhead, click to seek ------

const CW = 1000, CH = 160;

function TimeChart({ tMax, now, onSeek, formatTime, marks = [], yDomain = [0, 1], yLabels = [[1, '100%'], [0.5, '50%'], [0, '0%']], children }) {
  const [lo, hi] = yDomain;
  const x = (t) => (Math.max(0, Math.min(tMax, t)) / (tMax || 1)) * CW;
  const y = (v) => CH - Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * CH;
  const seek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * tMax);
  };
  const ticks = useMemo(() => {
    const step = tMax > 1800 ? 600 : tMax > 600 ? 300 : 60;
    return Array.from({ length: Math.floor(tMax / step) + 1 }, (_, k) => k * step);
  }, [tMax]);
  return (
    <div className="pl-14">
      <div className="relative">
      {yLabels.map(([v, l]) => (
        <span key={l} className="absolute -left-14 w-[3.25rem] text-[9px] leading-none text-text-2 -translate-y-1/2" style={{ top: `${(y(v) / CH) * 100}%` }}>{l}</span>
      ))}
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="w-full h-28 block cursor-crosshair bg-bg-0 rounded border border-border"
           onClick={seek} role="img" aria-label="Chart over the round; click to jump there">
        {marks.map(([a, b]) => <rect key={a} x={x(a)} y="0" width={Math.max(2, x(b) - x(a))} height={CH} fill="var(--color-accent)" opacity="0.12" />)}
        {children({ x, y })}
        <line x1={x(now)} x2={x(now)} y1="0" y2={CH} stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      </div>
      <div className="relative h-3 text-[9px] text-text-2">
        {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(x(t) / CW) * 100}%` }}>{formatTime(t)}</span>)}
      </div>
    </div>
  );
}

// --- a ranking: sortable, searchable, paged ------------------------------------

const PAGE = 10;

/**
 * @param {{ rows: any[], columns: { key: string, label: string, num?: boolean, title?: string,
 *   value?: (r: any) => number, render?: (r: any) => any }[], defaultSort: string,
 *   search: (r: any) => string, onRow?: (r: any) => void, note?: string, empty?: string }} props
 */
function RankTable({ rows, columns, defaultSort, search, onRow, note, empty = 'Nothing to show.' }) {
  const [sort, setSort] = useState({ key: defaultSort, desc: true });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const valueOf = (c, r) => (c.value ? c.value(r) : r[c.key]);
  const shown = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) ?? columns[0];
    const ranked = [...rows].sort((a, b) => {
      const va = valueOf(col, a), vb = valueOf(col, b);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va ?? '').localeCompare(String(vb ?? '')) : (va ?? -Infinity) - (vb ?? -Infinity);
      return sort.desc ? -cmp : cmp;
    }).map((r, i) => ({ r, rank: i + 1 }));
    const q = query.trim().toLowerCase();
    return q ? ranked.filter(({ r }) => search(r).toLowerCase().includes(q)) : ranked;
  }, [rows, columns, sort, query, search]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  if (!rows.length) return <p className="text-[11px] text-text-2">{empty}</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-2" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search…"
                 className="w-full pl-7 pr-2 py-1 text-xs inset text-text-0 focus:outline-none focus:border-accent" />
        </div>
        <span className="text-[10px] text-text-2 tabular-nums">{shown.length} of {rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-text-1 text-left">
              <th className="px-1 font-normal">#</th>
              {columns.map((c) => (
                <th key={c.key} title={c.title} className={`px-1 font-normal whitespace-nowrap ${c.num ? 'text-right' : ''}`}>
                  <button onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}
                          className={`hover:text-text-0 ${sort.key === c.key ? 'text-accent' : ''}`}>
                    {c.label}{sort.key === c.key ? (sort.desc ? ' ▾' : ' ▴') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(at * PAGE, at * PAGE + PAGE).map(({ r, rank }) => (
              <tr key={rank} onClick={onRow ? () => onRow(r) : undefined}
                  className={`border-t border-border ${onRow ? 'cursor-pointer hover:bg-bg-2' : ''}`}>
                <td className="px-1 text-text-2">{rank}</td>
                {columns.map((c) => (
                  <td key={c.key} className={`px-1 py-0.5 ${c.num ? 'text-right whitespace-nowrap' : 'max-w-[14rem] truncate'}`}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-text-2">
        {pages > 1 && (
          <span className="flex items-center gap-1">
            <button className="gh !p-1 disabled:opacity-40" disabled={at === 0} onClick={() => setPage(at - 1)} title="Previous page"><ChevronLeft className="w-3 h-3" /></button>
            <span className="tabular-nums">{at + 1} / {pages}</span>
            <button className="gh !p-1 disabled:opacity-40" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} title="Next page"><ChevronRight className="w-3 h-3" /></button>
          </span>
        )}
        {onRow && <span>Click a row to follow them on the map.</span>}
        {note && <span>{note}</span>}
      </div>
    </div>
  );
}
