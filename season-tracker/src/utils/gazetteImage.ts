/**
 * The rankings card as an 1860s newspaper front page: newsprint gone yellow
 * and foxed, folded in four, a blackletter masthead over stacked headline
 * decks written from the night's results, the table set with dot leaders, and
 * an atlas plate of the leaders' progress inside a barred map border.
 * Divisions are hand-tinted the way county maps were.
 *
 * Takes the same {@link StandingsCard} the broadside does; only the look differs.
 */
import { fit, initialsOf, seeded, spaced } from './standingsImage';
import type { RankingGroup, RankingRow, StandingsCard } from './standingsImage';

const FRAK = '"UnifrakturMaguntia", "Old English Text MT", serif';
const FELL = '"IM Fell English", "Iowan Old Style", Georgia, serif';
const FELL_SC = '"IM Fell English SC", "IM Fell English", Georgia, serif';

/** Font specs to load before drawing. */
export const GAZETTE_FONTS = [
  `400 40px ${FRAK}`,
  `400 20px ${FELL}`,
  `italic 400 20px ${FELL}`,
  `400 20px ${FELL_SC}`,
];

const W = 1080;
const SCALE = 2;
const PAD = 70;
const L = PAD;
const R = W - PAD;

const C = {
  paper: '#efe4c6',
  ink: '#1f1b16',
  faded: '#5d5446',
  rule: '#2a251f',
};
/** Atlas washes, one per division, as a colourist would have laid them. */
const WASH = ['#c98a7e', '#c9a24f', '#8fa36d', '#7f9bb3', '#a98bb0', '#b58b5a'];

type Ctx = CanvasRenderingContext2D;

const fell = (px: number) => `400 ${px}px ${FELL}`;
const italic = (px: number) => `italic 400 ${px}px ${FELL}`;
const sc = (px: number) => `400 ${px}px ${FELL_SC}`;
const frak = (px: number) => `400 ${px}px ${FRAK}`;

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const words = (n: number) => NUMBER_WORDS[n] ?? String(n);
const roman = (n: number) => {
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out || '0';
};
const title = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

// ── Rules and ornaments ──────────────────────────────────────────────────────

function hr(ctx: Ctx, x0: number, x1: number, y: number, weight = 1) {
  ctx.fillStyle = C.rule;
  ctx.fillRect(x0, y, x1 - x0, weight);
}

/** A thick-and-thin rule, the newspaper's section break. */
function doubleRule(ctx: Ctx, x0: number, x1: number, y: number) {
  hr(ctx, x0, x1, y, 3);
  hr(ctx, x0, x1, y + 6, 1);
}

/** A short centred dash rule between headline decks, with a diamond. */
function deckRule(ctx: Ctx, y: number, w = 140) {
  hr(ctx, W / 2 - w / 2, W / 2 - 8, y, 1);
  hr(ctx, W / 2 + 8, W / 2 + w / 2, y, 1);
  ctx.save();
  ctx.translate(W / 2, y + 0.5);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
}

function triangle(ctx: Ctx, cx: number, cy: number, size: number, up: boolean) {
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, cy - size / 2);
    ctx.lineTo(cx + size / 2, cy + size / 2);
    ctx.lineTo(cx - size / 2, cy + size / 2);
  } else {
    ctx.moveTo(cx - size / 2, cy - size / 2);
    ctx.lineTo(cx + size / 2, cy - size / 2);
    ctx.lineTo(cx, cy + size / 2);
  }
  ctx.closePath();
  ctx.fill();
}

/** A watercolour wash: a soft-edged, slightly uneven tint. */
function wash(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, alpha = 0.32) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.filter = 'blur(1.5px)';
  ctx.beginPath();
  const rand = seeded(Math.round(x * 7 + y * 3));
  const jitter = () => (rand() - 0.5) * 4;
  ctx.moveTo(x + jitter(), y + jitter());
  ctx.lineTo(x + w + jitter(), y + jitter());
  ctx.lineTo(x + w + jitter(), y + h + jitter());
  ctx.lineTo(x + jitter(), y + h + jitter());
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Paper ────────────────────────────────────────────────────────────────────

function drawPaper(ctx: Ctx, H: number) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  const rand = seeded(1861);

  // Fibres and grain.
  for (let i = 0; i < (W * H) / 70; i++) {
    ctx.fillStyle = rand() < 0.75 ? `rgba(110,82,40,${0.025 + rand() * 0.06})` : `rgba(255,250,235,${0.1 + rand() * 0.15})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.4, 1 + rand() * 1.4);
  }
  ctx.strokeStyle = 'rgba(120,90,50,0.07)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const a = rand() * Math.PI;
    const len = 6 + rand() * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  // Foxing: the brown spots old paper takes on.
  for (let i = 0; i < 46; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 3 + rand() * rand() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(140,92,40,${0.1 + rand() * 0.16})`);
    g.addColorStop(1, 'rgba(140,92,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Yellowed toward the edges.
  const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(130,88,30,0.32)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
}

/** Folded in four for the post: a crease each way, shadowed on one side. */
function drawFolds(ctx: Ctx, H: number) {
  const crease = (horizontal: boolean) => {
    const at = horizontal ? H * 0.5 : W * 0.5;
    const g = horizontal
      ? ctx.createLinearGradient(0, at - 14, 0, at + 14)
      : ctx.createLinearGradient(at - 14, 0, at + 14, 0);
    g.addColorStop(0, 'rgba(90,60,20,0)');
    g.addColorStop(0.46, 'rgba(90,60,20,0.10)');
    g.addColorStop(0.5, 'rgba(60,40,15,0.18)');
    g.addColorStop(0.53, 'rgba(255,250,235,0.22)');
    g.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = g;
    if (horizontal) ctx.fillRect(0, at - 14, W, 28);
    else ctx.fillRect(at - 14, 0, 28, H);
  };
  crease(true);
  crease(false);
}

/** Worn type: specks of paper showing through the ink, as on a tired forme. */
function drawWear(ctx: Ctx, H: number) {
  const rand = seeded(1862);
  ctx.fillStyle = 'rgba(239,228,198,0.55)';
  for (let i = 0; i < (W * H) / 140; i++) ctx.fillRect(rand() * W, rand() * H, 0.9, 0.9);
}

/** An atlas neatline: a heavy rule, a band of alternating bars, a hairline. */
function drawBorder(ctx: Ctx, H: number) {
  const o = 22;
  const band = 9;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(o, o, W - o * 2, H - o * 2);
  ctx.lineWidth = 1;
  ctx.strokeRect(o + band, o + band, W - (o + band) * 2, H - (o + band) * 2);
  ctx.strokeRect(o + band + 6, o + band + 6, W - (o + band + 6) * 2, H - (o + band + 6) * 2);
  ctx.fillStyle = C.ink;
  const step = 36;
  for (let x = o + band, i = 0; x < W - o - band; x += step, i++) {
    if (i % 2) continue;
    const w = Math.min(step, W - o - band - x);
    ctx.fillRect(x, o, w, band);
    ctx.fillRect(x, H - o - band, w, band);
  }
  for (let y = o + band, i = 0; y < H - o - band; y += step, i++) {
    if (i % 2) continue;
    const h = Math.min(step, H - o - band - y);
    ctx.fillRect(o, y, band, h);
    ctx.fillRect(W - o - band, y, band, h);
  }
  ctx.fillRect(o, o, band, band);
  ctx.fillRect(W - o - band, o, band, band);
  ctx.fillRect(o, H - o - band, band, band);
  ctx.fillRect(W - o - band, H - o - band, band, band);
}

// ── Masthead and headlines ───────────────────────────────────────────────────

/** Headline decks, written from the night: who leads, who climbed, who fell. */
function decks(card: StandingsCard, rows: RankingRow[]): string[] {
  const [leader] = card.rows;
  const moved = rows.filter((r) => r.move);
  const riser = moved.reduce<RankingRow | null>((b, r) => (r.move! > 0 && (!b || r.move! > b.move!) ? r : b), null);
  const faller = moved.reduce<RankingRow | null>((b, r) => (r.move! < 0 && (!b || r.move! < b.move!) ? r : b), null);
  const out: string[] = [];
  if (leader) {
    out.push(leader.move && leader.move > 0 ? `${leader.unit} Takes the Lead!` : `${leader.unit} Holds the Field.`);
  }
  const places = (n: number) => `${title(words(Math.abs(n)))} Place${Math.abs(n) === 1 ? '' : 's'}`;
  const news = [
    riser && `${riser.unit} Advances ${places(riser.move!)}`,
    faller && `${faller.unit} Falls Back ${places(faller.move!)}`,
  ].filter(Boolean);
  out.push(news.length ? `${news.join(' — ')}.` : 'All Quiet Along the Line.');
  return out;
}

function drawMasthead(ctx: Ctx, card: StandingsCard): number {
  const { label, big } = { label: card.night.toUpperCase(), big: card.nightNumber };
  let y = 62;

  // The dateline strip.
  hr(ctx, L, R, y, 1);
  ctx.fillStyle = C.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = sc(17);
  spaced(ctx, `${card.title.toUpperCase()}`, L, y + 24, 2, 'left');
  fit(ctx, label, 340, 17, sc, 2);
  spaced(ctx, label, R, y + 24, 2, 'right');
  ctx.font = sc(17);
  spaced(ctx, `NO. ${big}`, W / 2, y + 24, 3, 'center');
  doubleRule(ctx, L, R, y + 34);
  y += 34 + 6;

  // The masthead itself.
  ctx.fillStyle = C.ink;
  const name = card.kicker;
  fit(ctx, name, R - L - 20, 104, frak);
  ctx.textAlign = 'center';
  ctx.fillText(name, W / 2, y + 108);
  // Blackletter descends deep; the motto sits clear of it.
  y += 150;

  ctx.font = italic(20);
  ctx.fillStyle = C.faded;
  const motto = `“${card.subtitle}.”`;
  fit(ctx, motto, R - L, 21, italic);
  ctx.fillText(motto, W / 2, y + 8);
  y += 22;
  doubleRule(ctx, L, R, y);
  return y + 14;
}

function drawHeadlines(ctx: Ctx, card: StandingsCard, rows: RankingRow[], y: number): number {
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // The banner deck.
  const head = `${card.headline}.`;
  fit(ctx, head, R - L, 72, sc, 6);
  spaced(ctx, head, W / 2, y + 66, 6, 'center');
  y += 86;
  deckRule(ctx, y);
  y += 16;

  const [lead, news] = decks(card, rows);
  ctx.font = italic(40);
  fit(ctx, lead, R - L, 40, italic);
  ctx.textAlign = 'center';
  ctx.fillText(lead, W / 2, y + 38);
  y += 62;
  deckRule(ctx, y, 90);
  y += 12;

  const newsCaps = news.toUpperCase();
  fit(ctx, newsCaps, R - L, 24, sc, 2);
  spaced(ctx, newsCaps, W / 2, y + 26, 2, 'center');
  y += 40;
  deckRule(ctx, y, 60);
  y += 10;

  ctx.font = italic(19);
  ctx.fillStyle = C.faded;
  ctx.textAlign = 'center';
  ctx.fillText(`Official Table of the League, after ${card.night}.`, W / 2, y + 22);
  y += 36;
  doubleRule(ctx, L, R, y);
  return y + 18;
}

// ── The table ────────────────────────────────────────────────────────────────

/** A logo pulled into print — sepia, framed — or initials in an oval cartouche. */
function drawCut(ctx: Ctx, card: StandingsCard, unit: string, x: number, cy: number, h: number) {
  const img = card.logos?.get(unit);
  const w = h * 1.4;
  if (img) {
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy - h / 2, w, h);
    ctx.clip();
    ctx.filter = 'grayscale(1) sepia(0.55) contrast(1.15) brightness(0.95)';
    ctx.drawImage(img, x + (w - img.naturalWidth * k) / 2, cy - (img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    ctx.restore();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, cy - h / 2, w, h);
  } else {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, cy, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.ink;
    const text = initialsOf(unit);
    fit(ctx, text, w * 0.7, Math.round(h * 0.5), sc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, cy + 1);
  }
  return w;
}

/** Places moved, set in type: a small triangle and the figure, or a dash. */
function drawMoveText(ctx: Ctx, move: number | null, xRight: number, cy: number, px: number) {
  ctx.fillStyle = C.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = fell(px);
  if (!move) {
    ctx.fillText('—', xRight, cy);
    return;
  }
  const text = String(Math.abs(move));
  ctx.fillText(text, xRight, cy + 1);
  const tw = ctx.measureText(text).width;
  wash(ctx, xRight - tw - px * 1.4, cy - px * 0.62, tw + px * 1.6, px * 1.24, move > 0 ? '#5f8a4c' : '#b0452f', 0.28);
  ctx.fillStyle = C.ink;
  triangle(ctx, xRight - tw - px * 0.6, cy, px * 0.5, move > 0);
}

interface Columns {
  x0: number;
  x1: number;
}

/** One row of the table: number, cut, name and dot leaders out to the figure. */
function drawRow(
  ctx: Ctx, card: StandingsCard, row: RankingRow, y: number, h: number, col: Columns,
  opts: { big?: boolean; division?: string | null },
) {
  const cy = y + h / 2;
  const px = opts.big ? 30 : 23;
  const moveW = 64;
  const valueRight = col.x1 - moveW - 16;
  let x = col.x0;

  ctx.fillStyle = C.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = fell(px);
  ctx.fillText(`${row.rank}.`, x + 36, cy + 1);
  x += 48;

  if (card.logos?.size) {
    x += drawCut(ctx, card, row.unit, x, cy, opts.big ? 38 : 28) + 12;
  }

  ctx.fillStyle = C.ink;
  ctx.font = sc(px);
  ctx.textAlign = 'left';
  const value = card.format(row.value).replace(' PTS', '');
  ctx.font = fell(px);
  const valueW = ctx.measureText(value).width;
  const room = valueRight - valueW - 24 - x;
  const name = row.unit;
  fit(ctx, name, room - (opts.division ? 100 : 0), px, sc);
  ctx.fillText(name, x, cy + 1);
  let end = x + ctx.measureText(name).width;
  if (opts.division) {
    ctx.font = italic(px * 0.72);
    ctx.fillStyle = C.faded;
    const tag = ` (${opts.division})`;
    if (end + ctx.measureText(tag).width < valueRight - valueW - 24) {
      ctx.fillText(tag, end, cy + 2);
      end += ctx.measureText(tag).width;
    }
  }

  // Dot leaders.
  ctx.fillStyle = C.faded;
  for (let dx = end + 12; dx < valueRight - valueW - 10; dx += 9) ctx.fillRect(dx, cy + px * 0.22, 1.6, 1.6);

  ctx.fillStyle = C.ink;
  ctx.font = fell(px);
  ctx.textAlign = 'right';
  ctx.fillText(value, valueRight, cy + 1);
  drawMoveText(ctx, row.move, col.x1, cy, opts.big ? 24 : 19);
}

function drawTableHead(ctx: Ctx, card: StandingsCard, y: number, col: Columns, unitWord = 'Regiment') {
  ctx.fillStyle = C.faded;
  ctx.font = sc(15);
  ctx.textBaseline = 'alphabetic';
  spaced(ctx, 'NO.', col.x0 + 4, y + 16, 1.5);
  spaced(ctx, unitWord.toUpperCase(), col.x0 + 48, y + 16, 1.5);
  const valueWord = card.headline.startsWith('POWER') ? 'RATING' : 'POINTS';
  spaced(ctx, valueWord, col.x1 - 64 - 16, y + 16, 1.5, 'right');
  spaced(ctx, 'MOVED', col.x1, y + 16, 1.5, 'right');
  hr(ctx, col.x0, col.x1, y + 26, 1);
}

// ── The atlas plate ──────────────────────────────────────────────────────────

const DASHES: number[][] = [[], [10, 5], [2, 4], [12, 4, 2, 4], [6, 6]];

/** The leaders' progress night by night, drawn as an engraved chart plate. */
function drawPlate(ctx: Ctx, card: StandingsCard, y: number, h: number) {
  const leaders = card.rows.slice(0, 5).filter((r) => (r.series?.length ?? 0) > 0);
  const nights = Math.max(...leaders.map((r) => r.series!.length));
  const shared = card.trend === 'shared';
  const all = leaders.flatMap((r) => r.series!);
  // Round the scale out to clean steps, so the axis reads 1,450 · 1,500 · 1,550.
  const rawLo = shared ? 0 : Math.min(...all);
  const rawHi = Math.max(...all, rawLo + 1);
  const span = (rawHi - rawLo) / 4;
  const mag = 10 ** Math.floor(Math.log10(span));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= span) ?? 10 * mag;
  const lo = Math.floor(rawLo / step) * step;
  const hi = lo + Math.ceil((rawHi - lo) / step) * step;
  const ticks = Math.round((hi - lo) / step);

  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(L, y, R - L, h);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(L + 5, y + 5, R - L - 10, h - 10);

  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = sc(22);
  spaced(ctx, 'PROGRESS OF THE CAMPAIGN.', W / 2, y + 40, 3, 'center');
  ctx.font = italic(16);
  ctx.fillStyle = C.faded;
  ctx.textAlign = 'center';
  ctx.fillText(
    `The five leading regiments, their ${shared ? 'points' : 'ratings'} after each night${shared ? ', from the opening of the season' : ''}.`,
    W / 2, y + 62,
  );

  const gx0 = L + 64;
  const gx1 = R - 190;
  const gy0 = y + 86;
  const gy1 = y + h - 46;
  const steps = shared ? nights : nights - 1;
  const xOf = (i: number) => gx0 + (steps <= 0 ? 0 : (i / steps) * (gx1 - gx0));
  const yOf = (v: number) => gy1 - ((v - lo) / (hi - lo)) * (gy1 - gy0);

  // Graticule, as an atlas rules its plates.
  ctx.strokeStyle = 'rgba(31,27,22,0.22)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i <= steps; i++) {
    ctx.beginPath();
    ctx.moveTo(xOf(i), gy0);
    ctx.lineTo(xOf(i), gy1);
    ctx.stroke();
  }
  for (let k = 0; k <= ticks; k++) {
    const gy = gy0 + (k / ticks) * (gy1 - gy0);
    ctx.beginPath();
    ctx.moveTo(gx0, gy);
    ctx.lineTo(gx1, gy);
    ctx.stroke();
    ctx.fillStyle = C.faded;
    ctx.font = fell(14);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText((hi - k * step).toLocaleString(), gx0 - 10, gy);
  }
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);

  ctx.fillStyle = C.faded;
  ctx.font = sc(14);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let i = shared ? 1 : 0; i <= steps; i++) {
    ctx.fillText(roman(shared ? i : i + 1), xOf(i), gy1 + 22);
  }
  ctx.font = italic(14);
  ctx.fillText('Week of the season.', (gx0 + gx1) / 2, gy1 + 40);

  // The lines, each with its own dash, named at the end.
  const ends: { y: number; row: RankingRow; i: number }[] = [];
  leaders.forEach((row, i) => {
    const series = shared ? [0, ...row.series!] : row.series!;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = i === 0 ? 2.6 : 1.8;
    ctx.setLineDash(DASHES[i]);
    ctx.beginPath();
    series.forEach((v, k) => ctx.lineTo(xOf(k), yOf(v)));
    ctx.stroke();
    ctx.setLineDash([]);
    const lastY = yOf(series[series.length - 1]);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(xOf(series.length - 1), lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ends.push({ y: lastY, row, i });
  });
  // Spread the names so none sit on another.
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 22);
  const overflow = ends.length ? ends[ends.length - 1].y - gy1 : 0;
  if (overflow > 0) ends.forEach((e) => { e.y -= overflow; });
  for (const e of ends) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = e.i === 0 ? 2.6 : 1.8;
    ctx.setLineDash(DASHES[e.i]);
    ctx.beginPath();
    ctx.moveTo(gx1 + 12, e.y);
    ctx.lineTo(gx1 + 40, e.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fit(ctx, e.row.unit, 130, 17, sc);
    ctx.fillText(e.row.unit, gx1 + 46, e.y + 1);
  }
}

// ── Divisions ────────────────────────────────────────────────────────────────

const ROW = 44;

function groupHeight(g: RankingGroup) {
  const cut = g.cutoff && g.cutoff < g.rows.length ? 30 : 0;
  return 58 + 34 + g.rows.length * ROW + cut + 16;
}

function drawGroup(ctx: Ctx, card: StandingsCard, g: RankingGroup, i: number, y: number, col: Columns) {
  wash(ctx, col.x0, y, col.x1 - col.x0, 46, WASH[i % WASH.length], 0.38);
  ctx.fillStyle = C.ink;
  ctx.font = sc(26);
  ctx.textBaseline = 'middle';
  const head = `${g.name.toUpperCase()} DIVISION.`;
  fit(ctx, head, col.x1 - col.x0 - 20, 26, sc, 3);
  spaced(ctx, head, (col.x0 + col.x1) / 2, y + 24, 3, 'center');
  hr(ctx, col.x0, col.x1, y + 50, 1);
  let at = y + 58;
  drawTableHead(ctx, card, at, col);
  at += 34;
  g.rows.forEach((row, k) => {
    drawRow(ctx, card, row, at, ROW, col, {});
    at += ROW;
    if (g.cutoff && k + 1 === g.cutoff && k + 1 < g.rows.length) {
      ctx.fillStyle = C.faded;
      ctx.font = italic(15);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = 'The playoff line.';
      const half = ctx.measureText(label).width / 2 + 14;
      const mid = (col.x0 + col.x1) / 2;
      ctx.fillText(label, mid, at + 15);
      for (const [a, b] of [[col.x0, mid - half], [mid + half, col.x1]]) {
        for (let dx = a; dx < b; dx += 8) ctx.fillRect(dx, at + 15, 4, 1.2);
      }
      at += 30;
    }
  });
}

// ── The page ─────────────────────────────────────────────────────────────────

type Block = { h: number; draw?: (y: number) => void };

export function drawGazetteImage(card: StandingsCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const blocks: Block[] = [];
  const full: Columns = { x0: L, x1: R };

  if (card.groups?.length) {
    // Divisions run side by side, two to a row, as newspaper columns.
    const gutter = 36;
    const colW = (R - L - gutter) / 2;
    for (let i = 0; i < card.groups.length; i += 2) {
      const pair = card.groups.slice(i, i + 2);
      const h = Math.max(...pair.map(groupHeight));
      blocks.push({
        h: h + 10,
        draw: (y) => {
          pair.forEach((g, k) => {
            const x0 = pair.length === 1 ? L : L + k * (colW + gutter);
            const x1 = pair.length === 1 ? R : x0 + colW;
            drawGroup(ctx, card, g, i + k, y, { x0, x1 });
          });
          // A column rule between the two.
          if (pair.length === 2) ctx.fillRect(L + colW + gutter / 2, y, 1, h);
        },
      });
    }
  } else {
    blocks.push({ h: 34, draw: (y) => drawTableHead(ctx, card, y, full) });
    card.rows.forEach((row, i) => {
      const big = i === 0;
      const h = big ? 60 : ROW;
      blocks.push({
        h,
        draw: (y) => {
          if (big) wash(ctx, L - 6, y + 4, R - L + 12, h - 8, '#c9a24f', 0.3);
          drawRow(ctx, card, row, y, h, full, { big, division: row.division ?? null });
          if (i % 5 === 4 && i < card.rows.length - 1) hr(ctx, L + 48, R, y + h - 1, 0.6);
        },
      });
    });
  }

  const hasTrend = card.rows.some((r) => (r.series?.length ?? 0) > (card.trend === 'shared' ? 0 : 1));
  if (hasTrend) {
    blocks.push({ h: 18, draw: (y) => doubleRule(ctx, L, R, y + 4) });
    blocks.push({ h: 420, draw: (y) => drawPlate(ctx, card, y + 14, 390) });
  }
  blocks.push({
    h: 96,
    draw: (y) => {
      doubleRule(ctx, L, R, y + 10);
      ctx.fillStyle = C.faded;
      ctx.font = italic(16);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(
        `Printed for the ${card.kicker}. — Figures beside each name give the places gained or lost since the night before.`,
        W / 2, y + 44,
      );
    },
  });

  // Measure the masthead and headlines on a scratch pass, then lay out the page.
  const headH = (() => {
    const probe = document.createElement('canvas').getContext('2d')!;
    return drawHeadlines(probe, card, card.rows, drawMasthead(probe, card));
  })();
  const H = headH + blocks.reduce((n, b) => n + b.h, 0) + 40;
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.scale(SCALE, SCALE);

  drawPaper(ctx, H);
  let y = drawHeadlines(ctx, card, card.rows, drawMasthead(ctx, card));
  for (const b of blocks) {
    b.draw?.(y);
    y += b.h;
  }
  drawWear(ctx, H);
  drawFolds(ctx, H);
  drawBorder(ctx, H);
  return canvas;
}
