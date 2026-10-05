import pako from 'pako';
import { encodeQuantReplay, decodeQuantReplay } from './quantReplay.js';

/**
 * A round's replay as one stored blob: the quantized pose stream plus the
 * round's artillery and round events, deflated together.
 *
 *   [u8 version=1][u32 headerLen LE][header JSON: { arty, events }][quantized replay]
 *
 * Blobs packed before the events companion have no `events`; they unpack with
 * events null. Whoever stores it (the season tracker's chunked API, the PUBS
 * dashboard's watcher upload) treats the bytes as opaque.
 */

const VERSION = 1;

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * @param {any} replay parsed replay (parseReplayCsv) @param {any} arty parsed arty (parseArtyCsv) or null
 * @param {any[] | null} [events] parsed round events (parseEventsCsv) or null
 */
export function packReplay(replay, arty, events = null) {
  const header = enc.encode(JSON.stringify({ arty, events }));
  const body = new Uint8Array(encodeQuantReplay(replay));
  const out = new Uint8Array(5 + header.byteLength + body.byteLength);
  out[0] = VERSION;
  new DataView(out.buffer).setUint32(1, header.byteLength, true);
  out.set(header, 5);
  out.set(body, 5 + header.byteLength);
  return pako.deflateRaw(out);
}

/** @param {Uint8Array} packed */
export function unpackReplay(packed) {
  const raw = pako.inflateRaw(packed);
  if (raw[0] !== VERSION) throw new Error(`Unknown replay format ${raw[0]}`);
  const len = new DataView(raw.buffer, raw.byteOffset).getUint32(1, true);
  const { arty, events } = JSON.parse(dec.decode(raw.subarray(5, 5 + len)));
  const body = raw.slice(5 + len);
  return { replay: decodeQuantReplay(body.buffer), arty: arty ?? null, events: events ?? null };
}
