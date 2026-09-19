import { Modal, Row, SIDE_TEXT } from './ui/Primitives';
import { inchesToMiles } from '../utils/grandCampaignLogic';

/**
 * LSRetreatModal — offered when a last-stand token wins a battle.
 *
 * The rules say this is a *may* retreat (up to N march-MP toward the
 * nearest friendly city). We give the player three options:
 *   - Skip: stay put.
 *   - Auto-retreat: use applyRetreat() toward the nearest stronghold.
 *   - Pick spot: close modal and enter a retreat-click mode on the map.
 */
const LSRetreatModal = ({ campaign, tokenId, maxMP, onSkip, onAuto, onPickSpot }) => {
  const gc = campaign?.grandCampaign;
  if (!gc || !tokenId) return null;
  const token = gc.tokens.find(t => t.id === tokenId);
  if (!token) return null;

  const maxInches = maxMP * gc.settings.marchInchesPerMP;
  const maxMiles = inchesToMiles(maxInches, gc.settings);

  return (
    <Modal
      title="The last stand holds"
      subtitle="The survivors may fall back, or hold the ground they kept."
      width="max-w-md"
      onClose={onSkip}
      dismissible={false}
      footer={
        <button onClick={onSkip} className="ui-btn ui-btn-block">
          Hold the position
        </button>
      }
    >
      <div className={`text-lg font-bold leading-tight ${SIDE_TEXT[token.side]}`}>
        {token.name}
      </div>
      <div className="mt-1.5">
        <Row label="Strength" value={`${(token.manpower || 0).toLocaleString('en-US')} men`} />
        <Row label="Retreat range" value={`${maxMiles} miles · ${maxMP} march-MP`} />
      </div>

      <p className="ui-hint mt-2">
        A last-stand winner takes no casualties and may fall back up to {maxMP}{' '}
        {maxMP === 1 ? 'hex' : 'hexes'} toward its nearest friendly city. It is a
        choice, not an order.
      </p>

      <div className="flex flex-col gap-2 mt-4">
        <button onClick={onAuto} className="ui-btn ui-btn-primary ui-btn-block">
          Fall back on the nearest city or fort
        </button>
        <button onClick={onPickSpot} className="ui-btn ui-btn-block">
          Choose the ground on the map
        </button>
      </div>
    </Modal>
  );
};

export default LSRetreatModal;
