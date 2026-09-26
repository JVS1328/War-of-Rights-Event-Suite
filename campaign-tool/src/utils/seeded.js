/**
 * A small seeded random generator: the same key always gives the same
 * sequence, so decoration drawn from it holds still between renders.
 *
 * @param {string|number} key
 * @returns {() => number} values in [0, 1)
 */
export const seeded = (key) => {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};
