/** Formatting shared by the tracker and the share view. */

/** Thousands-separated integer; nothing becomes 0. */
export const num = (n) => (n || 0).toLocaleString('en-US');

/** An ISO timestamp as "Apr 6, 1861". */
export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
