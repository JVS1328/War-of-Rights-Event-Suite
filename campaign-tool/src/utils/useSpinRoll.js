import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Shared "slot machine" roll animation.
 *
 * Every roll in the tracker works the same way: the real result is decided up
 * front by whatever weighted roll owns it, then the UI flickers through the
 * possible faces and slows to a stop on that result. The animation is purely
 * cosmetic - it never influences the outcome.
 *
 * Used by the terrain, weather, time-of-day and initiative rolls.
 *
 * @param {Object} [config]
 * @param {number} [config.minIterations=20] - Fewest flickers before landing
 * @param {number} [config.extraIterations=10] - Random extra flickers on top
 * @param {number} [config.baseDelay=50] - Delay in ms before the first flicker
 * @param {number} [config.slowdown=8] - Added ms per flicker, producing the ease-out
 */
const DEFAULTS = {
  minIterations: 20,
  extraIterations: 10,
  baseDelay: 50,
  slowdown: 8,
};

export function useSpinRoll(config = {}) {
  const { minIterations, extraIterations, baseDelay, slowdown } = { ...DEFAULTS, ...config };

  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState(null);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Never leave a timer running against an unmounted component.
  useEffect(() => clearTimer, [clearTimer]);

  /**
   * Start a roll.
   *
   * @param {Array} faces - Values to flicker through while spinning
   * @param {*} result - The already-decided value to land on
   * @param {Function} [onSettle] - Called with `result` once the roll stops
   */
  const spin = useCallback((faces, result, onSettle) => {
    // Guard on the timer rather than on `spinning` so a rapid second click
    // can't slip through before the state update lands.
    if (timerRef.current || !Array.isArray(faces) || faces.length === 0) return;

    const total = minIterations + Math.floor(Math.random() * extraIterations);
    let iteration = 0;

    setSpinning(true);

    const step = () => {
      iteration += 1;

      if (iteration >= total) {
        timerRef.current = null;
        setDisplay(result);
        setSpinning(false);
        if (onSettle) onSettle(result);
        return;
      }

      setDisplay(faces[Math.floor(Math.random() * faces.length)]);
      // Each flicker waits a little longer than the last, so the roll eases out.
      timerRef.current = setTimeout(step, baseDelay + iteration * slowdown);
    };

    timerRef.current = setTimeout(step, baseDelay);
  }, [minIterations, extraIterations, baseDelay, slowdown]);

  /** Stop a roll early, leaving whatever face is currently showing. */
  const cancel = useCallback(() => {
    clearTimer();
    setSpinning(false);
  }, [clearTimer]);

  return { spinning, display, setDisplay, spin, cancel };
}

export default useSpinRoll;
