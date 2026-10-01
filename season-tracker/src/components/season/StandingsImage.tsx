/**
 * Standings → a shareable rankings card, by points or by Elo, after any night,
 * with each unit's movement since the night before. The tracker supplies the
 * ranking; utils/standingsImage draws it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Seg } from '../Shell';
import { drawStandingsImage } from '../../utils/standingsImage';
import type { RankingRow } from '../../utils/standingsImage';

export type RankBy = 'points' | 'elo';

const BY: { key: RankBy; label: string }[] = [
  { key: 'points', label: 'Points' },
  { key: 'elo', label: 'Elo' },
];

export function StandingsImagePanel({
  eventName,
  seasonName,
  nights,
  rankingAfter,
  defaultBy = 'points',
}: {
  eventName: string;
  seasonName: string;
  /** The season's nights in order; the card defaults to the last one played. */
  nights: { name: string; played: boolean }[];
  rankingAfter: (nightIdx: number, by: RankBy) => RankingRow[];
  defaultBy?: RankBy;
}) {
  const lastPlayed = nights.map((n) => n.played).lastIndexOf(true);
  const [by, setBy] = useState<RankBy>(defaultBy);
  const [night, setNight] = useState(lastPlayed);
  // A night played since the panel opened moves the default along with it.
  useEffect(() => setNight(lastPlayed), [lastPlayed]);

  const nightName = nights[night]?.name || `Night ${night + 1}`;
  const image = useMemo(() => {
    if (night < 0) return null;
    return drawStandingsImage({
      title: seasonName,
      headline: by === 'elo' ? 'POWER RANKINGS' : 'STANDINGS',
      subtitle: `Ranked by ${by === 'elo' ? 'Elo' : 'points'} | After ${nightName}`,
      footer: eventName,
      rows: rankingAfter(night, by),
      format: by === 'elo' ? (v) => v.toLocaleString() : (v) => `${v} PTS`,
    }).toDataURL('image/png');
  }, [night, by, seasonName, nightName, eventName, rankingAfter]);

  const filename = `${seasonName} ${by === 'elo' ? 'power rankings' : 'standings'} - ${nightName}.png`
    .replace(/[\\/:*?"<>|]+/g, '');

  return (
    <div className="panel">
      <header className="ph">
        <h2>Rankings image</h2>
        <span className="rule" />
        <span className="meta">movement is from the night before</span>
      </header>
      <div className="ctl">
        <span className="cap">Ranked by</span>
        <Seg value={by} options={BY} onChange={setBy} label="Ranked by" />
        <span className="cap" style={{ marginLeft: 6 }}>After</span>
        <select value={night} onChange={(e) => setNight(Number(e.target.value))} aria-label="After night">
          {night < 0 && <option value={-1}>No nights yet</option>}
          {nights.map((n, i) => (
            <option key={i} value={i}>{n.name || `Night ${i + 1}`}{n.played ? '' : ' (not played)'}</option>
          ))}
        </select>
        <span className="rule" />
        {image && (
          <a className="gh live" href={image} download={filename}>
            <Download size={12} /> Download PNG
          </a>
        )}
      </div>
      <div className="pb">
        {image
          ? <img src={image} alt={`${seasonName} rankings after ${nightName}`} style={{ display: 'block', width: '100%', maxWidth: 420, margin: '0 auto' }} />
          : <p className="note">Play a night to rank the season.</p>}
      </div>
    </div>
  );
}
