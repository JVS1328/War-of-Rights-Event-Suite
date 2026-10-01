import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Trophy, Calendar, Plus, Trash2, Edit2, Save, X,
  BarChart3, TrendingUp, Award, Download, Upload, Settings,
  ChevronDown, ChevronRight, Star, Target, Map, Flame, Shield, Swords, Maximize2, Zap, Share2,
  CheckCircle2, FileText, Sun, Moon, MoreVertical, Clock, Copy
} from 'lucide-react';
import StatsArea from './components/stats/StatsArea';
import { TicketPct } from './components/stats/drawerPrimitives';
import { ThemeControls } from './components/ThemeControls';
import { averageMorale, MORALE_STATES } from './stats/morale';
import {
  generateShortShareUrl,
  generateShortEventShareUrl,
  generateShortStatsShareUrl,
  generateShortFullShareUrl,
} from './utils/shareSeason';
import { statsRepo } from './stats/repo';
import { isStatsBundle, OVERALL_SCOPE, effectiveAliasMap, effectiveScopedMap, aliasMapBySource, scopedMapBySource } from './stats/statsBundle';
import { computeRegimentBreakdown, computeRegimentContextStats, computeTokenTicketShares } from './stats/statsEngine';
import { parseRegimentList } from './stats/regimentMatcher';
import { deriveTokenSnaps, accumulateTokenSnaps, accumulateTokenSnapsScoped, unitSnapAvgTd, unitSnapAvgTk, deriveTokenPlayerCounts, deriveTokenContextSnaps, normalizeScopedTokenRegiments, effectiveTokenRegiments, unionTokenRegiments } from './stats/unitStats';
import { FORMATION_SHORT, formatAvgT, formatPct, perPlayerRate, formatRate, AVG_TD_LABEL, AVG_TK_LABEL, KILL_RATE_LABEL, LOSS_RATE_LABEL, AVG_TICKET_INFLICTED_LABEL, AVG_TICKET_RECEIVED_LABEL } from './stats/labels';
import {
  migrateToV2,
  migrateLegacyFlatToV2,
  makeDefaultAppState,
  makeDefaultPlayoffConfig as getDefaultPlayoffConfig,
  makeDefaultBalancerSettings as getDefaultBalancerSettings,
  getActiveEvent,
  getActiveSeason,
  updateActiveSeason,
  updateActiveEvent,
  setActiveEvent,
  setActiveSeason,
  addEvent,
  renameActiveEvent,
  removeActiveEvent,
  addSeasonToActiveEvent,
  appendSeasonToActiveEvent,
  renameActiveSeason,
  removeActiveSeason,
  ensureUnitInRegistry,
  renameUnitInEvent,
  renameUnitInActiveSeason,
  removeUnitFromRegistry,
  isUnitReferencedInEvent,
  flattenActiveToLegacy,
  defaultSeasonIdFor,
  openOnLatestSeason,
  setUnitLogo,
  logoForUnit,
  seasonLogos,
} from './utils/eventStore';
import { nextSeasonName } from './utils/seasonOrder';
import {
  replayEvent,
  replayActiveSeasonUpToWeek,
  replayEventFromAppState,
  replayActiveSeasonUpToWeekFromAppState,
  computeExpectedA,
  accumulateMapHistoryFromSeasons,
} from './utils/eloEngine';
import { MAP_AREAS, ALL_MAPS, mapAttacker, mapMode } from './stats/mapCatalog';
import { CompanyConfigFields, CompanyList } from './components/CompanyBalancer';
import { BalanceSwaps } from './components/BalanceSwaps';
import { EloLadder } from './components/EloLadder';
import { Shell } from './components/Shell';
import { SeasonOverview, StandingsScreen, ScheduleScreen } from './components/season/SeasonScreens';
import { StandingsImagePanel } from './components/season/StandingsImage';
import { UnitLogos } from './components/season/UnitLogos';
import { NightBuilder, RT_RULES } from './components/season/NightBuilder';
import { Balancer } from './components/season/Balancer';
import { RosterScreen, RenameDialog } from './components/season/Roster';
import { Playoffs } from './components/season/Playoffs';
import { buildEloLadder } from './utils/eloLadder';
import { CompanySplitter } from './components/CompanySplitter';
import { DEFAULT_COMPANY_SIDE, clampSideConfig, distributeCompanies, parseRosterPaste, rosterFromCounts } from './utils/companySplit';
import {
  LEADS_PER_NIGHT,
  ROUNDS_PER_NIGHT,
  buildLeadSchedule,
  plannedNightCount,
  scheduleExportRows,
  summarizeLeadSpacing,
  toCsv,
  toTsv,
  weekLeadRounds,
} from './utils/leadSchedule';
import {
  MAX_KNOCKOUT_FIELD,
  MIN_FIELD as MIN_PLAYOFF_FIELD,
  STAGE_KEYS,
  evaluateFormat as evaluatePlayoffFormat,
  formatNights,
  knockoutRoundName,
  knockoutSeedOrder,
  knockoutStageKey,
  leagueAdvice as playoffLeagueAdvice,
  nextPowerOfTwo,
  suggestFormats as suggestPlayoffFormats,
  LIMITS as PLAYOFF_LIMITS,
} from './utils/playoffPlanner';
import { balanceTeams, describeFailure as describeBalanceFailure } from './utils/balanceTeams';
import { nightLeadPairs } from './utils/nightLeads';
import { CloudPanel } from './admin/CloudPanel';
import { generatePlayoffBracket as buildPlayoffBracket, bracketSlots } from './utils/playoffBracket';
import {
  getEffectiveTeams,
  seasonPoints,
  standingRows as standingRowsOf,
  nightRows as nightRowsOf,
  seasonKpis as seasonKpisOf,
  rosterRows as rosterRowsOf,
  eloLadderRows as eloLadderRowsOf,
  rankingAfter as rankingAfterOf,
} from './utils/seasonView';
import {
  parseSchedulePaste,
  auditSchedule,
  scheduleWeeks,
  describeProblem as describeScheduleProblem,
} from './utils/scheduleImport';
import { buildPairHeatmap } from './utils/pairHeatmap';
import { PairingsScreen } from './components/season/PairingsScreen';
import { ScheduleMaker } from './components/season/ScheduleMaker';
import { nightType, leadsPerNight, nightPlayed } from './stats/nightMatchup';

/**
 * The four kinds of night, and the flags each one sets. Exclusive by
 * construction: picking one clears the other two, so a week can never carry
 * more than one kind.
 */
/**
 * The bracket stages the settings expose, in the order they are played. The
 * wildcard round is only drawn when there are wildcard seats, but its length is
 * still worth setting up front rather than only once the field is known.
 */
const PLAYOFF_STAGES = [
  { key: 'wildcard', label: 'wildcard', note: 'only drawn when there are wildcard seats' },
  { key: 'divisional', label: 'divisional', note: '1 round = a single game' },
  { key: 'conference', label: 'conference', note: '2 and 3 are the same series: first to 2' },
  { key: 'finals', label: 'finals', note: 'the championship night' },
];

/** Keep a typed number inside the planner's own bounds. */
const clampTo = ({ min, max }, raw, fallback) => {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const NIGHT_TYPES = [
  { key: 'Regular', label: 'Regular', hint: 'Two leads, each leading both rounds',
    flags: { isPlayoffs: false, isSingleRoundLeads: false, isFunRound: false } },
  { key: 'Single-round leads', label: 'Single-round leads', hint: 'Four leads — one per side, per round',
    flags: { isPlayoffs: false, isSingleRoundLeads: true, isFunRound: false } },
  { key: 'Playoffs', label: 'Playoffs', hint: 'Four leads, and no points awarded',
    flags: { isPlayoffs: true, isSingleRoundLeads: false, isFunRound: false } },
  { key: 'Fun round', label: 'Fun round', hint: 'Exhibition — no leads, no points, no Elo',
    flags: { isPlayoffs: false, isSingleRoundLeads: false, isFunRound: true } },
];

/**
 * The rail. Everything the app can do is on it — the prototype's rule was that
 * no view hides behind a modal, so each of these is a place you can be rather
 * than a dialog you open.
 */
/** Round type name → the flags a week carries for it. */
const ROUND_TYPE_FLAGS = {
  'Regular':            { isPlayoffs: false, isSingleRoundLeads: false, isFunRound: false },
  'Single round leads': { isPlayoffs: false, isSingleRoundLeads: true,  isFunRound: false },
  'Playoffs':           { isPlayoffs: true,  isSingleRoundLeads: false, isFunRound: false },
  'Fun round':          { isPlayoffs: false, isSingleRoundLeads: false, isFunRound: true },
};

/** Weight key on the balancer screen → the field the season stores it in. */
const BALANCER_WEIGHT_FIELD = {
  teammate: 'teammateWeight',
  avgDiff: 'avgDiffWeight',
  regimentCount: 'regimentCountWeight',
  rangeSimilarity: 'rangeSimilarityWeight',
  divisionOpposition: 'divisionOppositionWeight',
  postSeasonSkill: 'postSeasonSkillWeight',
};

const RAIL_NAV = [
  { title: 'Season', items: [
    { key: 'dash', label: 'Overview' },
    { key: 'standings', label: 'Standings' },
    { key: 'roster', label: 'Season roster' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'night', label: 'Night builder' },
    { key: 'balancer', label: 'Balancer' },
    { key: 'week', label: 'Night matchup' },
    { key: 'playoffs', label: 'Playoffs' },
    { key: 'simulator', label: 'Schedule maker' },
    { key: 'elo', label: 'Elo ladder' },
    { key: 'heat', label: 'Pairings' },
  ]},
  { title: 'Player stats', items: [
    { key: 'stats-overview', label: 'Stats overview' },
    { key: 'stats-round', label: 'Round matchup' },
    { key: 'stats-rounds', label: 'Rounds' },
    { key: 'stats-players', label: 'Players' },
    { key: 'stats-player', label: 'Player card' },
    { key: 'stats-regiments', label: 'Units' },
    { key: 'stats-unit', label: 'Unit card' },
    { key: 'stats-compare', label: 'Compare' },
    { key: 'stats-maps', label: 'Maps' },
  ]},
  { title: 'Setup', items: [
    { key: 'events', label: 'Events & seasons' },
    { key: 'identity', label: 'Unit & player identity' },
    { key: 'splitter', label: 'Company splitter' },
    { key: 'settings', label: 'Settings' },
    { key: 'stats-import', label: 'Import rounds' },
    { key: 'share', label: 'Share & export' },
    { key: 'cloud', label: 'Publish to the site' },
  ]},
];

/** Screens where "add a week" is the next thing to do, and so worth saying. */
const SEASON_SCREENS = new Set(RAIL_NAV[0].items.map(i => i.key));

/** Screens the season/all-seasons scope changes the meaning of. */
const STATS_SCREENS = new Set(
  RAIL_NAV[1].items.map(i => i.key).concat(['week', 'stats-import'])
);

/** Screens that draw the tracker's own scoreboard-derived unit figures. */
const SCOREBOARD_SCREENS = new Set(['elo', 'stats-regiments', 'events']);

/** Rail key → the sub-tab the stats panel should be showing. */
const STATS_TAB_OF = {
  'stats-overview': 'overview',
  'stats-round': 'round',
  'stats-rounds': 'rounds',
  'stats-player': 'player',
  'stats-unit': 'unit',
  'stats-players': 'players',
  'stats-regiments': 'regiments',
  'stats-compare': 'compare',
  'stats-maps': 'maps',
  'stats-import': 'import',
  week: 'nights',
};

const STORAGE_KEY = 'WarOfRightsSeasonTracker';

// Map names, area grouping, and attacker info come from the single-source-of-
// truth catalog (canonical scoreboard spellings, incl. Conquest/Contention).
const MAPS = MAP_AREAS;

// Tracker | Player Stats | Company Splitter view toggle
const VIEW_MODES = { tracker: 'Tracker', stats: 'Player Stats', splitter: 'Company Splitter' };

/** One figure in the simulation summary: big number, label, optional hint. */
const SimStat = ({ label, value, hint }) => (
  <div className="panel pb">
    <div className="text-xs text-text-secondary">{label}</div>
    <div className="text-xl font-bold tabular-nums">{value}</div>
    {hint && <div className="text-xs text-text-secondary mt-0.5">{hint}</div>}
  </div>
);

/** Rounded to one decimal, or an em dash when there is nothing to show. */
const oneDecimal = (value) => (value === null || value === undefined ? '—' : value.toFixed(1));

const SeasonTracker = ({ initialShareData = null }) => {
  // v2 app state: events → seasons. All persisted state lives here. Existing
  // top-level field names (units, weeks, etc.) are bound to the active
  // season/event below so the rest of the component reads/writes them as
  // before; only the underlying storage shape is new.
  const [appState, setAppState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // Every load opens on the most recent season, whatever was active when the
      // tab was closed — the season being played now is the one you want.
      return openOnLatestSeason(migrateToV2(saved ? JSON.parse(saved) : null));
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      return makeDefaultAppState();
    }
  });

  const activeEvent = getActiveEvent(appState);
  const activeSeason = getActiveSeason(appState);

  // Bind a season-level field as a [value, setter] pair mirroring useState.
  // Setter accepts either a value or an updater function.
  const seasonField = (field) => [
    activeSeason[field],
    (next) => setAppState(prev => updateActiveSeason(prev, s => ({
      ...s,
      [field]: typeof next === 'function' ? next(s[field]) : next,
    }))),
  ];
  const eventField = (field) => [
    activeEvent[field],
    (next) => setAppState(prev => updateActiveEvent(prev, e => ({
      ...e,
      [field]: typeof next === 'function' ? next(e[field]) : next,
    }))),
  ];

  // Season-level persisted state
  const [units, setUnits] = seasonField('units');
  const [nonTokenUnits, setNonTokenUnits] = seasonField('nonTokenUnits');
  const [weeks, setWeeks] = seasonField('weeks');
  const [selectedWeek, setSelectedWeek] = seasonField('selectedWeek');
  const [teamNames, setTeamNames] = seasonField('teamNames');
  const [pointSystem, setPointSystem] = seasonField('pointSystem');
  const [manualAdjustments, setManualAdjustments] = seasonField('manualAdjustments');
  const [unitPlayerCounts, setUnitPlayerCounts] = seasonField('unitPlayerCounts');
  const [divisions, setDivisions] = seasonField('divisions');
  const [mapCooldown, setMapCooldown] = seasonField('mapCooldown');
  const [playoffConfig, setPlayoffConfig] = seasonField('playoffConfig');
  const [balancerSettings, setBalancerSettings] = seasonField('balancerSettings');

  // Event-level persisted state
  const [eloSystem, setEloSystem] = eventField('eloSystem');
  const [eloConfig, setEloConfig] = eventField('eloConfig');

  // Session-only UI state
  // Which screen the rail is showing. `viewMode` survives as a derived value so
  // the blocks that still switch on it keep working while they move across.
  const [screen, setScreen] = useState('dash');
  // The unit the identity screen's rename dialog is open on.
  const [identityRenaming, setIdentityRenaming] = useState(null);
  const viewMode =
    screen === 'splitter' ? 'splitter'
    : STATS_SCREENS.has(screen) ? 'stats'
    : 'tracker';
  const setViewMode = (mode) =>
    setScreen(mode === 'splitter' ? 'splitter' : mode === 'stats' ? 'stats-overview' : 'dash');
  const goScreen = (key) => {
    setScreen(key);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  // Player-stats season scope: when true, the stats view aggregates every
  // season ("Overall"); when false it follows the active season. Starts on the
  // active season — which loads as the most recent one — because that is what
  // "the stats" means day to day; Overall is a step back, not the starting
  // point. Stats-only: it never changes which season the tracker is editing.
  const [statsAllSeasons, setStatsAllSeasons] = useState(false);
  const [showCasualtyModal, setShowCasualtyModal] = useState(false);
  const [showMapBiasModal, setShowMapBiasModal] = useState(false);
  const [heatmapScope, setHeatmapScope] = useState('season'); // 'season' | 'event'
  const [heatmapMode, setHeatmapMode] = useState('together'); // 'together' | 'against'
  const [tiiGloss, setTiiGloss] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [simulationAnalytics, setSimulationAnalytics] = useState(null);
  const [showGroupedStandings, setShowGroupedStandings] = useState(false);
  const [showNonTokenElo, setShowNonTokenElo] = useState(true);
  const [rankByElo, setRankByElo] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [editingWeek, setEditingWeek] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [enlargedSection, setEnlargedSection] = useState(null);
  
  // Player-stat assignment: scoreboard data loaded from the stats repo (for the
  // Assign-stats modal and the live per-unit stats in the Stats view), plus the
  // token currently being assigned in the sub-modal.
  const [sbStored, setSbStored] = useState([]);
  const [sbAssignments, setSbAssignments] = useState({});
  const [sbAliases, setSbAliases] = useState({});
  const [assignToken, setAssignToken] = useState(null);
  const [assignSel, setAssignSel] = useState([]);
  // Scope the Assign dialog writes to: OVERALL_SCOPE (all seasons) or a season id.
  const [assignScope, setAssignScope] = useState(OVERALL_SCOPE);
  const [expandedUnits, setExpandedUnits] = useState(new Set());
  // The night the Units screen reads "as of". Its own, not the night builder's
  // cursor — null follows the latest night with rounds bound to it.
  const [unitsAsOfId, setUnitsAsOfId] = useState(null);

  // Balancer state
  const [balancerMaxDiff, setBalancerMaxDiff] = useState(1);
  const [balancerUnitCounts, setBalancerUnitCounts] = useState({});
  const [balancerOpposingPairs, setBalancerOpposingPairs] = useState([]);
  const [balancerResults, setBalancerResults] = useState(null); // Now an array of options
  const [selectedBalanceIndex, setSelectedBalanceIndex] = useState(0);
  const [balancerStatus, setBalancerStatus] = useState('');
  // Units the balancer left out because they field nobody this night.
  const [balancerSatOut, setBalancerSatOut] = useState([]);
  // Units already on a side that the user has thrown back into the pool, so
  // this run is free to move them. Everything else on a side is held there.
  const [balancerReleased, setBalancerReleased] = useState([]);
  const [draggedUnit, setDraggedUnit] = useState(null);
  const [previewTeams, setPreviewTeams] = useState(null);
  const [draggedMainUnit, setDraggedMainUnit] = useState(null);
  
  // Coord sheet paste state
  const [showCoordPasteModal, setShowCoordPasteModal] = useState(false);
  const [coordPasteText, setCoordPasteText] = useState('');
  const [coordParsedRows, setCoordParsedRows] = useState([]);
  const [coordNewUnitDrafts, setCoordNewUnitDrafts] = useState({});

  // Simulation state
  const [simLeadNightsPerUnit, setSimLeadNightsPerUnit] = useState(2);
  const [simLeadNightsInDivision, setSimLeadNightsInDivision] = useState(0);
  const [simScheduleOnly, setSimScheduleOnly] = useState(false);
  const [simLeadMode, setSimLeadMode] = useState('fullWeeks'); // 'fullWeeks' or 'rounds'
  const [simSource, setSimSource] = useState('paste'); // 'paste' | 'generate'
  // Paste-a-schedule: the raw text plus the home/away plan it is checked against.
  const [simPaste, setSimPaste] = useState('');
  const [simHomePerUnit, setSimHomePerUnit] = useState(2);
  const [simAwayPerUnit, setSimAwayPerUnit] = useState(2);
  const [simSplitRounds, setSimSplitRounds] = useState(true);
  const [scheduleCopied, setScheduleCopied] = useState(false);

  // Nights the calendar can give the post-season — the planner's one input that
  // isn't already in the season, so it stays local rather than in the schema.
  const [playoffNights, setPlayoffNights] = useState(3);

  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowMenuRef = React.useRef(null);

  // Generic choice dialog — used wherever we used to call window.prompt()
  // for a discrete list of actions (Share kind, ADD vs REPLACE on import,
  // etc). State holds the open dialog spec; askChoice returns a Promise
  // that resolves to the chosen value (or null if dismissed).
  const [choiceDialog, setChoiceDialog] = useState(null);
  const askChoice = ({ title, message, choices }) => new Promise(resolve => {
    setChoiceDialog({
      title, message, choices,
      onChoose: (value) => { setChoiceDialog(null); resolve(value); },
      onClose:  ()      => { setChoiceDialog(null); resolve(null);  },
    });
  });

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  useEffect(() => {
    if (!showOverflowMenu) return;
    const handleClickOutside = (e) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target)) {
        setShowOverflowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOverflowMenu]);

  // Save the v2 app state to localStorage whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [appState]);

  // Load shared data from URL (once, on mount). v1 / v2-season payloads
  // arrive as { kind: 'season', payload: <flat> }; v2-event payloads arrive
  // as { kind: 'event', event: <Event> }. Each is offered an action via the
  // ChoiceDialog; "add to existing" appends without replacing.
  useEffect(() => {
    if (!initialShareData) return;
    const dismiss = () => window.history.replaceState(null, '', window.location.pathname);

    (async () => {
      // Note: player-stats-only shares (kind === 'stats') never reach here —
      // App routes them to the read-only SharedStatsView page instead.
      if (initialShareData.kind === 'event' || initialShareData.kind === 'full') {
        const evt = initialShareData.event;
        const bundle = initialShareData.kind === 'full' ? initialShareData.bundle : null;
        const sbCount = isStatsBundle(bundle) ? bundle.scoreboards.length : 0;
        const statsNote = sbCount ? ` Includes ${sbCount} scoreboard${sbCount === 1 ? '' : 's'} of player stats.` : '';
        const choice = await askChoice({
          title: 'Import shared event',
          message: `"${evt.name}" — ${evt.seasons.length} season${evt.seasons.length === 1 ? '' : 's'}, ${Object.keys(evt.unitRegistry || {}).length} units in registry.${statsNote}`,
          choices: [
            { value: 'add',     label: 'Add as new event',         description: 'Append a new event without touching your current one.', variant: 'primary' },
            { value: 'replace', label: 'Replace active event',     description: 'Overwrites the current active event in place.',         variant: 'danger'  },
            { value: null,      label: 'Cancel', variant: 'cancel' },
          ],
        });
        if (choice === 'add') {
          setAppState(prev => ({
            ...prev,
            events: [...prev.events, evt],
            activeEventId: evt.id,
            activeSeasonId: defaultSeasonIdFor(evt),
          }));
        } else if (choice === 'replace') {
          setAppState(prev => ({
            ...prev,
            events: prev.events.map(e => e.id === prev.activeEventId ? evt : e),
            activeEventId: evt.id,
            activeSeasonId: defaultSeasonIdFor(evt),
          }));
        }
        if (choice && sbCount) {
          try { await statsRepo.importEventStats(evt.id, bundle); } catch { /* ignore */ }
        }
        dismiss();
        return;
      }

      // Season payload (v1 or v2)
      const choice = await askChoice({
        title: 'Import shared season',
        message: 'A shared season payload — add it under your active event, or start a fresh event with just this season?',
        choices: [
          { value: 'add', label: 'Add as new season',  description: 'Appends under your active event; new unit names merge into the registry.', variant: 'primary'   },
          { value: 'new', label: 'Start fresh event',  description: 'Wipes your current state and creates a new event with just this season.',  variant: 'danger'    },
          { value: null,  label: 'Cancel', variant: 'cancel' },
        ],
      });
      if (choice === 'new') {
        setAppState(migrateLegacyFlatToV2(initialShareData.payload));
      } else if (choice === 'add') {
        const migrated = migrateLegacyFlatToV2(initialShareData.payload);
        const importedSeason = migrated.events[0].seasons[0];
        const importedRegistryNames = Object.values(migrated.events[0].unitRegistry).map(u => u.name);
        setAppState(prev => appendSeasonToActiveEvent(prev, importedSeason, importedRegistryNames));
      }
      dismiss();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Unit Management — adding to a season's roster also ensures the unit is in
  // the event-level registry. Removing only strips the active season's
  // references; the registry entry persists so historical references in
  // other seasons resolve unchanged.
  const addUnit = () => {
    const name = newUnitName.trim();
    if (!name) return;
    if (units.includes(name)) {
      alert('Unit already exists!');
      return;
    }
    setAppState(prev => {
      const withReg = ensureUnitInRegistry(prev, name);
      return updateActiveSeason(withReg, s => ({ ...s, units: [...s.units, name].sort() }));
    });
    setNewUnitName('');
  };

  const removeUnit = (unitName) => {
    if (!confirm(`Remove ${unitName} from this season? It stays in the event registry so historical references in other seasons are preserved.`)) return;

    setAppState(prev => updateActiveSeason(prev, s => ({
      ...s,
      units: (s.units || []).filter(u => u !== unitName),
      nonTokenUnits: (s.nonTokenUnits || []).filter(u => u !== unitName),
      weeks: (s.weeks || []).map(week => ({
        ...week,
        teamA: (week.teamA || []).filter(u => u !== unitName),
        teamB: (week.teamB || []).filter(u => u !== unitName),
      })),
    })));
  };

  // Rename a unit from the roster: this season only (adding a new name to the
  // registry), or — scope 'event' — the registry entry and every season.
  const renameUnit = (oldName, newName, scope) => {
    setAppState(prev => scope === 'event'
      ? renameUnitInEvent(prev, oldName, newName)
      : renameUnitInActiveSeason(prev, oldName, newName));
  };

  // Toggle non-token status for a unit
  const toggleNonTokenStatus = (unitName) => {
    if (nonTokenUnits.includes(unitName)) {
      setNonTokenUnits(nonTokenUnits.filter(u => u !== unitName));
    } else {
      setNonTokenUnits([...nonTokenUnits, unitName]);
    }
  };

  // Week Management
  const addWeek = () => {
    // Get unitPlayerCounts from the most recent week, or use global defaults
    let inheritedUnitPlayerCounts = {};
    if (weeks.length > 0) {
      const lastWeek = weeks[weeks.length - 1];
      if (lastWeek.unitPlayerCounts && Object.keys(lastWeek.unitPlayerCounts).length > 0) {
        inheritedUnitPlayerCounts = { ...lastWeek.unitPlayerCounts };
      } else {
        inheritedUnitPlayerCounts = { ...unitPlayerCounts };
      }
    } else {
      inheritedUnitPlayerCounts = { ...unitPlayerCounts };
    }

    const newWeek = {
      id: Date.now(),
      name: `Week ${weeks.length + 1}`,
      teamA: [],
      teamB: [],
      round1Winner: null,
      round2Winner: null,
      round1Draw: false,
      round2Draw: false,
      round1Map: null,
      round2Map: null,
      round1Flipped: false,
      round2Flipped: false,
      leadA: null,
      leadB: null,
      isPlayoffs: false,
      isSingleRoundLeads: false,
      isFunRound: false,
      leadA_r1: null,
      leadB_r1: null,
      leadA_r2: null,
      leadB_r2: null,
      r1CasualtiesA: 0,
      r1CasualtiesB: 0,
      r2CasualtiesA: 0,
      r2CasualtiesB: 0,
      unitPlayerCounts: inheritedUnitPlayerCounts,
      weeklyCasualties: {
        [teamNames.A]: { r1: {}, r2: {} },
        [teamNames.B]: { r1: {}, r2: {} }
      },
      roundSwaps: { r1: [], r2: [] },
      companyConfig: {
        r1: { A: { ...DEFAULT_COMPANY_SIDE }, B: { ...DEFAULT_COMPANY_SIDE } },
        r2: { A: { ...DEFAULT_COMPANY_SIDE }, B: { ...DEFAULT_COMPANY_SIDE } }
      }
    };
    setWeeks([...weeks, newWeek]);
    // Both callers walk straight to the builder, which is no use looking at an
    // empty picker — the night you just made is the night you meant to open.
    setSelectedWeek(newWeek);
  };

  // Removing a night takes its results with it, and those move the standings
  // and the ladder. Name what is going and say what it carries, because there
  // is no undo and "Remove this week?" does not say which week.
  const removeWeek = (weekId) => {
    const w = weeks.find(x => x.id === weekId);
    if (!w) return;
    const played = [w.round1Winner || w.round1Draw, w.round2Winner || w.round2Draw].filter(Boolean).length;
    const carries = [
      played ? `${played} recorded round${played === 1 ? '' : 's'}` : null,
      (w.teamA?.length || w.teamB?.length) ? `${(w.teamA?.length || 0) + (w.teamB?.length || 0)} unit assignments` : null,
    ].filter(Boolean);
    const what = carries.length ? `\n\nIt carries ${carries.join(' and ')}, and the standings and Elo will be recalculated without them.` : '';
    if (!confirm(`Remove "${w.name}" from ${activeSeason?.name ?? 'this season'}?${what}\n\nThis cannot be undone.`)) return;
    setWeeks(weeks.filter(x => x.id !== weekId));
    if (selectedWeek?.id === weekId) setSelectedWeek(null);
  };

  // Compute maps on cooldown relative to a given week index
  const getMapsOnCooldown = (weekIndex) => {
    if (mapCooldown <= 0) return new Set();
    const cooldownMaps = new Set();
    const start = Math.max(0, weekIndex - mapCooldown);
    for (let i = start; i < weekIndex; i++) {
      const w = weeks[i];
      // Fun rounds are exhibition — their map picks don't go on cooldown.
      if (w.isFunRound) continue;
      if (w.round1Map) cooldownMaps.add(w.round1Map);
      if (w.round2Map) cooldownMaps.add(w.round2Map);
    }
    return cooldownMaps;
  };

  const updateWeek = (weekId, updates) => {
    setWeeks(weeks.map(w => w.id === weekId ? { ...w, ...updates } : w));
    if (selectedWeek?.id === weekId) {
      setSelectedWeek({ ...selectedWeek, ...updates });
    }
  };

  const renameWeek = (weekId, newName) => {
    updateWeek(weekId, { name: newName });
    setEditingWeek(null);
  };

  // Get effective teams for a specific round, accounting for unit swaps
  // Team Management
  // Move a unit onto a side, or — with 'bench' — off the night entirely. The
  // unit is always removed from wherever it was first, so a drag can never
  // leave it on two sides at once.
  const moveUnitToTeam = (unit, team) => {
    if (!selectedWeek) return;

    if (team === 'bench') {
      updateWeek(selectedWeek.id, {
        teamA: (selectedWeek.teamA || []).filter(u => u !== unit),
        teamB: (selectedWeek.teamB || []).filter(u => u !== unit),
      });
      return;
    }

    const otherTeam = team === 'A' ? 'B' : 'A';
    updateWeek(selectedWeek.id, {
      [`team${team}`]: [...(selectedWeek[`team${team}`] || []).filter(u => u !== unit), unit],
      [`team${otherTeam}`]: (selectedWeek[`team${otherTeam}`] || []).filter(u => u !== unit),
    });
  };

  const removeUnitFromTeam = (unit, team) => {
    if (!selectedWeek) return;
    
    const updates = {
      [`team${team}`]: selectedWeek[`team${team}`].filter(u => u !== unit)
    };
    
    updateWeek(selectedWeek.id, updates);
  };

  // Points and record per token unit, from the shared season derivations so
  // the public site's standings are the same numbers as these.
  const calculatePointsUpToWeek = (maxWeekIdx = null) => seasonPoints(activeSeason, maxWeekIdx);

  // Calculate Points (for entire season)
  const calculatePoints = () => {
    return calculatePointsUpToWeek(null);
  };

  // Get standings with Elo
  const getStandings = () => {
    const stats = calculatePoints();
    const { eloRatings, roundsPlayed } = calculateEloRatings();
    
    return Object.entries(stats)
      .map(([unit, data]) => ({
        unit,
        ...data,
        elo: eloRatings[unit] || eloSystem.initialElo,
        rounds: roundsPlayed[unit] || 0
      }))
      .sort((a, b) => b.points - a.points);
  };

  // Get standings with week-over-week changes
  const getStandingsWithChanges = () => {
    const currentWeekIdx = selectedWeek ? weeks.findIndex(w => w.id === selectedWeek.id) : weeks.length - 1;
    const previousWeekIdx = currentWeekIdx - 1;

    // Current week stats - calculate up to current week only
    const currentStats = calculatePointsUpToWeek(currentWeekIdx);
    const { eloRatings: currentElo, roundsPlayed } = calculateEloRatings(currentWeekIdx);
    
    // Previous week stats (if exists)
    let previousStats = {};
    let previousElo = {};
    let previousEloRanks = {};
    if (previousWeekIdx >= 0) {
      previousStats = calculatePointsUpToWeek(previousWeekIdx);
      const prevEloData = calculateEloRatings(previousWeekIdx);
      previousElo = prevEloData.eloRatings;
      
      // Calculate previous Elo ranks (exclude non-token units)
      const prevEloStandings = Object.entries(previousElo)
        .filter(([unit]) => !nonTokenUnits.includes(unit))
        .map(([unit, elo]) => ({ unit, elo }))
        .sort((a, b) => b.elo - a.elo);
      
      prevEloStandings.forEach((stat, index) => {
        previousEloRanks[stat.unit] = index + 1;
      });
    }

    // Calculate previous ranks (by points)
    const previousRanks = {};
    if (previousWeekIdx >= 0) {
      const prevStandings = Object.entries(previousStats)
        .map(([unit, data]) => ({ unit, points: data.points }))
        .sort((a, b) => b.points - a.points);
      
      prevStandings.forEach((stat, index) => {
        previousRanks[stat.unit] = index + 1;
      });
    }

    // Build current standings with changes
    const standings = Object.entries(currentStats)
      .map(([unit, data]) => {
        const currentEloValue = currentElo[unit] || eloSystem.initialElo;
        const previousEloValue = previousElo[unit] || eloSystem.initialElo;
        const eloDelta = currentEloValue - previousEloValue;
        
        const previousRank = previousRanks[unit] || null;
        const previousEloRank = previousEloRanks[unit] || null;

        const pointsDelta = data.points - (previousStats[unit]?.points || 0);

        return {
          unit,
          ...data,
          elo: currentEloValue,
          eloDelta,
          pointsDelta,
          previousRank,
          previousEloRank,
          rounds: roundsPlayed[unit] || 0
        };
      })
      .sort((a, b) => rankByElo ? b.elo - a.elo : b.points - a.points);

    standings.forEach((stat, index) => {
      stat.currentRank = index + 1;
      
      // Check if current week is a playoff week
      const currentWeek = currentWeekIdx >= 0 ? weeks[currentWeekIdx] : null;
      const isCurrentWeekPlayoff = currentWeek?.isPlayoffs || false;
      
      // If ranking by points and current week is playoffs, don't show rank delta
      // (because points don't change during playoffs)
      if (!rankByElo && isCurrentWeekPlayoff) {
        stat.rankDelta = null;
      } else {
        stat.rankDelta = rankByElo
          ? (stat.previousEloRank ? stat.previousEloRank - stat.currentRank : null)
          : (stat.previousRank ? stat.previousRank - stat.currentRank : null);
      }
    });

    return standings;
  };

  // Get grouped standings by division
  const getGroupedStandings = () => {
    const currentWeekIdx = selectedWeek ? weeks.findIndex(w => w.id === selectedWeek.id) : weeks.length - 1;
    const previousWeekIdx = currentWeekIdx - 1;
    
    const allStandings = getStandingsWithChanges();
    
    if (!divisions || divisions.length === 0) {
      return [{ name: 'All Units', units: allStandings }];
    }

    // Calculate previous week's group rankings for delta calculation
    let previousGroupRanks = {};
    if (previousWeekIdx >= 0) {
      const prevStats = calculatePointsUpToWeek(previousWeekIdx);
      const { eloRatings: prevElo } = calculateEloRatings(previousWeekIdx);
      
      const prevStandings = Object.entries(prevStats)
        .map(([unit, data]) => ({
          unit,
          ...data,
          elo: prevElo[unit] || eloSystem.initialElo
        }))
        .sort((a, b) => rankByElo ? b.elo - a.elo : b.points - a.points);
      
      // Calculate previous ranks within each division
      divisions.forEach(division => {
        const divisionUnits = new Set(division.units);
        const prevDivStandings = prevStandings
          .filter(stat => divisionUnits.has(stat.unit));
        
        prevDivStandings.forEach((stat, index) => {
          previousGroupRanks[`${division.name}:${stat.unit}`] = index + 1;
        });
      });
      
      // Handle unassigned units
      const assignedUnits = new Set(divisions.flatMap(d => d.units));
      const prevUnassigned = prevStandings
        .filter(stat => !assignedUnits.has(stat.unit));
      
      prevUnassigned.forEach((stat, index) => {
        previousGroupRanks[`Unassigned:${stat.unit}`] = index + 1;
      });
    }

    const grouped = divisions.map(division => {
      const divisionUnits = new Set(division.units);
      const divisionStandings = allStandings
        .filter(stat => divisionUnits.has(stat.unit))
        .map((stat, index) => {
          const currentRank = index + 1;
          const prevRank = previousGroupRanks[`${division.name}:${stat.unit}`] || null;
          
          // Check if current week is a playoff week
          const currentWeek = currentWeekIdx >= 0 ? weeks[currentWeekIdx] : null;
          const isCurrentWeekPlayoff = currentWeek?.isPlayoffs || false;
          
          // Calculate group-specific rank delta
          let groupRankDelta = null;
          if (!rankByElo && isCurrentWeekPlayoff) {
            groupRankDelta = null; // Don't show delta in playoffs when ranking by points
          } else if (prevRank !== null) {
            groupRankDelta = prevRank - currentRank;
          }
          
          return {
            ...stat,
            divisionRank: currentRank,
            rankDelta: groupRankDelta // Override with group-specific delta
          };
        });
      
      return {
        name: division.name,
        units: divisionStandings
      };
    });

    const assignedUnits = new Set(divisions.flatMap(d => d.units));
    const unassignedStandings = allStandings
      .filter(stat => !assignedUnits.has(stat.unit))
      .map((stat, index) => {
        const currentRank = index + 1;
        const prevRank = previousGroupRanks[`Unassigned:${stat.unit}`] || null;
        
        // Check if current week is a playoff week
        const currentWeek = currentWeekIdx >= 0 ? weeks[currentWeekIdx] : null;
        const isCurrentWeekPlayoff = currentWeek?.isPlayoffs || false;
        
        // Calculate group-specific rank delta
        let groupRankDelta = null;
        if (!rankByElo && isCurrentWeekPlayoff) {
          groupRankDelta = null;
        } else if (prevRank !== null) {
          groupRankDelta = prevRank - currentRank;
        }
        
        return {
          ...stat,
          divisionRank: currentRank,
          rankDelta: groupRankDelta // Override with group-specific delta
        };
      });
    
    if (unassignedStandings.length > 0) {
      grouped.push({
        name: 'Unassigned',
        units: unassignedStandings
      });
    }

    return grouped;
  };

  // Project an engine mapHistory into the { overall, byMap } shape used by
  // the UI. Attacker/defender breakdowns come from the map catalog's in-game
  // attacker (null for Conquest/Contention, which have no attacker and are
  // excluded from the attacker/defender split — but still count toward
  // USA/CSA win % and casualties).
  const projectMapHistory = (mapHistory) => {
    const byMap = {};
    const zeroForm = () => ({ in_form: 0, skirm: 0, oob: 0 });
    const overall = {
      totalRounds: 0, usaWins: 0, csaWins: 0, draws: 0,
      attackerWins: 0, defenderWins: 0, attackerRounds: 0,
      usaAttackWins: 0, usaAttackRounds: 0,
      usaDefenseWins: 0, usaDefenseRounds: 0,
      csaAttackWins: 0, csaAttackRounds: 0,
      csaDefenseWins: 0, csaDefenseRounds: 0,
      // Casualties + formation makeup, per team and combined.
      usaCasualties: 0, csaCasualties: 0, totalCasualties: 0,
      usaFormation: zeroForm(), csaFormation: zeroForm(), formationTotal: zeroForm(),
    };
    const addInto = (target, src) => {
      target.in_form += src.in_form || 0;
      target.skirm += src.skirm || 0;
      target.oob += src.oob || 0;
    };
    const divForm = (f, n) =>
      n > 0
        ? { in_form: Math.round(f.in_form / n), skirm: Math.round(f.skirm / n), oob: Math.round(f.oob / n) }
        : zeroForm();

    for (const [mapName, entry] of Object.entries(mapHistory)) {
      const attacker = mapAttacker(mapName); // 'USA' | 'CSA' | null (Conquest/Contention)
      const isUsaAttack = attacker === 'USA';
      const usaWins = entry.USA.wins;
      const csaWins = entry.CSA.wins;
      const draws = entry.draws || 0;
      const usaCas = entry.USA.casualtiesTaken;
      const csaCas = entry.CSA.casualtiesTaken;
      const totalCasualties = usaCas + csaCas;

      // Optional per-formation losses. Present only when imported scoreboards
      // (or manual entry) supplied the breakdown; legacy rounds add zeros.
      const usaForm = entry.USA.casualtiesForm || zeroForm();
      const csaForm = entry.CSA.casualtiesForm || zeroForm();
      const formationLosses = {
        in_form: usaForm.in_form + csaForm.in_form,
        skirm: usaForm.skirm + csaForm.skirm,
        oob: usaForm.oob + csaForm.oob,
      };
      const hasFormation = formationLosses.in_form + formationLosses.skirm + formationLosses.oob > 0;
      const avgMoraleUsa = averageMorale(entry.USA.moraleStates || []);
      const avgMoraleCsa = averageMorale(entry.CSA.moraleStates || []);

      byMap[mapName] = {
        plays: entry.plays, usaWins, csaWins, draws,
        attackerWins: attacker === null ? 0 : (isUsaAttack ? usaWins : csaWins),
        defenderWins: attacker === null ? 0 : (isUsaAttack ? csaWins : usaWins),
        hasAttacker: attacker !== null,
        totalCasualties,
        usaCasualties: usaCas, csaCasualties: csaCas,
        avgLossesUsa: entry.plays > 0 ? Math.round(usaCas / entry.plays) : 0,
        avgLossesCsa: entry.plays > 0 ? Math.round(csaCas / entry.plays) : 0,
        avgFormationUsa: divForm(usaForm, entry.plays),
        avgFormationCsa: divForm(csaForm, entry.plays),
        avgMoraleUsa, avgMoraleCsa,
        hasMorale: !!(avgMoraleUsa || avgMoraleCsa),
        formationLosses,
        hasFormation,
      };

      overall.totalRounds += entry.plays;
      overall.usaWins += usaWins;
      overall.csaWins += csaWins;
      overall.draws += draws;
      overall.usaCasualties += usaCas;
      overall.csaCasualties += csaCas;
      overall.totalCasualties += totalCasualties;
      addInto(overall.usaFormation, usaForm);
      addInto(overall.csaFormation, csaForm);
      addInto(overall.formationTotal, formationLosses);

      // Conquest/Contention (attacker === null) have no attacker — skip the
      // attacker/defender split, but they still counted toward win % above.
      if (attacker !== null) {
        overall.attackerRounds += entry.plays;
        if (isUsaAttack) {
          overall.usaAttackRounds += entry.plays;
          overall.csaDefenseRounds += entry.plays;
          overall.usaAttackWins += usaWins;
          overall.csaDefenseWins += csaWins;
          overall.attackerWins += usaWins;
          overall.defenderWins += csaWins;
        } else {
          overall.csaAttackRounds += entry.plays;
          overall.usaDefenseRounds += entry.plays;
          overall.csaAttackWins += csaWins;
          overall.usaDefenseWins += usaWins;
          overall.attackerWins += csaWins;
          overall.defenderWins += usaWins;
        }
      }
    }
    overall.hasFormation =
      overall.formationTotal.in_form + overall.formationTotal.skirm + overall.formationTotal.oob > 0;
    return { overall, byMap };
  };

  // Map stats for an arbitrary slice of seasons. KISS: the engine's
  // accumulator does the math; this just projects to the UI shape.
  const mapStatsForSeasons = (seasons) =>
    projectMapHistory(accumulateMapHistoryFromSeasons(seasons));

  // Event-wide map stats — used by the engine-side win-prob path and the
  // Event tab. `calculateMapStats` retains its legacy name (and event-wide
  // semantics) so the existing call sites still work.
  const calculateMapStats = () => mapStatsForSeasons(activeEvent.seasons);

  // Active-season-only map stats for the Season tab.
  const calculateSeasonMapStats = () => mapStatsForSeasons(activeSeason ? [activeSeason] : []);

  // Per-unit per-map combined record (sums USA + CSA sides). The engine
  // tracks per-side records; legacy callers want the combined view.
  const calculateUnitMapStats = (maxWeekIndex = null) => {
    const result = maxWeekIndex !== null
      ? replayActiveSeasonUpToWeekFromAppState(appState, activeEvent.id, activeSeason.id, maxWeekIndex)
      : replayEventFromAppState(appState, activeEvent.id);

    const out = {};
    for (const [unit, byMap] of Object.entries(result.unitOnMapSide)) {
      out[unit] = {};
      for (const [mapName, sides] of Object.entries(byMap)) {
        out[unit][mapName] = {
          wins: sides.USA.wins + sides.CSA.wins,
          losses: sides.USA.losses + sides.CSA.losses,
        };
      }
    }
    return out;
  };

  // Win probability uses the same engine math as Elo updates: pre-round Elo
  // plus shrunk Elo-equivalent adjustments from map-side and unit-on-map-side
  // history (controlled by event.eloConfig). Returns the legacy shape with a
  // factors object so the existing UI breakdown badges keep working.
  const calculateWinProbability = (teamA, teamB, mapName, flipped, weekIndex) => {
    if (teamA.length === 0 || teamB.length === 0) return null;

    const previousWeekIdx = weekIndex != null ? weekIndex - 1 : weeks.length - 1;
    // Even at week 0, global-scope events get prior-event map history as a
    // seed — the engine produces an empty unit Elo + seeded mapHistory.
    const result = replayActiveSeasonUpToWeekFromAppState(
      appState, activeEvent.id, activeSeason.id,
      previousWeekIdx >= 0 ? previousWeekIdx : -1,
    );

    const playerCountFor = (unit) => {
      const week = weekIndex != null ? weeks[weekIndex] : null;
      const counts = week?.unitPlayerCounts?.[unit] || unitPlayerCounts[unit];
      if (!counts) return 25;
      const min = parseInt(counts.min) || 0;
      const max = parseInt(counts.max) || 0;
      return (min + max) / 2 || 25;
    };

    const exp = computeExpectedA(
      { unitElo: result.unitElo, mapHistory: result.mapHistory, unitOnMapSide: result.unitOnMapSide },
      { teamA, teamB, mapName, flipped, playerCountFor },
      result.eloConfig,
      result.eloSystem.initialElo,
    );

    const probA = Math.max(0.05, Math.min(0.95, exp.expectedA));
    return {
      teamAProb: Math.round(probA * 1000) / 10,
      teamBProb: Math.round((1 - probA) * 1000) / 10,
      factors: {
        elo: { probA: Math.round(exp.eloOnlyProbA * 1000) / 10 },
        globalMap: mapName ? { probA: Math.round(exp.eloPlusMapProbA * 1000) / 10 } : null,
        unitMap: mapName ? { probA: Math.round(probA * 1000) / 10 } : null,
      },
    };
  };

  // Helper function to get unit player count
  const getUnitPlayerCount = (unitName, weekIndex = null) => {
    // If weekIndex is provided and week has specific player counts, use those
    if (weekIndex !== null && weeks[weekIndex]?.unitPlayerCounts?.[unitName]) {
      const counts = weeks[weekIndex].unitPlayerCounts[unitName];
      const min = parseInt(counts.min) || 0;
      const max = parseInt(counts.max) || 0;
      return (min + max) / 2;
    }
    
    // Otherwise use global player counts
    if (unitPlayerCounts[unitName]) {
      const counts = unitPlayerCounts[unitName];
      const min = parseInt(counts.min) || 0;
      const max = parseInt(counts.max) || 0;
      return (min + max) / 2;
    }
    
    // Default to 25 if no data
    return 25;
  };

  // Helper to get average player count across weeks a unit participated
  const getUnitAveragePlayerCount = (unitName, maxWeekIndex = null) => {
    const weeksToProcess = maxWeekIndex !== null ? weeks.slice(0, maxWeekIndex + 1) : weeks;
    const weeklyAverages = [];

    weeksToProcess.forEach((week, idx) => {
      const teamA = week.teamA || [];
      const teamB = week.teamB || [];
      
      if (teamA.includes(unitName) || teamB.includes(unitName)) {
        const playerCount = getUnitPlayerCount(unitName, idx);
        if (playerCount > 0) {
          weeklyAverages.push(playerCount);
        }
      }
    });

    if (weeklyAverages.length === 0) return 0;
    return weeklyAverages.reduce((sum, val) => sum + val, 0) / weeklyAverages.length;
  };

  // Calculate Teammate Impact Index (TII)
  const calculateTeammateImpact = (maxWeekIndex = null) => {
    const weeksToProcess = maxWeekIndex !== null ? weeks.slice(0, maxWeekIndex + 1) : weeks;
    
    // Part 1: Collect global loss data
    const totalLossesRecords = [];
    const unitPerformances = {};

    weeksToProcess.forEach(week => {
      // Exhibition — a fun round's result is nobody's win or loss, so it can't
      // be read as a teammate's doing either.
      if (week.isFunRound) return;

      const isPlayoffs = week.isPlayoffs || false;
      const isSingleRoundLeads = week.isSingleRoundLeads || false;

      [1, 2].forEach(roundNum => {
        const winner = week[`round${roundNum}Winner`];
        if (!winner) return;

        const effective = getEffectiveTeams(week, roundNum);
        const winningTeam = winner === 'A' ? effective.teamA : effective.teamB;
        const losingTeam = winner === 'A' ? effective.teamB : effective.teamA;

        // Collect global loss data
        winningTeam.forEach(() => totalLossesRecords.push(0));
        losingTeam.forEach(() => totalLossesRecords.push(1));

        // Get leads for this round
        let leadA, leadB;
        if (isPlayoffs || isSingleRoundLeads) {
          leadA = week[`leadA_r${roundNum}`];
          leadB = week[`leadB_r${roundNum}`];
        } else {
          leadA = week.leadA;
          leadB = week.leadB;
        }

        const winningLead = winner === 'A' ? leadA : leadB;
        const losingLead = winner === 'A' ? leadB : leadA;

        // Track unit performances
        winningTeam.forEach(unit => {
          if (!unitPerformances[unit]) unitPerformances[unit] = [];
          unitPerformances[unit].push([0, unit === winningLead]); // [isLoss, isLead]
        });

        losingTeam.forEach(unit => {
          if (!unitPerformances[unit]) unitPerformances[unit] = [];
          unitPerformances[unit].push([1, unit === losingLead]);
        });
      });
    });

    const globalAvgLossRate = totalLossesRecords.length > 0
      ? totalLossesRecords.reduce((sum, val) => sum + val, 0) / totalLossesRecords.length
      : 0;

    // Part 2: Calculate TII for each unit
    const impactStats = {};
    const participatingUnits = Object.keys(unitPerformances).filter(u => unitPerformances[u].length > 0);
    
    // Calculate league average player count
    const allUnitAvgPlayers = participatingUnits.map(u => getUnitAveragePlayerCount(u, maxWeekIndex));
    const leagueAvgPlayers = allUnitAvgPlayers.length > 0
      ? allUnitAvgPlayers.reduce((sum, val) => sum + val, 0) / allUnitAvgPlayers.length
      : 0;

    units.forEach(unitU => {
      // Calculate teammate loss rates when this unit is present
      const teammateLossRates = [];
      
      weeksToProcess.forEach(week => {
        [1, 2].forEach(roundNum => {
          const winner = week[`round${roundNum}Winner`];
          if (!winner) return;

          const teamA = week.teamA || [];
          const teamB = week.teamB || [];

          if (teamA.includes(unitU)) {
            const teammates = teamA.filter(u => u !== unitU);
            const isLoss = winner === 'B';
            teammates.forEach(() => teammateLossRates.push(isLoss ? 1 : 0));
          } else if (teamB.includes(unitU)) {
            const teammates = teamB.filter(u => u !== unitU);
            const isLoss = winner === 'A';
            teammates.forEach(() => teammateLossRates.push(isLoss ? 1 : 0));
          }
        });
      });

      const avgTeammateLossRate = teammateLossRates.length > 0
        ? teammateLossRates.reduce((sum, val) => sum + val, 0) / teammateLossRates.length
        : 0;
      
      const originalTiiScore = 1 - avgTeammateLossRate;

      // Calculate lead/assist impact
      const performances = unitPerformances[unitU] || [];
      const leadPerformances = performances.filter(p => p[1]).map(p => p[0]);
      const assistPerformances = performances.filter(p => !p[1]).map(p => p[0]);

      const leadImpact = leadPerformances.length > 0
        ? 1 - (leadPerformances.reduce((sum, val) => sum + val, 0) / leadPerformances.length)
        : 0;
      
      const assistImpact = assistPerformances.length > 0
        ? 1 - (assistPerformances.reduce((sum, val) => sum + val, 0) / assistPerformances.length)
        : 0;

      // Player count modifier
      const unitAvgPlayers = getUnitAveragePlayerCount(unitU, maxWeekIndex);
      const playerModifier = leagueAvgPlayers > 0 ? unitAvgPlayers / leagueAvgPlayers : 1.0;

      // Adjusted TII calculation
      const deltaFromAvg = globalAvgLossRate - avgTeammateLossRate;
      const modifiedDelta = deltaFromAvg * playerModifier;
      const modifiedAvgTeammateLossRate = globalAvgLossRate - modifiedDelta;
      const adjustedTiiScore = 1 - modifiedAvgTeammateLossRate;

      impactStats[unitU] = {
        impactScore: originalTiiScore,
        adjustedTiiScore: adjustedTiiScore,
        avgTeammateLossRateWith: avgTeammateLossRate,
        leadImpact: leadImpact,
        assistImpact: assistImpact,
        leadGames: leadPerformances.length,
        assistGames: assistPerformances.length,
        avgPlayers: unitAvgPlayers
      };
    });

    return { impactStats, globalAvgLossRate };
  };

  // Calculate Elo Ratings — thin wrapper over the engine. The engine walks
  // every round in (season, week, round) order and folds map/unit history
  // back into expected probabilities, so map signals affect ratings whenever
  // event.eloConfig.mapWeight or unitWeight is non-zero. Default knobs keep
  // it pure-rating until the user opts in.
  const calculateEloRatings = (maxWeekIndex = null) => {
    const result = maxWeekIndex !== null
      ? replayActiveSeasonUpToWeekFromAppState(appState, activeEvent.id, activeSeason.id, maxWeekIndex)
      : replayEventFromAppState(appState, activeEvent.id);
    return { eloRatings: result.unitElo, roundsPlayed: result.roundsPlayed };
  };

  // Balancer Functions
  const openBalancerModal = () => {
    if (!selectedWeek) {
      alert('Please select a week first');
      return;
    }

    // Initialize balancer unit counts from week-specific or global data
    const weekIdx = weeks.findIndex(w => w.id === selectedWeek.id);
    let countsToUse = {};
    
    if (selectedWeek.unitPlayerCounts && Object.keys(selectedWeek.unitPlayerCounts).length > 0) {
      countsToUse = selectedWeek.unitPlayerCounts;
    } else if (weekIdx > 0 && weeks[weekIdx - 1]?.unitPlayerCounts) {
      countsToUse = weeks[weekIdx - 1].unitPlayerCounts;
    } else {
      countsToUse = unitPlayerCounts;
    }

    // Every registered unit gets a row. No count on record means nobody is
    // coming — 0–0, a night off — rather than "up to a hundred men", which is
    // what the old default quietly balanced them as.
    const initialCounts = {};
    units.forEach(unit => {
      initialCounts[unit] = countsToUse[unit] ? { ...countsToUse[unit] } : { min: 0, max: 0 };
    });

    setBalancerUnitCounts(initialCounts);
    setBalancerOpposingPairs([]);
    setBalancerResults(null);
    setBalancerStatus('');
    setBalancerSatOut([]);
    setBalancerReleased([]);
    goScreen('balancer');
  };

  /**
   * Player counts belong to the night, so they are written back as they change
   * rather than on the way out of a dialog — the balancer is a screen now and
   * has no way out to hook.
   */
  const commitBalancerCounts = (counts) => {
    setBalancerUnitCounts(counts);
    if (selectedWeek) updateWeek(selectedWeek.id, { unitPlayerCounts: { ...counts } });
    setUnitPlayerCounts(prev => ({ ...prev, ...counts }));
  };

  // --- Coord Sheet Paste helpers ---
  const coordNormalize = (name) => name.replace(/\s/g, '').replace(/-/g, '').replace(/[()]/g, '').toLowerCase();

  const coordFuzzyMatch = (parsed, registered) => {
    const normParsed = coordNormalize(parsed);
    // Exact match
    const exact = registered.find(u => u === parsed);
    if (exact) return exact;
    // Normalized match
    const norm = registered.find(u => coordNormalize(u) === normParsed);
    if (norm) return norm;
    // Substring / includes match
    const sub = registered.find(u => coordNormalize(u).includes(normParsed) || normParsed.includes(coordNormalize(u)));
    if (sub) return sub;
    return null;
  };

  const parseCoordPaste = () => {
    if (!coordPasteText.trim()) return;
    setCoordParsedRows(parseRosterPaste(coordPasteText).map(row => {
      const match = coordFuzzyMatch(row.unit, units);
      return {
        rawName: row.rawName,
        cleanName: row.unit,
        min: row.min,
        max: row.max,
        matchedUnit: match,
        action: match ? 'match' : 'create', // 'match' | 'create' | 'ignore'
        newUnitName: row.unit,
        newUnitIsToken: true,
      };
    }));
  };

  const openCoordPasteModal = () => {
    setCoordPasteText('');
    setCoordParsedRows([]);
    setShowCoordPasteModal(true);
  };

  const applyCoordPaste = () => {
    const newCounts = { ...balancerUnitCounts };
    const newUnits = [...units];
    const newNonToken = [...nonTokenUnits];

    for (const row of coordParsedRows) {
      if (row.action === 'ignore') continue;

      let unitName;
      if (row.action === 'match' && row.matchedUnit) {
        unitName = row.matchedUnit;
      } else if (row.action === 'create') {
        unitName = row.newUnitName.trim();
        if (!unitName) continue;
        if (!newUnits.includes(unitName)) {
          newUnits.push(unitName);
          if (!row.newUnitIsToken && !newNonToken.includes(unitName)) {
            newNonToken.push(unitName);
          }
        }
      } else {
        continue;
      }

      newCounts[unitName] = { min: row.min, max: row.max };
    }

    newUnits.sort();
    setUnits(newUnits);
    setNonTokenUnits(newNonToken);
    // Committed, not just held in the screen's own state: pasted numbers are
    // the night's player counts, and they used to evaporate the moment you
    // left the balancer.
    commitBalancerCounts(newCounts);
    setShowCoordPasteModal(false);
    setCoordParsedRows([]);
    setCoordPasteText('');
    const n = coordParsedRows.filter(r => r.action !== 'ignore').length;
    setBalancerStatus(`${n} unit${n === 1 ? '' : 's'} updated from the coord sheet.`);
  };

  // Units to even across the two sides for skill-based post-season balancing.
  // Returns a Set of unit names, or null when the metric shouldn't apply
  // (weight off, playoffs disabled, or no bracket yet). Per the passed
  // proposal: in the semi-finals the sides are evened by units that made the
  // playoffs; in the championship, by units that made the semi-finals. Which
  // tier applies is read from bracket progression — once the semi-final round
  // is decided, the next post-season match is the championship.
  const getPostSeasonSkillUnits = (weekIdx) => {
    if (!(balancerSettings.postSeasonSkillWeight > 0)) return null;
    const bracket = generatePlayoffBracket(weekIdx);
    if (!bracket || !bracket.rounds || bracket.rounds.length === 0) return null;

    const rounds = bracket.rounds;
    const semiRound = rounds.length >= 2 ? rounds[rounds.length - 2] : null;
    const semisDecided = !!semiRound
      && semiRound.matchups.length > 0
      && semiRound.matchups.every(m => m.winner);

    if (semiRound && semisDecided) {
      // Championship: even out the units that reached the semi-finals.
      const semifinalists = new Set();
      semiRound.matchups.forEach(m => {
        if (m.team1?.unit) semifinalists.add(m.team1.unit);
        if (m.team2?.unit) semifinalists.add(m.team2.unit);
      });
      if (semifinalists.size > 0) return semifinalists;
    }

    // Semi-finals (or any earlier post-season round): even out the units that
    // made the playoffs.
    const qualified = new Set(bracket.teams.map(t => t.unit).filter(Boolean));
    return qualified.size > 0 ? qualified : null;
  };

  const runBalancer = () => {
    if (!selectedWeek) return;
    setBalancerStatus('Balancing...');

    // The pool is every registered unit fielding somebody tonight — you do not
    // have to put a unit on a side before the balancer will consider it. What
    // is already on a side stays there: those units are counted in the split
    // but never re-drawn, unless you release one back into the pool. A unit at
    // 0–0 men has the night off and is left out of the night entirely.
    const out = new Set(balancerSatOut);
    const loose = new Set(balancerReleased);
    const held = (side) => (selectedWeek[side] || []).filter(u => !out.has(u) && !loose.has(u));
    const lockedA = held('teamA');
    const lockedB = held('teamB');
    const available = units.filter(u => !out.has(u)).sort();

    const maxDiff = parseInt(balancerMaxDiff);
    if (isNaN(maxDiff) || maxDiff < 0) {
      setBalancerStatus('Max player difference must be a whole number.');
      return;
    }

    const { teammate } = computeStats();
    const weekIdx = weeks.findIndex(w => w.id === selectedWeek.id);
    const postSeasonSkillUnits = getPostSeasonSkillUnits(weekIdx);
    // Ratings as they stood going into this week, so an option's Elo split
    // reflects the night being built rather than the season's end state.
    const { eloRatings } = weekIdx > 0 ? calculateEloRatings(weekIdx - 1) : { eloRatings: {} };
    const elo = {};
    units.forEach(u => { elo[u] = eloRatings[u] ?? eloSystem.initialElo; });

    const result = balanceTeams({
      available,
      lockedA,
      lockedB,
      counts: balancerUnitCounts,
      opposingPairs: balancerOpposingPairs,
      maxPlayerDiff: maxDiff,
      teammateHistory: teammate,
      divisions,
      postSeasonSkillUnits,
      weights: {
        teammate: balancerSettings.teammateWeight,
        avgDiff: balancerSettings.avgDiffWeight,
        regimentCount: balancerSettings.regimentCountWeight,
        rangeSimilarity: balancerSettings.rangeSimilarityWeight,
        divisionOpposition: balancerSettings.divisionOppositionWeight,
        postSeasonSkill: balancerSettings.postSeasonSkillWeight || 0,
      },
      optionCount: balancerSettings.balanceOptionCount || 3,
      elo,
    });

    if (!result.ok) {
      setBalancerResults(null);
      setBalancerStatus(describeBalanceFailure(result.failure, maxDiff));
      return;
    }

    // Win probability and teammate averages are the tracker's own, so they get
    // layered on here rather than pushed into the scoring model.
    const enriched = result.options.map(o => {
      const stats = calculatePreviewStats(o.teamA, o.teamB);
      return {
        ...o,
        score: o.avgDiff,
        avgHistoryA: stats.avgHistoryA,
        avgHistoryB: stats.avgHistoryB,
        combinedAvgHistory: stats.combinedAvgHistory,
        round1Probability: stats.round1Probability,
        round2Probability: stats.round2Probability,
      };
    });
    setBalancerResults(enriched);
    setSelectedBalanceIndex(0);

    const idle = new Set(result.satOut);
    const stayed = [...lockedA, ...lockedB].filter(u => !idle.has(u)).length;
    const placed = enriched[0].teamA.length + enriched[0].teamB.length - stayed;
    const bits = [
      `${enriched.length} option${enriched.length === 1 ? '' : 's'}`,
      `best average difference ${enriched[0].avgDiff.toFixed(1)}`,
      `${placed} placed`,
    ];
    if (stayed) bits.push(`${stayed} held where they stood`);
    const zero = result.satOut.filter(u => !out.has(u));
    if (zero.length) bits.push(`${zero.length} fielding nobody`);
    setBalancerStatus(bits.join(' · '));
  };

  /**
   * The balancer is a screen you can walk onto from the rail, not just a dialog
   * opened from a night — so its counts seed themselves from the night rather
   * than relying on having been opened through openBalancerModal.
   */
  useEffect(() => {
    if (screen !== 'balancer' || !selectedWeek) return;
    const missing = units.filter(u => !balancerUnitCounts[u]);
    if (missing.length === 0) return;
    const src = selectedWeek.unitPlayerCounts && Object.keys(selectedWeek.unitPlayerCounts).length
      ? selectedWeek.unitPlayerCounts
      : unitPlayerCounts;
    const next = { ...balancerUnitCounts };
    missing.forEach(u => { next[u] = { ...(src[u] ?? { min: 0, max: 0 }) }; });
    setBalancerUnitCounts(next);
  }, [screen, selectedWeek, units, unitPlayerCounts, balancerUnitCounts]);

  /**
   * Put one option's split onto the night. Units the balancer left out — the
   * ones fielding nobody — come off the night with it, so a lead or a balance
   * swap pointing at one is cleared rather than left dangling on a unit that
   * isn't there.
   */
  const applyBalancerOption = (option) => {
    if (!selectedWeek || !option) return;
    const onA = new Set(option.teamA);
    const onB = new Set(option.teamB);
    const lead = (unit, side) => (unit && (side === 'A' ? onA : onB).has(unit) ? unit : null);
    const swaps = (list) => (list || []).filter(u => onA.has(u) || onB.has(u));
    updateWeek(selectedWeek.id, {
      teamA: [...option.teamA],
      teamB: [...option.teamB],
      leadA: lead(selectedWeek.leadA, 'A'),
      leadB: lead(selectedWeek.leadB, 'B'),
      leadA_r1: lead(selectedWeek.leadA_r1, 'A'),
      leadB_r1: lead(selectedWeek.leadB_r1, 'B'),
      leadA_r2: lead(selectedWeek.leadA_r2, 'A'),
      leadB_r2: lead(selectedWeek.leadB_r2, 'B'),
      roundSwaps: {
        r1: swaps(selectedWeek.roundSwaps?.r1),
        r2: swaps(selectedWeek.roundSwaps?.r2),
      },
    });
    goScreen('night');
  };

  /** Carry the previous night's counts forward — most weeks barely move. */
  const pullLastNightCounts = () => {
    const idx = selectedWeek ? weeks.findIndex(w => w.id === selectedWeek.id) : weeks.length - 1;
    for (let k = idx - 1; k >= 0; k--) {
      const c = weeks[k]?.unitPlayerCounts;
      if (c && Object.keys(c).length) { commitBalancerCounts({ ...balancerUnitCounts, ...c }); return; }
    }
    setBalancerStatus('No earlier night has player counts to pull.');
  };

  const applyBalancerResults = () => {
    if (!balancerResults || !selectedWeek) return;

    const { teamA, teamB } = balancerResults[selectedBalanceIndex];

    // Save unit counts to the week
    const updatedWeek = {
      ...selectedWeek,
      teamA: teamA,
      teamB: teamB,
      unitPlayerCounts: { ...balancerUnitCounts }
    };

    updateWeek(selectedWeek.id, updatedWeek);
    
    // Also update global unit player counts
    setUnitPlayerCounts(prev => ({
      ...prev,
      ...balancerUnitCounts
    }));

    setBalancerResults(null);
  };

  // New Season function — clears all data and starts from a fresh app state.
  const newSeason = () => {
    if (!confirm('Start a new season? This will clear all current data (units, weeks, standings, etc.). Make sure to export your current season first!')) {
      return;
    }
    setAppState(makeDefaultAppState());
    alert('New season started! All data has been cleared.');
  };

  /**
   * The active event's player stats as a portable bundle — every scoreboard,
   * the regiment pins and renames, and the map tallies the Elo engine derives.
   * Share, export and publish all need precisely this, so it is built once.
   *
   * `full` keeps every field the parser produced. A share link is trimmed
   * because it has to stay pasteable; the database is meant to be the record,
   * so publishing sends the whole scoreboard.
   */
  const buildEventStatsBundle = async ({ full = false } = {}) => {
    let bundle;
    try {
      bundle = await statsRepo.exportEventStats(
        appState.activeEventId, registryUnitNames, statsSeasonRefs, { full },
      );
    } catch {
      return null;
    }
    bundle.mapStats = eventMapStats();
    return bundle;
  };

  /** Map win/loss tallies for the event overall and for each season in it. */
  const eventMapStats = () => ({
    overall: calculateMapStats(),
    bySeason: Object.fromEntries(activeEvent.seasons.map(s => [s.id, mapStatsForSeasons([s])])),
  });

  // Share — offers active season or whole event. Single-season events skip
  // the dialog and share the season directly (matches legacy behavior).
  const shareSeason = async () => {
    const multi = activeEvent.seasons.length > 1;
    // Pull the event's player stats so we can offer a combined link.
    const bundle = await buildEventStatsBundle();
    const sbCount = bundle?.scoreboards.length ?? 0;
    const hasStats = sbCount > 0;

    // Nothing extra to offer (single season, no stats) → legacy direct share.
    if (!multi && !hasStats) {
      const flat = flattenActiveToLegacy(appState);
      let url;
      try { url = await generateShortShareUrl(flat); }
      catch { alert("Couldn't create share link — try again."); return; }
      try { await navigator.clipboard.writeText(url); alert('Share link copied! (Active season)'); }
      catch { prompt('Copy this link to share:', url); }
      return;
    }

    const seasonWord = `${activeEvent.seasons.length} season${activeEvent.seasons.length === 1 ? '' : 's'}`;
    const sbWord = `${sbCount} scoreboard${sbCount === 1 ? '' : 's'}`;
    const choices = [];
    if (hasStats) {
      choices.push({
        value: 'full',
        label: `Everything — tracker + player stats`,
        description: `${activeEvent.name}: ${seasonWord} plus ${sbWord} of player stats. One link, the whole picture.`,
        variant: 'primary',
      });
    }
    choices.push({
      value: 'event',
      label: `Whole event — ${activeEvent.name}`,
      description: `Registry + ${seasonWord}${hasStats ? ' (no player stats)' : ''}.`,
      variant: hasStats ? 'secondary' : 'primary',
    });
    choices.push({
      value: 'season',
      label: `Active season only — ${activeSeason.name}`,
      description: 'Just this season. Smaller payload; matches legacy share behavior.',
      variant: 'secondary',
    });
    choices.push({ value: null, label: 'Cancel', variant: 'cancel' });

    const kind = await askChoice({ title: 'Share', message: `What would you like to share?`, choices });
    if (!kind) return;

    let url;
    try {
      if (kind === 'full') {
        url = await generateShortFullShareUrl(activeEvent, bundle);
      } else if (kind === 'event') {
        url = await generateShortEventShareUrl(activeEvent);
      } else {
        url = await generateShortShareUrl(flattenActiveToLegacy(appState));
      }
    } catch {
      alert("Couldn't create share link — try again.");
      return;
    }

    const label = kind === 'full' ? 'Everything' : kind === 'event' ? 'Whole event' : 'Active season';
    try {
      await navigator.clipboard.writeText(url);
      alert(`Share link copied! (${label})`);
    } catch {
      prompt('Copy this link to share:', url);
    }
  };

  // Share a player-stats-only link (scoreboards + regiment assignments for the
  // active event). Recipients open it to a read-only, stats-only page — no
  // tracker data, no editing (see SharedStatsView).
  const shareStats = async () => {
    const bundle = await buildEventStatsBundle();
    if (!bundle) { alert('Could not read player stats for this event.'); return; }
    if (!bundle.scoreboards.length) {
      alert('No scoreboards imported for this event yet — nothing to share.');
      return;
    }
    let url;
    try { url = await generateShortStatsShareUrl(bundle, activeEvent.name); }
    catch { alert("Couldn't create share link — try again."); return; }
    try {
      await navigator.clipboard.writeText(url);
      alert(`Player-stats link copied! (${bundle.scoreboards.length} scoreboard${bundle.scoreboards.length === 1 ? '' : 's'}, view-only)`);
    } catch {
      prompt('Copy this link to share player stats:', url);
    }
  };

  // Hand generated text to the browser as a file download.
  const downloadText = (filename, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export/Import — JSON file download. For multi-season events the file
  // contains the full event tree; otherwise the active-season legacy shape.
  const exportData = async () => {
    const isEvent = activeEvent.seasons.length > 1;
    // Bundle the event's player stats (scoreboards + regiment assignments) so a
    // single file is a complete backup. Best-effort — never block the export.
    const stats = await buildEventStatsBundle();
    const hasStats = stats && (stats.scoreboards.length || Object.keys(stats.assignments).length);

    const data = isEvent
      ? { schemaVersion: 2, kind: 'event', event: activeEvent, ...(hasStats ? { stats } : {}), exportDate: new Date().toISOString() }
      : { ...flattenActiveToLegacy(appState), ...(hasStats ? { stats } : {}), exportDate: new Date().toISOString() };

    const filename = isEvent
      ? `event-${activeEvent.name.replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().split('T')[0]}.json`
      : `season-tracker-${new Date().toISOString().split('T')[0]}.json`;

    downloadText(filename, JSON.stringify(data, null, 2), 'application/json');
  };

  const exportToCSV = () => {
    const stats = calculatePoints();
    const standings = Object.entries(stats)
      .map(([unit, data]) => ({ unit, ...data }))
      .sort((a, b) => b.points - a.points);
    
    let csv = 'Rank,Unit,Points,Lead Wins,Lead Losses,Assist Wins,Assist Losses\n';
    standings.forEach((stat, index) => {
      csv += `${index + 1},${stat.unit},${stat.points},${stat.leadWins},${stat.leadLosses},${stat.assistWins},${stat.assistLosses}\n`;
    });
    
    downloadText(`standings-${new Date().toISOString().split('T')[0]}.csv`, csv, 'text/csv');
  };

  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Restore an attached player-stats bundle (scoreboards + assignments)
        // under the imported event. Best-effort; never blocks the data import.
        const restoreStats = async (eventId) => {
          if (eventId && isStatsBundle(data.stats)) {
            try { await statsRepo.importEventStats(eventId, data.stats); } catch { /* ignore */ }
          }
        };

        // v2 event export — full event tree. Offer ADD vs REPLACE.
        if (data?.kind === 'event' && data.event) {
          const evt = data.event;
          const choice = await askChoice({
            title: 'Import event file',
            message: `"${evt.name}" — ${evt.seasons.length} season${evt.seasons.length === 1 ? '' : 's'}, ${Object.keys(evt.unitRegistry || {}).length} units in registry.`,
            choices: [
              { value: 'add',     label: 'Add as new event',     description: 'Append a new event without touching your current one.', variant: 'primary' },
              { value: 'replace', label: 'Replace active event', description: 'Overwrites the current active event in place.',         variant: 'danger'  },
              { value: null,      label: 'Cancel', variant: 'cancel' },
            ],
          });
          if (!choice) return;
          if (choice === 'add') {
            setAppState(prev => ({
              ...prev,
              events: [...prev.events, evt],
              activeEventId: evt.id,
              activeSeasonId: defaultSeasonIdFor(evt),
            }));
          } else if (choice === 'replace') {
            setAppState(prev => ({
              ...prev,
              events: prev.events.map(ev => ev.id === prev.activeEventId ? evt : ev),
              activeEventId: evt.id,
              activeSeasonId: defaultSeasonIdFor(evt),
            }));
          }
          await restoreStats(evt.id);
          alert('Event imported.');
          return;
        }

        // Legacy season formats below — normalize fields, then ask whether
        // to add as a new season under the active event or replace wholesale.
        let importedWeeks = data.weeks || data.season || [];
        
        // Transform season data to weeks format if needed
        if (data.season && Array.isArray(data.season)) {
          importedWeeks = data.season.map((week, index) => {
            // Convert string player counts to numbers
            const convertedPlayerCounts = {};
            if (week.unit_player_counts) {
              Object.entries(week.unit_player_counts).forEach(([unit, counts]) => {
                convertedPlayerCounts[unit] = {
                  min: parseInt(counts.min) || 0,
                  max: parseInt(counts.max) || 0
                };
              });
            }

            return {
              id: Date.now() + index,
              name: week.name || `Week ${index + 1}`,
              teamA: week.A || [],
              teamB: week.B || [],
              round1Winner: week.round1_winner || null,
              round2Winner: week.round2_winner || null,
              round1Map: week.round1_map || null,
              round2Map: week.round2_map || null,
              round1Flipped: week.round1_flipped || false,
              round2Flipped: week.round2_flipped || false,
              leadA: week.lead_A || null,
              leadB: week.lead_B || null,
              isPlayoffs: week.playoffs || false,
              isSingleRoundLeads: week.single_round_leads || false,
              isFunRound: week.fun_round || false,
              leadA_r1: week.lead_A_r1 || null,
              leadB_r1: week.lead_B_r1 || null,
              leadA_r2: week.lead_A_r2 || null,
              leadB_r2: week.lead_B_r2 || null,
              r1CasualtiesA: week.r1_casualties_A || 0,
              r1CasualtiesB: week.r1_casualties_B || 0,
              r2CasualtiesA: week.r2_casualties_A || 0,
              r2CasualtiesB: week.r2_casualties_B || 0,
              unitPlayerCounts: convertedPlayerCounts,
              weeklyCasualties: week.weekly_casualties || {
                USA: { r1: {}, r2: {} },
                CSA: { r1: {}, r2: {} }
              }
            };
          });
        }
        
        // Handle team names
        let importedTeamNames = data.teamNames || { A: 'USA', B: 'CSA' };
        if (data.team_names) {
          importedTeamNames = {
            A: data.team_names.A || 'Team A',
            B: data.team_names.B || 'Team B'
          };
        }
        
        // Handle point system
        let importedPointSystem = { balancePoints: 0, balancePointsStyle: 'perNight', ...(data.pointSystem || pointSystem) };
        if (data.point_system_values) {
          importedPointSystem = {
            winLead: parseInt(data.point_system_values.win_lead) || 4,
            winAssist: parseInt(data.point_system_values.win_assist) || 2,
            lossLead: parseInt(data.point_system_values.loss_lead) || 0,
            lossAssist: parseInt(data.point_system_values.loss_assist) || 1,
            bonus2_0Lead: parseInt(data.point_system_values.bonus_2_0_lead) || 0,
            bonus2_0Assist: parseInt(data.point_system_values.bonus_2_0_assist) || 1,
            balancePoints: 0,
            balancePointsStyle: 'perNight'
          };
        }
        
        // Handle manual adjustments
        let importedManualAdjustments = data.manualAdjustments || data.manual_point_adjustments || {};
        
        // Handle Elo system
        let importedEloSystem = data.eloSystem || eloSystem;
        if (data.elo_system_values) {
          importedEloSystem = {
            initialElo: parseInt(data.elo_system_values.initial_elo) || 1500,
            kFactorStandard: parseInt(data.elo_system_values.k_factor_standard) || 96,
            kFactorProvisional: parseInt(data.elo_system_values.k_factor_provisional) || 128,
            provisionalRounds: parseInt(data.elo_system_values.provisional_rounds) || 10,
            sweepBonusMultiplier: parseFloat(data.elo_system_values.sweep_bonus_multiplier) || 1.25,
            leadMultiplier: parseFloat(data.elo_system_values.lead_multiplier) || 2.0,
            sizeInfluence: parseFloat(data.elo_system_values.size_influence) || 1.0,
            playoffMultiplier: parseFloat(data.elo_system_values.playoff_multiplier) || 1.25
          };
        }
        
        // Unit player counts — convert string values to numbers
        let importedUnitPlayerCounts = {};
        const rawPlayerCounts = data.unitPlayerCounts || data.unit_player_counts || {};
        Object.entries(rawPlayerCounts).forEach(([unit, counts]) => {
          importedUnitPlayerCounts[unit] = {
            min: parseInt(counts.min) || 0,
            max: parseInt(counts.max) || 0
          };
        });

        // Assemble a flat legacy-shape object — bias fields intentionally
        // dropped (phase 2 derives map adjustments from outcome history).
        const legacyImported = {
          units: data.units || [],
          nonTokenUnits: data.nonTokenUnits || data.non_token_units || [],
          weeks: importedWeeks,
          selectedWeek: null,
          teamNames: importedTeamNames,
          pointSystem: importedPointSystem,
          manualAdjustments: importedManualAdjustments,
          eloSystem: importedEloSystem,
          unitPlayerCounts: importedUnitPlayerCounts,
          divisions: data.divisions || [],
          mapCooldown: parseInt(data.mapCooldown) || 0,
          playoffConfig: data.playoffConfig,
          balancerSettings: data.balancerSettings,
        };

        const choice = await askChoice({
          title: 'Import season file',
          message: `${(legacyImported.weeks || []).length} week${(legacyImported.weeks || []).length === 1 ? '' : 's'}, ${(legacyImported.units || []).length} units. Add it under your active event, or wipe everything and start fresh?`,
          choices: [
            { value: 'add',     label: 'Add as new season', description: 'Appends under your active event; new unit names merge into the registry.', variant: 'primary' },
            { value: 'replace', label: 'Wipe and replace',   description: 'Clears all events and creates a fresh event with just this season.',        variant: 'danger'  },
            { value: null,      label: 'Cancel', variant: 'cancel' },
          ],
        });
        if (!choice) return;
        if (choice === 'replace') {
          const migrated = migrateLegacyFlatToV2(legacyImported);
          setAppState(migrated);
          await restoreStats(migrated.activeEventId);
        } else if (choice === 'add') {
          const migrated = migrateLegacyFlatToV2(legacyImported);
          const importedSeason = migrated.events[0].seasons[0];
          const importedRegistryNames = Object.values(migrated.events[0].unitRegistry).map(u => u.name);
          setAppState(prev => appendSeasonToActiveEvent(prev, importedSeason, importedRegistryNames));
          await restoreStats(appState.activeEventId);
        }

        alert('Data imported successfully!');
      } catch (error) {
        alert('Error importing data: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleEnlarge = (section) => {
    setEnlargedSection(enlargedSection === section ? null : section);
  };

  // Compute teammate and opponent stats (per-round, swap-aware)
  const computeStats = () => {
    const teammate = {};
    const opponent = {};

    weeks.forEach(week => {
      [1, 2].forEach(roundNum => {
        const { teamA, teamB } = getEffectiveTeams(week, roundNum);

        teamA.forEach(unit1 => {
          if (!teammate[unit1]) teammate[unit1] = {};
          teamA.forEach(unit2 => {
            if (unit1 !== unit2) {
              teammate[unit1][unit2] = (teammate[unit1][unit2] || 0) + 1;
            }
          });
        });

        teamB.forEach(unit1 => {
          if (!teammate[unit1]) teammate[unit1] = {};
          teamB.forEach(unit2 => {
            if (unit1 !== unit2) {
              teammate[unit1][unit2] = (teammate[unit1][unit2] || 0) + 1;
            }
          });
        });

        teamA.forEach(unitA => {
          if (!opponent[unitA]) opponent[unitA] = {};
          teamB.forEach(unitB => {
            opponent[unitA][unitB] = (opponent[unitA][unitB] || 0) + 1;
          });
        });

        teamB.forEach(unitB => {
          if (!opponent[unitB]) opponent[unitB] = {};
          teamA.forEach(unitA => {
            opponent[unitB][unitA] = (opponent[unitB][unitA] || 0) + 1;
          });
        });
      });
    });

    return { teammate, opponent };
  };

  // Get detailed interactions with round labels (swap-aware)
  const getDetailedInteractions = () => {
    const interactions = {};

    const ensurePair = (a, b) => {
      if (!interactions[a]) interactions[a] = {};
      if (!interactions[a][b]) interactions[a][b] = { teammateRounds: [], opponentRounds: [] };
    };

    weeks.forEach((week, weekIdx) => {
      [1, 2].forEach(roundNum => {
        const label = `W${weekIdx + 1}R${roundNum}`;
        const { teamA, teamB } = getEffectiveTeams(week, roundNum);

        for (let i = 0; i < teamA.length; i++) {
          for (let j = i + 1; j < teamA.length; j++) {
            ensurePair(teamA[i], teamA[j]);
            ensurePair(teamA[j], teamA[i]);
            interactions[teamA[i]][teamA[j]].teammateRounds.push(label);
            interactions[teamA[j]][teamA[i]].teammateRounds.push(label);
          }
        }

        for (let i = 0; i < teamB.length; i++) {
          for (let j = i + 1; j < teamB.length; j++) {
            ensurePair(teamB[i], teamB[j]);
            ensurePair(teamB[j], teamB[i]);
            interactions[teamB[i]][teamB[j]].teammateRounds.push(label);
            interactions[teamB[j]][teamB[i]].teammateRounds.push(label);
          }
        }

        teamA.forEach(unitA => {
          teamB.forEach(unitB => {
            ensurePair(unitA, unitB);
            ensurePair(unitB, unitA);
            interactions[unitA][unitB].opponentRounds.push(label);
            interactions[unitB][unitA].opponentRounds.push(label);
          });
        });
      });
    });

    return interactions;
  };

  // Calculate Casualties (inflicted and lost)
  const calculateCasualties = (maxWeekIndex = null) => {
    const inflicted = {};
    const lost = {};
    const c = 5; // Constant for weight calculation

    const weeksToProcess = maxWeekIndex !== null ? weeks.slice(0, maxWeekIndex + 1) : weeks;

    // First pass: aggregate all deaths for each unit
    weeksToProcess.forEach(week => {
      const weeklyCas = week.weeklyCasualties || {};
      const teamAName = teamNames.A;
      const teamBName = teamNames.B;

      [teamAName, teamBName].forEach(teamName => {
        ['r1', 'r2'].forEach(roundKey => {
          const casData = weeklyCas[teamName]?.[roundKey] || {};
          Object.entries(casData).forEach(([unit, deaths]) => {
            if (deaths >= 0) {
              lost[unit] = (lost[unit] || 0) + deaths;
            }
          });
        });
      });
    });

    // Second pass: assign kills — use actual kills if available, else estimate
    weeksToProcess.forEach((week, weekIdx) => {
      const weeklyCas = week.weeklyCasualties || {};
      if (!weeklyCas || Object.keys(weeklyCas).length === 0) return;

      const weekKills = week.weeklyKills || {};
      const teamAName = teamNames.A;
      const teamBName = teamNames.B;

      const addActualKills = (killsData) => {
        if (!killsData) return false;
        const entries = Object.entries(killsData).filter(([, k]) => k > 0);
        if (entries.length === 0) return false;
        entries.forEach(([unit, kills]) => {
          inflicted[unit] = (inflicted[unit] || 0) + kills;
        });
        return true;
      };

      const distributeKills = (totalDeathsInflicted, friendlyUnitsData, currentWeekIdx) => {
        if (!friendlyUnitsData || Object.keys(friendlyUnitsData).length === 0) return;

        const regiments = Object.entries(friendlyUnitsData).map(([unit, deaths]) => ({
          name: unit,
          men: getUnitAveragePlayerCount(unit, currentWeekIdx),
          deaths: lost[unit] || 0
        }));

        regiments.forEach(r => {
          r.weight = r.men * (r.deaths / (r.deaths + c));
        });

        const totalWeight = regiments.reduce((sum, r) => sum + (r.weight || 0), 0);

        if (totalWeight === 0) {
          if (regiments.length > 0) {
            const killsPerUnit = totalDeathsInflicted / regiments.length;
            regiments.forEach(r => {
              inflicted[r.name] = (inflicted[r.name] || 0) + killsPerUnit;
            });
          }
          return;
        }

        regiments.forEach(r => {
          const estKills = totalDeathsInflicted * (r.weight / totalWeight);
          inflicted[r.name] = (inflicted[r.name] || 0) + estKills;
        });
      };

      ['r1', 'r2'].forEach(roundKey => {
        const teamAKills = weekKills[teamAName]?.[roundKey];
        const teamBKills = weekKills[teamBName]?.[roundKey];
        const hasActualA = addActualKills(teamAKills);
        const hasActualB = addActualKills(teamBKills);

        // Fall back to estimation for teams without actual kill data
        const casA = Object.entries(weeklyCas[teamAName]?.[roundKey] || {}).filter(([, d]) => d >= 0);
        const casB = Object.entries(weeklyCas[teamBName]?.[roundKey] || {}).filter(([, d]) => d >= 0);
        if (!hasActualB) {
          const totalADeaths = casA.reduce((sum, [, d]) => sum + d, 0);
          distributeKills(totalADeaths, Object.fromEntries(casB), weekIdx);
        }
        if (!hasActualA) {
          const totalBDeaths = casB.reduce((sum, [, d]) => sum + d, 0);
          distributeKills(totalBDeaths, Object.fromEntries(casA), weekIdx);
        }
      });
    });

    return { inflicted, lost };
  };

  // ── Player-stat assignment (tracker token ← scoreboard regiment(s)) ─────────
  // The token→regiments map lives on the event, now keyed by scope (Overall or a
  // season id) so a unit's roster can differ per season. Per-unit stats are
  // derived from scoreboards. Casualty input no longer feeds round totals (those
  // stay owned by the per-side casualty/formation inputs, so untagged kills/
  // deaths survive). Legacy flat maps read as the Overall scope.
  const tokenRegimentsScoped = useMemo(
    () => normalizeScopedTokenRegiments(activeEvent?.tokenRegiments),
    [activeEvent],
  );
  // The mapping in effect for the active season (Overall defaults with this
  // season's per-token overrides layered on). Drives the current-season
  // displays, the claimed-by locks, and the Assign dialog.
  const tokenRegiments = useMemo(
    () => effectiveTokenRegiments(tokenRegimentsScoped, appState.activeSeasonId ?? OVERALL_SCOPE),
    [tokenRegimentsScoped, appState.activeSeasonId],
  );

  const loadScoreboardData = useCallback(async () => {
    const eventId = appState.activeEventId;
    try {
      // One read of every round, and the pins and renames beside it — not a
      // listing followed by a read per round, one after another.
      const [full, assigned, aliased] = await Promise.all([
        statsRepo.readAllScoreboards(eventId),
        // Scoped maps (scope → …); resolution picks each round's season below.
        statsRepo.getRegimentAssignmentsScoped(eventId),
        statsRepo.getRegimentAliasesScoped(eventId),
      ]);
      setSbStored(full.filter(Boolean));
      setSbAssignments(assigned);
      setSbAliases(aliased);
    } catch {
      setSbStored([]); setSbAssignments({}); setSbAliases({});
    }
  }, [appState.activeEventId]);

  // Read the rounds as soon as an event is open, and again whenever a screen
  // that draws from them comes up (so a re-import shows there without a trip
  // through the night builder to wake it).
  useEffect(() => {
    if (SCOREBOARD_SCREENS.has(screen) || showCasualtyModal) void loadScoreboardData();
  }, [screen, showCasualtyModal, loadScoreboardData]);
  useEffect(() => { void loadScoreboardData(); }, [loadScoreboardData]);

  // The event's registry unit names — feeds both regiment resolution and the
  // shared stats bundle (so a view-only share resolves regiments identically).
  const registryUnitNames = useMemo(
    () => Object.values(activeEvent?.unitRegistry || {})
      .map(u => (typeof u === 'string' ? u : u?.name)).filter(Boolean),
    [activeEvent],
  );
  // Lightweight season descriptors (id, name, week ids) for the player-stats
  // season filter and for the shared-stats bundle. Week ids are stringified to
  // match how scoreboard bindings store them.
  const statsSeasonRefs = useMemo(
    () => (activeEvent?.seasons || []).map(s => ({
      id: s.id,
      name: s.name,
      weekIds: (s.weeks || []).map(w => String(w.id)),
    })),
    [activeEvent],
  );
  const registryRegimentList = useMemo(
    () => parseRegimentList(registryUnitNames.join('\n')),
    [registryUnitNames],
  );
  // Which season a bound week belongs to (for per-round season-scoped
  // resolution). A plain object, not a Map — `Map` is shadowed by the lucide
  // icon import in this module.
  const weekToSeason = useMemo(() => {
    const m = {};
    for (const s of statsSeasonRefs) for (const w of s.weekIds) m[String(w)] = s.id;
    return m;
  }, [statsSeasonRefs]);
  const seasonOfWeek = useCallback(
    (weekId) => (weekId ? weekToSeason[String(weekId)] ?? OVERALL_SCOPE : OVERALL_SCOPE),
    [weekToSeason],
  );
  // Season-scoped resolution, exactly like the Stats view: each scoreboard's rows
  // resolve under its own season's renames/pins (Overall defaults layered under
  // season overrides), so the tracker's regiment labels match the Stats view.
  const overallAlias = useMemo(() => effectiveAliasMap(sbAliases, OVERALL_SCOPE), [sbAliases]);
  const overallAssign = useMemo(() => effectiveScopedMap(sbAssignments, OVERALL_SCOPE), [sbAssignments]);
  const aliasBySource = useMemo(() => aliasMapBySource(sbStored, statsSeasonRefs, sbAliases), [sbStored, statsSeasonRefs, sbAliases]);
  const assignmentBySource = useMemo(() => scopedMapBySource(sbStored, statsSeasonRefs, sbAssignments), [sbStored, statsSeasonRefs, sbAssignments]);
  const engineOpts = useMemo(
    () => ({
      regimentList: registryRegimentList,
      aliasMapFor: (sb) => aliasBySource.get(sb.sourceFilename) ?? overallAlias,
      assignmentsFor: (sb) => assignmentBySource.get(sb.sourceFilename) ?? overallAssign,
    }),
    [registryRegimentList, aliasBySource, overallAlias, assignmentBySource, overallAssign],
  );
  // Regiment breakdown across every scoreboard (the Assign-modal pool + preview).
  const eventRegBreakdown = useMemo(
    () => computeRegimentBreakdown(sbStored.map(s => s.scoreboard), overallAssign, engineOpts),
    [sbStored, overallAssign, engineOpts],
  );
  // Per-scoreboard breakdown tagged with its round binding (week-scoped sums).
  const perScoreboardBreakdown = useMemo(
    () => sbStored.map(s => ({
      weekId: s.binding?.weekId ?? null,
      round: s.binding?.round ?? null,
      breakdown: computeRegimentBreakdown([s.scoreboard], overallAssign, engineOpts),
    })),
    [sbStored, overallAssign, engineOpts],
  );
  const availableRegiments = useMemo(
    () => eventRegBreakdown.map(r => r.regiment).filter(r => r !== 'UNTAGGED').sort((a, b) => a.localeCompare(b)),
    [eventRegBreakdown],
  );
  // Claimed-by map for the scope the Assign dialog is editing, so a regiment
  // already taken by another token in that scope locks (a regiment can belong to
  // different tokens in different seasons).
  const assignClaimedBy = useMemo(() => {
    const m = {};
    const mapping = effectiveTokenRegiments(tokenRegimentsScoped, assignScope);
    for (const [token, regs] of Object.entries(mapping)) for (const r of regs) m[r] = token;
    return m;
  }, [tokenRegimentsScoped, assignScope]);
  // Full cross-season roster per token (every regiment across every scope), for
  // the event-totals unique-player / context tallies.
  const tokenRegimentsUnion = useMemo(() => unionTokenRegiments(tokenRegimentsScoped), [tokenRegimentsScoped]);

  // Per-token stats derived live from scoreboards. Event totals roll each
  // scoreboard up under its own season's token→regiments mapping (so a unit whose
  // roster changed across seasons totals correctly); the as-of-week view is all
  // within the active season, so it uses that season's mapping.
  const tokenSnapsEventTotals = () =>
    accumulateTokenSnapsScoped(perScoreboardBreakdown.map(x => ({
      breakdown: x.breakdown,
      mapping: effectiveTokenRegiments(tokenRegimentsScoped, seasonOfWeek(x.weekId)),
    })));
  const tokenSnapsAsOfWeek = (maxWeekIdx) => {
    const ids = new Set(weeks.slice(0, (maxWeekIdx ?? weeks.length - 1) + 1).map(w => String(w.id)));
    const brks = perScoreboardBreakdown.filter(x => x.weekId && ids.has(String(x.weekId))).map(x => x.breakdown);
    return accumulateTokenSnaps(brks, tokenRegiments);
  };
  // Nights with a scoreboard bound to them — what the Units screen can read.
  const weeksWithRounds = useMemo(
    () => new Set(sbStored.map(s => s.binding?.weekId).filter(Boolean).map(String)),
    [sbStored],
  );
  // Where the Units screen opens: the night picked there, else the latest night
  // with rounds bound or a result recorded — the figures are cumulative, so the
  // later of the two leaves nothing out — else the last one scheduled.
  const unitsWeekIdx = (() => {
    const picked = unitsAsOfId != null ? weeks.findIndex(w => String(w.id) === unitsAsOfId) : -1;
    if (picked >= 0) return picked;
    for (let i = weeks.length - 1; i >= 0; i -= 1) {
      if (weeksWithRounds.has(String(weeks[i].id)) || nightPlayed(weeks[i])) return i;
    }
    return weeks.length - 1;
  })();
  const regBreakdownAsOfWeek = (maxWeekIdx) => {
    const ids = new Set(weeks.slice(0, (maxWeekIdx ?? weeks.length - 1) + 1).map(w => String(w.id)));
    const sbs = sbStored.filter(s => s.binding?.weekId && ids.has(String(s.binding.weekId)));
    return computeRegimentBreakdown(sbs.map(s => s.scoreboard), overallAssign, engineOpts);
  };
  const regContextEventTotals = useMemo(
    () => computeRegimentContextStats(sbStored.map(s => s.scoreboard), overallAssign, engineOpts),
    [sbStored, overallAssign, engineOpts],
  );
  const regContextAsOfWeek = (maxWeekIdx) => {
    const ids = new Set(weeks.slice(0, (maxWeekIdx ?? weeks.length - 1) + 1).map(w => String(w.id)));
    const sbs = sbStored.filter(s => s.binding?.weekId && ids.has(String(s.binding.weekId)));
    return computeRegimentContextStats(sbs.map(s => s.scoreboard), overallAssign, engineOpts);
  };
  // Per-token average per-round ticket-damage shares (TDI/TDR%), rolled up under
  // the same token→regiments mapping the stats table uses in each view.
  const tokenTicketSharesEventTotals = useMemo(
    () => computeTokenTicketShares(sbStored.map(s => s.scoreboard), overallAssign, tokenRegimentsUnion, engineOpts),
    [sbStored, overallAssign, tokenRegimentsUnion, engineOpts],
  );
  const tokenTicketSharesAsOfWeek = (maxWeekIdx) => {
    const ids = new Set(weeks.slice(0, (maxWeekIdx ?? weeks.length - 1) + 1).map(w => String(w.id)));
    const sbs = sbStored.filter(s => s.binding?.weekId && ids.has(String(s.binding.weekId)));
    return computeTokenTicketShares(sbs.map(s => s.scoreboard), overallAssign, tokenRegiments, engineOpts);
  };

  const toggleExpandedUnit = (unit) => {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit); else next.add(unit);
      return next;
    });
  };

  // Render a single context-slice row (used in expanded unit breakdown).
  const renderContextRow = (label, snap, colSpan) => {
    if (!snap || (!snap.kills && !snap.deaths)) return null;
    const kd = snap.deaths > 0 ? snap.kills / snap.deaths : snap.kills;
    return (
      <tr style={{ background: 'var(--sunken)', fontSize: 10.5 }}>
        <td className="pl-6 text-text-secondary italic">{label}</td>
        <td className="num" style={{ color: 'var(--ink-3)' }} />
        <td className="num" style={{ color: 'var(--ink-3)' }} />
        <td className="num" style={{ color: 'var(--ink-3)' }}>{snap.kills}</td>
        <td className="num" style={{ color: 'var(--ink-3)' }}>{snap.deaths}</td>
        <td className="num" style={{ color: 'var(--ink-3)' }}>{kd.toFixed(2)}</td>
        {/* KR/LR need a player-count denominator the context snaps don't carry — left blank, like Players/Avg-Rd above. */}
        <td className="num" />
        <td className="num" />
        <td className="num" style={{ color: 'var(--ink-2)' }}>
          {snap.deathsForm.in_form}/{snap.deathsForm.skirm}/{snap.deathsForm.oob}
        </td>
        <td className="num">{formatAvgT(unitSnapAvgTd(snap))}</td>
        <td className="num">{formatAvgT(unitSnapAvgTk(snap))}</td>
        {/* TDI/TDR% need per-round team totals the context snaps don't carry — left blank. */}
        <td className="num" />
        <td className="num" />
      </tr>
    );
  };

  // Render the derived per-unit stats table (K/D, formation makeup, ×Td/×Tk, player counts).
  // `mapping` is the token→regiments map for player-count/context derivation:
  // the active season's for as-of-week, the cross-season union for event totals.
  const renderUnitStatsTable = (snaps, regBreakdown, contextStats, mapping = tokenRegiments, ticketShares = {}) => {
    const playerCounts = regBreakdown ? deriveTokenPlayerCounts(regBreakdown, mapping) : {};
    const ctxSnaps = contextStats ? deriveTokenContextSnaps(contextStats, mapping) : null;
    const rows = Object.entries(snaps)
      .filter(([, s]) => s.kills || s.deaths)
      .map(([unit, s]) => {
        const playerRounds = playerCounts[unit]?.playerRounds ?? 0;
        return {
          unit,
          kills: s.kills,
          deaths: s.deaths,
          kd: s.deaths > 0 ? s.kills / s.deaths : s.kills,
          // Size-normalized: kills / casualties over total players fielded.
          killRate: perPlayerRate(s.kills, playerRounds),
          lossRate: perPlayerRate(s.deaths, playerRounds),
          form: s.deathsForm,
          td: unitSnapAvgTd(s),
          tk: unitSnapAvgTk(s),
          // Avg per-round share of the team's ticket damage inflicted / received.
          tdInf: ticketShares[unit]?.avgPctInflicted ?? null,
          tdRec: ticketShares[unit]?.avgPctReceived ?? null,
          uniquePlayers: playerCounts[unit]?.uniquePlayers ?? 0,
          avgPlayers: playerCounts[unit]?.avgPlayers ?? 0,
          ctx: ctxSnaps?.[unit] ?? null,
        };
      })
      .sort((a, b) => b.kills - a.kills);
    if (rows.length === 0) {
      return (
        <p className="note">
          No assigned player stats yet. Use "Assign Player Stats" on a week to map units to scoreboard regiments.
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Unit</th>
              <th className="num" title="Total unique players across all rounds">Players</th>
              <th className="num" title="Average player count per round">Avg/Rd</th>
              <th className="num">K</th>
              <th className="num">D</th>
              <th className="num">K/D</th>
              <th className="num cursor-help" title={KILL_RATE_LABEL}>KR</th>
              <th className="num cursor-help" title={LOSS_RATE_LABEL}>LR</th>
              <th className="num" title="Deaths by stance">{`Form (${FORMATION_SHORT.in_form}/${FORMATION_SHORT.skirm}/${FORMATION_SHORT.oob})`}</th>
              <th className="num" title={AVG_TD_LABEL}>×Td</th>
              <th className="num" title={AVG_TK_LABEL}>×Tk</th>
              <th className="num cursor-help" title={AVG_TICKET_INFLICTED_LABEL}>TDI%</th>
              <th className="num cursor-help" title={AVG_TICKET_RECEIVED_LABEL}>TDR%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isOpen = expandedUnits.has(r.unit);
              return (
                <React.Fragment key={r.unit}>
                  <tr
                    className={`${r.ctx ? 'click hover:brightness-110' : ''}`}
                    onClick={() => r.ctx && toggleExpandedUnit(r.unit)}
                  >
                    <td className="wor-name">
                      {r.ctx && (
                        <span className="inline-block w-3 mr-1 text-text-secondary">{isOpen ? '▾' : '▸'}</span>
                      )}
                      {r.unit}
                    </td>
                    <td className="num">{r.uniquePlayers}</td>
                    <td className="num">{Math.round(r.avgPlayers)}</td>
                    <td className="num">{r.kills}</td>
                    <td className="num">{r.deaths}</td>
                    <td className="num">{r.kd.toFixed(2)}</td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}>{formatRate(r.killRate)}</td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}>{formatRate(r.lossRate)}</td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}>{r.form.in_form}/{r.form.skirm}/{r.form.oob}</td>
                    <td className="num">{formatAvgT(r.td)}</td>
                    <td className="num">{formatAvgT(r.tk)}</td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}><TicketPct share={r.tdInf} shareTitle={AVG_TICKET_INFLICTED_LABEL} /></td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}><TicketPct share={r.tdRec} shareTitle={AVG_TICKET_RECEIVED_LABEL} /></td>
                  </tr>
                  {isOpen && r.ctx && (
                    <>
                      {renderContextRow('As USA', r.ctx.asUSA)}
                      {renderContextRow('As CSA', r.ctx.asCSA)}
                      {renderContextRow('As Attacker', r.ctx.asAttacker)}
                      {renderContextRow('As Defender', r.ctx.asDefender)}
                    </>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Open the Assign-stats modal for the selected week.
  const openCasualtyModal = () => {
    if (!selectedWeek) { alert('Please select a week first'); return; }
    void loadScoreboardData();
    setShowCasualtyModal(true);
  };

  // Recompute per-(week,round,token) snapshots from every bound scoreboard for a
  // mapping and persist them onto the weeks (portable fallback for the Stats
  // view when scoreboards aren't loaded). Tokens with no data are omitted.
  const backfillUnitSnapshots = (scoped) => {
    const groups = {};
    for (const { weekId, round, breakdown } of perScoreboardBreakdown) {
      if (!weekId || (round !== 1 && round !== 2)) continue;
      const k = `${weekId}::${round}`;
      (groups[k] = groups[k] || []).push(breakdown);
    }
    const byWeek = {};
    for (const [k, brks] of Object.entries(groups)) {
      const sep = k.lastIndexOf('::');
      const weekId = k.slice(0, sep);
      const round = k.slice(sep + 2);
      // Each week rolls up under its own season's token→regiments mapping.
      const mapping = effectiveTokenRegiments(scoped, seasonOfWeek(weekId));
      const snaps = accumulateTokenSnaps(brks, mapping);
      const kept = {};
      for (const [t, s] of Object.entries(snaps)) if (s.kills || s.deaths) kept[t] = s;
      byWeek[weekId] = byWeek[weekId] || { r1: {}, r2: {} };
      byWeek[weekId][`r${round}`] = kept;
    }
    setAppState(prev => updateActiveEvent(prev, ev => ({
      ...ev,
      seasons: ev.seasons.map(se => ({
        ...se,
        weeks: (se.weeks || []).map(w => byWeek[w.id] ? { ...w, unitStats: byWeek[w.id] } : w),
      })),
    })));
  };

  // Preselect the scope that currently defines this token: its own season
  // override when one exists (so you keep editing that), else the Overall
  // default (so an ordinary edit stays global, as it did before scoping).
  const openAssign = (token) => {
    const seasonId = appState.activeSeasonId ?? OVERALL_SCOPE;
    const initScope = (seasonId !== OVERALL_SCOPE && tokenRegimentsScoped[seasonId]?.[token]) ? seasonId : OVERALL_SCOPE;
    setAssignToken(token);
    setAssignScope(initScope);
    setAssignSel(effectiveTokenRegiments(tokenRegimentsScoped, initScope)[token] || []);
  };
  // Switch the edit scope, re-seeding the selection from that scope's current
  // list for the token (a season with no override starts from the inherited set).
  const changeAssignScope = (scope) => {
    setAssignScope(scope);
    setAssignSel(effectiveTokenRegiments(tokenRegimentsScoped, scope)[assignToken] || []);
  };
  const toggleAssignReg = (reg) =>
    setAssignSel(sel => sel.includes(reg) ? sel.filter(r => r !== reg) : [...sel, reg]);
  const saveAssign = () => {
    if (!assignToken) return;
    const scope = assignScope || OVERALL_SCOPE;
    const nextScoped = { ...tokenRegimentsScoped };
    const scopeMap = { ...(nextScoped[scope] || {}) };
    // Empty selection clears the entry — for a season scope this reverts the
    // token to the Overall default rather than pinning it to nothing.
    if (assignSel.length) scopeMap[assignToken] = [...assignSel]; else delete scopeMap[assignToken];
    if (Object.keys(scopeMap).length) nextScoped[scope] = scopeMap; else delete nextScoped[scope];
    setAppState(prev => updateActiveEvent(prev, ev => ({ ...ev, tokenRegiments: nextScoped })));
    backfillUnitSnapshots(nextScoped);
    setAssignToken(null);
  };

  // Division Management Functions
  const addDivision = () => {
    const name = prompt('Enter division name:');
    if (!name || !name.trim()) return;
    if (divisions.some(d => d.name === name.trim())) {
      alert('A division with this name already exists!');
      return;
    }
    setDivisions([...divisions, { name: name.trim(), units: [] }]);
  };

  const renameDivision = (oldName, newName) => {
    if (!newName || !newName.trim()) return;
    if (divisions.some(d => d.name === newName.trim() && d.name !== oldName)) {
      alert('A division with this name already exists!');
      return;
    }
    setDivisions(divisions.map(d =>
      d.name === oldName ? { ...d, name: newName.trim() } : d
    ));
  };

  const deleteDivision = (divisionName) => {
    if (!confirm(`Delete division "${divisionName}"?`)) return;
    setDivisions(divisions.filter(d => d.name !== divisionName));
  };

  const addUnitToDivision = (divisionName, unitName) => {
    setDivisions(divisions.map(d => {
      if (d.name === divisionName) {
        if (!d.units.includes(unitName)) {
          return { ...d, units: [...d.units, unitName] };
        }
        return d;
      }
      // Remove from other divisions
      return { ...d, units: d.units.filter(u => u !== unitName) };
    }));
  };

  const removeUnitFromDivision = (divisionName, unitName) => {
    setDivisions(divisions.map(d =>
      d.name === divisionName
        ? { ...d, units: d.units.filter(u => u !== unitName) }
        : d
    ));
  };

  // Get units not assigned to any division
  const getUnassignedUnits = () => {
    const assignedUnits = new Set(divisions.flatMap(d => d.units));
    return units.filter(u => !assignedUnits.has(u));
  };

  // Calculate live preview stats for balancer
  const calculatePreviewStats = (teamA, teamB) => {
    const minA = teamA.reduce((sum, u) => sum + (balancerUnitCounts[u]?.min || 0), 0);
    const maxA = teamA.reduce((sum, u) => sum + (balancerUnitCounts[u]?.max || 0), 0);
    const minB = teamB.reduce((sum, u) => sum + (balancerUnitCounts[u]?.min || 0), 0);
    const maxB = teamB.reduce((sum, u) => sum + (balancerUnitCounts[u]?.max || 0), 0);
    
    const avgA = (minA + maxA) / 2;
    const avgB = (minB + maxB) / 2;
    const avgDiff = Math.abs(avgA - avgB);
    const minDiff = Math.abs(minA - minB);
    
    // Calculate average teammate history for each team
    const { teammate } = computeStats();
    
    const calculateTeamAvgHistory = (team) => {
      if (team.length < 2) return 0;
      
      let totalHistory = 0;
      let pairCount = 0;
      
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const u1 = team[i];
          const u2 = team[j];
          const count = teammate[u1]?.[u2] || 0;
          totalHistory += count;
          pairCount++;
        }
      }
      
      return pairCount > 0 ? totalHistory / pairCount : 0;
    };
    
    const avgHistoryA = calculateTeamAvgHistory(teamA);
    const avgHistoryB = calculateTeamAvgHistory(teamB);
    const combinedAvgHistory = (avgHistoryA + avgHistoryB) / 2;

    // Calculate win probabilities for each round if week is selected
    let round1Probability = null;
    let round2Probability = null;
    if (selectedWeek && teamA.length > 0 && teamB.length > 0) {
      const weekIdx = weeks.findIndex(w => w.id === selectedWeek.id);
      const round1Map = selectedWeek.round1Map;
      const round1Flipped = selectedWeek.round1Flipped || false;
      const round2Map = selectedWeek.round2Map;
      const round2Flipped = selectedWeek.round2Flipped || false;
      round1Probability = calculateWinProbability(teamA, teamB, round1Map, round1Flipped, weekIdx);
      round2Probability = calculateWinProbability(teamA, teamB, round2Map, round2Flipped, weekIdx);
    }

    return { minA, maxA, minB, maxB, avgDiff, minDiff, avgHistoryA, avgHistoryB, combinedAvgHistory, round1Probability, round2Probability };
  };

  // Calculate team balance stats for current week assignments
  // Get division matchups between two teams (same-division units on opposing teams)
  const getDivisionMatchups = (teamA, teamB) => {
    if (divisions.length === 0) return [];
    const unitDiv = {};
    divisions.forEach(div => {
      div.units.forEach(unit => { unitDiv[unit] = div.name; });
    });
    const matchups = [];
    for (const uA of teamA) {
      const divA = unitDiv[uA];
      if (!divA) continue;
      for (const uB of teamB) {
        if (unitDiv[uB] === divA) {
          matchups.push({ unitA: uA, unitB: uB, division: divA });
        }
      }
    }
    return matchups;
  };

  const calculateWeekTeamStats = () => {
    if (!selectedWeek) return null;
    
    const weekIdx = weeks.findIndex(w => w.id === selectedWeek.id);
    const teamA = selectedWeek.teamA || [];
    const teamB = selectedWeek.teamB || [];
    
    if (teamA.length === 0 && teamB.length === 0) return null;
    
    // Get unit player counts for this week
    const getPlayerCount = (unit) => {
      const counts = selectedWeek.unitPlayerCounts?.[unit] || unitPlayerCounts[unit];
      if (!counts) return 0;
      const min = parseInt(counts.min) || 0;
      const max = parseInt(counts.max) || 0;
      return (min + max) / 2;
    };
    
    const minA = teamA.reduce((sum, u) => sum + (selectedWeek.unitPlayerCounts?.[u]?.min || unitPlayerCounts[u]?.min || 0), 0);
    const maxA = teamA.reduce((sum, u) => sum + (selectedWeek.unitPlayerCounts?.[u]?.max || unitPlayerCounts[u]?.max || 0), 0);
    const minB = teamB.reduce((sum, u) => sum + (selectedWeek.unitPlayerCounts?.[u]?.min || unitPlayerCounts[u]?.min || 0), 0);
    const maxB = teamB.reduce((sum, u) => sum + (selectedWeek.unitPlayerCounts?.[u]?.max || unitPlayerCounts[u]?.max || 0), 0);
    
    const avgA = (minA + maxA) / 2;
    const avgB = (minB + maxB) / 2;
    const avgDiff = Math.abs(avgA - avgB);
    const minDiff = Math.abs(minA - minB);
    const maxDiff = Math.abs(maxA - maxB);
    const totalMin = minA + minB;
    const totalMax = maxA + maxB;
    const totalAvg = avgA + avgB;
    
    // Calculate average teammate history for each team
    // Only count rounds BEFORE the current week (same as balancer)
    const teammate = {};

    weeks.forEach((week, idx) => {
      if (idx >= weekIdx) return;

      [1, 2].forEach(roundNum => {
        const { teamA: rTeamA, teamB: rTeamB } = getEffectiveTeams(week, roundNum);

        rTeamA.forEach(unit1 => {
          if (!teammate[unit1]) teammate[unit1] = {};
          rTeamA.forEach(unit2 => {
            if (unit1 !== unit2) {
              teammate[unit1][unit2] = (teammate[unit1][unit2] || 0) + 1;
            }
          });
        });

        rTeamB.forEach(unit1 => {
          if (!teammate[unit1]) teammate[unit1] = {};
          rTeamB.forEach(unit2 => {
            if (unit1 !== unit2) {
              teammate[unit1][unit2] = (teammate[unit1][unit2] || 0) + 1;
            }
          });
        });
      });
    });
    
    const calculateTeamAvgHistory = (team) => {
      if (team.length < 2) return 0;
      
      let totalHistory = 0;
      let pairCount = 0;
      
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const u1 = team[i];
          const u2 = team[j];
          const count = teammate[u1]?.[u2] || 0;
          totalHistory += count;
          pairCount++;
        }
      }
      
      return pairCount > 0 ? totalHistory / pairCount : 0;
    };
    
    const avgHistoryA = calculateTeamAvgHistory(teamA);
    const avgHistoryB = calculateTeamAvgHistory(teamB);
    const combinedAvgHistory = (avgHistoryA + avgHistoryB) / 2;

    // Calculate win probabilities for each round
    const round1Map = selectedWeek.round1Map;
    const round1Flipped = selectedWeek.round1Flipped || false;
    const round2Map = selectedWeek.round2Map;
    const round2Flipped = selectedWeek.round2Flipped || false;

    const round1Probability = (teamA.length > 0 && teamB.length > 0)
      ? calculateWinProbability(teamA, teamB, round1Map, round1Flipped, weekIdx)
      : null;
    const round2Probability = (teamA.length > 0 && teamB.length > 0)
      ? calculateWinProbability(teamA, teamB, round2Map, round2Flipped, weekIdx)
      : null;

    return {
      teamA,
      teamB,
      minA,
      maxA,
      minB,
      maxB,
      avgA,
      avgB,
      avgDiff,
      minDiff,
      maxDiff,
      totalMin,
      totalMax,
      totalAvg,
      avgHistoryA,
      avgHistoryB,
      combinedAvgHistory,
      round1Probability,
      round2Probability
    };
  };

  // Render company config + auto-computed assignments for a round/side
  const renderCompanySection = (roundKey) => {
    if (!selectedWeek) return null;
    const rawConfig = selectedWeek.companyConfig?.[roundKey] || {};
    const config = { A: { ...DEFAULT_COMPANY_SIDE, ...rawConfig.A }, B: { ...DEFAULT_COMPANY_SIDE, ...rawConfig.B } };
    const effective = getEffectiveTeams(selectedWeek, roundKey === 'r1' ? 1 : 2);
    const unitCountsSource = selectedWeek.unitPlayerCounts || unitPlayerCounts;

    // Write one side's config back onto the week.
    const setSideConfig = (side, patch) => updateWeek(selectedWeek.id, {
      companyConfig: {
        ...(selectedWeek.companyConfig || {}),
        [roundKey]: {
          ...(selectedWeek.companyConfig?.[roundKey] || {}),
          [side]: clampSideConfig({ ...config[side], ...patch })
        }
      }
    });

    return (
      <div style={{ marginTop: 13 }}>
        <label className="cap">Company Balancer</label>
        {['A', 'B'].map(side => (
          <div key={side} className="panel pb">
            <div className="text-xs font-semibold text-text-secondary">{teamNames[side]}</div>
            <CompanyConfigFields config={config[side]} onChange={(patch) => setSideConfig(side, patch)} />
            <CompanyList
              companies={distributeCompanies(
                rosterFromCounts(side === 'A' ? effective.teamA : effective.teamB, unitCountsSource),
                config[side]
              )}
            />
          </div>
        ))}
      </div>
    );
  };

  // Drag and drop handlers for balancer
  const handleDragStart = (unit, sourceTeam) => {
    setDraggedUnit({ unit, sourceTeam });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (targetTeam) => {
    if (!draggedUnit || !balancerResults) return;

    const { unit, sourceTeam } = draggedUnit;
    const currentResult = balancerResults[selectedBalanceIndex];

    // Don't do anything if dropping on same team
    if (sourceTeam === targetTeam) {
      setDraggedUnit(null);
      return;
    }

    // Create new team arrays
    const newTeamA = sourceTeam === 'A'
      ? currentResult.teamA.filter(u => u !== unit)
      : [...currentResult.teamA, unit];

    const newTeamB = sourceTeam === 'B'
      ? currentResult.teamB.filter(u => u !== unit)
      : [...currentResult.teamB, unit];

    // Calculate new stats
    const newStats = calculatePreviewStats(newTeamA, newTeamB);

    // Update just the selected option in the results array
    const updatedResults = [...balancerResults];
    updatedResults[selectedBalanceIndex] = {
      ...currentResult,
      teamA: newTeamA,
      teamB: newTeamB,
      score: newStats.avgDiff,
      minA: newStats.minA,
      maxA: newStats.maxA,
      minB: newStats.minB,
      maxB: newStats.maxB,
      avgHistoryA: newStats.avgHistoryA,
      avgHistoryB: newStats.avgHistoryB,
      combinedAvgHistory: newStats.combinedAvgHistory,
      round1Probability: newStats.round1Probability,
      round2Probability: newStats.round2Probability
    };
    setBalancerResults(updatedResults);

    setDraggedUnit(null);
  };

  // Main drag and drop handlers for Units list and team rosters
  const handleMainDragStart = (unit, sourceTeam) => {
    setDraggedMainUnit({ unit, sourceTeam });
  };

  const handleMainDragOver = (e) => {
    e.preventDefault();
  };

  const handleMainDrop = (targetTeam) => {
    if (!draggedMainUnit || !selectedWeek) {
      setDraggedMainUnit(null);
      return;
    }
    
    const { unit, sourceTeam } = draggedMainUnit;
    
    // If dropping on the same team, do nothing
    if (sourceTeam === targetTeam) {
      setDraggedMainUnit(null);
      return;
    }
    
    // Move unit to target team
    if (targetTeam === 'A' || targetTeam === 'B') {
      moveUnitToTeam(unit, targetTeam);
    }
    
    setDraggedMainUnit(null);
  };

  const handleMainDropToUnassigned = () => {
    if (!draggedMainUnit || !selectedWeek) {
      setDraggedMainUnit(null);
      return;
    }
    
    const { unit, sourceTeam } = draggedMainUnit;
    
    // Remove from team if it was in one
    if (sourceTeam === 'A' || sourceTeam === 'B') {
      removeUnitFromTeam(unit, sourceTeam);
    }
    
    setDraggedMainUnit(null);
  };

  // Get units available for the selected week (not assigned to either team)
  const getAvailableUnitsForWeek = () => {
    if (!selectedWeek) return units;
    
    const assignedUnits = new Set([...selectedWeek.teamA, ...selectedWeek.teamB]);
    return units.filter(u => !assignedUnits.has(u));
  };

  // Simulation Functions
  // Units that take lead assignments and earn points.
  const tokenUnits = useMemo(
    () => units.filter(u => !nonTokenUnits.includes(u)),
    [units, nonTokenUnits]
  );

  /** Expected head count per unit — the midpoint of its min/max. */
  const unitHeadcounts = useMemo(() => {
    const src = selectedWeek?.unitPlayerCounts && Object.keys(selectedWeek.unitPlayerCounts).length
      ? selectedWeek.unitPlayerCounts
      : unitPlayerCounts;
    const out = {};
    units.forEach(u => {
      const c = src[u];
      out[u] = c ? ((c.min || 0) + (c.max || 0)) / 2 : 0;
    });
    return out;
  }, [units, unitPlayerCounts, selectedWeek]);

  /** The season roster, with what each unit has done in it. */
  const rosterRows = useMemo(() => rosterRowsOf(activeSeason), [activeSeason]);

  /** The night builder names round types the way the prototype does. */
  const nightBuilderType = !selectedWeek ? 'Regular'
    : selectedWeek.isPlayoffs ? 'Playoffs'
    : selectedWeek.isSingleRoundLeads ? 'Single round leads'
    : selectedWeek.isFunRound ? 'Fun round'
    : 'Regular';

  /** Copy a night's shape — sides and leads — without its results. */
  const duplicateSelectedWeek = () => {
    if (!selectedWeek) return;
    const copy = {
      ...selectedWeek,
      id: Date.now(),
      name: `${selectedWeek.name} (copy)`,
      round1Winner: null, round2Winner: null,
      round1Draw: false, round2Draw: false,
      round1Map: null, round2Map: null,
      r1CasualtiesA: 0, r1CasualtiesB: 0, r2CasualtiesA: 0, r2CasualtiesB: 0,
      roundSwaps: { r1: [], r2: [] },
    };
    setWeeks([...weeks, copy]);
    setSelectedWeek(copy);
  };

  /**
   * The season as the Overview, Standings and Schedule screens read it. One
   * shape, three screens — the prototype's rows, not three ad-hoc projections.
   */
  const divisionOfUnit = useMemo(() => {
    const m = {};
    divisions.forEach(d => (d.units || []).forEach(u => { m[u] = d.name; }));
    return m;
  }, [divisions]);

  const standingRows = useMemo(() => standingRowsOf(activeSeason), [activeSeason]);

  const nightRows = useMemo(() => nightRowsOf(activeSeason), [activeSeason]);

  /** Season-at-a-glance figures. */
  const seasonKpis = useMemo(() => seasonKpisOf(activeSeason), [activeSeason]);

  /**
   * The pairing grid. Scope decides whether it reads this season or every
   * season in the event — a unit's history with another one does not reset in
   * January, and the balancer's teammate weight is happy to read either.
   */
  const pairHeatmapData = useMemo(() => {
    const scanned = heatmapScope === 'event'
      ? (activeEvent?.seasons || [])
      : (activeSeason ? [activeSeason] : []);
    return buildPairHeatmap(scanned.flatMap(s => s.weeks || []));
  }, [heatmapScope, activeEvent, activeSeason]);

  /**
   * Ratings after each week of the active season, so the ladder can draw a
   * unit's whole run. One engine replay per week — the engine is pure and the
   * season is a couple of dozen weeks, so this is cheap enough to memoize
   * rather than cache.
   */
  const eloLadderRows = useMemo(
    () => eloLadderRowsOf(appState, activeEvent, activeSeason),
    [appState, activeEvent, activeSeason],
  );

  /** Rankings after one night, with movement — what the rankings image draws. */
  const rankingAfter = useCallback(
    (nightIdx, by) => rankingAfterOf(appState, activeEvent, activeSeason, nightIdx, by),
    [appState, activeEvent, activeSeason],
  );

  const unitLogos = useMemo(() => seasonLogos(activeEvent, activeSeason), [activeEvent, activeSeason]);

  /** The rankings image and its unit-logo editor, as the Standings and Elo screens both show it. */
  const rankingsImage = (defaultBy) => activeSeason && (
    <StandingsImagePanel
      eventName={activeEvent.name}
      seasonName={activeSeason.name}
      nights={nightRows}
      rankingAfter={rankingAfter}
      defaultBy={defaultBy}
      logos={unitLogos}
    >
      <UnitLogos
        units={[...(activeSeason.units || [])].sort()}
        seasonId={activeSeason.id}
        seasonName={activeSeason.name}
        logoOf={(unit) => logoForUnit(activeEvent, activeSeason.id, unit)}
        seasonNameOf={(id) => activeEvent.seasons.find(s => s.id === id)?.name ?? 'an earlier season'}
        onSet={(unit, image, scope, seasonId) => setAppState(prev =>
          setUnitLogo(prev, unit, image, scope, seasonId ?? undefined))}
      />
    </StandingsImagePanel>
  );

  // The league as the playoff planner sees it: who can qualify, how they are
  // grouped, and how many nights the post-season has to work with.
  const playoffLeague = useMemo(() => ({
    unitCount: tokenUnits.length,
    divisions: (divisions || []).map(d => ({
      name: d.name,
      unitCount: (d.units || []).filter(u => tokenUnits.includes(u)).length,
    })),
    nightsAvailable: Math.max(0, playoffNights),
  }), [tokenUnits, divisions, playoffNights]);

  // What the settings on screen actually produce, and the formats worth
  // considering instead. Both are cheap enough to recompute as settings change.
  const playoffAudit = useMemo(
    () => (playoffConfig.enabled ? evaluatePlayoffFormat(playoffConfig, playoffLeague) : null),
    [playoffConfig, playoffLeague]
  );
  const playoffSuggestions = useMemo(
    () => (playoffConfig.enabled ? suggestPlayoffFormats(playoffLeague, { limit: 3 }) : []),
    [playoffConfig.enabled, playoffLeague]
  );
  const playoffAdvice = useMemo(
    () => (playoffConfig.enabled ? playoffLeagueAdvice(playoffLeague) : []),
    [playoffConfig.enabled, playoffLeague]
  );

  /** True when a suggested format is the one already configured. */
  const isPlayoffFormatApplied = useCallback((plan) => (
    !!playoffAudit &&
    plan.config.useDivisions === playoffAudit.config.useDivisions &&
    plan.config.teamsPerDivision === playoffAudit.config.teamsPerDivision &&
    plan.config.wildcardTeams === playoffAudit.config.wildcardTeams &&
    STAGE_KEYS.every(k => plan.config.roundFormats[k] === playoffAudit.config.roundFormats[k])
  ), [playoffAudit]);

  // What the current settings would generate, for the simulate dialog's hint.
  const simPreview = useMemo(() => {
    const leadsPerNight = LEADS_PER_NIGHT[simLeadMode];
    const nights = plannedNightCount(tokenUnits.length, simLeadNightsPerUnit, simLeadMode);
    return {
      leadsPerNight,
      nights,
      rounds: nights * ROUNDS_PER_NIGHT,
      leftover: (tokenUnits.length * simLeadNightsPerUnit) % leadsPerNight,
    };
  }, [tokenUnits, simLeadNightsPerUnit, simLeadMode]);

  // Points from a simulated season: what a token unit banked on average, and
  // the most it could have banked given the leads the schedule handed it.
  const calculatePointAnalytics = (simulatedWeeks) => {
    if (tokenUnits.length === 0) return null;

    const unitStats = {};
    tokenUnits.forEach(unit => {
      unitStats[unit] = { leadPoints: 0, assistPoints: 0, leadRounds: 0, leadNights: 0 };
    });

    let totalRounds = 0;
    let totalWeeks = 0;

    simulatedWeeks.forEach(week => {
      if (!week.round1Winner || !week.round2Winner) return;
      const rounds = weekLeadRounds(week);
      totalWeeks += 1;
      totalRounds += rounds.length;

      // Lead vs assist mix — a full-lead week counts the same unit twice.
      const nightLeads = new Set();
      rounds.forEach(({ leadA, leadB }) => [leadA, leadB].forEach(unit => {
        if (!unitStats[unit]) return;
        unitStats[unit].leadRounds += 1;
        nightLeads.add(unit);
      }));
      nightLeads.forEach(unit => { unitStats[unit].leadNights += 1; });

      rounds.forEach(({ leadA, leadB }, index) => {
        const winner = index === 0 ? week.round1Winner : week.round2Winner;
        const winningTeam = winner === 'A' ? week.teamA : week.teamB;
        const losingTeam = winner === 'A' ? week.teamB : week.teamA;
        const leadWinner = winner === 'A' ? leadA : leadB;
        const leadLoser = winner === 'A' ? leadB : leadA;

        winningTeam.forEach(unit => {
          if (!unitStats[unit]) return;
          if (unit === leadWinner) unitStats[unit].leadPoints += pointSystem.winLead;
          else unitStats[unit].assistPoints += pointSystem.winAssist;
        });
        losingTeam.forEach(unit => {
          if (!unitStats[unit]) return;
          if (unit === leadLoser) unitStats[unit].leadPoints += pointSystem.lossLead;
          else unitStats[unit].assistPoints += pointSystem.lossAssist;
        });
      });

      // Sweep bonus — in a split-lead week both of the sweeping side's leads earn it.
      if (week.round1Winner === week.round2Winner) {
        const sweepTeam = week.round1Winner === 'A' ? week.teamA : week.teamB;
        const sweepLeads = new Set(
          rounds.map(round => (week.round1Winner === 'A' ? round.leadA : round.leadB)).filter(Boolean)
        );
        sweepTeam.forEach(unit => {
          if (!unitStats[unit]) return;
          if (sweepLeads.has(unit)) unitStats[unit].leadPoints += pointSystem.bonus2_0Lead;
          else unitStats[unit].assistPoints += pointSystem.bonus2_0Assist;
        });
      }
    });

    if (totalRounds === 0) return null;

    const mean = (pick) => tokenUnits.reduce((sum, unit) => sum + pick(unitStats[unit]), 0) / tokenUnits.length;
    const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

    const avgLeadPoints = mean(stat => stat.leadPoints);
    const avgAssistPoints = mean(stat => stat.assistPoints);
    const avgTotalPoints = avgLeadPoints + avgAssistPoints;

    // Max possible: win every round and every sweep, on the unit's own share of
    // lead rounds — read off the schedule, not guessed from the settings.
    const theoreticalLeadPoints = mean(stat =>
      stat.leadRounds * pointSystem.winLead + stat.leadNights * pointSystem.bonus2_0Lead);
    const theoreticalAssistPoints = mean(stat =>
      (totalRounds - stat.leadRounds) * pointSystem.winAssist
      + (totalWeeks - stat.leadNights) * pointSystem.bonus2_0Assist);
    const theoreticalTotalPoints = theoreticalLeadPoints + theoreticalAssistPoints;

    return {
      simulated: {
        leadPoints: avgLeadPoints,
        assistPoints: avgAssistPoints,
        totalPoints: avgTotalPoints,
        leadPercentage: share(avgLeadPoints, avgTotalPoints),
        assistPercentage: share(avgAssistPoints, avgTotalPoints),
        totalLeadPoints: avgLeadPoints * tokenUnits.length,
        totalAssistPoints: avgAssistPoints * tokenUnits.length,
      },
      theoretical: {
        leadPoints: theoreticalLeadPoints,
        assistPoints: theoreticalAssistPoints,
        totalPoints: theoreticalTotalPoints,
        leadPercentage: share(theoreticalLeadPoints, theoreticalTotalPoints),
        assistPercentage: share(theoreticalAssistPoints, theoreticalTotalPoints),
      },
      totalRounds,
      totalWeeks,
    };
  };

  // Spread the non-lead units over both sides, keeping teammate pairings varied
  // across the season. Returns a filler that mutates the two team arrays given.
  const makeTeamFiller = () => {
    const pairings = {};
    const pairCount = (a, b) => pairings[a]?.[b] || 0;
    const record = (a, b) => {
      if (a === b) return;
      pairings[a] = { ...pairings[a], [b]: pairCount(a, b) + 1 };
      pairings[b] = { ...pairings[b], [a]: pairCount(b, a) + 1 };
    };
    const teamScore = (unit, team) => team.reduce((sum, mate) => sum + pairCount(unit, mate), 0);

    return (teamA, teamB) => {
      const leading = new Set([...teamA, ...teamB]);
      units
        .filter(unit => !leading.has(unit))
        .map(unit => ({ unit, paired: Object.values(pairings[unit] || {}).reduce((sum, n) => sum + n, 0) }))
        .sort((a, b) => a.paired - b.paired) // the least-teamed units choose first
        .forEach(({ unit }) => {
          (teamScore(unit, teamA) <= teamScore(unit, teamB) ? teamA : teamB).push(unit);
        });
      [teamA, teamB].forEach(team =>
        team.forEach((unit, i) => team.slice(i + 1).forEach(mate => record(unit, mate)))
      );
    };
  };

  // ── Paste a schedule ───────────────────────────────────────────────────────
  // Leagues plan fixtures in a spreadsheet, so the schedule maker takes the
  // paste rather than insisting the schedule be built here. Home picks the map
  // and away picks the side, so home lands on side A.
  const pastedSchedule = useMemo(
    () => (simPaste.trim() ? parseSchedulePaste(simPaste, units) : null),
    [simPaste, units]
  );

  const pastedAudit = useMemo(() => {
    if (!pastedSchedule) return null;
    return auditSchedule(pastedSchedule.rows, tokenUnits, {
      mode: simLeadMode,
      homePerUnit: simHomePerUnit,
      awayPerUnit: simAwayPerUnit,
      splitAcrossRounds: simSplitRounds,
    });
  }, [pastedSchedule, tokenUnits, simLeadMode, simHomePerUnit, simAwayPerUnit, simSplitRounds]);

  const applyPastedSchedule = () => {
    if (!pastedSchedule || pastedSchedule.rows.length === 0) return;
    const drafts = scheduleWeeks(pastedSchedule.rows, simLeadMode);
    const lastWeek = weeks[weeks.length - 1];
    const inheritedUnitPlayerCounts = lastWeek?.unitPlayerCounts ?? unitPlayerCounts;
    const stamp = Date.now();
    const newWeeks = drafts.map((d, i) => ({
      id: stamp + i,
      name: d.name,
      teamA: d.teamA,
      teamB: d.teamB,
      round1Winner: null,
      round2Winner: null,
      round1Draw: false,
      round2Draw: false,
      round1Map: null,
      round2Map: null,
      round1Flipped: false,
      round2Flipped: false,
      leadA: d.leadA,
      leadB: d.leadB,
      isPlayoffs: false,
      isSingleRoundLeads: d.isSingleRoundLeads,
      isFunRound: false,
      leadA_r1: d.leadA_r1,
      leadB_r1: d.leadB_r1,
      leadA_r2: d.leadA_r2,
      leadB_r2: d.leadB_r2,
      r1CasualtiesA: 0,
      r1CasualtiesB: 0,
      r2CasualtiesA: 0,
      r2CasualtiesB: 0,
      unitPlayerCounts: { ...inheritedUnitPlayerCounts },
      weeklyCasualties: {
        [teamNames.A]: { r1: {}, r2: {} },
        [teamNames.B]: { r1: {}, r2: {} }
      },
      roundSwaps: { r1: [], r2: [] },
      companyConfig: {
        r1: { A: { ...DEFAULT_COMPANY_SIDE }, B: { ...DEFAULT_COMPANY_SIDE } },
        r2: { A: { ...DEFAULT_COMPANY_SIDE }, B: { ...DEFAULT_COMPANY_SIDE } }
      }
    }));
    setWeeks([...weeks, ...newWeeks]);
    setSimPaste('');
      };

  const simulateSeason = () => {
    if (units.length === 0) {
      alert('Please add units before simulating a season.');
      return;
    }
    if (tokenUnits.length === 0) {
      alert('Please add at least one token unit before simulating.');
      return;
    }
    if (simLeadNightsPerUnit <= 0) {
      alert('Invalid simulation settings. Lead nights per unit must be greater than 0.');
      return;
    }

    const unitToDivision = {};
    divisions.forEach(division => {
      division.units.forEach(unit => { unitToDivision[unit] = division.name; });
    });

    const schedule = buildLeadSchedule({
      units: tokenUnits,
      leadNightsPerUnit: simLeadNightsPerUnit,
      mode: simLeadMode,
      divisionNights: simLeadNightsInDivision,
      unitToDivision,
    });

    if (schedule.nights.length === 0) {
      alert(`Not enough token units: a ${simLeadMode === 'rounds' ? 'lead-rounds' : 'lead-week'} night needs ${LEADS_PER_NIGHT[simLeadMode]} different leads.`);
      return;
    }

    const unitsShort = tokenUnits.filter(unit => schedule.leadCounts[unit] < simLeadNightsPerUnit);
    if (unitsShort.length > 0) {
      const shortList = unitsShort
        .map(unit => `${unit} (${schedule.leadCounts[unit]}/${simLeadNightsPerUnit})`)
        .join(', ');
      if (!confirm(`Warning: Some units didn't get their full lead night allocation:\n${shortList}\n\nDo you want to use this schedule anyway?`)) {
        return;
      }
    }

    // Player counts carry over from the most recent week, else the global defaults.
    const lastWeek = weeks[weeks.length - 1];
    const inheritedUnitPlayerCounts = lastWeek?.unitPlayerCounts ?? unitPlayerCounts;
    const splitLeads = simLeadMode === 'rounds';
    const fillTeams = makeTeamFiller();
    const randomMap = () => ALL_MAPS[Math.floor(Math.random() * ALL_MAPS.length)];
    const coinFlip = () => (Math.random() < 0.5 ? 'A' : 'B');

    const simulatedWeeks = schedule.nights.map((night, i) => {
      const [round1, round2] = splitLeads ? night.matchups : [night.matchups[0], night.matchups[0]];
      const teamA = [...new Set([round1.leadA, round2.leadA])];
      const teamB = [...new Set([round1.leadB, round2.leadB])];
      // Schedule-only weeks stop at the leads so the teams can be picked later.
      if (!simScheduleOnly) fillTeams(teamA, teamB);

      return {
        id: Date.now() + i,
        name: `Week ${weeks.length + 1 + i}`,
        teamA,
        teamB,
        round1Winner: simScheduleOnly ? null : coinFlip(),
        round2Winner: simScheduleOnly ? null : coinFlip(),
        round1Map: simScheduleOnly ? null : randomMap(),
        round2Map: simScheduleOnly ? null : randomMap(),
        round1Flipped: simScheduleOnly ? false : Math.random() < 0.5,
        round2Flipped: simScheduleOnly ? false : Math.random() < 0.5,
        leadA: splitLeads ? null : round1.leadA,
        leadB: splitLeads ? null : round1.leadB,
        isPlayoffs: false,
        isSingleRoundLeads: splitLeads,
        leadA_r1: splitLeads ? round1.leadA : null,
        leadB_r1: splitLeads ? round1.leadB : null,
        leadA_r2: splitLeads ? round2.leadA : null,
        leadB_r2: splitLeads ? round2.leadB : null,
        r1CasualtiesA: 0,
        r1CasualtiesB: 0,
        r2CasualtiesA: 0,
        r2CasualtiesB: 0,
        unitPlayerCounts: { ...inheritedUnitPlayerCounts },
        weeklyCasualties: {
          [teamNames.A]: { r1: {}, r2: {} },
          [teamNames.B]: { r1: {}, r2: {} }
        },
        roundSwaps: { r1: [], r2: [] }
      };
    });

    setWeeks([...weeks, ...simulatedWeeks]);
        setSimulationAnalytics({
      scheduleOnly: simScheduleOnly,
      splitLeads,
      spacing: summarizeLeadSpacing(simulatedWeeks, tokenUnits),
      rows: scheduleExportRows(simulatedWeeks, teamNames),
      points: simScheduleOnly ? null : calculatePointAnalytics(simulatedWeeks),
    });
    setShowAnalyticsModal(true);
  };

  const copyScheduleToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(toTsv(simulationAnalytics.rows));
      setScheduleCopied(true);
      setTimeout(() => setScheduleCopied(false), 2000);
    } catch {
      alert('Could not reach the clipboard — copy the schedule from the box below instead.');
    }
  };

  const downloadSchedule = () => downloadText(
    `schedule-${new Date().toISOString().split('T')[0]}.csv`,
    toCsv(simulationAnalytics.rows),
    'text/csv'
  );

  // Generate playoff bracket based on current standings
  /**
   * The bracket this season's standings project. The seeding itself lives in
   * utils/playoffBracket so the public site draws the same one.
   */
  const generatePlayoffBracket = (weekIndex = null) => buildPlayoffBracket({
    appState,
    event: activeEvent,
    season: activeSeason,
    weekIndex,
    selectedWeekId: selectedWeek?.id ?? null,
  });

  /** The drawn bracket, as slots the Playoffs screen can render. */
  const playoffBracketSlots = useMemo(
    () => bracketSlots({
      appState,
      event: activeEvent,
      season: activeSeason,
      selectedWeekId: selectedWeek?.id ?? null,
    }),
    [appState, activeEvent, activeSeason, selectedWeek],
  );

  /** Formats the planner rates, as the screen's cards. */
  const playoffFormatOptions = useMemo(() => playoffSuggestions.map(plan => ({
    field: plan.field?.qualifiers ?? plan.placed,
    series: plan.stages.reduce((n, st) => n + (st.matchups ?? 0), 0),
    style: plan.label ?? 'Knockout',
    entry: plan.config.useDivisions
      ? `Top ${plan.config.teamsPerDivision} per division`
      : `Top ${plan.placed} on the table`,
    bestOf: `${plan.minRounds}–${plan.maxRounds} rounds`,
    nights: plan.maxNights,
    share: Math.round((plan.qualifyRate ?? 0) * 100),
    plan,
  })), [playoffSuggestions]);


  // Optional per-formation casualty inputs (In Formation / Skirmish / Out of
  // Line) for one round + side. Writes r{N}CasualtiesForm{A|B} as an object;
  // auto-fill from scoreboard import populates the same fields.
  const renderCasualtyFormation = (roundNum, side) => {
    const field = `r${roundNum}CasualtiesForm${side}`;
    const form = selectedWeek?.[field] || { in_form: 0, skirm: 0, oob: 0 };
    const setF = (key, val) =>
      updateWeek(selectedWeek.id, { [field]: { ...form, [key]: parseInt(val) || 0 } });
    const fields = [['in_form', 'In Form'], ['skirm', 'Skirm'], ['oob', 'Out of Line']];
    const moraleField = `r${roundNum}Morale${side}`;
    const morale = selectedWeek?.[moraleField] || '';
    return (
      <>
        <div className="kpis" style={{ marginTop: 5 }}>
          {fields.map(([k, label]) => (
            <div key={k}>
              <label className="block text-[10px] text-text-muted mb-0.5">{label}</label>
              <input
                type="number"
                min="0"
                value={form[k] || 0}
                onChange={(e) => setF(k, e.target.value)}
                className="fld-i sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-1">
          <label className="block text-[10px] text-text-muted mb-0.5">Formation state (morale)</label>
          <select
            value={morale}
            onChange={(e) => updateWeek(selectedWeek.id, { [moraleField]: e.target.value || null })}
            className="fld-i sm"
          >
            <option value="">—</option>
            {MORALE_STATES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </>
    );
  };

  // Shared Map Stats block — overall card + per-skirmish-area collapsible
  // groups. Used by both the Season tab (active-season scope) and the Event
  // tab (event-wide scope). `keyPrefix` namespaces the toggleSection keys so
  // the two tabs' expand/collapse state stay independent.
  const renderMapStatsBlock = (stats, keyPrefix) => {
    const { overall, byMap } = stats;
    const pct = (wins, total) => total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';

    return (
      <>
        {overall.totalRounds > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div className="kpis">
              <div className="panel pb">
                <div className="text-xs text-text-secondary mb-1">USA Overall</div>
                <div className="text-lg font-bold f-usa">
                  {pct(overall.usaWins, overall.totalRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.usaWins}/{overall.totalRounds})</span>
                </div>
              </div>
              <div className="panel pb">
                <div className="text-xs text-text-secondary mb-1">CSA Overall</div>
                <div className="text-lg font-bold c-danger">
                  {pct(overall.csaWins, overall.totalRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.csaWins}/{overall.totalRounds})</span>
                </div>
              </div>
            </div>
            <div className="kpis">
              <div className="panel pb">
                <div className="text-xs text-text-secondary mb-1">Attackers Won</div>
                <div className="text-lg font-bold c-accent">
                  {pct(overall.attackerWins, overall.totalRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.attackerWins}/{overall.totalRounds})</span>
                </div>
              </div>
              <div className="panel pb">
                <div className="text-xs text-text-secondary mb-1">Defenders Won</div>
                <div className="text-lg font-bold c-ok">
                  {pct(overall.defenderWins, overall.totalRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.defenderWins}/{overall.totalRounds})</span>
                </div>
              </div>
            </div>
            <div className="kpis">
              <div className="row">
                <div className="text-xs text-text-secondary">USA Attack</div>
                <div className="text-sm font-semibold f-usa">
                  {pct(overall.usaAttackWins, overall.usaAttackRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.usaAttackWins}/{overall.usaAttackRounds})</span>
                </div>
              </div>
              <div className="row">
                <div className="text-xs text-text-secondary">USA Defense</div>
                <div className="text-sm font-semibold f-usa">
                  {pct(overall.usaDefenseWins, overall.usaDefenseRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.usaDefenseWins}/{overall.usaDefenseRounds})</span>
                </div>
              </div>
              <div className="row">
                <div className="text-xs text-text-secondary">CSA Attack</div>
                <div className="text-sm font-semibold c-danger">
                  {pct(overall.csaAttackWins, overall.csaAttackRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.csaAttackWins}/{overall.csaAttackRounds})</span>
                </div>
              </div>
              <div className="row">
                <div className="text-xs text-text-secondary">CSA Defense</div>
                <div className="text-sm font-semibold c-danger">
                  {pct(overall.csaDefenseWins, overall.csaDefenseRounds)}% <span className="text-xs font-normal text-text-secondary">({overall.csaDefenseWins}/{overall.csaDefenseRounds})</span>
                </div>
              </div>
            </div>
            {overall.totalCasualties > 0 && (
              <div className="panel pb">
                <div className="text-xs text-text-secondary mb-2">Casualties &amp; formation makeup</div>
                <div className="pcols">
                  {[
                    // CSA is a faction, not a failure — it takes the faction ink
                    // like USA does, not the danger colour.
                    { label: 'USA', total: overall.usaCasualties, form: overall.usaFormation, color: 'f-usa' },
                    { label: 'CSA', total: overall.csaCasualties, form: overall.csaFormation, color: 'f-csa' },
                    { label: 'Overall', total: overall.totalCasualties, form: overall.formationTotal, color: '' },
                  ].map(({ label, total, form, color }) => (
                    <div key={label} className="panel pb">
                      <div className={color} style={{ fontWeight: 600 }}>
                        {label}: {total.toLocaleString()}
                      </div>
                      {overall.hasFormation && (
                        <div className="note" style={{ marginTop: 3 }}>
                          {form.in_form} in formation · {form.skirm} skirmish · {form.oob} out of line
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(() => {
          const top5 = Object.entries(byMap)
            .sort(([, a], [, b]) => b.plays - a.plays)
            .slice(0, 5);
          if (top5.length === 0) return null;
          return (
            <div className="panel pb mb-2">
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-2 font-semibold">Most Played Maps</div>
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th >Map</th>
                    <th className="num">Rounds</th>
                    <th className="num">USA Win%</th>
                    <th className="num">CSA Win%</th>
                    <th className="num">Avg Cas</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map(([name, s], i) => (
                    <tr key={name} >
                      <td className="num" style={{ color: 'var(--ink-3)' }}>{i + 1}</td>
                      <td className="wor-name">{name}</td>
                      <td className="num">{s.plays}</td>
                      <td className="num f-usa">{pct(s.usaWins, s.plays)}%</td>
                      <td className="num f-csa">{pct(s.csaWins, s.plays)}%</td>
                      <td className="num" style={{ color: 'var(--ink-2)' }}>{s.plays > 0 ? Math.round(s.totalCasualties / s.plays) : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        <div >
          {Object.entries(MAPS).map(([areaKey, areaMaps]) => {
            const areaName = areaKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const playedMaps = areaMaps.filter(m => byMap[m]);
            if (playedMaps.length === 0) return null;
            const sectionKey = `${keyPrefix}_${areaKey}`;
            return (
              <div key={areaKey} className="panel">
                <button
                  onClick={() => toggleSection(sectionKey)}
                  className="ph area-h" style={{ width: '100%', textAlign: 'left' }}
                >
                  <span className="font-semibold text-text-secondary">{areaName} ({playedMaps.length})</span>
                  {expandedSections[sectionKey] ? (
                    <ChevronDown className="w-4 h-4 text-text-secondary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-secondary" />
                  )}
                </button>
                {expandedSections[sectionKey] && (
                  <div className="pb">
                    {playedMaps
                      .sort((a, b) => (byMap[b]?.plays || 0) - (byMap[a]?.plays || 0))
                      .map(mapName => {
                        const s = byMap[mapName];
                        const avgCas = s.plays > 0 ? (s.totalCasualties / s.plays).toFixed(0) : 0;
                        return (
                          <div key={mapName} className="panel pb">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium">{mapName}</span>
                              <span className="text-xs text-text-secondary">{s.plays} rounds</span>
                            </div>
                            <div className="note">
                              <div>
                                <span className="f-usa">USA: {s.usaWins} ({pct(s.usaWins, s.plays)}%)</span>
                                <span className="text-text-secondary mx-2">|</span>
                                <span className="c-danger">CSA: {s.csaWins} ({pct(s.csaWins, s.plays)}%)</span>
                              </div>
                              <div className="text-text-secondary">
                                Avg losses: <span className="f-usa">USA {s.avgLossesUsa}</span>
                                <span className="mx-1">·</span>
                                <span className="c-danger">CSA {s.avgLossesCsa}</span>
                                <span className="text-text-muted"> (total {s.totalCasualties}, {avgCas}/rd)</span>
                              </div>
                              {s.hasFormation && (
                                <>
                                  <div className="text-text-secondary">
                                    Avg formation USA: {s.avgFormationUsa.in_form} IF · {s.avgFormationUsa.skirm} Sk · {s.avgFormationUsa.oob} OoL
                                  </div>
                                  <div className="text-text-secondary">
                                    Avg formation CSA: {s.avgFormationCsa.in_form} IF · {s.avgFormationCsa.skirm} Sk · {s.avgFormationCsa.oob} OoL
                                  </div>
                                </>
                              )}
                              {s.hasMorale && (
                                <div className="text-text-secondary">
                                  Avg morale: <span className="f-usa">USA {s.avgMoraleUsa || '—'}</span>
                                  <span className="mx-1">·</span>
                                  <span className="c-danger">CSA {s.avgMoraleCsa || '—'}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {Object.keys(byMap).length === 0 && (
          <p className="note">No map data available</p>
        )}
      </>
    );
  };

  // Determine the season's champion based on playoffs. Returns
  //   { side, lead, weekName, finalRound }
  // or null when no playoffs occurred. The champion is the winner of the
  // latest playoff week with a result; round 2 takes precedence over round 1.
  // `side` is the in-game side they won as (USA / CSA), resolved through the
  // round's flip flag — the roster team label is only meaningful relative to
  // the in-game side they played, which the flip determines per round.
  const seasonChampion = (season) => {
    const weeks = season.weeks || [];
    const playoffWeeks = weeks.filter(w => w.isPlayoffs && (w.round1Winner || w.round2Winner));
    if (playoffWeeks.length === 0) return null;
    const last = playoffWeeks[playoffWeeks.length - 1];
    const winnerKey = last.round2Winner || last.round1Winner;
    if (!winnerKey) return null;
    const finalRound = last.round2Winner ? 2 : 1;
    const flipped = !!last[`round${finalRound}Flipped`];
    const usaTeamKey = flipped ? 'B' : 'A';
    return {
      side: winnerKey === usaTeamKey ? 'USA' : 'CSA',
      lead: last[`lead${winnerKey}_r${finalRound}`] || last[`lead${winnerKey}`] || null,
      weekName: last.name || `Week ${weeks.indexOf(last) + 1}`,
      finalRound,
    };
  };

  return (
    <Shell
      nav={RAIL_NAV}
      screen={screen}
      onScreen={goScreen}
      title="Season Tracker"
      subtitle={`${activeEvent.name} · ${activeSeason.name}`}
      crumb={
        <>
          <span className="cap">Event</span>
          <select
            value={appState.activeEventId}
            onChange={(e) => setAppState(prev => setActiveEvent(prev, e.target.value))}
            aria-label="Active event"
          >
            {appState.events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select
            value={appState.activeSeasonId}
            onChange={(e) => setAppState(prev => setActiveSeason(prev, e.target.value))}
            aria-label="Active season"
          >
            {activeEvent.seasons.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button className="gh" onClick={() => goScreen('events')} title="Events, seasons and what they hold">
            Manage
          </button>
          {/* Scope only changes what the stats screens mean, so it only shows there. */}
          {STATS_SCREENS.has(screen) && (
            <div className="sc" role="group" aria-label="Stats scope">
              <button aria-pressed={!statsAllSeasons} onClick={() => setStatsAllSeasons(false)}>
                {activeSeason.name}
              </button>
              <button aria-pressed={statsAllSeasons} onClick={() => setStatsAllSeasons(true)}>
                All seasons
              </button>
            </div>
          )}
        </>
      }
    >
        <div>
          {screen === 'splitter' && <CompanySplitter />}

          {/* Copy this event up to the database the public site reads. */}
          {screen === 'cloud' && (
            <CloudPanel
              event={activeEvent}
              slug={activeEvent.cloudSlug ?? ''}
              onSlug={(slug) => setAppState(prev => updateActiveEvent(prev, e => ({ ...e, cloudSlug: slug })))}
              buildStats={() => buildEventStatsBundle({ full: true })}
              mapStats={eventMapStats}
              onPulled={(pulled) => setAppState(prev => ({
                // Same event id means this is the machine's copy coming back;
                // anything else arrives as a new event rather than overwriting.
                ...prev,
                events: prev.events.some(e => e.id === pulled.id)
                  ? prev.events.map(e => (e.id === pulled.id ? pulled : e))
                  : [...prev.events, pulled],
                activeEventId: pulled.id,
                activeSeasonId: defaultSeasonIdFor(pulled),
              }))}
            />
          )}

          {/* Events & seasons — what the header strip used to carry. */}
          {screen === 'events' && (
            <>
              <div className="panel">
                <header className="ph">
                  <h2>Events</h2>
                  <span className="rule" />
                  <button className="gh" onClick={() => {
                    const name = window.prompt('New event name:', 'New Event');
                    if (!name) return;
                    setAppState(prev => addEvent(prev, name.trim() || 'New Event'));
                  }}>New event</button>
                </header>
                <div className="pb flush">
                  <table>
                    <thead><tr><th>Event</th><th className="num">Seasons</th><th className="num">Units</th><th /></tr></thead>
                    <tbody>
                      {appState.events.map(ev => (
                        <tr key={ev.id} className={ev.id === appState.activeEventId ? '' : 'click'}
                            onClick={() => ev.id !== appState.activeEventId && setAppState(prev => setActiveEvent(prev, ev.id))}>
                          <td className="wor-name">
                            {ev.id === appState.activeEventId && <span className="tag" style={{ marginRight: 7 }}>Active</span>}
                            {ev.name}
                          </td>
                          <td className="num">{ev.seasons.length}</td>
                          <td className="num">{Object.keys(ev.unitRegistry || {}).length}</td>
                          <td className="num">
                            <button className="gh" onClick={(e) => {
                              e.stopPropagation();
                              const name = window.prompt('Rename event:', ev.name);
                              if (!name || !name.trim() || name.trim() === ev.name) return;
                              setAppState(prev => renameActiveEvent(setActiveEvent(prev, ev.id), name.trim()));
                            }}>Rename</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <header className="ph">
                  <h2>Seasons</h2>
                  <span className="rule" />
                  <span className="meta wor-name">{activeEvent.name}</span>
                  <button className="gh" onClick={() => {
                    const name = window.prompt('New season name:', nextSeasonName(activeEvent.seasons));
                    if (!name) return;
                    setAppState(prev => addSeasonToActiveEvent(prev, name.trim()));
                  }}>New season</button>
                </header>
                <div className="pb flush">
                  <table>
                    <thead><tr><th>Season</th><th className="num">Weeks</th><th className="num">Units</th><th /></tr></thead>
                    <tbody>
                      {activeEvent.seasons.map(se => (
                        <tr key={se.id} className={se.id === appState.activeSeasonId ? '' : 'click'}
                            onClick={() => se.id !== appState.activeSeasonId && setAppState(prev => setActiveSeason(prev, se.id))}>
                          <td className="wor-name">
                            {se.id === appState.activeSeasonId && <span className="tag" style={{ marginRight: 7 }}>Active</span>}
                            {se.name}
                          </td>
                          <td className="num">{(se.weeks || []).length}</td>
                          <td className="num">{(se.units || []).length}</td>
                          <td className="num">
                            <button className="gh" onClick={(e) => {
                              e.stopPropagation();
                              const name = window.prompt('Rename season:', se.name);
                              if (!name || !name.trim() || name.trim() === se.name) return;
                              setAppState(prev => renameActiveSeason(setActiveSeason(prev, se.id), name.trim()));
                            }}>Rename</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <header className="ph"><h2>What lives where</h2><span className="rule" /></header>
                <div className="pb flush">
                  <div className="cols">
                    <div className="col">
                      <span className="cap">An event</span>
                      <p className="note" style={{ marginTop: 6 }}>
                        Its own unit registry, its own Elo ladder and its own imported rounds. Two leagues that
                        share players but not standings are two events.
                      </p>
                    </div>
                    <div className="col">
                      <span className="cap">A season</span>
                      <p className="note" style={{ marginTop: 6 }}>
                        Weeks, rosters, points and results. Elo carries across the seasons of one event; points
                        do not.
                      </p>
                    </div>
                    <div className="col">
                      <span className="cap">Identity</span>
                      <p className="note" style={{ marginTop: 6 }}>
                        A rename on the identity screen sweeps every season of the event — rosters, leads, swaps
                        and casualties all follow it.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Season → Overview, Standings, Schedule, to the prototype's spec.
              Map statistics used to be duplicated here; it is the whole of the
              Maps screen, so it is not repeated. The casualty totals became
              KPIs, and the per-unit figures moved to Units, where units are. */}

          {/* How the event's seasons compare — read where the seasons are. */}
          {screen === 'events' && (<>
          {(() => {
            // Event-wide aggregates: walk every season's rounds.
            const seasons = activeEvent.seasons;
            const totalWeeks = seasons.reduce((n, s) => n + (s.weeks?.length || 0), 0);

            // Cross-season unit record (rounds-as-lead/assist won/lost) +
            // event-wide casualties (per side + per unit).
            const unitRecord = {};
            let usaCasTotal = 0, csaCasTotal = 0;
            let totalRoundsWithResult = 0;
            const ensure = (u) => unitRecord[u] ||= {
              rounds: 0, leadWins: 0, leadLosses: 0,
              assistWins: 0, assistLosses: 0,
              sweeps: 0, casualtiesTaken: 0,
            };

            for (const season of seasons) {
              for (const week of season.weeks || []) {
                // Exhibition — it sits beside each unit's Elo here, and a fun
                // round is in neither figure.
                if (week.isFunRound) continue;
                const isPlayoffs = !!week.isPlayoffs;
                const isSingleRoundLeads = !!week.isSingleRoundLeads;
                const teamA = week.teamA || [];
                const teamB = week.teamB || [];

                // Sweep tally
                if (week.round1Winner && week.round1Winner === week.round2Winner) {
                  const sweepTeam = week.round1Winner === 'A' ? teamA : teamB;
                  sweepTeam.forEach(u => ensure(u).sweeps += 1);
                }

                for (const roundNum of [1, 2]) {
                  const winner = week[`round${roundNum}Winner`];
                  if (!winner) continue;
                  totalRoundsWithResult += 1;

                  // Effective rosters (per-round swaps)
                  const swaps = new Set(week.roundSwaps?.[`r${roundNum}`] || []);
                  const eA = swaps.size === 0 ? teamA :
                    teamA.filter(u => !swaps.has(u)).concat(teamB.filter(u => swaps.has(u)));
                  const eB = swaps.size === 0 ? teamB :
                    teamB.filter(u => !swaps.has(u)).concat(teamA.filter(u => swaps.has(u)));

                  const winningTeam = winner === 'A' ? eA : eB;
                  const losingTeam = winner === 'A' ? eB : eA;
                  const leadKey = (isPlayoffs || isSingleRoundLeads) ? `_r${roundNum}` : '';
                  const leadW = week[`lead${winner}${leadKey}`];
                  const leadL = week[`lead${winner === 'A' ? 'B' : 'A'}${leadKey}`];

                  winningTeam.forEach(u => {
                    const r = ensure(u); r.rounds += 1;
                    if (u === leadW) r.leadWins += 1; else r.assistWins += 1;
                  });
                  losingTeam.forEach(u => {
                    const r = ensure(u); r.rounds += 1;
                    if (u === leadL) r.leadLosses += 1; else r.assistLosses += 1;
                  });

                  // Side-aware casualty bucket
                  const flipped = !!week[`round${roundNum}Flipped`];
                  const usaSide = flipped ? 'B' : 'A';
                  const casA = week[`r${roundNum}CasualtiesA`] || 0;
                  const casB = week[`r${roundNum}CasualtiesB`] || 0;
                  if (usaSide === 'A') { usaCasTotal += casA; csaCasTotal += casB; }
                  else                 { usaCasTotal += casB; csaCasTotal += casA; }

                  // Per-unit casualties (lost) from weeklyCasualties
                  const wc = week.weeklyCasualties || {};
                  for (const sideKey of Object.keys(wc)) {
                    const byUnit = wc[sideKey]?.[`r${roundNum}`] || {};
                    for (const [u, n] of Object.entries(byUnit)) {
                      ensure(u).casualtiesTaken += Number(n) || 0;
                    }
                  }
                }
              }
            }

            const eventElo = calculateEloRatings();
            const ladder = Object.entries(unitRecord)
              .map(([unit, r]) => ({
                unit, ...r,
                wins: r.leadWins + r.assistWins,
                losses: r.leadLosses + r.assistLosses,
                winPct: r.rounds > 0 ? ((r.leadWins + r.assistWins) / r.rounds) * 100 : 0,
                elo: eventElo.eloRatings[unit] ?? eloSystem.initialElo,
              }))
              .filter(r => r.rounds > 0)
              .sort((a, b) => b.elo - a.elo);

            const totalCasUnits = ladder.reduce((s, r) => s + r.casualtiesTaken, 0);

            return (
              <>
                <div className="panel">
                  <header className="ph">
                    <h2>Event at a glance</h2>
                    <span className="rule" />
                    <span className="meta wor-name">{activeEvent.name}</span>
                  </header>
                  <div className="pb flush">
                    <div className="kpis">
                      <div className="kpi">
                        <div className="cap">Seasons</div><div className="v">{seasons.length}</div>
                        <div className="h">{totalWeeks} nights across them</div>
                      </div>
                      <div className="kpi">
                        <div className="cap">Nights</div><div className="v">{totalWeeks}</div>
                        <div className="h">of {totalWeeks * 2} scheduled rounds</div>
                      </div>
                      <div className="kpi">
                        <div className="cap">Rounds played</div><div className="v">{totalRoundsWithResult}</div>
                        <div className="h">with a result recorded</div>
                      </div>
                      <div className="kpi">
                        <div className="cap">Registry units</div>
                        <div className="v">{Object.keys(activeEvent.unitRegistry).length}</div>
                        <div className="h">known to this event</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per-season cards — surfaces playoff status and the
                   champion when playoffs occurred (based on the latest
                   playoff week's result). */}
                <div className="panel">
                  <header className="ph">
                    <h2>Season by season</h2>
                    <span className="rule" />
                    <span className="meta">click one to make it active</span>
                  </header>
                  <div className="pb flush scroll-x">
                    <table>
                      <thead>
                        <tr>
                          <th>Season</th><th />
                          <th className="num">Nights</th><th className="num">Rounds</th><th className="num">Units</th>
                          <th>Champion</th>
                        </tr>
                      </thead>
                      <tbody>
                    {seasons.map(season => {
                      const seasonWeeks = season.weeks || [];
                      const weekCount = seasonWeeks.length;
                      let roundCount = 0;
                      let playoffsScheduled = false;
                      for (const w of seasonWeeks) {
                        if (w.round1Winner || w.round1Draw) roundCount += 1;
                        if (w.round2Winner || w.round2Draw) roundCount += 1;
                        if (w.isPlayoffs) playoffsScheduled = true;
                      }
                      const rosterSize = (season.units || []).length;
                      const isActive = season.id === activeSeason.id;
                      const champion = seasonChampion(season);
                      return (
                        <tr
                          key={season.id}
                          className={isActive ? undefined : 'click'}
                          onClick={() => !isActive && setAppState(prev => setActiveSeason(prev, season.id))}
                        >
                          <td className="wor-name">
                            {isActive && <span className="tag" style={{ marginRight: 7 }}>Active</span>}
                            {season.name}
                          </td>
                          <td>{playoffsScheduled && <span className="tag q">Playoffs</span>}</td>
                          <td className="num">{weekCount}</td>
                          <td className="num">{roundCount}</td>
                          <td className="num">{rosterSize}</td>
                          <td className="wor-name">
                            {champion ? (
                              <>
                                {champion.lead || '—'}
                                <span style={{ color: 'var(--ink-3)' }}> · {champion.weekName} R{champion.finalRound}</span>
                              </>
                            ) : (
                              <span style={{ color: 'var(--ink-3)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="panel">
                  <header className="ph">
                    <h2>Cross-season unit record</h2>
                    <span className="rule" />
                    <span className="meta">every season in this event, rolled together</span>
                  </header>
                  <div className="pb flush scroll-x">
                    {ladder.length === 0 ? (
                      <p className="note" style={{ padding: 13 }}>No completed rounds yet.</p>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th />
                            <th>Unit</th>
                            <th className="num">Elo</th>
                            <th className="num" title="Total rounds played across every season in this event">Rounds</th>
                            <th className="num">W–L</th>
                            <th className="num" title="Win percentage across all rounds">Win %</th>
                            <th className="num" title="Rounds won while leading">Lead W</th>
                            <th className="num">Sweeps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ladder.map((r, idx) => (
                            <tr key={r.unit}>
                              <td><span className={`pos${idx < 3 ? ' q' : ''}`}>{idx + 1}</span></td>
                              <td className="wor-name">{r.unit}</td>
                              <td className="num" style={{ fontWeight: 600 }}>{Math.round(r.elo)}</td>
                              <td className="num" style={{ color: 'var(--ink-2)' }}>{r.rounds}</td>
                              <td className="num">{r.wins}–{r.losses}</td>
                              <td className="num">{r.winPct.toFixed(1)}%</td>
                              <td className="num" style={{ color: 'var(--ink-2)' }}>{r.leadWins}</td>
                              <td className="num" style={{ color: 'var(--ink-2)' }}>{r.sweeps}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={8}>
                              Elo carries across seasons within an event — it is the one figure that does.
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                </div>

                <div className="panel">
                  <header className="ph">
                    <h2>Cross-season casualties</h2>
                    <span className="rule" />
                    <span className="meta">{(usaCasTotal + csaCasTotal).toLocaleString()} men lost</span>
                  </header>
                  <div className="pb flush">
                    <div className="kpis">
                      <div className="kpi">
                        <div className="cap">USA</div>
                        <div className="v f-usa">{usaCasTotal.toLocaleString()}</div>
                        <div className="h">{usaCasTotal + csaCasTotal > 0 ? Math.round((usaCasTotal / (usaCasTotal + csaCasTotal)) * 100) : 0}% of the total</div>
                      </div>
                      <div className="kpi">
                        <div className="cap">CSA</div>
                        <div className="v f-csa">{csaCasTotal.toLocaleString()}</div>
                        <div className="h">{usaCasTotal + csaCasTotal > 0 ? Math.round((csaCasTotal / (usaCasTotal + csaCasTotal)) * 100) : 0}% of the total</div>
                      </div>
                      <div className="kpi">
                        <div className="cap">Combined</div>
                        <div className="v">{(usaCasTotal + csaCasTotal).toLocaleString()}</div>
                        <div className="h">across {totalRoundsWithResult} rounds</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <header className="ph">
                    <h2>Per-unit player stats</h2>
                    <span className="rule" />
                    <span className="meta">full event</span>
                  </header>
                  <div className="pb flush scroll-x">
                    {renderUnitStatsTable(tokenSnapsEventTotals(), eventRegBreakdown, regContextEventTotals, tokenRegimentsUnion, tokenTicketSharesEventTotals)}
                  </div>
                </div>

                <div className="panel">
                  <header className="ph">
                    <h2>Maps, event-wide</h2>
                    <span className="rule" />
                    <span className="meta">every season's rounds together</span>
                  </header>
                  <div className="pb">
                    {renderMapStatsBlock(calculateMapStats(), 'eventMapStats')}
                  </div>
                </div>

                <div className="panel">
                  <div className="ctl">
                    <span className="cap">Pairings</span>
                    <button className="gh live" onClick={() => { setHeatmapScope('event'); goScreen('heat'); }}>
                      Open cross-season pairings
                    </button>
                    <span className="rule" />
                    <span className="meta">how often each pair has been on the same side, across every season</span>
                  </div>
                </div>
              </>
            );
          })()}
          </>)}

          {/* Share & export — the overflow menu, unpacked onto a page. */}
          {screen === 'share' && (
            <div className="panel">
              <header className="ph"><h2>Share &amp; export</h2><span className="rule" /></header>
              <div className="pb flush">
                <div className="cols">
                  <div className="col">
                    <span className="cap">Take it with you</span>
                    <p className="note" style={{ margin: '6px 0 9px' }}>
                      A JSON export is the whole event — every season, week and setting. The CSV is the
                      schedule and results only, for a spreadsheet.
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="gh" onClick={exportData}>Export JSON</button>
                      <button className="gh" onClick={exportToCSV}>Export CSV</button>
                      <label className="gh" style={{ cursor: 'pointer' }}>
                        Import JSON
                        <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                  <div className="col">
                    <span className="cap">Send someone a link</span>
                    <p className="note" style={{ margin: '6px 0 9px' }}>
                      Both links are read-only and carry their data in the URL — nothing is uploaded anywhere.
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="gh" onClick={shareSeason}>Share the season</button>
                      <button className="gh" onClick={shareStats}>Share player stats</button>
                    </div>
                  </div>
                  <div className="col">
                    <span className="cap">Start over</span>
                    <p className="note" style={{ margin: '6px 0 9px' }}>
                      Wipes every event and season in this browser. Export first.
                    </p>
                    <button className="gh danger" onClick={newSeason}>Wipe everything</button>
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* The whole week goes across as `weeks`, not just id/name/flip: the
              Nights tab reads a night's result, leads and rosters as a matchup. */}
          {/* Per-unit figures from the tracker's own casualty records, under
              Units — the scoreboard-derived table above answers the same
              question from the other direction. */}
          {screen === 'stats-regiments' && (<>
            {/* Per-unit player stats — derived from assigned scoreboards,
                cumulative through the selected week. */}
            <div className="panel">
              <header className="ph">
                <h2>Per-unit player stats</h2>
                <span className="rule" />
                <span className="meta">through the night picked, every round before it included</span>
              </header>
              {weeks.length > 0 && (
                <div className="ctl">
                  <span className="cap">As of</span>
                  <select
                    value={String(weeks[unitsWeekIdx]?.id ?? '')}
                    onChange={(e) => setUnitsAsOfId(e.target.value)}
                    aria-label="As of night"
                  >
                    {weeks.map(w => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}{weeksWithRounds.has(String(w.id)) ? '' : ' — no rounds'}
                      </option>
                    ))}
                  </select>
                  {unitsAsOfId != null && (
                    <button className="gh" onClick={() => setUnitsAsOfId(null)}>Latest</button>
                  )}
                </div>
              )}
              <div className="pb flush scroll-x">
                {renderUnitStatsTable(tokenSnapsAsOfWeek(unitsWeekIdx), regBreakdownAsOfWeek(unitsWeekIdx), regContextAsOfWeek(unitsWeekIdx), tokenRegiments, tokenTicketSharesAsOfWeek(unitsWeekIdx))}
              </div>
            </div>

            {/* Teammate Impact Index — a cross-unit ranking, so it belongs on
                the units screen rather than on any one unit's card. */}
            {(() => {
              const { impactStats, globalAvgLossRate } = calculateTeammateImpact(unitsWeekIdx);
              const tableData = Object.entries(impactStats)
                .map(([unit, data]) => ({ unit, ...data, totalGames: data.leadGames + data.assistGames }))
                .filter(row => row.totalGames > 0)
                .sort((a, b) => b.adjustedTiiScore - a.adjustedTiiScore);

              return (
                <div className="panel">
                  <header className="ph">
                    <h2>Teammate impact</h2>
                    <span className="rule" />
                    <span className="meta">how a side does with this unit in it</span>
                  </header>
                  <button className="gh" style={{ margin: '9px 13px' }}
                          aria-pressed={tiiGloss} onClick={() => setTiiGloss(g => !g)}>
                    What do these mean?
                  </button>
                  {tiiGloss && (
                    <div className="gloss">
                      <dl><dt>Adj. TII</dt><dd>The ranking metric — original TII adjusted for how many players the unit brings.</dd></dl>
                      <dl><dt>Orig. TII</dt><dd>1 − the average loss rate of this unit's teammates when it plays.</dd></dl>
                      <dl><dt>Lead impact</dt><dd>Win rate in the rounds this unit led, with the round count beside it.</dd></dl>
                      <dl><dt>Assist impact</dt><dd>Win rate in the rounds it did not lead.</dd></dl>
                      <dl><dt>Δ vs avg</dt><dd>Teammate loss rate against the league's. Negative is good — sides with this unit lose fewer men.</dd></dl>
                    </div>
                  )}
                  <div className="pb flush scroll-x">
                    {tableData.length === 0 ? (
                      <p className="note" style={{ padding: 13 }}>No unit has played a round yet.</p>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th />
                            <th>Unit</th>
                            <th className="num">Avg men</th>
                            <th className="num" title="Adjusted TII — the ranking metric">Adj. TII</th>
                            <th className="num" title="Original TII — teammate loss rate only">Orig. TII</th>
                            <th className="num">Lead</th>
                            <th className="num">Assist</th>
                            <th className="num">Δ vs avg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableData.map((row, idx) => {
                            const delta = row.avgTeammateLossRateWith - globalAvgLossRate;
                            return (
                              <tr key={row.unit}>
                                <td><span className={`pos${idx < 3 ? ' q' : ''}`}>{idx + 1}</span></td>
                                <td className="wor-name">{row.unit}</td>
                                <td className="num" style={{ color: 'var(--ink-3)' }}>{Math.round(row.avgPlayers)}</td>
                                <td className="num" style={{ fontWeight: 600 }}>{row.adjustedTiiScore.toFixed(3)}</td>
                                <td className="num" style={{ color: 'var(--ink-2)' }}>{row.impactScore.toFixed(3)}</td>
                                <td className="num">
                                  {(row.leadImpact * 100).toFixed(1)}%
                                  <span style={{ color: 'var(--ink-3)' }}> · {row.leadGames}</span>
                                </td>
                                <td className="num">
                                  {(row.assistImpact * 100).toFixed(1)}%
                                  <span style={{ color: 'var(--ink-3)' }}> · {row.assistGames}</span>
                                </td>
                                <td className="num" style={{ color: delta < 0 ? 'var(--ink)' : 'var(--ink-3)' }}>
                                  {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={8}>
                              Δ compares this unit's teammates' loss rate to the league average of{' '}
                              {(globalAvgLossRate * 100).toFixed(1)}% — negative means a side loses fewer men with it in.
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                </div>
              );
            })()}
          </>)}

          {viewMode === 'stats' && (
            <StatsArea
              tab={STATS_TAB_OF[screen]}
              onTab={(t) => {
                const key = Object.keys(STATS_TAB_OF).find(k => STATS_TAB_OF[k] === t);
                if (key) goScreen(key);
              }}
              eventId={appState.activeEventId}
              eventName={activeEvent.name}
              registryUnits={registryUnitNames}
              replaySlug={activeEvent.cloudSlug || undefined}
              weeks={weeks.map(w => ({ ...w, id: String(w.id) }))}
              pointSystem={pointSystem}
              tokenUnits={tokenUnits}
              night={selectedWeek ? String(selectedWeek.id) : undefined}
              onEditNight={(weekId) => {
                const w = weeks.find(x => String(x.id) === weekId);
                if (!w) return;
                setSelectedWeek(w);
                goScreen('night');
              }}
              seasons={statsSeasonRefs}
              seasonScope={statsAllSeasons ? OVERALL_SCOPE : appState.activeSeasonId}
              teamNames={teamNames}
              validMaps={ALL_MAPS}
              trackerMapStats={statsAllSeasons ? calculateMapStats() : calculateSeasonMapStats()}
              onApplyRound={(weekId, updates) => {
                const w = weeks.find(x => String(x.id) === weekId);
                if (w) updateWeek(w.id, updates);
              }}
            />
          )}

          {/* Season screens. Each guards on `screen`; the old viewMode wrapper
              that used to enclose them is gone with the block that closed it. */}
          {/* Settings — its own screen. */}
          {screen === 'settings' && (
            <div className="panel pb mb-4">
              <h2 className="cap">System Settings</h2>
              
              {/* Point System Section */}
              <div className="fset">
                <h3 className="cap">Point System</h3>
                <div className="grid-f">
                <div>
                  <label className="cap">Win Lead Points</label>
                  <input
                    type="number"
                    value={pointSystem.winLead}
                    onChange={(e) => setPointSystem({ ...pointSystem, winLead: parseInt(e.target.value) || 0 })}
                    className="fld-i"
                  />
                </div>
                <div>
                  <label className="cap">Win Assist Points</label>
                  <input
                    type="number"
                    value={pointSystem.winAssist}
                    onChange={(e) => setPointSystem({ ...pointSystem, winAssist: parseInt(e.target.value) || 0 })}
                    className="fld-i"
                  />
                </div>
                <div>
                  <label className="cap">Loss Lead Points</label>
                  <input
                    type="number"
                    value={pointSystem.lossLead}
                    onChange={(e) => setPointSystem({ ...pointSystem, lossLead: parseInt(e.target.value) || 0 })}
                    className="fld-i"
                  />
                </div>
                <div>
                  <label className="cap">Loss Assist Points</label>
                  <input
                    type="number"
                    value={pointSystem.lossAssist}
                    onChange={(e) => setPointSystem({ ...pointSystem, lossAssist: parseInt(e.target.value) || 0 })}
                    className="fld-i"
                  />
                </div>
                <div>
                  <label className="cap">2-0 Bonus Lead</label>
                  <input
                    type="number"
                    value={pointSystem.bonus2_0Lead}
                    onChange={(e) => setPointSystem({ ...pointSystem, bonus2_0Lead: parseInt(e.target.value) || 0 })}
                    className="fld-i"
                  />
                </div>
                <div>
                  <label className="cap">2-0 Bonus Assist</label>
                  <input
                    type="number"
                    value={pointSystem.bonus2_0Assist}
                    onChange={(e) => setPointSystem({ ...pointSystem, bonus2_0Assist: parseInt(e.target.value) || 0 })}
                    className="fld-i"
                  />
                </div>
                <div>
                  <label className="cap">Balancer Points</label>
                  <input
                    type="number"
                    value={pointSystem.balancePoints}
                    onChange={(e) => setPointSystem({ ...pointSystem, balancePoints: parseInt(e.target.value) || 0 })}
                    className="fld-i"
                  />
                </div>
                {pointSystem.balancePoints !== 0 && (
                <div>
                  <label className="cap">Balance Points Style</label>
                  <select
                    value={pointSystem.balancePointsStyle || 'perNight'}
                    onChange={(e) => setPointSystem({ ...pointSystem, balancePointsStyle: e.target.value })}
                    className="fld-i"
                  >
                    <option value="perNight">Per Night</option>
                    <option value="perRound">Per Round</option>
                    <option value="perRoundLoss">Per Round (Loss Only)</option>
                  </select>
                </div>
                )}
                </div>
              </div>

              {/* Elo System Section */}
              <div className="fset">
                <h3 className="cap">
                  <TrendingUp className="w-5 h-5" />
                  Elo Rating System
                </h3>
                <div className="grid-f">
                  <div>
                    <label className="cap">Initial Elo</label>
                    <input
                      type="number"
                      value={eloSystem.initialElo}
                      onChange={(e) => setEloSystem({ ...eloSystem, initialElo: parseInt(e.target.value) || 1500 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Standard K-Factor</label>
                    <input
                      type="number"
                      value={eloSystem.kFactorStandard}
                      onChange={(e) => setEloSystem({ ...eloSystem, kFactorStandard: parseInt(e.target.value) || 96 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Provisional K-Factor</label>
                    <input
                      type="number"
                      value={eloSystem.kFactorProvisional}
                      onChange={(e) => setEloSystem({ ...eloSystem, kFactorProvisional: parseInt(e.target.value) || 128 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Provisional Rounds</label>
                    <input
                      type="number"
                      value={eloSystem.provisionalRounds}
                      onChange={(e) => setEloSystem({ ...eloSystem, provisionalRounds: parseInt(e.target.value) || 10 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Sweep Bonus (×)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={eloSystem.sweepBonusMultiplier}
                      onChange={(e) => setEloSystem({ ...eloSystem, sweepBonusMultiplier: parseFloat(e.target.value) || 1.25 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Lead Multiplier (×)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={eloSystem.leadMultiplier}
                      onChange={(e) => setEloSystem({ ...eloSystem, leadMultiplier: parseFloat(e.target.value) || 2.0 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Size Influence</label>
                    <input
                      type="number"
                      step="0.1"
                      value={eloSystem.sizeInfluence}
                      onChange={(e) => setEloSystem({ ...eloSystem, sizeInfluence: parseFloat(e.target.value) || 1.0 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Playoff Multiplier (×)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={eloSystem.playoffMultiplier}
                      onChange={(e) => setEloSystem({ ...eloSystem, playoffMultiplier: parseFloat(e.target.value) || 1.25 })}
                      className="fld-i"
                    />
                  </div>
                </div>
              </div>

              {/* Map & Unit History Influence */}
              <div className="fset">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="cap">Map &amp; Unit History Influence</h3>
                  <button
                    onClick={() => setEloConfig({
                      mapWeight: 1.0, unitWeight: 1.0, priorRounds: 10,
                      carryAlpha: eloConfig.carryAlpha ?? 0.5,
                      mapStatsScope: eloConfig.mapStatsScope ?? 'event',
                    })}
                    className="gh"
                    title="Reset weights and shrinkage to recommended defaults"
                  >
                    Reset to defaults
                  </button>
                </div>
                <p className="note">
                  Map-side and per-unit-on-side outcome history feed expected win probability via Bayesian-shrunk Elo equivalents.
                  The engine uses <strong>every prior round</strong> in the event (and across events under <em>global</em> scope).
                  Confidence Samples controls regularization, not how much data is used: at <em>n</em> samples a rate reaches
                  <em> n / (n + samples)</em> of full strength, so a single 100% round can't slam ratings while a long pattern eventually approaches full influence.
                </p>
                <div className="grid-f">
                  <div>
                    <label className="cap" title="Multiplier on the map-side history's Elo-equivalent contribution. 0 ignores it; 1 uses full Bayesian-shrunk strength.">Map Weight</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={eloConfig.mapWeight}
                      onChange={(e) => setEloConfig({ ...eloConfig, mapWeight: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap" title="Multiplier on each unit's per-side record on the map. 0 ignores per-unit history; 1 uses full Bayesian-shrunk strength.">Unit Weight</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={eloConfig.unitWeight}
                      onChange={(e) => setEloConfig({ ...eloConfig, unitWeight: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label
                      className="cap"
                      title="Sample size at which the historical rate reaches half its full Elo-equivalent strength. The engine still uses ALL prior rounds — this only controls regularization. Lower = trust small samples sooner (noisier); higher = require more data before signals matter."
                    >
                      Confidence Samples
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={eloConfig.priorRounds}
                      onChange={(e) => setEloConfig({ ...eloConfig, priorRounds: Math.max(1, parseInt(e.target.value) || 10) })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap" title="Source of map history. 'Event only' uses just this event; 'All events (global)' folds in every prior event's rounds as a starting seed (unit-on-side history stays event-scoped since unit identity is per-event).">Map Stats Scope</label>
                    <select
                      value={eloConfig.mapStatsScope}
                      onChange={(e) => setEloConfig({ ...eloConfig, mapStatsScope: e.target.value })}
                      className="fld-i"
                    >
                      <option value="event">Event only</option>
                      <option value="global">All events (global)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Map Cooldown Section */}
              <div className="fset">
                <h3 className="cap">
                  <Map className="w-5 h-5" />
                  Map Cooldown
                </h3>
                <div className="flex items-center gap-3">
                  <div>
                    <label className="cap">Weeks Until Replayable</label>
                    <input
                      type="number"
                      min="0"
                      value={mapCooldown}
                      onChange={(e) => setMapCooldown(Math.max(0, parseInt(e.target.value) || 0))}
                      className="fld-i"
                    />
                  </div>
                  <span className="note">
                    {mapCooldown === 0
                      ? 'Disabled — maps can be replayed immediately'
                      : `Maps played in the last ${mapCooldown} week${mapCooldown > 1 ? 's' : ''} will be marked on cooldown`}
                  </span>
                </div>
              </div>

              {/* Playoff format — what the bracket and the planner read. */}
              <div className="fset">
                <h3 className="cap">
                  <Trophy className="w-5 h-5" />
                  Playoff format
                </h3>
                <div style={{ marginTop: 9 }}>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={!!playoffConfig.enabled}
                      onChange={(e) => setPlayoffConfig({ ...playoffConfig, enabled: e.target.checked })}
                    />
                    <span>
                      <span className="l">Enable playoff tracking</span>
                      <span className="note">unlocks the bracket and the format planner</span>
                    </span>
                  </label>
                </div>
                {playoffConfig.enabled && (
                  <>
                    <div className="grid-f" style={{ marginTop: 11 }}>
                      <div className="fld">
                        <label className="cap">Bracket style</label>
                        <select
                          className="fld-i"
                          value={playoffConfig.bracketStyle || 'conference'}
                          onChange={(e) => setPlayoffConfig({ ...playoffConfig, bracketStyle: e.target.value })}
                        >
                          <option value="conference">Conference</option>
                          <option value="knockout">Seeded knockout</option>
                        </select>
                        <div className="note">
                          knockout reseeds the whole field 1-vs-N; conference needs exactly two
                        </div>
                      </div>
                      <div className="fld">
                        <label className="cap">Top teams per division</label>
                        <input
                          className="fld-i" type="number"
                          min={PLAYOFF_LIMITS.teamsPerDivision.min} max={PLAYOFF_LIMITS.teamsPerDivision.max}
                          value={playoffConfig.teamsPerDivision ?? 2}
                          onChange={(e) => setPlayoffConfig({
                            ...playoffConfig,
                            teamsPerDivision: clampTo(PLAYOFF_LIMITS.teamsPerDivision, e.target.value, 2),
                          })}
                        />
                        <div className="note">who qualifies from each one</div>
                      </div>
                      <div className="fld">
                        <label className="cap">Wildcard seats</label>
                        <input
                          className="fld-i" type="number"
                          min={PLAYOFF_LIMITS.wildcardTeams.min} max={PLAYOFF_LIMITS.wildcardTeams.max}
                          value={playoffConfig.wildcardTeams ?? 0}
                          onChange={(e) => setPlayoffConfig({
                            ...playoffConfig,
                            wildcardTeams: clampTo(PLAYOFF_LIMITS.wildcardTeams, e.target.value, 0),
                          })}
                        />
                        <div className="note">best of the rest, per conference</div>
                      </div>
                      {PLAYOFF_STAGES.map(({ key, label, note }) => (
                        <div className="fld" key={key}>
                          <label className="cap">Rounds — {label}</label>
                          <input
                            className="fld-i" type="number"
                            min={PLAYOFF_LIMITS.roundsPerMatch.min} max={PLAYOFF_LIMITS.roundsPerMatch.max}
                            value={playoffConfig.roundFormats?.[key] ?? 1}
                            onChange={(e) => setPlayoffConfig({
                              ...playoffConfig,
                              roundFormats: {
                                ...playoffConfig.roundFormats,
                                [key]: clampTo(PLAYOFF_LIMITS.roundsPerMatch, e.target.value, 1),
                              },
                            })}
                          />
                          <div className="note">{note}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 11 }}>
                      <label className="chk">
                        <input
                          type="checkbox"
                          checked={!!playoffConfig.useDivisions}
                          onChange={(e) => setPlayoffConfig({ ...playoffConfig, useDivisions: e.target.checked })}
                        />
                        <span>
                          <span className="l">Qualify through divisions</span>
                          <span className="note">off means the whole league seeds on points</span>
                        </span>
                      </label>
                    </div>
                    <p className="note" style={{ marginTop: 11 }}>
                      The planner on the Playoffs screen reads these and says which formats fit the nights you
                      have left.{' '}
                      <button className="gh" onClick={() => goScreen('playoffs')}>Open playoffs</button>
                    </p>
                  </>
                )}
              </div>

              {/* Balancer Settings Section */}
              <div className="fset">
                <h3 className="cap">
                  <Target className="w-5 h-5" />
                  Team Balancer Weights
                </h3>
                <p className="note">
                  Adjust the weights used in the composite score calculation. Higher weights increase the importance of that metric.
                </p>
                <div className="grid-f">
                  <div>
                    <label className="cap">Teammate History Weight</label>
                    <input
                      type="number"
                      step="0.1"
                      value={balancerSettings.teammateWeight}
                      onChange={(e) => setBalancerSettings({ ...balancerSettings, teammateWeight: parseFloat(e.target.value) || 1.0 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Avg Difference Weight</label>
                    <input
                      type="number"
                      step="0.1"
                      value={balancerSettings.avgDiffWeight}
                      onChange={(e) => setBalancerSettings({ ...balancerSettings, avgDiffWeight: parseFloat(e.target.value) || 1.0 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Regiment Count Weight</label>
                    <input
                      type="number"
                      step="0.1"
                      value={balancerSettings.regimentCountWeight}
                      onChange={(e) => setBalancerSettings({ ...balancerSettings, regimentCountWeight: parseFloat(e.target.value) || 0.75 })}
                      className="fld-i"
                    />
                  </div>
                  <div>
                    <label className="cap">Range Similarity Weight</label>
                    <input
                      type="number"
                      step="0.1"
                      value={balancerSettings.rangeSimilarityWeight}
                      onChange={(e) => setBalancerSettings({ ...balancerSettings, rangeSimilarityWeight: parseFloat(e.target.value) || 0.50 })}
                      className="fld-i"
                    />
                  </div>
                  {divisions.length > 0 && (
                    <div>
                      <label className="cap">Division Opposition Weight</label>
                      <input
                        type="number"
                        step="0.1"
                        value={balancerSettings.divisionOppositionWeight}
                        onChange={(e) => setBalancerSettings({ ...balancerSettings, divisionOppositionWeight: parseFloat(e.target.value) || 0 })}
                        className="fld-i"
                      />
                    </div>
                  )}
                  {playoffConfig.enabled && (
                    <div>
                      <label className="cap">Post-Season Skill Weight</label>
                      <input
                        type="number"
                        step="0.1"
                        value={balancerSettings.postSeasonSkillWeight ?? 0}
                        onChange={(e) => setBalancerSettings({ ...balancerSettings, postSeasonSkillWeight: parseFloat(e.target.value) || 0 })}
                        className="fld-i"
                      />
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <label className="cap">Balance Options to Show</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={balancerSettings.balanceOptionCount}
                    onChange={(e) => setBalancerSettings({ ...balancerSettings, balanceOptionCount: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)) })}
                    className="fld-i"
                  />
                  <div className="note">Balance options the balancer returns, 1 to 10.</div>
                </div>
                <div className="gloss" style={{ marginTop: 13, border: '1px solid var(--line)' }}>
                  <ul className="note" style={{ margin: 0, paddingLeft: 16, gridColumn: '1 / -1', listStyle: 'disc' }}>
                    <li><strong>Teammate History:</strong> Penalizes units that have played together frequently</li>
                    <li><strong>Avg Difference:</strong> Minimizes the average player count difference between teams</li>
                    <li><strong>Regiment Count:</strong> Favors equal regiment counts per team (e.g., 8v8 over 11v5)</li>
                    <li><strong>Range Similarity:</strong> Ensures both teams have similar min-to-max spread (e.g., both 45-55 rather than one 45-50 and one 30-60)</li>
                    {divisions.length > 0 && (
                      <li><strong>Division Opposition:</strong> Prioritizes placing same-division units on opposing teams</li>
                    )}
                    {playoffConfig.enabled && (
                      <li><strong>Post-Season Skill:</strong> During playoffs, evens playoff-pedigree units across both sides — units that made the playoffs in the semi-finals, and units that made the semi-finals in the championship (0 = off)</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Division and Map Bias Management Buttons */}
              <div className="ctl" style={{ marginTop: 18, border: '1px solid var(--line)' }}>
                <button
                  onClick={() => goScreen('divisions')}
                  className="gh live"
                >
                  <Users className="w-4 h-4" />
                  Manage Divisions
                </button>
                <button
                  onClick={() => setShowMapBiasModal(true)}
                  className="gh"
                >
                  <Map className="w-4 h-4" />
                  Map History
                </button>
              </div>
            </div>
          )}

          {/* Overview, Standings and Schedule, built to the prototype's spec.
              The three-column card grid this replaces was the old dashboard;
              the season reads as a glance, a table and a fixture list now. */}
          {screen === 'dash' && (
            <SeasonOverview
              eventName={activeEvent.name}
              seasonName={activeSeason.name}
              kpis={seasonKpis}
              standings={standingRows}
              nights={nightRows}
              pointSystem={pointSystem}
              onOpenUnit={() => goScreen('stats-regiments')}
              onOpenNight={(idx) => { setSelectedWeek(weeks[idx]); goScreen('week'); }}
            />
          )}

          {screen === 'standings' && (
            <>
              <StandingsScreen
                standings={standingRows}
                divisions={divisions}
                onOpenUnit={() => goScreen('stats-regiments')}
              />
              {rankingsImage('points')}
            </>
          )}

          {/* Season roster — add a unit, rename it (this season or the event), and say
              whether it holds a standings token. */}
          {screen === 'roster' && (
            <RosterScreen
              seasonName={activeSeason?.name || 'This season'}
              units={rosterRows}
              draft={newUnitName}
              onDraft={setNewUnitName}
              onAdd={addUnit}
              registryUnits={registryUnitNames}
              onRename={renameUnit}
              onToggleToken={toggleNonTokenStatus}
              onRemove={removeUnit}
            />
          )}

          {screen === 'schedule' && (
            <ScheduleScreen
              nights={nightRows}
              onOpenNight={(idx) => { setSelectedWeek(weeks[idx]); goScreen('week'); }}
              onEditNight={(idx) => { setSelectedWeek(weeks[idx]); goScreen('night'); }}
              onNewNight={() => { addWeek(); goScreen('night'); }}
              onGenerate={() => goScreen('simulator')}
              onDeleteNight={(idx) => removeWeek(weeks[idx]?.id)}
            />
          )}


          {/* Night builder, to the prototype's V.night: what kind of night it
              is and what that costs, who is on each side and who leads, then
              what happened in each round. */}
          {screen === 'night' && (
            <NightBuilder
              weeks={weeks.map(w => ({ id: w.id, name: w.name }))}
              week={selectedWeek && {
                id: selectedWeek.id,
                name: selectedWeek.name,
                teamA: selectedWeek.teamA || [],
                teamB: selectedWeek.teamB || [],
                leadA: selectedWeek.leadA || null,
                leadB: selectedWeek.leadB || null,
                leadA_r1: selectedWeek.leadA_r1 || null,
                leadB_r1: selectedWeek.leadB_r1 || null,
                leadA_r2: selectedWeek.leadA_r2 || null,
                leadB_r2: selectedWeek.leadB_r2 || null,
                rounds: [1, 2].map(r => ({
                  round: r,
                  map: selectedWeek[`round${r}Map`] || null,
                  winner: selectedWeek[`round${r}Winner`] || null,
                  flipped: !!selectedWeek[`round${r}Flipped`],
                  casualtiesA: selectedWeek[`r${r}CasualtiesA`] ?? null,
                  casualtiesB: selectedWeek[`r${r}CasualtiesB`] ?? null,
                  swaps: selectedWeek.roundSwaps?.[`r${r}`] || [],
                })),
              }}
              type={nightBuilderType}
              registry={units}
              headcount={unitHeadcounts}
              counts={selectedWeek?.unitPlayerCounts && Object.keys(selectedWeek.unitPlayerCounts).length
                ? selectedWeek.unitPlayerCounts : unitPlayerCounts}
              elo={Object.fromEntries(eloLadderRows.map(r => [r.unit, r.elo]))}
              balancePoints={pointSystem.balancePoints || 0}
              balancePointsStyle={pointSystem.balancePointsStyle || 'perNight'}
              tokenUnits={tokenUnits}
              maps={ALL_MAPS}
              mapCooldown={mapCooldown}
              onPickWeek={(id) => setSelectedWeek(weeks.find(w => String(w.id) === id) || null)}
              onType={(t) => updateWeek(selectedWeek.id, ROUND_TYPE_FLAGS[t])}
              onRename={(name) => updateWeek(selectedWeek.id, { name })}
              onNewNight={() => addWeek()}
              onDuplicate={duplicateSelectedWeek}
              onMoveUnit={(unit, to) => moveUnitToTeam(unit, to)}
              onClearSides={() => updateWeek(selectedWeek.id, { teamA: [], teamB: [] })}
              onLead={(side, round, unit) => updateWeek(selectedWeek.id,
                round === 0 ? { [`lead${side}`]: unit } : { [`lead${side}_r${round}`]: unit })}
              onRound={(r, patch) => {
                const u = {};
                if ('map' in patch) u[`round${r}Map`] = patch.map;
                if ('winner' in patch) u[`round${r}Winner`] = patch.winner;
                if ('flipped' in patch) u[`round${r}Flipped`] = patch.flipped;
                if ('casualtiesA' in patch) u[`r${r}CasualtiesA`] = patch.casualtiesA ?? 0;
                if ('casualtiesB' in patch) u[`r${r}CasualtiesB`] = patch.casualtiesB ?? 0;
                updateWeek(selectedWeek.id, u);
              }}
              onSwap={(r, unit, on) => {
                const cur = selectedWeek.roundSwaps?.[`r${r}`] || [];
                updateWeek(selectedWeek.id, {
                  roundSwaps: {
                    ...(selectedWeek.roundSwaps || { r1: [], r2: [] }),
                    [`r${r}`]: on ? [...cur, unit] : cur.filter(x => x !== unit),
                  },
                });
              }}
              onBalancer={openBalancerModal}
              onAssignStats={openCasualtyModal}
            />
          )}

          {/* Balancer, to the prototype's V.balancer: the pool, what must be
              kept apart, the options, then the knobs that made them. */}
          {screen === 'balancer' && (
            selectedWeek ? (
              <Balancer
                view={{
                  weekName: selectedWeek.name,
                  roster: [...units].sort(),
                  assignedA: selectedWeek.teamA || [],
                  assignedB: selectedWeek.teamB || [],
                  released: balancerReleased,
                  sittingOut: balancerSatOut,
                  counts: balancerUnitCounts,
                  pairs: balancerOpposingPairs,
                  maxDiff: balancerMaxDiff,
                  optionCount: balancerSettings.balanceOptionCount || 3,
                  weights: {
                    teammate: balancerSettings.teammateWeight,
                    avgDiff: balancerSettings.avgDiffWeight,
                    regimentCount: balancerSettings.regimentCountWeight,
                    rangeSimilarity: balancerSettings.rangeSimilarityWeight,
                    divisionOpposition: balancerSettings.divisionOppositionWeight,
                    postSeasonSkill: balancerSettings.postSeasonSkillWeight || 0,
                  },
                  options: balancerResults || [],
                  status: balancerStatus,
                }}
                onBack={() => goScreen('night')}
                onToggleUnit={(u) => setBalancerSatOut(prev =>
                  prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                onToggleRelease={(u) => setBalancerReleased(prev =>
                  prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                onReleaseAll={() => setBalancerReleased(
                  [...new Set([...(selectedWeek.teamA || []), ...(selectedWeek.teamB || [])])])}
                onHoldAll={() => setBalancerReleased([])}
                onPair={(idx, slot, unit) => setBalancerOpposingPairs(prev =>
                  prev.map((p, k) => k === idx ? (slot === 0 ? [unit, p[1]] : [p[0], unit]) : p))}
                onAddPair={(a, b) => { if (a && b) setBalancerOpposingPairs(prev => [...prev, [a, b]]); }}
                onRemovePair={(idx) => setBalancerOpposingPairs(prev => prev.filter((_, k) => k !== idx))}
                onMaxDiff={setBalancerMaxDiff}
                onOptionCount={(n) => setBalancerSettings({ ...balancerSettings, balanceOptionCount: Math.max(1, Math.min(10, n)) })}
                onWeight={(key, n) => setBalancerSettings({ ...balancerSettings, [BALANCER_WEIGHT_FIELD[key]]: n })}
                onResetWeights={() => setBalancerSettings({ ...balancerSettings, ...getDefaultBalancerSettings() })}
                onCount={(unit, which, n) => commitBalancerCounts({
                  ...balancerUnitCounts,
                  [unit]: { ...balancerUnitCounts[unit], [which]: n },
                })}
                onRun={runBalancer}
                onApply={(option) => applyBalancerOption(option)}
                onPasteCounts={openCoordPasteModal}
                onPullCounts={pullLastNightCounts}
                onSplitter={() => goScreen('splitter')}
              />
            ) : (
              <div className="panel">
                <header className="ph"><h2>Balancer</h2><span className="rule" /></header>
                <div className="pb">
                  <p className="note">Pick a night on the Schedule screen first — the balancer splits that night's units.</p>
                </div>
              </div>
            )
          )}

          {/* Coord Sheet Paste Modal */}
          {showCoordPasteModal && (
            <div className="modal-scrim">
              <div className="modal">
                <div className="pb">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="cap">Paste from Coord Sheet</h2>
                    <button
                      onClick={() => { setShowCoordPasteModal(false); setCoordParsedRows([]); setCoordPasteText(''); }}
                      className="ib"
                    >
                      <X className="w-5 h-5 text-text-muted" />
                    </button>
                  </div>

                  {coordParsedRows.length === 0 ? (
                    <div >
                      <p className="text-sm text-text-secondary">
                        Paste rows from your Google Sheets coord sheet. Expected format: tab-separated columns with regiment name, min, (optional column), max.
                      </p>
                      <textarea
                        value={coordPasteText}
                        onChange={(e) => setCoordPasteText(e.target.value)}
                        placeholder={"CQB (T)\t14\t\t16\nJD (T)\t35\t\t40\n..."}
                        rows={10}
                        className="fld-i"
                      />
                      <button
                        onClick={parseCoordPaste}
                        disabled={!coordPasteText.trim()}
                        className="gh live"
                      >
                        Parse
                      </button>
                    </div>
                  ) : (
                    <div >
                      <p className="text-sm text-text-secondary mb-2">
                        Review matched regiments below. Adjust matches or choose to create / ignore unmatched ones.
                      </p>
                      <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                        {coordParsedRows.map((row, idx) => (
                          <div key={idx} className={`panel pb ${row.action === 'ignore' ? 'bg-bg-card opacity-50' : row.action === 'create' ? 'bg-emerald-900/30 border border-emerald-700' : 'bg-bg-inset'}`}>
                            <div className="grid grid-cols-12 gap-2 items-center">
                              {/* Parsed name */}
                              <div className="col-span-3">
                                <span className="text-sm font-medium">{row.rawName}</span>
                              </div>
                              {/* Min / Max */}
                              <div className="col-span-2 flex gap-1">
                                <input
                                  type="number"
                                  value={row.min}
                                  onChange={(e) => {
                                    const updated = [...coordParsedRows];
                                    updated[idx] = { ...updated[idx], min: parseInt(e.target.value) || 0 };
                                    setCoordParsedRows(updated);
                                  }}
                                  className="fld-i" style={{ width: 56 }}
                                />
                                <input
                                  type="number"
                                  value={row.max}
                                  onChange={(e) => {
                                    const updated = [...coordParsedRows];
                                    updated[idx] = { ...updated[idx], max: parseInt(e.target.value) || 0 };
                                    setCoordParsedRows(updated);
                                  }}
                                  className="fld-i" style={{ width: 56 }}
                                />
                              </div>
                              {/* Arrow */}
                              <div className="col-span-1 text-center text-text-secondary text-sm">→</div>
                              {/* Action / match selector */}
                              <div className="col-span-6">
                                <select
                                  value={row.action === 'match' ? `match:${row.matchedUnit}` : row.action}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = [...coordParsedRows];
                                    if (val === 'ignore') {
                                      updated[idx] = { ...updated[idx], action: 'ignore', matchedUnit: null };
                                    } else if (val === 'create') {
                                      updated[idx] = { ...updated[idx], action: 'create', matchedUnit: null };
                                    } else if (val.startsWith('match:')) {
                                      updated[idx] = { ...updated[idx], action: 'match', matchedUnit: val.slice(6) };
                                    }
                                    setCoordParsedRows(updated);
                                  }}
                                  className="fld-i"
                                >
                                  <optgroup label="Registered Units">
                                    {units.map(u => (
                                      <option key={u} value={`match:${u}`}>{u}{u === row.matchedUnit && row.action === 'match' ? ' ✓' : ''}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Actions">
                                    <option value="create">＋ Create New Unit</option>
                                    <option value="ignore">✕ Ignore</option>
                                  </optgroup>
                                </select>
                              </div>
                            </div>
                            {/* Create new unit options */}
                            {row.action === 'create' && (
                              <div className="mt-2 ml-4 flex items-center gap-3">
                                <label className="text-xs text-text-secondary">Name:</label>
                                <input
                                  type="text"
                                  value={row.newUnitName}
                                  onChange={(e) => {
                                    const updated = [...coordParsedRows];
                                    updated[idx] = { ...updated[idx], newUnitName: e.target.value };
                                    setCoordParsedRows(updated);
                                  }}
                                  className="fld-i"
                                />
                                <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={row.newUnitIsToken}
                                    onChange={(e) => {
                                      const updated = [...coordParsedRows];
                                      updated[idx] = { ...updated[idx], newUnitIsToken: e.target.checked };
                                      setCoordParsedRows(updated);
                                    }}
                                    
                                  />
                                  Token unit
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => { setCoordParsedRows([]); }}
                          className="gh"
                        >
                          Back
                        </button>
                        <button
                          onClick={applyCoordPaste}
                          className="gh live"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Confirm & Apply
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Casualty Input Modal */}
          {showCasualtyModal && selectedWeek && (
            <div className="modal-scrim">
              <div className="modal wide">
                <div className="pb">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="cap">
                      <Flame className="w-6 h-6" />
                      Assign Player Stats - {selectedWeek.name}
                    </h2>
                    <button
                      onClick={() => setShowCasualtyModal(false)}
                      className="ib"
                    >
                      <X className="w-5 h-5 text-text-muted" />
                    </button>
                  </div>

                  <div className="text-xs text-text-secondary mb-4 panel pb leading-relaxed">
                    Assign each token the scoreboard regiment(s) that played as it — for units that used a different in-game tag this event, or that fielded several regiments under one token. Stats are pulled from imported scoreboards and apply across every round we have data for.
                    {' '}These do <span className="font-semibold text-text-primary">not</span> change the round casualty totals (those stay on the per-side casualty inputs, which include untagged losses).
                    {sbStored.length === 0 && (
                      <span className="block mt-1 c-warn">No scoreboards imported for this event yet — import them in the Player Stats view first.</span>
                    )}
                  </div>

                  <div className="cols">
                    {[teamNames.A, teamNames.B].map((teamName, teamIdx) => {
                      const teamId = teamIdx === 0 ? 'A' : 'B';
                      const rosterUnits = selectedWeek[`team${teamId}`] || [];

                      return (
                        <div key={teamName} className="panel pb">
                          <h3 className="cap">{teamName} Units</h3>
                          <div >
                            {rosterUnits.length === 0 && (
                              <p className="note">No units assigned</p>
                            )}
                            {rosterUnits.map(unit => {
                              const regs = tokenRegiments[unit] || [];
                              const snap = deriveTokenSnaps(eventRegBreakdown, { [unit]: regs })[unit];
                              return (
                                <div key={unit} className="flex items-center gap-2 panel pb">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate" title={unit}>{unit}</div>
                                    <div className="text-xs text-text-secondary truncate">
                                      {regs.length ? regs.join(', ') : 'Unassigned'}
                                      {regs.length > 0 && ` · ${snap.kills}K / ${snap.deaths}D`}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => openAssign(unit)}
                                    className="gh live"
                                  >
                                    Assign stats
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Buttons */}
                  <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border-default">
                    <button
                      onClick={() => setShowCasualtyModal(false)}
                      className="gh"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Assign-stats sub-modal: toggle scoreboard regiments for one token */}
          {assignToken && (
            <div className="modal-scrim" onClick={() => setAssignToken(null)}>
              <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
                <div className="pb">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold truncate">Assign stats → {assignToken}</h3>
                    <button onClick={() => setAssignToken(null)} className="ib"><X className="w-4 h-4 text-text-muted" /></button>
                  </div>
                  <p className="note">
                    Toggle the scoreboard regiment(s) that played as <span className="font-semibold">{assignToken}</span>. Regiments already claimed by another token are locked.
                  </p>

                  {/* Scope: apply to all seasons, or override just the active season. */}
                  {activeSeason && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-mono">
                        {[{ id: OVERALL_SCOPE, label: 'All seasons' }, { id: activeSeason.id, label: activeSeason.name }].map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => changeAssignScope(opt.id)}
                            className="chip"
                          aria-pressed={assignScope === opt.id}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1">
                        {assignScope === OVERALL_SCOPE
                          ? 'Applies to every season (unless a season overrides it).'
                          : `Overrides this assignment for ${activeSeason.name} only.`}
                      </p>
                    </div>
                  )}

                  {(() => {
                    const snap = deriveTokenSnaps(eventRegBreakdown, { [assignToken]: assignSel })[assignToken];
                    const kd = snap.deaths > 0 ? (snap.kills / snap.deaths).toFixed(2) : String(snap.kills);
                    return (
                      <div className="text-xs panel pb mb-3 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="c-ok">{snap.kills}K</span>
                        <span className="c-danger">{snap.deaths}D</span>
                        <span>K/D {kd}</span>
                        <span title={AVG_TD_LABEL}>×Td {formatAvgT(unitSnapAvgTd(snap))}</span>
                        <span title={AVG_TK_LABEL}>×Tk {formatAvgT(unitSnapAvgTk(snap))}</span>
                      </div>
                    );
                  })()}

                  <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
                    {availableRegiments.length === 0 && (
                      <p className="note">No scoreboard regiments found. Import scoreboards in the Player Stats view first.</p>
                    )}
                    {availableRegiments.map(reg => {
                      const owner = assignClaimedBy[reg];
                      const lockedByOther = owner && owner !== assignToken;
                      return (
                        <label
                          key={reg}
                          className={`row flex items-center gap-2 ${lockedByOther ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-inset cursor-pointer'}`}
                        >
                          <input type="checkbox" disabled={lockedByOther} checked={assignSel.includes(reg)} onChange={() => toggleAssignReg(reg)} />
                          <span className="flex-1 truncate">{reg}</span>
                          {lockedByOther && <span className="text-[10px] text-text-secondary whitespace-nowrap">taken by {owner}</span>}
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border-default">
                    <button onClick={() => setAssignToken(null)} className="px-3 py-1.5 border border-border-default hover:bg-bg-inset text-sm rounded">Cancel</button>
                    <button onClick={saveAssign} className="gh live">
                      <Save className="w-4 h-4" /> Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Statistics Modal */}
          {/* Playoffs, to the prototype's V.playoffs: the bracket, who is
              qualifying on the table as it sits, formats that fit the nights
              left, and why the lengths are what they are. */}
          {screen === 'playoffs' && (
            <Playoffs
              enabled={!!playoffConfig.enabled}
              bracket={playoffBracketSlots}
              standings={standingRows}
              divisions={divisions}
              qualifyPerDivision={playoffConfig.teamsPerDivision || 2}
              nightsAvailable={weeks.filter(w => w.isPlayoffs).length || playoffNights}
              formats={playoffFormatOptions}
              onApplyFormat={(f) => f.plan && setPlayoffConfig({ ...f.plan.config })}
              onSettings={() => goScreen('settings')}
            />
          )}

          {screen === 'elo' && (
            <>
                <EloLadder
                  rows={eloLadderRows}
                  settings={eloSystem}
                  nights={weeks.length}
                  onOpenUnit={() => goScreen('stats-regiments')}
                />
                {rankingsImage('elo')}
            </>
          )}

          {/* Division Management Modal */}
          {screen === 'divisions' && (
            <>
              <div className="panel">
                <div className="ctl">
                  <span className="cap">Divisions</span>
                  <button className="gh live" onClick={addDivision}>
                    <Plus className="w-3 h-3" /> New division
                  </button>
                  <span className="rule" />
                  <span className="meta">
                    {divisions.length} division{divisions.length === 1 ? '' : 's'} ·{' '}
                    {getUnassignedUnits().length} unit{getUnassignedUnits().length === 1 ? '' : 's'} unassigned
                  </span>
                </div>
              </div>

              <div className="panel">
                <header className="ph">
                  <h2>Unassigned</h2>
                  <span className="rule" />
                  <span className="meta">a unit outside a division still plays — it just has no group to top</span>
                </header>
                <div className="pb">
                  {getUnassignedUnits().length > 0 ? (
                    <div className="rl">
                      {getUnassignedUnits().map(unit => (
                        <span key={unit} className="tag q">{unit}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="note">Every unit belongs to a division.</p>
                  )}
                </div>
              </div>

              {divisions.map((division) => (
                <div className="panel" key={division.name}>
                  <div className="ctl">
                    <span className="cap">Name</span>
                    <input
                      className="fld-i"
                      type="text"
                      value={division.name}
                      onChange={(e) => renameDivision(division.name, e.target.value)}
                      aria-label="Division name"
                    />
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addUnitToDivision(division.name, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      aria-label={`Add a unit to ${division.name}`}
                    >
                      <option value="">Add a unit…</option>
                      {getUnassignedUnits().map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                    <span className="rule" />
                    <span className="meta">{division.units.length} unit{division.units.length === 1 ? '' : 's'}</span>
                    <button className="gh c-danger" onClick={() => deleteDivision(division.name)}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                  <div className="pb flush">
                    {division.units.length === 0 ? (
                      <p className="note" style={{ padding: 13 }}>Nobody in this division yet.</p>
                    ) : (
                      <table>
                        <tbody>
                          {division.units.map(unit => (
                            <tr key={unit}>
                              <td className="wor-name">{unit}</td>
                              <td className="num">
                                <button className="gh" onClick={() => removeUnitFromDivision(division.name, unit)}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}

              {divisions.length === 0 && (
                <div className="panel">
                  <div className="pb">
                    <p className="note">
                      No divisions yet. A division groups units so the standings can be read within it and the
                      playoff bracket can seed from each one's top two.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Map History Viewer Modal — derived from outcome history (no manual bias) */}
          {showMapBiasModal && (() => {
            const { byMap } = calculateMapStats();
            return (
              <div className="modal-scrim">
                <div className="modal">
                  <div className="pb">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="cap">
                        <Map className="w-6 h-6" />
                        Map History
                      </h2>
                      <button
                        onClick={() => setShowMapBiasModal(false)}
                        className="ib"
                      >
                        <X className="w-5 h-5 text-text-muted" />
                      </button>
                    </div>

                    <div className="panel pb">
                      <p className="text-sm text-text-secondary">
                        Per-map outcome history. These numbers feed Elo expected-win-probability when{' '}
                        <strong>Map Weight</strong> in Settings is non-zero, with Bayesian shrinkage controlled by{' '}
                        <strong>Confidence Samples</strong>.
                      </p>
                    </div>

                    {Object.entries(MAPS).map(([category, mapList]) => (
                      <div key={category} className="mb-4">
                        <button
                          onClick={() => toggleSection(category)}
                          className="row click w-full flex items-center justify-between"
                        >
                          <h3 className="cap">
                            {category.replace(/_/g, ' ').toUpperCase()}
                          </h3>
                          {expandedSections[category] ? (
                            <ChevronDown className="w-5 h-5 text-text-secondary" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-text-secondary" />
                          )}
                        </button>

                        {expandedSections[category] && (
                          <div className="panel pb">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-text-secondary border-b border-border-default">
                                  <th>Map</th>
                                  <th className="text-right">Plays</th>
                                  <th className="text-right">USA W</th>
                                  <th className="text-right">CSA W</th>
                                  <th className="text-right">USA Win %</th>
                                  <th className="text-right">Atk Win %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mapList.map(mapName => {
                                  const data = byMap[mapName];
                                  if (!data) {
                                    return (
                                      <tr key={mapName} className="border-b border-border-default/40">
                                        <td >{mapName}</td>
                                        <td colSpan={5} className="text-text-muted text-right">No plays</td>
                                      </tr>
                                    );
                                  }
                                  const usaPct = data.plays > 0 ? Math.round((data.usaWins / data.plays) * 100) : 0;
                                  const atkPct = data.plays > 0 ? Math.round((data.attackerWins / data.plays) * 100) : 0;
                                  return (
                                    <tr key={mapName} className="border-b border-border-default/40">
                                      <td >{mapName}</td>
                                      <td className="text-right">{data.plays}</td>
                                      <td className="text-right">{data.usaWins}</td>
                                      <td className="text-right">{data.csaWins}</td>
                                      <td className="text-right">{usaPct}%</td>
                                      <td className="text-right">{atkPct}%</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border-default">
                      <button
                        onClick={() => setShowMapBiasModal(false)}
                        className="gh"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Unit Registry Editor Modal — event-level identity for every unit
             ever associated with this event. Renames sweep all rosters; hard
             delete is gated on whether the unit has any roster appearance. */}
          {screen === 'identity' && (() => {
            const registryEntries = Object.entries(activeEvent.unitRegistry)
              .map(([id, entry]) => ({ id, name: entry.name }))
              .sort((a, b) => a.name.localeCompare(b.name));

            const seasonsByUnit = {};
            for (const s of activeEvent.seasons) {
              const inRoster = new Set([...(s.units || []), ...(s.nonTokenUnits || [])]);
              for (const w of s.weeks || []) {
                (w.teamA || []).forEach(u => inRoster.add(u));
                (w.teamB || []).forEach(u => inRoster.add(u));
              }
              for (const name of inRoster) {
                (seasonsByUnit[name] ||= []).push(s.name);
              }
            }

            return (
              <div className="panel">
                <header className="ph">
                  <h2>Unit &amp; player identity</h2>
                  <span className="rule" />
                  <span className="meta wor-name">{activeEvent.name}</span>
                </header>
                  <div className="pb flush scroll-x">
                    {registryEntries.length === 0 ? (
                      <p className="note" style={{ padding: 13 }}>No units in this event yet.</p>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>Unit</th>
                            <th>In seasons</th>
                            <th className="num">Rename</th>
                            <th className="num">Delete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registryEntries.map(({ id, name }) => {
                            const seasons = seasonsByUnit[name] || [];
                            const inUse = seasons.length > 0;
                            return (
                              <tr key={id}>
                                <td className="wor-name">{name}</td>
                                <td style={{ color: 'var(--ink-2)' }}>
                                  {seasons.length === 0
                                    ? <span style={{ color: 'var(--ink-3)' }}>never rostered</span>
                                    : seasons.join(' \u00b7 ')}
                                </td>
                                <td className="num">
                                  <button
                                    className="gh"
                                    onClick={() => setIdentityRenaming(name)}
                                    title={`Rename ${name} \u2014 in this season, or across every season and the registry`}
                                  >
                                    Rename
                                  </button>
                                </td>
                                <td className="num">
                                  <button
                                    className="gh c-danger"
                                    disabled={inUse}
                                    onClick={() => {
                                      if (!confirm(`Hard-delete "${name}" from the registry? This is only safe because it has no roster appearances.`)) return;
                                      setAppState(prev => removeUnitFromRegistry(prev, name));
                                    }}
                                    title={inUse ? 'Appears in roster data \u2014 remove it from each season first' : 'Hard-delete from the registry'}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={4}>
                              Renaming applies to this season unless you choose every season. Deleting is only
                              offered when a unit has never been rostered anywhere in the event.
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                {identityRenaming && (
                  <RenameDialog
                    from={identityRenaming}
                    seasonName={activeSeason?.name || 'This season'}
                    roster={activeSeason?.units || []}
                    registry={registryUnitNames}
                    onCancel={() => setIdentityRenaming(null)}
                    onConfirm={(to, scope) => { renameUnit(identityRenaming, to, scope); setIdentityRenaming(null); }}
                  />
                )}
              </div>
            );
          })()}

          {/* Pairings — the matrix, in the prototype's single-hue ramp. */}
          {screen === 'heat' && (
            <PairingsScreen
              map={pairHeatmapData}
              mode={heatmapMode}
              onMode={setHeatmapMode}
              scope={heatmapScope}
              onScope={setHeatmapScope}
              seasonName={activeSeason?.name || 'This season'}
              seasonCount={activeEvent?.seasons?.length || 1}
            />
          )}

          {/* Simulation Modal */}
          {screen === 'simulator' && (
            <ScheduleMaker
              source={simSource}
              onSource={setSimSource}
              leadMode={simLeadMode}
              onLeadMode={setSimLeadMode}
              scheduleOnly={simScheduleOnly}
              onScheduleOnly={setSimScheduleOnly}
              leadNightsPerUnit={simLeadNightsPerUnit}
              onLeadNightsPerUnit={setSimLeadNightsPerUnit}
              leadNightsInDivision={simLeadNightsInDivision}
              onLeadNightsInDivision={setSimLeadNightsInDivision}
              homePerUnit={simHomePerUnit}
              onHomePerUnit={setSimHomePerUnit}
              awayPerUnit={simAwayPerUnit}
              onAwayPerUnit={setSimAwayPerUnit}
              splitRounds={simSplitRounds}
              onSplitRounds={setSimSplitRounds}
              paste={simPaste}
              onPaste={setSimPaste}
              preview={simPreview}
              parsed={pastedSchedule}
              audit={pastedAudit}
              describeProblem={describeScheduleProblem}
              onApplyPaste={applyPastedSchedule}
              onGenerate={simulateSeason}
              tokenUnitCount={tokenUnits.length}
              nonTokenUnitCount={nonTokenUnits.length}
              unitCount={units.length}
              divisionCount={divisions?.length || 0}
              teamAName={teamNames.A}
            />
          )}

          {/* Simulation Analytics Modal */}
          {showAnalyticsModal && simulationAnalytics && (
            <div
              className="modal-scrim"
              onClick={() => setShowAnalyticsModal(false)}
            >
              <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="pb">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="cap">
                      <TrendingUp className="w-6 h-6" />
                      Simulation Summary
                    </h2>
                    <button
                      onClick={() => setShowAnalyticsModal(false)}
                      className="ib"
                    >
                      <X className="w-5 h-5 text-text-muted" />
                    </button>
                  </div>

                  <div >
                    {/* Success Message */}
                    <div className="panel pb">
                      <p className="c-ok font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" />
                        Added {simulationAnalytics.spacing.nights} weeks ({simulationAnalytics.spacing.rounds} rounds) to the season
                      </p>
                      <p className="text-xs text-text-secondary mt-2">
                        {simulationAnalytics.scheduleOnly
                          ? 'Leads only — teams, maps and results are left for you to fill in'
                          : 'Teams, maps and round results were generated too'}
                      </p>
                    </div>

                    {/* Lead Spread */}
                    <div className="panel pb">
                      <h3 className="text-lg font-semibold c-warn mb-3 flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Lead Spread
                      </h3>
                      <p className="text-xs text-text-secondary mb-4">
                        Nights between a unit's {simulationAnalytics.splitLeads ? 'lead rounds' : 'lead weeks'}, across {simulationAnalytics.spacing.leadingUnits} leading units
                      </p>
                      <div className="kpis">
                        <SimStat
                          label="Season Length"
                          value={`${simulationAnalytics.spacing.nights} wks`}
                          hint={`${simulationAnalytics.spacing.rounds} rounds`}
                        />
                        <SimStat
                          label="Avg Gap"
                          value={oneDecimal(simulationAnalytics.spacing.avgGap)}
                          hint={`ideal ${oneDecimal(simulationAnalytics.spacing.idealGap)} nights`}
                        />
                        <SimStat
                          label="Shortest / Longest"
                          value={`${simulationAnalytics.spacing.minGap ?? '—'} / ${simulationAnalytics.spacing.maxGap ?? '—'}`}
                          hint="nights apart"
                        />
                        <SimStat
                          label="Leads per Unit"
                          value={oneDecimal(simulationAnalytics.spacing.avgLeadRounds)}
                          hint={`rounds over ${oneDecimal(simulationAnalytics.spacing.avgLeadNights)} nights`}
                        />
                      </div>
                      <div className="kpis" style={{ marginTop: 13 }}>
                        <div className={`kpi ${simulationAnalytics.spacing.backToBack > 0 ? 'text-yellow-400' : 'text-text-secondary'}`}>
                          Leads on back-to-back nights: <span className="font-bold">{simulationAnalytics.spacing.backToBack}</span>
                        </div>
                        {simulationAnalytics.splitLeads && (
                          <div className={`kpi ${simulationAnalytics.spacing.doubleNights > 0 ? 'text-yellow-400' : 'text-text-secondary'}`}>
                            Units leading both rounds of a night: <span className="font-bold">{simulationAnalytics.spacing.doubleNights}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 13, maxHeight: 224, overflowY: 'auto' }}>
                        <table>
                          <thead className="text-text-secondary">
                            <tr className="border-b border-border-default">
                              <th >Unit</th>
                              <th className="num">Lead Rounds</th>
                              <th className="num">Lead Nights</th>
                              <th className="num">Avg Gap</th>
                              <th className="num">Min / Max</th>
                            </tr>
                          </thead>
                          <tbody>
                            {simulationAnalytics.spacing.perUnit.map(entry => (
                              <tr key={entry.unit} className="border-b border-border-default/50 last:border-0">
                                <td >{entry.unit}</td>
                                <td className="num">{entry.leadRounds}</td>
                                <td className="num">{entry.leadNights}</td>
                                <td className="num">{oneDecimal(entry.avgGap)}</td>
                                <td className="num">{entry.minGap ?? '—'} / {entry.maxGap ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Schedule Export */}
                    <div className="panel pb">
                      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                        <h3 className="cap">
                          <FileText className="w-5 h-5" />
                          Matchup Sheet Export
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={copyScheduleToClipboard}
                            className="gh live"
                          >
                            <Copy className="w-4 h-4" /> {scheduleCopied ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={downloadSchedule}
                            className="gh"
                          >
                            <Download className="w-4 h-4" /> CSV
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-text-secondary mb-2">
                        Tab-separated — paste straight into a matchup sheet
                      </p>
                      <textarea
                        readOnly
                        value={toTsv(simulationAnalytics.rows)}
                        onFocus={(e) => e.target.select()}
                        rows={6}
                        className="fld-i" style={{ whiteSpace: 'pre' }}
                      />
                    </div>

                    {simulationAnalytics.points && (
                      <>
                      {/* Point System Summary */}
                      <div className="panel pb">
                        <h3 className="cap">
                          <Settings className="w-5 h-5" />
                          Current Point System
                        </h3>
                        <div className="grid-f text-sm">
                          <div className="panel pb">
                            <div className="text-text-secondary mb-2 font-semibold">Lead Points</div>
                            <div className="note">
                              <div>Win: <span className="c-accent font-semibold">{pointSystem.winLead}</span></div>
                              <div>Loss: <span className="c-accent font-semibold">{pointSystem.lossLead}</span></div>
                              <div>Sweep: <span className="c-accent font-semibold">{pointSystem.bonus2_0Lead}</span></div>
                            </div>
                          </div>
                          <div className="panel pb">
                            <div className="text-text-secondary mb-2 font-semibold">Assist Points</div>
                            <div className="note">
                              <div>Win: <span className="c-accent font-semibold">{pointSystem.winAssist}</span></div>
                              <div>Loss: <span className="c-accent font-semibold">{pointSystem.lossAssist}</span></div>
                              <div>Sweep: <span className="c-accent font-semibold">{pointSystem.bonus2_0Assist}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Theoretical Analysis */}
                      <div className="panel pb">
                        <h3 className="text-lg font-semibold f-usa mb-3 flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          Theoretical Distribution (Per Token Unit)
                        </h3>
                        <p className="text-xs text-text-secondary mb-4">
                          Maximum possible points per token unit (winning every round and sweep)
                        </p>
                        <div >
                          <div className="panel pb">
                            <div className="text-xs text-text-secondary mb-2 font-semibold">Max Possible (Season)</div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Lead Points</span>
                              <span className="c-accent font-bold">{simulationAnalytics.points.theoretical.leadPoints.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Assist Points</span>
                              <span className="f-usa font-bold">{simulationAnalytics.points.theoretical.assistPoints.toFixed(1)}</span>
                            </div>
                            <div className="border-t border-border-default my-2"></div>
                            <div className="flex justify-between items-center">
                              <span className="text-text-secondary font-semibold">Total Points</span>
                              <span className="font-bold">{simulationAnalytics.points.theoretical.totalPoints.toFixed(1)}</span>
                            </div>
                          </div>
                          <div className="panel pb">
                            <div className="text-xs text-text-secondary mb-2 font-semibold">Max Possible (Per Round)</div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Lead Points</span>
                              <span className="c-accent font-bold">{(simulationAnalytics.points.theoretical.leadPoints / simulationAnalytics.points.totalRounds).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Assist Points</span>
                              <span className="f-usa font-bold">{(simulationAnalytics.points.theoretical.assistPoints / simulationAnalytics.points.totalRounds).toFixed(2)}</span>
                            </div>
                            <div className="border-t border-border-default my-2"></div>
                            <div className="flex justify-between items-center">
                              <span className="text-text-secondary font-semibold">Total Points</span>
                              <span className="font-bold">{(simulationAnalytics.points.theoretical.totalPoints / simulationAnalytics.points.totalRounds).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="kpis">
                            <div className="kpi">
                              <div className="c-accent text-2xl font-bold">{simulationAnalytics.points.theoretical.leadPercentage.toFixed(1)}%</div>
                              <div className="text-xs text-text-secondary mt-1">Lead Points</div>
                            </div>
                            <div className="kpi">
                              <div className="f-usa text-2xl font-bold">{simulationAnalytics.points.theoretical.assistPercentage.toFixed(1)}%</div>
                              <div className="text-xs text-text-secondary mt-1">Assist Points</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Simulated Results */}
                      <div className="panel pb">
                        <h3 className="text-lg font-semibold c-ok mb-3 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5" />
                          Simulated Results (Per Token Unit Average)
                        </h3>
                        <p className="text-xs text-text-secondary mb-4">
                          Actual points averaged across all token units from the simulation
                        </p>
                        <div >
                          <div className="panel pb">
                            <div className="text-xs text-text-secondary mb-2 font-semibold">Season Totals (Average)</div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Lead Points</span>
                              <span className="c-accent font-bold">{simulationAnalytics.points.simulated.leadPoints.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Assist Points</span>
                              <span className="f-usa font-bold">{simulationAnalytics.points.simulated.assistPoints.toFixed(1)}</span>
                            </div>
                            <div className="border-t border-border-default my-2"></div>
                            <div className="flex justify-between items-center">
                              <span className="text-text-secondary font-semibold">Total Points</span>
                              <span className="font-bold">{simulationAnalytics.points.simulated.totalPoints.toFixed(1)}</span>
                            </div>
                          </div>
                          <div className="panel pb">
                            <div className="text-xs text-text-secondary mb-2 font-semibold">Per Round Average</div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Lead Points</span>
                              <span className="c-accent font-bold">{(simulationAnalytics.points.simulated.leadPoints / simulationAnalytics.points.totalRounds).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-text-secondary font-semibold">Assist Points</span>
                              <span className="f-usa font-bold">{(simulationAnalytics.points.simulated.assistPoints / simulationAnalytics.points.totalRounds).toFixed(2)}</span>
                            </div>
                            <div className="border-t border-border-default my-2"></div>
                            <div className="flex justify-between items-center">
                              <span className="text-text-secondary font-semibold">Total Points</span>
                              <span className="font-bold">{(simulationAnalytics.points.simulated.totalPoints / simulationAnalytics.points.totalRounds).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="text-xs text-text-secondary panel pb">
                            All token units combined: {simulationAnalytics.points.simulated.totalLeadPoints.toFixed(0)} lead points, {simulationAnalytics.points.simulated.totalAssistPoints.toFixed(0)} assist points
                          </div>
                          <div className="kpis">
                            <div className="kpi">
                              <div className="c-accent text-2xl font-bold">{simulationAnalytics.points.simulated.leadPercentage.toFixed(1)}%</div>
                              <div className="text-xs text-text-secondary mt-1">Lead Points</div>
                            </div>
                            <div className="kpi">
                              <div className="f-usa text-2xl font-bold">{simulationAnalytics.points.simulated.assistPercentage.toFixed(1)}%</div>
                              <div className="text-xs text-text-secondary mt-1">Assist Points</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Comparison */}
                      <div className="panel pb">
                        <h3 className="text-lg font-semibold c-accent mb-3 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          Comparison
                        </h3>
                        <div className="grid-f text-sm">
                          <div>
                            <div className="text-text-secondary mb-1">Lead Point Variance</div>
                            <div className={`text-lg font-bold ${Math.abs(simulationAnalytics.points.simulated.leadPercentage - simulationAnalytics.points.theoretical.leadPercentage) < 2 ? 'c-ok' : 'text-yellow-400'}`}>
                              {(simulationAnalytics.points.simulated.leadPercentage - simulationAnalytics.points.theoretical.leadPercentage > 0 ? '+' : '')}
                              {(simulationAnalytics.points.simulated.leadPercentage - simulationAnalytics.points.theoretical.leadPercentage).toFixed(1)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-text-secondary mb-1">Assist Point Variance</div>
                            <div className={`text-lg font-bold ${Math.abs(simulationAnalytics.points.simulated.assistPercentage - simulationAnalytics.points.theoretical.assistPercentage) < 2 ? 'c-ok' : 'text-yellow-400'}`}>
                              {(simulationAnalytics.points.simulated.assistPercentage - simulationAnalytics.points.theoretical.assistPercentage > 0 ? '+' : '')}
                              {(simulationAnalytics.points.simulated.assistPercentage - simulationAnalytics.points.theoretical.assistPercentage).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-text-secondary mt-3">
                          💡 Small variances are expected due to randomization. Large variances may indicate imbalanced settings.
                        </p>
                      </div>
                      </>
                    )}

                    {/* Close Button */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => setShowAnalyticsModal(false)}
                        className="gh"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Enlarged Section Modal */}
          {enlargedSection && (
            <div className="modal-scrim">
              <div className="modal wide">
                <div className="pb">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="cap">
                      {enlargedSection === 'weeks' && (
                        <>
                          <Calendar className="w-6 h-6" />
                          Weeks ({weeks.length})
                        </>
                      )}
                      {enlargedSection === 'units' && (
                        <>
                          <Users className="w-6 h-6" />
                          Units ({units.length})
                        </>
                      )}
                      {enlargedSection === 'standings' && (
                        <>
                          <Award className="w-6 h-6" />
                          Standings
                        </>
                      )}
                    </h2>
                    <button
                      onClick={() => setEnlargedSection(null)}
                      className="ib"
                    >
                      <X className="w-5 h-5 text-text-muted" />
                    </button>
                  </div>

                  {/* Weeks Enlarged View */}
                  {enlargedSection === 'weeks' && (
                    <div>
                      <div className="mb-4 flex justify-end">
                        <button
                          onClick={addWeek}
                          className="gh live"
                        >
                          <Plus className="w-4 h-4" />
                          Add Week
                        </button>
                      </div>
                      <div className="mapgrid">
                        {weeks.map((week) => (
                          <div
                            key={week.id}
                            className={`row click${selectedWeek?.id === week.id ? ' on' : ''}`}
                          >
                            <div className="flex justify-between items-center">
                              {editingWeek === week.id ? (
                                <input
                                  type="text"
                                  defaultValue={week.name}
                                  onBlur={(e) => renameWeek(week.id, e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      renameWeek(week.id, e.target.value);
                                    }
                                  }}
                                  className="fld-i"
                                  autoFocus
                                />
                              ) : (
                                <div
                                  onClick={() => setSelectedWeek(week)}
                                  className="flex-1"
                                >
                                  <div className="font-semibold">{week.name}</div>
                                  <div className="text-sm opacity-75">
                                    {week.teamA.length + week.teamB.length} units assigned
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingWeek(week.id);
                                  }}
                                  className="ib"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeWeek(week.id);
                                  }}
                                  className="ib danger"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Units Enlarged View */}
                  {enlargedSection === 'units' && (
                    <div>
                      <div className="mb-4 flex gap-2">
                        <input
                          type="text"
                          value={newUnitName}
                          onChange={(e) => setNewUnitName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addUnit()}
                          placeholder="Unit name..."
                          className="fld-i"
                        />
                        <button
                          onClick={addUnit}
                          className="gh live"
                        >
                          <Plus className="w-4 h-4" />
                          Add Unit
                        </button>
                      </div>
                      <div className="mapgrid">
                        {units.map((unit) => {
                          const isNonToken = nonTokenUnits.includes(unit);
                          return (
                            <div
                              key={unit}
                              className="row flex justify-between items-center"
                            >
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleNonTokenStatus(unit)}
                                  className={`gh ${
                                    isNonToken
                                      ? 'gh live'
                                      : ''
                                  }`}
                                  title={isNonToken ? "Non-token unit (click to toggle)" : "Token unit (click to toggle)"}
                                >
                                  {isNonToken ? '*' : '○'}
                                </button>
                                <span className={`font-medium ${isNonToken ? 'c-accent' : 'text-text-primary'}`}>
                                  {unit}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                {selectedWeek && (
                                  <>
                                    <button
                                      onClick={() => moveUnitToTeam(unit, 'A')}
                                      className="gh live"
                                      title={`Add to ${teamNames.A}`}
                                    >
                                      → A
                                    </button>
                                    <button
                                      onClick={() => moveUnitToTeam(unit, 'B')}
                                      className="gh c-danger"
                                      title={`Add to ${teamNames.B}`}
                                    >
                                      → B
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => removeUnit(unit)}
                                  className="ib danger"
                                >
                                  <Trash2 className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Standings Enlarged View */}
                  {enlargedSection === 'standings' && (
                    <div>
                      <div className="mb-4 flex gap-2 justify-end">
                        <button
                          onClick={() => setRankByElo(!rankByElo)}
                          className="px-3 py-2 border border-border-default hover:bg-bg-inset text-sm rounded-md transition flex items-center gap-1"
                          title={rankByElo ? "Rank by Points" : "Rank by Elo"}
                        >
                          <TrendingUp className="w-4 h-4" />
                          {rankByElo ? "Elo" : "Points"}
                        </button>
                        {divisions && divisions.length > 0 && (
                          <button
                            onClick={() => setShowGroupedStandings(!showGroupedStandings)}
                            className="gh live"
                            title={showGroupedStandings ? "Show All" : "Group by Division"}
                          >
                            {showGroupedStandings ? <Users className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                            {showGroupedStandings ? "Grouped" : "All"}
                          </button>
                        )}
                      </div>
                      <div className="mapgrid">
                        {showGroupedStandings && divisions && divisions.length > 0 ? (
                          getGroupedStandings().map((group) => (
                            <div key={group.name} className="panel pb">
                              <h3 className="cap">
                                <Shield className="w-4 h-4" />
                                {group.name}
                              </h3>
                              <div >
                                {group.units.map((stat) => {
                                  const isNonToken = nonTokenUnits.includes(stat.unit);
                                  return (
                                    <div
                                      key={stat.unit}
                                      className="panel pb"
                                    >
                                      <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="c-accent font-bold text-lg">
                                            #{stat.divisionRank || stat.currentRank}
                                          </span>
                                          {stat.rankDelta !== null && stat.rankDelta !== undefined && (
                                            <span className={`text-xs font-semibold ${
                                              stat.rankDelta > 0 ? 'c-ok' :
                                              stat.rankDelta < 0 ? 'c-danger' :
                                              'text-text-secondary'
                                            }`}>
                                              {stat.rankDelta > 0 ? `↑${stat.rankDelta}` :
                                               stat.rankDelta < 0 ? `↓${Math.abs(stat.rankDelta)}` :
                                               '−'}
                                            </span>
                                          )}
                                          <span className={`font-semibold ${isNonToken ? 'c-accent' : 'text-text-primary'}`}>
                                            {isNonToken ? '*' : ''}{stat.unit}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <div className="flex items-center gap-1 text-xs">
                                            {stat.eloDelta > 0 ? (
                                              <TrendingUp className="w-3 h-3 f-usa" />
                                            ) : stat.eloDelta < 0 ? (
                                              <TrendingUp className="w-3 h-3 c-danger transform rotate-180" />
                                            ) : (
                                              <span className="w-3 h-3 text-yellow-400 flex items-center justify-center text-lg leading-none">−</span>
                                            )}
                                            <span className="c-accent font-semibold">
                                              {Math.round(stat.elo)}
                                            </span>
                                            {stat.eloDelta !== undefined && stat.eloDelta !== 0 && (
                                              <span className={`ml-1 ${
                                                stat.eloDelta > 0 ? 'c-ok' : 'c-danger'
                                              }`}>
                                                ({stat.eloDelta > 0 ? '+' : ''}{Math.round(stat.eloDelta)})
                                              </span>
                                            )}
                                          </div>
                                          <span className="c-ok font-bold text-xl">
                                            {stat.points}
                                          </span>
                                          {stat.pointsDelta !== 0 && (
                                            <span className={`text-xs ml-1 ${stat.pointsDelta > 0 ? 'c-ok' : 'c-danger'}`}>
                                              ({stat.pointsDelta > 0 ? '+' : ''}{stat.pointsDelta})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="grid-f text-xs text-text-secondary">
                                        <div>L-Wins: {stat.leadWins}</div>
                                        <div>L-Loss: {stat.leadLosses}</div>
                                        <div>A-Wins: {stat.assistWins}</div>
                                        <div>A-Loss: {stat.assistLosses}</div>
                                        <div className="col-span-2 c-accent">
                                          Elo: {Math.round(stat.elo)} ({stat.rounds} rounds)
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        ) : (
                          getStandingsWithChanges().map((stat, index) => {
                            const isNonToken = nonTokenUnits.includes(stat.unit);
                            return (
                              <div
                                key={stat.unit}
                                className="panel pb"
                              >
                                <div className="flex justify-between items-center mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="c-accent font-bold text-lg">
                                      #{index + 1}
                                    </span>
                                    {stat.rankDelta !== null && stat.rankDelta !== undefined && (
                                      <span className={`text-xs font-semibold ${
                                        stat.rankDelta > 0 ? 'c-ok' :
                                        stat.rankDelta < 0 ? 'c-danger' :
                                        'text-text-secondary'
                                      }`}>
                                        {stat.rankDelta > 0 ? `↑${stat.rankDelta}` :
                                         stat.rankDelta < 0 ? `↓${Math.abs(stat.rankDelta)}` :
                                         '−'}
                                      </span>
                                    )}
                                    <span className={`font-semibold ${isNonToken ? 'c-accent' : 'text-text-primary'}`}>
                                      {isNonToken ? '*' : ''}{stat.unit}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 text-xs">
                                      {stat.eloDelta > 0 ? (
                                        <TrendingUp className="w-3 h-3 f-usa" />
                                      ) : stat.eloDelta < 0 ? (
                                        <TrendingUp className="w-3 h-3 c-danger transform rotate-180" />
                                      ) : (
                                        <span className="w-3 h-3 text-yellow-400 flex items-center justify-center text-lg leading-none">−</span>
                                      )}
                                      <span className="c-accent font-semibold">
                                        {Math.round(stat.elo)}
                                      </span>
                                      {stat.eloDelta !== undefined && stat.eloDelta !== 0 && (
                                        <span className={`ml-1 ${
                                          stat.eloDelta > 0 ? 'c-ok' : 'c-danger'
                                        }`}>
                                          ({stat.eloDelta > 0 ? '+' : ''}{Math.round(stat.eloDelta)})
                                        </span>
                                      )}
                                    </div>
                                    <span className="c-ok font-bold text-xl">
                                      {stat.points}
                                    </span>
                                    {stat.pointsDelta !== 0 && (
                                      <span className={`text-xs ml-1 ${stat.pointsDelta > 0 ? 'c-ok' : 'c-danger'}`}>
                                        ({stat.pointsDelta > 0 ? '+' : ''}{stat.pointsDelta})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="grid-f text-xs text-text-secondary">
                                  <div>L-Wins: {stat.leadWins}</div>
                                  <div>L-Loss: {stat.leadLosses}</div>
                                  <div>A-Wins: {stat.assistWins}</div>
                                  <div>A-Loss: {stat.assistLosses}</div>
                                  <div className="col-span-2 c-accent">
                                    Elo: {Math.round(stat.elo)} ({stat.rounds} rounds)
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty State — only where adding a week is the point of the screen. */}
          {viewMode === 'tracker' && weeks.length === 0 && SEASON_SCREENS.has(screen) && (
            <div className="panel pb">
              <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Add a week to get started</p>
            </div>
          )}
        </div>

      {/* Generic Choice Dialog — replaces window.prompt() for action picks */}
      {choiceDialog && (
        <div
          className="modal-scrim"
          onClick={choiceDialog.onClose}
        >
          <div
            className="modal narrow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pb">
              <div className="flex justify-between items-start gap-3 mb-2">
                <h2 className="cap">{choiceDialog.title}</h2>
                <button
                  onClick={choiceDialog.onClose}
                  className="ib"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-text-muted" />
                </button>
              </div>
              {choiceDialog.message && (
                <p className="text-sm text-text-secondary mb-4">{choiceDialog.message}</p>
              )}
              <div className="flex flex-col gap-2">
                {choiceDialog.choices.map((c, idx) => {
                  const variant = c.variant || 'secondary';
                  const cls =
                    variant === 'primary'   ? 'gh live'
                  : variant === 'danger'    ? 'gh c-danger'
                  :                           'gh';
                  return (
                    <button
                      key={idx}
                      onClick={() => choiceDialog.onChoose(c.value)}
                      className={cls}
                      style={{ textAlign: 'left', padding: '7px 11px' }}
                    >
                      <div className="text-sm font-medium">{c.label}</div>
                      {c.description && (
                        <div className={`text-xs mt-0.5 ${variant === 'primary' || variant === 'danger' ? 'opacity-90' : 'text-text-secondary'}`}>
                          {c.description}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
};

export default SeasonTracker;