// A player's level as the game draws it: the laurel for its tier (the game's
// Experience/*.dds, in assets/levels/) with the number in the middle. Shared by
// the replay viewer and the host app's player cards, so its look is all inline
// (replay.css loads only with the viewer). The wreaths are black ink on clear;
// a dark theme sets --lvl-badge-filter: invert(1), --lvl-ink and --lvl-paper.
import { ASSET_BASE } from './host.js';

/** The game's icon tier: floor(level / 10) * 10 (56 -> 50, 100 -> 100, 1..9 -> 0). */
export const levelTier = (level) => Math.min(100, Math.max(0, Math.floor((Number(level) || 0) * 0.1) * 10));

/** @param {{ level: number | null | undefined, size?: number }} props */
export function LevelBadge({ level, size = 22 }) {
  if (!level) return null;
  const tier = levelTier(level);
  // 100's wreath has a filled centre: the number goes in paper colour on it
  const [fg, halo] = tier === 100 ? ['var(--lvl-paper, #fff)', 'var(--lvl-ink, #000)'] : ['var(--lvl-ink, #000)', 'var(--lvl-paper, #fff)'];
  return (
    <span className="lvl-badge" data-tier={tier} title={`Level ${level}`}
          style={{ position: 'relative', display: 'inline-block', flex: 'none', width: size, height: size, verticalAlign: 'middle' }}>
      <img src={`${ASSET_BASE}levels/${tier}.png`} alt="" width={size} height={size}
           style={{ display: 'block', filter: 'var(--lvl-badge-filter, none)' }} />
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * (level >= 100 ? 0.34 : 0.42)), fontWeight: 700, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums', color: fg, textShadow: `0 0 2px ${halo}, 0 0 1px ${halo}`,
      }}>
        {level}
      </span>
    </span>
  );
}
