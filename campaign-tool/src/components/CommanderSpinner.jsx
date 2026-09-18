import { useState, useEffect, useRef } from 'react';
import { getAvailableCommanders } from '../utils/campaignLogic';
import { SIDE_TEXT } from './ui/Primitives';

/**
 * CommanderSpinner - the draw for who leads the next battle.
 *
 * Features:
 * - A reel that flickers through the available regiments before settling, or
 *   a manual pick from the same list
 * - Pool management (selected commanders leave the pool; the pool refills
 *   once everyone has led, benching whoever led last for one draw)
 * - Both sides drawn as ruled lines: side · regiment · action
 */
const CommanderSpinner = ({
  regiments,
  commanderPool,
  benchedCommanders,
  onSelect,
  selectedCommanders,
  disabled = false
}) => {
  const [spinning, setSpinning] = useState({ USA: false, CSA: false });
  const [displayName, setDisplayName] = useState({ USA: null, CSA: null });
  const spinIntervalRef = useRef({ USA: null, CSA: null });

  // Get available regiments for each side. An empty pool means every
  // regiment is back in the running; the benched one sits out a draw.
  const getAvailableRegiments = (side) =>
    getAvailableCommanders(regiments?.[side], commanderPool?.[side], benchedCommanders?.[side]);

  const spin = (side) => {
    const available = getAvailableRegiments(side);
    if (available.length === 0 || spinning[side] || disabled) return;

    setSpinning({ ...spinning, [side]: true });

    let iterations = 0;
    const maxIterations = 20 + Math.floor(Math.random() * 10); // 20-30 iterations

    // Clear any existing interval
    if (spinIntervalRef.current[side]) {
      clearInterval(spinIntervalRef.current[side]);
    }

    spinIntervalRef.current[side] = setInterval(() => {
      // Pick a random regiment to display
      const randomIndex = Math.floor(Math.random() * available.length);
      setDisplayName(prev => ({ ...prev, [side]: available[randomIndex].name }));

      iterations++;

      if (iterations >= maxIterations) {
        clearInterval(spinIntervalRef.current[side]);

        // Final selection
        const finalIndex = Math.floor(Math.random() * available.length);
        const selected = available[finalIndex];

        setDisplayName(prev => ({ ...prev, [side]: selected.name }));
        setSpinning(prev => ({ ...prev, [side]: false }));

        // Notify parent
        onSelect(side, selected);
      }
    }, 50 + (iterations * 5)); // Gradually slow down
  };

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (spinIntervalRef.current.USA) clearInterval(spinIntervalRef.current.USA);
      if (spinIntervalRef.current.CSA) clearInterval(spinIntervalRef.current.CSA);
    };
  }, []);

  const SIDE_NAME = { USA: 'Union', CSA: 'Confederate' };

  const renderLine = (side) => {
    const sideRegiments = regiments?.[side] || [];
    const available = getAvailableRegiments(side);
    const isSpinning = spinning[side];
    const selected = selectedCommanders?.[side];

    return (
      <div className="ui-row" key={side}>
        <span className={`shrink-0 ${SIDE_TEXT[side]}`}>{SIDE_NAME[side]}</span>

        <span className="ui-row-value flex-1 min-w-0 truncate text-right">
          {sideRegiments.length === 0 ? (
            <span className="ui-hint font-normal">none on the rolls</span>
          ) : selected ? (
            selected.name
          ) : isSpinning ? (
            <span className="text-ink-2">{displayName[side] || '…'}</span>
          ) : (
            <span className="ui-hint font-normal">not rolled</span>
          )}
        </span>

        {sideRegiments.length > 0 && (
          <span className="flex items-center gap-1.5 shrink-0">
            {selected ? (
              <button
                onClick={() => onSelect(side, null)}
                disabled={disabled}
                className="ui-btn ui-btn-sm"
                title="Return this regiment to the pool"
              >
                Change
              </button>
            ) : (
              <>
                <button
                  onClick={() => spin(side)}
                  disabled={isSpinning || disabled || available.length === 0}
                  className="ui-btn ui-btn-sm"
                >
                  {isSpinning ? 'Rolling…' : 'Roll'}
                </button>

                {!isSpinning && available.length > 0 && !disabled && (
                  <span className="relative inline-flex">
                    <select
                      onChange={(e) => {
                        const regiment = available.find(r => r.id === e.target.value);
                        if (regiment) onSelect(side, regiment);
                      }}
                      value=""
                      title="Reserve a regiment by hand"
                      className="ui-btn ui-btn-sm w-24 appearance-none pl-2.5 pr-5 cursor-pointer"
                    >
                      <option value="" disabled>Reserve</option>
                      {available.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-2">
                      ▾
                    </span>
                  </span>
                )}
              </>
            )}
          </span>
        )}
      </div>
    );
  };

  // What is left in each pool, and who is sitting this draw out.
  const poolNote = ['USA', 'CSA']
    .filter(side => (regiments?.[side] || []).length > 0)
    .map(side => `${SIDE_NAME[side]} ${getAvailableRegiments(side).length} of ${regiments[side].length}`)
    .join(' · ');

  const benchNote = ['USA', 'CSA']
    .map(side => {
      const benched = benchedCommanders?.[side];
      if (!benched) return null;
      const available = getAvailableRegiments(side);
      const sittingOut = !available.some(r => r.id === benched.id) && !selectedCommanders?.[side];
      return sittingOut ? `${benched.name} led last and sits out this draw` : null;
    })
    .filter(Boolean)
    .join('. ');

  return (
    <>
      {renderLine('USA')}
      {renderLine('CSA')}
      {(poolNote || benchNote) && (
        <p className="ui-hint mt-1.5">
          {poolNote && <>In the pool: {poolNote}.</>}
          {poolNote && benchNote && ' '}
          {benchNote && <>{benchNote}.</>}
        </p>
      )}
    </>
  );
};

export default CommanderSpinner;
