import { usePrefersReducedMotion } from '../utils/useMediaQuery';
import { seeded } from '../utils/seeded';

/**
 * Battle marks on the plate.
 *
 * Every site carries an engraved sign that reads at any zoom - the two
 * lines while the fight is on, crossed sabres in ink once it is over. Round
 * it:
 *
 *   active     two engraved infantry lines facing each other in their
 *              sides' colours, volleys rolling down each front in turn,
 *              and powder smoke drifting off them over the field.
 *   aftermath  the sabres ringed in the victor's colour, a scorched stain,
 *              a thinning haze, and a few wisps still rising off the field.
 *   holding    ground taken but not yet consolidated, after the smoke has
 *              gone: just the ringed sabres.
 *
 * While captured ground is still consolidating, the ring shows the handover:
 * the old holder's colour with the new one's filling in clockwise from the
 * top, a tick for each turn of it, closing when the capture completes.
 *
 * The battle's rolled conditions set the sky over it: rain and inclement
 * weather slant ink rain across the site and damp the smoke down; dawn,
 * dusk and night wash it in their light, which is what makes the flashes
 * carry.
 *
 * Everything is drawn in the plate's own paper, sepia and ink, so it sits on
 * the atlas like the rest of the engraving; the screen plate swaps in greys.
 * The whole board shares one wind. Motion is left out for anyone who has
 * asked their system for less of it.
 */

const INK = '#241d13';
const PALETTE = {
  atlas: { smoke: '#f3ead3', shade: '#8a7448', haze: '#d9ccad', ink: INK, halo: '#efe5cc' },
  screen: { smoke: '#e5e7eb', shade: '#4b5563', haze: '#9ca3af', ink: '#1e293b', halo: '#f8fafc' },
};
const VICTOR = { USA: '#2f4d7e', CSA: '#8f2c25', NEUTRAL: '#8b7d5a' };
const FLASH = ['#e0662a', '#f2b544', '#b4531a'];

// One wind for the whole board, in viewBox units per puff lifetime.
const WIND = { x: 16, y: -6 };

const SKY = {
  night: { color: '#1b2140', opacity: 0.5 },
  dusk: { color: '#b4531a', opacity: 0.38 },
  dawn: { color: '#e8c07a', opacity: 0.45 },
};
const RAIN = {
  rain: { streaks: 16, length: 5, width: 0.45, opacity: 0.45, damp: 0.7, wash: 0 },
  inclement: { streaks: 30, length: 7, width: 0.6, opacity: 0.6, damp: 0.5, wash: 0.22 },
};

/** The period battle sign: two sabres crossed, inked over a paper halo. */
const Sabres = ({ x, y, s, ink, halo, opacity = 1 }) => {
  const blade = 'M-5.2,5.2 L4.2,-4.2 Q5.3,-5.4 5.6,-5.6 Q5.4,-5.1 4.4,-4.0 Z';
  const guard = 'M-4.4,2.9 L-2.9,4.4';
  const hilt = 'M-5.4,5.4 L-4.1,4.1';
  const one = (flip) => (
    <g transform={flip ? 'scale(-1,1)' : undefined}>
      <path d={blade} />
      <path d={guard} fill="none" />
      <path d={hilt} fill="none" strokeWidth="1.1" />
    </g>
  );
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} opacity={opacity}>
      <g fill={halo} stroke={halo} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {one(false)}{one(true)}
      </g>
      <g fill={ink} stroke={ink} strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round">
        {one(false)}{one(true)}
      </g>
    </g>
  );
};

// Every colour a wash is laid in; each gets its own fading gradient.
const INCLEMENT_WASH = '#4d5a63';
const SCORCH = '#4a3a26';
const WASH_COLORS = [
  PALETTE.atlas.haze, PALETTE.screen.haze, INCLEMENT_WASH, SCORCH,
  ...Object.values(SKY).map(sky => sky.color),
];
const washId = (color) => `bm-wash-${color.slice(1)}`;

/** A soft disc of colour laid under a site: haze, or the light of the hour. */
const Wash = ({ x, y, r, color, opacity, breathe, motion }) => (
  <circle cx={x} cy={y} r={r} fill={`url(#${washId(color)})`} opacity={opacity}>
    {motion && breathe && (
      <animate attributeName="opacity" values={`${opacity};${opacity * 0.7};${opacity}`}
               dur={breathe} repeatCount="indefinite" />
    )}
  </circle>
);

/** One puff of powder smoke: grows, drifts downwind, thins out. */
const Puff = ({ x, y, r, peak, dur, begin, colors, drift, motion }) => {
  const body = (dx, dy, fill, strength) => {
    const cx = x + dx, cy = y + dy;
    if (!motion) {
      return <circle cx={cx + drift.x * 0.4} cy={cy + drift.y * 0.4} r={r * 0.75} fill={fill} opacity={peak * strength * 0.8} />;
    }
    return (
      <circle cx={cx} cy={cy} r={r * 0.2} fill={fill} opacity="0">
        <animate attributeName="r" values={`${r * 0.2};${r * 0.75};${r}`} keyTimes="0;0.35;1"
                 dur={dur} begin={begin} repeatCount="indefinite" />
        <animate attributeName="opacity"
                 values={`0;${peak * strength};${peak * strength * 0.75};0`} keyTimes="0;0.15;0.6;1"
                 dur={dur} begin={begin} repeatCount="indefinite" />
        <animate attributeName="cx" values={`${cx};${cx + drift.x}`} dur={dur} begin={begin} repeatCount="indefinite" />
        <animate attributeName="cy" values={`${cy};${cy + drift.y}`} dur={dur} begin={begin} repeatCount="indefinite" />
      </circle>
    );
  };
  // A sepia underside offset down and away from the light gives the cloud
  // some body; the paper-white top sits over it.
  return (
    <>
      {body(r * 0.18, r * 0.22, colors.shade, 0.55)}
      {body(0, 0, colors.smoke, 1)}
    </>
  );
};

/**
 * The engraved infantry sign: a line of company blocks in the side's colour,
 * ruled in ink over a paper halo, its front edge lit toward the enemy. Close
 * ranks carry few, broad companies; an extended line many narrow ones.
 */
const InfantryLine = ({ x, y, angle, length, depth, companies, fill, front, colors, s }) => {
  const seg = length / companies;
  const gap = seg * 0.14;
  const edge = front * depth / 2;
  return (
    <g transform={`translate(${x},${y}) rotate(${(angle * 180) / Math.PI})`}>
      <rect x={-length / 2 - 0.8 * s} y={-depth / 2 - 0.8 * s} width={length + 1.6 * s} height={depth + 1.6 * s}
            rx={0.6 * s} fill={colors.halo} opacity="0.85" />
      {Array.from({ length: companies }, (_, k) => (
        <rect key={k} x={-length / 2 + k * seg + gap / 2} y={-depth / 2} width={seg - gap} height={depth}
              fill={fill} stroke={colors.ink} strokeWidth={0.28 * s} />
      ))}
      <line x1={-length / 2} y1={edge} x2={length / 2} y2={edge}
            stroke={colors.halo} strokeWidth={0.35 * s} opacity="0.9" />
    </g>
  );
};

const ActiveSite = ({ site, s, colors, motion }) => {
  const rand = seeded(site.id);
  const rain = RAIN[site.weather];
  const damp = rain ? rain.damp : 1;
  const drift = { x: WIND.x * s * damp, y: WIND.y * s * damp };

  // Two lines facing each other across the site, square to the wind, so the
  // smoke of one rolls over the ground between them.
  const angle = Math.atan2(WIND.y, WIND.x) + Math.PI / 2 + (rand() - 0.5) * 0.6;
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -along.y, y: along.x };
  const gap = 8 * s;
  const length = 26 * s;
  const depth = 1.8 * s;

  const attacker = site.attacker;
  const defender = attacker === 'USA' ? 'CSA' : attacker === 'CSA' ? 'USA' : null;
  // Volleys roll down one line, then the other answers: one shared cycle.
  const cycle = 3.2;
  const lines = [
    { side: -1, holder: attacker, companies: 5, offset: 0 },
    { side: 1, holder: defender, companies: 9, offset: cycle / 2 },
  ].map(line => {
    const cx = site.x + across.x * gap * line.side;
    const cy = site.y + across.y * gap * line.side;
    // Local +y points across the field, so each line's front faces the other.
    const front = -line.side;
    const muzzle = depth / 2 + 0.8 * s;
    const emitters = Array.from({ length: 6 }, (_, i) => {
      const t = (i - 2.5) * (length / 6) + (rand() - 0.5) * s;
      return {
        x: cx + along.x * t + across.x * muzzle * front,
        y: cy + along.y * t + across.y * muzzle * front,
        begin: line.offset + i * 0.09 + rand() * 0.05,
      };
    });
    return { ...line, cx, cy, front, emitters };
  });

  return (
    <g>
      {SKY[site.time] && (
        <Wash x={site.x} y={site.y} r={36 * s} motion={motion}
              color={SKY[site.time].color} opacity={SKY[site.time].opacity} />
      )}
      {rain?.wash > 0 && (
        <Wash x={site.x} y={site.y} r={36 * s} motion={motion}
              color={INCLEMENT_WASH} opacity={rain.wash} />
      )}
      <Wash x={site.x} y={site.y} r={32 * s} color={colors.haze}
            opacity={0.6 * damp} breathe="7s" motion={motion} />

      <g filter="url(#bm-billow)">
        {lines.flatMap(line => line.emitters).map((e, i) => (
          <Puff key={i} x={e.x} y={e.y} motion={motion} colors={colors} drift={drift}
                r={(8 + rand() * 6) * s} peak={(0.68 + rand() * 0.2) * damp}
                dur={`${(5.5 + rand() * 3).toFixed(2)}s`} begin={`${(e.begin + rand() * 5).toFixed(2)}s`} />
        ))}
        {/* A slower, higher bank of smoke the lines have already put up. */}
        {[0, 1, 2, 3].map(i => (
          <Puff key={`bank-${i}`} motion={motion} colors={colors} drift={drift}
                x={site.x + (rand() - 0.2) * 14 * s} y={site.y + (rand() - 0.6) * 10 * s}
                r={(14 + rand() * 6) * s} peak={0.42 * damp}
                dur={`${(10 + rand() * 4).toFixed(2)}s`} begin={`${(rand() * 8).toFixed(2)}s`} />
        ))}
      </g>

      {lines.map(line => (
        <InfantryLine key={line.side} x={line.cx} y={line.cy} angle={angle} length={length} depth={depth}
                      companies={line.companies} front={line.front} colors={colors} s={s}
                      fill={VICTOR[line.holder] || VICTOR.NEUTRAL} />
      ))}

      {/* The volley rolling down each front, and the other line answering. */}
      {motion && lines.flatMap(line => line.emitters.map((e, i) => {
        const r = (i === 2 ? 2.4 : 1.5) * s;
        return (
          <circle key={`f-${line.side}-${i}`} cx={e.x} cy={e.y} r={r} fill={FLASH[i % FLASH.length]} opacity="0">
            <animate attributeName="opacity" values="0;1;0.25;0;0" keyTimes="0;0.03;0.08;0.18;1"
                     dur={`${cycle}s`} begin={`${e.begin.toFixed(2)}s`} repeatCount="indefinite" />
            <animate attributeName="r" values={`${r * 0.3};${r};${r * 0.6};${r * 0.3};${r * 0.3}`}
                     keyTimes="0;0.03;0.08;0.18;1" dur={`${cycle}s`} begin={`${e.begin.toFixed(2)}s`}
                     repeatCount="indefinite" />
          </circle>
        );
      }))}

      {rain && <Rain site={site} s={s} rain={rain} rand={rand} motion={motion} />}
    </g>
  );
};

/**
 * The victor's ring, ruled in ink either side so it holds on any ground.
 * Ground still changing hands shows how far the handover has come.
 */
const Ring = ({ site, s, colors }) => {
  const t = site.transition;
  const holder = VICTOR[t ? t.to : site.winner];
  if (!holder) return null;
  const r = (t ? 8 : 7.4) * s;
  const band = { cx: site.x, cy: site.y, r, fill: 'none', strokeWidth: (t ? 2.2 : 1.7) * s };
  return (
    <g>
      <circle cx={site.x} cy={site.y} r={r} fill={colors.halo} fillOpacity="0.7"
              stroke={colors.ink} strokeWidth={band.strokeWidth + 0.9 * s} />
      {t ? (
        <>
          <circle {...band} stroke={VICTOR[t.from] || VICTOR.NEUTRAL} />
          <circle {...band} stroke={holder} pathLength="1" strokeDasharray={`${t.progress} 1`}
                  transform={`rotate(-90 ${site.x} ${site.y})`} />
          {Array.from({ length: t.steps }, (_, k) => {
            const a = (k / t.steps) * 2 * Math.PI - Math.PI / 2;
            const c = Math.cos(a), si = Math.sin(a);
            return (
              <line key={k} x1={site.x + c * (r - 1.2 * s)} y1={site.y + si * (r - 1.2 * s)}
                    x2={site.x + c * (r + 1.2 * s)} y2={site.y + si * (r + 1.2 * s)}
                    stroke={colors.ink} strokeWidth={0.45 * s} />
            );
          })}
        </>
      ) : (
        <circle {...band} stroke={holder} />
      )}
    </g>
  );
};

const AftermathSite = ({ site, s, colors, motion }) => {
  const rand = seeded(site.id);
  const drift = { x: WIND.x * s * 0.6, y: WIND.y * s * 0.6 };

  // Held but not yet consolidated, the fighting long over: only the sign.
  if (site.phase === 'holding') {
    return (
      <g>
        <Ring site={site} s={s} colors={colors} />
        <Sabres x={site.x} y={site.y} s={s * 0.8} ink={colors.ink} halo={colors.halo} opacity={0.9} />
      </g>
    );
  }

  return (
    <g>
      {/* The ground itself marked: a scorched stain on the paper, and the
          last of the smoke thinning over it. */}
      <Wash x={site.x} y={site.y} r={16 * s} color={SCORCH} opacity={0.35} />
      <Wash x={site.x} y={site.y} r={26 * s} color={colors.haze}
            opacity={0.5} breathe="11s" motion={motion} />
      <g filter="url(#bm-billow)">
        {[0, 1, 2, 3, 4].map(i => (
          <Puff key={i} motion={motion} colors={colors} drift={drift}
                x={site.x + (rand() - 0.5) * 16 * s} y={site.y + (rand() - 0.5) * 10 * s}
                r={(9 + rand() * 5) * s} peak={0.5}
                dur={`${(11 + rand() * 5).toFixed(2)}s`} begin={`${(rand() * 9).toFixed(2)}s`} />
        ))}
      </g>

      {/* Smoke still going up off the field in thin threads. */}
      {motion && [0, 1, 2].map(i => {
        const x = site.x + (i - 1) * 5 * s + (rand() - 0.5) * 2 * s;
        const y = site.y + (rand() - 0.2) * 3 * s;
        const dur = `${(4 + rand() * 3).toFixed(2)}s`;
        const begin = `${(rand() * 4).toFixed(2)}s`;
        return (
          <path key={`w-${i}`} fill="none" stroke={colors.shade} strokeWidth={0.7 * s} strokeLinecap="round"
                d={`M${x},${y} q${-2 * s},${-3 * s} 0,${-6 * s} t0,${-6 * s}`} opacity="0">
            <animate attributeName="opacity" values="0;0.55;0" dur={dur} begin={begin} repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="translate" values={`0,0;${drift.x * 0.4},${-8 * s}`}
                              dur={dur} begin={begin} repeatCount="indefinite" />
          </path>
        );
      })}

      <Ring site={site} s={s} colors={colors} />
      <Sabres x={site.x} y={site.y} s={s * 0.8} ink={colors.ink} halo={colors.halo} opacity={0.9} />
    </g>
  );
};

/** Ink rain slanting across a site, clipped to a disc so it stays local. */
const Rain = ({ site, s, rain, rand, motion }) => {
  const R = 32 * s;
  const clipId = `bm-rain-${site.id}`;
  const slant = { x: -0.35, y: 1 };
  return (
    <g clipPath={`url(#${clipId})`}>
      <clipPath id={clipId}>
        <circle cx={site.x} cy={site.y} r={R} />
      </clipPath>
      {Array.from({ length: rain.streaks }, (_, i) => {
        const x = site.x + (rand() * 2 - 1) * R;
        const y = site.y + (rand() * 2 - 1) * R;
        const len = rain.length * s;
        const line = (
          <line x1={x} y1={y} x2={x + slant.x * len} y2={y + slant.y * len}
                stroke={INK} strokeWidth={rain.width * s} strokeLinecap="round" opacity={rain.opacity} />
        );
        if (!motion) return <g key={i}>{line}</g>;
        const fall = 2 * R;
        const dur = `${(0.6 + rand() * 0.5).toFixed(2)}s`;
        return (
          <g key={i}>
            {line}
            <animateTransform attributeName="transform" type="translate"
                              values={`${-slant.x * fall / 2},${-fall / 2};${slant.x * fall / 2},${fall / 2}`}
                              dur={dur} begin={`${(rand()).toFixed(2)}s`} repeatCount="indefinite" />
          </g>
        );
      })}
    </g>
  );
};

/**
 * @param {Object} props
 * @param {Array<{id, x, y, phase: 'active'|'aftermath'|'holding', attacker?, weather?, time?, winner?,
 *   transition?: { from, to, progress, steps }}>} props.sites
 * @param {boolean} props.atlasStyle
 * @param {number} [props.scale=1] - Size of a site's marks in viewBox units; larger on coarser maps.
 */
const BattleMarks = ({ sites, atlasStyle, scale = 1 }) => {
  const motion = !usePrefersReducedMotion();
  if (!sites?.length) return null;
  const colors = atlasStyle ? PALETTE.atlas : PALETTE.screen;

  return (
    <g className="pointer-events-none" aria-hidden="true">
      <defs>
        {/* Billowing edges for the smoke. The turbulence holds still; the
            puffs moving through it are what make it roll. */}
        <filter id="bm-billow" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={5 * scale}
                             xChannelSelector="R" yChannelSelector="G" result="billow" />
          <feGaussianBlur in="billow" stdDeviation={0.6 * scale} />
        </filter>
        {/* Discs that fade to nothing at the rim, one per wash colour. */}
        {WASH_COLORS.map(color => (
          <radialGradient key={color} id={washId(color)}>
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="55%" stopColor={color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {/* Aftermath first, so a fresh fight is never drawn under an old one. */}
      {sites.filter(site => site.phase !== 'active').map(site => (
        <AftermathSite key={site.id} site={site} s={scale} colors={colors} motion={motion} />
      ))}
      {sites.filter(site => site.phase === 'active').map(site => (
        <ActiveSite key={site.id} site={site} s={scale} colors={colors} motion={motion} />
      ))}
    </g>
  );
};

export default BattleMarks;
