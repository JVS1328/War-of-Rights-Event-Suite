/**
 * Season → Overview, Standings and Schedule, built to the prototype's spec in
 * docs/design/season-tracker-overhaul (V.dash, V.standings, V.schedule).
 *
 * These take plain data and return ledger markup. The tracker owns the state;
 * these own how a season reads.
 */
import type { ReactNode } from 'react';

export interface StandingRow {
  unit: string;
  pos: number;
  division: string | null;
  points: number;
  /** Of those points, the ones earned for balancing onto the other side. */
  balancePoints: number;
  leadWins: number;
  leadLosses: number;
  assistWins: number;
  assistLosses: number;
  /** Total rounds won and lost — lead plus assist. */
  w: number;
  l: number;
  /** Win rate as a whole percentage. */
  wr: number;
}

export interface NightRow {
  index: number;
  n: number;
  name: string;
  /** Round one's leads, or the night's single pair. */
  leadA: string | null;
  leadB: string | null;
  /** Round two's, when a split-lead night runs a second matchup. */
  leadA2?: string | null;
  leadB2?: string | null;
  map1: string | null;
  map2: string | null;
  sidesA: number;
  sidesB: number;
  r1: 'A' | 'B' | null;
  r2: 'A' | 'B' | null;
  played: boolean;
  playoffs: boolean;
}

export interface PointSystemView {
  winLead: number;
  winAssist: number;
  lossAssist: number;
  bonus2_0Assist: number;
}

const Panel = ({
  title,
  meta,
  flush = false,
  ctl,
  children,
}: {
  title: string;
  meta?: ReactNode;
  flush?: boolean;
  ctl?: ReactNode;
  children: ReactNode;
}) => (
  <div className="panel">
    <header className="ph">
      <h2>{title}</h2>
      <span className="rule" />
      {meta && <span className="meta">{meta}</span>}
    </header>
    {ctl}
    <div className={flush ? 'pb flush scroll-x' : 'pb'}>{children}</div>
  </div>
);

const Kpi = ({ head, value, hint }: { head: string; value: ReactNode; hint: ReactNode }) => (
  <div className="kpi">
    <div className="cap">{head}</div>
    <div className="v">{value}</div>
    <div className="h">{hint}</div>
  </div>
);

/**
 * A night's matchup. Playoff and single-round-lead nights can run a different
 * pair each round, so both are named — one line only when the night runs the
 * same matchup twice.
 */
function Leads({ w }: { w: NightRow }) {
  const vs = (a: string | null, b: string | null) => (
    <>{a ?? '—'} <span style={{ color: 'var(--ink-3)' }}>vs</span> {b ?? '—'}</>
  );
  if (!w.leadA2 && !w.leadB2) return vs(w.leadA, w.leadB);
  return (
    <>
      <div><span className="cap" style={{ marginRight: 5 }}>R1</span>{vs(w.leadA, w.leadB)}</div>
      <div><span className="cap" style={{ marginRight: 5 }}>R2</span>{vs(w.leadA2 ?? null, w.leadB2 ?? null)}</div>
    </>
  );
}

/** Result of a night, as the prototype puts it: a 2–0 tag or a split. */
function NightResult({ r1, r2, played }: { r1: 'A' | 'B' | null; r2: 'A' | 'B' | null; played: boolean }) {
  if (!played) return <span style={{ color: 'var(--ink-3)' }}>not played</span>;
  if (r1 && r1 === r2) {
    return <span className={`tag ${r1 === 'A' ? 'usa' : 'csa'}`}>2–0 Team {r1}</span>;
  }
  return <span className="tag q">1–1 split</span>;
}

// ── Overview ────────────────────────────────────────────────────────────────

export function SeasonOverview({
  eventName,
  seasonName,
  kpis,
  standings,
  nights,
  pointSystem,
  onOpenUnit,
  onOpenNight,
}: {
  eventName: string;
  seasonName: string;
  kpis: { head: string; value: ReactNode; hint: ReactNode }[];
  standings: StandingRow[];
  nights: NightRow[];
  pointSystem: PointSystemView;
  onOpenUnit?: (unit: string) => void;
  onOpenNight?: (index: number) => void;
}) {
  const top = standings.slice(0, 6);
  const recent = nights.filter((w) => w.played).slice(-5).reverse();

  return (
    <>
      <Panel title="Season at a glance" meta={`${eventName} · ${seasonName}`} flush>
        <div className="kpis">
          {kpis.map((k) => (
            <Kpi key={k.head} {...k} />
          ))}
        </div>
      </Panel>

      <Panel title="Standings" meta={`top six · ${standings.length} units`} flush>
        <table>
          <thead>
            <tr>
              <th />
              <th>Unit</th>
              <th>Division</th>
              <th className="num">Pts</th>
              <th className="num">W–L</th>
              <th className="num">Win %</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.unit} className={onOpenUnit ? 'click' : undefined} onClick={() => onOpenUnit?.(r.unit)}>
                <td><span className={`pos${r.pos <= 4 ? ' q' : ''}`}>{r.pos}</span></td>
                <td className="wor-name">{r.unit}</td>
                <td>{r.division && <span className="tag q">{r.division}</span>}</td>
                <td className="num" style={{ fontWeight: 600 }}>{r.points}</td>
                <td className="num">{r.w}–{r.l}</td>
                <td className="num" style={{ color: 'var(--ink-3)' }}>{r.wr}%</td>
              </tr>
            ))}
            {top.length === 0 && (
              <tr><td colSpan={6} style={{ color: 'var(--ink-3)' }}>No units yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>
                {pointSystem.winLead} lead win · {pointSystem.winAssist} assist win ·{' '}
                {pointSystem.lossAssist} assist loss · {pointSystem.bonus2_0Assist} sweep
              </td>
            </tr>
          </tfoot>
        </table>
      </Panel>

      <Panel title="Recent nights" meta="last five" flush>
        <table>
          <thead>
            <tr>
              <th>Night</th>
              <th>Leads</th>
              <th />
              <th className="num">R1 / R2</th>
              <th className="num">Result</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((w) => (
              <tr key={w.index} className={onOpenNight ? 'click' : undefined} onClick={() => onOpenNight?.(w.index)}>
                <td style={{ color: 'var(--ink-3)' }}>W{w.n}</td>
                <td className="wor-name"><Leads w={w} /></td>
                <td>{w.playoffs && <span className="tag q">Playoff</span>}</td>
                <td className="num">
                  {w.r1 === 'A' ? '1' : '0'}–{w.r1 === 'B' ? '1' : '0'} / {w.r2 === 'A' ? '1' : '0'}–
                  {w.r2 === 'B' ? '1' : '0'}
                </td>
                <td className="num"><NightResult r1={w.r1} r2={w.r2} played={w.played} /></td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--ink-3)' }}>No nights played yet.</td></tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

// ── Standings ───────────────────────────────────────────────────────────────

export function StandingsScreen({
  standings,
  divisions,
  onOpenUnit,
}: {
  standings: StandingRow[];
  divisions: { name: string }[];
  onOpenUnit?: (unit: string) => void;
}) {
  // Seasons that do not award balance points would only get a column of zeroes.
  const showBalance = standings.some((r) => r.balancePoints !== 0);

  return (
    <>
      {divisions.length > 0 && (
        <Panel title="By division" meta="top two qualify" flush>
          <div className="cols">
            {divisions.map((dv) => {
              const rows = standings.filter((r) => r.division === dv.name);
              return (
                <div className="col" key={dv.name}>
                  <div className="cap" style={{ marginBottom: 7 }}>{dv.name} division</div>
                  <table>
                    <thead>
                      <tr><th /><th>Unit</th><th className="num">Pts</th><th className="num">W–L</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.unit} className={onOpenUnit ? 'click' : undefined} onClick={() => onOpenUnit?.(r.unit)}>
                          <td><span className={`pos${i < 2 ? ' q' : ''}`}>{i + 1}</span></td>
                          <td className="wor-name">{r.unit}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{r.points}</td>
                          <td className="num">{r.w}–{r.l}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td colSpan={4} style={{ color: 'var(--ink-3)' }}>Nobody in this division.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel
        title="Full table"
        meta={`lead and assist records split out${showBalance ? ' · Bal is points earned for balancing' : ''}`}
        flush
      >
        <table>
          <thead>
            <tr>
              <th /><th>Unit</th><th>Div</th>
              <th className="num">Pts</th>
              {showBalance && <th className="num">Bal</th>}
              <th className="num">Lead W–L</th>
              <th className="num">Assist W–L</th>
              <th className="num">Total</th>
              <th className="num">Win %</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((r) => (
              <tr key={r.unit} className={onOpenUnit ? 'click' : undefined} onClick={() => onOpenUnit?.(r.unit)}>
                <td><span className={`pos${r.pos <= 4 ? ' q' : ''}`}>{r.pos}</span></td>
                <td className="wor-name">{r.unit}</td>
                <td>{r.division && <span className="tag q">{r.division}</span>}</td>
                <td className="num" style={{ fontWeight: 600 }}>{r.points}</td>
                {showBalance && (
                  <td className="num" style={{ color: 'var(--ink-3)' }}>{r.balancePoints}</td>
                )}
                <td className="num">{r.leadWins}–{r.leadLosses}</td>
                <td className="num">{r.assistWins}–{r.assistLosses}</td>
                <td className="num">{r.w}–{r.l}</td>
                <td className="num">
                  <span
                    style={{
                      display: 'inline-block', width: 46, height: 5, background: 'var(--sunken)',
                      verticalAlign: 'middle', marginRight: 6,
                    }}
                  >
                    <i style={{ display: 'block', height: '100%', width: `${r.wr}%`, background: 'var(--ink)' }} />
                  </span>
                  {r.wr}%
                </td>
              </tr>
            ))}
            {standings.length === 0 && (
              <tr><td colSpan={showBalance ? 9 : 8} style={{ color: 'var(--ink-3)' }}>No units yet.</td></tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

// ── Schedule ────────────────────────────────────────────────────────────────

export function ScheduleScreen({
  nights,
  onOpenNight,
  onEditNight,
  onNewNight,
  onGenerate,
  onDeleteNight,
  readOnly = false,
}: {
  nights: NightRow[];
  /**
   * The public site's fixture list: the same rows, with nothing on them that
   * would change the season — no new night, no generate, no edit or remove.
   */
  readOnly?: boolean;
  /** A played night opens its matchup. */
  onOpenNight?: (index: number) => void;
  /** An unplayed one, and the Edit button, open the builder. */
  onEditNight?: (index: number) => void;
  onNewNight?: () => void;
  onGenerate?: () => void;
  /** Remove the night from the season. Confirms at the call site. */
  onDeleteNight?: (index: number) => void;
}) {
  return (
    <div className="panel">
      <header className="ph">
        <h2>Schedule</h2>
        <span className="rule" />
        <span className="meta">{nights.length} night{nights.length === 1 ? '' : 's'}</span>
      </header>
      {!readOnly && (
        <div className="ctl">
          <button className="gh" onClick={onNewNight}>＋ New night</button>
          <button className="gh" onClick={onGenerate}>Generate a season</button>
          <span className="rule" />
          <span className="meta">a played night opens its matchup · Edit opens the builder</span>
        </div>
      )}
      <div className="pb flush scroll-x">
        <table>
          <thead>
            <tr>
              <th /><th>Night</th><th>Leads</th>
              <th>Round 1 map</th><th>Round 2 map</th>
              <th className="num">Sides</th><th>Result</th>{!readOnly && <th className="num" />}
            </tr>
          </thead>
          <tbody>
            {nights.map((w) => (
              <tr
                key={w.index}
                className={readOnly ? undefined : 'click'}
                onClick={readOnly ? undefined : () => (w.played ? onOpenNight?.(w.index) : onEditNight?.(w.index))}
              >
                <td style={{ color: 'var(--ink-3)' }}>{w.playoffs ? 'PO' : `W${w.n}`}</td>
                <td className="wor-name">{w.name}</td>
                <td className="wor-name"><Leads w={w} /></td>
                <td style={{ color: 'var(--ink-2)' }}>{w.map1 ?? '—'}</td>
                <td style={{ color: 'var(--ink-2)' }}>{w.map2 ?? '—'}</td>
                <td className="num">{w.sidesA}v{w.sidesB}</td>
                <td><NightResult r1={w.r1} r2={w.r2} played={w.played} /></td>
                {!readOnly && (
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="gh"
                      onClick={(e) => { e.stopPropagation(); onEditNight?.(w.index); }}
                    >
                      Edit
                    </button>
                    {onDeleteNight && (
                      <button
                        className="gh c-danger"
                        style={{ marginLeft: 5 }}
                        onClick={(e) => { e.stopPropagation(); onDeleteNight(w.index); }}
                        title={`Remove ${w.name} from the season`}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {nights.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 7 : 8} style={{ color: 'var(--ink-3)' }}>
                  {readOnly ? 'No nights recorded for this season.' : 'No nights yet — add one above.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
