// Quantized replay serialization — how a round's replay is stored in the
// database (see ./replayStore). Every float bit-for-bit is far too heavy for a
// season of dense position traces, so we trade imperceptible precision for a
// much smaller payload:
//
//   x, y   world meters   → int16 across the replay's own bounds (~5 cm on a
//                           3 km map — well under a pixel on the after-action),
//                           then DELTA-coded along time per player and stored as
//                           zigzag varints (see below).
//   fx, fy heading vector  → int8 unit direction. The viewer renormalizes the
//                           heading, so only its direction matters, and that is
//                           all int8 needs to preserve.
//   z      vertical        → DROPPED. Nothing in the after-action or the viewer
//                           reads it; rebuilt as zeros on decode.
//   lk     leader kind     → kept (1 byte).
//
// Why delta + varint (format 2): a player barely moves between 2 Hz samples, so
// frame-to-frame position deltas are tiny. Storing the *delta* (not the absolute
// int16) makes almost every value small, and zigzag-varint then spends ~1 byte
// on the common small move instead of 2. Across real traces this is ~40% smaller
// after deflate than the old absolute-int16 streams (format 1) — which is frames
// kept, not thrown away, for the same share-size budget. The deltas are modular
// over the int16 ring so a respawn/teleport still round-trips exactly; decoding
// rebuilds the identical { tracks: {x,y,z,fx,fy,lk} } shape the viewer/analytics
// expect, with x=NaN marking unsampled frames like the parser does.
//
// Format 1 (absolute int16 streams) is still decoded, as the log-analyzer's
// share links were.

const FMT_DELTA = 2;              // current: per-player delta + zigzag varint
const FMT_ABS = 1;               // legacy: absolute int16 position streams
const SENTINEL = -32768;          // int16 x value meaning "not sampled"
const RANGE = 65534;              // int16 data span (-32767 … 32767)
const RING = 65535;               // count of valid quantized values (-32767…32767)
const V_UNSAMPLED = 65535;        // varint code reserved for an unsampled sample
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

// zigzag: map a signed int to an unsigned one that stays small for small |v|
// (…, -2→3, -1→1, 0→0, 1→2, 2→4, …) so varint spends few bytes on small deltas.
const zigzag = (v) => ((v << 1) ^ (v >> 31)) >>> 0;
const unzigzag = (u) => (u >>> 1) ^ -(u & 1);

// Reduce a raw delta into the signed half-open ring (-32767…32767) and, on
// decode, fold a prev+delta sum back into it. Positions live on a ring of RING
// distinct values, so modular arithmetic makes even a full-span jump reversible.
function foldDelta(cur, prev) {
  let d = ((cur - prev) % RING + RING) % RING;
  if (d > 32767) d -= RING;
  return d;
}
function unfold(prev, d) {
  let c = ((prev + d + 32767) % RING + RING) % RING;
  return c - 32767;
}

// `stride` keeps every stride-th frame (1 = all). Downsampling in time is the
// last lever for events whose full traces overflow the share store — the
// analytics aggregate over frames so they stay meaningful, and playback just
// gets coarser. Prefer the smaller delta encoding, which lets far more events
// share at stride 1 (full fidelity) before this lever is needed at all.
export function encodeQuantReplay(replay, stride = 1) {
  const s = Math.max(1, Math.floor(stride) || 1);
  const Fsrc = replay.frameCount;
  const P = replay.playerCount;
  const F = Math.ceil(Fsrc / s);     // shared (possibly downsampled) frame count
  const N = F * P;
  const { x, y, fx, fy, lk } = replay.tracks;

  // Bounds over sampled positions in the kept frames only (unsampled x is NaN).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < F; j++) {
    const base = (j * s) * P;
    for (let p = 0; p < P; p++) {
      const i = base + p;
      if (Number.isNaN(x[i])) continue;
      if (x[i] < minX) minX = x[i];
      if (x[i] > maxX) maxX = x[i];
      if (y[i] < minY) minY = y[i];
      if (y[i] > maxY) maxY = y[i];
    }
  }
  if (!Number.isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // Delta streams (int16, frame-major) + absolute int8 heading + leader kind.
  const dqx = new Int16Array(N);
  const dqy = new Int16Array(N);
  const qfx = new Int8Array(N);
  const qfy = new Int8Array(N);
  const qlk = new Uint8Array(N);
  const ft = new Float32Array(F);
  const srcFt = replay.frameTimes;
  const qpos = (v, min, span) => {
    if (span <= 0) return 0;
    let q = Math.round(((v - min) / span) * RANGE) - 32767;
    if (q < -32767) q = -32767; else if (q > 32767) q = 32767;
    return q;
  };
  // Per-player previous quantized position; null until the player is first seen,
  // and reset to null across an unsampled gap so the next sample re-anchors.
  const prevX = new Int32Array(P);
  const prevY = new Int32Array(P);
  const seen = new Uint8Array(P);
  for (let j = 0; j < F; j++) {
    const sf = j * s;
    ft[j] = srcFt[sf];
    const sBase = sf * P;
    const dBase = j * P;
    for (let p = 0; p < P; p++) {
      const si = sBase + p;
      const di = dBase + p;
      // Mark unsampled in BOTH delta streams: each is decoded independently and
      // uses the sentinel to reset the player's delta chain, so they must agree
      // on where the gaps are or the y-stream desyncs.
      if (Number.isNaN(x[si])) { dqx[di] = SENTINEL; dqy[di] = SENTINEL; seen[p] = 0; continue; }
      const cx = qpos(x[si], minX, spanX);
      const cy = qpos(y[si], minY, spanY);
      if (!seen[p]) { dqx[di] = cx; dqy[di] = cy; seen[p] = 1; } // first sample: absolute
      else { dqx[di] = foldDelta(cx, prevX[p]); dqy[di] = foldDelta(cy, prevY[p]); }
      prevX[p] = cx;
      prevY[p] = cy;
      const len = Math.hypot(fx[si], fy[si]);
      if (len > 1e-6) {
        qfx[di] = Math.max(-127, Math.min(127, Math.round((fx[si] / len) * 127)));
        qfy[di] = Math.max(-127, Math.min(127, Math.round((fy[si] / len) * 127)));
      }
      qlk[di] = lk[si];
    }
  }

  const vqx = encodeVarintStream(dqx);
  const vqy = encodeVarintStream(dqy);
  const metaBytes = enc.encode(JSON.stringify(replay.meta));
  const playersBytes = enc.encode(JSON.stringify(replay.players));

  const HEAD = 28; // fmt+flags+pad(4) F(4) P(4) minX,spanX,minY,spanY(16)
  const total = HEAD
    + 4 + metaBytes.byteLength
    + 4 + playersBytes.byteLength
    + F * 4                          // frameTimes
    + 4 + vqx.byteLength             // varint dx stream
    + 4 + vqy.byteLength             // varint dy stream
    + N + N + N;                     // qfx, qfy, qlk

  const ab = new ArrayBuffer(total);
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);
  let off = 0;
  dv.setUint8(off, FMT_DELTA); dv.setUint8(off + 1, 0); off += 4;
  dv.setUint32(off, F, true); off += 4;
  dv.setUint32(off, P, true); off += 4;
  dv.setFloat32(off, minX, true); off += 4;
  dv.setFloat32(off, spanX, true); off += 4;
  dv.setFloat32(off, minY, true); off += 4;
  dv.setFloat32(off, spanY, true); off += 4;

  const writeChunk = (bytes) => {
    dv.setUint32(off, bytes.byteLength, true); off += 4;
    u8.set(bytes, off); off += bytes.byteLength;
  };
  writeChunk(metaBytes);
  writeChunk(playersBytes);

  const writeBytes = (ta) => {
    u8.set(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength), off);
    off += ta.byteLength;
  };
  writeBytes(ft);
  writeChunk(vqx);
  writeChunk(vqy);
  writeBytes(qfx); writeBytes(qfy); writeBytes(qlk);

  return ab;
}

// LEB128 varint stream of an int16 delta array (SENTINEL → V_UNSAMPLED code).
// Deltas are tiny, so most values land in a single byte.
function encodeVarintStream(deltas) {
  const out = new Uint8Array(deltas.length * 3 + 8); // 3 bytes covers any 16-bit code
  let o = 0;
  for (let i = 0; i < deltas.length; i++) {
    let u = deltas[i] === SENTINEL ? V_UNSAMPLED : zigzag(deltas[i]);
    while (u >= 0x80) { out[o++] = (u & 0x7f) | 0x80; u >>>= 7; }
    out[o++] = u;
  }
  return out.subarray(0, o);
}

export function decodeQuantReplay(ab) {
  const fmt = new DataView(ab).getUint8(0);
  if (fmt === FMT_DELTA) return decodeDelta(ab);
  if (fmt === FMT_ABS) return decodeAbsolute(ab);
  throw new Error(`Unsupported quant replay fmt ${fmt}`);
}

// Shared header read for both formats: returns the fixed fields and the offset
// positioned just past frameTimes (where the streams begin).
function readHeader(ab) {
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);
  let off = 4; // skip fmt + flags + pad
  const F = dv.getUint32(off, true); off += 4;
  const P = dv.getUint32(off, true); off += 4;
  const minX = dv.getFloat32(off, true); off += 4;
  const spanX = dv.getFloat32(off, true); off += 4;
  const minY = dv.getFloat32(off, true); off += 4;
  const spanY = dv.getFloat32(off, true); off += 4;

  const readChunk = () => {
    const len = dv.getUint32(off, true); off += 4;
    const obj = JSON.parse(dec.decode(u8.subarray(off, off + len)));
    off += len;
    return obj;
  };
  const meta = readChunk();
  const players = readChunk();
  const N = F * P;
  const frameTimes = new Float32Array(ab.slice(off, off + F * 4)); off += F * 4;
  return { dv, u8, off, F, P, N, minX, spanX, minY, spanY, meta, players, frameTimes };
}

// Rebuild the tracks/frame shape from reconstructed quantized position ints.
function buildTracks(qx, qy, qfx, qfy, qlk, ctx) {
  const { N, minX, spanX, minY, spanY, meta, players, frameTimes, F, P } = ctx;
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const z = new Float32Array(N);      // dropped in the share → zeros
  const fx = new Float32Array(N);
  const fy = new Float32Array(N);
  const lk = new Uint8Array(N);
  const invX = spanX > 0 ? spanX / RANGE : 0;
  const invY = spanY > 0 ? spanY / RANGE : 0;
  for (let i = 0; i < N; i++) {
    if (qx[i] === SENTINEL) { x[i] = NaN; continue; } // rest stay 0
    x[i] = minX + (qx[i] + 32767) * invX;
    y[i] = minY + (qy[i] + 32767) * invY;
    fx[i] = qfx[i] / 127;
    fy[i] = qfy[i] / 127;
    lk[i] = qlk[i];
  }
  return {
    meta, players, frameTimes,
    tracks: { x, y, z, fx, fy, lk },
    frameCount: F, playerCount: P,
  };
}

function decodeDelta(ab) {
  const ctx = readHeader(ab);
  const { dv, u8, F, P, N } = ctx;
  let off = ctx.off;
  const readChunkBytes = () => {
    const len = dv.getUint32(off, true); off += 4;
    const bytes = u8.subarray(off, off + len); off += len;
    return bytes;
  };
  const vqx = readChunkBytes();
  const vqy = readChunkBytes();
  const qx = decodeVarintPositions(vqx, F, P);
  const qy = decodeVarintPositions(vqy, F, P);

  // qfx/qfy/qlk slice out to their own aligned buffers.
  const qfx = new Int8Array(ab.slice(off, off + N)); off += N;
  const qfy = new Int8Array(ab.slice(off, off + N)); off += N;
  const qlk = new Uint8Array(ab.slice(off, off + N)); off += N;
  return buildTracks(qx, qy, qfx, qfy, qlk, ctx);
}

// Invert encodeVarintStream + the per-player delta chain into absolute
// quantized positions (SENTINEL preserved for unsampled samples).
function decodeVarintPositions(bytes, F, P) {
  const N = F * P;
  const q = new Int16Array(N);
  const prev = new Int32Array(P);
  const seen = new Uint8Array(P);
  let o = 0;
  for (let j = 0; j < F; j++) {
    for (let p = 0; p < P; p++) {
      let u = 0, shift = 0, b;
      do { b = bytes[o++]; u |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
      u >>>= 0;
      const di = j * P + p;
      if (u === V_UNSAMPLED) { q[di] = SENTINEL; seen[p] = 0; continue; }
      const v = unzigzag(u);
      const cur = seen[p] ? unfold(prev[p], v) : v;
      seen[p] = 1;
      prev[p] = cur;
      q[di] = cur;
    }
  }
  return q;
}

// Legacy format 1: absolute int16 position streams.
function decodeAbsolute(ab) {
  const ctx = readHeader(ab);
  const { N } = ctx;
  let off = ctx.off;
  const qx = new Int16Array(ab.slice(off, off + N * 2)); off += N * 2;
  const qy = new Int16Array(ab.slice(off, off + N * 2)); off += N * 2;
  const qfx = new Int8Array(ab.slice(off, off + N)); off += N;
  const qfy = new Int8Array(ab.slice(off, off + N)); off += N;
  const qlk = new Uint8Array(ab.slice(off, off + N)); off += N;
  return buildTracks(qx, qy, qfx, qfy, qlk, ctx);
}
