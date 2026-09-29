import { useMemo } from 'react';
import LineChart from '../charts/LineChart';
import DataTable from '../ui/DataTable';
import { Card } from './Card';
import { TEAM } from './teams';
import { roundTimes } from '../../analytics/presence';
import {
  centroidsOverTime, centroidSeparation, distancePerPlayer, frontlineOverTime, spreadOverTime,
} from '../../analytics/movement';

const M_TO_YD = 1.0936;
const yd = (m) => (m == null ? null : m * M_TO_YD);

const teamColor = (t) => (t === 1 ? TEAM.usa : t === 2 ? TEAM.csa : '#a3a3a3');

function TeamDot({ team }) {
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: teamColor(team) }} />;
}

// Distance cell with a small proportional bar so the ranking reads at a glance
// even when the table is sorted or filtered.
function DistCell({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 bg-elevated rounded-full overflow-hidden hidden sm:block">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="tabular-nums w-16 text-right">{Math.round(value)} yd</span>
    </div>
  );
}

export default function MovementFrontline({ replay }) {
  const d = useMemo(() => {
    const times = roundTimes(replay);
    const centroids = centroidsOverTime(replay);
    const sep = centroidSeparation(replay, centroids).map(yd);
    const front = frontlineOverTime(replay, centroids);
    const spread = spreadOverTime(replay, centroids);
    const dist = distancePerPlayer(replay);
    // Every player, ranked by ground covered (not just the top movers) so the
    // table below can page/search across the whole roster.
    const movers = replay.players
      .map((p, i) => ({ key: String(i), name: p.name || `Player ${i + 1}`, team: p.team, value: dist[i] * M_TO_YD }))
      .sort((a, b) => b.value - a.value)
      .map((m, i) => ({ ...m, rank: i + 1 }));
    return {
      times,
      sep,
      front: front.ok
        ? { usa: front.usa.map(yd), csa: front.csa.map(yd), span: front.span * M_TO_YD }
        : null,
      spread: { usa: spread.usa.map(yd), csa: spread.csa.map(yd) },
      movers,
      maxDist: movers.length ? movers[0].value : 1,
    };
  }, [replay]);

  const columns = useMemo(() => [
    { key: 'rank', header: '#', align: 'right', sortable: true, sortValue: (r) => r.rank,
      render: (r) => <span className="text-faint tabular-nums">{r.rank}</span> },
    { key: 'name', header: 'Player', sortable: true, sortValue: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <TeamDot team={r.team} />
          <span className="truncate max-w-[260px]" title={r.name}>{r.name}</span>
        </span>
      ) },
    { key: 'value', header: 'Ground covered', align: 'right', sortable: true, sortValue: (r) => r.value,
      render: (r) => <DistCell value={r.value} max={d.maxDist} color={teamColor(r.team)} /> },
  ], [d.maxDist]);

  return (
    <div className="space-y-3">
      <Card
        title="Frontline — advance & retreat"
        hint="Each side's leading edge projected onto the attack axis (USA start → CSA start). The lines converging means the front is collapsing toward contact."
      >
        {d.front ? (
          <LineChart
            times={d.times}
            height={230}
            yFormat={(v) => `${Math.round(v)}yd`}
            series={[
              { key: 'usa', label: 'USA front', color: TEAM.usa, values: d.front.usa },
              { key: 'csa', label: 'CSA front', color: TEAM.csa, values: d.front.csa },
            ]}
          />
        ) : (
          <div className="text-xs text-faint py-2">Not enough two-sided data to anchor an attack axis.</div>
        )}
      </Card>

      <Card title="Distance between the lines" hint="Team-centroid separation. A falling line = closing to contact; rising = disengaging.">
        <LineChart
          times={d.times}
          height={180}
          yFormat={(v) => `${Math.round(v)}yd`}
          series={[{ key: 'sep', label: 'Centroid separation', color: 'var(--accent)', values: d.sep }]}
        />
      </Card>

      <Card title="Formation cohesion" hint="Average spread of each side around its own centroid. Lower = tighter formation; a spike = a unit breaking off or routing.">
        <LineChart
          times={d.times}
          height={180}
          yFormat={(v) => `${Math.round(v)}yd`}
          series={[
            { key: 'usa', label: 'USA spread', color: TEAM.usa, values: d.spread.usa },
            { key: 'csa', label: 'CSA spread', color: TEAM.csa, values: d.spread.csa },
          ]}
        />
      </Card>

      <Card title="Total ground covered" hint="Distance traveled per player across the round — search for anyone and page through the whole roster.">
        <DataTable
          columns={columns}
          rows={d.movers}
          getRowKey={(r) => r.key}
          initialSortKey="value"
          initialSortDir="desc"
          searchValue={(r) => r.name}
          searchPlaceholder="Search players…"
          pageSize={10}
          emptyHint="No players matched."
        />
      </Card>
    </div>
  );
}
