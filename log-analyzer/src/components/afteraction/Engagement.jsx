import { useEffect, useMemo, useState } from 'react';
import LineChart from '../charts/LineChart';
import { Card, StatTile } from './Card';
import { roundTimes } from '../../analytics/presence';
import { engagementOverTime, peakContactFrame } from '../../analytics/engagement';

const THRESHOLDS = [20, 40, 80]; // meters — musket bands
const clampRange = (n) => Math.max(1, Math.min(500, Math.round(n)));

function fmtClock(s) {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function Engagement({ replay }) {
  const [threshold, setThreshold] = useState(40);
  const [rangeText, setRangeText] = useState('40');
  // Keep the text field in sync when a preset (or clamp) changes the threshold.
  useEffect(() => { setRangeText(String(threshold)); }, [threshold]);

  // Commit the typed range — only recompute engagement on a valid, committed
  // value (blur / Enter), not on every keystroke.
  const commitRange = () => {
    const n = parseInt(rangeText, 10);
    if (Number.isFinite(n)) setThreshold(clampRange(n));
    else setRangeText(String(threshold));
  };

  const times = useMemo(() => roundTimes(replay), [replay]);
  const eng = useMemo(() => engagementOverTime(replay, threshold), [replay, threshold]);
  const peak = useMemo(() => peakContactFrame(eng), [eng]);

  const closest = useMemo(() => {
    let md = Infinity;
    let mf = -1;
    eng.minDist.forEach((v, f) => { if (v != null && v < md) { md = v; mf = f; } });
    return mf < 0 ? null : { dist: md, frame: mf };
  }, [eng]);

  const t0 = replay.frameTimes[0] || 0;

  return (
    <div className="space-y-3">
      <Card
        title="Engagement — where the lines met"
        hint="Opposing players within musket range each frame. The rise marks the clash; the trough in closest-approach marks the moment lines met."
        right={(
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-faint mr-1">Range</span>
            {THRESHOLDS.map((t) => (
              <button
                key={t}
                onClick={() => setThreshold(t)}
                className={`px-2 py-0.5 text-[11px] rounded-md transition ${threshold === t ? 'bg-accent text-on-accent' : 'bg-elevated text-muted hover:text-text'}`}
              >
                {t}m
              </button>
            ))}
            <label className="flex items-center rounded-md bg-elevated ml-1 focus-within:ring-1 focus-within:ring-accent" title="Custom range in meters (1–500)">
              <input
                type="text"
                inputMode="numeric"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { commitRange(); e.currentTarget.blur(); } }}
                onBlur={commitRange}
                aria-label="Custom range in meters"
                className={`w-10 bg-transparent pl-1.5 py-0.5 text-[11px] text-right outline-none tabular-nums ${THRESHOLDS.includes(threshold) ? 'text-muted' : 'text-text'}`}
              />
              <span className="pr-1.5 text-[11px] text-faint select-none">m</span>
            </label>
          </div>
        )}
      >
        <div className="grid grid-cols-3 gap-2 mb-3 max-w-md">
          <StatTile label="Peak contacts" value={peak ? peak.contacts : 0} />
          <StatTile label="Peak at" value={peak ? fmtClock((replay.frameTimes[peak.frame] || 0) - t0) : '—'} />
          <StatTile label="Closest" value={closest ? `${Math.round(closest.dist * 1.0936)}yd` : '—'} />
        </div>
        <LineChart
          times={times}
          height={200}
          yFormat={(v) => `${Math.round(v)}`}
          yLabel={`pairs within ${threshold}m`}
          markers={peak ? [{ t: times[peak.frame], label: 'peak', color: 'var(--accent)' }] : []}
          series={[{ key: 'contacts', label: 'Opposing pairs in range', color: 'var(--accent)', values: eng.contacts }]}
        />
      </Card>

      <Card title="Closest approach" hint="Minimum distance between any two opposing players. The trough is the decisive contact.">
        <LineChart
          times={times}
          height={180}
          yFormat={(v) => `${Math.round(v)}yd`}
          series={[{ key: 'min', label: 'Closest opposing distance', color: 'var(--usa)', values: eng.minDist.map((v) => (v == null ? null : v * 1.0936)) }]}
        />
      </Card>
    </div>
  );
}
