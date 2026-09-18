import { useState, useEffect } from 'react';
import { Modal, Tag, SIDE_TEXT } from './ui/Primitives';

/**
 * SetupWizard — walks a new Grand Campaign through:
 *
 *   1. The toss (USA = heads, CSA = tails).
 *   2. Alternating placement: the winning side draws the first token from
 *      their bag and sets it down in friendly territory, then the other side
 *      draws and places, and so on until every token is on the board.
 *
 * During step 2 the wizard is a *non-blocking* floating panel — the user
 * clicks directly on the main map, and the wizard just shows whose turn it
 * is, the name of the token awaiting placement, and any error from the last
 * placement attempt.
 */
const SetupWizard = ({
  campaign,
  lastPlacementError,
  onFlip,
  onClose,
  onClearError,
}) => {
  const gc = campaign?.grandCampaign;
  if (!gc) return null;

  const [flipping, setFlipping] = useState(false);
  const [flipResult, setFlipResult] = useState(null);

  // Clear transient error when the current token changes (successful placement).
  useEffect(() => {
    if (lastPlacementError) onClearError?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gc.currentTokenId]);

  const phase = gc.phase;

  // ----- Step 1: the toss -----
  if (phase === 'setup-coinflip') {
    const handleFlip = () => {
      if (flipping) return;
      setFlipping(true);
      // Short animation then commit result.
      const result = Math.random() < 0.5 ? 'USA' : 'CSA';
      setTimeout(() => {
        setFlipResult(result);
        setFlipping(false);
      }, 900);
    };
    const commit = () => {
      if (!flipResult) return;
      onFlip(flipResult);
    };

    return (
      <Modal
        title="The toss"
        subtitle="Heads the Union, tails the Confederacy. The winning side draws and places first, and the tokens alternate from there."
        width="max-w-md"
        onClose={onClose}
        footer={
          <>
            <button
              onClick={handleFlip}
              disabled={flipping || !!flipResult}
              className="ui-btn flex-1"
            >
              {flipResult ? 'Flipped' : 'Flip the coin'}
            </button>
            <button
              onClick={commit}
              disabled={!flipResult}
              className="ui-btn ui-btn-primary flex-1"
            >
              Begin placement
            </button>
          </>
        }
      >
        <div className="ui-box flex flex-col items-center justify-center min-h-[9rem] text-center">
          {/* The coin in the air. Drawn rather than bordered, so it can be
              round without a border radius anywhere in the sheet. */}
          {flipping && (
            <svg viewBox="0 0 40 40" className="w-16 h-16 animate-spin" aria-hidden="true">
              <circle
                cx="20" cy="20" r="17"
                fill="none"
                stroke="var(--color-rule)"
                strokeWidth="2"
                strokeDasharray="78 29"
                strokeLinecap="round"
              />
            </svg>
          )}
          {!flipping && !flipResult && (
            <p className="ui-hint">The coin is in the air — flip to begin.</p>
          )}
          {!flipping && flipResult && (
            <>
              <div className={`font-display text-5xl font-black ${SIDE_TEXT[flipResult]}`}>
                {flipResult}
              </div>
              <div className="ui-eyebrow mt-2">wins the toss and draws first</div>
            </>
          )}
        </div>
      </Modal>
    );
  }

  // ----- Step 2: placement (floating hud) -----
  if (phase === 'setup-placement') {
    const currentToken = gc.tokens.find(t => t.id === gc.currentTokenId);
    const remaining = (side) =>
      gc.bags[side].length + (gc.activeSide === side && gc.currentTokenId ? 1 : 0);

    return (
      <div className="ui-hud">
        <div className="flex items-baseline justify-between gap-3">
          <div className="ui-eyebrow">Placement</div>
          <div className="text-[12px] tabular text-ink-2">
            {['USA', 'CSA'].map((side, i) => (
              <span key={side}>
                {i > 0 && <span className="text-ink-3"> · </span>}
                <span className={SIDE_TEXT[side]}>{side}</span> {remaining(side)} left
              </span>
            ))}
          </div>
        </div>

        {currentToken ? (
          <div className="mt-1.5 pt-1.5 border-t border-paper-3">
            <div className={`text-base font-bold leading-tight ${SIDE_TEXT[currentToken.side]}`}>
              {currentToken.name}
            </div>
            <p className="ui-hint mt-0.5">
              Click any ground held by the{' '}
              <span className={`font-bold not-italic ${SIDE_TEXT[currentToken.side]}`}>
                {currentToken.side}
              </span>
              . Two formations cannot share a spot.
            </p>
          </div>
        ) : (
          <p className="ui-hint mt-1.5 pt-1.5 border-t border-paper-3">Awaiting the next draw…</p>
        )}

        {lastPlacementError && (
          <p className="text-[13px] mt-2">
            <Tag tone="mark">Refused</Tag>{' '}
            <span className="text-ink-2">{lastPlacementError}</span>
          </p>
        )}

        <p className="ui-hint mt-2 pt-1.5 border-t border-paper-3">
          Setup goes on by itself after each good placement.
        </p>
      </div>
    );
  }

  return null;
};

export default SetupWizard;
