import { useState, useEffect, useRef } from 'react';
import { RotateCw, User, Check, X, ChevronDown } from 'lucide-react';
import { getAvailableCommanders } from '../utils/campaignLogic';

/**
 * CommanderSpinner - Animated roulette for selecting battle commanders
 *
 * Features:
 * - Visual spinning animation OR manual dropdown selection
 * - Pool management (selected commanders leave the pool; the pool refills
 *   once everyone has led, benching whoever led last for one draw)
 * - Shows both USA and CSA spinners side by side
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

  const renderSpinner = (side) => {
    const sideRegiments = regiments?.[side] || [];
    const available = getAvailableRegiments(side);
    const isSpinning = spinning[side];
    const selected = selectedCommanders?.[side];
    const isUSA = side === 'USA';

    // Someone is only really "benched" while they're still in the pool but
    // held out of this draw.
    const benched = benchedCommanders?.[side];
    const isBenched = !!benched && !available.some(r => r.id === benched.id) && !selected;

    const accent = isUSA ? 'text-union-400' : 'text-rebel-400';
    const ring = isUSA ? 'border-union-500/35' : 'border-rebel-500/35';
    const tint = isUSA ? 'bg-union-900/40' : 'bg-rebel-900/40';
    const spinBtn = isUSA ? 'ui-btn-union' : 'ui-btn-rebel';

    if (sideRegiments.length === 0) {
      return (
        <div className={`rounded-xl border ${ring} ${tint} p-3 min-w-0 flex flex-col`}>
          <div className={`text-[11px] font-bold tracking-widest ${accent}`}>{side}</div>
          <div className="mt-2 text-xs text-mist-500">No regiments configured</div>
        </div>
      );
    }

    return (
      <div className={`rounded-xl border ${ring} ${tint} p-3 min-w-0 flex flex-col`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-[11px] font-bold tracking-widest ${accent}`}>{side}</span>
          <span className="text-[11px] text-mist-500 tabular whitespace-nowrap">
            {available.length}/{sideRegiments.length} in pool
          </span>
        </div>

        {/* Result window */}
        <div
          className={`mt-2 rounded-lg border px-3 py-2.5 min-h-[52px] flex items-center justify-center text-center transition-colors ${
            isSpinning
              ? 'border-brass-400/70 bg-brass-900/30'
              : selected
              ? 'border-emerald-500/50 bg-emerald-950/30'
              : 'border-ink-600 bg-ink-900/60'
          }`}
        >
          {selected ? (
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-sm font-semibold text-mist-100 truncate">{selected.name}</span>
            </div>
          ) : isSpinning ? (
            <div className="flex items-center gap-2 min-w-0">
              <RotateCw className="w-4 h-4 text-brass-300 animate-spin shrink-0" />
              <span className="text-sm font-semibold text-brass-300 truncate">
                {displayName[side] || '…'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-mist-500">
              <User className="w-4 h-4" />
              <span className="text-xs">Not rolled</span>
            </div>
          )}
        </div>

        {isBenched && (
          <div className="mt-1.5 text-[11px] text-mist-500 leading-tight">
            {benched.name} led last — sitting out this draw
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-1.5 mt-auto pt-2">
          {selected ? (
            <button
              onClick={() => onSelect(side, null)}
              disabled={disabled}
              className="ui-btn ui-btn-sm flex-1"
            >
              <X className="w-3.5 h-3.5" />
              Change
            </button>
          ) : (
            <>
              <button
                onClick={() => spin(side)}
                disabled={isSpinning || disabled || available.length === 0}
                className={`ui-btn ui-btn-sm flex-1 min-w-0 ${spinBtn}`}
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSpinning ? 'animate-spin' : ''}`} />
                {isSpinning ? 'Rolling…' : 'Roll'}
              </button>

              {!isSpinning && available.length > 0 && !disabled && (
                <div className="relative shrink-0 w-16">
                  <select
                    onChange={(e) => {
                      const regiment = available.find(r => r.id === e.target.value);
                      if (regiment) onSelect(side, regiment);
                    }}
                    value=""
                    title="Pick manually"
                    className="ui-btn ui-btn-sm w-full appearance-none pl-2 pr-5 cursor-pointer"
                  >
                    <option value="" disabled>Pick</option>
                    {available.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 text-mist-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {renderSpinner('USA')}
      {renderSpinner('CSA')}
    </div>
  );
};

export default CommanderSpinner;
