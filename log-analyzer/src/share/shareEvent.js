// Event-scoped share links.
//
// Serializes a whole event (light round metadata + attached scoreboards +
// inlined replay payloads) into a compressed payload, and stores it either
// behind a short id via /api/share (Redis) or inline in the URL fragment as a
// fallback.
//
// Transport format (v3): a single binary container
//
//   [u8 version=3][u32 headerLen LE][header JSON utf-8][replay0][replay1]…
//
// deflated ONCE (raw binary) and base64url'd ONCE. Two size wins stack here:
//   1. No double-encoding. The old v1 format base64'd each replay, embedded
//      those strings in JSON, then deflated + base64'd the whole thing again —
//      inflating the payload and making deflate chew on already-base64'd bytes.
//   2. Quantized replay blobs (see ./quantReplay): int16 positions, int8
//      headings, dropped z — ~1/3 the bytes of the full-fidelity codec, which
//      is what actually brings large multi-round events under the short-link
//      cap instead of falling back to multi-MB inline URLs.
// v2 (full-fidelity blobs) and v1 (legacy JSON) links are still decoded.

import pako from 'pako';
import { decodeReplay, bufferToBase64Url, base64UrlToBuffer } from '../utils/replayCodec';
import { encodeQuantReplay, decodeQuantReplay } from './quantReplay';

const VERSION = 3;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

// Light, JSON-safe view of the event (rounds keep their meta + inline
// scoreboard; replay bytes travel separately in the binary container).
function serializeEvent(event) {
  return {
    id: event.id,
    name: event.name,
    createdAt: event.createdAt,
    rounds: event.rounds.map((r) => ({
      id: r.id,
      replayId: r.replayId,
      filename: r.filename,
      ts: r.ts,
      meta: r.meta,
      scoreboard: r.scoreboard || null,
      scoreboardFilename: r.scoreboardFilename || null,
      arty: r.arty || null,
      artyFilename: r.artyFilename || null,
    })),
  };
}

// --- encode: event + replays → { payload: base64url string, stride } ---

// Target size (base64 chars) for the whole stored payload. Uploads are now
// CHUNKED (see putSharePayload), so this is no longer bounded by the store's
// ~1 MB per-request limit — it's a fidelity/UX budget: how much we're willing
// to store and have the recipient download+decode before trading playback
// frames away via `stride`. Set generously so realistic multi-round events
// share at full fidelity (stride 1); only very large events get downsampled.
const SHARE_BUDGET = 12_000_000;

function buildAtStride(event, replays, stride) {
  const order = [];
  const blobs = [];
  const seen = new Set();
  for (const round of event.rounds) {
    const rid = round.replayId;
    if (!rid || seen.has(rid)) continue;
    const replay = replays.get(rid);
    if (!replay) continue;
    seen.add(rid);
    const buf = new Uint8Array(encodeQuantReplay(replay, stride));
    order.push({ id: rid, len: buf.byteLength });
    blobs.push(buf);
  }

  const header = enc.encode(JSON.stringify({ v: VERSION, event: serializeEvent(event), rp: order }));
  let total = 1 + 4 + header.byteLength;
  for (const b of blobs) total += b.byteLength;

  const container = new Uint8Array(total);
  const dv = new DataView(container.buffer);
  container[0] = VERSION;
  dv.setUint32(1, header.byteLength, true);
  container.set(header, 5);
  let off = 5 + header.byteLength;
  for (const b of blobs) { container.set(b, off); off += b.byteLength; }

  // level 6: near level 9's size on position data but much faster.
  return bufferToBase64Url(pako.deflateRaw(container, { level: 6 }));
}

export function encodeEventShare(event, replays, { maxBytes = SHARE_BUDGET } = {}) {
  // Estimate a starting stride from the total player-frames so a huge event
  // usually fits on the first pass without an expensive full-resolution build.
  // ~4 base64 chars per delta-quantized player-frame is a deliberate UNDER-
  // estimate (real is ~4.5–6): the correction loop below only ever raises
  // stride, so starting low just risks an extra build, while starting high
  // would strand frames that never come back.
  let totalPF = 0;
  const seen = new Set();
  for (const round of event.rounds) {
    const rid = round.replayId;
    if (!rid || seen.has(rid)) continue;
    seen.add(rid);
    const rp = replays.get(rid);
    if (rp) totalPF += rp.frameCount * rp.playerCount;
  }
  let stride = maxBytes > 0 ? Math.max(1, Math.ceil((totalPF * 4.0) / maxBytes)) : 1;
  let payload = buildAtStride(event, replays, stride);

  // Correct the estimate against the real compressed size (increase only).
  for (let i = 0; i < 5 && maxBytes > 0 && payload.length > maxBytes && stride < 4096; i++) {
    stride = Math.max(stride + 1, Math.ceil(stride * (payload.length / maxBytes) * 1.05));
    payload = buildAtStride(event, replays, stride);
  }
  return { payload, stride };
}

// --- decode: base64url payload string → { event, replays: Map } ---

export function decodeEventShare(encoded) {
  const bytes = new Uint8Array(base64UrlToBuffer(encoded));
  const inflated = pako.inflateRaw(bytes);
  const v = inflated[0];
  if (v === 3) return decodeContainer(inflated, decodeQuantReplay); // quantized blobs
  if (v === 2) return decodeContainer(inflated, decodeReplay);      // full-fidelity blobs
  return decodeV1(inflated);                                        // legacy JSON
}

// Shared decode for the binary container formats (v2/v3); `decodeBlob` turns a
// replay blob's ArrayBuffer back into a replay.
function decodeContainer(inflated, decodeBlob) {
  const dv = new DataView(inflated.buffer, inflated.byteOffset, inflated.byteLength);
  const headerLen = dv.getUint32(1, true);
  const header = JSON.parse(dec.decode(inflated.subarray(5, 5 + headerLen)));
  let off = 5 + headerLen;
  const replays = new Map();
  for (const { id, len } of header.rp || []) {
    // Copy each blob out to its own buffer so the typed-array views inside the
    // decoder land on a fresh, aligned ArrayBuffer.
    const slice = inflated.slice(off, off + len);
    off += len;
    try { replays.set(id, decodeBlob(slice.buffer)); }
    catch (err) { console.warn('Failed to decode shared replay', id, err); }
  }
  return { event: header.event, replays };
}

// Legacy v1: the whole inflated buffer is JSON { v:1, event, rp: {id:b64url} }.
function decodeV1(inflated) {
  const obj = JSON.parse(dec.decode(inflated));
  if (obj.v !== 1) throw new Error('Unsupported share version');
  const replays = new Map();
  for (const [id, b64] of Object.entries(obj.rp || {})) {
    try { replays.set(id, decodeReplay(base64UrlToBuffer(b64))); }
    catch (err) { console.warn('Failed to decode shared replay', id, err); }
  }
  return { event: obj.event, replays };
}

// --- transport ---

function shareBase() {
  return `${window.location.origin}${window.location.pathname}`;
}

// A single Upstash REST value/request is capped near 1 MB, so the encoded
// payload is uploaded as sub-1MB string chunks under separate keys plus a small
// manifest — the same scheme the season-tracker uses. This is what lets a
// full-fidelity multi-round event share without being downsampled to fit one
// request.
const CHUNK_SIZE = 500_000;   // chars/chunk — safely under the ~1MB/request cap
const SHARE_CONCURRENCY = 5;  // bounded parallelism for chunk up/downloads
// A browser/URL can't carry a multi-MB fragment, so the inline fallback is only
// viable for small events. Above this, the short link is the only transport.
const INLINE_MAX = 60_000;

// SHA-256 hex of a string; the short id is its first 8 chars (matches the id the
// server would compute for a legacy single-value link, so dedupe is stable).
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  let hex = '';
  for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function splitIntoChunks(str, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) chunks.push(str.slice(i, i + size));
  return chunks;
}

// Run an async task over each item with bounded concurrency, preserving order.
async function runBounded(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function postShare(body) {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Share API unavailable');
  return res;
}

// Upload an encoded payload as chunks + a manifest; returns the short id. The
// chunk size is overridable so tests can exercise the multi-chunk path cheaply.
export async function putSharePayload(encoded, chunkSize = CHUNK_SIZE) {
  const id = (await sha256Hex(encoded)).slice(0, 8);
  const chunks = splitIntoChunks(encoded, chunkSize);
  // Store every chunk first, then the manifest, so a reader never sees a
  // manifest that points at chunks which aren't written yet.
  await runBounded(chunks, SHARE_CONCURRENCY, (chunk, index) => postShare({ id, index, chunk }));
  await postShare({ id, total: chunks.length });
  return id;
}

// Try the short link (chunked upload) first; fall back to an inline fragment
// only for small events. Returns { url, stride }, where stride > 1 means the
// shared copy was downsampled in time to fit the size budget.
export async function createEventShareUrl(event, replays) {
  const { payload: encoded, stride } = encodeEventShare(event, replays);
  try {
    const id = await putSharePayload(encoded);
    return { url: `${shareBase()}#s=${id}`, stride };
  } catch (err) {
    console.warn('Short share link failed, falling back to inline', err);
  }
  if (encoded.length > INLINE_MAX) {
    throw new Error('Share service is unavailable and this event is too large for an inline link.');
  }
  return { url: `${shareBase()}#share=${encoded}`, stride };
}

// Inspect the URL hash for a share. Returns { pending, id } for a short link,
// a decoded { event, replays } for an inline link, or null.
export function getShareFromUrl() {
  const hash = window.location.hash;
  if (hash.startsWith('#s=')) return { pending: true, id: hash.slice(3) };
  if (hash.startsWith('#share=')) {
    try { return decodeEventShare(hash.slice(7)); }
    catch { return null; }
  }
  return null;
}

// Fetch + decode a short-link payload by id → { event, replays } or null.
// Legacy single-value links return the payload inline; chunked links return a
// manifest and we fetch each chunk and reassemble in order.
export async function fetchSharePayload(id) {
  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();

    if (typeof data.payload === 'string') return decodeEventShare(data.payload);

    if (data.chunked && Number.isInteger(data.total) && data.total > 0) {
      const indices = Array.from({ length: data.total }, (_, i) => i);
      const parts = await runBounded(indices, SHARE_CONCURRENCY, async (i) => {
        const r = await fetch(`/api/share?id=${encodeURIComponent(id)}&chunk=${i}`);
        if (!r.ok) throw new Error('Missing chunk');
        const d = await r.json();
        if (typeof d.chunk !== 'string') throw new Error('Bad chunk');
        return d.chunk;
      });
      return decodeEventShare(parts.join(''));
    }

    return null;
  } catch {
    return null;
  }
}
