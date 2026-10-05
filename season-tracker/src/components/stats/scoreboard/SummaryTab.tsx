// Summary tab of the round drawer, read as a matchup: the result first, then
// one mirrored line per metric, then the notes those numbers support. The
// event-binding panel sits above it when binding is allowed, and the raw
// casualty and weapon tables stay underneath for anyone reading exact figures.
import { useEffect, useState } from 'react';
import { Cell, fmtDuration, whenOf } from '../drawerPrimitives';
import { computeCombatTotals, roundDurationSeconds } from '../../../stats/statsEngine';
import { Pill } from '../../ui';
import { Spine } from '../../ui/Spine';
import { Scoreline } from '../../ui/Scoreline';
import { StanceBar } from '../../ui/StanceBar';
import { matchupScore, matchupRows, matchupKeys, ticketsText } from '../../../stats/roundMatchup';
import { causeLabel, weaponLabel } from '../../../stats/labels';
import type { Scoreboard, Team } from '../../../stats/types';
import type { StoredScoreboard } from '../../../stats/StatsRepository';
import type { RoundAutofill } from '../../../stats/eventBinding';

interface WeekRef {
  id: string;
  name: string;
  round1Flipped?: boolean;
  round2Flipped?: boolean;
}

/** Share of a per-side total as a one-decimal percent, or `—` when the side has
 *  no entries (so we never render 0/0). */
function sharePct(n: number, total: number | null): string {
  if (total == null) return '';
  if (total <= 0) return '—';
  return `${((n / total) * 100).toFixed(1)}%`;
}

export function SummaryTab({
  sb,
  stored,
  canBind = false,
  weeks = [],
  buildAutofill,
  onApply,
}: {
  sb: Scoreboard;
  stored: StoredScoreboard | null;
  canBind?: boolean;
  weeks?: WeekRef[];
  buildAutofill?: (sb: Scoreboard, flipped: boolean) => RoundAutofill;
  onApply?: (weekId: string, round: 1 | 2, af: RoundAutofill) => void;
}) {
  const [weekId, setWeekId] = useState('');
  const [round, setRound] = useState<1 | 2>(1);
  useEffect(() => {
    setWeekId(stored?.binding?.weekId ?? '');
    setRound(stored?.binding?.round ?? 1);
  }, [stored?.id, stored?.binding?.weekId, stored?.binding?.round]);

  const meta = sb.meta;

  // Per-side casualty rows: total, then each stance as a share of that side's total.
  const statRow = (label: string, usa: number, csa: number, usaTotal: number | null, csaTotal: number | null) => (
    <tr key={label}>
      <td style={{ textTransform: 'capitalize' }}>{label}</td>
      <td className="num f-usa">{usa}</td>
      <td className="num" style={{ color: 'var(--ink-3)' }}>{sharePct(usa, usaTotal)}</td>
      <td className="num f-csa">{csa}</td>
      <td className="num" style={{ color: 'var(--ink-3)' }}>{sharePct(csa, csaTotal)}</td>
    </tr>
  );

  const casUsa = meta.casualties.USA;
  const casCsa = meta.casualties.CSA;

  return (
    <div>
      {canBind && buildAutofill && weeks.length > 0 && (
        <div className="pb">
          <BindPanel
            sb={sb}
            stored={stored}
            weeks={weeks}
            weekId={weekId}
            round={round}
            setWeekId={setWeekId}
            setRound={setRound}
            buildAutofill={buildAutofill}
            onApply={onApply}
          />
        </div>
      )}

      <MatchupHead sb={sb} />

      <section className="kpis" style={{ borderTop: '1px solid var(--line)' }}>
        <Cell text label="Map" value={meta.map} />
        <Cell text label="Mode" value={meta.mode} />
        <Cell text label="Area" value={meta.area ?? '—'} />
        <Cell text label="Winner" value={meta.winner ?? '—'} />
        <Cell text label="Duration" value={fmtDuration(roundDurationSeconds(sb))} />
        <Cell text label="Round ended" value={whenOf(sb.recordedAt)} />
        <Cell label="Pop @ start" value={String(meta.popRoundStart ?? '—')} />
        <Cell label="Pop @ peak" value={String(meta.popRoundPeak ?? '—')} />
        <Cell label="Pop @ end" value={String(meta.popRoundEnd ?? '—')} />
        <Cell label="Unique players" value={String(meta.popRoundMax ?? '—')} />
        <Cell text label="Morale USA" value={meta.moraleUsa ?? '—'} />
        <Cell text label="Morale CSA" value={meta.moraleCsa ?? '—'} />
        {meta.defendingTeam && <Cell text label="Defending" value={meta.defendingTeam} />}
        {meta.finalPushTime != null && <Cell label="Final push" value={fmtDuration(Math.round(meta.finalPushTime))} />}
        {meta.ticketsUsa != null && <Cell label="Tickets USA" value={ticketsText(meta.ticketsLeftUsa, meta.ticketsUsa)} />}
        {meta.ticketsCsa != null && <Cell label="Tickets CSA" value={ticketsText(meta.ticketsLeftCsa, meta.ticketsCsa)} />}
      </section>

      <section className="pb">
        <span className="cap">Casualties</span>
        <table style={{ marginTop: 7 }}>
          <thead>
            <tr>
              <th />
              <th className="num">USA</th>
              <th className="num">%</th>
              <th className="num">CSA</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {statRow('total', casUsa.total, casCsa.total, null, null)}
            {statRow('in formation', casUsa.inForm, casCsa.inForm, casUsa.total, casCsa.total)}
            {statRow('skirmish', casUsa.skirm, casCsa.skirm, casUsa.total, casCsa.total)}
            {statRow('out of line', casUsa.oob, casCsa.oob, casUsa.total, casCsa.total)}
          </tbody>
        </table>
      </section>

      <RankedSplit title="Deaths by weapon" noun="weapon" unit="Died" counts={meta.deathsByWeapon} label={weaponLabel} />
      <RankedSplit
        title="Tickets lost by cause"
        noun="cause"
        unit="Tickets"
        counts={computeCombatTotals([sb]).ticketsLostByCause}
        label={causeLabel}
      />
    </div>
  );
}

/**
 * Per-side counts keyed by weapon/cause: each side ranked on its own, largest
 * first, each as a share of that side's total. Row i pairs the two sides' i-th keys.
 */
function RankedSplit({
  title,
  noun,
  unit,
  counts,
  label = (k) => k,
}: {
  title: string;
  noun: string;
  unit: string;
  counts: Record<Team, Record<string, number>>;
  label?: (key: string) => string;
}) {
  const rank = (c: Record<string, number>) => Object.entries(c).sort((a, b) => b[1] - a[1]);
  const usa = rank(counts.USA);
  const csa = rank(counts.CSA);
  const rows = Math.max(usa.length, csa.length);
  const usaTotal = usa.reduce((n, [, v]) => n + v, 0);
  const csaTotal = csa.reduce((n, [, v]) => n + v, 0);
  return (
    <section className="pb">
      <span className="cap">{title}</span>
      {rows === 0 ? (
        <p className="note" style={{ marginTop: 7 }}>No {noun} data.</p>
      ) : (
        <table style={{ marginTop: 7 }}>
          <thead>
            <tr>
              <th>USA {noun}</th>
              <th className="num">{unit}</th>
              <th className="num">%</th>
              <th>CSA {noun}</th>
              <th className="num">{unit}</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <SplitCells entry={usa[i]} total={usaTotal} side="f-usa" label={label} />
                <SplitCells entry={csa[i]} total={csaTotal} side="f-csa" label={label} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** One side's key, count and share; blank cells once that side's list runs out. */
function SplitCells({
  entry,
  total,
  side,
  label,
}: {
  entry?: [string, number];
  total: number;
  side: string;
  label: (key: string) => string;
}) {
  if (!entry) return <><td /><td /><td /></>;
  const [w, n] = entry;
  return (
    <>
      <td>{label(w)}</td>
      <td className={`num ${side}`}>{n}</td>
      <td className="num" style={{ color: 'var(--ink-3)' }}>{sharePct(n, total)}</td>
    </>
  );
}

/** Scoreline, the mirrored metric spine, the stance split and the notes. */
function MatchupHead({ sb }: { sb: Scoreboard }) {
  const score = matchupScore(sb);
  const rows = matchupRows(sb);
  const keys = matchupKeys(sb);
  const cas = sb.meta.casualties;

  return (
    <>
      <section style={{ borderBottom: '1px solid var(--line)' }}>
        <Scoreline
          winner={score.winner === 'USA' ? 'a' : score.winner === 'CSA' ? 'b' : null}
          label={score.winner ? 'Final' : 'Draw'}
          a={{
            chip: <Pill tone="usa">Union</Pill>,
            name: 'USA',
            value: score.usaInflicted,
            sub: 'casualties inflicted',
            hue: 'var(--color-usa)',
          }}
          b={{
            chip: <Pill tone="csa">Confederate</Pill>,
            name: 'CSA',
            value: score.csaInflicted,
            sub: 'casualties inflicted',
            hue: 'var(--color-csa)',
          }}
        />
      </section>

      <section style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="ph">
          <h2>How the round was won</h2>
          <span className="rule" />
          <span className="meta">one line per metric</span>
        </div>
        <Spine rows={rows} aSide="usa" bSide="csa" />
      </section>

      <section className="pb" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="cols">
          <div className="col"><StanceBar counts={toCounts(cas.USA)} label="USA — where the losses happened" /></div>
          <div className="col"><StanceBar counts={toCounts(cas.CSA)} label="CSA — where the losses happened" /></div>
        </div>
      </section>

      {keys.length > 0 && (
        <section style={{ borderBottom: '1px solid var(--line)' }}>
          {keys.map((k) => (
            <div key={k.title} className="pb" style={{ borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {k.side ? (
                  <Pill tone={k.side === 'USA' ? 'usa' : 'csa'}>{k.side}</Pill>
                ) : (
                  <Pill tone="neutral">Round</Pill>
                )}
                <strong>{k.title}</strong>
              </div>
              <p className="note" style={{ marginTop: 6 }}>{k.body}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** The meta block counts casualties by stance; the bar wants FormationCounts. */
const toCounts = (c: { inForm: number; skirm: number; oob: number }) => ({
  in_form: c.inForm,
  skirm: c.skirm,
  oob: c.oob,
});

function BindPanel({
  sb,
  stored,
  weeks,
  weekId,
  round,
  setWeekId,
  setRound,
  buildAutofill,
  onApply,
}: {
  sb: Scoreboard;
  stored: StoredScoreboard | null;
  weeks: WeekRef[];
  weekId: string;
  round: 1 | 2;
  setWeekId: (id: string) => void;
  setRound: (r: 1 | 2) => void;
  buildAutofill: (sb: Scoreboard, flipped: boolean) => RoundAutofill;
  onApply?: (weekId: string, round: 1 | 2, af: RoundAutofill) => void;
}) {
  const selWeek = weeks.find((w) => w.id === weekId);
  const flipped = !!(round === 1 ? selWeek?.round1Flipped : selWeek?.round2Flipped);
  const af = buildAutofill(sb, flipped);

  // Whether this scoreboard is already bound, and whether it is bound to the
  // slot currently picked. Applying to a different slot moves the binding
  // rather than adding one, and the button should say which it is about to do.
  const bound = stored?.binding ?? null;
  const boundWeek = bound ? weeks.find((w) => w.id === bound.weekId) : null;
  const boundHere = !!bound && bound.weekId === weekId && bound.round === round;
  const action = boundHere ? 'Re-apply auto-fill' : bound ? 'Move the binding here' : 'Apply auto-fill';

  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="ctl">
        <span className="cap">Bind to a round</span>
        {bound ? (
          <span className="tag" title="This scoreboard is already bound to a round">
            Bound · {boundWeek?.name ?? 'a night'} · R{bound.round}
          </span>
        ) : (
          <span className="tag q" style={{ opacity: 0.6, borderStyle: 'dashed' }}>Not bound</span>
        )}
        <select value={weekId} onChange={(e) => setWeekId(e.target.value)}>
          <option value="">Select a night…</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <select value={round} onChange={(e) => setRound(Number(e.target.value) === 2 ? 2 : 1)}>
          <option value={1}>Round 1</option>
          <option value={2}>Round 2</option>
        </select>
        <button className="gh live" disabled={!weekId} onClick={() => weekId && onApply?.(weekId, round, af)}>
          {action}
        </button>
        <span className="rule" />
        <span className="meta">
          {boundHere
            ? 'already feeding this round — re-apply to refresh its figures'
            : bound
              ? 'this scoreboard is bound elsewhere; applying moves it'
              : "fills the night's result from this scoreboard"}
        </span>
      </div>
      <dl className="mapdl" style={{ padding: 13, margin: 0 }}>
        <dt>Map</dt>
        <dd>
          {af.validMap
            ? af.area
            : <span style={{ color: 'var(--live)' }}>{af.areaRaw ?? '—'} — unknown area, set it by hand</span>}
        </dd>
        <dt>Sides</dt>
        <dd>
          A = {af.sideAFaction} · B = {af.sideBFaction}
          {af.flipped && <span style={{ color: 'var(--live)' }}> (round flipped)</span>}
        </dd>
        <dt>Winner</dt>
        <dd>{af.winner ?? 'Draw'} {af.winnerSide ? `→ side ${af.winnerSide}` : ''}</dd>
        <dt>Casualties</dt>
        <dd>side A {af.casualtiesA} · side B {af.casualtiesB}</dd>

      </dl>
    </div>
  );
}
