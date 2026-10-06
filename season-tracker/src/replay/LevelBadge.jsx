// A player's level as the game draws it: the laurel for its tier (the game's
// Experience/*.dds, in assets/levels/) with the number in the middle. Shared by
// the replay viewer and the host app's player cards, so its look is all inline
// (replay.css loads only with the viewer). The wreaths are drawn as the game
// draws them, never recoloured. From 60 up the wreath's centre is filled black,
// so the number is white there; below 60 the centre is clear and the number
// takes the page's ink (--lvl-ink / --lvl-paper, which a dark theme swaps).
import { ASSET_BASE } from './host.js';

/** The game's icon tier: floor(level / 10) * 10 (56 -> 50, 100 -> 100, 1..9 -> 0). */
export const levelTier = (level) => Math.min(100, Math.max(0, Math.floor((Number(level) || 0) * 0.1) * 10));

/** Tiers whose wreath has a filled (black) centre the number sits on. */
export const FILLED_FROM_TIER = 60;

/** @param {{ level: number | null | undefined, size?: number }} props */
export function LevelBadge({ level, size = 22 }) {
  if (!level) return null;
  const tier = levelTier(level);
  const [fg, halo] = tier >= FILLED_FROM_TIER ? ['#fff', '#000'] : ['var(--lvl-ink, #000)', 'var(--lvl-paper, #fff)'];
  return (
    <span className="lvl-badge" data-tier={tier} title={`Level ${level}`}
          style={{ position: 'relative', display: 'inline-block', flex: 'none', width: size, height: size, verticalAlign: 'middle' }}>
      <img src={`${ASSET_BASE}levels/${tier}.png`} alt="" width={size} height={size}
           style={{ display: 'block' }} />
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
