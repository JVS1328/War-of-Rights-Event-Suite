import { memo } from 'react';
import { usePrefersReducedMotion } from '../utils/useMediaQuery';
import { seeded } from '../utils/seeded';

/**
 * The season over the board.
 *
 * Laid over the whole plate in screen space - it is sky, not ground, so it
 * holds still while the map pans and zooms under it:
 *
 *   winter  frost creeping in from the edges of the paper, and light snow
 *   spring  morning mist drifting across in slow banks
 *   summer  warm light falling from the top of the plate
 *   autumn  a lowered, darker sky and rain slanting across the board
 *
 * All of it is kept light enough that the ground stays readable underneath.
 * Motion is left out for anyone who has asked their system for less of it.
 *
 * Each season comes in two parts, drawn on separate sheets: what holds still
 * (frost, overcast) is painted once, so what moves (snow, mist, rain) never
 * makes it - or anything under it - paint again.
 */

const W = 1000;
const H = 589;

/** Frost that grows in from the edges: an icy vignette with rime speckled through it. */
const Frost = ({ atlasStyle }) => (
  <>
    <defs>
      <radialGradient id="ss-frost" cx="50%" cy="50%" r="70%">
        <stop offset="40%" stopColor="#eef4f7" stopOpacity="0" />
        <stop offset="75%" stopColor="#eef4f7" stopOpacity="0.42" />
        <stop offset="100%" stopColor="#f7fbfd" stopOpacity="0.85" />
      </radialGradient>
      {/* Rime: fine noise cut hard into specks, kept only where the frost is. */}
      <filter id="ss-rime" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="9" result="n" />
        <feColorMatrix in="n" type="luminanceToAlpha" result="a" />
        <feComponentTransfer in="a" result="specks">
          <feFuncA type="discrete" tableValues="0 0 0 0 0.9 1" />
        </feComponentTransfer>
        <feFlood floodColor="#ffffff" result="white" />
        <feComposite in="white" in2="specks" operator="in" />
      </filter>
      <mask id="ss-frost-mask">
        <rect width={W} height={H} fill="url(#ss-frost)" />
      </mask>
    </defs>
    <rect width={W} height={H} fill="url(#ss-frost)" />
    <rect width={W} height={H} filter="url(#ss-rime)" mask="url(#ss-frost-mask)"
          opacity={atlasStyle ? 0.8 : 0.65} />
  </>
);

/** Light snow falling across the plate. */
const Snow = ({ motion }) => {
  const rand = seeded('winter');
  const flakes = Array.from({ length: 110 }, () => ({
    x: rand() * W, r: 0.9 + rand() * 1.4,
    dur: 10 + rand() * 10, begin: rand() * 12, sway: (rand() - 0.5) * 30,
  }));
  return (
    <>
      {flakes.map((f, i) => (
        <circle key={i} cx={f.x} cy={motion ? -5 : rand() * H} r={f.r} fill="#ffffff"
                opacity={0.85} stroke="#8a97a0" strokeWidth="0.2">
          {motion && (
            <>
              <animate attributeName="cy" values={`-5;${H + 5}`} dur={`${f.dur.toFixed(1)}s`}
                       begin={`${f.begin.toFixed(1)}s`} repeatCount="indefinite" />
              <animate attributeName="cx" values={`${f.x};${f.x + f.sway};${f.x}`} dur={`${(f.dur / 2).toFixed(1)}s`}
                       begin={`${f.begin.toFixed(1)}s`} repeatCount="indefinite" />
            </>
          )}
        </circle>
      ))}
    </>
  );
};

/** Low banks of mist drifting across, thinnest in the middle of the plate. */
const Spring = ({ motion }) => {
  const rand = seeded('spring');
  const banks = Array.from({ length: 5 }, (_, i) => ({
    y: 80 + i * 105 + (rand() - 0.5) * 40, rx: 220 + rand() * 120, ry: 38 + rand() * 20,
    dur: 70 + rand() * 50, begin: -rand() * 70,
  }));
  return (
    <>
      <defs>
        <radialGradient id="ss-mist">
          <stop offset="0%" stopColor="#f6f3e8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f6f3e8" stopOpacity="0" />
        </radialGradient>
      </defs>
      {banks.map((b, i) => (
        <ellipse key={i} cx={motion ? -b.rx : W * rand()} cy={b.y} rx={b.rx} ry={b.ry} fill="url(#ss-mist)">
          {motion && (
            <animate attributeName="cx" values={`${-b.rx};${W + b.rx}`} dur={`${b.dur.toFixed(0)}s`}
                     begin={`${b.begin.toFixed(0)}s`} repeatCount="indefinite" />
          )}
        </ellipse>
      ))}
    </>
  );
};

/** Warm light falling across the plate from the top. */
const Summer = ({ motion }) => (
  <>
    <defs>
      <radialGradient id="ss-sun" cx="30%" cy="-10%" r="95%">
        <stop offset="0%" stopColor="#f5c860" stopOpacity="0.32" />
        <stop offset="60%" stopColor="#f5c860" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#f5c860" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width={W} height={H} fill="url(#ss-sun)">
      {motion && <animate attributeName="opacity" values="1;0.8;1" dur="14s" repeatCount="indefinite" />}
    </rect>
  </>
);

/** A lowered sky, heaviest at the top. */
const Overcast = () => (
  <>
    <defs>
      <linearGradient id="ss-overcast" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#35322e" stopOpacity="0.34" />
        <stop offset="60%" stopColor="#35322e" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#35322e" stopOpacity="0.08" />
      </linearGradient>
    </defs>
    <rect width={W} height={H} fill="url(#ss-overcast)" />
  </>
);

/** Rain slanting across the whole board. */
const Rain = ({ motion }) => {
  const rand = seeded('autumn');
  const streaks = Array.from({ length: 90 }, () => ({
    x: rand() * (W + 200) - 100, y: rand() * H, len: 7 + rand() * 6,
    dur: 0.8 + rand() * 0.6, begin: rand() * 1.4,
  }));
  const slant = -0.3;
  return (
    <>
      <g stroke="#2a2a30" strokeWidth="0.55" strokeLinecap="round" opacity="0.32">
        {streaks.map((s, i) => (
          <g key={i}>
            <line x1={s.x} y1={s.y} x2={s.x + slant * s.len} y2={s.y + s.len} />
            {motion && (
              <animateTransform attributeName="transform" type="translate"
                                values={`${-slant * H / 2},${-H / 2};${slant * H / 2},${H / 2}`}
                                dur={`${s.dur.toFixed(2)}s`} begin={`${s.begin.toFixed(2)}s`}
                                repeatCount="indefinite" />
            )}
          </g>
        ))}
      </g>
    </>
  );
};

const SKIES = {
  winter: { still: Frost, moving: Snow },
  spring: { moving: Spring },
  summer: { moving: Summer },
  autumn: { still: Overcast, moving: Rain },
};

/**
 * @param {Object} props
 * @param {'winter'|'spring'|'summer'|'autumn'|null} props.season
 * @param {boolean} props.atlasStyle
 * @param {'still'|'moving'} props.part - which half of the sky to draw
 */
const SeasonSky = ({ season, atlasStyle, part }) => {
  const motion = !usePrefersReducedMotion();
  const Sky = SKIES[season]?.[part];
  if (!Sky) return null;
  return (
    <g className="pointer-events-none" aria-hidden="true">
      <Sky atlasStyle={atlasStyle} motion={motion} />
    </g>
  );
};

export default memo(SeasonSky);
