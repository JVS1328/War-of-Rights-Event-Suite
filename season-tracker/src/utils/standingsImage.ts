/**
 * A weekly rankings card as a PNG: the top eight on banners, the rest of the
 * league in a ruled list, each with the places it moved since the night before.
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
}

export interface StandingsCard {
  /** Printed regular before the headline, e.g. the season's name. */
  title: string;
  /** Printed bold, e.g. "STANDINGS". */
  headline: string;
  subtitle: string;
  footer: string;
  rows: RankingRow[];
  /** How a row's value is printed, e.g. `14 PTS`. */
  format: (value: number) => string;
}

const W = 1080;
const SCALE = 2;
const PAD = 48;
const HEADER_H = 236;
const TOP = 8;
const BANNER_H = 74;
const BANNER_GAP = 20;
const ROW_H = 48;
const SKEW = 24;

const C = {
  bg: '#e8e1c2',
  band: '#f0ead2',
  red: '#e0392b',
  ink: '#2a2622',
  muted: '#7a6f5f',
  white: '#ffffff',
};
const SERIF = '"Roboto Slab", Rockwell, "Bookman Old Style", Georgia, serif';
const SANS = '"Geist Variable", "Josefin Sans", system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

/** The largest size, up to `size`, at which `text` fits in `maxW`. */
function fit(ctx: Ctx, text: string, maxW: number, size: number, font: (px: number) => string): number {
  let px = size;
  ctx.font = font(px);
  while (px > 10 && ctx.measureText(text).width > maxW) ctx.font = font(--px);
  return px;
}

/** A banner segment, both ends leaning the same way. */
function slant(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - SKEW, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + SKEW, y + h);
  ctx.closePath();
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
  ctx.font = `700 ${size}px ${SERIF}`;
  const cw = size * 0.5;
  const gap = size * 0.14;
  const start = cx - (cw + gap + ctx.measureText(text).width) / 2;
  const dir = move > 0 ? -1 : 1;
  const ch = size * 0.22;
  ctx.lineWidth = size * 0.1;
  ctx.lineJoin = 'miter';
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
  ctx.fillText(text, start + cw + gap, cy + size * 0.04);
}

function drawHeader(ctx: Ctx, card: StandingsCard) {
  const lead = `${card.title} `;
  const font = (weight: number) => (px: number) => `${weight} ${px}px ${SERIF}`;
  let px = 66;
  const width = (p: number) => {
    ctx.font = font(400)(p);
    const a = ctx.measureText(lead).width;
    ctx.font = font(700)(p);
    return a + ctx.measureText(card.headline).width;
  };
  while (px > 20 && width(px) > W - PAD * 2) px--;
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(400)(px);
  ctx.fillText(lead, PAD, 110);
  const leadW = ctx.measureText(lead).width;
  ctx.font = font(700)(px);
  ctx.fillText(card.headline, PAD + leadW, 110);

  fit(ctx, card.subtitle, W - PAD * 2, 34, (p) => `500 ${p}px ${SANS}`);
  ctx.fillText(card.subtitle, PAD, 162);
  ctx.fillStyle = C.red;
  ctx.fillRect(PAD, 190, 110, 4);
}

function drawBanner(ctx: Ctx, row: RankingRow, y: number, format: StandingsCard['format']) {
  const L = PAD;
  const R = W - PAD;
  const rankW = 130;
  const moveW = 156;
  const cy = y + BANNER_H / 2;

  slant(ctx, L, y, R - L, BANNER_H);
  ctx.fillStyle = C.band;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.red;
  ctx.stroke();
  ctx.fillStyle = C.red;
  slant(ctx, L, y, rankW, BANNER_H);
  ctx.fill();
  slant(ctx, R - moveW, y, moveW, BANNER_H);
  ctx.fill();

  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 50px ${SERIF}`;
  ctx.fillText(String(row.rank), L + rankW / 2 + SKEW / 2, cy + 2);
  drawMove(ctx, row.move, R - moveW / 2 - SKEW / 2, cy, 46, C.white);

  const x0 = L + rankW + 12;
  const x1 = R - moveW - 12;
  const value = format(row.value);
  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  ctx.fillText(value, x1, cy + 1);
  const nameRight = x1 - ctx.measureText(value).width - 16;
  const name = row.unit.toUpperCase();
  fit(ctx, name, nameRight - x0, 44, (p) => `700 ${p}px ${SERIF}`);
  ctx.fillStyle = C.red;
  ctx.textAlign = 'center';
  ctx.fillText(name, (x0 + nameRight) / 2, cy + 2);
}

function drawRow(ctx: Ctx, row: RankingRow, y: number, format: StandingsCard['format']) {
  const x0 = PAD + 100;
  const x1 = W - PAD - 100;
  const cy = y + ROW_H / 2 - 2;
  const box = 40;

  ctx.fillStyle = C.red;
  ctx.fillRect(x0, y + ROW_H - 4, x1 - x0, 3);
  ctx.fillRect(x1 - box, cy - 17, box, 34);
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 22px ${SERIF}`;
  ctx.fillText(String(row.rank), x1 - box / 2, cy + 1);
  drawMove(ctx, row.move, x1 - box - 46, cy, 22, C.red);

  const valueRight = x1 - box - 86;
  const value = format(row.value);
  ctx.font = `600 20px ${SANS}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  ctx.fillText(value, valueRight, cy + 1);

  const nameRight = valueRight - ctx.measureText(value).width - 16;
  const name = row.unit.toUpperCase();
  fit(ctx, name, nameRight - x0, 27, (p) => `700 ${p}px ${SERIF}`);
  ctx.fillStyle = C.red;
  ctx.textAlign = 'center';
  ctx.fillText(name, (x0 + nameRight) / 2, cy + 1);
}

export function drawStandingsImage(card: StandingsCard): HTMLCanvasElement {
  const top = card.rows.slice(0, TOP);
  const rest = card.rows.slice(TOP);
  const H = HEADER_H + top.length * (BANNER_H + BANNER_GAP) + (rest.length ? 24 + rest.length * ROW_H : 0) + 72;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, card);
  let y = HEADER_H;
  for (const row of top) {
    drawBanner(ctx, row, y, card.format);
    y += BANNER_H + BANNER_GAP;
  }
  if (rest.length) y += 24;
  for (const row of rest) {
    drawRow(ctx, row, y, card.format);
    y += ROW_H;
  }

  ctx.fillStyle = C.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 20px ${SANS}`;
  ctx.fillText(card.footer, W / 2, H - 30);
  return canvas;
}
