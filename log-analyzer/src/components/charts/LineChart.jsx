import { useRef, useState, useEffect, useMemo } from 'react';

// Reusable multi-series line chart over a shared time axis.
//
// props:
//   times    number[]                       x values in seconds (round time)
//   series   [{ key,label,color,values,dashed?,fill? }]  values: (number|null)[]
//   height   px (default 240)
//   yFormat  (v)=>string      y-axis + tooltip formatter
//   yLabel   string           small axis caption
//   markers  [{ t,label,color }]  vertical reference lines
//   yMinZero bool (default true)  clamp axis floor to 0
//
// Gaps (null values) break a series into segments so an absent team/leader
// reads as a hole, not a line to zero.
function fmtClock(s) {
  if (!Number.isFinite(s)) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

const PAD = { l: 44, r: 12, t: 10, b: 22 };

export default function LineChart({ times, series, height = 240, yFormat = (v) => `${v}`, yLabel, markers = [], yMinZero = true }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(720);
  const [hidden, setHidden] = useState(() => new Set());
  const [hoverX, setHoverX] = useState(null); // pixel x within plot

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(320, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const active = series.filter((s) => !hidden.has(s.key));

  const { yMin, yMax } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const s of active) {
      for (const v of s.values) {
        if (v == null || !Number.isFinite(v)) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (mn === Infinity) { mn = 0; mx = 1; }
    if (yMinZero) mn = Math.min(0, mn);
    if (mx === mn) mx = mn + 1;
    return { yMin: mn, yMax: mx };
  }, [active, yMinZero]);

  const t0 = times[0] ?? 0;
  const t1 = times[times.length - 1] ?? 1;
  const plotW = Math.max(1, w - PAD.l - PAD.r);
  const plotH = Math.max(1, height - PAD.t - PAD.b);
  const sx = (t) => PAD.l + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * plotW;
  const sy = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  // Build polyline segments per series, breaking on null.
  const paths = active.map((s) => {
    const segs = [];
    let cur = [];
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (v == null || !Number.isFinite(v)) { if (cur.length) { segs.push(cur); cur = []; } continue; }
      cur.push(`${sx(times[i]).toFixed(1)},${sy(v).toFixed(1)}`);
    }
    if (cur.length) segs.push(cur);
    return { s, segs };
  });

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i / yTicks) * (yMax - yMin));

  // Hover → nearest time index.
  const hoverIdx = useMemo(() => {
    if (hoverX == null || times.length === 0) return null;
    const tGuess = t0 + ((hoverX - PAD.l) / plotW) * (t1 - t0);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < times.length; i++) {
      const d = Math.abs(times[i] - tGuess);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }, [hoverX, times, t0, t1, plotW]);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PAD.l || x > w - PAD.r) setHoverX(null);
    else setHoverX(x);
  };

  const toggle = (key) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div ref={wrapRef} className="w-full">
      <svg
        width={w}
        height={height}
        className="block select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* y grid + labels */}
        {ticks.map((tk, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={w - PAD.r} y1={sy(tk)} y2={sy(tk)} style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" />
            <text x={PAD.l - 6} y={sy(tk) + 3} textAnchor="end" fontSize="10" style={{ fill: 'var(--chart-axis)' }}>{yFormat(tk)}</text>
          </g>
        ))}
        {/* x labels (start / mid / end) */}
        {[t0, (t0 + t1) / 2, t1].map((t, i) => (
          <text key={i} x={sx(t)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="10" style={{ fill: 'var(--chart-axis)' }}>{fmtClock(t - t0)}</text>
        ))}
        {yLabel && <text x={PAD.l} y={PAD.t - 1} fontSize="9" style={{ fill: 'var(--chart-axis)' }}>{yLabel}</text>}

        {/* markers */}
        {markers.map((m, i) => (
          <line key={i} x1={sx(m.t)} x2={sx(m.t)} y1={PAD.t} y2={height - PAD.b} style={{ stroke: m.color || 'var(--accent)' }} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
        ))}

        {/* series */}
        {paths.map(({ s, segs }) => (
          <g key={s.key}>
            {segs.map((pts, i) => (
              <polyline
                key={i}
                points={pts.join(' ')}
                fill="none"
                style={{ stroke: s.color }}
                strokeWidth="1.75"
                strokeDasharray={s.dashed ? '4 3' : undefined}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ))}
          </g>
        ))}

        {/* hover crosshair */}
        {hoverIdx != null && (
          <line x1={sx(times[hoverIdx])} x2={sx(times[hoverIdx])} y1={PAD.t} y2={height - PAD.b} style={{ stroke: 'var(--chart-axis)' }} strokeWidth="1" />
        )}
        {hoverIdx != null && active.map((s) => {
          const v = s.values[hoverIdx];
          if (v == null || !Number.isFinite(v)) return null;
          return <circle key={s.key} cx={sx(times[hoverIdx])} cy={sy(v)} r="2.5" style={{ fill: s.color }} />;
        })}
      </svg>

      {/* hover readout */}
      {hoverIdx != null && (
        <div className="text-[11px] text-muted flex flex-wrap gap-x-3 gap-y-0.5 px-1 min-h-[16px]">
          <span className="text-faint tabular-nums">{fmtClock(times[hoverIdx] - t0)}</span>
          {active.map((s) => {
            const v = s.values[hoverIdx];
            return (
              <span key={s.key} className="tabular-nums" style={{ color: s.color }}>
                {s.label}: {v == null || !Number.isFinite(v) ? '—' : yFormat(v)}
              </span>
            );
          })}
        </div>
      )}

      {/* legend (click to toggle) */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 px-1">
        {series.map((s) => (
          <button
            key={s.key}
            onClick={() => toggle(s.key)}
            className={`flex items-center gap-1 text-[11px] transition ${hidden.has(s.key) ? 'opacity-40' : ''}`}
          >
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined }} />
            <span className="text-muted">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
