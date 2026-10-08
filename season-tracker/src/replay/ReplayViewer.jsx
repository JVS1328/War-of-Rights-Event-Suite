import { useState, useRef, useEffect, useMemo, useCallback, Fragment } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, X, Crosshair, Search, ChevronDown, ChevronRight,
  Skull, ExternalLink, Users, Activity, Layers, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import { MAPS, worldMetersToMapPx, headingToMapDelta, mapPxPerYard, YARDS_PER_METER } from './mapCalibration.js';
import { LEADER_KIND, BRANCH, leaderOf, isMounted } from './replayParser.js';
import {
  pieceAt, impactsInWindow, impactRadiusM, impactLabel, impactSources, flagOwner, LIKELY_KILL_CHANCE,
} from './artyParser.js';
import { roundStateAt, objectivesAt } from './eventsParser.js';
import { LevelBadge } from './LevelBadge.jsx';
import { computeDeaths, deathsAt, withKills, downAt } from './deaths.js';
import { alignKills, lastIndexLE } from './killAlign.js';
import { fillTimeline } from './timeline.js';
import {
  buildPlayerDirectory, steamProfileUrl, shortCompany, groupEntriesByRegiment, groupEntriesByCompany,
} from './playerDirectory.js';
import { countNearby } from './proximity.js';
import { UNTAGGED, tagRegimentResolver, FORMATION_LABEL, ASSET_BASE } from './host.js';
import { analyseRound, areaStats, areaSummary, heatDensity, isoSegments, frontLine } from './roundAnalysis.js';
import { usePanels, Panel } from './panels.jsx';
import AnalysisPanel, { spaced } from './AnalysisPanel.jsx';
import './replay.css';

// USA = team 1 = blue, CSA = team 2 = amber -- the season tracker's faction
// pair (colour-blind safe), in its light-theme shade because the dots sit on
// the parchment map whichever theme the page is in. Hard-coded -- replay is a
// god-view (not a player POV), so friend/foe inversion doesn't apply.
const TEAM_COLOR = {
  1: '#1a6493',
  2: '#b06a0a',
};
const TEAM_RGB = { 1: [26, 100, 147], 2: [176, 106, 10] };
// An unowned capture point or area (the overlay's kCaptureNeutral), and the
// playable area's edge.
const OBJECTIVE_NEUTRAL = [240, 205, 95];
const BOUNDARY_RGB = [0, 0, 0];
// The same pair for page text, from the active theme (the map shades above
// are too dark to read on the dark theme's surfaces).
const TEAM_UI = { 1: 'var(--color-usa)', 2: 'var(--color-csa)' };
// Team labels follow the round's era (1776: Patriots / Great Britain); the
// host passes them in, the Civil War pair is the default.
const DEFAULT_TEAM_NAMES = { 1: 'USA', 2: 'CSA' };

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8];

// Player marks, sized as the overlay's full map draws them
// (wor_overlay/mod/map_view.cpp player_dot_radius / leader_radius /
// draw_player_dot / draw_leader_glyph / draw_mounted_ring): a teardrop
// pointing where they face, its round end at the soldier's true 0.42 m
// physics radius, floored so it stays visible when zoomed out, times the size slider;
// officers (star) and flag bearers (the game's Flag.dds) on the same true
// size times their own slider.
const SOLDIER_RADIUS_M = 0.42;
const DOT_FLOOR_PX = 3;
const trueRadius = (pxPerM) => Math.max(SOLDIER_RADIUS_M * pxPerM, DOT_FLOOR_PX);
// player.png is a teardrop, tip up, whose round end (centre 0.653 down the
// image, radius 0.331 of its side) is drawn at r; an officer's star has its
// points at 1.3 r. A death marker takes the height of the mark it replaces.
const PLAYER_DISC_R = 0.331;
const PLAYER_DISC_CY = 0.653;
const playerIconSide = (r) => r / PLAYER_DISC_R;
const starSize = (r) => r * 1.3;
// A flag bearer's Flag.dds is a square of this half-side at r (the overlay's
// kFlagIconHalf); a dropped flag's X uses the same, so the two always match.
const flagIconHalf = (r) => r * 1.6;

// The overlay's own map art (wor_overlay/assets/maps): the game's tileable-map
// pieces, so the replay's artillery reads like the in-game map and the overlay.
const ICON_FILES = {
  impact: 'impact.png', gun: 'gun.png', caisson: 'caisson.png',
  corpse: 'corpse.png', corpseOfficer: 'corpse_officer.png',   // the game's own TileableMap marks
  player: 'player.png',                                        // teardrop, tip = heading
  flag: 'flag.png',                                            // TileableMap Flag.dds, 32 px
  droppedFlag: 'dropped_flag.png',                             // TileableMap LocalPlayerCorpse.dds (an X), 32 px
};

const BRANCH_NAME = {
  [BRANCH.INFANTRY]: 'Infantry', [BRANCH.ARTILLERY]: 'Artillery', [BRANCH.CAVALRY]: 'Cavalry',
};

// "USA · Cavalry · Officer · Mounted" -- whatever of it is known this frame.
function playerSubtitle(replay, frame, pi, teamNames) {
  const p = replay.players[pi];
  const kind = leaderKindForFrame(replay, frame, pi);
  const slot = frame * replay.playerCount + pi;
  return [
    teamNames[p.team] || `Team ${p.team}`,
    BRANCH_NAME[p.branch],
    kind === LEADER_KIND.OFFICER ? 'Officer' : kind === LEADER_KIND.FLAG ? 'Flag bearer' : null,
    !Number.isNaN(replay.tracks.x[slot]) && isMounted(replay.tracks.lk[slot]) ? 'Mounted' : null,
  ].filter(Boolean).join(' · ');
}
function useIcons() {
  const [icons, setIcons] = useState({});
  useEffect(() => {
    let alive = true;
    for (const [key, file] of Object.entries(ICON_FILES)) {
      const img = new Image();
      img.onload = () => { if (alive) setIcons((m) => ({ ...m, [key]: img })); };
      img.src = `${ASSET_BASE}icons/${file}`;
    }
    return () => { alive = false; };
  }, []);
  return icons;
}

// Per piece kind: the layer toggle that shows it, its size slider, and its
// on-screen height before scaling. Guns and caissons are drawn at their real
// footprint (overlay: physics AABBs measured 2026-09-26; its 6 px half-length
// floor); a dropped flag is exactly a flag bearer's flag, on the leader slider.
const PIECE_STYLE = {
  gun:         { show: 'pieces', scale: 'gunScale',     heightPx: (pxPerM) => Math.max(12, 4.0 * pxPerM) },
  caisson:     { show: 'pieces', scale: 'caissonScale', heightPx: (pxPerM) => Math.max(12, 5.0 * pxPerM) },
  droppedFlag: { show: 'flags',  scale: 'leaderScale',  heightPx: (pxPerM) => 2 * flagIconHalf(trueRadius(pxPerM)) },
};

// The overlay tints the white piece icons by multiplying them with a colour
// (map_view.cpp kArtyNeutral / kArtyLoaded): the whole gun turns orange once
// it is rammed. Canvas has no per-draw tint, so bake one copy per colour.
const ARTY_NEUTRAL = [225, 225, 225];
const ARTY_LOADED = [255, 110, 50];
const tintCache = new WeakMap();
function tinted(img, rgb) {
  let byColour = tintCache.get(img);
  if (!byColour) { byColour = new Map(); tintCache.set(img, byColour); }
  const key = rgb.join(',');
  if (!byColour.has(key)) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${key})`;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';   // keep the icon's own alpha
    g.drawImage(img, 0, 0);
    byColour.set(key, c);
  }
  return byColour.get(key);
}

// Map-layer settings (artillery + death markers), remembered per browser.
const ARTY_PREFS_KEY = 'woraat-arty';
const clampS = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
function loadArtyPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(ARTY_PREFS_KEY) || '{}') || {}; } catch { /* private mode */ }
  return {
    impacts: p.impacts !== false,
    shotLines: p.shotLines !== false,
    pieces: p.pieces !== false,
    flags: p.flags !== false,
    hideEmpty: p.hideEmpty === true,
    fadeS: clampS(p.fadeS, 5, 120, 30),
    // Impact ring: the kill chance in the open it marks, in percent (100 = the
    // certain-kill radius, 0 = the blast's full reach).
    impactKillPct: clampS(p.impactKillPct, 0, 100, LIKELY_KILL_CHANCE * 100),
    deaths: p.deaths !== false,
    // Heatmap under the players: off, where each side stood, or where its men fell.
    heat: ['presence', 'deaths'].includes(p.heat) ? p.heat : 'off',
    // The line of contact, with where it ran over the last few minutes.
    frontLines: p.frontLines === true,
    // Capture points and capture areas, and the playable area's edge with each
    // side's staging area (from the _events.csv, 2026-10-08 on).
    objectives: p.objectives !== false,
    bounds: p.bounds !== false,
    frontTrailMin: clampS(p.frontTrailMin, 0, 10, 3),
    deathForever: p.deathForever === true,
    deathFadeS: clampS(p.deathFadeS, 5, 300, 30),
    // Icon sizes, 1 = true size (the overlay's sliders and ranges).
    playerScale: clampS(p.playerScale, 0.4, 1.5, 1),
    leaderScale: clampS(p.leaderScale, 0.4, 3, 1),
    gunScale: clampS(p.gunScale, 0.4, 1.5, 1),
    caissonScale: clampS(p.caissonScale, 0.4, 1.5, 1),
  };
}

// Track sample fields (utils/artyParser): [t, x, y, fx, fy, round, loaded, shell, case, canister]
const ROUND_NAME = ['Shell', 'Case', 'Canister'];
const caissonEmpty = (s) => s[7] + s[8] + s[9] === 0;
function pieceTitle(piece) {
  if (piece.kind === 'droppedFlag') return 'Dropped flag';
  const cal = piece.model === '12pdr' ? '12-pdr Napoleon' : piece.model === '10pdr' ? '10-pdr' : '';
  return `${cal} ${piece.kind === 'gun' ? 'gun' : 'caisson'}`.trim();
}
// A rammed gun turns orange; a dropped flag wears its side's colour.
function pieceTint(piece, s) {
  if (piece.kind === 'droppedFlag') return TEAM_RGB[flagOwner(piece.name).team] || ARTY_NEUTRAL;
  return piece.kind === 'gun' && s[6] ? ARTY_LOADED : ARTY_NEUTRAL;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Binary-search the frameTimes array for the index at-or-before targetSec.
function frameIndexForTime(frameTimes, targetSec) {
  if (frameTimes.length === 0) return 0;
  let lo = 0, hi = frameTimes.length - 1;
  if (targetSec <= frameTimes[0]) return 0;
  if (targetSec >= frameTimes[hi]) return hi;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frameTimes[mid] <= targetSec) lo = mid;
    else hi = mid;
  }
  return lo;
}

// The heatmap: each side's density (roundAnalysis.heatDensity) in its colour,
// blended where both stood, more opaque and deeper toward the busiest ground.
// One pixel per cell; drawn scaled onto the map, so smoothing does the rest.
const HEAT_RGB = { 1: [24, 110, 190], 2: [214, 120, 10] };
const HEAT_DEEP = { 1: [10, 40, 110], 2: [140, 40, 0] };
function heatImage(h) {
  if (!h?.max) return null;
  const cv = document.createElement('canvas');
  cv.width = h.w; cv.height = h.h;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(h.w, h.h), px = img.data;
  for (let k = 0; k < h.w * h.h; k++) {
    const a = Math.sqrt(h.d[1][k] / h.max), b = Math.sqrt(h.d[2][k] / h.max), sum = a + b;
    if (sum < 0.03) continue;
    const share = a / sum, peak = Math.min(1, Math.max(a, b)), deep = peak * peak;
    for (let c = 0; c < 3; c++) {
      const usa = HEAT_RGB[1][c] + (HEAT_DEEP[1][c] - HEAT_RGB[1][c]) * deep;
      const csa = HEAT_RGB[2][c] + (HEAT_DEEP[2][c] - HEAT_RGB[2][c]) * deep;
      px[k * 4 + c] = usa * share + csa * (1 - share);
    }
    px[k * 4 + 3] = 255 * Math.min(0.72, 0.1 + 0.75 * Math.sqrt(peak));
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
// Contour lines over it, per side, at the same levels its shading steps through
// (image pixels: a cell's value sits at its pixel's centre).
const HEAT_LEVELS = [0.2, 0.45, 0.7];
function heatContours(h) {
  const out = {};
  for (const t of [1, 2]) {
    const path = new Path2D();
    for (const q of HEAT_LEVELS) {
      for (const [a, b, c, d] of isoSegments(h.d[t], h.w, h.h, q * q * h.max)) {
        path.moveTo(a + 0.5, b + 0.5); path.lineTo(c + 0.5, d + 0.5);
      }
    }
    out[t] = path;
  }
  return out;
}
// Segments [x0, y0, x1, y1] in world meters → one path in map pixels.
function mapPath(slug, segs) {
  const path = new Path2D();
  for (const [a, b, c, d] of segs) {
    const p = worldMetersToMapPx(slug, a, b), q = worldMetersToMapPx(slug, c, d);
    if (p && q) { path.moveTo(p.x, p.y); path.lineTo(q.x, q.y); }
  }
  return path;
}
const formatSpan = (s) => (s < 60 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

const HEAT_CELL_M = 10;
const AREA_HOVER_YD = 40;      // hovering the heatmap reads the ground this close to the cursor
const AREA_HOVER_MIN_S = 10;   // ...where somebody spent at least this long, or fell
const FRONT_TRAIL_STEP_S = 30; // a past front line every this many seconds
const FRONT_COLOR = 'rgb(168,24,32)';

// Time-alignment helpers (hmsToSec / roundStartSec / killToReplayTs /
// lastIndexLE) now live in utils/killAlign.js so the analytics modules and the
// viewer share one implementation.

// Props:
//   replay          — parsed replay struct (required; the spine of the view)
//   kills           — optional array of scoreboard kill events (killer/victim/
//                     cause/time/…). When present, the live casualty panel +
//                     kill feed light up, aligned to replay t_s. Absent for a
//                     replay-only round.
//   finalCasualties — optional { usa, csa } round-final totals for the "X / Y".
//   scoreboard      — optional parsed scoreboard object. When present, its
//                     roster/player rows enrich each replay player with an
//                     in-game regiment/company/role + SteamID (surfaced on
//                     hover, in the side panel, and via profile links).
//   resolveRegiment — optional season resolver (steamId, name) → unit label, so
//                     the Tags grouping follows the event's units and pins.
//   teamNames       — optional { 1, 2 } side labels for the round's era;
//                     USA / CSA when omitted.
//   roundEndT       — optional round length in seconds (the round's end in
//                     replay t_s), so the timeline runs to the end of the
//                     round rather than stopping at the last living player.
//   model           — optional round model (roundModelFit.js) for the
//                     Analysis panel's win chance and "this ground" history.
//                     Each app trains its own and passes it in.
//   popStart        — optional server population at the round's start: the win
//                     chance starts from this ground's record at that size.
//   events          — optional round events (parseEventsCsv, the replay's
//                     _events.csv): each side's morale and tickets left and
//                     who is counter-attacking show in the casualties panel,
//                     Onslaught's phase by the ALIVE count, and counter-attacks
//                     and morale changes on the timeline.
/** @param {{ replay: any, kills?: any[] | null, finalCasualties?: any, scoreboard?: any, arty?: any, events?: any[] | null, resolveRegiment?: (steamId: string | null, name: string) => string | null, teamNames?: { 1: string, 2: string }, roundEndT?: number | null, model?: any, popStart?: number | null }} props */
export default function ReplayViewer({
  replay: recorded, kills = null, finalCasualties = null, scoreboard = null, arty = null, events = null,
  resolveRegiment = tagRegimentResolver, teamNames = DEFAULT_TEAM_NAMES, roundEndT = null, model = null, popStart = null,
}) {
  // --- timed kill index: scoreboard kills aligned to replay t_s ---
  // We only include kills that have a parseable time AND a usable round start
  // wallclock. Sorted by ts so live slicing is a single binary search.
  const timedKills = useMemo(() => {
    const rows = alignKills(kills, recorded.meta);
    return { ts: Float32Array.from(rows.map(r => r.ts)), events: rows };
  }, [recorded.meta, kills]);

  // The recording has frames only while someone is on the field; lay them out
  // over the whole round (timeline.js), through the round's end, or at least
  // past the last kill so a death with nothing recorded after it still shows.
  const replay = useMemo(() => {
    const lastKill = timedKills.ts.length ? timedKills.ts[timedKills.ts.length - 1] : -Infinity;
    const endT = Math.max(Number.isFinite(roundEndT) ? roundEndT : -Infinity, lastKill);
    return fillTimeline(recorded, Number.isFinite(endT) ? endT : null);
  }, [recorded, roundEndT, timedKills]);

  // --- core playback state ---
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [followIdx, setFollowIdx] = useState(-1);
  const [playerFilter, setPlayerFilter] = useState('');
  // Which panels are open (casualties, map layers, players, analysis), per browser.
  const panels = usePanels();
  const showPlayers = panels.isOpen('players');

  // Folded side-panel sections (teams, regiments/units, companies), by key.
  // Held here so switching the grouping and back keeps what was folded; while
  // filtering, every match is shown rather than hidden in a folded section.
  const [folded, setFolded] = useState(() => new Set());
  const fold = {
    isOpen: (key) => !!playerFilter || !folded.has(key),
    toggle: (key) => setFolded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    }),
  };

  // --- player directory: replay players ↔ scoreboard roster/steam ---
  const directory = useMemo(
    () => buildPlayerDirectory(replay, scoreboard, resolveRegiment),
    [replay, scoreboard, resolveRegiment],
  );

  // --- side-panel grouping: in-game regiment (default), name tag, or flat by team ---
  const [panelGroupMode, setPanelGroupMode] = useState('regiment');

  // --- proximity grouping overlay ---
  const [groupRange, setGroupRange] = useState(false);
  const [groupRadiusYd, setGroupRadiusYd] = useState(10);
  const [groupScope, setGroupScope] = useState('team'); // 'team' | 'all'

  // --- artillery layer (the round's _arty.csv) ---
  const icons = useIcons();
  const [artyPrefs, setArtyPrefs] = useState(loadArtyPrefs);
  const setArtyPref = (k, v) => setArtyPrefs((p) => {
    const next = { ...p, [k]: v };
    try { localStorage.setItem(ARTY_PREFS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });

  // --- canvas state ---
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [view, setView] = useState({ panX: 0, panY: 0, zoom: 1 });
  const viewInitialized = useRef(false);
  const draggingRef = useRef(null);   // { startX, startY, panX0, panY0 }
  const [hover, setHover] = useState(null); // { idx, x, y } in container-local px
  const [pieceHover, setPieceHover] = useState(null); // { i, x, y }: index into pieceSprites
  const [areaHover, setAreaHover] = useState(null);   // { x, y, sum }: the heatmap ground under the cursor

  // --- map image loading ---
  const mapSlug = replay.meta.mapSlug;
  const mapInfo = mapSlug ? MAPS[mapSlug] : null;
  const [mapImg, setMapImg] = useState(null);
  useEffect(() => {
    if (!mapInfo) { setMapImg(null); return; }
    const img = new Image();
    img.onload  = () => setMapImg(img);
    img.onerror = () => setMapImg(null);
    img.src = `${ASSET_BASE}maps/${mapInfo.file}`;
    return () => { img.onload = null; img.onerror = null; };
  }, [mapInfo?.file]);

  // --- canvas size to container ---
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const ent of entries) {
        const cr = ent.contentRect;
        setCanvasSize({ w: Math.max(200, Math.floor(cr.width)), h: Math.max(200, Math.floor(cr.height)) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- initial view: fit map (or, if no map, frame all sampled positions) ---
  useEffect(() => {
    if (viewInitialized.current) return;
    if (mapImg) {
      const sx = canvasSize.w / mapImg.width;
      const sy = canvasSize.h / mapImg.height;
      const zoom = Math.min(sx, sy) * 0.95;
      setView({ panX: mapImg.width / 2, panY: mapImg.height / 2, zoom });
      viewInitialized.current = true;
    }
  }, [mapImg, canvasSize.w, canvasSize.h]);

  // --- live counters at the current frame ---
  // Walks events up to current t_s, bucketing per team / cause / formation.
  // The kill feed is the trailing N events under current time.
  const FEED_DEPTH = 8;
  const liveStats = useMemo(() => {
    const curTs = replay.frameTimes[frame] || 0;
    const cut = lastIndexLE(timedKills.ts, curTs);
    const byTeam = { 1: 0, 2: 0 };
    const byCause = {};                         // cause → { 1: n, 2: n }
    const byFormation = {};                     // formation → { 1: n, 2: n }
    for (let i = 0; i <= cut; i++) {
      const ev = timedKills.events[i];
      const vt = ev.victimTeam;
      if (vt === 1 || vt === 2) byTeam[vt]++;
      if (ev.cause) {
        if (!byCause[ev.cause]) byCause[ev.cause] = { 1: 0, 2: 0 };
        if (vt === 1 || vt === 2) byCause[ev.cause][vt]++;
      }
      if (ev.victimFormation) {
        if (!byFormation[ev.victimFormation]) byFormation[ev.victimFormation] = { 1: 0, 2: 0 };
        if (vt === 1 || vt === 2) byFormation[ev.victimFormation][vt]++;
      }
    }
    const feed = [];
    for (let i = cut; i >= Math.max(0, cut - FEED_DEPTH + 1); i--) {
      feed.push(timedKills.events[i]);
    }
    return { byTeam, byCause, byFormation, feed, total: cut + 1 };
  }, [frame, replay.frameTimes, timedKills]);

  // --- round state from the _events.csv: morale, tickets, counter-attack, phase ---
  const now = replay.frameTimes[frame] || 0;
  const roundState = useMemo(() => (events?.length ? roundStateAt(events, now) : null), [events, now]);
  const hasObjectives = useMemo(() => !!events?.some((e) => e.event === 'point' || e.event === 'zone'), [events]);
  const hasBounds = useMemo(() => !!events?.some((e) => e.event === 'boundary' || e.event === 'staging'), [events]);
  const objectives = useMemo(() => ((hasObjectives && artyPrefs.objectives) || (hasBounds && artyPrefs.bounds)
    ? objectivesAt(events, now) : null), [hasObjectives, hasBounds, artyPrefs.objectives, artyPrefs.bounds, events, now]);
  // For the timeline: counter-attacks as spans (one still running ends with the
  // recording) and each change of a side's morale after its baseline.
  const eventMarks = useMemo(() => {
    const spans = [], morale = [], open = {}, last = {};
    for (const e of events ?? []) {
      if (e.event === 'counter_attack' && e.team) {
        if (e.value === 'start') open[e.team] = e.t;
        else if (open[e.team] != null) { spans.push({ team: e.team, t0: open[e.team], t1: e.t }); delete open[e.team]; }
      } else if (e.event === 'morale' && e.team) {
        if (last[e.team] != null && last[e.team] !== e.value) morale.push(e);
        last[e.team] = e.value;
      }
    }
    const endT = replay.frameTimes[replay.frameCount - 1] || 0;
    for (const [team, t0] of Object.entries(open)) spans.push({ team: +team, t0, t1: Math.max(t0, endT) });
    return { spans, morale };
  }, [events, replay]);

  // Round-final totals from metadata for the "X / Y" display. Only used when
  // present (older rounds may not have a metadata block).
  const finalTotals = useMemo(() => {
    const usa = finalCasualties ? parseInt(finalCasualties.usa, 10) : NaN;
    const csa = finalCasualties ? parseInt(finalCasualties.csa, 10) : NaN;
    return {
      usa: Number.isFinite(usa) ? usa : null,
      csa: Number.isFinite(csa) ? csa : null,
    };
  }, [finalCasualties]);

  // --- precompute team buckets for the player list ---
  const teamBuckets = useMemo(() => {
    const usa = [], csa = [], other = [];
    replay.players.forEach((p, i) => {
      const entry = { ...p, index: i };
      if (p.team === 1)      usa.push(entry);
      else if (p.team === 2) csa.push(entry);
      else                   other.push(entry);
    });
    const byName = (a, b) => a.name.localeCompare(b.name);
    return { usa: usa.sort(byName), csa: csa.sort(byName), other: other.sort(byName) };
  }, [replay.players]);

  // --- animation loop ---
  // We don't tie playback to the renderer's RAF — playback time advances
  // monotonically by wallclock × speed, then we round to the nearest frame
  // index. That keeps scrub & play in sync without drifting.
  const playStateRef = useRef({ lastWall: 0, virtTimeSec: 0 });
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    playStateRef.current.lastWall = performance.now();
    playStateRef.current.virtTimeSec = replay.frameTimes[frame] || 0;
    const step = (now) => {
      const dtMs = now - playStateRef.current.lastWall;
      playStateRef.current.lastWall = now;
      playStateRef.current.virtTimeSec += (dtMs / 1000) * speed;
      const lastT = replay.frameTimes[replay.frameCount - 1] || 0;
      if (playStateRef.current.virtTimeSec >= lastT) {
        setFrame(replay.frameCount - 1);
        setPlaying(false);
        return;
      }
      setFrame(frameIndexForTime(replay.frameTimes, playStateRef.current.virtTimeSec));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, replay.frameTimes, replay.frameCount]);

  // --- transform helpers ---
  const mapToScreen = useCallback((mx, my) => {
    return {
      x: (canvasSize.w / 2) + (mx - view.panX) * view.zoom,
      y: (canvasSize.h / 2) + (my - view.panY) * view.zoom,
    };
  }, [view, canvasSize.w, canvasSize.h]);

  // Where and when players went down, each with the kill that did it.
  const deaths = useMemo(() => withKills(computeDeaths(replay), timedKills), [replay, timedKills]);
  // The death player `pi` is down from right now, or null while alive.
  const downOf = (pi) => downAt(deaths, replay.players[pi].name, replay.frameTimes[frame] || 0);

  // How the round went (roundAnalysis.js) -- worked out only while its panel is open.
  const analysisOpen = panels.isOpen('analysis');
  const companyLabel = useCallback((i) => {
    const d = directory.details[i];
    return d?.regiment ? `${d.regiment}${d.company ? ` · ${d.company}` : ''}` : null;
  }, [directory]);
  const analysis = useMemo(
    () => (analysisOpen ? analyseRound(replay, timedKills.events, model, companyLabel, events, popStart) : null),
    [analysisOpen, replay, timedKills, model, companyLabel, events, popStart],
  );

  // The ground under the heatmap (roundAnalysis.areaStats): worked out once a
  // heatmap is on; it draws the heatmap and answers hovering it. Each cell's
  // centre is placed on the map art once, for the hover test.
  const heatOn = artyPrefs.heat !== 'off' && !!mapSlug;
  const ground = useMemo(() => {
    if (!heatOn) return null;
    // With a kill log, only the deaths it confirms (a despawn can be a disconnect).
    const fell = timedKills.events.length ? deaths.filter((d) => d.kill) : deaths;
    const stats = areaStats(replay, fell, companyLabel, HEAT_CELL_M);
    const cells = [...stats.cells.values()]
      .map((c) => ({ c, mp: worldMetersToMapPx(mapSlug, c.x + HEAT_CELL_M / 2, c.y + HEAT_CELL_M / 2) }));
    return { stats, cells };
  }, [heatOn, mapSlug, replay, deaths, timedKills, companyLabel]);
  // The picture, and where it sits on the map art: the affine that takes its
  // pixel (i, j) to map pixels, from three points of the world → map transform.
  const heat = useMemo(() => {
    if (!ground) return null;
    const h = heatDensity(ground.stats, artyPrefs.heat, artyPrefs.heat === 'deaths' ? 3.5 : 2);
    const image = heatImage(h);
    if (!image) return null;
    const o = worldMetersToMapPx(mapSlug, h.x0, h.y0);
    const ex = worldMetersToMapPx(mapSlug, h.x0 + h.cellM, h.y0);
    const ey = worldMetersToMapPx(mapSlug, h.x0, h.y0 + h.cellM);
    return { image, contours: heatContours(h), o, ex: { x: ex.x - o.x, y: ex.y - o.y }, ey: { x: ey.x - o.x, y: ey.y - o.y } };
  }, [ground, artyPrefs.heat, mapSlug]);
  // What the ground near map pixel (mx, my) saw (roundAnalysis.areaSummary).
  const groundAt = (mx, my) => {
    const r = (mapPxPerYard(mapSlug) || 0) * AREA_HOVER_YD;
    const sum = areaSummary(ground.stats, ground.cells
      .filter(({ mp }) => mp && (mp.x - mx) ** 2 + (mp.y - my) ** 2 <= r * r).map(({ c }) => c));
    return sum && (sum.s[1] + sum.s[2] >= AREA_HOVER_MIN_S || sum.dead[1] + sum.dead[2]) ? sum : null;
  };

  // The line of contact (roundAnalysis.frontLine) now and every
  // FRONT_TRAIL_STEP_S back over the trail, as map-pixel paths; `age` runs
  // 0 (now) → 1 (oldest). Past lines are kept by frame, so playing only works
  // out the new one.
  const frontCache = useRef(new Map());
  useEffect(() => { frontCache.current = new Map(); }, [replay, mapSlug]);
  const fronts = useMemo(() => {
    if (!artyPrefs.frontLines || !mapSlug) return [];
    const now = replay.frameTimes[frame] || 0, steps = Math.floor((artyPrefs.frontTrailMin * 60) / FRONT_TRAIL_STEP_S);
    const cache = frontCache.current, out = [];
    for (let k = steps; k >= 0; k--) {
      const t = now - k * FRONT_TRAIL_STEP_S;
      if (t < replay.frameTimes[0]) continue;
      const f = k ? frameIndexForTime(replay.frameTimes, t) : frame;
      if (!cache.has(f)) {
        if (cache.size > 400) cache.clear();
        cache.set(f, mapPath(mapSlug, frontLine(replay, f)));
      }
      out.push({ age: k / (steps + 1), path: cache.get(f) });
    }
    return out;
  }, [artyPrefs.frontLines, artyPrefs.frontTrailMin, mapSlug, replay, frame]);

  // Follow a player by name (the analysis rankings list people, not stints):
  // the stint on the field now, else their first.
  const followByName = (name) => {
    const base = frame * replay.playerCount;
    const stints = replay.players.flatMap((p, i) => (p.name === name ? [i] : []));
    const on = stints.find((i) => !Number.isNaN(replay.tracks.x[base + i]));
    if (stints.length) setFollowIdx(on ?? stints[0]);
  };

  // Death markers showing this frame, placed on screen and sized like the mark
  // they replace. Drawing and the hover/click test both use this list, so a
  // faded marker can't be hovered.
  const deathMarks = useMemo(() => {
    if (!artyPrefs.deaths || !mapSlug || !icons.corpse || !icons.corpseOfficer) return [];
    const r = trueRadius((mapPxPerYard(mapSlug) || 0) * YARDS_PER_METER * view.zoom);
    const fade = artyPrefs.deathForever ? Infinity : artyPrefs.deathFadeS;
    const out = [];
    for (const { d, alpha } of deathsAt(deaths, replay.frameTimes[frame] || 0, fade)) {
      const mp = worldMetersToMapPx(mapSlug, d.x, d.y);
      if (!mp) continue;
      const img = d.officer ? icons.corpseOfficer : icons.corpse;
      const h = d.officer ? 2 * starSize(r * artyPrefs.leaderScale) : playerIconSide(r * artyPrefs.playerScale);
      out.push({ d, alpha, img, sp: mapToScreen(mp.x, mp.y), w: h * (img.width / img.height), h });
    }
    return out;
  }, [deaths, artyPrefs.deaths, artyPrefs.deathForever, artyPrefs.deathFadeS, artyPrefs.playerScale,
      artyPrefs.leaderScale, mapSlug, icons.corpse, icons.corpseOfficer, view.zoom, replay.frameTimes, frame, mapToScreen]);

  // Impact -> where the gun that fired it stood (or none), for the shot line.
  const impactSrc = useMemo(() => {
    const m = new Map();
    if (arty) impactSources(arty).forEach((src, i) => { if (src) m.set(arty.impacts[i], src); });
    return m;
  }, [arty]);

  // Guns, caissons and dropped flags on the field this frame, placed on screen.
  // Drawing and the hover test both use this list, so a hidden piece can't be
  // hovered.
  const pieceSprites = useMemo(() => {
    if (!arty || !mapSlug) return [];
    const pxPerM = (mapPxPerYard(mapSlug) || 0) * YARDS_PER_METER * view.zoom;
    const now = replay.frameTimes[frame] || 0;
    const out = [];
    for (const piece of arty.pieces) {
      const style = PIECE_STYLE[piece.kind];
      if (!style || !artyPrefs[style.show]) continue;
      const s = pieceAt(piece, now);
      if (!s) continue;
      if (piece.kind === 'caisson' && artyPrefs.hideEmpty && caissonEmpty(s)) continue;
      const mp = worldMetersToMapPx(mapSlug, s[1], s[2]);
      if (!mp) continue;
      const hd = headingToMapDelta(mapSlug, s[3], s[4]);
      out.push({
        piece, s,
        sp: mapToScreen(mp.x, mp.y),
        ang: hd && Math.hypot(hd.dx, hd.dy) > 1e-4 ? Math.atan2(hd.dx, -hd.dy) : 0,
        h: style.heightPx(pxPerM) * artyPrefs[style.scale],
      });
    }
    return out;
  }, [arty, artyPrefs, mapSlug, view.zoom, replay.frameTimes, frame, mapToScreen]);

  // Nearby-count for a player at the current frame, honoring the scope toggle.
  const nearbyCount = useCallback(
    (idx) => (idx == null || idx < 0)
      ? 0
      : countNearby(replay, frame, idx, groupRadiusYd, { sameTeamOnly: groupScope === 'team' }),
    [replay, frame, groupRadiusYd, groupScope],
  );

  // --- proximity overlay: a DOM circle + count around the hovered player ---
  // Hover only: following someone must not pin the circle on screen for the
  // whole round (their count is on the selected-player card). Drawn as an
  // absolutely-positioned element (not on the canvas) so hover-move doesn't
  // force a full canvas repaint. Radius is projected from yards → map px →
  // screen px via the map's affine scale and the current zoom.
  const groupOverlay = useMemo(() => {
    if (!groupRange || !mapSlug || groupRadiusYd <= 0) return null;
    if (!hover) return null;
    const target = hover.idx;
    const base = frame * replay.playerCount + target;
    const wx = replay.tracks.x[base];
    if (Number.isNaN(wx)) return null;
    const mp = worldMetersToMapPx(mapSlug, wx, replay.tracks.y[base]);
    if (!mp) return null;
    const sp = mapToScreen(mp.x, mp.y);
    const pxPerYard = mapPxPerYard(mapSlug) || 0;
    const rPx = pxPerYard * groupRadiusYd * view.zoom;
    return { x: sp.x, y: sp.y, rPx, count: nearbyCount(target) };
  }, [groupRange, mapSlug, groupRadiusYd, hover, frame, replay, mapToScreen, view.zoom, nearbyCount]);

  // --- follow camera: re-center every frame on the followed player ---
  useEffect(() => {
    if (followIdx < 0 || !mapSlug) return;
    const slot = frame * replay.playerCount + followIdx;
    const wx = replay.tracks.x[slot];
    if (Number.isNaN(wx)) {
      // Swapped side / company mid-round: the same name continues as another
      // entry (see replayParser's stints) -- keep following that one.
      const name = replay.players[followIdx].name;
      const base = frame * replay.playerCount;
      const next = replay.players.findIndex((p, i) => i !== followIdx && p.name === name
                                                   && !Number.isNaN(replay.tracks.x[base + i]));
      if (next >= 0) setFollowIdx(next);
      return;
    }
    const wy = replay.tracks.y[slot];
    const mp = worldMetersToMapPx(mapSlug, wx, wy);
    if (!mp) return;
    setView(v => ({ ...v, panX: mp.x, panY: mp.y }));
  }, [frame, followIdx, mapSlug, replay.playerCount, replay.tracks, replay.players]);

  // --- draw ---
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

    // map image
    if (mapImg) {
      const tl = mapToScreen(0, 0);
      ctx.drawImage(mapImg, tl.x, tl.y, mapImg.width * view.zoom, mapImg.height * view.zoom);
    } else if (mapSlug) {
      ctx.fillStyle = '#9fa2a9';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`Loading map ${mapSlug}…`, 20, 30);
    } else {
      ctx.fillStyle = '#d3814a';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`No map art for "${replay.meta.map}"`, 20, 30);
    }

    if (!mapSlug) return;

    const pxPerM = (mapPxPerYard(mapSlug) || 0) * YARDS_PER_METER * view.zoom;
    const now = replay.frameTimes[frame] || 0;

    // heatmap: the density picture laid on the map art, smoothed as it scales
    if (heat) {
      const o = mapToScreen(heat.o.x, heat.o.y), z = view.zoom;
      ctx.save();
      ctx.setTransform(heat.ex.x * z, heat.ex.y * z, heat.ey.x * z, heat.ey.y * z, o.x, o.y);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(heat.image, 0, 0);
      ctx.lineWidth = 1 / (Math.hypot(heat.ex.x, heat.ex.y) * z);
      ctx.globalAlpha = 0.55;
      for (const t of [1, 2]) { ctx.strokeStyle = `rgb(${HEAT_DEEP[t]})`; ctx.stroke(heat.contours[t]); }
      ctx.restore();
    }

    // the area's outlines, under everything that moves: the playable area's edge (black) and each
    // side's staging area as thin lines, then the capture areas (Skirmish's
    // zone of control) -- the ground the round turns on -- heavier, over a dark backing, with a wash
    if (objectives) {
      const outline = (shape) => {
        const path = new Path2D();
        for (const [k, [x, y]] of shape.entries()) {
          const mp = worldMetersToMapPx(mapSlug, x, y);
          if (!mp) return null;
          const sp = mapToScreen(mp.x, mp.y);
          if (k) path.lineTo(sp.x, sp.y); else path.moveTo(sp.x, sp.y);
        }
        path.closePath();
        return path;
      };
      ctx.save();
      ctx.lineJoin = 'round';
      if (artyPrefs.bounds) {
        for (const [set, color, wash] of [[objectives.boundaries, () => BOUNDARY_RGB, 0], [objectives.staging, (z) => TEAM_RGB[z.team] || OBJECTIVE_NEUTRAL, 0.07]]) {
          for (const z of set) {
            const path = outline(z.shape);
            if (!path) continue;
            const rgb = color(z);
            if (wash) { ctx.fillStyle = `rgba(${rgb},${wash})`; ctx.fill(path); }
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = `rgba(${rgb},0.85)`;
            ctx.stroke(path);
          }
        }
      }
      if (artyPrefs.objectives) {
        for (const z of objectives.zones) {
          const path = outline(z.shape);
          if (!path) continue;
          const rgb = TEAM_RGB[z.team] || OBJECTIVE_NEUTRAL;
          ctx.fillStyle = `rgba(${rgb},0.12)`;
          ctx.fill(path);
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(8,8,8,0.67)';
          ctx.stroke(path);
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = `rgba(${rgb},0.92)`;
          ctx.stroke(path);
        }
      }
      ctx.restore();
    }

    // the line of contact: where it ran (thin, fading), then where it is now
    if (fronts.length) {
      const z = view.zoom;
      ctx.save();
      ctx.setTransform(z, 0, 0, z, canvasSize.w / 2 - view.panX * z, canvasSize.h / 2 - view.panY * z);
      ctx.lineCap = 'round';
      ctx.strokeStyle = FRONT_COLOR;
      for (const { age, path } of fronts) {
        if (age) {
          ctx.globalAlpha = 0.55 * (1 - age);
          ctx.lineWidth = 1.5 / z;
          ctx.stroke(path);
        } else {
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 6 / z;
          ctx.strokeStyle = 'rgb(245,238,220)';
          ctx.stroke(path);
          ctx.globalAlpha = 1;
          ctx.lineWidth = 3 / z;
          ctx.strokeStyle = FRONT_COLOR;
          ctx.stroke(path);
        }
      }
      ctx.restore();
    }

    // guns & caissons at true size, turned to face where they face; dropped flags
    for (const { piece, s, sp, ang, h } of pieceSprites) {
      const img = icons[piece.kind];
      if (!img) continue;
      const w = h * (img.width / img.height);
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(ang);
      ctx.drawImage(tinted(img, pieceTint(piece, s)), -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // impacts: the game's ArtilleryImpact mark, outer ring where the chosen
    // kill chance runs out (25% is the overlay's ring), fading over the window
    if (arty && artyPrefs.impacts && icons.impact) {
      for (const imp of impactsInWindow(arty, now, artyPrefs.fadeS)) {
        const [t, x, y, , kind] = imp;
        const mp = worldMetersToMapPx(mapSlug, x, y);
        if (!mp) continue;
        const sp = mapToScreen(mp.x, mp.y);
        ctx.globalAlpha = 0.2 + 0.8 * (1 - (now - t) / artyPrefs.fadeS);
        // Dotted line back to the gun that fired it, when we can tell.
        const src = artyPrefs.shotLines && impactSrc.get(imp);
        const gp = src && worldMetersToMapPx(mapSlug, src.x, src.y);
        if (gp) {
          const gs = mapToScreen(gp.x, gp.y);
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = 'rgb(43,34,24)';
          ctx.beginPath();
          ctx.moveTo(gs.x, gs.y);
          ctx.lineTo(sp.x, sp.y);
          ctx.stroke();
          ctx.restore();
        }
        const half = Math.max(7, impactRadiusM(kind, artyPrefs.impactKillPct / 100) * pxPerM) * (128 / 121);
        ctx.drawImage(icons.impact, sp.x - half, sp.y - half, half * 2, half * 2);
      }
      ctx.globalAlpha = 1;
    }

    // capture points, under the bodies standing on them (the overlay's glyph): the owner's colour,
    // solid once held and washed out with a white rim while still being taken, an arc for a take
    // under way, and the letter; points not in play (Contention's others) small and dim
    if (objectives && artyPrefs.objectives) {
      for (const p of objectives.points) {
        // Skirmish's point has no HUD letter (it's logged by entity name): its zone is the objective
        if (!p.label || p.label.length > 3) continue;
        const mp = Number.isFinite(p.x) && worldMetersToMapPx(mapSlug, p.x, p.y);
        if (!mp) continue;
        const sp = mapToScreen(mp.x, mp.y), r = p.active ? 11 : 8;
        const rgb = TEAM_RGB[p.team] || OBJECTIVE_NEUTRAL;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, 2 * Math.PI);
        if (p.active) {
          ctx.fillStyle = `rgba(${rgb},${p.held ? 1 : 0.6})`;
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = 'rgba(8,8,8,0.92)';
          ctx.stroke();
          if (!p.held) {
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, r - 1.2, 0, 2 * Math.PI);
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = 'rgba(255,255,255,0.67)';
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.24)';
          ctx.fill();
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = `rgba(${p.team ? rgb : [140, 140, 140]},0.5)`;
          ctx.stroke();
        }
        if (p.pct > 0 && p.pct < 100) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, r + 2.6, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (p.pct / 100));
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.stroke();
        }
        {
          ctx.font = `bold ${p.active ? 12 : 10}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = p.active ? 1 : 0.5;
          ctx.fillStyle = 'rgb(0,0,0)';
          ctx.fillText(p.label, sp.x + 1, sp.y + 1);
          ctx.fillStyle = 'rgb(255,255,255)';
          ctx.fillText(p.label, sp.x, sp.y);
          ctx.globalAlpha = 1;
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }
      }
    }

    const dotR = trueRadius(pxPerM) * artyPrefs.playerScale;
    const leaderR = trueRadius(pxPerM) * artyPrefs.leaderScale;

    // death markers: the game's corpse (crossed sabres for an officer) in the
    // fallen player's team colour, where they were last seen, sized like the
    // mark they replace; until the fade runs out (and they are back on the
    // field), or for good with no fade
    for (const { d, alpha, img, sp, w, h } of deathMarks) {
      ctx.globalAlpha = 0.25 + 0.75 * alpha;
      ctx.drawImage(tinted(img, TEAM_RGB[d.team] || ARTY_NEUTRAL),
                    sp.x - w / 2, sp.y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;

    // players: dots + heading first, then leaders on top so a star or pennant
    // is never buried in a crowd (the overlay's order)
    const P = replay.playerCount;
    const base = frame * P;
    const { x: xs, y: ys, fx: fxs, fy: fys, lk: lks } = replay.tracks;
    const leaders = [];
    for (let pi = 0; pi < P; pi++) {
      const wx = xs[base + pi];
      if (Number.isNaN(wx)) continue;
      const mp = worldMetersToMapPx(mapSlug, wx, ys[base + pi]);
      if (!mp) continue;
      const sp = mapToScreen(mp.x, mp.y);
      const color = TEAM_COLOR[replay.players[pi].team] || '#a3a3a3';
      const rgb = TEAM_RGB[replay.players[pi].team] || [163, 163, 163];
      const kind = leaderOf(lks[base + pi]);
      const mounted = isMounted(lks[base + pi]);
      const isFollowed = pi === followIdx;
      if (kind === LEADER_KIND.OFFICER || kind === LEADER_KIND.FLAG) {
        leaders.push({ sp, color, rgb, kind, mounted, isFollowed });
        continue;
      }
      if (mounted) drawMountedRing(ctx, sp.x, sp.y, dotR);
      const hd = headingToMapDelta(mapSlug, fxs[base + pi], fys[base + pi]);
      const ang = hd && Number.isFinite(hd.dx) && Number.isFinite(hd.dy) && Math.hypot(hd.dx, hd.dy) > 1e-6
        ? Math.atan2(hd.dx, -hd.dy) : 0;
      if (icons.player) drawPlayerIcon(ctx, tinted(icons.player, rgb), sp.x, sp.y, dotR, ang, isFollowed);
      else drawPlayerDot(ctx, sp.x, sp.y, dotR, color, isFollowed);
    }
    for (const l of leaders) {
      if (l.mounted) drawMountedRing(ctx, l.sp.x, l.sp.y, leaderR);
      if (l.kind === LEADER_KIND.FLAG && icons.flag) {
        drawFlagIcon(ctx, tinted(icons.flag, l.rgb), l.sp.x, l.sp.y, leaderR, l.isFollowed);
      } else if (l.kind === LEADER_KIND.FLAG) {
        drawPlayerDot(ctx, l.sp.x, l.sp.y, leaderR, l.color, l.isFollowed);
      } else {
        drawStar(ctx, l.sp.x, l.sp.y, starSize(leaderR), l.color, l.isFollowed);
      }
    }
  }, [frame, view, canvasSize.w, canvasSize.h, mapImg, mapSlug, followIdx,
      replay.playerCount, replay.tracks, replay.players, replay.meta.map, replay.frameTimes,
      arty, artyPrefs, icons, pieceSprites, impactSrc, deathMarks, heat, fronts, objectives]);

  // --- pointer handlers: drag to pan, wheel or pinch to zoom, click / tap to follow ---
  // Zoom by `factor` about screen point (sx, sy), which stays put. Wheel and pinch share it.
  const zoomAt = useCallback((sx, sy, factor) => {
    const cx = canvasSize.w / 2, cy = canvasSize.h / 2;
    setView(v => {
      const zoom = Math.max(0.05, Math.min(8, v.zoom * factor));
      const beforeX = (sx - cx) / v.zoom + v.panX;
      const beforeY = (sy - cy) / v.zoom + v.panY;
      return { panX: beforeX - (sx - cx) / zoom, panY: beforeY - (sy - cy) / zoom, zoom };
    });
  }, [canvasSize.w, canvasSize.h]);
  // Touches down on the canvas, and the two-finger pinch in progress.
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const canvasPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const pinchSpan = () => {
    const [a, b] = [...pointersRef.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, canvasPoint(e));
    if (pointersRef.current.size === 2) {   // second finger: a pinch, not a drag or a tap
      pinchRef.current = pinchSpan();
      draggingRef.current = null;
      return;
    }
    draggingRef.current = {
      startX: e.clientX, startY: e.clientY,
      panX0: view.panX, panY0: view.panY,
      moved: false,
    };
  };
  const onPointerMove = (e) => {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, canvasPoint(e));
    if (pinchRef.current && pointersRef.current.size === 2) {
      const { dist, mid } = pinchSpan();
      if (pinchRef.current.dist > 0) zoomAt(mid.x, mid.y, dist / pinchRef.current.dist);
      pinchRef.current = { dist, mid };
      return;
    }
    const d = draggingRef.current;
    if (d) {
      const dxScreen = e.clientX - d.startX;
      const dyScreen = e.clientY - d.startY;
      if (Math.abs(dxScreen) + Math.abs(dyScreen) > 3) d.moved = true;
      if (d.moved) {
        // Pan: any pan disables follow (otherwise it'd snap back next frame).
        if (followIdx >= 0) setFollowIdx(-1);
        setView(v => ({
          ...v,
          panX: d.panX0 - dxScreen / v.zoom,
          panY: d.panY0 - dyScreen / v.zoom,
        }));
      }
      return;
    }
    // Idle: hit-test for a tooltip target.
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const pick = pickAt(sx, sy);
    if (!pick) {
      if (hover) setHover(null);
    } else if (!hover || hover.idx !== pick.idx || hover.death !== pick.death || hover.x !== sx || hover.y !== sy) {
      setHover({ ...pick, x: sx, y: sy });
    }
    // A player on top wins; otherwise a gun, caisson or dropped flag under the cursor.
    const ph = pick ? -1 : hitTestPiece(sx, sy);
    if (ph < 0) {
      if (pieceHover) setPieceHover(null);
    } else if (!pieceHover || pieceHover.i !== ph || pieceHover.x !== sx || pieceHover.y !== sy) {
      setPieceHover({ i: ph, x: sx, y: sy });
    }
    // Nothing else there: what the ground under the heatmap saw.
    const sum = !pick && ph < 0 && ground
      ? groundAt((sx - canvasSize.w / 2) / view.zoom + view.panX, (sy - canvasSize.h / 2) / view.zoom + view.panY)
      : null;
    if (sum || areaHover) setAreaHover(sum && { x: sx, y: sy, sum });
  };
  const hitTestPiece = (sx, sy) => {
    let best = -1, bestD2 = Infinity;
    pieceSprites.forEach(({ sp, h }, i) => {
      const r = Math.max(10, h / 2);
      const d2 = (sp.x - sx) ** 2 + (sp.y - sy) ** 2;
      if (d2 < r * r && d2 < bestD2) { bestD2 = d2; best = i; }
    });
    return best;
  };
  const onPointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {   // a pinch ends when either finger lifts; no tap, no drag after it
      if (pointersRef.current.size < 2) pinchRef.current = null;
      draggingRef.current = null;
      return;
    }
    const d = draggingRef.current;
    draggingRef.current = null;
    if (!d || d.moved) return;
    // Click without drag: try to hit-test a player.
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const pick = pickAt(sx, sy);
    if (pick) setFollowIdx(pick.idx === followIdx ? -1 : pick.idx);
  };
  // What's under the cursor: a living player on top, else a death marker
  // standing for whoever fell there -- { idx, death } -- or null.
  const pickAt = (sx, sy) => {
    const idx = hitTestPlayer(sx, sy);
    if (idx >= 0) return { idx, death: null };
    const death = hitTestDeath(sx, sy);
    return death && { idx: death.player, death };
  };
  const hitTestDeath = (sx, sy) => {
    let best = null, bestD2 = Infinity;
    for (const { d, sp, w, h } of deathMarks) {
      const r = Math.max(w, h) / 2 + 3;
      const d2 = (sp.x - sx) ** 2 + (sp.y - sy) ** 2;
      if (d2 < r * r && d2 < bestD2) { bestD2 = d2; best = d; }
    }
    return best;
  };
  const hitTestPlayer = (sx, sy) => {
    if (!mapSlug) return -1;
    const P = replay.playerCount;
    const base = frame * P;
    const { x: xs, y: ys } = replay.tracks;
    let best = -1;
    const pxPerM = (mapPxPerYard(mapSlug) || 0) * YARDS_PER_METER * view.zoom;
    const reach = trueRadius(pxPerM) * Math.max(artyPrefs.playerScale, artyPrefs.leaderScale * 1.6) + 3;
    let bestD2 = reach * reach;
    for (let pi = 0; pi < P; pi++) {
      const wx = xs[base + pi];
      if (Number.isNaN(wx)) continue;
      const wy = ys[base + pi];
      const mp = worldMetersToMapPx(mapSlug, wx, wy);
      if (!mp) continue;
      const sp = mapToScreen(mp.x, mp.y);
      const ddx = sp.x - sx, ddy = sp.y - sy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < bestD2) { bestD2 = d2; best = pi; }
    }
    return best;
  };
  // React's synthetic onWheel handlers are passive — preventDefault() is
  // ignored, so the page scrolls underneath us. Wire the native event with
  // { passive: false } and own the zoom logic from there.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoomAt]);

  // --- player list filtering ---
  const filterMatch = (p) => {
    if (!playerFilter) return true;
    return p.name.toLowerCase().includes(playerFilter.toLowerCase());
  };

  // --- jump helpers ---
  const goToFrame = (f) => {
    setFrame(Math.max(0, Math.min(replay.frameCount - 1, f)));
  };
  // The displayed clock counts from the first frame, which fillTimeline puts
  // at the round's start (t_s 0) whenever the recording starts later. The
  // underlying frameTimes stay in real round-time so kill ts → frame mapping
  // continues to line up exactly.
  const baseTime      = replay.frameTimes[0] || 0;
  const totalDuration = (replay.frameTimes[replay.frameCount - 1] || 0) - baseTime;
  const currentTime   = (replay.frameTimes[frame] || 0) - baseTime;

  const followedPlayer = followIdx >= 0 ? replay.players[followIdx] : null;
  const teams = [
    { key: 'usa',   label: teamNames[1], color: TEAM_UI[1], players: teamBuckets.usa },
    { key: 'csa',   label: teamNames[2], color: TEAM_UI[2], players: teamBuckets.csa },
    { key: 'other', label: 'Other', color: 'var(--color-text-2)', players: teamBuckets.other },
  ];
  const presentCount = useMemo(() => {
    const P = replay.playerCount;
    const base = frame * P;
    const xs = replay.tracks.x;
    let n = 0;
    for (let pi = 0; pi < P; pi++) if (!Number.isNaN(xs[base + pi])) n++;
    return n;
  }, [frame, replay.playerCount, replay.tracks.x]);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="label !text-text-1">
          Playback
        </div>
        <div className="text-[11px] text-text-2">
          {recorded.frameCount} frames @ {replay.meta.sampleRateHz} Hz · {replay.playerCount} players
        </div>
        <div className="ml-auto flex items-center gap-2">
          {followedPlayer && (
            <button
              onClick={() => setFollowIdx(-1)}
              className="flex items-center gap-1 px-2 py-1 bg-accent hover:bg-accent text-bg-1 text-xs rounded transition min-w-0"
              title="Stop following"
            >
              <Crosshair className="w-3 h-3 shrink-0" /> Following <span className="wor-name truncate">{followedPlayer.name}</span>
              <X className="w-3 h-3 shrink-0" />
            </button>
          )}
          <button onClick={() => panels.toggle('players')} className="gh !p-1.5" aria-pressed={showPlayers}
                  title={showPlayers ? 'Hide the player list' : 'Show the player list'}>
            {showPlayers ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${showPlayers ? 'md:grid-cols-[1fr_240px]' : ''}`}>
        {/* canvas */}
        <div
          ref={containerRef}
          className="relative bg-bg-0 rounded-lg overflow-hidden border border-border"
          style={{ minHeight: '480px', height: '60vh', touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            className="block cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={(e) => { pointersRef.current.delete(e.pointerId); pinchRef.current = null; draggingRef.current = null; }}
            onPointerLeave={() => { setHover(null); setPieceHover(null); setAreaHover(null); }}
          />
          <div className="absolute top-2 right-2 panel-float text-[11px] px-2 py-1 tabular-nums">
            {presentCount}/{replay.playerCount} <span className="text-text-2">ALIVE</span>
            {roundState?.phase && <> · <span className="font-semibold text-accent">{roundState.phase}</span></>}
          </div>

          {/* Map-layer controls (bottom-left, foldable): deaths, heatmap, artillery, grouping, sizes */}
          <Panel panels={panels} id="layers" title="Map layers" icon={Layers}
                 className="absolute bottom-2 left-2 panel-float text-xs max-h-[46%] overflow-y-auto max-w-[calc(100%-1rem)]">
          <div className="flex flex-col items-start gap-1.5 p-1.5 pt-0">
          <div className="panel-float text-xs px-2 py-1.5">
            <div className="font-semibold mb-1">Heatmap</div>
            <div className="seg">
              {[['off', 'Off'], ['presence', 'Where they stood'], ['deaths', 'Where they fell']].map(([k, label]) => (
                <button key={k} onClick={() => setArtyPref('heat', k)} aria-pressed={artyPrefs.heat === k}>{label}</button>
              ))}
            </div>
            {heatOn && <div className="text-text-2 text-[11px] mt-1">Hover the map for what happened there.</div>}
          </div>
          {(hasObjectives || hasBounds) && (
            <div className="panel-float text-xs px-2 py-1.5 space-y-1">
              {hasObjectives && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={artyPrefs.objectives}
                         onChange={(e) => setArtyPref('objectives', e.target.checked)} className="accent-[var(--color-accent)]" />
                  <span className="font-semibold">Objectives</span>
                </label>
              )}
              {hasBounds && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={artyPrefs.bounds}
                         onChange={(e) => setArtyPref('bounds', e.target.checked)} className="accent-[var(--color-accent)]" />
                  <span className="font-semibold">Out of bounds &amp; staging</span>
                </label>
              )}
            </div>
          )}
          <div className="panel-float text-xs px-2 py-1.5 space-y-1">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={artyPrefs.frontLines}
                     onChange={(e) => setArtyPref('frontLines', e.target.checked)} className="accent-[var(--color-accent)]" />
              <span className="font-semibold">Front lines</span>
            </label>
            {artyPrefs.frontLines && (
              <div className="flex items-center gap-1.5 pl-5">
                <span className="text-text-1">Trail</span>
                <input type="range" min={0} max={10} step={1} value={artyPrefs.frontTrailMin}
                       onChange={(e) => setArtyPref('frontTrailMin', parseInt(e.target.value, 10))}
                       className="w-20 accent-[var(--color-accent)]" title="How far back the faded lines go" />
                <span className="tabular-nums text-text-1 w-10">{artyPrefs.frontTrailMin ? `${artyPrefs.frontTrailMin} min` : 'off'}</span>
              </div>
            )}
          </div>
          <div className="panel-float text-xs px-2 py-1.5 space-y-1">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={artyPrefs.deaths}
                     onChange={(e) => setArtyPref('deaths', e.target.checked)} className="accent-[var(--color-accent)]" />
              <img src={`${ASSET_BASE}icons/corpse.png`} alt="" className="h-3.5 opacity-80" />
              <span className="font-semibold">Deaths</span>
            </label>
            {artyPrefs.deaths && (
              <div className="flex items-center gap-1.5 pl-5">
                <input type="range" min={5} max={300} step={5} value={artyPrefs.deathFadeS}
                       disabled={artyPrefs.deathForever}
                       onChange={(e) => setArtyPref('deathFadeS', parseInt(e.target.value, 10))}
                       className="w-20 accent-[var(--color-accent)] disabled:opacity-40" title="How long a death marker stays" />
                <span className="tabular-nums text-text-1 w-10">{artyPrefs.deathForever ? '—' : `${artyPrefs.deathFadeS} s`}</span>
                <label className="flex items-center gap-1 cursor-pointer select-none text-text-1">
                  <input type="checkbox" checked={artyPrefs.deathForever}
                         onChange={(e) => setArtyPref('deathForever', e.target.checked)} className="accent-[var(--color-accent)]" />
                  Never fade
                </label>
              </div>
            )}
          </div>
          {arty && (
            <div className="panel-float text-xs px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1.5 label">
                <img src={`${ASSET_BASE}icons/impact.png`} alt="" className="w-3.5 h-3.5" /> Artillery
                <span className="text-text-2 normal-case tracking-normal">· {arty.impacts.length} impacts</span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={artyPrefs.impacts}
                       onChange={(e) => setArtyPref('impacts', e.target.checked)} className="accent-[var(--color-accent)]" />
                Impacts
                {artyPrefs.impacts && (
                  <>
                    <input type="range" min={5} max={120} step={5} value={artyPrefs.fadeS}
                           onChange={(e) => setArtyPref('fadeS', parseInt(e.target.value, 10))}
                           className="w-20 accent-[var(--color-accent)]" title="How long an impact stays on the map" />
                    <span className="tabular-nums text-text-1 w-10">{artyPrefs.fadeS} s</span>
                  </>
                )}
              </label>
              {artyPrefs.impacts && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none pl-5 text-text-1">
                  <input type="checkbox" checked={artyPrefs.shotLines}
                         onChange={(e) => setArtyPref('shotLines', e.target.checked)} className="accent-[var(--color-accent)]" />
                  Shot lines to the firing gun
                </label>
              )}
              {artyPrefs.impacts && (
                <div className="flex items-center gap-1.5 pl-5 text-text-1">
                  Ring
                  <input type="range" min={0} max={100} step={1} value={artyPrefs.impactKillPct}
                         onChange={(e) => setArtyPref('impactKillPct', parseInt(e.target.value, 10))}
                         onDoubleClick={() => setArtyPref('impactKillPct', LIKELY_KILL_CHANCE * 100)}
                         className="w-20 accent-[var(--color-accent)]"
                         title={'Kill chance in the open at the ring\'s edge: 100% = certain-kill radius '
                           + '(shell 3 m, case 2 m), 0% = full blast reach (shell 20 m, case 15 m). '
                           + 'Double-click for 25%.'} />
                  <span className="tabular-nums text-text-0 w-8">{artyPrefs.impactKillPct}%</span>
                  <span className="tabular-nums">
                    shell {impactRadiusM(0, artyPrefs.impactKillPct / 100).toFixed(1)} m
                    · case {impactRadiusM(1, artyPrefs.impactKillPct / 100).toFixed(1)} m
                  </span>
                </div>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={artyPrefs.pieces}
                       onChange={(e) => setArtyPref('pieces', e.target.checked)} className="accent-[var(--color-accent)]" />
                Guns &amp; caissons
              </label>
              {artyPrefs.pieces && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none pl-5 text-text-1">
                  <input type="checkbox" checked={artyPrefs.hideEmpty}
                         onChange={(e) => setArtyPref('hideEmpty', e.target.checked)} className="accent-[var(--color-accent)]" />
                  Hide empty caissons
                </label>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={artyPrefs.flags}
                       onChange={(e) => setArtyPref('flags', e.target.checked)} className="accent-[var(--color-accent)]" />
                Dropped flags
              </label>
            </div>
          )}
          <div className="panel-float text-xs px-2 py-1.5">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={groupRange}
                onChange={e => setGroupRange(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              <Users className="w-3.5 h-3.5 text-accent" />
              <span className="font-semibold">Grouping</span>
            </label>
            {groupRange && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={groupRadiusYd}
                    onChange={e => setGroupRadiusYd(parseInt(e.target.value, 10))}
                    className="w-20 accent-[var(--color-accent)]"
                    title="Grouping radius"
                  />
                  <span className="tabular-nums w-10">{groupRadiusYd} yd</span>
                </div>
                <div className="seg">
                  <button onClick={() => setGroupScope('team')} aria-pressed={groupScope === 'team'}
                          title="Count only same-team players">Team</button>
                  <button onClick={() => setGroupScope('all')} aria-pressed={groupScope === 'all'}
                          title="Count all nearby players">All</button>
                </div>
              </div>
            )}
            {groupRange && (
              <div className="mt-1 text-text-2 text-[10px]">Hover or select a player to count their group.</div>
            )}
          </div>
          <details className="panel-float text-xs px-2 py-1.5">
            <summary className="cursor-pointer select-none font-semibold">Icon sizes</summary>
            <div className="mt-1.5 grid grid-cols-[auto_auto_auto] items-center gap-x-2 gap-y-1">
              {[
                ['playerScale', 'Players', 1.5],
                ['leaderScale', 'Officers / flags', 3],
                ...(arty ? [['gunScale', 'Guns', 1.5], ['caissonScale', 'Caissons', 1.5]] : []),
              ].map(([key, label, max]) => (
                <Fragment key={key}>
                  <span className="text-text-1">{label}</span>
                  <input type="range" min={0.4} max={max} step={0.05} value={artyPrefs[key]}
                         onChange={(e) => setArtyPref(key, parseFloat(e.target.value))}
                         onDoubleClick={() => setArtyPref(key, 1)}
                         className="w-24 accent-[var(--color-accent)]" title="1.00x = true size (double-click to reset)" />
                  <span className="tabular-nums w-10">{artyPrefs[key].toFixed(2)}x</span>
                </Fragment>
              ))}
            </div>
          </details>
          </div>
          </Panel>

          {/* Live casualty panel + kill feed (top-left, foldable) */}
          {(timedKills.events.length > 0 || roundState) && (
            <Panel panels={panels} id="casualties" title={`Casualties · ${liveStats.total}`} icon={Skull}
                   className="absolute top-2 left-2 panel-float text-xs max-h-[46%] overflow-y-auto max-w-[min(280px,calc(100%-6rem))]">
                <div className="px-2 pb-2 space-y-2">
                  {/* Per-team totals, with the round state (_events.csv) when there is one */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[[1, finalTotals.usa], [2, finalTotals.csa]].map(([team, final]) => (
                      <TeamBox key={team} label={teamNames[team]} color={TEAM_UI[team]} count={liveStats.byTeam[team]} final={final}
                               state={roundState?.teams[team]} counterAttack={roundState?.counterAttack === team} />
                    ))}
                  </div>

                  {/* By cause */}
                  {Object.keys(liveStats.byCause).length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-1 mb-0.5">By cause</div>
                      <div className="space-y-0.5">
                        {Object.entries(liveStats.byCause)
                          .sort((a, b) => (b[1][1] + b[1][2]) - (a[1][1] + a[1][2]))
                          .map(([cause, counts]) => (
                            <SplitRow key={cause} label={cause} usa={counts[1]} csa={counts[2]} />
                          ))}
                      </div>
                    </div>
                  )}

                  {/* By formation */}
                  {Object.keys(liveStats.byFormation).length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-1 mb-0.5">By formation</div>
                      <div className="space-y-0.5">
                        {Object.entries(liveStats.byFormation)
                          .sort((a, b) => (b[1][1] + b[1][2]) - (a[1][1] + a[1][2]))
                          .map(([form, counts]) => (
                            <SplitRow key={form} label={form} usa={counts[1]} csa={counts[2]} />
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Recent kill feed */}
                  {liveStats.feed.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-1 mb-0.5">Recent kills</div>
                      <div className="space-y-0.5">
                        {liveStats.feed.map((ev, i) => (
                          <KillRow key={`${ev.ts}-${i}`} ev={ev} baseTime={baseTime} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
            </Panel>
          )}
          {/* Proximity grouping circle + count (probes hovered/followed player) */}
          {groupOverlay && (
            <>
              <div
                className="absolute pointer-events-none rounded-full border-2 border-accent/70"
                style={{
                  left: groupOverlay.x - groupOverlay.rPx,
                  top: groupOverlay.y - groupOverlay.rPx,
                  width: groupOverlay.rPx * 2,
                  height: groupOverlay.rPx * 2,
                  background: 'var(--color-accent-soft)',
                }}
              />
              <div
                className="absolute pointer-events-none flex items-center gap-1 bg-accent text-bg-1 text-[11px] font-bold px-1.5 py-0.5 rounded shadow -translate-x-1/2"
                style={{ left: groupOverlay.x, top: groupOverlay.y - groupOverlay.rPx - 20 }}
                title={`${groupOverlay.count} ${groupScope === 'team' ? 'friendly' : ''} within ${groupRadiusYd} yd`.trim()}
              >
                <Users className="w-3 h-3" /> {groupOverlay.count}
              </div>
            </>
          )}
          {areaHover && (() => {
            const { x, y, sum } = areaHover;
            const rPx = (mapPxPerYard(mapSlug) || 0) * AREA_HOVER_YD * view.zoom;
            const total = sum.s[1] + sum.s[2];
            const left = Math.min(x + 14, canvasSize.w - 230);
            const top = Math.min(y + 14, canvasSize.h - 170);
            return (
              <>
                <div className="absolute pointer-events-none rounded-full border border-text-1/60"
                     style={{ left: x - rPx, top: y - rPx, width: rPx * 2, height: rPx * 2 }} />
                <div className="absolute pointer-events-none panel-float px-2 py-1.5 text-xs w-[220px] space-y-1" style={{ left, top }}>
                  <div className="font-semibold">Within {AREA_HOVER_YD} yd</div>
                  {total > 0 && (
                    <div className="flex h-1.5 rounded overflow-hidden" title="Each side's share of the time men spent here">
                      <div style={{ width: `${(100 * sum.s[1]) / total}%`, background: TEAM_UI[1] }} />
                      <div style={{ width: `${(100 * sum.s[2]) / total}%`, background: TEAM_UI[2] }} />
                    </div>
                  )}
                  {[1, 2].map((t) => (
                    <div key={t} className="flex justify-between tabular-nums">
                      <span style={{ color: TEAM_UI[t] }} className="font-semibold">{teamNames[t]}</span>
                      <span>{formatSpan(sum.s[t])} of men · {sum.dead[t]} fell</span>
                    </div>
                  ))}
                  {sum.companies.length > 0 && (
                    <div>
                      <div className="text-text-2 text-[11px]">Held longest by</div>
                      {sum.companies.map((c, i) => (
                        <div key={i} className="flex justify-between gap-2 text-[11px]">
                          <span className="wor-name truncate" style={{ color: TEAM_UI[c.team] }}>{c.name || 'Untagged'}</span>
                          <span className="tabular-nums shrink-0">{formatSpan(c.s)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {Number.isFinite(sum.first) && (
                    <div className="text-text-2 text-[11px] tabular-nums">
                      Occupied {formatTime(sum.first - baseTime)} – {formatTime(sum.last - baseTime)}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
          {pieceHover && pieceSprites[pieceHover.i] && (() => {
            const { piece, s } = pieceSprites[pieceHover.i];
            const left = Math.min(pieceHover.x + 12, canvasSize.w - 200);
            const top  = Math.min(pieceHover.y + 12, canvasSize.h - 80);
            return (
              <div className="absolute pointer-events-none panel-float px-2 py-1 text-xs max-w-[200px]" style={{ left, top }}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <img src={`${ASSET_BASE}icons/${ICON_FILES[piece.kind]}`} alt="" className="h-3.5" />
                  {pieceTitle(piece)}
                </div>
                {piece.kind === 'droppedFlag' ? (() => {
                  const { team, unit } = flagOwner(piece.name);
                  return (
                    <div className="text-[11px] mt-0.5 wor-name" style={{ color: TEAM_UI[team] || 'var(--color-text-1)' }}>
                      {unit}
                    </div>
                  );
                })() : piece.kind === 'gun' ? (
                  <div className="text-[11px] mt-0.5">
                    {s[6] ? <span className="text-accent">Rammed · {ROUND_NAME[s[5]] || 'round'}</span>
                          : s[5] >= 0 ? <span className="text-text-1">{ROUND_NAME[s[5]]} in the barrel</span>
                          : <span className="text-text-2">Unloaded</span>}
                  </div>
                ) : caissonEmpty(s) ? (
                  <div className="text-[11px] mt-0.5 text-text-2">Empty</div>
                ) : (
                  <div className="text-[11px] mt-0.5 tabular-nums flex gap-2">
                    <span>Shell <b>{s[7]}</b></span><span>Case <b>{s[8]}</b></span><span>Canister <b>{s[9]}</b></span>
                  </div>
                )}
              </div>
            );
          })()}
          {hover && (() => {
            const p = replay.players[hover.idx];
            const detail = directory.details[hover.idx] || {};
            const color = TEAM_UI[p.team] || 'var(--color-text-2)';
            const regiment = detail.regiment || (detail.tagRegiment && detail.tagRegiment !== UNTAGGED ? detail.tagRegiment : null);
            const down = hover.death || downOf(hover.idx);
            const near = groupRange && !down ? nearbyCount(hover.idx) : null;
            // Clamp inside the container so the tooltip doesn't clip off-screen.
            const left = Math.min(hover.x + 12, canvasSize.w - 220);
            const top  = Math.min(hover.y + 12, canvasSize.h - 112);
            return (
              <div
                className="absolute pointer-events-none panel-float px-2 py-1 text-xs max-w-[220px]"
                style={{ left, top }}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="truncate wor-name">{p.name}</span>
                  <LevelBadge level={detail.level} size={20} />
                </div>
                <div className="text-text-1 text-[10px]">
                  {playerSubtitle(replay, frame, hover.idx, teamNames)}
                </div>
                {regiment && (
                  <div className="text-[10px] mt-0.5">
                    <span className="text-accent wor-name">{regiment}</span>
                    {detail.company && <span className="text-text-1"> · {detail.company}</span>}
                  </div>
                )}
                {detail.role && <div className="text-text-1 text-[10px]">{detail.role}</div>}
                {down && <DeathLine death={down} className="text-[10px] mt-0.5" />}
                {near != null && (
                  <div className="text-[10px] mt-0.5 flex items-center gap-1 text-accent">
                    <Users className="w-3 h-3" /> {near} {groupScope === 'team' ? 'friendly' : 'nearby'} within {groupRadiusYd} yd
                  </div>
                )}
                {detail.steamId && <div className="text-text-2 text-[10px] mt-0.5">Click to select · Steam link in panel</div>}
              </div>
            );
          })()}
        </div>

        {/* player list (hideable: the map takes the room) */}
        {showPlayers && (
        <div className="inset p-2 flex flex-col" style={{ height: '60vh', minHeight: '480px' }}>
          {/* selected (followed) player detail card */}
          {followedPlayer && (
            <SelectedPlayerCard
              player={followedPlayer}
              detail={directory.details[followIdx]}
              color={TEAM_UI[followedPlayer.team] || 'var(--color-text-2)'}
              subtitle={playerSubtitle(replay, frame, followIdx, teamNames)}
              death={downOf(followIdx)}
              nearby={groupRange && !downOf(followIdx) ? nearbyCount(followIdx) : null}
              groupScope={groupScope}
              groupRadiusYd={groupRadiusYd}
              onClear={() => setFollowIdx(-1)}
            />
          )}
          <div className="flex items-center gap-1.5 mb-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-2" />
              <input
                type="text"
                value={playerFilter}
                onChange={e => setPlayerFilter(e.target.value)}
                placeholder="Filter…"
                className="w-full pl-7 pr-2 py-1 text-xs inset text-text-0 focus:outline-none focus:border-accent"
              />
            </div>
            <div className="seg shrink-0">
              <button onClick={() => setPanelGroupMode('regiment')} aria-pressed={panelGroupMode === 'regiment'}
                      title="Group by in-game regiment">Regt</button>
              <button onClick={() => setPanelGroupMode('tag')} aria-pressed={panelGroupMode === 'tag'}
                      title="Group by the event’s units, falling back to the tag in player names">Units</button>
              <button onClick={() => setPanelGroupMode('team')} aria-pressed={panelGroupMode === 'team'}
                      title="Flat list per team">Team</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {teams.map(t => {
              const entries = t.players.filter(filterMatch);
              if (!entries.length) return null;
              return panelGroupMode !== 'team' ? (
                <RegimentTeamSection
                  key={t.key}
                  fold={fold}
                  by={panelGroupMode}
                  team={t}
                  entries={entries}
                  directory={directory}
                  followIdx={followIdx}
                  onPick={setFollowIdx}
                  frame={frame}
                  replay={replay}
                />
              ) : (
                <PlayerGroup
                  key={t.key}
                  fold={fold}
                  team={t}
                  players={entries}
                  followIdx={followIdx}
                  onPick={setFollowIdx}
                  frame={frame}
                  replay={replay}
                  directory={directory}
                />
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* timeline + transport */}
      <div className="mt-3 flex items-center gap-2 flex-wrap sm:flex-nowrap">
        <button
          onClick={() => setPlaying(p => !p)}
          className="p-2 bg-accent hover:bg-accent text-bg-1 rounded transition"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={() => goToFrame(frame - Math.round(replay.meta.sampleRateHz * 5))}
          className="gh !p-2"
          title="Back 5s"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={() => goToFrame(frame + Math.round(replay.meta.sampleRateHz * 5))}
          className="gh !p-2"
          title="Forward 5s"
        >
          <SkipForward className="w-4 h-4" />
        </button>
        <div className="relative flex-1 min-w-[10rem] flex items-center">
          <input
            type="range"
            min={0}
            max={Math.max(0, replay.frameCount - 1)}
            step={1}
            value={frame}
            onChange={e => goToFrame(parseInt(e.target.value, 10))}
            className="w-full accent-[var(--color-accent)]"
          />
          {/* artillery impacts on the timeline: click one to jump there */}
          {arty && artyPrefs.impacts && totalDuration > 0 && arty.impacts.map(([t, , , , kind], i) => (
            <button
              key={i}
              onClick={() => goToFrame(frameIndexForTime(replay.frameTimes, t))}
              className="absolute -top-2 w-[3px] h-2 -translate-x-1/2 bg-csa/70 hover:bg-accent"
              style={{ left: `${((t - baseTime) / totalDuration) * 100}%` }}
              title={`${impactLabel(kind)} · ${formatTime(t - baseTime)}`}
            />
          ))}
          {/* round events below it: counter-attacks as spans, morale changes as ticks */}
          {totalDuration > 0 && eventMarks.spans.map(({ team, t0, t1 }) => (
            <button
              key={`ca${team}-${t0}`}
              onClick={() => goToFrame(frameIndexForTime(replay.frameTimes, t0))}
              className="absolute -bottom-1 h-1 rounded-sm opacity-60 hover:opacity-100"
              style={{
                left: `${((t0 - baseTime) / totalDuration) * 100}%`,
                width: `${Math.max(0.3, ((t1 - t0) / totalDuration) * 100)}%`,
                background: TEAM_UI[team],
              }}
              title={`${teamNames[team]} counter-attack · ${formatTime(t0 - baseTime)}–${formatTime(t1 - baseTime)}`}
            />
          ))}
          {totalDuration > 0 && eventMarks.morale.map(({ t, team, value }) => (
            <button
              key={`m${team}-${t}`}
              onClick={() => goToFrame(frameIndexForTime(replay.frameTimes, t))}
              className="absolute -bottom-2 w-[3px] h-2 -translate-x-1/2 hover:!bg-accent"
              style={{ left: `${((t - baseTime) / totalDuration) * 100}%`, background: TEAM_UI[team] }}
              title={`${teamNames[team]} ${spaced(value)} · ${formatTime(t - baseTime)}`}
            />
          ))}
        </div>
        <div className="text-xs text-text-0 tabular-nums w-24 text-right">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>
        <div className="seg">
          {PLAYBACK_SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} className="!px-2 !py-1" aria-pressed={speed === s}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* how the round went: win chance, this ground, companies, flags, distance */}
      <Panel panels={panels} id="analysis" title="Analysis" icon={Activity} className="mt-3 inset text-xs">
        {analysis && (
          <AnalysisPanel
            analysis={analysis}
            model={model}
            now={now}
            events={events}
            counterAttacks={eventMarks.spans}
            endT={replay.frameTimes[replay.frameCount - 1] || 0}
            onSeek={(t) => goToFrame(frameIndexForTime(replay.frameTimes, t))}
            onPickPlayer={followByName}
            teamNames={teamNames}
            teamUi={TEAM_UI}
            formatTime={formatTime}
          />
        )}
      </Panel>
    </div>
  );
}

// A section header that folds what is under it.
function Fold({ fold, id, header, className = '', style, children }) {
  const open = fold.isOpen(id);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        type="button"
        onClick={() => fold.toggle(id)}
        aria-expanded={open}
        className={`w-full flex items-center gap-1.5 text-left hover:bg-bg-2 ${className}`}
        style={style}
      >
        <Chevron className="w-3 h-3 shrink-0" />
        {header}
      </button>
      {open && children}
    </div>
  );
}

function TeamHeader({ team, count }) {
  return (
    <>
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: team.color }} />
      {team.label} ({count})
    </>
  );
}

function PlayerList({ entries, team, directory, showCompany = false, ...row }) {
  return (
    <div className="space-y-0.5">
      {entries.map(p => (
        <PlayerRow
          key={p.index}
          entry={p}
          detail={directory?.details[p.index]}
          color={team.color}
          showCompany={showCompany}
          {...row}
        />
      ))}
    </div>
  );
}

function PlayerGroup({ fold, team, players, followIdx, onPick, frame, replay, directory }) {
  if (players.length === 0) return null;
  return (
    <Fold
      fold={fold} id={`team:${team.key}`}
      header={<TeamHeader team={team} count={players.length} />}
      className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: team.color }}
    >
      <PlayerList entries={players} team={team} directory={directory}
                  followIdx={followIdx} onPick={onPick} frame={frame} replay={replay} />
    </Fold>
  );
}

// One team's players grouped by regiment ("Regt": the in-game regiment, split
// again by company) or by the event's units ("Units"). Every level folds.
function RegimentTeamSection({ fold, by, team, entries, directory, followIdx, onPick, frame, replay }) {
  const groups = groupEntriesByRegiment(entries, directory.details, by);
  const row = { followIdx, onPick, frame, replay };
  return (
    <Fold
      fold={fold} id={`team:${team.key}`}
      header={<TeamHeader team={team} count={entries.length} />}
      className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: team.color }}
    >
      <div className="space-y-1.5">
        {groups.map(g => {
          const id = `${by}:${team.key}:${g.regiment}`;
          const name = g.regiment === UNTAGGED ? (by === 'tag' ? 'Untagged' : 'Unknown regiment') : g.regiment;
          const companies = by === 'regiment' ? groupEntriesByCompany(g.entries, directory.details) : null;
          return (
            <Fold
              key={g.regiment} fold={fold} id={id} className="px-1 py-0.5 text-[11px]"
              header={(
                <>
                  <span className="font-semibold text-text-0 truncate wor-name" title={g.regiment}>{name}</span>
                  <span className="text-text-2 tabular-nums">{g.count}</span>
                  {!companies && g.companies.length > 0 && (
                    <span className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                      {g.companies.map(c => (
                        <span key={c.company} className="text-[10px] text-text-1 bg-bg-2 rounded px-1 tabular-nums" title={`${c.company}: ${c.count}`}>
                          {shortCompany(c.company)} {c.count}
                        </span>
                      ))}
                    </span>
                  )}
                </>
              )}
            >
              <div className="pl-1 border-l border-border ml-1 space-y-1">
                {companies && companies.some(c => c.company) ? companies.map(c => (
                  <Fold
                    key={c.company ?? '-'} fold={fold} id={`${id}:${c.company ?? '-'}`}
                    className="px-1 py-0.5 text-[10px] uppercase tracking-wide text-text-1"
                    header={(
                      <>
                        <span className="truncate">{c.company ?? 'No company'}</span>
                        <span className="text-text-2 tabular-nums">{c.entries.length}</span>
                      </>
                    )}
                  >
                    <div className="pl-1 border-l border-border ml-1">
                      <PlayerList entries={c.entries} team={team} directory={directory} {...row} />
                    </div>
                  </Fold>
                )) : (
                  <PlayerList entries={g.entries} team={team} directory={directory} showCompany={!companies} {...row} />
                )}
              </div>
            </Fold>
          );
        })}
      </div>
    </Fold>
  );
}

// A single player row: leader glyph, name, optional company chip, and a Steam
// profile link when a SteamID resolved. The row itself toggles follow; the
// Steam link is a separate anchor so it doesn't hijack the follow click.
function PlayerRow({ entry, detail, color, frame, replay, followIdx, onPick, showCompany = false }) {
  const P = replay.playerCount;
  const alive = !Number.isNaN(replay.tracks.x[frame * P + entry.index]);
  const isFollowed = entry.index === followIdx;
  const steam = detail?.steamId ? steamProfileUrl(detail.steamId) : null;
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPick(isFollowed ? -1 : entry.index)}
        className={`flex-1 min-w-0 text-left text-xs px-1.5 py-0.5 rounded flex items-center gap-1.5 transition ${
          isFollowed ? 'bg-accent text-bg-1' :
          alive       ? 'text-text-0 hover:bg-bg-2' :
                        'text-text-2 hover:bg-bg-2'
        }`}
        title={entry.name}
      >
        <LeaderGlyph kind={leaderKindForFrame(replay, frame, entry.index)} color={color} />
        <span className="truncate wor-name">{entry.name}</span>
        {showCompany && detail?.company && (
          <span className={`ml-auto shrink-0 text-[10px] rounded px-1 tabular-nums ${isFollowed ? 'bg-bg-1/15' : 'bg-bg-2 text-text-1'}`}>
            {shortCompany(detail.company)}
          </span>
        )}
      </button>
      {steam && <SteamLink url={steam} />}
    </div>
  );
}

function SteamLink({ url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={e => e.stopPropagation()}
      className="shrink-0 p-1 rounded text-text-2 hover:text-accent hover:bg-bg-2 transition"
      title="Open Steam profile"
    >
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

// Detail card for the currently-followed player, shown atop the side panel.
function SelectedPlayerCard({ player, detail, color, subtitle, death, nearby, groupScope, groupRadiusYd, onClear }) {
  const d = detail || {};
  const regiment = d.regiment || (d.tagRegiment && d.tagRegiment !== UNTAGGED ? d.tagRegiment : null);
  const steam = d.steamId ? steamProfileUrl(d.steamId) : null;
  return (
    <div className="mb-2 rounded border border-border bg-bg-2/60 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Crosshair className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="font-semibold text-sm truncate wor-name" title={player.name}>{player.name}</span>
        <LevelBadge level={d.level} size={24} />
        <button onClick={onClear} className="ml-auto shrink-0 text-text-2 hover:text-text-0" title="Stop following">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="text-[11px] text-text-1 mt-0.5">
        <span style={{ color }}>{subtitle}</span>
      </div>
      {(regiment || d.role) && (
        <div className="text-[11px] mt-0.5 leading-snug">
          {regiment && (
            <div>
              <span className="text-accent wor-name">{regiment}</span>
              {d.company && <span className="text-text-1"> · {d.company}</span>}
            </div>
          )}
          {d.role && <div className="text-text-1">{d.role}</div>}
        </div>
      )}
      {death && <DeathLine death={death} className="text-[11px] mt-1" />}
      {nearby != null && (
        <div className="text-[11px] mt-1 flex items-center gap-1 text-accent">
          <Users className="w-3 h-3" /> {nearby} {groupScope === 'team' ? 'friendly' : 'nearby'} within {groupRadiusYd} yd
        </div>
      )}
      {steam ? (
        <a
          href={steam}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent"
        >
          <ExternalLink className="w-3 h-3" /> Steam profile
        </a>
      ) : (
        <div className="mt-1.5 text-[10px] text-text-2">No SteamID (attach a scoreboard with a roster)</div>
      )}
    </div>
  );
}

// A side's losses so far, and -- from the round events -- its morale, tickets
// left and whether it is counter-attacking.
function TeamBox({ label, color, count, final, state = null, counterAttack = false }) {
  return (
    <div className="bg-bg-1/90 border rounded px-1.5 py-1" style={{ borderColor: counterAttack ? color : 'var(--color-border)' }}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="font-bold text-sm tabular-nums" style={{ color }}>
        {count}
        {final != null && <span className="text-text-2 text-[10px] font-normal"> / {final}</span>}
      </div>
      {state?.morale && <div className="text-[10px] text-text-1">{spaced(state.morale)}</div>}
      {state?.tickets != null && (
        <div className="text-[10px] text-text-1 tabular-nums" title="Tickets left">
          {Math.round(state.tickets)} tickets{state.pct != null && ` · ${Math.round(state.pct)}%`}
        </div>
      )}
      {counterAttack && (
        <div className="mt-0.5 inline-block rounded px-1 text-[9px] font-bold uppercase tracking-wide text-bg-1" style={{ background: color }}>
          Counter-attack
        </div>
      )}
    </div>
  );
}

function SplitRow({ label, usa, csa }) {
  return (
    <div className="flex items-center gap-1 text-[11px] tabular-nums">
      <span className="flex-1 truncate" title={label}>{label}</span>
      <span className="text-usa w-5 text-right">{usa || ''}</span>
      <span className="text-text-1">/</span>
      <span className="text-csa w-5 text-left">{csa || ''}</span>
    </div>
  );
}

// How a downed player fell -- killer, weapon, and their formation at that
// moment -- from the matched scoreboard kill; just "Down" with none to match.
function DeathLine({ death, className = '' }) {
  const k = death.kill;
  return (
    <div className={`flex items-start gap-1 text-text-1 ${className}`}>
      <Skull className="w-3 h-3 mt-px shrink-0 text-accent" />
      {k ? (
        <span className="min-w-0">
          Killed by{' '}
          <span className="wor-name" style={{ color: TEAM_UI[k.killerTeam] || 'var(--color-text-2)' }}>
            {k.killer || '(environment)'}
          </span>
          {k.cause && ` · ${k.cause}`}
          {k.victimFormation && ` · ${FORMATION_LABEL[k.victimFormation] || k.victimFormation}`}
        </span>
      ) : <span>Down</span>}
    </div>
  );
}

function KillRow({ ev, baseTime = 0 }) {
  const killerColor = TEAM_UI[ev.killerTeam] || 'var(--color-text-2)';
  const victimColor = TEAM_UI[ev.victimTeam] || 'var(--color-text-2)';
  const killer = ev.killer || '(environment)';
  return (
    <div className="text-[11px] flex items-center gap-1 leading-tight">
      <span className="text-text-2 tabular-nums shrink-0" title={ev.time || ''}>
        {formatRoundTime(ev.ts - baseTime)}
      </span>
      <span className="truncate wor-name" style={{ color: killerColor }} title={killer}>{killer}</span>
      <span className="text-text-2 shrink-0">►</span>
      <span className="truncate wor-name" style={{ color: victimColor }} title={ev.victim}>{ev.victim}</span>
      {ev.cause && <span className="text-text-2 text-[10px] shrink-0">·{ev.cause}</span>}
    </div>
  );
}

// Same M:SS format the main timeline uses. Negative ts (pre-recording kills)
// shouldn't happen in practice — the matcher slices to ts <= current frame —
// but we clamp anyway so a stray "−0:03" doesn't show up.
function formatRoundTime(ts) {
  if (!Number.isFinite(ts) || ts < 0) return '—:—';
  const s = Math.floor(ts);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function leaderKindForFrame(replay, frame, pi) {
  const base = frame * replay.playerCount;
  if (Number.isNaN(replay.tracks.x[base + pi])) return -1;
  return leaderOf(replay.tracks.lk[base + pi]);
}

function LeaderGlyph({ kind, color }) {
  if (kind === LEADER_KIND.OFFICER) {
    return <span style={{ color }} className="text-sm leading-none">★</span>;
  }
  if (kind === LEADER_KIND.FLAG) {
    return <span style={{ color }} className="text-sm leading-none">⚑</span>;
  }
  return <span style={{ color }} className="text-sm leading-none">●</span>;
}

// --- player mark renderers: ports of the overlay's ImGui drawing ---

function drawMountedRing(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = 'rgba(10,10,10,0.78)';
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgb(255,225,120)';
  ctx.stroke();
}

// Team disc with a thin dark rim. The followed player gets a white rim
// (the replay's own addition -- the overlay has no follow mode).
function drawPlayerDot(ctx, x, y, r, color, highlight) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = highlight ? 2 : 1.2;
  ctx.strokeStyle = highlight ? '#ffffff' : 'rgba(10,10,10,0.78)';
  ctx.stroke();
}

// player.png, already tinted: its round end sits on the player at radius r,
// and the image's up -- the teardrop's tip, the heading -- is turned by `ang`.
function drawPlayerIcon(ctx, img, x, y, r, ang, highlight) {
  const side = playerIconSide(r);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.drawImage(img, -side / 2, -PLAYER_DISC_CY * side, side, side);
  ctx.restore();
  if (highlight) drawFollowRing(ctx, x, y, r + 1);
}

// The game's Flag.dds, already tinted, on a 3.2 r square.
function drawFlagIcon(ctx, img, x, y, r, highlight) {
  const h = flagIconHalf(r);
  ctx.drawImage(img, x - h, y - h, h * 2, h * 2);
  if (highlight) drawFollowRing(ctx, x, y, h);
}

// The followed player's white rim (the replay's own addition -- the overlay
// has no follow mode).
function drawFollowRing(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

// Officer: 5-point star, points at `size`, inner radius 0.42·size.
function drawStar(ctx, x, y, size, color, highlight) {
  ctx.lineWidth = highlight ? 2 : 1.4;
  ctx.strokeStyle = highlight ? '#ffffff' : 'rgba(8,8,8,0.92)';
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const ang = -Math.PI / 2 + k * (Math.PI / 5);
    const rad = k & 1 ? size * 0.42 : size;
    const vx = x + Math.cos(ang) * rad, vy = y + Math.sin(ang) * rad;
    if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
