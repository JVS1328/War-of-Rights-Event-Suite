/**
 * A weekly rankings card as a PNG, set like a wartime broadside: aged paper, a
 * seal for the night, the leader on a card of its own and the rest on banners,
 * each with the places it moved since the night before and its season trend.
 * By division, each division gets a ribbon, its own ranks and a playoff line.
 *
 * Drawn straight onto a canvas at twice its layout size, so the download stays
 * sharp when Discord or a phone scales it. Knows nothing about seasons — the
 * caller hands it ranked rows and the words to print.
 */

export interface RankingRow {
  rank: number;
  unit: string;
  value: number;
  /** Places gained (positive) or lost since the night before; null for none. */
  move: number | null;
  division?: string | null;
  /** The value after each night so far, oldest first. */
  series?: number[];
}

export interface RankingGroup {
  name: string;
  /** How many of the group reach the playoffs; a line is drawn under them. */
  cutoff?: number | null;
  rows: RankingRow[];
}

export interface StandingsCard {
  /** Small caps over the title, e.g. the event's name. */
  kicker: string;
  /** e.g. the season's name. */
  title: string;
  /** The big word: "STANDINGS". */
  headline: string;
  /** The night it is after, as named, e.g. "Week 7" — the seal reads it (see sealText). */
  night: string;
  /** Which night of the season that is, from 1 — the seal's fallback. */
  nightNumber: number;
  subtitle: string;
  /** The whole league, ranked. Also where the night's movers are read from. */
  rows: RankingRow[];
  /** When given, the card is drawn by division instead of as one table. */
  groups?: RankingGroup[];
  /** How a row's value is printed, e.g. `14 PTS`. */
  format: (value: number) => string;
  /**
   * Unit logos, already decoded. With any at all, every row gets a plate —
   * initials stand in for a unit without one, so the names still line up.
   */
  logos?: Map<string, HTMLImageElement>;
}

const SLAB = '"Alfa Slab One", Rockwell, Georgia, serif';
const COND = '"Oswald Variable", "Arial Narrow", system-ui, sans-serif';

/** Font specs to load before drawing, or the canvas falls back silently. */
export const CARD_FONTS = [`400 40px ${SLAB}`, `600 20px ${COND}`];

const W = 1080;
const SCALE = 2;
const PAD = 60;
const L = PAD;
const R = W - PAD;

const C = {
  paper: '#ebe0bd',
  band: '#f6f0dc',
  red: '#c8321f',
  redDeep: '#8a2114',
  ink: '#231d18',
  muted: '#6f604c',
  white: '#fffaf0',
  gold: '#c3922a',
  goldLight: '#f2d27a',
  silver: '#858b93',
  bronze: '#a4602d',
  up: '#2d6a3a',
  flat: '#4a4036',
};

type Ctx = CanvasRenderingContext2D;
type Align = 'left' | 'center' | 'right';

const moveColor = (move: number | null) => (!move ? C.flat : move > 0 ? C.up : C.red);

// ── Type ─────────────────────────────────────────────────────────────────────

/** Letter-spaced text, drawn a glyph at a time so every browser spaces it alike. */
function spaced(ctx: Ctx, text: string, x: number, y: number, spacing: number, align: Align = 'left') {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, widths.length - 1);
  let at = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, at, y);
    at += widths[i] + spacing;
  });
  return total;
}

/** Set the largest font, up to `px`, at which `text` (letter-spaced by `spacing`) fits in `maxW`. */
function fit(ctx: Ctx, text: string, maxW: number, px: number, font: (px: number) => string, spacing = 0): number {
  const extra = spacing * Math.max(0, text.length - 1);
  ctx.font = font(px);
  while (px > 8 && ctx.measureText(text).width + extra > maxW) ctx.font = font(--px);
  return px;
}

const SEAL_WORDS: [RegExp, string][] = [
  [/^(w|wk|week)$/i, 'WEEK'],
  [/^(n|nt|night)$/i, 'NIGHT'],
  [/^(r|rd|round)$/i, 'ROUND'],
];

/**
 * What the seal says about a night: a small word and a big one. Night names
 * run from "Week 7" to "9/30/2026 - W9", so it looks for a week, night or
 * round number first, then a short "Playoffs 2", then a date (month/day over
 * the year), and falls back to the night's place in the season.
 */
export function sealText(night: string, nightNumber: number): { label: string; big: string } {
  const name = night.trim();
  for (const m of name.matchAll(/\b([a-z]+)\s*#?\s*(\d{1,3})\b/gi)) {
    const word = SEAL_WORDS.find(([re]) => re.test(m[1]));
    if (word) return { label: word[1], big: String(Number(m[2])) };
  }
  const short = /^([a-z][a-z ]{0,11}?)\s*#?\s*(\d{1,3})$/i.exec(name);
  if (short) return { label: short[1].toUpperCase(), big: String(Number(short[2])) };
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(name);
  if (iso) return { label: iso[1], big: `${Number(iso[2])}/${Number(iso[3])}` };
  const date = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(name);
  if (date) return { label: date[3] ?? `NIGHT ${nightNumber}`, big: `${Number(date[1])}/${Number(date[2])}` };
  return { label: 'NIGHT', big: String(nightNumber) };
}

const slab = (px: number) => `400 ${px}px ${SLAB}`;
const cond = (px: number, weight = 600) => `${weight} ${px}px ${COND}`;

// ── Shapes ───────────────────────────────────────────────────────────────────

/** A banner segment, both ends leaning the same way. */
function slant(ctx: Ctx, x: number, y: number, w: number, h: number, skew: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - skew, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + skew, y + h);
  ctx.closePath();
}

function star(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

/** Places moved: two chevrons and a number, or a dash for none. */
function drawMove(ctx: Ctx, move: number | null, cx: number, cy: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (!move) {
    ctx.fillRect(cx - size * 0.3, cy - size * 0.07, size * 0.6, size * 0.14);
    return;
  }
  const text = String(Math.abs(move));
  ctx.font = slab(size);
  const cw = size * 0.5;
  const gap = size * 0.14;
  const start = cx - (cw + gap + ctx.measureText(text).width) / 2;
  const dir = move > 0 ? -1 : 1;
  const ch = size * 0.22;
  ctx.lineWidth = size * 0.11;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  for (const off of [-ch * 0.75, ch * 0.75]) {
    const mid = cy + off;
    ctx.beginPath();
    ctx.moveTo(start, mid - (dir * ch) / 2);
    ctx.lineTo(start + cw / 2, mid + (dir * ch) / 2);
    ctx.lineTo(start + cw, mid - (dir * ch) / 2);
    ctx.stroke();
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, start + cw + gap, cy + size * 0.05);
}

/** The season so far as a line with a dot on tonight, shaded underneath. */
function spark(ctx: Ctx, series: number[] | undefined, x: number, y: number, w: number, h: number, color: string) {
  if (!series || series.length < 2) return;
  const lo = Math.min(...series);
  const span = Math.max(...series) - lo;
  const px = (i: number) => x + (i / (series.length - 1)) * w;
  const py = (v: number) => (span === 0 ? y + h / 2 : y + h - ((v - lo) / span) * h);
  ctx.beginPath();
  series.forEach((v, i) => ctx.lineTo(px(i), py(v)));
  ctx.save();
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  series.forEach((v, i) => ctx.lineTo(px(i), py(v)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px(series.length - 1), py(series[series.length - 1]), 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Up to three letters for a unit with no logo: "II Corps" → "IIC", "7th OH" → "7O". */
export function initialsOf(unit: string): string {
  const words = unit.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => (/^[IVX]+$/.test(w) ? w : w[0])).join('').slice(0, 3).toUpperCase();
}

/** A unit's logo on a small plate, or its initials when it has none. */
function drawPlate(ctx: Ctx, card: StandingsCard, unit: string, x: number, y: number, size: number, dark = false) {
  const img = card.logos?.get(unit);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.16);
  ctx.fillStyle = img ? C.white : dark ? '#3a312a' : C.paper;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = dark ? C.gold : C.red;
  ctx.stroke();
  ctx.clip();
  if (img) {
    const inner = size * 0.84;
    const k = Math.min(inner / img.naturalWidth, inner / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  } else {
    const text = initialsOf(unit);
    ctx.fillStyle = dark ? C.goldLight : C.red;
    fit(ctx, text, size * 0.78, Math.round(size * 0.42), slab);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + size / 2, y + size / 2 + size * 0.03);
  }
  ctx.restore();
}

// ── Paper ────────────────────────────────────────────────────────────────────

/** A small seeded generator, so the paper's grain is the same on every card. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawPaper(ctx: Ctx, H: number) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  const rand = seeded(1863);
  for (let i = 0; i < (W * H) / 90; i++) {
    const dark = rand() < 0.7;
    ctx.fillStyle = dark ? `rgba(92,64,28,${0.03 + rand() * 0.07})` : `rgba(255,252,240,${0.08 + rand() * 0.12})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }

  const glow = ctx.createRadialGradient(W / 2, H * 0.4, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  glow.addColorStop(0, 'rgba(0,0,0,0)');
  glow.addColorStop(1, 'rgba(96,62,22,0.38)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = C.ink;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.lineWidth = 1;
  ctx.strokeRect(29, 29, W - 58, H - 58);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.red;
  for (const [x, y] of [[29, 29], [W - 29, 29], [29, H - 29], [W - 29, H - 29]]) star(ctx, x, y, 11);
}

// ── Header ───────────────────────────────────────────────────────────────────

const HEADER_H = 352;

/** A wax-seal rosette naming the night: "WEEK" over a big "7". */
function drawSeal(ctx: Ctx, cx: number, cy: number, r: number, card: StandingsCard) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.shadowColor = 'rgba(60,20,5,0.35)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = C.redDeep;
  ctx.beginPath();
  for (let i = 0; i < 48; i++) {
    const rad = i % 2 ? r * 0.93 : r;
    const a = (i * Math.PI) / 24;
    ctx.lineTo(rad * Math.cos(a), rad * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.77, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  const { label, big } = sealText(card.night, card.nightNumber);
  ctx.fillStyle = C.white;
  ctx.textBaseline = 'middle';
  ctx.font = cond(14);
  spaced(ctx, 'AFTER', 0, -r * 0.5, 4, 'center');
  fit(ctx, big, r * 1.1, Math.round(r * 0.66), slab);
  ctx.textAlign = 'center';
  ctx.fillText(big, 0, r * 0.02);
  fit(ctx, label, r * 1.0, 18, (px) => cond(px), 4);
  spaced(ctx, label, 0, r * 0.5, 4, 'center');
  ctx.restore();
}

function drawHeader(ctx: Ctx, card: StandingsCard) {
  const sealR = 92;
  const textW = R - L - sealR * 2 - 24;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.red;
  star(ctx, L + 9, 88, 9);
  const kick = card.kicker.toUpperCase();
  fit(ctx, kick, textW - 28, 21, (px) => cond(px), 6);
  spaced(ctx, kick, L + 28, 96, 6);

  ctx.fillStyle = C.ink;
  fit(ctx, card.title, textW, 42, slab);
  ctx.textAlign = 'left';
  ctx.fillText(card.title, L, 156);

  fit(ctx, card.headline, textW, 112, slab);
  ctx.fillStyle = C.red;
  ctx.fillText(card.headline, L + 5, 270);
  ctx.fillStyle = C.ink;
  ctx.fillText(card.headline, L, 265);

  ctx.fillStyle = C.muted;
  fit(ctx, card.subtitle.toUpperCase(), R - L, 24, (px) => cond(px, 500), 3);
  spaced(ctx, card.subtitle.toUpperCase(), L, 310, 3);

  ctx.fillStyle = C.red;
  ctx.fillRect(L, 328, 140, 7);
  ctx.fillStyle = C.ink;
  ctx.fillRect(L + 156, 331, R - L - 156, 1.5);

  drawSeal(ctx, R - sealR, 160, sealR, card);
}

// ── Rows ─────────────────────────────────────────────────────────────────────

/** The leader, on a card of its own. */
const HERO_H = 160;
function drawHero(ctx: Ctx, row: RankingRow, y: number, card: StandingsCard) {
  const sk = 30;
  const tab = 176;
  ctx.save();
  ctx.shadowColor = 'rgba(40,24,8,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 7;
  slant(ctx, L, y, R - L, HERO_H, sk);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();
  slant(ctx, L + 12, y + 9, R - L - 24, HERO_H - 18, sk - 2);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const gold = ctx.createLinearGradient(0, y, 0, y + HERO_H);
  gold.addColorStop(0, C.goldLight);
  gold.addColorStop(1, C.gold);
  slant(ctx, L, y, tab, HERO_H, sk);
  ctx.fillStyle = gold;
  ctx.fill();
  slant(ctx, R - tab, y, tab, HERO_H, sk);
  ctx.fillStyle = moveColor(row.move);
  ctx.fill();

  ctx.fillStyle = C.ink;
  star(ctx, L + tab / 2 + sk / 2, y + 30, 13);
  ctx.font = slab(84);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1', L + tab / 2 + sk / 2, y + HERO_H / 2 + 14);
  drawMove(ctx, row.move, R - tab / 2 - sk / 2, y + HERO_H / 2, 56, C.white);

  let x0 = L + tab + 20;
  const x1 = R - tab - 20;
  if (card.logos?.size) {
    drawPlate(ctx, card, row.unit, x0, y + (HERO_H - 100) / 2, 100, true);
    x0 += 120;
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.goldLight;
  const value = card.format(row.value);
  ctx.font = cond(32);
  const valueW = ctx.measureText(value).width;
  ctx.textAlign = 'right';
  ctx.fillText(value, x1, y + 58);
  // The label gives way to the value: smaller type before it ever touches it.
  const label = `TOP OF THE TABLE${row.division ? `  ·  ${row.division.toUpperCase()}` : ''}`;
  const room = x1 - valueW - 24 - x0;
  let px = 17;
  ctx.font = cond(px);
  while (px > 10 && ctx.measureText(label).width + px * 0.3 * label.length > room) ctx.font = cond(--px);
  spaced(ctx, label, x0, y + 46, px * 0.3);
  const sparkW = 160;
  spark(ctx, row.series, x1 - sparkW, y + 78, sparkW, 48, C.goldLight);

  ctx.fillStyle = C.white;
  fit(ctx, row.unit.toUpperCase(), x1 - sparkW - 24 - x0, 66, slab);
  ctx.textAlign = 'left';
  ctx.fillText(row.unit.toUpperCase(), x0, y + 122);
}

const TAB_FILL: Record<number, string> = { 1: C.gold, 2: C.silver, 3: C.bronze };

/** One ranked unit on a banner: rank, name, trend, value, movement. */
function drawBanner(
  ctx: Ctx, row: RankingRow, y: number, h: number,
  card: StandingsCard, showDivision: boolean,
) {
  const sk = 22;
  const tab = 118;
  const moveW = 132;
  const cy = y + h / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(60,40,10,0.22)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  slant(ctx, L, y, R - L, h, sk);
  ctx.fillStyle = C.band;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.red;
  ctx.stroke();

  slant(ctx, L, y, tab, h, sk);
  ctx.fillStyle = TAB_FILL[row.rank] ?? C.red;
  ctx.fill();
  slant(ctx, R - moveW, y, moveW, h, sk);
  ctx.fillStyle = moveColor(row.move);
  ctx.fill();

  ctx.fillStyle = C.white;
  ctx.font = slab(Math.round(h * 0.52));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(row.rank), L + tab / 2 + sk / 2, cy + 2);
  drawMove(ctx, row.move, R - moveW / 2 - sk / 2, cy, Math.round(h * 0.46), C.white);

  let x0 = L + tab + 14;
  const x1 = R - moveW - 8;
  if (card.logos?.size) {
    const size = h - 20;
    drawPlate(ctx, card, row.unit, x0, y + 10, size);
    x0 += size + 14;
  }
  const value = card.format(row.value);
  ctx.font = cond(24);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'right';
  ctx.fillText(value, x1, cy + 1);
  const sparkW = 104;
  const sparkR = x1 - ctx.measureText(value).width - 20;
  spark(ctx, row.series, sparkR - sparkW, y + 17, sparkW, h - 34, C.red);

  const name = row.unit.toUpperCase();
  const sub = showDivision && row.division ? row.division.toUpperCase() : null;
  ctx.fillStyle = C.red;
  fit(ctx, name, sparkR - sparkW - 20 - x0, Math.round(h * (sub ? 0.44 : 0.5)), slab);
  ctx.textAlign = 'left';
  ctx.fillText(name, x0, sub ? cy - 9 : cy + 2);
  if (sub) {
    ctx.fillStyle = C.muted;
    ctx.font = cond(14);
    spaced(ctx, sub, x0 + 2, cy + 21, 4);
  }
}

/** Below the banners: a ruled list, as a broadside sets its small print. */
const ROW_H = 50;
function drawRow(ctx: Ctx, row: RankingRow, y: number, card: StandingsCard, shade: boolean) {
  const x0 = L + 70;
  const x1 = R - 70;
  const cy = y + ROW_H / 2;
  const box = 42;
  if (shade) {
    ctx.fillStyle = 'rgba(255,250,235,0.35)';
    ctx.fillRect(x0, y, x1 - x0, ROW_H);
  }
  ctx.fillStyle = C.red;
  ctx.fillRect(x0, y + ROW_H - 2, x1 - x0, 2);
  ctx.fillStyle = C.ink;
  ctx.fillRect(x0, cy - 18, box, 36);
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = slab(20);
  ctx.fillText(String(row.rank), x0 + box / 2, cy + 1);

  drawMove(ctx, row.move, x1 - 34, cy, 22, moveColor(row.move));
  let nameX = x0 + box + 18;
  if (card.logos?.size) {
    drawPlate(ctx, card, row.unit, nameX - 6, cy - 18, 36);
    nameX += 42;
  }
  const value = card.format(row.value);
  ctx.font = cond(21);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'right';
  ctx.fillText(value, x1 - 80, cy + 1);

  const name = row.unit.toUpperCase();
  ctx.fillStyle = C.red;
  fit(ctx, name, x1 - 80 - ctx.measureText(value).width - 24 - nameX, 25, slab);
  ctx.textAlign = 'left';
  ctx.fillText(name, nameX, cy + 2);
}

/** A division's name on a ribbon with folded tails. */
const RIBBON_H = 58;
function drawRibbon(ctx: Ctx, text: string, y: number) {
  const label = text.toUpperCase();
  ctx.font = slab(28);
  const w = Math.min(R - L - 120, ctx.measureText(label).width + 3 * label.length + 120);
  const x = W / 2 - w / 2;
  const tail = 46;
  const drop = 12;
  ctx.fillStyle = C.redDeep;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? x : x + w;
    const out = edge + side * tail;
    ctx.beginPath();
    ctx.moveTo(edge, y + drop);
    ctx.lineTo(out, y + drop);
    ctx.lineTo(out - side * 16, y + drop + RIBBON_H / 2);
    ctx.lineTo(out, y + drop + RIBBON_H);
    ctx.lineTo(edge, y + drop + RIBBON_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#5a140b';
  for (const [a, b] of [[x, x + 18], [x + w, x + w - 18]]) {
    ctx.beginPath();
    ctx.moveTo(a, y + RIBBON_H);
    ctx.lineTo(a, y + RIBBON_H + drop);
    ctx.lineTo(b, y + RIBBON_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = C.red;
  ctx.fillRect(x, y, w, RIBBON_H);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6, y + 6, w - 12, RIBBON_H - 12);
  ctx.fillStyle = C.white;
  ctx.textBaseline = 'middle';
  spaced(ctx, label, W / 2, y + RIBBON_H / 2 + 2, 3, 'center');
}

/** Where a division's playoff places end. */
const CUT_H = 36;
function drawCut(ctx: Ctx, y: number) {
  const cy = y + CUT_H / 2;
  const label = 'PLAYOFF LINE';
  ctx.font = cond(15);
  const half = (ctx.measureText(label).width + 5 * label.length) / 2 + 16;
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  for (const [a, b] of [[L + 10, W / 2 - half], [W / 2 + half, R - 10]]) {
    ctx.beginPath();
    ctx.moveTo(a, cy);
    ctx.lineTo(b, cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = C.red;
  ctx.textBaseline = 'middle';
  spaced(ctx, label, W / 2, cy + 1, 5, 'center');
}

/** The night's biggest climb and fall among `rows`, side by side. */
const MOVERS_H = 120;
function drawMovers(ctx: Ctx, rows: RankingRow[], y: number, card: StandingsCard) {
  const moved = rows.filter((r) => r.move);
  const riser = moved.reduce<RankingRow | null>((b, r) => (r.move! > 0 && (!b || r.move! > b.move!) ? r : b), null);
  const faller = moved.reduce<RankingRow | null>((b, r) => (r.move! < 0 && (!b || r.move! < b.move!) ? r : b), null);
  const boxes = [
    riser && { title: 'BIGGEST RISER', row: riser },
    faller && { title: 'BIGGEST FALL', row: faller },
  ].filter((b): b is { title: string; row: RankingRow } => !!b);
  const gap = 24;
  const w = (R - L - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach(({ title, row }, i) => {
    const x = L + i * (w + gap);
    const color = moveColor(row.move);
    ctx.fillStyle = 'rgba(255,250,235,0.45)';
    ctx.fillRect(x, y, w, MOVERS_H);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, MOVERS_H);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 10, MOVERS_H);
    let tx = x + 30;
    if (card.logos?.size) {
      drawPlate(ctx, card, row.unit, tx, y + (MOVERS_H - 68) / 2, 68);
      tx += 84;
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    ctx.font = cond(16);
    spaced(ctx, title, tx, y + 38, 5);
    drawMove(ctx, row.move, x + w - 60, y + MOVERS_H / 2, 44, color);
    ctx.fillStyle = C.ink;
    fit(ctx, row.unit.toUpperCase(), x + w - 120 - tx, 34, slab);
    ctx.textAlign = 'left';
    ctx.fillText(row.unit.toUpperCase(), tx, y + 88);
  });
}

// ── Card ─────────────────────────────────────────────────────────────────────

const TOP = 8;
const BANNER_H = 78;
const GROUP_H = 70;

type Block = { h: number; draw?: (y: number) => void };

function layout(ctx: Ctx, card: StandingsCard): Block[] {
  const blocks: Block[] = [{ h: HEADER_H + 26 }];
  const hasDivisions = card.rows.some((r) => r.division);

  if (card.groups?.length) {
    card.groups.forEach((g, gi) => {
      if (gi) blocks.push({ h: 30 });
      blocks.push({ h: RIBBON_H + 28, draw: (y) => drawRibbon(ctx, g.name, y) });
      g.rows.forEach((row, i) => {
        blocks.push({ h: GROUP_H + 12, draw: (y) => drawBanner(ctx, row, y, GROUP_H, card, false) });
        if (g.cutoff && i + 1 === g.cutoff && i + 1 < g.rows.length) {
          blocks.push({ h: CUT_H + 8, draw: (y) => drawCut(ctx, y - 4) });
        }
      });
      // Each division's movers, counted inside it.
      if (g.rows.some((r) => r.move)) {
        blocks.push({ h: 14 }, { h: MOVERS_H, draw: (y) => drawMovers(ctx, g.rows, y, card) });
      }
    });
  } else {
    const [leader, ...banners] = card.rows.slice(0, TOP);
    const rest = card.rows.slice(TOP);
    if (leader) blocks.push({ h: HERO_H + 26, draw: (y) => drawHero(ctx, leader, y, card) });
    for (const row of banners) {
      blocks.push({ h: BANNER_H + 16, draw: (y) => drawBanner(ctx, row, y, BANNER_H, card, hasDivisions) });
    }
    if (rest.length) blocks.push({ h: 14 });
    rest.forEach((row, i) => blocks.push({ h: ROW_H, draw: (y) => drawRow(ctx, row, y, card, i % 2 === 0) }));
    if (card.rows.some((r) => r.move)) {
      blocks.push({ h: 34 }, { h: MOVERS_H, draw: (y) => drawMovers(ctx, card.rows, y, card) });
    }
  }
  blocks.push({
    h: 96,
    draw: (y) => {
      ctx.fillStyle = C.muted;
      ctx.font = cond(15, 500);
      ctx.textBaseline = 'alphabetic';
      spaced(ctx, 'ARROWS · PLACES MOVED SINCE THE NIGHT BEFORE     LINE · THE SEASON SO FAR', W / 2, y + 52, 3, 'center');
    },
  });
  return blocks;
}

export function drawStandingsImage(card: StandingsCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const blocks = layout(ctx, card);
  const H = blocks.reduce((n, b) => n + b.h, 0);
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.scale(SCALE, SCALE);

  drawPaper(ctx, H);
  drawHeader(ctx, card);
  let y = 0;
  for (const b of blocks) {
    b.draw?.(y);
    y += b.h;
  }
  return canvas;
}
