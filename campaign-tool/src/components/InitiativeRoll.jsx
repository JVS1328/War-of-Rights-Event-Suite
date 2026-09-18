import { Dice6, Flag, RotateCw } from 'lucide-react';
import { useSpinRoll } from '../utils/useSpinRoll';
import { rollInitiative, SIDES, getTurnOrder } from '../utils/initiative';

/**
 * Season-start initiative roll.
 *
 * Decides which side acts first this season, with the same flicker-and-settle
 * animation the terrain, weather and time rolls use. After the roll it shows
 * the resulting order for the current turn; the first move alternates each
 * turn from there.
 */
const InitiativeRoll = ({ campaign, onRoll, disabled = false }) => {
  const initiative = campaign?.initiative || null;
  const turn = campaign?.currentTurn || 1;
  const { spinning, display, spin } = useSpinRoll();

  const handleRoll = () => {
    if (spinning || disabled) return;
    const result = rollInitiative(turn);
    spin(SIDES, result.firstSide, () => onRoll(result));
  };

  const sideClass = (side) =>
    side === 'USA' ? 'text-union-400' : side === 'CSA' ? 'text-rebel-400' : 'text-mist-400';

  // Mid-spin shows the flickering face; otherwise the settled winner.
  const shown = spinning ? display : initiative?.firstSide || null;
  const order = getTurnOrder(initiative, turn);

  return (
    <div className="ui-inset p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-brass-400" />
          <span className="text-sm font-semibold text-mist-200">Season Initiative</span>
        </div>
        <button
          onClick={handleRoll}
          disabled={spinning || disabled}
          className={`ui-btn ui-btn-sm ${spinning || disabled ? 'opacity-50 cursor-not-allowed' : 'ui-btn-primary'}`}
          title={initiative ? 'Re-roll who acts first this season' : 'Roll for who acts first this season'}
        >
          {spinning
            ? <RotateCw className="w-3 h-3 animate-spin" />
            : <Dice6 className="w-3 h-3" />}
          {spinning ? 'Rolling…' : initiative ? 'Re-roll' : 'Roll'}
        </button>
      </div>

      <div
        className={`rounded border-2 py-6 text-center transition-colors ${
          spinning ? 'border-brass-400' : initiative ? 'border-ink-600' : 'border-ink-700 border-dashed'
        }`}
      >
        {shown ? (
          <>
            <div className={`text-3xl font-bold tracking-wide ${sideClass(shown)} ${spinning ? 'opacity-80' : ''}`}>
              {shown}
            </div>
            <div className="text-xs text-mist-500 mt-1">
              {spinning ? 'deciding who takes the field first…' : 'moves first this season'}
            </div>
          </>
        ) : (
          <div className="text-sm text-mist-500">No roll yet — roll to decide who opens the season.</div>
        )}
      </div>

      {!spinning && order.length > 0 && (
        <div className="text-xs text-mist-400 mt-3 text-center">
          Turn {turn}: <span className={`font-semibold ${sideClass(order[0])}`}>{order[0]}</span>
          {' then '}
          <span className={`font-semibold ${sideClass(order[1])}`}>{order[1]}</span>
          <span className="text-mist-600"> · alternates each turn</span>
        </div>
      )}
    </div>
  );
};

export default InitiativeRoll;
