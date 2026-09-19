import { useSpinRoll } from '../utils/useSpinRoll';
import { rollInitiative, SIDES, getTurnOrder } from '../utils/initiative';
import { Section, SectionHead, SectionBody, SIDE_TEXT } from './ui/Primitives';

/**
 * Season-start initiative roll.
 *
 * Decides which side acts first this season, with the same flicker-and-settle
 * animation the terrain, weather and time rolls use. After the roll it shows
 * the resulting order for the current turn; the first move alternates each
 * turn from there.
 *
 * Set as a single ruled line — who has the first move, and the action that
 * decides it — in the manner of the orders of the day.
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

  // Mid-spin shows the flickering face; otherwise the settled winner.
  const shown = spinning ? display : initiative?.firstSide || null;
  const order = getTurnOrder(initiative, turn);

  return (
    <Section>
      <SectionHead
        title="Season Initiative"
        meta={initiative ? `rolled on turn ${initiative.rolledOnTurn ?? 1}` : null}
      />
      <SectionBody>
        <div className="ui-row">
          <span className="ui-row-label shrink-0">First move</span>

          <span className="ui-row-value flex-1 min-w-0 text-right">
            {shown ? (
              spinning ? (
                <span className="text-ink-2">{shown} …</span>
              ) : (
                <>
                  <span className={SIDE_TEXT[shown]}>{shown}</span>
                  <span className="font-normal text-ink-2"> opens the season</span>
                </>
              )
            ) : (
              <span className="ui-hint font-normal">No roll yet — the season is undecided.</span>
            )}
          </span>

          <button
            onClick={handleRoll}
            disabled={spinning || disabled}
            className="ui-btn ui-btn-sm shrink-0"
            title={initiative ? 'Re-roll who acts first this season' : 'Roll for who acts first this season'}
          >
            {spinning ? 'Rolling…' : initiative ? 'Re-roll' : 'Roll'}
          </button>
        </div>

        {!spinning && order.length > 0 && (
          <p className="ui-hint mt-1.5">
            Turn {turn}: <span className={`not-italic font-bold ${SIDE_TEXT[order[0]]}`}>{order[0]}</span>
            {' then '}
            <span className={`not-italic font-bold ${SIDE_TEXT[order[1]]}`}>{order[1]}</span>
            {' · the first move alternates each turn'}
          </p>
        )}
      </SectionBody>
    </Section>
  );
};

export default InitiativeRoll;
