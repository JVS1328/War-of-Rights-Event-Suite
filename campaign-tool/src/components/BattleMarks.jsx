import { memo } from 'react';
import { usePrefersReducedMotion } from '../utils/useMediaQuery';
import { seeded } from '../utils/seeded';

/**
 * Battle marks on the plate.
 *
 * Every site carries an engraved sign that reads at any zoom - the two
 * lines while the fight is on, crossed sabres in ink once it is over. Round
 * it:
 *
 *   active     the engagement in the field atlas's signs: each side a few
 *              short brigade lines in its colours with its guns massed in a
 *              battery on the flank, an arrow for the attack; volleys
 *              rolling down each front in turn, the batteries between, and
 *              the smoke drifting over it all.
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
 * asked their system for less of it. Smoke is soft-edged by its gradient
 * rather than by a filter, which would have to be run again every frame.
 */

const INK = '#241d13';
const PALETTE = {
  atlas: { smoke: '#f3ead3', shade: '#8a7448', haze: '#d9ccad', ink: INK, halo: '#efe5cc' },
  screen: { smoke: '#e5e7eb', shade: '#4b5563', haze: '#9ca3af', ink: '#1e293b', halo: '#f8fafc' },
};
const VICTOR = { USA: '#2f4d7e', CSA: '#8f2c25', NEUTRAL: '#8b7d5a' };
const FIRE = { core: '#fff3c4', flame: '#f2b544', edge: '#b4531a' };

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

// Smoke is denser than a wash, with a soft rim instead of a filtered one.
const PUFF_COLORS = Object.values(PALETTE).flatMap(p => [p.smoke, p.shade]);
const puffId = (color) => `bm-puff-${color.slice(1)}`;

/** Radial fades: [stop offset, opacity] pairs, one gradient per colour. */
const FADES = [
  { colors: WASH_COLORS, id: washId, stops: [[0, 1], [0.55, 0.6], [1, 0]] },
  { colors: PUFF_COLORS, id: puffId, stops: [[0, 1], [0.6, 0.85], [1, 0]] },
];

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
  const body = (dx, dy, color, strength) => {
    const cx = x + dx, cy = y + dy;
    const fill = `url(#${puffId(color)})`;
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
        <animateTransform attributeName="transform" type="translate" values={`0,0;${drift.x},${drift.y}`}
                          dur={dur} begin={begin} repeatCount="indefinite" />
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

// The field signs' sizes, in viewBox units before a site's scale - small
// enough that a whole engagement sits inside a county.
const FIELD = {
  gap: 3.4,                         // each side's front from the middle of the field
  line: { length: 2.3, depth: 0.9 }, // one brigade's line
  lines: [-5.8, -2.5, 0.8],         // where a side's brigades stand along its front
  stagger: 1.2,                     // how far a brigade stands out of line with the rest
  battery: { x: 4.4, y: -1.4, guns: 3, spacing: 1.3 }, // massed on the flank, a little back
};

/*
 * The signs below are drawn in a side's own frame: x runs along its front and
 * +y points at the enemy. The defender is the same drawing turned half about,
 * so each sign is written once, facing forward, and the two batteries stand
 * on opposite flanks.
 */

/** Where one side's brigades and guns stand, a little out of line so it reads as an army, not a ruler. */
const formation = (rand, s) => ({
  lines: FIELD.lines.map(x => ({ x: x * s, y: (rand() - 0.5) * FIELD.stagger * s })),
  guns: Array.from({ length: FIELD.battery.guns }, (_, k) => ({
    x: (FIELD.battery.x + k * FIELD.battery.spacing) * s,
    y: FIELD.battery.y * s,
  })),
});

/** A brigade in line: a bar in its side's colour, ruled in ink over a paper halo. */
const InfantryLine = ({ x, y, fill, colors, s }) => {
  const w = FIELD.line.length * s, h = FIELD.line.depth * s, pad = 0.5 * s;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2 - pad} y={-h / 2 - pad} width={w + 2 * pad} height={h + 2 * pad}
            rx={0.4 * s} fill={colors.halo} opacity="0.9" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={fill} stroke={colors.ink} strokeWidth={0.22 * s} />
    </g>
  );
};

/** A gun of the battery: the carriage across, the barrel run out toward the enemy. */
const Gun = ({ x, y, fill, colors, s }) => {
  const parts = (
    <>
      <line x1={x - 0.5 * s} y1={y} x2={x + 0.5 * s} y2={y} />
      <line x1={x} y1={y - 0.4 * s} x2={x} y2={y + 1.3 * s} />
    </>
  );
  return (
    <g strokeLinecap="round">
      <g stroke={colors.halo} strokeWidth={1.1 * s}>{parts}</g>
      <g stroke={colors.ink} strokeWidth={0.7 * s}>{parts}</g>
      <g stroke={fill} strokeWidth={0.38 * s}>{parts}</g>
    </g>
  );
};

/** The attack: an engraved arrow run from the attacker's front toward the defender's. */
const AttackArrow = ({ y1, y2, fill, colors, s }) => {
  const shaft = 0.28 * s, flare = 0.46 * s, barb = 1.25 * s, head = 1.55 * s, notch = 0.45 * s;
  const yh = y2 - head;
  const d = `M${-shaft},${y1} L0,${y1 + notch} L${shaft},${y1} L${flare},${yh} L${barb},${yh}`
    + ` L0,${y2} L${-barb},${yh} L${-flare},${yh} Z`;
  return (
    <g strokeLinejoin="round">
      <path d={d} fill={colors.halo} stroke={colors.halo} strokeWidth={0.9 * s} />
      <path d={d} fill={fill} stroke={colors.ink} strokeWidth={0.24 * s} />
    </g>
  );
};

const ActiveSite = ({ site, s, colors, motion }) => {
  const rand = seeded(site.id);
  const rain = RAIN[site.weather];
  const damp = rain ? rain.damp : 1;
  const drift = { x: WIND.x * 0.7 * s * damp, y: WIND.y * 0.7 * s * damp };

  // The field lies square to the wind, so each side's smoke rolls across it.
  const angle = Math.atan2(WIND.y, WIND.x) + Math.PI / 2 + (rand() - 0.5) * 0.6;
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -along.y, y: along.x };
  const world = (x, y) => ({ x: site.x + along.x * x + across.x * y, y: site.y + along.y * x + across.y * y });

  const attacker = site.attacker;
  const defender = attacker === 'USA' ? 'CSA' : attacker === 'CSA' ? 'USA' : null;
  const gap = FIELD.gap * s;
  const depth = FIELD.line.depth * s;

  // Volleys roll down one front, then the other answers; the batteries
  // speak on a slower beat between them.
  const cycle = 3.2;
  const sides = [
    { holder: attacker, y: -gap, facing: 1, volleyAt: 0, gunsAt: 1.1 },
    { holder: defender, y: gap, facing: -1, volleyAt: cycle / 2, gunsAt: 2.7 },
  ].map(side => {
    const fill = VICTOR[side.holder] || VICTOR.NEUTRAL;
    const { lines, guns } = formation(rand, s);
    // A point in the side's own frame, out on the map. Fire is thrown
    // forward, toward the enemy.
    const dir = (Math.atan2(across.y * side.facing, across.x * side.facing) * 180) / Math.PI;
    const at = (x, y) => ({ ...world(side.facing * x, side.y + side.facing * y), dir });
    const muskets = lines.map((l, k) => ({ ...at(l.x, l.y + depth / 2 + 0.5 * s), begin: side.volleyAt + k * 0.25 }));
    // Just off the muzzle, so the burst never sits on the gun itself.
    const cannon = guns.map((g, k) => ({ ...at(g.x, g.y + 1.8 * s), begin: side.gunsAt + k * 0.35 }));
    const battery = at(guns[1].x, guns[1].y + 1.8 * s);
    return { ...side, fill, lines, guns, muskets, cannon, battery };
  });

  // A muzzle flash as an engraver cuts one: a bright core with fire thrown
  // forward in three tongues. Here for an instant, then gone.
  const burst = (p, size, dur, key) => {
    const u = (n) => (n * size).toFixed(2);
    const d = `M0,${u(-0.25)} L${u(1.5)},0 L0,${u(0.25)} Z`
      + ` M0,${u(-0.2)} L${u(1.05)},${u(-0.72)} L${u(0.15)},${u(0.1)} Z`
      + ` M0,${u(0.2)} L${u(1.05)},${u(0.72)} L${u(0.15)},${u(-0.1)} Z`;
    return (
      <g key={key} transform={`translate(${p.x},${p.y}) rotate(${p.dir})`} opacity="0">
        <path d={d} fill={FIRE.flame} stroke={FIRE.edge} strokeWidth={0.1 * size} strokeLinejoin="round" />
        <circle r={0.3 * size} fill={FIRE.core} />
        <animate attributeName="opacity" values="0;1;0.3;0;0" keyTimes="0;0.02;0.06;0.14;1"
                 dur={`${dur}s`} begin={`${p.begin.toFixed(2)}s`} repeatCount="indefinite" />
      </g>
    );
  };

  return (
    <g>
      {SKY[site.time] && (
        <Wash x={site.x} y={site.y} r={26 * s} motion={motion}
              color={SKY[site.time].color} opacity={SKY[site.time].opacity} />
      )}
      {rain?.wash > 0 && (
        <Wash x={site.x} y={site.y} r={26 * s} motion={motion}
              color={INCLEMENT_WASH} opacity={rain.wash} />
      )}
      <Wash x={site.x} y={site.y} r={20 * s} color={colors.haze}
            opacity={0.6 * damp} breathe="7s" motion={motion} />

      {/* Smoke off each brigade and each battery, and a slower bank the
          fight has already put up. */}
      {sides.flatMap(side => [
        ...side.muskets.map((p, k) => (
          <Puff key={`m-${side.facing}-${k}`} x={p.x} y={p.y} motion={motion} colors={colors} drift={drift}
                r={(4 + rand() * 2.5) * s} peak={(0.75 + rand() * 0.2) * damp}
                dur={`${(5 + rand() * 3).toFixed(2)}s`} begin={`${(p.begin + rand() * 5).toFixed(2)}s`} />
        )),
        <Puff key={`g-${side.facing}`} x={side.battery.x} y={side.battery.y} motion={motion} colors={colors} drift={drift}
              r={6 * s} peak={0.85 * damp}
              dur={`${(6 + rand() * 3).toFixed(2)}s`} begin={`${(side.gunsAt + rand() * 4).toFixed(2)}s`} />,
      ])}
      {[0, 1].map(i => (
        <Puff key={`bank-${i}`} motion={motion} colors={colors} drift={drift}
              x={site.x + (rand() - 0.2) * 8 * s} y={site.y + (rand() - 0.6) * 6 * s}
              r={(9 + rand() * 4) * s} peak={0.5 * damp}
              dur={`${(10 + rand() * 4).toFixed(2)}s`} begin={`${(rand() * 8).toFixed(2)}s`} />
      ))}

      {/* The engagement as the atlas signs it: each side's brigades in line,
          its guns massed in a battery on the flank, and the attack arrowed in. */}
      <g transform={`translate(${site.x},${site.y}) rotate(${(angle * 180) / Math.PI})`}>
        {sides.map(side => (
          <g key={side.facing} transform={`translate(0,${side.y}) rotate(${side.facing === 1 ? 0 : 180})`}>
            {side.lines.map((l, k) => (
              <InfantryLine key={k} x={l.x} y={l.y} fill={side.fill} colors={colors} s={s} />
            ))}
            {side.guns.map((g, k) => (
              <Gun key={k} x={g.x} y={g.y} fill={side.fill} colors={colors} s={s} />
            ))}
          </g>
        ))}
        {attacker && (
          <AttackArrow y1={-gap + depth / 2 + 0.8 * s} y2={gap - depth / 2 - 0.7 * s}
                       fill={sides[0].fill} colors={colors} s={s} />
        )}
      </g>

      {motion && sides.flatMap(side => [
        ...side.muskets.map((p, k) => burst(p, 0.8 * s, cycle, `f-${side.facing}-${k}`)),
        ...side.cannon.map((p, k) => burst(p, 0.9 * s, cycle * 2, `c-${side.facing}-${k}`)),
      ])}

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
      {[0, 1, 2].map(i => (
        <Puff key={i} motion={motion} colors={colors} drift={drift}
              x={site.x + (rand() - 0.5) * 16 * s} y={site.y + (rand() - 0.5) * 10 * s}
              r={(10 + rand() * 5) * s} peak={0.6}
              dur={`${(11 + rand() * 5).toFixed(2)}s`} begin={`${(rand() * 9).toFixed(2)}s`} />
      ))}

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
  const R = 24 * s;
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
        {/* Discs that fade to nothing at the rim: the washes, and the smoke. */}
        {FADES.flatMap(fade => fade.colors.map(color => (
          <radialGradient key={fade.id(color)} id={fade.id(color)}>
            {fade.stops.map(([offset, opacity]) => (
              <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
            ))}
          </radialGradient>
        )))}
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

export default memo(BattleMarks);
