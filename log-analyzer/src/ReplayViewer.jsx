import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, X, Crosshair, Search, ChevronDown, ChevronUp,
  Skull, ExternalLink, Users,
} from 'lucide-react';
import { MAPS, worldMetersToMapPx, headingToMapDelta, mapPxPerYard, YARDS_PER_METER } from './utils/mapCalibration.js';
import { LEADER_KIND, BRANCH, leaderOf, isMounted } from './utils/replayParser.js';
import { pieceAt, impactsInWindow, impactFalloffM, impactLabel } from './utils/artyParser.js';
import { roundStartSec, killToReplayTs, lastIndexLE } from './utils/killAlign.js';
import {
  buildPlayerDirectory, steamProfileUrl, shortCompany, groupEntriesByRegiment,
} from './analytics/playerDirectory.js';
import { countNearby } from './analytics/proximity.js';
import { UNTAGGED } from './stats/regimentMatcher';

// USA = team 1 = blue, CSA = team 2 = amber -- the season tracker's faction
// pair (colour-blind safe), in its light-theme shade because the dots sit on
// the parchment map whichever theme the page is in. Hard-coded -- replay is a
// god-view (not a player POV), so friend/foe inversion doesn't apply.
const TEAM_COLOR = {
  1: '#1a6493',
  2: '#b06a0a',
};
// The same pair for page text, from the active theme (the map shades above
// are too dark to read on the dark theme's surfaces).
const TEAM_UI = { 1: 'var(--usa)', 2: 'var(--csa)' };
const TEAM_NAME  = { 1: 'USA', 2: 'CSA' };

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8];

// Pixel size of player icons at zoom = 1. Scaled visually with zoom but
// floored so they stay clickable when zoomed way out.
// Player marks, exactly as the overlay's full map draws them
// (wor_overlay/mod/map_view.cpp player_dot_radius / draw_player_dot /
// draw_heading_triangle / draw_leader_glyph / draw_mounted_ring): a dot at
// the soldier's true 0.42 m physics radius, floored so it stays visible when
// zoomed out; officers and flag bearers as fixed-size star / pennant.
const SOLDIER_RADIUS_M = 0.42;
const DOT_FLOOR_PX = 3;
const OFFICER_PX = 8;
const FLAG_PX = 7.5;
const playerDotRadius = (pxPerM) => Math.max(SOLDIER_RADIUS_M * pxPerM, DOT_FLOOR_PX);

// The overlay's own map art (wor_overlay/assets/maps): the game's tileable-map
// pieces, so the replay's artillery reads like the in-game map and the overlay.
const ICON_FILES = { impact: 'impact.png', gun: 'gun.png', caisson: 'caisson.png' };

const BRANCH_NAME = {
  [BRANCH.INFANTRY]: 'Infantry', [BRANCH.ARTILLERY]: 'Artillery', [BRANCH.CAVALRY]: 'Cavalry',
};

// "USA · Cavalry · Officer · Mounted" -- whatever of it is known this frame.
function playerSubtitle(replay, frame, pi) {
  const p = replay.players[pi];
  const kind = leaderKindForFrame(replay, frame, pi);
  const slot = frame * replay.playerCount + pi;
  return [
    TEAM_NAME[p.team] || `Team ${p.team}`,
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
      img.src = `assets/icons/${file}`;
    }
    return () => { alive = false; };
  }, []);
  return icons;
}

// Real footprints (overlay: physics AABBs measured 2026-09-26), metres.
const PIECE_LEN_M = { gun: 4.0, caisson: 5.0 };

// Arty layer settings, remembered per browser.
const ARTY_PREFS_KEY = 'woraat-arty';
function loadArtyPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(ARTY_PREFS_KEY) || '{}');
    return {
      impacts: p.impacts !== false,
      pieces: p.pieces !== false,
      hideEmpty: p.hideEmpty === true,
      fadeS: Number.isFinite(p.fadeS) ? Math.min(120, Math.max(5, p.fadeS)) : 30,
    };
  } catch {
    return { impacts: true, pieces: true, hideEmpty: false, fadeS: 30 };
  }
}

// Track sample fields (utils/artyParser): [t, x, y, fx, fy, round, loaded, shell, case, canister]
const ROUND_NAME = ['Shell', 'Case', 'Canister'];
const caissonEmpty = (s) => s[7] + s[8] + s[9] === 0;
function pieceTitle(piece) {
  const cal = piece.model === '12pdr' ? '12-pdr Napoleon' : piece.model === '10pdr' ? '10-pdr' : '';
  return `${cal} ${piece.kind === 'gun' ? 'gun' : 'caisson'}`.trim();
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
export default function ReplayViewer({ replay, kills = null, finalCasualties = null, scoreboard = null, arty = null }) {
  // --- core playback state ---
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [followIdx, setFollowIdx] = useState(-1);
  const [playerFilter, setPlayerFilter] = useState('');
  const [feedCollapsed, setFeedCollapsed] = useState(false);

  // --- player directory: replay players ↔ scoreboard roster/steam ---
  const directory = useMemo(
    () => buildPlayerDirectory(replay, scoreboard),
    [replay, scoreboard],
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

  // --- map image loading ---
  const mapSlug = replay.meta.mapSlug;
  const mapInfo = mapSlug ? MAPS[mapSlug] : null;
  const [mapImg, setMapImg] = useState(null);
  useEffect(() => {
    if (!mapInfo) { setMapImg(null); return; }
    const img = new Image();
    img.onload  = () => setMapImg(img);
    img.onerror = () => setMapImg(null);
    img.src = `assets/maps/${mapInfo.file}`;
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

  // --- timed kill index: scoreboard kills aligned to replay t_s ---
  // We only include kills that have a parseable time AND a usable round start
  // wallclock. Sorted by ts so live slicing is a single binary search.
  const timedKills = useMemo(() => {
    const startSec = roundStartSec(replay.meta);
    if (startSec == null || !kills) return { ts: new Float32Array(0), events: [] };
    const rows = [];
    for (const k of kills) {
      // killLog rows have `time`; non-killLog rounds carry empty objects.
      if (!k.time) continue;
      const ts = killToReplayTs(k.time, startSec);
      if (ts == null) continue;
      rows.push({ ts, ...k });
    }
    rows.sort((a, b) => a.ts - b.ts);
    return { ts: Float32Array.from(rows.map(r => r.ts)), events: rows };
  }, [replay.meta, kills]);

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

  // Guns & caissons on the field this frame, placed on screen. Drawing and the
  // hover test both use this list, so a hidden piece can't be hovered.
  const pieceSprites = useMemo(() => {
    if (!arty || !artyPrefs.pieces || !mapSlug) return [];
    const pxPerM = (mapPxPerYard(mapSlug) || 0) * YARDS_PER_METER * view.zoom;
    const now = replay.frameTimes[frame] || 0;
    const out = [];
    for (const piece of arty.pieces) {
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
        h: Math.max(16, PIECE_LEN_M[piece.kind] * pxPerM),
      });
    }
    return out;
  }, [arty, artyPrefs.pieces, artyPrefs.hideEmpty, mapSlug, view.zoom, replay.frameTimes, frame, mapToScreen]);

  // Nearby-count for a player at the current frame, honoring the scope toggle.
  const nearbyCount = useCallback(
    (idx) => (idx == null || idx < 0)
      ? 0
      : countNearby(replay, frame, idx, groupRadiusYd, { sameTeamOnly: groupScope === 'team' }),
    [replay, frame, groupRadiusYd, groupScope],
  );

  // --- proximity overlay: a DOM circle + count around the probed player ---
  // The probe is whoever is hovered, else the followed player. Drawn as an
  // absolutely-positioned element (not on the canvas) so hover-move doesn't
  // force a full canvas repaint. Radius is projected from yards → map px →
  // screen px via the map's affine scale and the current zoom.
  const groupOverlay = useMemo(() => {
    if (!groupRange || !mapSlug || groupRadiusYd <= 0) return null;
    const target = hover ? hover.idx : (followIdx >= 0 ? followIdx : -1);
    if (target < 0) return null;
    const base = frame * replay.playerCount + target;
    const wx = replay.tracks.x[base];
    if (Number.isNaN(wx)) return null;
    const mp = worldMetersToMapPx(mapSlug, wx, replay.tracks.y[base]);
    if (!mp) return null;
    const sp = mapToScreen(mp.x, mp.y);
    const pxPerYard = mapPxPerYard(mapSlug) || 0;
    const rPx = pxPerYard * groupRadiusYd * view.zoom;
    return { x: sp.x, y: sp.y, rPx, count: nearbyCount(target) };
  }, [groupRange, mapSlug, groupRadiusYd, hover, followIdx, frame, replay, mapToScreen, view.zoom, nearbyCount]);

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

    // guns & caissons, at true size, turned to face where they face
    for (const { piece, s, sp, ang, h } of pieceSprites) {
      const img = icons[piece.kind];
      if (!img) continue;
      const w = h * (img.width / img.height);
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(ang);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      if (piece.kind === 'gun' && s[6]) {                // rammed: a brass pip at the muzzle
        ctx.beginPath();
        ctx.arc(sp.x + Math.sin(ang) * h * 0.55, sp.y - Math.cos(ang) * h * 0.55,
                Math.max(2.5, h * 0.08), 0, Math.PI * 2);
        ctx.fillStyle = '#d3814a';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.stroke();
      }
    }

    // impacts: the game's ArtilleryImpact mark, outer ring at the blast's
    // reach (where any kill chance ends), fading over the chosen window
    if (arty && artyPrefs.impacts && icons.impact) {
      for (const [t, x, y, , kind] of impactsInWindow(arty, now, artyPrefs.fadeS)) {
        const mp = worldMetersToMapPx(mapSlug, x, y);
        if (!mp) continue;
        const sp = mapToScreen(mp.x, mp.y);
        const half = Math.max(7, impactFalloffM(kind) * pxPerM) * (128 / 121);
        ctx.globalAlpha = 0.2 + 0.8 * (1 - (now - t) / artyPrefs.fadeS);
        ctx.drawImage(icons.impact, sp.x - half, sp.y - half, half * 2, half * 2);
      }
      ctx.globalAlpha = 1;
    }

    // players: dots + heading first, then leaders on top so a star or pennant
    // is never buried in a crowd (the overlay's order)
    const P = replay.playerCount;
    const base = frame * P;
    const { x: xs, y: ys, fx: fxs, fy: fys, lk: lks } = replay.tracks;
    const dotR = playerDotRadius(pxPerM);
    const leaders = [];
    for (let pi = 0; pi < P; pi++) {
      const wx = xs[base + pi];
      if (Number.isNaN(wx)) continue;
      const mp = worldMetersToMapPx(mapSlug, wx, ys[base + pi]);
      if (!mp) continue;
      const sp = mapToScreen(mp.x, mp.y);
      const color = TEAM_COLOR[replay.players[pi].team] || '#a3a3a3';
      const kind = leaderOf(lks[base + pi]);
      const mounted = isMounted(lks[base + pi]);
      const isFollowed = pi === followIdx;
      if (kind === LEADER_KIND.OFFICER || kind === LEADER_KIND.FLAG) {
        leaders.push({ sp, color, kind, mounted, isFollowed });
        continue;
      }
      if (mounted) drawMountedRing(ctx, sp.x, sp.y, dotR);
      drawPlayerDot(ctx, sp.x, sp.y, dotR, color, isFollowed);
      const hd = headingToMapDelta(mapSlug, fxs[base + pi], fys[base + pi]);
      if (hd && Number.isFinite(hd.dx) && Number.isFinite(hd.dy)) {
        drawHeadingTriangle(ctx, sp.x, sp.y, hd.dx, hd.dy, dotR * 2.5, color);
      }
    }
    for (const l of leaders) {
      const size = l.kind === LEADER_KIND.OFFICER ? OFFICER_PX : FLAG_PX;
      if (l.mounted) drawMountedRing(ctx, l.sp.x, l.sp.y, size);
      drawLeaderGlyph(ctx, l.sp.x, l.sp.y, size, l.kind, l.color, l.isFollowed);
    }
  }, [frame, view, canvasSize.w, canvasSize.h, mapImg, mapSlug, followIdx,
      replay.playerCount, replay.tracks, replay.players, replay.meta.map, replay.frameTimes,
      arty, artyPrefs, icons, pieceSprites]);

  // --- mouse handlers: pan + wheel zoom + click-to-follow ---
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    draggingRef.current = {
      startX: e.clientX, startY: e.clientY,
      panX0: view.panX, panY0: view.panY,
      moved: false,
    };
  };
  const onMouseMove = (e) => {
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
    const hit = hitTestPlayer(sx, sy);
    if (hit < 0) {
      if (hover) setHover(null);
    } else if (!hover || hover.idx !== hit || hover.x !== sx || hover.y !== sy) {
      setHover({ idx: hit, x: sx, y: sy });
    }
    // A player on top wins; otherwise a gun or caisson under the cursor.
    const ph = hit < 0 ? hitTestPiece(sx, sy) : -1;
    if (ph < 0) {
      if (pieceHover) setPieceHover(null);
    } else if (!pieceHover || pieceHover.i !== ph || pieceHover.x !== sx || pieceHover.y !== sy) {
      setPieceHover({ i: ph, x: sx, y: sy });
    }
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
  const onMouseUp = (e) => {
    const d = draggingRef.current;
    draggingRef.current = null;
    if (!d || d.moved) return;
    // Click without drag: try to hit-test a player.
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTestPlayer(sx, sy);
    if (hit >= 0) setFollowIdx(hit === followIdx ? -1 : hit);
  };
  const hitTestPlayer = (sx, sy) => {
    if (!mapSlug) return -1;
    const P = replay.playerCount;
    const base = frame * P;
    const { x: xs, y: ys } = replay.tracks;
    let best = -1;
    const pxPerM = (mapPxPerYard(mapSlug) || 0) * YARDS_PER_METER * view.zoom;
    const reach = Math.max(playerDotRadius(pxPerM), OFFICER_PX) + 3;
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
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cx = canvasSize.w / 2, cy = canvasSize.h / 2;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView(v => {
        const zoom = Math.max(0.05, Math.min(8, v.zoom * factor));
        const beforeX = (sx - cx) / v.zoom + v.panX;
        const beforeY = (sy - cy) / v.zoom + v.panY;
        const panX = beforeX - (sx - cx) / zoom;
        const panY = beforeY - (sy - cy) / zoom;
        return { panX, panY, zoom };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [canvasSize.w, canvasSize.h]);

  // --- player list filtering ---
  const filterMatch = (p) => {
    if (!playerFilter) return true;
    return p.name.toLowerCase().includes(playerFilter.toLowerCase());
  };

  // --- jump helpers ---
  const goToFrame = (f) => {
    setFrame(Math.max(0, Math.min(replay.frameCount - 1, f)));
  };
  // Normalize the displayed clock against the first frame's t_s so a
  // mid-round-join replay still reads "0:00 / 6:06" instead of "1:04 /
  // 7:10". The underlying frameTimes stay in real round-time so kill
  // ts → frame mapping continues to line up exactly.
  const baseTime      = replay.frameTimes[0] || 0;
  const totalDuration = (replay.frameTimes[replay.frameCount - 1] || 0) - baseTime;
  const currentTime   = (replay.frameTimes[frame] || 0) - baseTime;

  const followedPlayer = followIdx >= 0 ? replay.players[followIdx] : null;
  const teams = [
    { key: 'usa',   label: 'USA',   color: TEAM_UI[1],     players: teamBuckets.usa },
    { key: 'csa',   label: 'CSA',   color: TEAM_UI[2],     players: teamBuckets.csa },
    { key: 'other', label: 'Other', color: 'var(--faint)', players: teamBuckets.other },
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
        <div className="label !text-muted">
          Playback
        </div>
        <div className="text-[11px] text-faint">
          {replay.frameCount} frames @ {replay.meta.sampleRateHz} Hz · {replay.playerCount} players
        </div>
        {followedPlayer && (
          <button
            onClick={() => setFollowIdx(-1)}
            className="ml-auto flex items-center gap-1 px-2 py-1 bg-accent hover:bg-accent-hover text-on-accent text-xs rounded transition"
            title="Stop following"
          >
            <Crosshair className="w-3 h-3" /> Following <span className="wor-name">{followedPlayer.name}</span>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3">
        {/* canvas */}
        <div
          ref={containerRef}
          className="relative bg-app rounded-lg overflow-hidden border border-border"
          style={{ minHeight: '480px', height: '60vh', touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            className="block cursor-grab active:cursor-grabbing"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => { draggingRef.current = null; setHover(null); setPieceHover(null); }}
          />
          <div className="absolute top-2 right-2 panel-float text-[11px] px-2 py-1 tabular-nums">
            {presentCount}/{replay.playerCount} <span className="text-faint">ALIVE</span>
          </div>

          {/* Map-layer controls (bottom-left): artillery, then grouping */}
          <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1.5">
          {arty && (
            <div className="panel-float text-xs px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1.5 label">
                <img src="assets/icons/impact.png" alt="" className="w-3.5 h-3.5" /> Artillery
                <span className="text-faint normal-case tracking-normal">· {arty.impacts.length} impacts</span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={artyPrefs.impacts}
                       onChange={(e) => setArtyPref('impacts', e.target.checked)} className="accent-[var(--accent)]" />
                Impacts
                {artyPrefs.impacts && (
                  <>
                    <input type="range" min={5} max={120} step={5} value={artyPrefs.fadeS}
                           onChange={(e) => setArtyPref('fadeS', parseInt(e.target.value, 10))}
                           className="w-20 accent-[var(--accent)]" title="How long an impact stays on the map" />
                    <span className="tabular-nums text-muted w-10">{artyPrefs.fadeS} s</span>
                  </>
                )}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={artyPrefs.pieces}
                       onChange={(e) => setArtyPref('pieces', e.target.checked)} className="accent-[var(--accent)]" />
                Guns &amp; caissons
              </label>
              {artyPrefs.pieces && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none pl-5 text-muted">
                  <input type="checkbox" checked={artyPrefs.hideEmpty}
                         onChange={(e) => setArtyPref('hideEmpty', e.target.checked)} className="accent-[var(--accent)]" />
                  Hide empty caissons
                </label>
              )}
            </div>
          )}
          <div className="panel-float text-xs px-2 py-1.5">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={groupRange}
                onChange={e => setGroupRange(e.target.checked)}
                className="accent-[var(--accent)]"
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
                    className="w-20 accent-[var(--accent)]"
                    title="Grouping radius"
                  />
                  <span className="tabular-nums w-10">{groupRadiusYd} yd</span>
                </div>
                <div className="seg">
                  <button onClick={() => setGroupScope('team')} className={groupScope === 'team' ? 'on' : ''}
                          title="Count only same-team players">Team</button>
                  <button onClick={() => setGroupScope('all')} className={groupScope === 'all' ? 'on' : ''}
                          title="Count all nearby players">All</button>
                </div>
              </div>
            )}
            {groupRange && (
              <div className="mt-1 text-faint text-[10px]">Hover or select a player to count their group.</div>
            )}
          </div>
          </div>

          {/* Live casualty panel + kill feed (top-left, collapsible) */}
          {timedKills.events.length > 0 && (
            <div className="absolute top-2 left-2 panel-float text-xs overflow-hidden max-w-[280px]">
              <button
                onClick={() => setFeedCollapsed(c => !c)}
                className="w-full px-2 py-1 flex items-center gap-1.5 hover:bg-elevated transition"
                title={feedCollapsed ? 'Expand' : 'Collapse'}
              >
                <Skull className="w-3.5 h-3.5 text-accent" />
                <span className="font-semibold flex-1 text-left">Casualties · {liveStats.total}</span>
                {feedCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
              {!feedCollapsed && (
                <div className="px-2 pb-2 space-y-2">
                  {/* Per-team totals */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <TeamBox label="USA" color={TEAM_UI[1]} count={liveStats.byTeam[1]} final={finalTotals.usa} />
                    <TeamBox label="CSA" color={TEAM_UI[2]} count={liveStats.byTeam[2]} final={finalTotals.csa} />
                  </div>

                  {/* By cause */}
                  {Object.keys(liveStats.byCause).length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">By cause</div>
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
                      <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">By formation</div>
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
                      <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">Recent kills</div>
                      <div className="space-y-0.5">
                        {liveStats.feed.map((ev, i) => (
                          <KillRow key={`${ev.ts}-${i}`} ev={ev} baseTime={baseTime} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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
                  background: 'var(--accent-soft)',
                }}
              />
              <div
                className="absolute pointer-events-none flex items-center gap-1 bg-accent text-on-accent text-[11px] font-bold px-1.5 py-0.5 rounded shadow -translate-x-1/2"
                style={{ left: groupOverlay.x, top: groupOverlay.y - groupOverlay.rPx - 20 }}
                title={`${groupOverlay.count} ${groupScope === 'team' ? 'friendly' : ''} within ${groupRadiusYd} yd`.trim()}
              >
                <Users className="w-3 h-3" /> {groupOverlay.count}
              </div>
            </>
          )}
          {pieceHover && pieceSprites[pieceHover.i] && (() => {
            const { piece, s } = pieceSprites[pieceHover.i];
            const left = Math.min(pieceHover.x + 12, canvasSize.w - 200);
            const top  = Math.min(pieceHover.y + 12, canvasSize.h - 80);
            return (
              <div className="absolute pointer-events-none panel-float px-2 py-1 text-xs max-w-[200px]" style={{ left, top }}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <img src={`assets/icons/${piece.kind}.png`} alt="" className="h-3.5" />
                  {pieceTitle(piece)}
                </div>
                {piece.kind === 'gun' ? (
                  <div className="text-[11px] mt-0.5">
                    {s[6] ? <span className="text-accent">Rammed · {ROUND_NAME[s[5]] || 'round'}</span>
                          : s[5] >= 0 ? <span className="text-muted">{ROUND_NAME[s[5]]} in the barrel</span>
                          : <span className="text-faint">Unloaded</span>}
                  </div>
                ) : caissonEmpty(s) ? (
                  <div className="text-[11px] mt-0.5 text-faint">Empty</div>
                ) : (
                  <div className="text-[11px] mt-0.5 tabular-nums flex gap-2">
                    <span>Shell <b>{s[7]}</b></span><span>Case <b>{s[8]}</b></span><span>Canister <b>{s[9]}</b></span>
                  </div>
                )}
                {piece.name && <div className="wor-name text-faint text-[10px] mt-0.5 truncate">{piece.name}</div>}
              </div>
            );
          })()}
          {hover && (() => {
            const p = replay.players[hover.idx];
            const detail = directory.details[hover.idx] || {};
            const color = TEAM_UI[p.team] || 'var(--faint)';
            const regiment = detail.regiment || (detail.tagRegiment && detail.tagRegiment !== UNTAGGED ? detail.tagRegiment : null);
            const near = groupRange ? nearbyCount(hover.idx) : null;
            // Clamp inside the container so the tooltip doesn't clip off-screen.
            const left = Math.min(hover.x + 12, canvasSize.w - 220);
            const top  = Math.min(hover.y + 12, canvasSize.h - 96);
            return (
              <div
                className="absolute pointer-events-none panel-float px-2 py-1 text-xs max-w-[220px]"
                style={{ left, top }}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="truncate wor-name">{p.name}</span>
                </div>
                <div className="text-muted text-[10px]">
                  {playerSubtitle(replay, frame, hover.idx)}
                </div>
                {regiment && (
                  <div className="text-[10px] mt-0.5">
                    <span className="text-accent wor-name">{regiment}</span>
                    {detail.company && <span className="text-muted"> · {detail.company}</span>}
                  </div>
                )}
                {detail.role && <div className="text-muted text-[10px]">{detail.role}</div>}
                {near != null && (
                  <div className="text-[10px] mt-0.5 flex items-center gap-1 text-accent">
                    <Users className="w-3 h-3" /> {near} {groupScope === 'team' ? 'friendly' : 'nearby'} within {groupRadiusYd} yd
                  </div>
                )}
                {detail.steamId && <div className="text-faint text-[10px] mt-0.5">Click to select · Steam link in panel</div>}
              </div>
            );
          })()}
        </div>

        {/* player list */}
        <div className="inset p-2 flex flex-col" style={{ height: '60vh', minHeight: '480px' }}>
          {/* selected (followed) player detail card */}
          {followedPlayer && (
            <SelectedPlayerCard
              player={followedPlayer}
              detail={directory.details[followIdx]}
              color={TEAM_UI[followedPlayer.team] || 'var(--faint)'}
              subtitle={playerSubtitle(replay, frame, followIdx)}
              nearby={groupRange ? nearbyCount(followIdx) : null}
              groupScope={groupScope}
              groupRadiusYd={groupRadiusYd}
              onClear={() => setFollowIdx(-1)}
            />
          )}
          <div className="flex items-center gap-1.5 mb-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="text"
                value={playerFilter}
                onChange={e => setPlayerFilter(e.target.value)}
                placeholder="Filter…"
                className="w-full pl-7 pr-2 py-1 text-xs inset text-text focus:outline-none focus:border-accent"
              />
            </div>
            <div className="seg shrink-0">
              <button onClick={() => setPanelGroupMode('regiment')} className={panelGroupMode === 'regiment' ? 'on' : ''}
                      title="Group by in-game regiment">Regt</button>
              <button onClick={() => setPanelGroupMode('tag')} className={panelGroupMode === 'tag' ? 'on' : ''}
                      title="Group by the regiment tag in player names">Tags</button>
              <button onClick={() => setPanelGroupMode('team')} className={panelGroupMode === 'team' ? 'on' : ''}
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
                  label={`${t.label} (${t.players.length})`}
                  color={t.color}
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
      </div>

      {/* timeline + transport */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setPlaying(p => !p)}
          className="p-2 bg-accent hover:bg-accent-hover text-on-accent rounded transition"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={() => goToFrame(frame - Math.round(replay.meta.sampleRateHz * 5))}
          className="btn btn-ghost !p-2"
          title="Back 5s"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={() => goToFrame(frame + Math.round(replay.meta.sampleRateHz * 5))}
          className="btn btn-ghost !p-2"
          title="Forward 5s"
        >
          <SkipForward className="w-4 h-4" />
        </button>
        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={0}
            max={Math.max(0, replay.frameCount - 1)}
            step={1}
            value={frame}
            onChange={e => goToFrame(parseInt(e.target.value, 10))}
            className="w-full accent-[var(--accent)]"
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
        </div>
        <div className="text-xs text-text tabular-nums w-24 text-right">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>
        <div className="seg">
          {PLAYBACK_SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`!px-2 !py-1 ${speed === s ? 'on' : ''}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlayerGroup({ label, color, players, followIdx, onPick, frame, replay, directory }) {
  if (players.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-2" style={{ color }}>
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="space-y-0.5">
        {players.map(p => (
          <PlayerRow
            key={p.index}
            entry={p}
            detail={directory?.details[p.index]}
            color={color}
            frame={frame}
            replay={replay}
            followIdx={followIdx}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

// One team's players grouped by regiment (with company splits). Used when the
// side panel is in "Regt" mode.
function RegimentTeamSection({ by, team, entries, directory, followIdx, onPick, frame, replay }) {
  const groups = groupEntriesByRegiment(entries, directory.details, by);
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-2" style={{ color: team.color }}>
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: team.color }} />
        {team.label} ({entries.length})
      </div>
      <div className="space-y-1.5">
        {groups.map(g => (
          <div key={g.regiment}>
            <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px]">
              <span className="font-semibold text-text truncate wor-name" title={g.regiment}>
                {g.regiment === UNTAGGED ? (by === 'tag' ? 'Untagged' : 'Unknown regiment') : g.regiment}
              </span>
              <span className="text-faint tabular-nums">{g.count}</span>
              {g.companies.length > 0 && (
                <span className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                  {g.companies.map(c => (
                    <span key={c.company} className="text-[10px] text-muted bg-elevated rounded px-1 tabular-nums" title={`${c.company}: ${c.count}`}>
                      {shortCompany(c.company)} {c.count}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className="space-y-0.5 pl-1 border-l border-border ml-1">
              {g.entries.map(p => (
                <PlayerRow
                  key={p.index}
                  entry={p}
                  detail={directory.details[p.index]}
                  color={team.color}
                  frame={frame}
                  replay={replay}
                  followIdx={followIdx}
                  onPick={onPick}
                  showCompany
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
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
          isFollowed ? 'bg-accent text-on-accent' :
          alive       ? 'text-text hover:bg-elevated' :
                        'text-faint hover:bg-elevated'
        }`}
        title={entry.name}
      >
        <LeaderGlyph kind={leaderKindForFrame(replay, frame, entry.index)} color={color} />
        <span className="truncate wor-name">{entry.name}</span>
        {showCompany && detail?.company && (
          <span className={`ml-auto shrink-0 text-[10px] rounded px-1 tabular-nums ${isFollowed ? 'bg-on-accent/15' : 'bg-elevated text-muted'}`}>
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
      className="shrink-0 p-1 rounded text-faint hover:text-accent hover:bg-elevated transition"
      title="Open Steam profile"
    >
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

// Detail card for the currently-followed player, shown atop the side panel.
function SelectedPlayerCard({ player, detail, color, subtitle, nearby, groupScope, groupRadiusYd, onClear }) {
  const d = detail || {};
  const regiment = d.regiment || (d.tagRegiment && d.tagRegiment !== UNTAGGED ? d.tagRegiment : null);
  const steam = d.steamId ? steamProfileUrl(d.steamId) : null;
  return (
    <div className="mb-2 rounded border border-border bg-elevated/60 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Crosshair className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="font-semibold text-sm truncate wor-name" title={player.name}>{player.name}</span>
        <button onClick={onClear} className="ml-auto shrink-0 text-faint hover:text-text" title="Stop following">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="text-[11px] text-muted mt-0.5">
        <span style={{ color }}>{subtitle}</span>
      </div>
      {(regiment || d.role) && (
        <div className="text-[11px] mt-0.5 leading-snug">
          {regiment && (
            <div>
              <span className="text-accent wor-name">{regiment}</span>
              {d.company && <span className="text-muted"> · {d.company}</span>}
            </div>
          )}
          {d.role && <div className="text-muted">{d.role}</div>}
        </div>
      )}
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
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover"
        >
          <ExternalLink className="w-3 h-3" /> Steam profile
        </a>
      ) : (
        <div className="mt-1.5 text-[10px] text-faint">No SteamID (attach a scoreboard with a roster)</div>
      )}
    </div>
  );
}

function TeamBox({ label, color, count, final }) {
  return (
    <div className="bg-surface/90 border border-border rounded px-1.5 py-1">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="font-bold text-sm tabular-nums" style={{ color }}>
        {count}
        {final != null && <span className="text-faint text-[10px] font-normal"> / {final}</span>}
      </div>
    </div>
  );
}

function SplitRow({ label, usa, csa }) {
  return (
    <div className="flex items-center gap-1 text-[11px] tabular-nums">
      <span className="flex-1 truncate" title={label}>{label}</span>
      <span className="text-usa w-5 text-right">{usa || ''}</span>
      <span className="text-muted">/</span>
      <span className="text-csa w-5 text-left">{csa || ''}</span>
    </div>
  );
}

function KillRow({ ev, baseTime = 0 }) {
  const killerColor = TEAM_UI[ev.killerTeam] || 'var(--faint)';
  const victimColor = TEAM_UI[ev.victimTeam] || 'var(--faint)';
  const killer = ev.killer || '(environment)';
  return (
    <div className="text-[11px] flex items-center gap-1 leading-tight">
      <span className="text-faint tabular-nums shrink-0" title={ev.time || ''}>
        {formatRoundTime(ev.ts - baseTime)}
      </span>
      <span className="truncate wor-name" style={{ color: killerColor }} title={killer}>{killer}</span>
      <span className="text-faint shrink-0">►</span>
      <span className="truncate wor-name" style={{ color: victimColor }} title={ev.victim}>{ev.victim}</span>
      {ev.cause && <span className="text-faint text-[10px] shrink-0">·{ev.cause}</span>}
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

// Filled team-colour triangle along the heading, `size` from the centre.
function drawHeadingTriangle(ctx, x, y, dx, dy, size, color) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = dx / len, ny = dy / len, px = -ny, py = nx;
  ctx.beginPath();
  ctx.moveTo(x + nx * size, y + ny * size);
  ctx.lineTo(x - nx * size * 0.4 + px * size * 0.55, y - ny * size * 0.4 + py * size * 0.55);
  ctx.lineTo(x - nx * size * 0.4 - px * size * 0.55, y - ny * size * 0.4 - py * size * 0.55);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Officer: 5-point star (inner radius 0.42·size). Flag bearer: pole with a
// right-pointing pennant near the top.
function drawLeaderGlyph(ctx, x, y, size, kind, color, highlight) {
  const outline = highlight ? '#ffffff' : 'rgba(8,8,8,0.92)';
  ctx.lineWidth = highlight ? 2 : 1.4;
  ctx.strokeStyle = outline;
  ctx.fillStyle = color;
  if (kind === LEADER_KIND.FLAG) {
    const half = size * 0.95;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + size * 1.5, y - half + size * 0.55);
    ctx.lineTo(x, y - half + size * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x, y + half);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    return;
  }
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
