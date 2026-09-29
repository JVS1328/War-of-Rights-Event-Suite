/**
 * The round matchup screen: Summary · Players · Killfeed · Analytics for one
 * imported scoreboard, and Replay when one is attached.
 *
 * A screen rather than a drawer, as the prototype has it (V.round). The round
 * is picked at the top so you can walk the season without going back to a
 * list, and the tables get the full column width — the players tab alone
 * carries eleven columns and never fitted a docked panel.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Scoreboard } from '../../../stats/types';
import type { StoredScoreboard } from '../../../stats/StatsRepository';
import type { RoundAutofill } from '../../../stats/eventBinding';
import type { RegimentResolver } from './playersModel';
import { SummaryTab } from './SummaryTab';
import { PlayersTab } from './PlayersTab';
import { UnitsTab } from './UnitsTab';
import { KillfeedTab } from './KillfeedTab';
import { AnalyticsTab } from './AnalyticsTab';

const ReplayTab = lazy(() => import('../../../replay/ReplayTab'));

interface WeekRef {
  id: string;
  name: string;
  round1Flipped?: boolean;
  round2Flipped?: boolean;
}

type Tab = 'summary' | 'players' | 'units' | 'killfeed' | 'analytics' | 'replay';
const TABS: Tab[] = ['summary', 'players', 'units', 'killfeed', 'analytics'];

/**
 * Tab captions. `units` says "in-game units" because the tracker's own "unit"
 * means a competing regiment, and this tab means the game's formations.
 */
const TAB_LABEL: Record<Tab, string> = {
  summary: 'summary',
  players: 'players',
  units: 'in-game units',
  killfeed: 'killfeed',
  analytics: 'analytics',
  replay: 'replay',
};

/**
 * How a round reads in the picker: when it was, where, who took it, and — since
 * an <option> cannot carry markup — whether it is already feeding a night.
 */
const roundLabel = (r: StoredScoreboard, weeks: WeekRef[]): string => {
  const m = r.scoreboard.meta;
  const when = r.scoreboard.recordedAt
    ? `${r.scoreboard.recordedAt.slice(0, 10)} ${r.scoreboard.recordedAt.slice(11, 16)}`
    : r.scoreboard.sourceFilename;
  const b = r.binding;
  const bound = b ? ` — bound: ${weeks.find((w) => w.id === b.weekId)?.name ?? 'a night'} R${b.round}` : '';
  return `${when} · ${m.map}${m.area ? ` · ${m.area}` : ''}${m.winner ? ` · ${m.winner}` : ''}${bound}`;
};

export function RoundScreen({
  stored,
  rounds = [],
  onPickRound,
  onOpenPlayer,
  weeks = [],
  canBind = false,
  buildAutofill,
  onApply,
  resolveRegiment,
}: {
  stored: StoredScoreboard | null;
  /** Every round in scope, newest first, for the picker. */
  rounds?: StoredScoreboard[];
  onPickRound?: (id: string) => void;
  onOpenPlayer: (key: string) => void;
  weeks?: WeekRef[];
  teamNames?: { A: string; B: string };
  validMaps?: string[];
  canBind?: boolean;
  buildAutofill?: (sb: Scoreboard, flipped: boolean) => RoundAutofill;
  onApply?: (weekId: string, round: 1 | 2, af: RoundAutofill) => void;
  /** Season regiment resolver, so the Players and Analytics tabs read a round
   *  the way the season does — matching the Regiments tab, and following a
   *  player who has been reassigned to another unit by hand. */
  resolveRegiment?: RegimentResolver;
}) {
  const [tab, setTab] = useState<Tab>('summary');
  // Back to Summary whenever a different round is picked.
  useEffect(() => {
    setTab('summary');
  }, [stored?.id]);

  const sb = stored?.scoreboard;
  const at = stored ? rounds.findIndex((r) => r.id === stored.id) : -1;
  const binding = stored?.binding ?? null;
  const boundWeekName = binding ? weeks.find((w) => w.id === binding.weekId)?.name ?? 'a night' : null;
  const boundCount = rounds.filter((r) => r.binding).length;
  const step = (by: number) => {
    const next = rounds[at + by];
    if (next) onPickRound?.(next.id);
  };

  return (
    <>
      <div className="panel">
        <div className="ctl">
          <span className="cap">Round</span>
          <select
            value={stored?.id ?? ''}
            onChange={(e) => onPickRound?.(e.target.value)}
            aria-label="Round"
            style={{ maxWidth: 380 }}
          >
            {rounds.length === 0 && <option value="">No rounds imported</option>}
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>{roundLabel(r, weeks)}</option>
            ))}
          </select>
          <button className="gh" onClick={() => step(-1)} disabled={at <= 0} aria-label="Newer round">‹</button>
          <button
            className="gh" onClick={() => step(1)}
            disabled={at < 0 || at >= rounds.length - 1} aria-label="Older round"
          >
            ›
          </button>
          <span className="rule" />
          <span className="meta">
            {at >= 0 ? `${at + 1} of ${rounds.length}` : `${rounds.length} imported`}
            {boundCount > 0 && ` · ${boundCount} bound`}
          </span>
        </div>
      </div>

      {!sb ? (
        <div className="panel">
          <header className="ph"><h2>Round matchup</h2><span className="rule" /></header>
          <div className="pb">
            <p className="note">
              Nothing to show. Import a scoreboard, or pick a round above.
            </p>
          </div>
        </div>
      ) : (
        <div className="panel">
          <header className="ph">
            <h2 className="wor-name">
              {sb.meta.map}{sb.meta.area ? ` · ${sb.meta.area}` : ''}
            </h2>
            <span className="rule" />
            {binding ? (
              <span className="tag" title="This round's figures feed that night">
                Bound · {boundWeekName} · R{binding.round}
              </span>
            ) : (
              <span className="tag q" style={{ opacity: 0.6, borderStyle: 'dashed' }}>Not bound</span>
            )}
            <span className="meta">
              {sb.meta.mode}
              {sb.recordedAt ? ` · ${sb.recordedAt.slice(0, 10)} ${sb.recordedAt.slice(11, 16)}` : ''}
            </span>
          </header>
          <Tabs tabs={stored?.hasReplay ? [...TABS, 'replay'] : TABS} tab={tab} onChange={setTab} />
          {tab === 'summary' && (
            <SummaryTab
              sb={sb}
              stored={stored}
              canBind={canBind}
              weeks={weeks}
              buildAutofill={buildAutofill}
              onApply={onApply}
            />
          )}
          {tab === 'players' && (
            <PlayersTab sb={sb} onOpenPlayer={onOpenPlayer} resolveRegiment={resolveRegiment} />
          )}
          {tab === 'units' && <UnitsTab sb={sb} onOpenPlayer={onOpenPlayer} />}
          {tab === 'killfeed' && <KillfeedTab sb={sb} onOpenPlayer={onOpenPlayer} />}
          {tab === 'analytics' && (
            <AnalyticsTab sb={sb} onOpenPlayer={onOpenPlayer} resolveRegiment={resolveRegiment} />
          )}
          {tab === 'replay' && stored?.hasReplay && (
            <Suspense fallback={<div className="pb"><p className="note">Loading the replay…</p></div>}>
              <ReplayTab key={stored.id} stored={stored} resolveRegiment={resolveRegiment} />
            </Suspense>
          )}
        </div>
      )}
    </>
  );
}

function Tabs({ tabs, tab, onChange }: { tabs: Tab[]; tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="ctl">
      <div className="seg">
        {tabs.map((t) => (
          <button key={t} onClick={() => onChange(t)} aria-pressed={tab === t}>{TAB_LABEL[t]}</button>
        ))}
      </div>
      <span className="rule" />
    </div>
  );
}
