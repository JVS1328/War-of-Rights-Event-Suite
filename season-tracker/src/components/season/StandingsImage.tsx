/**
 * Standings → a shareable rankings card, by points or by Elo, after any night,
 * across the league or by division, with each unit's movement since the night
 * before. The tracker supplies the ranking; one of two styles draws it — the
 * broadside (utils/standingsImage) or the 1860s newspaper (utils/gazetteImage).
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import '@fontsource/alfa-slab-one/400.css';
import '@fontsource-variable/oswald';
import '@fontsource/unifrakturmaguntia/400.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/im-fell-english-sc/400.css';
import { Seg } from '../Shell';
import { CARD_FONTS, drawStandingsImage } from '../../utils/standingsImage';
import { GAZETTE_FONTS, drawGazetteImage } from '../../utils/gazetteImage';
import { loadImage } from '../../utils/unitLogo';
import type { RankingGroup, RankingRow, StandingsCard } from '../../utils/standingsImage';

export type RankBy = 'points' | 'elo';
type Layout = 'league' | 'division';
type Style = 'broadside' | 'gazette';

export interface Ranking {
  league: RankingRow[];
  divisions: RankingGroup[];
}

const BY: { key: RankBy; label: string }[] = [
  { key: 'points', label: 'Points' },
  { key: 'elo', label: 'Elo' },
];
const NO_LOGOS: Record<string, string> = {};
const LAYOUT: { key: Layout; label: string }[] = [
  { key: 'league', label: 'League' },
  { key: 'division', label: 'By division' },
];

/** The two looks: how each draws, and the fonts it needs before it can. */
const STYLES: Record<Style, { label: string; fonts: string[]; draw: (card: StandingsCard) => HTMLCanvasElement }> = {
  broadside: { label: 'Broadside', fonts: CARD_FONTS, draw: drawStandingsImage },
  gazette: { label: '1860s newspaper', fonts: GAZETTE_FONTS, draw: drawGazetteImage },
};
const STYLE_OPTIONS = (Object.keys(STYLES) as Style[]).map((key) => ({ key, label: STYLES[key].label }));

/** A style's fonts, fetched once on first use — a canvas draws in a fallback face until they land. */
const fontsLoading: Partial<Record<Style, Promise<void>>> = {};
const loadFonts = (style: Style) =>
  (fontsLoading[style] ??= Promise.all(STYLES[style].fonts.map((f) => document.fonts.load(f))).then(() => undefined, () => undefined));

/** The style last picked in this browser — a convenience, so any failure just means the default. */
const STYLE_KEY = 'rankingsImageStyle';
const savedStyle = (): Style => {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return v === 'gazette' || v === 'broadside' ? v : 'broadside';
  } catch {
    return 'broadside';
  }
};

export function StandingsImagePanel({
  eventName,
  seasonName,
  nights,
  rankingAfter,
  defaultBy = 'points',
  logos = NO_LOGOS,
  children,
}: {
  eventName: string;
  seasonName: string;
  /** The season's nights in order; the card defaults to the last one played. */
  nights: { name: string; played: boolean }[];
  rankingAfter: (nightIdx: number, by: RankBy) => Ranking;
  defaultBy?: RankBy;
  /** Each unit's logo in this season, as an image URL. Keep it memoized — a new object redraws the card. */
  logos?: Record<string, string>;
  /** Drawn under the preview — the tracker puts the logo editor here. */
  children?: ReactNode;
}) {
  const lastPlayed = nights.map((n) => n.played).lastIndexOf(true);
  const [by, setBy] = useState<RankBy>(defaultBy);
  const [layout, setLayout] = useState<Layout>('league');
  const [night, setNight] = useState(lastPlayed);
  const [style, setStyle] = useState<Style>(savedStyle);
  const [fontsReady, setFontsReady] = useState<Style | null>(null);
  // A night played since the panel opened moves the default along with it.
  useEffect(() => setNight(lastPlayed), [lastPlayed]);
  useEffect(() => {
    let alive = true;
    void loadFonts(style).then(() => { if (alive) setFontsReady(style); });
    try { localStorage.setItem(STYLE_KEY, style); } catch { /* private window: forget it */ }
    return () => { alive = false; };
  }, [style]);

  // Logos decoded for the canvas. One that will not decode is left off.
  const [decoded, setDecoded] = useState<Map<string, HTMLImageElement> | null>(null);
  useEffect(() => {
    let alive = true;
    setDecoded(null);
    void Promise.all(Object.entries(logos).map(([unit, src]) =>
      loadImage(src).then((img) => [unit, img] as const, () => null)))
      .then((pairs) => { if (alive) setDecoded(new Map(pairs.filter((p) => p !== null))); });
    return () => { alive = false; };
  }, [logos]);

  const ranking = useMemo(() => (night < 0 ? null : rankingAfter(night, by)), [night, by, rankingAfter]);
  const hasDivisions = (ranking?.divisions.length ?? 0) > 0;
  const byDivision = hasDivisions && layout === 'division';
  const nightName = nights[night]?.name || `Night ${night + 1}`;
  const headline = by === 'elo' ? 'POWER RANKINGS' : 'STANDINGS';

  const image = useMemo(() => {
    if (!ranking || fontsReady !== style || !decoded) return null;
    return STYLES[style].draw({
      kicker: eventName,
      title: seasonName,
      headline,
      night: nightName,
      nightNumber: night + 1,
      subtitle: `Ranked by ${by === 'elo' ? 'Elo rating' : 'points'}${byDivision ? ' · by division' : ''} · after ${nightName}`,
      rows: ranking.league,
      groups: byDivision ? ranking.divisions : undefined,
      format: by === 'elo' ? (v) => v.toLocaleString() : (v) => `${v} PTS`,
      logos: decoded,
      // Points only build, so lines share one scale; a rating's ups and downs read on its own.
      trend: by === 'elo' ? 'own' : 'shared',
    }).toDataURL('image/png');
  }, [ranking, fontsReady, style, decoded, eventName, seasonName, headline, nightName, by, byDivision]);

  const filename = `${seasonName} ${headline.toLowerCase()}${byDivision ? ' by division' : ''} - ${nightName}.png`
    .replace(/[\\/:*?"<>|]+/g, '');

  return (
    <div className="panel">
      <header className="ph">
        <h2>Rankings image</h2>
        <span className="rule" />
        <span className="meta">movement is from the night before</span>
      </header>
      <div className="ctl">
        <span className="cap">Style</span>
        <Seg value={style} options={STYLE_OPTIONS} onChange={setStyle} label="Style" />
        <span className="cap" style={{ marginLeft: 6 }}>Ranked by</span>
        <Seg value={by} options={BY} onChange={setBy} label="Ranked by" />
        {hasDivisions && <Seg value={layout} options={LAYOUT} onChange={setLayout} label="Layout" />}
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
          ? <img src={image} alt={`${seasonName} ${headline.toLowerCase()} after ${nightName}`} style={{ display: 'block', width: '100%', maxWidth: 440, margin: '0 auto' }} />
          : <p className="note">{ranking ? 'Drawing…' : 'Play a night to rank the season.'}</p>}
        {children}
      </div>
    </div>
  );
}
