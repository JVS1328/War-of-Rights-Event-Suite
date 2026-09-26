import { useEffect, useState } from 'react';

/** Subscribe to a CSS media query from JS, for behaviour CSS can't express. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/**
 * True on touch-first devices. Hover and Ctrl-held gestures don't exist there,
 * so anything gated behind them needs a tap-shaped alternative.
 */
export const useCoarsePointer = () => useMediaQuery('(pointer: coarse)');

/** True when the viewer has asked their system for less motion. */
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
