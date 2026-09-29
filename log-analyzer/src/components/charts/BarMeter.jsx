// Horizontal bar-meter list — for ranked breakdowns (casualties by cause,
// distance by unit, leader time, …). Each row is a label + a proportional bar
// + a value. Optionally a split USA/CSA bar via `usa`/`csa`.

const TEAM_COLOR = { usa: '#3f8ec8', csa: '#bc8630' };

export default function BarMeter({ rows, max, valueFormat = (v) => `${v}`, color = 'var(--accent)', split = false }) {
  if (!rows || rows.length === 0) {
    return <div className="text-xs text-faint py-2">No data.</div>;
  }
  const hi = max ?? Math.max(1, ...rows.map((r) => (split ? (r.usa || 0) + (r.csa || 0) : r.value || 0)));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const total = split ? (r.usa || 0) + (r.csa || 0) : r.value || 0;
        return (
          <div key={r.key ?? r.label} className="flex items-center gap-2.5 text-[11px]">
            <span className="w-28 shrink-0 truncate text-muted" title={r.label}>{r.label}</span>
            <div className="flex-1 h-2.5 bg-elevated rounded-full overflow-hidden flex">
              {split ? (
                <>
                  <div className="h-full" style={{ width: `${((r.usa || 0) / hi) * 100}%`, background: TEAM_COLOR.usa }} />
                  <div className="h-full" style={{ width: `${((r.csa || 0) / hi) * 100}%`, background: TEAM_COLOR.csa }} />
                </>
              ) : (
                <div className="h-full rounded-full" style={{ width: `${(total / hi) * 100}%`, background: r.color || color }} />
              )}
            </div>
            <span className="w-14 shrink-0 text-right tabular-nums text-text">{valueFormat(total)}</span>
          </div>
        );
      })}
    </div>
  );
}
