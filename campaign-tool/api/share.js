import { createClient } from 'redis';
import crypto from 'node:crypto';

const MAX_PAYLOAD = 512_000; // 500 KB

let redis;
async function getRedis() {
  if (!redis) {
    redis = await createClient({ url: process.env.REDIS_URL }).connect();
  }
  return redis;
}

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

const badPayload = (res, payload) => {
  if (!payload || typeof payload !== 'string') {
    res.status(400).json({ error: 'Missing payload' });
    return true;
  }
  if (payload.length > MAX_PAYLOAD) {
    res.status(413).json({ error: 'Payload too large' });
    return true;
  }
  return false;
};

/**
 * Share links.
 *
 *   POST { payload }             a snapshot, id taken from the payload's hash
 *   POST { payload, live: true } a live link: a random id and a write key
 *   PUT  { id, key, payload }    republish a live link (key required)
 *   GET  ?id=                    { payload, live }
 *
 * Both kinds are stored under `share:<id>`, so a reader never needs to know
 * which it holds; a live link also has `sharekey:<id>`, the hash of its key.
 */
export default async function handler(req, res) {
  const client = await getRedis();

  if (req.method === 'POST') {
    const { payload, live } = req.body || {};
    if (badPayload(res, payload)) return;

    if (live) {
      const id = crypto.randomBytes(6).toString('hex');
      const key = crypto.randomBytes(18).toString('base64url');
      await client.set(`sharekey:${id}`, hashKey(key));
      await client.set(`share:${id}`, payload);
      return res.status(200).json({ id, key });
    }

    const id = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 8);
    await client.set(`share:${id}`, payload);
    return res.status(200).json({ id });
  }

  if (req.method === 'PUT') {
    const { id, key, payload } = req.body || {};
    if (!id || typeof id !== 'string' || !key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Missing id or key' });
    }
    if (badPayload(res, payload)) return;

    const stored = await client.get(`sharekey:${id}`);
    if (stored == null) return res.status(404).json({ error: 'Not found' });
    const given = Buffer.from(hashKey(key));
    const expected = Buffer.from(stored);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await client.set(`share:${id}`, payload);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing id' });
    }

    const [payload, liveKey] = await client.mGet([`share:${id}`, `sharekey:${id}`]);
    if (payload == null) {
      return res.status(404).json({ error: 'Not found' });
    }
    // A live link changes under the reader, so it must not be cached.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ payload, live: liveKey != null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
