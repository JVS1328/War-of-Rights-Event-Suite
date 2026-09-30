import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Upload, Trash2, Pencil, X, GitMerge, Layers } from 'lucide-react';
import { Panel, Picker, Pill, DataTable, EmptyHint } from '../ui';
import type { Column } from '../ui';
import { useStats, type UseStats } from './useStats';
import type { StatsRepository } from '../../stats/StatsRepository';
import {
  computePlayerLeaderboard,
  computeRegimentBreakdown,
  computeRegimentContextStats,
  computeRegimentTicketShares,
  computeCombatTotals,
  computeRounds,
  computeOverview,
  computePlayerDetail,
  computeScoreboardMapStats,
  resolveFor,
  withAliasLayer,
} from '../../stats/statsEngine';
import type { PlayerType } from '../../stats/statsEngine';
import { CAVALRY_REGIMENTS } from '../../stats/branch';
import type { PlayerStatRow, RegimentStatRow, RegimentRoundRow, RoundSummary, FormationCounts, TrackerMapStats, ContextStatSlice, RegimentContextStats, TicketShare, TicketRoundShare, TicketContextShare } from '../../stats/statsEngine';
import type { Scoreboard, Team } from '../../stats/types';
import { formatAvgT, formatRate, FORMATION_LABEL, AVG_TD_LABEL, AVG_TK_LABEL, KILL_RATE_LABEL, LOSS_RATE_LABEL, TICKET_INFLICTED_LABEL, TICKET_RECEIVED_LABEL, AVG_TICKET_INFLICTED_LABEL, AVG_TICKET_RECEIVED_LABEL } from '../../stats/labels';
import { parseRegimentList, UNTAGGED } from '../../stats/regimentMatcher';
import { buildRoundAutofill, roundFieldUpdates } from '../../stats/eventBinding';
import type { TeamNames, RoundAutofill } from '../../stats/eventBinding';
import { weekIdsForScope, OVERALL_SCOPE, effectiveAliasMap, aliasMapBySource, scopedMapBySource } from '../../stats/statsBundle';
import type { StatsBundleSeason } from '../../stats/statsBundle';
import { PlayerScreen, RoundScreen } from './StatsCards';
import { CompareView } from './CompareView';
import { StatsOverview } from './StatsOverview';
import { MapsScreen } from './MapsScreen';
import { NightMatchup } from './NightMatchup';
import type { NightWeek, PointSystem } from '../../stats/nightMatchup';
import { TicketPct } from './drawerPrimitives';

/**
 * A week, as the stats side reads it. The binding panel only needs id/name/flip,
 * but the Nights tab reads the whole result — so this is {@link NightWeek} with
 * a string id, and the tracker hands its week straight in.
 */
export interface WeekRef extends NightWeek {
  id: string;
}

export type SubTab =
  | 'overview' | 'players' | 'regiments' | 'nights' | 'compare' | 'maps' | 'rounds' | 'import'
  // The three drill-downs. Screens, not drawers — a round's players tab alone
  // carries eleven columns and never fitted a docked panel.
  | 'round' | 'player' | 'unit';
const TABS: SubTab[] = ['overview', 'players', 'regiments', 'nights', 'compare', 'maps', 'rounds', 'import'];

const teamTone = (t: Team) => (t === 'USA' ? 'usa' : 'csa');

/** Arm-of-service filter buttons for the player leaderboard and the card. */
const ARM_FILTERS: { key: PlayerType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'inf', label: 'Infantry' },
  { key: 'cav', label: 'Cavalry' },
  { key: 'arty', label: 'Artillery' },
];

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—';
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
}
const dateOf = (r: string | null) => (r ? r.slice(0, 10) : 'unknown');
const timeOf = (r: string | null) => (r ? r.slice(11, 19) : '—');
const whenOf = (r: string | null) => (r ? `${r.slice(0, 10)} ${r.slice(11, 16)}` : '—');
const kdStr = (k: number, d: number) => (d > 0 ? k / d : k).toFixed(2);
const TdHead = <span title={AVG_TD_LABEL}>×Td</span>;
const TkHead = <span title={AVG_TK_LABEL}>×Tk</span>;
const KrHead = <span className="cursor-help" title={KILL_RATE_LABEL}>KR</span>;
const LrHead = <span className="cursor-help" title={LOSS_RATE_LABEL}>LR</span>;

/** Compact ‹ 1/N › pager bar shared by the Rounds and Import lists. */
function Pager({
  page,
  pageCount,
  onPage,
  offset,
  shown,
  total,
  noun = 'items',
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  offset: number;
  shown: number;
  total: number;
  noun?: string;
}) {
  if (pageCount <= 1) return null;
  const btn =
    '';
  return (
    <div className="pager">
      <span className="tabular-nums">
        {offset + 1}–{offset + shown} of {total} {noun}
      </span>
      <span className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0} aria-label="Previous page" className={btn}>
          ‹
        </button>
        <span>
          {page + 1}/{pageCount}
        </span>
        <button onClick={() => onPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} aria-label="Next page" className={btn}>
          ›
        </button>
      </span>
    </div>
  );
}

interface StatsAreaProps {
  eventId: string;
  /**
   * Where the stats come from. Defaults to this browser's IndexedDB (the admin
   * tracker); the public site passes the database-backed repository instead.
   */
  repo?: StatsRepository;
  eventName: string;
  registryUnits?: string[];
  /** Weeks of the active season, for binding scoreboards to a round. */
  weeks?: WeekRef[];
  teamNames?: TeamNames;
  /** Known map-area names (ALL_MAPS) for validating auto-filled maps. */
  validMaps?: string[];
  /** Writes auto-filled round fields back into the tracker's week. */
  onApplyRound?: (weekId: string, updates: Record<string, unknown>) => void;
  /** The season's point system, so the Nights tab can price a night. */
  pointSystem?: PointSystem;
  /** Units holding a standings token — anyone else scores nothing. */
  tokenUnits?: string[];
  /** Opens the tracker's night builder for a week, from the Nights tab. */
  onEditNight?: (weekId: string) => void;
  /** The night the Nights tab opens on — one clicked on another screen. */
  night?: string;
  /**
   * Which sub-tab to show. When given, the panel is driven from outside (the
   * tracker's rail) and hides its own tab strip — the rail is the navigation.
   */
  tab?: SubTab;
  onTab?: (tab: SubTab) => void;
  /**
   * All seasons (id, name, weekIds) for the season/Overall stats filter. A
   * scoreboard belongs to a season when its `binding.weekId` is in that
   * season's `weekIds`; unbound scoreboards show only under Overall.
   */
  seasons?: StatsBundleSeason[];
  /** Selected filter scope: a season id, or `OVERALL_SCOPE` for all seasons. */
  seasonScope?: string;
  /**
   * When provided, the panel renders its own season + Overall button row and
   * calls this on change (the shared view). When absent, the scope is purely
   * controlled by {@link seasonScope} and no buttons render — the live tracker
   * drives it from its existing season nav instead.
   */
  onSeasonScope?: (scope: string) => void;
  /**
   * Pre-computed map stats from the tracker's Elo engine. When provided, the
   * Maps tab renders from this instead of deriving stats from scoreboards.
   * The shared/read-only view omits this and falls back to scoreboard data.
   */
  trackerMapStats?: TrackerMapStats;
  /**
   * Hide the Import tab and every editing affordance. The public site reads the
   * same repository the tracker writes, so this is what keeps a visitor from
   * being shown controls that would only ever come back 401.
   */
  readOnly?: boolean;
}

/**
 * Live stats area — reads the event's scoreboards from a repository: this
 * browser's IndexedDB in the tracker, the database on the public site.
 */
export default function StatsArea(props: StatsAreaProps) {
  // Load only the season on screen. Overall resolves to null, which is every
  // round — see useStats.
  const scopeWeekIds = useMemo(
    () => weekIdsForScope(props.seasons ?? [], props.seasonScope ?? OVERALL_SCOPE),
    [props.seasons, props.seasonScope],
  );
  const stats = useStats(
    props.eventId,
    props.repo,
    scopeWeekIds ? [...scopeWeekIds] : null,
  );
  return <StatsPanel {...props} stats={stats} />;
}

/**
 * Presentational stats panel. Renders from an injected {@link UseStats} object,
 * so it serves both the live tracker (via {@link StatsArea}) and the read-only
 * shared-link view (which feeds it a bundle-backed, no-op stats object).
 * When `readOnly`, the Import tab and all assignment-editing affordances hide.
 */
export function StatsPanel({
  eventName,
  registryUnits = [],
  weeks = [],
  teamNames = { A: 'USA', B: 'CSA' },
  validMaps = [],
  onApplyRound,
  pointSystem,
  tokenUnits,
  onEditNight,
  night,
  tab: tabProp,
  onTab,
  seasons = [],
  seasonScope = OVERALL_SCOPE,
  onSeasonScope,
  trackerMapStats,
  stats,
  readOnly = false,
}: StatsAreaProps & { stats: UseStats; readOnly?: boolean }) {
  const [ownTab, setOwnTab] = useState<SubTab>('overview');
  const railDriven = tabProp != null;
  const tab: SubTab = tabProp ?? ownTab;
  const setTab = (t: SubTab) => (onTab ? onTab(t) : setOwnTab(t));
  // Regiment-list textarea starts empty — it's a manual override, no longer
  // pre-filled from the event unit registry. (Registry-based matching still
  // happens automatically via `opts` below.)
  const [listText, setListText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<PlayerType>('all');
  const [glossary, setGlossary] = useState(false);
  /** A pair sent over from the Units screen's "Open comparison" control. */
  const [compareUnits, setCompareUnits] = useState<[string, string] | null>(null);
  /** A player sent over from their card's Compare button. */
  const [comparePlayer, setComparePlayer] = useState<string | null>(null);
  const [playerKey, setPlayerKey] = useState<string | null>(null);
  const [playerType, setPlayerType] = useState<PlayerType>('all');
  const [scoreboardId, setScoreboardId] = useState<string | null>(null);
  // Regiments-tab focus navigation (from the Players-tab regiment link).
  const [focusRegiment, setFocusRegiment] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Open a unit's card. The Units list also reads focusRegiment to scroll to a
  // panel, so both paths keep working off the one piece of state.
  const goToRegiment = (label: string) => {
    setFocusRegiment(label);
    setFocusNonce((n) => n + 1);
    setTab('unit');
  };

  // Open a player's card, resetting its role filter to "all".
  const openPlayer = (key: string) => {
    setPlayerType('all');
    setPlayerKey(key);
    setTab('player');
  };

  // Season filter (whole-view): keep only scoreboards bound to a week in the
  // selected season. Overall (or no season data) leaves everything in. Unbound
  // scoreboards have no season, so they surface only under Overall.
  const scopeWeekIds = useMemo(() => weekIdsForScope(seasons, seasonScope), [seasons, seasonScope]);
  const sbs = useMemo(() => {
    const scoped = scopeWeekIds
      ? stats.stored.filter((r) => r.binding != null && scopeWeekIds.has(r.binding.weekId))
      : stats.stored;
    return scoped
      .map((s) => s.scoreboard)
      .sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''));
  }, [stats.stored, scopeWeekIds]);
  // Registered event units act as the default match list (overrides win; the
  // name-tag heuristic is the fallback for anything unmatched).
  const regimentList = useMemo(() => parseRegimentList(registryUnits.join('\n')), [registryUnits]);
  // The Overall rename/merge map, applied to every season.
  const overallAlias = useMemo(() => effectiveAliasMap(stats.aliases, OVERALL_SCOPE), [stats.aliases]);
  // Each scoreboard → the rename/merge map for the season it belongs to (season
  // entries layered over Overall). This drives season-scoped resolution: in the
  // Overall view a unit renamed/split in one season keeps its own identity in the
  // others; in a single-season view every in-scope board maps to that season.
  const aliasBySource = useMemo(
    () => aliasMapBySource(stats.stored, seasons, stats.aliases),
    [stats.stored, seasons, stats.aliases],
  );
  // Steam-id pins resolve the same way: Overall pins plus the round's season
  // pins (season wins), so a player pinned to different regiments across seasons
  // lands in the right one each round.
  const overallAssignments = useMemo(() => stats.assignments[OVERALL_SCOPE] ?? {}, [stats.assignments]);
  const assignmentBySource = useMemo(
    () => scopedMapBySource(stats.stored, seasons, stats.assignments),
    [stats.stored, seasons, stats.assignments],
  );
  const opts = useMemo(
    () => ({
      regimentList,
      aliasMapFor: (sb: Scoreboard) => aliasBySource.get(sb.sourceFilename) ?? overallAlias,
      assignmentsFor: (sb: Scoreboard) => assignmentBySource.get(sb.sourceFilename) ?? overallAssignments,
    }),
    [regimentList, aliasBySource, overallAlias, assignmentBySource, overallAssignments],
  );

  // Positional `assignments` is only a fallback — `opts.assignmentsFor` selects
  // per-scoreboard pins, so the Overall pins are the sensible base here.
  const players = useMemo(
    () => computePlayerLeaderboard(sbs, overallAssignments, { ...opts, type: typeFilter }),
    [sbs, overallAssignments, opts, typeFilter],
  );
  // Counts sit on the branch buttons, so each says how much it would leave.
  // Computed per arm rather than by filtering `players`, because the filter is
  // per player-round: someone who rode one round and marched the next belongs
  // to both counts and to neither exclusively.
  //
  // That is three more passes over every round, so they are only built for the
  // screens that show the buttons. On a season of scoreboards those passes cost
  // more than everything else the overview does put together.
  const wantsBranchCounts = tab === 'players' || tab === 'regiments';
  const branchCounts = useMemo(() => {
    const out = {} as Record<PlayerType, number>;
    for (const { key } of ARM_FILTERS) {
      out[key] = key === typeFilter || !wantsBranchCounts
        ? players.length
        : computePlayerLeaderboard(sbs, overallAssignments, { ...opts, type: key }).length;
    }
    return out;
  }, [sbs, overallAssignments, opts, players.length, typeFilter, wantsBranchCounts]);
  const regiments = useMemo(() => computeRegimentBreakdown(sbs, overallAssignments, opts), [sbs, overallAssignments, opts]);
  const regimentContext = useMemo(() => computeRegimentContextStats(sbs, overallAssignments, opts), [sbs, overallAssignments, opts]);
  const regimentTicketShares = useMemo(
    () => computeRegimentTicketShares(sbs, overallAssignments, opts),
    [sbs, overallAssignments, opts],
  );
  const combat = useMemo(() => computeCombatTotals(sbs), [sbs]);
  // Map stats derived from the imported scoreboards (every round, bound or not),
  // as an alternative to the tracker's week-bound map stats in the Maps tab.
  const scoreboardMapStats = useMemo(() => computeScoreboardMapStats(sbs), [sbs]);
  const selectedStored = useMemo(() => stats.stored.find((s) => s.id === scoreboardId) ?? null, [scoreboardId, stats.stored]);
  // Season regiment resolver shared with the round drawer's Players tab, so its
  // "unit" grouping matches the Regiments tab (assignments → list → name tag).
  // Resolves under the open round's own season scope (or Overall when none).
  const resolveRegiment = useMemo(
    () => (steamId: string | null, name: string) => {
      const src = selectedStored?.scoreboard.sourceFilename;
      const aliasMap = (src && aliasBySource.get(src)) || overallAlias;
      const asg = (src && assignmentBySource.get(src)) || overallAssignments;
      const r = resolveFor(steamId, name, asg, regimentList, aliasMap);
      return r === UNTAGGED ? null : r;
    },
    [regimentList, aliasBySource, overallAlias, assignmentBySource, overallAssignments, selectedStored],
  );
  // ── Temporary unit combine (Regiments tab) ────────────────────────────────
  // Tick two or more units to read their stats as one. It's a view, not an edit:
  // the ticked labels are folded into an extra alias layer for a second engine
  // pass, so every metric (including the per-round ticket shares, which need the
  // team denominators) is computed properly rather than added up after the fact —
  // and the stored rename/merge state is never touched.
  const [combineOn, setCombineOn] = useState(false);
  const [combineLabels, setCombineLabels] = useState<string[]>([]);
  const regimentLabels = useMemo(() => new Set(regiments.map((r) => r.regiment)), [regiments]);
  const combinedLabel = useMemo(() => {
    const joined = combineLabels.join(' + ');
    // A real unit literally named like the join would otherwise be swept into
    // the preview — keep the synthetic label its own bucket.
    return regimentLabels.has(joined) ? `${joined} (combined)` : joined;
  }, [combineLabels, regimentLabels]);
  const combinedOpts = useMemo(() => {
    if (combineLabels.length < 2) return null;
    const layer: Record<string, string> = {};
    for (const label of combineLabels) layer[label] = combinedLabel;
    return withAliasLayer(opts, layer);
  }, [opts, combineLabels, combinedLabel]);
  const combinedView = useMemo(() => {
    if (!combinedOpts) return null;
    const row = computeRegimentBreakdown(sbs, overallAssignments, combinedOpts).find(
      (r) => r.regiment === combinedLabel,
    );
    if (!row) return null;
    return {
      row,
      contextStats: computeRegimentContextStats(sbs, overallAssignments, combinedOpts)[combinedLabel],
      ticketShare: computeRegimentTicketShares(sbs, overallAssignments, combinedOpts)[combinedLabel],
    };
  }, [combinedOpts, combinedLabel, sbs, overallAssignments]);
  const combine: CombineState = {
    on: combineOn,
    labels: combineLabels,
    label: combinedLabel,
    view: combinedView,
    setOn: (on) => {
      setCombineOn(on);
      if (!on) setCombineLabels([]);
    },
    toggle: (label) =>
      setCombineLabels((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label])),
    clear: () => setCombineLabels([]),
  };

  // Rank is the player's place in the list as currently filtered, and the bars
  // are scaled to that same set — so both answer "against who is on screen".
  const playerRank = useMemo(() => {
    const order = [...players].sort((a, b) => b.kills - a.kills);
    return new Map(order.map((p, i) => [p.key, i + 1]));
  }, [players]);
  const rankOfPlayer = (p: PlayerStatRow) => playerRank.get(p.key) ?? 0;
  const playerMax = useMemo(
    () => ({
      kills: players.reduce((m, p) => Math.max(m, p.kills), 0),
      kd: players.reduce((m, p) => Math.max(m, p.kd), 0),
    }),
    [players],
  );
  const maxOfPlayer = (k: 'kills' | 'kd') => playerMax[k];

  const rounds = useMemo(() => computeRounds(sbs), [sbs]);
  const overview = useMemo(() => computeOverview(sbs, overallAssignments, opts), [sbs, overallAssignments, opts]);
  // Rounds in scope, newest first: what the round picker walks.
  const sortedStored = useMemo(
    () => [...stats.stored].sort((a, b) =>
      (b.scoreboard.recordedAt ?? '').localeCompare(a.scoreboard.recordedAt ?? '')),
    [stats.stored],
  );
  /** The unit whose card is open, defaulting to the top of the table. */
  const focusedRegiment = useMemo(
    () => regiments.find((r) => r.regiment === focusRegiment) ?? regiments[0] ?? null,
    [regiments, focusRegiment],
  );

  // A card screen opened from the rail has nothing selected yet. Fall back to
  // the obvious subject — the newest round, the top of the leaderboard — so the
  // screen shows the thing you came to look at instead of an empty state.
  const shownPlayerKey = playerKey ?? players[0]?.key ?? null;
  const playerDetail = useMemo(
    () => (shownPlayerKey ? computePlayerDetail(sbs, shownPlayerKey, overallAssignments, { ...opts, type: playerType }) : null),
    [shownPlayerKey, playerType, sbs, overallAssignments, opts],
  );

  const openRound = (filename: string) => {
    const s = stats.stored.find((x) => x.scoreboard.sourceFilename === filename);
    if (s) { setScoreboardId(s.id); setTab('round'); }
  };
  const applyRound = (weekId: string, round: 1 | 2, af: RoundAutofill) => {
    onApplyRound?.(weekId, roundFieldUpdates(round, af));
    if (selectedStored) void stats.bind(selectedStored.id, { weekId, round });
  };
  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const res = await stats.importFiles(files);
    setImportMsg(`Imported ${res.imported} scoreboard${res.imported === 1 ? '' : 's'}${res.failed.length ? ` · ${res.failed.length} failed` : ''}`);
    if (res.imported > 0) setTab('overview');
  };

  const hasData = sbs.length > 0;
  // Shared/read-only views drop the Import tab — there's nothing to import into.
  const visibleTabs = TABS.filter(
    (t) => (t !== 'import' || !readOnly) && (t !== 'nights' || weeks.length > 0),
  );

  return (
    <div>
      {/* Season / Overall filter — rendered only when this panel owns the
          control (the shared view). The live tracker drives `seasonScope` from
          its own season nav, so it passes no handler and this row stays hidden. */}
      {!railDriven && onSeasonScope && seasons.length > 0 && (
        <div className="ctl" style={{ border: '1px solid var(--line)', marginBottom: 18 }}>
          <span className="cap">Season</span>
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => onSeasonScope(s.id)}
              className="gh"
              aria-pressed={seasonScope === s.id}
            >
              {s.name}
            </button>
          ))}
          <button
            onClick={() => onSeasonScope(OVERALL_SCOPE)}
            title="All seasons combined"
            className="gh"
            aria-pressed={seasonScope === OVERALL_SCOPE}
          >
            Overall
          </button>
        </div>
      )}
      {!railDriven && (
      <div className="ctl" style={{ border: '1px solid var(--line)', marginBottom: 18 }}>
        <div className="seg">
          {visibleTabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}>{t}</button>
          ))}
        </div>
        <span className="rule" />
        <span className="meta wor-name">{eventName}</span>
      </div>
      )}

      {tab === 'overview' && (
        <StatsOverview
          o={overview}
          players={players}
          rounds={rounds}
          combat={combat}
          hasData={hasData}
          scopeName={seasons.find((s) => s.id === seasonScope)?.name ?? eventName}
          readOnly={readOnly}
          onOpenRound={openRound}
          onOpenPlayer={openPlayer}
        />
      )}

      {tab === 'players' && (
        <div className="panel">
          <header className="ph">
            <h2>Player leaderboard</h2>
            <span className="rule" />
            <span className="meta">{players.length} player{players.length === 1 ? '' : 's'}</span>
          </header>
          <div className="ctl">
            <span className="cap">Branch</span>
            <div className="seg" role="group" aria-label="Arm of service">
              {ARM_FILTERS.map(({ key, label }) => (
                <button key={key} onClick={() => setTypeFilter(key)} aria-pressed={typeFilter === key}>
                  {label} <span style={{ opacity: 0.6 }}>{branchCounts[key]}</span>
                </button>
              ))}
            </div>
            <button className="gh" aria-pressed={glossary} onClick={() => setGlossary((g) => !g)}>
              What do these mean?
            </button>
            <span className="rule" />
            <span
              className="meta"
              title={`Read from the in-game regiment each round. Cavalry: ${CAVALRY_REGIMENTS.join(', ')}.`}
            >
              branch comes from the in-game regiment
            </span>
          </div>
          {glossary && (
            <div className="gloss">
              <dl><dt>K/D</dt><dd>Kills ÷ deaths over every imported round.</dd></dl>
              <dl>
                <dt>Cost per death <span style={{ color: 'var(--ink-3)' }}>(×Td)</span></dt>
                <dd>Tickets each death cost the team. In formation 1, skirmishing 3, out of line 5. Lower is better.</dd>
              </dl>
              <dl>
                <dt>Value per kill <span style={{ color: 'var(--ink-3)' }}>(×Tk)</span></dt>
                <dd>Tickets each kill drained, weighted by where the victim died. Higher is better.</dd>
              </dl>
              <dl>
                <dt>Cavalry</dt>
                <dd>Anyone whose in-game regiment is {CAVALRY_REGIMENTS.join(', ')}. Artillery is any battery.</dd>
              </dl>
            </div>
          )}
          <div className="pb">
            {players.length === 0 ? (
              <EmptyHint>
                {typeFilter === 'all' ? 'Import a scoreboard to see player stats' : `No ${typeFilter} player-rounds`}
              </EmptyHint>
            ) : (
              <DataTable<PlayerStatRow>
                rows={players}
                getRowKey={(p) => p.key}
                initialSortKey="kills"
                pageSize={25}
                searchValue={(p) => `${p.name} ${p.regiment} ${p.steamId ?? ''} ${p.inGameRegiment ?? ''} ${p.branch}`}
                searchPlaceholder="player, unit, steam id or in-game regiment"
                columns={playerColumns(goToRegiment, openPlayer, rankOfPlayer, maxOfPlayer)}
              />
            )}
          </div>
        </div>
      )}

      {tab === 'regiments' && (
        <RegimentsTab
          regiments={regiments}
          regimentContext={regimentContext}
          ticketShares={regimentTicketShares}
          stats={stats}
          openPlayer={openPlayer}
          openRound={openRound}
          focusRegiment={focusRegiment}
          focusNonce={focusNonce}
          readOnly={readOnly}
          seasonScope={seasonScope}
          seasonName={seasons.find((s) => s.id === seasonScope)?.name ?? null}
          combine={combine}
          onCompare={(a, b) => { setCompareUnits([a, b]); setTab('compare'); }}
        />
      )}

      {tab === 'nights' && (
        <NightMatchup
          // Remount on a new night so a click elsewhere lands on it.
          key={night ?? ''}
          night={night}
          weeks={weeks}
          stored={stats.stored}
          pointSystem={pointSystem}
          tokenUnits={tokenUnits}
          assignments={overallAssignments}
          options={{ regimentList, aliasMap: overallAlias }}
          onOpenRound={openRound}
          onEditNight={onEditNight}
          readOnly={readOnly}
        />
      )}

      {tab === 'compare' && (
        <CompareView
          players={players}
          regiments={regiments}
          initialUnit={compareUnits?.[0] ?? null}
          initialUnitB={compareUnits?.[1] ?? null}
          initialPlayerKey={comparePlayer}
        />
      )}

      {tab === 'maps' && <MapsScreen trackerMapStats={trackerMapStats} scoreboardMapStats={scoreboardMapStats} />}

      {tab === 'rounds' && <RoundsTab rounds={rounds} openRound={openRound} />}

      {tab === 'import' && !readOnly && (
        <ImportTab
          stats={stats}
          listText={listText}
          setListText={setListText}
          importMsg={importMsg}
          fileRef={fileRef}
          onPickFiles={onPickFiles}
          onOpenScoreboard={(id) => { setScoreboardId(id); setTab('round'); }}
        />
      )}

      {tab === 'round' && (
        <RoundScreen
          stored={selectedStored ?? sortedStored[0] ?? null}
          rounds={sortedStored}
          onPickRound={setScoreboardId}
          onOpenPlayer={openPlayer}
          weeks={weeks}
          teamNames={teamNames}
          validMaps={validMaps}
          canBind={!readOnly && !!onApplyRound}
          buildAutofill={(sb: Scoreboard, flipped: boolean) => buildRoundAutofill(sb, teamNames, validMaps, flipped)}
          onApply={applyRound}
          resolveRegiment={resolveRegiment}
        />
      )}

      {tab === 'player' && (
        <PlayerScreen
          detail={playerDetail}
          onOpenRound={openRound}
          onOpenUnit={goToRegiment}
          onPickPlayer={(k) => { setPlayerType('all'); setPlayerKey(k); }}
          onCompare={(k) => { setComparePlayer(k); setTab('compare'); }}
          type={playerType}
          onType={setPlayerType}
          field={players}
        />
      )}

      {tab === 'unit' && (
        <UnitScreen
          reg={focusedRegiment}
          units={regiments}
          onPick={(u) => { setFocusRegiment(u); setFocusNonce((n) => n + 1); }}
          onCompare={(u) => { setCompareUnits([u, regiments.find((r) => r.regiment !== u)?.regiment ?? u]); setTab('compare'); }}
          contextStats={focusedRegiment ? regimentContext[focusedRegiment.regiment] : undefined}
          ticketShare={focusedRegiment ? regimentTicketShares[focusedRegiment.regiment] : undefined}
          openPlayer={openPlayer}
          openRound={openRound}
        />
      )}

    </div>
  );
}

// ── Players (no Team column — event context) ────────────────────────────────

function playerColumns(
  goToRegiment: (label: string) => void,
  openPlayer: (key: string) => void,
  rankOf: (p: PlayerStatRow) => number,
  max: (key: 'kills' | 'kd') => number,
): Column<PlayerStatRow>[] {
  /** Inline bar against the field's best, so the gap is visible, not inferred. */
  const withBar = (value: string, share: number) => (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="inline-block h-1 w-10 bg-[color:var(--color-bg-2)] align-middle">
        <span className="block h-1 bg-[color:var(--color-text-0)]" style={{ width: `${share * 100}%` }} />
      </span>
      {value}
    </span>
  );
  return [
    {
      key: 'rank',
      header: '#',
      align: 'right',
      render: (p) => <span className="text-[color:var(--color-text-2)]">{rankOf(p)}</span>,
    },
    {
      key: 'name',
      header: 'Player',
      sortable: true,
      sortValue: (p) => p.name.toLowerCase(),
      render: (p) => (
        <button onClick={() => openPlayer(p.key)} className="wor-name text-left hover:text-[color:var(--color-accent)]">
          {p.name}
        </button>
      ),
    },
    {
      key: 'regiment',
      header: 'Regiment',
      sortable: true,
      sortValue: (p) => p.regiment,
      render: (p) => (
        <button
          onClick={() => goToRegiment(p.regiment)}
          className="wor-name underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-accent)]"
          title="Open this regiment in the Regiments tab"
        >
          {p.regiment}
        </button>
      ),
    },
    { key: 'rounds', header: 'Rounds', align: 'right', sortable: true, sortValue: (p) => p.rounds, render: (p) => p.rounds },
    {
      key: 'kills',
      header: 'Kills',
      align: 'right',
      sortable: true,
      sortValue: (p) => p.kills,
      render: (p) => withBar(String(p.kills), max('kills') > 0 ? p.kills / max('kills') : 0),
    },
    { key: 'deaths', header: 'Deaths', align: 'right', sortable: true, sortValue: (p) => p.deaths, render: (p) => p.deaths },
    {
      key: 'kd',
      header: 'K/D',
      align: 'right',
      sortable: true,
      sortValue: (p) => p.kd,
      render: (p) => withBar(p.kd.toFixed(2), max('kd') > 0 ? p.kd / max('kd') : 0),
    },
    {
      key: 'kpr',
      header: 'K / round',
      align: 'right',
      sortable: true,
      sortValue: (p) => (p.rounds > 0 ? p.kills / p.rounds : 0),
      render: (p) => (p.rounds > 0 ? (p.kills / p.rounds).toFixed(1) : '—'),
    },
    {
      key: 'avgTd',
      header: <span title={AVG_TD_LABEL}>Cost / death</span>,
      align: 'right',
      sortable: true,
      sortValue: (p) => p.avgTd ?? -1,
      render: (p) => formatAvgT(p.avgTd),
      className: 'text-[color:var(--color-text-1)]',
    },
    {
      key: 'avgTk',
      header: <span title={AVG_TK_LABEL}>Value / kill</span>,
      align: 'right',
      sortable: true,
      sortValue: (p) => p.avgTk ?? -1,
      render: (p) => formatAvgT(p.avgTk),
      className: 'text-[color:var(--color-text-1)]',
    },
    {
      // The unit a player is scored under and the regiment they were actually
      // sat in are different facts, and only this column shows the second one.
      key: 'inGame',
      header: 'In game',
      sortable: true,
      sortValue: (p) => `${p.branch} ${p.inGameRegiment ?? ''}`,
      render: (p) => (
        <span style={{ color: 'var(--ink-2)' }}>
          <span className="tag q">{p.branch}</span> {p.inGameRegiment ?? '—'}
        </span>
      ),
    },
  ];
}

// ── Regiments ────────────────────────────────────────────────────────────────

function Bars({ data, showPct = false }: { data: [string, number][]; showPct?: boolean }) {
  const max = data.reduce((m, [, v]) => Math.max(m, v), 0);
  const total = data.reduce((s, [, v]) => s + v, 0);
  if (data.length === 0 || max === 0) return <EmptyHint>No data</EmptyHint>;
  return (
    <div>
      {data.map(([label, count]) => (
        <div key={label} className="hb">
          <span className="nm" style={{ textTransform: 'capitalize' }}>{label}</span>
          <span className="t"><i style={{ width: `${(count / max) * 100}%` }} /></span>
          <span className="n">
            {count}
            {showPct && <span style={{ color: 'var(--ink-3)' }}> · {total ? Math.round((count / total) * 100) : 0}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Two side-by-side breakdowns (by formation, by cause) under one heading,
 *  each shown with raw counts and percentages. Used for both the casualties a
 *  regiment suffered and the casualties it inflicted. */
function BreakdownGroup({
  heading,
  form,
  cause,
}: {
  heading: string;
  form: [string, number][];
  cause: [string, number][];
}) {
  return (
    <div>
      <div className="cap" style={{ color: 'var(--live)', marginBottom: 7 }}>{heading}</div>
      <div className="cols">
        <div className="col">
          <div className="cap">By formation</div>
          <Bars data={form} showPct />
        </div>
        <div className="col">
          <div className="cap">By cause</div>
          {cause.length === 0 ? <EmptyHint>No killfeed data</EmptyHint> : <Bars data={cause} showPct />}
        </div>
      </div>
    </div>
  );
}

type RegSort =
  | 'name'
  | 'players'
  | 'avgPlayers'
  | 'kills'
  | 'deaths'
  | 'kd'
  | 'killRate'
  | 'lossRate'
  | 'avgTk'
  | 'avgTd'
  | 'tdInf'
  | 'tdRec';

const REG_SORTS: { key: RegSort; label: string; title?: string }[] = [
  { key: 'name', label: 'name' },
  { key: 'players', label: 'players' },
  { key: 'avgPlayers', label: 'avg/rd' },
  { key: 'kills', label: 'kills' },
  { key: 'deaths', label: 'deaths' },
  { key: 'kd', label: 'k/d' },
  { key: 'killRate', label: 'KR', title: KILL_RATE_LABEL },
  { key: 'lossRate', label: 'LR', title: LOSS_RATE_LABEL },
  { key: 'avgTk', label: '×Tk', title: AVG_TK_LABEL },
  { key: 'avgTd', label: '×Td', title: AVG_TD_LABEL },
  { key: 'tdInf', label: 'TDI%', title: AVG_TICKET_INFLICTED_LABEL },
  { key: 'tdRec', label: 'TDR%', title: AVG_TICKET_RECEIVED_LABEL },
];

/**
 * Sort key → comparable value. Null ticket averages sort last (as -1). The
 * ticket-share keys (tdInf/tdRec) live in a side map, so they're resolved by the
 * caller and fall through here as -1.
 */
function regSortValue(r: RegimentStatRow, k: RegSort): number | string {
  switch (k) {
    case 'name':
      return r.regiment;
    case 'players':
      return r.players;
    case 'avgPlayers':
      return r.avgPlayers;
    case 'kills':
      return r.kills;
    case 'deaths':
      return r.deaths;
    case 'kd':
      return r.kd;
    case 'killRate':
      return r.killRate ?? -1;
    case 'lossRate':
      return r.lossRate ?? -1;
    case 'avgTk':
      return r.avgTk ?? -1;
    case 'avgTd':
      return r.avgTd ?? -1;
    case 'tdInf':
    case 'tdRec':
      return -1;
  }
}

/** Stats for the synthetic "these units as one" panel. */
interface CombinedUnit {
  row: RegimentStatRow;
  contextStats?: RegimentContextStats;
  ticketShare?: TicketShare;
}

/**
 * Temporary combine-view state for the Regiments tab. Nothing here is written
 * anywhere: ticking units only adds a preview panel, and unticking them (or
 * leaving the mode) drops it. Available in the shared read-only view too.
 */
interface CombineState {
  /** Combine mode on — every unit panel shows a tick box. */
  on: boolean;
  /** Ticked unit labels, in tick order. */
  labels: string[];
  /** The combined panel's label (the ticked units joined). */
  label: string;
  /** Combined stats — null until two units are ticked. */
  view: CombinedUnit | null;
  setOn: (on: boolean) => void;
  toggle: (label: string) => void;
  clear: () => void;
}

interface RegEdit {
  editMode: boolean;
  allRegiments: string[];
  pending: Record<string, string>;
  selected: Set<string>;
  stageMove: (steamId: string, target: string) => void;
  toggleSelect: (steamId: string) => void;
  rename: (from: string) => void;
  merge: (from: string, into: string) => void;
  removeRegiment: (label: string) => void;
}

function RegimentsTab({
  regiments,
  regimentContext,
  ticketShares,
  stats,
  openPlayer,
  openRound,
  focusRegiment,
  focusNonce,
  readOnly = false,
  seasonScope,
  seasonName,
  combine,
  onCompare,
}: {
  regiments: RegimentStatRow[];
  regimentContext: Record<string, RegimentContextStats>;
  /** Per-regiment average per-round ticket-damage shares, keyed by label. */
  ticketShares: Record<string, TicketShare>;
  stats: ReturnType<typeof useStats>;
  openPlayer: (key: string) => void;
  openRound: (filename: string) => void;
  focusRegiment: string | null;
  focusNonce: number;
  readOnly?: boolean;
  /** The stats view's current scope: `OVERALL_SCOPE` or a season id. */
  seasonScope: string;
  /** Display name of the scoped season, or null under Overall. */
  seasonName: string | null;
  /** Temporary "read these units as one" preview — see {@link CombineState}. */
  combine: CombineState;
  /** Open two units side by side on the Compare screen. */
  onCompare?: (a: string, b: string) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState('');

  const allRegiments = useMemo(
    () => regiments.map((r) => r.regiment).sort((a, b) => a.localeCompare(b)),
    [regiments],
  );

  // Two units, side by side. Seeded to the first pair so the control is usable
  // without a click, and clamped when the roster changes underneath it.
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  useEffect(() => {
    if (allRegiments.length === 0) return;
    if (!allRegiments.includes(cmpA)) setCmpA(allRegiments[0]);
    if (!allRegiments.includes(cmpB)) setCmpB(allRegiments[1] ?? allRegiments[0]);
  }, [allRegiments, cmpA, cmpB]);

  const [sortKey, setSortKey] = useState<RegSort>('kills');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 10;
  const onSort = (k: RegSort) => {
    setPage(0);
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      // Names read best A→Z; every numeric column reads best high→low first.
      setSortDir(k === 'name' ? 'asc' : 'desc');
    }
  };
  const sortedRegiments = useMemo(() => {
    // Ticket-share sorts read from the side map; null shares sort last (as -1).
    const shareVal = (r: RegimentStatRow, k: 'tdInf' | 'tdRec'): number => {
      const s = ticketShares[r.regiment];
      return (k === 'tdInf' ? s?.avgPctInflicted : s?.avgPctReceived) ?? -1;
    };
    const arr = [...regiments];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'tdInf' || sortKey === 'tdRec') {
        cmp = shareVal(a, sortKey) - shareVal(b, sortKey);
      } else {
        const av = regSortValue(a, sortKey);
        const bv = regSortValue(b, sortKey);
        cmp = typeof av === 'string' || typeof bv === 'string' ? String(av).localeCompare(String(bv)) : av - bv;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [regiments, sortKey, sortDir, ticketShares]);
  // Search filters the panel list by regiment label or any of its players
  // (name or steam id); pagination keeps a long roster of units browsable.
  const filteredRegiments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedRegiments;
    return sortedRegiments.filter(
      (r) =>
        r.regiment.toLowerCase().includes(q) ||
        r.topPlayers.some((p) => p.name.toLowerCase().includes(q) || (p.steamId ?? '').toLowerCase().includes(q)),
    );
  }, [sortedRegiments, search]);
  const regPageCount = Math.max(1, Math.ceil(filteredRegiments.length / PAGE));
  const regPage = Math.min(page, regPageCount - 1);
  const pageRegiments = filteredRegiments.slice(regPage * PAGE, regPage * PAGE + PAGE);

  const pendingCount = Object.keys(pending).length;
  // Active renames/merges to show: the current scope's own entries, plus (in a
  // season view) the inherited Overall entries, tagged so it's clear which apply
  // everywhere vs. only here. Each is undoable within its own scope.
  const aliasEntries = useMemo(() => {
    const own = Object.entries(stats.aliases[seasonScope] ?? {}).map(([from, to]) => ({
      from,
      to,
      scope: seasonScope,
      inherited: false,
    }));
    const inherited =
      seasonScope === OVERALL_SCOPE
        ? []
        : Object.entries(stats.aliases[OVERALL_SCOPE] ?? {}).map(([from, to]) => ({
            from,
            to,
            scope: OVERALL_SCOPE,
            inherited: true,
          }));
    return [...own, ...inherited];
  }, [stats.aliases, seasonScope]);

  const reset = () => {
    setPending({});
    setSelected(new Set());
    setMoveTarget('');
  };
  const exitEdit = () => {
    if (pendingCount > 0 && !window.confirm(`Discard ${pendingCount} unsaved assignment change(s)?`)) return;
    reset();
    setEditMode(false);
  };
  const stageMove = (steamId: string, target: string) => {
    setPending((p) => {
      const next = { ...p };
      next[steamId] = target;
      return next;
    });
  };
  const toggleSelect = (steamId: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(steamId)) next.delete(steamId);
      else next.add(steamId);
      return next;
    });
  };
  const moveSelectedTo = (target: string) => {
    if (!target || selected.size === 0) return;
    setPending((p) => {
      const next = { ...p };
      for (const id of selected) next[id] = target;
      return next;
    });
    setSelected(new Set());
    setMoveTarget('');
  };
  const save = async () => {
    await stats.bulkAssign(pending, seasonScope);
    reset();
  };
  // Where an edit lands, spelled out so a season-scoped rename can't be mistaken
  // for a global one (and vice-versa).
  const scopeNote =
    seasonScope === OVERALL_SCOPE
      ? 'This applies to ALL seasons.'
      : `This applies to ${seasonName ?? 'this season'} only.`;
  const rename = (from: string) => {
    if (from === UNTAGGED) return;
    const raw = window.prompt(`Rename regiment "${from}" to:\n(${scopeNote})`, from);
    const to = raw?.trim();
    if (!to || to === from) return;
    if (allRegiments.includes(to) && !window.confirm(`"${to}" already exists — this will MERGE "${from}" into it. ${scopeNote} Continue?`)) return;
    void stats.setAlias(from, to, seasonScope);
  };
  const merge = (from: string, into: string) => {
    if (!into || into === from || from === UNTAGGED || into === UNTAGGED) return;
    if (!window.confirm(`Merge "${from}" into "${into}"? All of its players and stats will move. ${scopeNote} You can undo this later.`)) return;
    void stats.setAlias(from, into, seasonScope);
  };
  const removeRegiment = (label: string) => {
    if (label === UNTAGGED) return;
    if (!window.confirm(`Remove "${label}"? All of its players move to ${UNTAGGED}. ${scopeNote} You can undo this later.`)) return;
    void stats.setAlias(label, UNTAGGED, seasonScope);
  };

  const edit: RegEdit = { editMode, allRegiments, pending, selected, stageMove, toggleSelect, rename, merge, removeRegiment };

  if (regiments.length === 0) {
    return (
      <Panel title="Regiments">
        <EmptyHint>Import a scoreboard to see regiment breakdowns</EmptyHint>
      </Panel>
    );
  }

  return (
    <div>
      {/* Edit toolbar — hidden in read-only/shared views (no mutations). */}
      <div className="panel">
        <div className="ctl">
          <span className="cap">Compare two units</span>
          <select value={cmpA} onChange={(e) => setCmpA(e.target.value)} aria-label="First unit">
            {allRegiments.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={cmpB} onChange={(e) => setCmpB(e.target.value)} aria-label="Second unit">
            {allRegiments.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="gh" onClick={() => onCompare?.(cmpA, cmpB)} disabled={cmpA === cmpB}>
            Open comparison
          </button>
          <span className="rule" />
          <span className="meta">{regiments.length} matched · sortable below</span>
        </div>
        {!readOnly && (
          <div className="ctl">
            <button className="gh" aria-pressed={editMode} onClick={() => (editMode ? exitEdit() : setEditMode(true))}>
              <Pencil size={12} /> {editMode ? 'Done editing' : 'Edit assignments'}
            </button>
            <button className="gh" aria-pressed={combine.on} onClick={() => combine.setOn(!combine.on)}
                    title="Preview two or more units as one — nothing is saved">
              <Layers size={12} /> {combine.on ? 'Done combining' : 'Combine units'}
            </button>
            <span className="rule" />
            <span className="meta">
              {editMode
                ? `pins apply on Save · rename and merge apply immediately, ${seasonScope === OVERALL_SCOPE ? 'to all seasons' : `to ${seasonName ?? 'this season'} only`}`
                : combine.on
                  ? 'tick two or more units to read them as one — nothing is saved'
                  : 'click a unit for its roster and its whole record'}
            </span>
          </div>
        )}
      </div>

      {/* Active renames/merges — current scope's own edits plus inherited Overall ones. */}
      {editMode && aliasEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="cap">Active renames, merges and removals</span>
          {aliasEntries.map(({ from, to, scope, inherited }) => (
            <span
              key={`${scope}:${from}`}
              className="tag q"
              style={inherited ? { opacity: 0.75 } : undefined}
            >
              {from} → {to}
              {inherited && <span style={{ color: 'var(--ink-3)', marginLeft: 5 }}>all</span>}
              <button
                onClick={() => void stats.removeAlias(from, scope)}
                title={inherited ? 'Undo (affects all seasons)' : 'Undo'}
                style={{ marginLeft: 5, color: 'var(--ink-3)' }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Ticked units, so a selection stays manageable across pages and searches. */}
      {combine.on && combine.labels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="cap">Combining</span>
          {combine.labels.map((label) => (
            <span
              key={label}
              className="tag q"
            >
              {label}
              <button
                onClick={() => combine.toggle(label)}
                title={`Drop ${label} from the combined view`}
                style={{ marginLeft: 5, color: 'var(--ink-3)' }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <button
            onClick={combine.clear}
            className="gh"
          >
            Clear
          </button>
        </div>
      )}

      {combine.on && combine.labels.length === 1 && (
        <EmptyHint>Tick one more unit to see the combined stats</EmptyHint>
      )}
      {combine.on && combine.labels.length > 1 && !combine.view && (
        <EmptyHint>None of the ticked units fielded a player in this view</EmptyHint>
      )}
      {/* A tick can outlive its unit — e.g. ticked under Overall, then filtered to
          a season the unit never played. Say so rather than quietly leaving it out. */}
      {combine.on && combine.view && combine.labels.some((l) => !allRegiments.includes(l)) && (
        <EmptyHint>
          Not in this view: {combine.labels.filter((l) => !allRegiments.includes(l)).join(', ')} — the combined
          stats below cover the rest
        </EmptyHint>
      )}
      {combine.on && combine.view && (
        <RegimentPanel
          key={`combined:${combine.label}`}
          reg={combine.view.row}
          contextStats={combine.view.contextStats}
          ticketShare={combine.view.ticketShare}
          openPlayer={openPlayer}
          openRound={openRound}
          edit={{ ...edit, editMode: false }}
          focusActive={false}
          focusNonce={0}
          combined
        />
      )}

      {/* Sort the regiment panels by any column, and search the roster. */}
      <div className="panel">
        <div className="ctl">
          <span className="cap">Sort</span>
          {REG_SORTS.map((c) => (
            <button
              key={c.key}
              onClick={() => onSort(c.key)}
              title={c.title}
              className="gh"
              aria-pressed={sortKey === c.key}
            >
              {c.label}
              {sortKey === c.key ? (sortDir === 'asc' ? ' ▴' : ' ▾') : ''}
            </button>
          ))}
          <span className="rule" />
          <input
            type="search"
            placeholder="unit, player or steam id"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      {filteredRegiments.length === 0 ? (
        <EmptyHint>No regiments match "{search.trim()}"</EmptyHint>
      ) : (
        pageRegiments.map((r) => (
          <RegimentPanel
            key={r.regiment}
            reg={r}
            contextStats={regimentContext[r.regiment]}
            ticketShare={ticketShares[r.regiment]}
            openPlayer={openPlayer}
            openRound={openRound}
            edit={edit}
            focusActive={focusRegiment === r.regiment}
            focusNonce={focusNonce}
            field={regiments}
            combineTick={
              combine.on
                ? { checked: combine.labels.includes(r.regiment), onToggle: () => combine.toggle(r.regiment) }
                : undefined
            }
          />
        ))
      )}

      {/* Panel-list pager (search + sort narrow first). */}
      {regPageCount > 1 && (
        <div className="pager">
          <span className="tabular-nums">
            {regPage * PAGE + 1}–{regPage * PAGE + pageRegiments.length} of {filteredRegiments.length} regiments
          </span>
          <span className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, regPage - 1))}
              disabled={regPage === 0}
              aria-label="Previous page"
            >
              ‹
            </button>
            <span>
              {regPage + 1}/{regPageCount}
            </span>
            <button
              onClick={() => setPage(Math.min(regPageCount - 1, regPage + 1))}
              disabled={regPage >= regPageCount - 1}
              aria-label="Next page"
            >
              ›
            </button>
          </span>
        </div>
      )}

      {/* Sticky action bar */}
      {editMode && (pendingCount > 0 || selected.size > 0) && (
        <div className="ctl" style={{ position: 'sticky', bottom: 0, zIndex: 10, border: '1px solid var(--live)' }}>
          {selected.size > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="cap">{selected.size} selected</span>
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
              >
                <option value="">move to…</option>
                {allRegiments.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              <button
                onClick={() => moveSelectedTo(moveTarget)}
                disabled={!moveTarget}
                className="gh"
              >
                Stage move
              </button>
            </div>
          )}
          <div className="flex-1" />
          <span className="rule" />
          <span className="meta">{pendingCount} pending change{pendingCount === 1 ? '' : 's'}</span>
          <button onClick={reset} className="gh">
            Discard
          </button>
          <button
            onClick={() => void save()}
            disabled={pendingCount === 0}
            className="gh live"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

/** Compact stat summary for one context slice. */
function ContextSlicePanel({ label, slice, ticket }: { label: string; slice: ContextStatSlice; ticket?: TicketContextShare }) {
  if (slice.rounds === 0) return null;
  const formOf = (f: FormationCounts): [string, number][] => [
    [FORMATION_LABEL.in_form, f.in_form],
    [FORMATION_LABEL.skirm, f.skirm],
    [FORMATION_LABEL.oob, f.oob],
  ];
  const byCause = (m: Record<string, number>): [string, number][] =>
    Object.entries(m).sort((a, b) => b[1] - a[1]);
  const showTicket = ticket != null && ticket.rounds > 0;
  return (
    <Panel
      title={label}
      collapsible
      defaultOpen={false}
      right={
        <span className="meta" style={{ whiteSpace: 'normal' }}>
          {slice.rounds}rd · {slice.players}p · {slice.kills}K/{slice.deaths}D · {slice.kd.toFixed(2)}
          {' · '}<span className="cursor-help" title={KILL_RATE_LABEL}>KR {formatRate(slice.killRate)}</span>
          {' · '}<span className="cursor-help" title={LOSS_RATE_LABEL}>LR {formatRate(slice.lossRate)}</span>
          {' · '}<span title={AVG_TD_LABEL}>×Td {formatAvgT(slice.avgTd)}</span>
          {' · '}<span title={AVG_TK_LABEL}>×Tk {formatAvgT(slice.avgTk)}</span>
          {showTicket && (
            <>
              {' · '}<span className="cursor-help" title={AVG_TICKET_INFLICTED_LABEL}>TDI <TicketPct share={ticket.avgPctInflicted} shareTitle={AVG_TICKET_INFLICTED_LABEL} /></span>
              {' · '}<span className="cursor-help" title={AVG_TICKET_RECEIVED_LABEL}>TDR <TicketPct share={ticket.avgPctReceived} shareTitle={AVG_TICKET_RECEIVED_LABEL} /></span>
            </>
          )}
        </span>
      }
    >
      <div className="pb">
        <BreakdownGroup heading="Casualties suffered" form={formOf(slice.casualtiesByFormation)} cause={byCause(slice.casualtiesByCause)} />
        <div style={{ height: 14 }} />
        <BreakdownGroup heading="Casualties inflicted" form={formOf(slice.killsByFormation)} cause={byCause(slice.killsByCause)} />
      </div>
    </Panel>
  );
}

/** One round's expanded breakdown inside a regiment's Round-by-round table:
 *  that round's ticket metrics plus casualties suffered/inflicted (formation +
 *  cause), mirroring the whole-regiment panel but scoped to the single round. */
function RegimentRoundBreakdown({
  rr,
  share,
  formOf,
  byCause,
  onOpenRound,
}: {
  rr: RegimentRoundRow;
  share?: TicketRoundShare;
  formOf: (f: FormationCounts) => [string, number][];
  byCause: (m: Record<string, number>) => [string, number][];
  onOpenRound: () => void;
}) {
  return (
    <div>
      <div className="ctl" style={{ border: '1px solid var(--line)', marginBottom: 13 }}>
        <span className="cursor-help" title={TICKET_INFLICTED_LABEL}>
          TDI <TicketPct share={share?.pctInflicted ?? null} shareTitle={TICKET_INFLICTED_LABEL} />
        </span>
        <span className="cursor-help" title={TICKET_RECEIVED_LABEL}>
          TDR <TicketPct share={share?.pctReceived ?? null} shareTitle={TICKET_RECEIVED_LABEL} />
        </span>
        <span title={AVG_TD_LABEL}>×Td {formatAvgT(rr.avgTd)}</span>
        <span title={AVG_TK_LABEL}>×Tk {formatAvgT(rr.avgTk)}</span>
        <span className="cursor-help" title={KILL_RATE_LABEL}>KR {formatRate(rr.killRate)}</span>
        <span className="cursor-help" title={LOSS_RATE_LABEL}>LR {formatRate(rr.lossRate)}</span>
        <span className="rule" />
        <button onClick={onOpenRound} className="gh live">Open the scoreboard</button>
      </div>
      <BreakdownGroup heading="Casualties suffered" form={formOf(rr.casualtiesByFormation)} cause={byCause(rr.casualtiesByCause)} />
      <div style={{ height: 14 }} />
      <BreakdownGroup heading="Casualties inflicted" form={formOf(rr.killsByFormation)} cause={byCause(rr.killsByCause)} />
    </div>
  );
}

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

/** Where a unit sits in the field on one figure. Nulls sort last either way. */
function rankIn(
  field: RegimentStatRow[],
  reg: RegimentStatRow,
  k: 'kd' | 'killRate' | 'lossRate' | 'avgTd' | 'avgTk' | 'avgPlayers',
  low = false,
): number | null {
  const val = (r: RegimentStatRow) => (r[k] ?? (low ? Infinity : -1)) as number;
  const sorted = [...field].sort((a, b) => (low ? val(a) - val(b) : val(b) - val(a)));
  const i = sorted.findIndex((r) => r.regiment === reg.regiment);
  return i < 0 ? null : i + 1;
}

/**
 * A unit's headline figure with its place in the field. The bar is the
 * percentile, not the value — 0.94 K/D means nothing until you know whether
 * that is 2nd of 18 or 17th.
 */
function RegRanked({
  head, value, rank, total, hint,
}: { head: string; value: ReactNode; rank: number | null; total: number; hint: string }) {
  return (
    <div className="kpi">
      <div className="cap">{head}</div>
      <div className="v">{value}</div>
      <div className="h">
        {rank != null && <><b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{ordinal(rank)}</b> of {total} · </>}
        {hint}
      </div>
      {rank != null && <div className="pctbar"><i style={{ width: `${(1 - (rank - 1) / total) * 100}%` }} /></div>}
    </div>
  );
}

/**
 * The unit card: one unit's whole record, picked at the top.
 *
 * Reuses the panel the Units list draws, forced open — the figures and the
 * breakdowns are the same question asked of one unit instead of all of them,
 * and having two renderings of that would let them drift apart.
 */
function UnitScreen({
  reg,
  units,
  onPick,
  onCompare,
  contextStats,
  ticketShare,
  openPlayer,
  openRound,
}: {
  reg: RegimentStatRow | null;
  units: RegimentStatRow[];
  onPick: (unit: string) => void;
  onCompare?: (unit: string) => void;
  contextStats?: RegimentContextStats;
  ticketShare?: TicketShare;
  openPlayer: (key: string) => void;
  openRound: (filename: string) => void;
}) {
  const named = [...units].sort((a, b) => a.regiment.localeCompare(b.regiment));
  const noEdit: RegEdit = {
    editMode: false, allRegiments: [], pending: {}, selected: new Set(),
    stageMove: () => {}, toggleSelect: () => {}, rename: () => {}, merge: () => {}, removeRegiment: () => {},
  };
  return (
    <>
      <div className="panel">
        <div className="ctl">
          <span className="cap">Unit</span>
          <Picker
            label="Unit"
            width={240}
            value={reg?.regiment ?? null}
            options={named.map((u) => ({ value: u.regiment, label: u.regiment, hint: `${u.rounds}rd` }))}
            onChange={onPick}
            placeholder="unit name"
            emptyText="no units imported"
          />
          {reg && onCompare && (
            <button className="gh" onClick={() => onCompare(reg.regiment)}>Compare</button>
          )}
          <span className="rule" />
          {reg && (
            <span className="meta">
              {reg.rounds} rounds · {reg.players} men seen · {Math.round(reg.avgPlayers)} fielded a round
            </span>
          )}
        </div>
      </div>
      {!reg ? (
        <Panel title="Unit card">
          <EmptyHint>Import a scoreboard to see a unit's record</EmptyHint>
        </Panel>
      ) : (
        <RegimentPanel
          key={reg.regiment}
          reg={reg}
          contextStats={contextStats}
          ticketShare={ticketShare}
          openPlayer={openPlayer}
          openRound={openRound}
          edit={noEdit}
          focusActive={false}
          focusNonce={0}
          field={units}
          alwaysOpen
        />
      )}
    </>
  );
}

function RegimentPanel({
  reg,
  contextStats,
  ticketShare,
  openPlayer,
  openRound,
  edit,
  focusActive,
  focusNonce,
  combineTick,
  combined = false,
  field = [],
  alwaysOpen = false,
}: {
  reg: RegimentStatRow;
  contextStats?: RegimentContextStats;
  ticketShare?: TicketShare;
  openPlayer: (key: string) => void;
  openRound: (filename: string) => void;
  edit: RegEdit;
  focusActive: boolean;
  focusNonce: number;
  /** Combine-mode tick box in the header; omitted when the mode is off. */
  combineTick?: { checked: boolean; onToggle: () => void };
  /**
   * This is the synthetic combined panel: it starts open, doesn't persist its
   * collapse state (its label changes with the selection), and shows no edit
   * tools — there's no stored unit behind it to rename, merge, or remove.
   */
  combined?: boolean;
  /** Every unit in view, so each figure can carry its rank in the field. */
  field?: RegimentStatRow[];
  /** On the unit card there is one panel and nothing to collapse it for. */
  alwaysOpen?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusActive && focusNonce > 0) wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusActive, focusNonce]);

  const formOf = (f: FormationCounts): [string, number][] => [
    [FORMATION_LABEL.in_form, f.in_form],
    [FORMATION_LABEL.skirm, f.skirm],
    [FORMATION_LABEL.oob, f.oob],
  ];
  const byCause = (m: Record<string, number>): [string, number][] =>
    Object.entries(m).sort((a, b) => b[1] - a[1]);
  const sufferedForm = formOf(reg.casualtiesByFormation);
  const sufferedCause = byCause(reg.casualtiesByCause);
  const inflictedForm = formOf(reg.killsByFormation);
  const inflictedCause = byCause(reg.killsByCause);
  const isUntagged = reg.regiment === UNTAGGED;
  const mergeTargets = edit.allRegiments.filter((l) => l !== reg.regiment && l !== UNTAGGED);

  return (
    <div ref={wrapRef}>
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2 min-w-0">
            {combineTick && (
              <input
                type="checkbox"
                checked={combineTick.checked}
                onChange={combineTick.onToggle}
                onClick={(e) => e.stopPropagation()}
                title={`Read ${reg.regiment} together with the other ticked units`}
                aria-label={`Combine ${reg.regiment}`}
              />
            )}
            <span className="break-words">{reg.regiment}</span>
            {combined && <Pill tone="accent">combined</Pill>}
          </span>
        }
        collapsible={!alwaysOpen}
        defaultOpen={combined || alwaysOpen}
        storageKey={combined || alwaysOpen ? undefined : `reg-panel-${reg.regiment}`}
        openSignal={focusActive ? focusNonce : undefined}
        right={
          <>
            <span title="Total unique players · average players fielded per round">
              {`${reg.players}p · ${Math.round(reg.avgPlayers)}/rd`}
            </span>
            {` · ${reg.rounds}rd · ${reg.kills}K/${reg.deaths}D · K/D ${reg.kd.toFixed(2)} · `}
            <span className="cursor-help" title={KILL_RATE_LABEL}>KR {formatRate(reg.killRate)}</span>
            {' · '}
            <span className="cursor-help" title={LOSS_RATE_LABEL}>LR {formatRate(reg.lossRate)}</span>
            {' · '}
            <span title={AVG_TD_LABEL}>×Td {formatAvgT(reg.avgTd)}</span>
            {' · '}
            <span title={AVG_TK_LABEL}>×Tk {formatAvgT(reg.avgTk)}</span>
            {' · '}
            <span className="cursor-help" title={AVG_TICKET_INFLICTED_LABEL}>
              TDI <TicketPct share={ticketShare?.avgPctInflicted ?? null} shareTitle={AVG_TICKET_INFLICTED_LABEL} />
            </span>
            {' · '}
            <span className="cursor-help" title={AVG_TICKET_RECEIVED_LABEL}>
              TDR <TicketPct share={ticketShare?.avgPctReceived ?? null} shareTitle={AVG_TICKET_RECEIVED_LABEL} />
            </span>
          </>
        }
      >
      {!combined && field.length > 1 && (
        <div className="kpis" style={{ borderBottom: '1px solid var(--line)' }}>
          <RegRanked head="K/D" value={reg.kd.toFixed(2)} rank={rankIn(field, reg, 'kd')} total={field.length}
                     hint={`${reg.kills} kills · ${reg.deaths} lost`} />
          <RegRanked head="Kills per man" value={formatRate(reg.killRate)} rank={rankIn(field, reg, 'killRate')} total={field.length}
                     hint="size-normalised output" />
          <RegRanked head="Losses per man" value={formatRate(reg.lossRate)} rank={rankIn(field, reg, 'lossRate', true)} total={field.length}
                     hint="lower is better" />
          <RegRanked head="Cost per death" value={formatAvgT(reg.avgTd)} rank={rankIn(field, reg, 'avgTd', true)} total={field.length}
                     hint="tickets · ×Td · lower is better" />
          <RegRanked head="Value per kill" value={formatAvgT(reg.avgTk)} rank={rankIn(field, reg, 'avgTk')} total={field.length}
                     hint="tickets · ×Tk" />
          <RegRanked head="Men fielded" value={Math.round(reg.avgPlayers)} rank={rankIn(field, reg, 'avgPlayers')} total={field.length}
                     hint={`${reg.players} seen across ${reg.rounds} rounds`} />
        </div>
      )}
      <div className="pb">
        {combined && (
          <p className="note" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 9, marginBottom: 13 }}>
            Temporary view of {reg.regiment} read as one unit — every stat below is recomputed over their
            combined player-rounds. The units themselves are untouched.
          </p>
        )}
        {edit.editMode && !isUntagged && (
          <div className="ctl" style={{ border: '1px solid var(--line)', marginBottom: 13 }}>
            <button className="gh" onClick={() => edit.rename(reg.regiment)}>
              <Pencil size={11} /> Rename
            </button>
            <span className="cap"><GitMerge size={12} /></span>
            <select
              defaultValue=""
              onChange={(e) => { const v = e.target.value; e.currentTarget.selectedIndex = 0; edit.merge(reg.regiment, v); }}
              aria-label={`Merge ${reg.regiment} into another unit`}
            >
              <option value="">Merge into…</option>
              {mergeTargets.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
            <button className="gh c-danger" onClick={() => edit.removeRegiment(reg.regiment)} title={`Move all players to ${UNTAGGED}`}>
              <Trash2 size={11} /> Remove
            </button>
            <span className="rule" />
            <span className="meta">rename and merge apply immediately · pins apply on save</span>
          </div>
        )}

        <BreakdownGroup heading="Casualties suffered" form={sufferedForm} cause={sufferedCause} />
        <div style={{ height: 16 }} />
        <BreakdownGroup heading="Casualties inflicted" form={inflictedForm} cause={inflictedCause} />

        {/* Faction & role context breakdowns */}
        {contextStats && (
          <div style={{ marginTop: 18 }}>
            <div className="cap" style={{ marginBottom: 7 }}>Splits — the same breakdowns, sliced by context</div>
            <ContextSlicePanel label="As USA" slice={contextStats.asUSA} ticket={ticketShare?.asUSA} />
            <ContextSlicePanel label="As CSA" slice={contextStats.asCSA} ticket={ticketShare?.asCSA} />
            <ContextSlicePanel label="As Attacker" slice={contextStats.asAttacker} ticket={ticketShare?.asAttacker} />
            <ContextSlicePanel label="As Defender" slice={contextStats.asDefender} ticket={ticketShare?.asDefender} />
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
            <span className="cap">Round by round</span>
            <span className="rule" />
            <span className="cap">click a round for its breakdown</span>
          </div>
          <DataTable<RegimentRoundRow>
            rows={reg.perRound}
            getRowKey={(rr) => rr.sourceFilename}
            className="overflow-x-auto"
            pageSize={8}
            renderExpanded={(rr) => (
              <RegimentRoundBreakdown
                rr={rr}
                share={ticketShare?.perRound[rr.sourceFilename]}
                formOf={formOf}
                byCause={byCause}
                onOpenRound={() => openRound(rr.sourceFilename)}
              />
            )}
            columns={[
              { key: 'when', header: 'When', sortable: true, sortValue: (rr) => rr.recordedAt ?? '', render: (rr) => <span className="whitespace-nowrap text-[color:var(--color-text-2)]">{whenOf(rr.recordedAt)}</span> },
              { key: 'map', header: 'Map · Area', render: (rr) => <span className="text-[color:var(--color-text-1)]">{rr.map}{rr.area ? ` · ${rr.area}` : ''}</span> },
              { key: 'players', header: 'Players', align: 'right', sortable: true, sortValue: (rr) => rr.players, render: (rr) => <span className="text-[color:var(--color-text-2)]">{rr.players}</span> },
              { key: 'kills', header: 'K', align: 'right', sortable: true, sortValue: (rr) => rr.kills, render: (rr) => rr.kills },
              { key: 'deaths', header: 'D', align: 'right', sortable: true, sortValue: (rr) => rr.deaths, render: (rr) => rr.deaths },
              { key: 'kd', header: 'K/D', align: 'right', sortable: true, sortValue: (rr) => (rr.deaths > 0 ? rr.kills / rr.deaths : rr.kills), render: (rr) => kdStr(rr.kills, rr.deaths) },
              { key: 'kr', header: KrHead, align: 'right', sortable: true, sortValue: (rr) => rr.killRate ?? -1, render: (rr) => formatRate(rr.killRate) },
              { key: 'lr', header: LrHead, align: 'right', sortable: true, sortValue: (rr) => rr.lossRate ?? -1, render: (rr) => <span className="text-[color:var(--color-text-2)]">{formatRate(rr.lossRate)}</span> },
              { key: 'avgTd', header: TdHead, align: 'right', sortable: true, sortValue: (rr) => rr.avgTd ?? -1, render: (rr) => formatAvgT(rr.avgTd) },
              { key: 'avgTk', header: TkHead, align: 'right', sortable: true, sortValue: (rr) => rr.avgTk ?? -1, render: (rr) => formatAvgT(rr.avgTk) },
              {
                key: 'tdi',
                header: <span title={TICKET_INFLICTED_LABEL}>TDI</span>,
                align: 'right',
                sortable: true,
                sortValue: (rr) => ticketShare?.perRound[rr.sourceFilename]?.pctInflicted ?? -1,
                render: (rr) => {
                  const s = ticketShare?.perRound[rr.sourceFilename];
                  return <TicketPct share={s?.pctInflicted ?? null} shareTitle={TICKET_INFLICTED_LABEL} />;
                },
              },
              {
                key: 'tdr',
                header: <span title={TICKET_RECEIVED_LABEL}>TDR</span>,
                align: 'right',
                sortable: true,
                sortValue: (rr) => ticketShare?.perRound[rr.sourceFilename]?.pctReceived ?? -1,
                render: (rr) => {
                  const s = ticketShare?.perRound[rr.sourceFilename];
                  return <TicketPct share={s?.pctReceived ?? null} shareTitle={TICKET_RECEIVED_LABEL} />;
                },
              },
            ]}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
            <span className="cap">Roster</span>
            <span className="rule" />
            <span className="cap">{reg.players} seen in this unit</span>
          </div>
          {edit.editMode ? (
            <EditablePlayers reg={reg} openPlayer={openPlayer} edit={edit} />
          ) : (
            <DataTable<PlayerStatRow>
              rows={reg.topPlayers}
              getRowKey={(p) => p.key}
              initialSortKey="kills"
              pageSize={10}
              searchValue={(p) => `${p.name} ${p.steamId ?? ''}`}
              searchPlaceholder="Search players or steam id…"
              columns={[
                {
                  key: 'name',
                  header: 'Player',
                  render: (p) => (
                    <button onClick={() => openPlayer(p.key)} className="wor-name text-left hover:text-[color:var(--color-accent)]">
                      {p.name}
                    </button>
                  ),
                },
                { key: 'rounds', header: 'Rounds', align: 'right', sortable: true, sortValue: (p) => p.rounds, render: (p) => p.rounds },
                { key: 'kills', header: 'K', align: 'right', sortable: true, sortValue: (p) => p.kills, render: (p) => p.kills },
                { key: 'deaths', header: 'D', align: 'right', sortable: true, sortValue: (p) => p.deaths, render: (p) => p.deaths },
                { key: 'kd', header: 'K/D', align: 'right', sortable: true, sortValue: (p) => p.kd, render: (p) => p.kd.toFixed(2) },
                { key: 'avgTd', header: TdHead, align: 'right', sortable: true, sortValue: (p) => p.avgTd ?? -1, render: (p) => formatAvgT(p.avgTd) },
                { key: 'avgTk', header: TkHead, align: 'right', sortable: true, sortValue: (p) => p.avgTk ?? -1, render: (p) => formatAvgT(p.avgTk) },
              ]}
            />
          )}
        </div>
      </div>
      </Panel>
    </div>
  );
}

// Editable players list (shown only in edit mode): checkbox to multi-select +
// a per-player regiment dropdown that stages a move until Save.
function EditablePlayers({
  reg,
  openPlayer,
  edit,
}: {
  reg: RegimentStatRow;
  openPlayer: (key: string) => void;
  edit: RegEdit;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 24 }} />
          <th>Player</th>
          <th>Move to</th>
          <th className="num">K</th>
          <th className="num">D</th>
        </tr>
      </thead>
      <tbody>
        {reg.topPlayers.map((p) => {
          const pinnable = !!p.steamId;
          const staged = pinnable ? edit.pending[p.steamId!] : undefined;
          const value = staged ?? reg.regiment;
          const moved = staged != null && staged !== reg.regiment;
          return (
            <tr key={p.key} style={moved ? { background: 'var(--sunken)' } : undefined}>
              <td>
                <input
                  type="checkbox"
                  disabled={!pinnable}
                  checked={pinnable && edit.selected.has(p.steamId!)}
                  onChange={() => pinnable && edit.toggleSelect(p.steamId!)}
                />
              </td>
              <td>
                <button onClick={() => openPlayer(p.key)} className="wor-name" style={{ textAlign: 'left' }}>
                  {p.name}
                </button>
                {moved && <span style={{ color: 'var(--ink-3)' }}> → {staged}</span>}
              </td>
              <td>
                {pinnable ? (
                  <select
                    value={value}
                    onChange={(e) => edit.stageMove(p.steamId!, e.target.value)}
                      >
                    {!edit.allRegiments.includes(value) && <option value={value}>{value}</option>}
                    {edit.allRegiments.map((label) => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ color: 'var(--ink-3)' }} title="No steam id — cannot reassign individually">—</span>
                )}
              </td>
              <td className="num">{p.kills}</td>
              <td className="num">{p.deaths}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Rounds ───────────────────────────────────────────────────────────────────

function RoundsTab({ rounds, openRound }: { rounds: RoundSummary[]; openRound: (f: string) => void }) {
  const [page, setPage] = useState(0);
  const PAGE = 8;
  const byDate = useMemo(() => {
    const m = new Map<string, RoundSummary[]>();
    for (const r of rounds) {
      const d = dateOf(r.recordedAt);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(r);
    }
    return [...m.entries()];
  }, [rounds]);
  if (rounds.length === 0) {
    return (
      <Panel title="Rounds">
        <EmptyHint>Import scoreboards to see rounds</EmptyHint>
      </Panel>
    );
  }
  const pageCount = Math.max(1, Math.ceil(byDate.length / PAGE));
  const current = Math.min(page, pageCount - 1);
  const offset = current * PAGE;
  const pageDates = byDate.slice(offset, offset + PAGE);
  return (
    <div>
      {pageDates.map(([date, list]) => (
        <Panel key={date} title={date} right={`${list.length} rounds`} collapsible defaultOpen storageKey={`rounds-${date}`} flush>
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Map</th><th>Mode</th><th>Area</th><th>Winner</th>
                <th className="num">Length</th><th className="num">Players</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.sourceFilename} className="click" onClick={() => openRound(r.sourceFilename)}>
                  <td style={{ color: 'var(--ink-3)' }}>{timeOf(r.recordedAt)}</td>
                  <td className="wor-name">{r.map}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{r.mode}</td>
                  <td style={{ color: 'var(--ink-3)' }}>{r.area ?? '—'}</td>
                  <td>{r.winner && <Pill tone={teamTone(r.winner)}>{r.winner}</Pill>}</td>
                  <td className="num">{fmtDuration(r.durationSeconds)}</td>
                  <td className="num" style={{ color: 'var(--ink-3)' }}>{r.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
      <Pager page={current} pageCount={pageCount} onPage={setPage} offset={offset} shown={pageDates.length} total={byDate.length} noun="dates" />
    </div>
  );
}

// ── Import ───────────────────────────────────────────────────────────────────

function ImportTab({
  stats,
  listText,
  setListText,
  importMsg,
  fileRef,
  onPickFiles,
  onOpenScoreboard,
}: {
  stats: ReturnType<typeof useStats>;
  listText: string;
  setListText: (s: string) => void;
  importMsg: string | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPickFiles: (files: FileList | null) => void;
  onOpenScoreboard: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const PAGE = 15;
  const sortedStored = useMemo(
    () => stats.stored.slice().sort((a, b) => (b.scoreboard.recordedAt ?? '').localeCompare(a.scoreboard.recordedAt ?? '')),
    [stats.stored],
  );
  const importPageCount = Math.max(1, Math.ceil(sortedStored.length / PAGE));
  const importPage = Math.min(page, importPageCount - 1);
  const importOffset = importPage * PAGE;
  const importItems = sortedStored.slice(importOffset, importOffset + PAGE);
  return (
    <div className="pcols">
      <Panel title="Import scoreboards">
        <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
        <button className="gh live" onClick={() => fileRef.current?.click()}>
          <Upload size={12} /> Choose scoreboard CSVs
        </button>
        {importMsg && <p className="note" style={{ marginTop: 9 }}>{importMsg}</p>}
        <div className="cap" style={{ margin: '18px 0 5px' }}>Regiment list — optional override</div>
        <textarea
          value={listText}
          onChange={(e) => setListText(e.target.value)}
          placeholder={'One per line. e.g.\n51stNY\nII Corps = II-, II'}
          rows={6}
        />
        <button className="gh" style={{ marginTop: 9 }} onClick={() => void stats.applyRegimentList(listText)}>
          Apply and persist to all players
        </button>
      </Panel>

      <Panel title={`Imported (${stats.stored.length})`}>
        {stats.stored.length === 0 ? (
          <EmptyHint>No scoreboards imported yet</EmptyHint>
        ) : (
          <>
            <table>
              <tbody>
                {importItems.map((s) => (
                  <tr key={s.id} className="click" onClick={() => onOpenScoreboard(s.id)} title="View the full scoreboard">
                    <td style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                      {s.scoreboard.recordedAt
                        ? `${dateOf(s.scoreboard.recordedAt)} ${timeOf(s.scoreboard.recordedAt)}`
                        : s.scoreboard.sourceFilename}
                    </td>
                    <td className="wor-name">{s.scoreboard.meta.map}</td>
                    <td style={{ color: 'var(--ink-2)' }}>
                      {s.scoreboard.meta.mode}
                      {s.scoreboard.meta.area && <span style={{ color: 'var(--ink-3)' }}> · {s.scoreboard.meta.area}</span>}
                    </td>
                    <td>
                      {s.scoreboard.meta.winner && (
                        <Pill tone={teamTone(s.scoreboard.meta.winner)}>{s.scoreboard.meta.winner}</Pill>
                      )}
                    </td>
                    <td className="num">
                      <button
                        className="gh c-danger"
                        onClick={(e) => { e.stopPropagation(); void stats.remove(s.id); }}
                        title="Delete this scoreboard"
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager
              page={importPage}
              pageCount={importPageCount}
              onPage={setPage}
              offset={importOffset}
              shown={importItems.length}
              total={sortedStored.length}
              noun="scoreboards"
            />
          </>
        )}
      </Panel>
    </div>
  );
}
