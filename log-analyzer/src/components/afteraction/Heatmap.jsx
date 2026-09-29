import { useMemo, useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Card } from './Card';
import { TEAM } from './teams';
import { MAPS } from '../../utils/mapCalibration';
import { presencePoints, casualtyPoints } from '../../analytics/heatmap';

const CELL = 12;              // map-pixel grid cell for density binning (12 px = 24 m on the game art)
const MAX_ZOOM = 8;
const TEAM_FILTERS = [
  { key: 'both', label: 'Both' },
  { key: 'usa', label: 'USA' },
  { key: 'csa', label: 'CSA' },
];

// Multi-hue ramp (cool → hot) so density reads by *color*, not just opacity —
// far easier to tell apart than a single amber wash. [stop, r, g, b].
const HEAT_STOPS = [
  [0.00, 58, 76, 192],   // indigo
  [0.30, 46, 170, 210],  // cyan
  [0.50, 92, 200, 110],  // green
  [0.68, 240, 214, 66],  // yellow
  [0.84, 244, 146, 42],  // orange
  [1.00, 214, 44, 44],   // red
];

const LEGEND_GRADIENT = `linear-gradient(90deg, ${HEAT_STOPS
  .map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${Math.round(t * 100)}%`)
  .join(', ')})`;

function heatColor(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (x <= HEAT_STOPS[i][0]) {
      const [t0, r0, g0, b0] = HEAT_STOPS[i - 1];
      const [t1, r1, g1, b1] = HEAT_STOPS[i];
      const f = (x - t0) / (t1 - t0 || 1);
      return [Math.round(r0 + (r1 - r0) * f), Math.round(g0 + (g1 - g0) * f), Math.round(b0 + (b1 - b0) * f)];
    }
  }
  const l = HEAT_STOPS[HEAT_STOPS.length - 1];
  return [l[1], l[2], l[3]];
}

// Clamp a { z, tx, ty } view so the map always covers the canvas.
function clampView(z, tx, ty, w, h) {
  const cz = Math.max(1, Math.min(MAX_ZOOM, z));
  return {
    z: cz,
    tx: Math.min(0, Math.max(w * (1 - cz), tx)),
    ty: Math.min(0, Math.max(h * (1 - cz), ty)),
  };
}

function filterFor(key) {
  if (key === 'usa') return (p) => p.team === 1;
  if (key === 'csa') return (p) => p.team === 2;
  return null;
}

export default function Heatmap({ replay, scoreboard }) {
  const slug = replay.meta.mapSlug;
  const mapInfo = slug ? MAPS[slug] : null;
  const kills = scoreboard?.kills || null;

  const [teamKey, setTeamKey] = useState('both');
  const [showCasualties, setShowCasualties] = useState(!!kills);
  const [mapImg, setMapImg] = useState(null);
  const [w, setW] = useState(720);
  const [view, setView] = useState({ z: 1, tx: 0, ty: 0 });
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (!mapInfo) { setMapImg(null); return; }
    const img = new Image();
    img.onload = () => setMapImg(img);
    img.onerror = () => setMapImg(null);
    img.src = `assets/maps/${mapInfo.file}`;
    return () => { img.onload = null; img.onerror = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInfo?.file]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(320, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset the view whenever the map changes.
  useEffect(() => { setView({ z: 1, tx: 0, ty: 0 }); }, [mapImg]);

  const points = useMemo(
    () => (slug ? presencePoints(replay, slug, filterFor(teamKey)) : new Float32Array(0)),
    [replay, slug, teamKey],
  );
  const casualties = useMemo(
    () => (slug && kills ? casualtyPoints(replay, kills, slug) : []),
    [replay, slug, kills],
  );

  // Bin the points into a density grid (map-pixel space).
  const grid = useMemo(() => {
    if (!mapImg) return null;
    const cols = Math.ceil(mapImg.width / CELL);
    const rows = Math.ceil(mapImg.height / CELL);
    const cells = new Float32Array(cols * rows);
    let max = 0;
    for (let i = 0; i < points.length; i += 2) {
      const c = Math.floor(points[i] / CELL);
      const r = Math.floor(points[i + 1] / CELL);
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const v = ++cells[r * cols + c];
      if (v > max) max = v;
    }
    return { cells, cols, rows, max };
  }, [points, mapImg]);

  // Paint the density grid to a small offscreen canvas colored by the ramp;
  // drawing it upscaled with smoothing gives a soft, readable heat surface.
  const heatCanvas = useMemo(() => {
    if (!grid || grid.max <= 0) return null;
    const { cells, cols, rows, max } = grid;
    const oc = document.createElement('canvas');
    oc.width = cols;
    oc.height = rows;
    const octx = oc.getContext('2d');
    const img = octx.createImageData(cols, rows);
    const data = img.data;
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      if (!v) continue;
      const t = Math.sqrt(v / max);
      const [r, g, b] = heatColor(t);
      const o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b;
      data[o + 3] = Math.round(Math.min(0.92, 0.32 + 0.6 * t) * 255);
    }
    octx.putImageData(img, 0, 0);
    return oc;
  }, [grid]);

  // Render map + heat + casualties under the pan/zoom transform.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !mapImg) return;
    const s0 = w / mapImg.width;
    const h0 = Math.round(mapImg.height * s0);
    cv.width = w;
    cv.height = h0;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h0);
    ctx.save();
    ctx.translate(view.tx, view.ty);
    ctx.scale(view.z, view.z);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mapImg, 0, 0, w, h0);

    if (heatCanvas) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(heatCanvas, 0, 0, w, h0);
    }

    if (showCasualties && casualties.length) {
      const r = 3 / view.z;
      for (const k of casualties) {
        ctx.beginPath();
        ctx.arc(k.x * s0, k.y * s0, r, 0, Math.PI * 2);
        ctx.fillStyle = k.victimTeam === 1 ? TEAM.usa : TEAM.csa;
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1 / view.z;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
      }
    }
    ctx.restore();
  }, [mapImg, heatCanvas, w, view, showCasualties, casualties]);

  // Wheel to zoom toward the cursor. Attached non-passive so we can
  // preventDefault the page scroll.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !mapImg) return;
    const h = Math.round((w / mapImg.width) * mapImg.height);
    const onWheel = (e) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const v = viewRef.current;
      const nz = Math.max(1, Math.min(MAX_ZOOM, v.z * Math.exp(-e.deltaY * 0.0015)));
      const wx = (cx - v.tx) / v.z;
      const wy = (cy - v.ty) / v.z;
      setView(clampView(nz, cx - wx * nz, cy - wy * nz, w, h));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [w, mapImg]);

  const mapH = mapImg ? Math.round((w / mapImg.width) * mapImg.height) : 0;

  const onPointerDown = (e) => {
    if (view.z <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || !mapImg) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setView((v) => clampView(v.z, v.tx + dx, v.ty + dy, w, mapH));
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const zoomBy = (factor) => {
    if (!mapImg) return;
    setView((v) => {
      const nz = Math.max(1, Math.min(MAX_ZOOM, v.z * factor));
      const cx = w / 2;
      const cy = mapH / 2;
      const wx = (cx - v.tx) / v.z;
      const wy = (cy - v.ty) / v.z;
      return clampView(nz, cx - wx * nz, cy - wy * nz, w, mapH);
    });
  };
  const resetView = () => setView({ z: 1, tx: 0, ty: 0 });
  const atFit = view.z === 1 && view.tx === 0 && view.ty === 0;

  const zoomBtn = 'grid place-items-center w-7 h-7 rounded-md bg-app/80 backdrop-blur border border-border text-muted hover:text-text hover:bg-elevated transition disabled:opacity-40 disabled:cursor-default';

  if (!slug) {
    return (
      <Card title="Heatmap">
        <div className="text-xs text-accent py-2">No map calibration for &quot;{replay.meta.map}&quot; — can&apos;t project positions.</div>
      </Card>
    );
  }

  return (
    <Card
      title="Position heatmap"
      hint="Where the fighting concentrated over the whole round. Warmer colors = more time spent there. Scroll to zoom, drag to pan."
      right={(
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {TEAM_FILTERS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTeamKey(t.key)}
                className={`px-2 py-0.5 text-[11px] rounded-md transition ${teamKey === t.key ? 'bg-accent text-on-accent' : 'bg-elevated text-muted hover:text-text'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {kills && (
            <button
              onClick={() => setShowCasualties((s) => !s)}
              className={`px-2 py-0.5 text-[11px] rounded-md transition ${showCasualties ? 'bg-accent-soft text-text' : 'bg-elevated text-muted hover:text-text'}`}
              title="Toggle casualty locations from the scoreboard"
            >
              Casualties
            </button>
          )}
        </div>
      )}
    >
      <div ref={wrapRef} className="relative w-full bg-app rounded-lg overflow-hidden border border-border">
        {mapImg ? (
          <>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              style={{ touchAction: 'none' }}
              className={`block w-full ${view.z > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            />
            <div className="absolute top-2 right-2 flex flex-col gap-1">
              <button onClick={() => zoomBy(1.4)} className={zoomBtn} title="Zoom in" disabled={view.z >= MAX_ZOOM}>
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => zoomBy(1 / 1.4)} className={zoomBtn} title="Zoom out" disabled={view.z <= 1}>
                <ZoomOut className="w-4 h-4" />
              </button>
              <button onClick={resetView} className={zoomBtn} title="Reset view" disabled={atFit}>
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            {view.z > 1 && (
              <div className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-app/80 text-faint tabular-nums select-none">
                {view.z.toFixed(1)}×
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center text-faint text-sm">Loading map…</div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <span>Less</span>
          <span className="h-2 w-28 rounded-full border border-border" style={{ background: LEGEND_GRADIENT }} />
          <span>More time here</span>
        </div>
        {showCasualties && casualties.length > 0 && (
          <div className="text-[11px] text-faint flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full ring-1 ring-white/70" style={{ background: TEAM.usa }} /> USA fell</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full ring-1 ring-white/70" style={{ background: TEAM.csa }} /> CSA fell</span>
            <span>· {casualties.length} located</span>
          </div>
        )}
      </div>
    </Card>
  );
}
