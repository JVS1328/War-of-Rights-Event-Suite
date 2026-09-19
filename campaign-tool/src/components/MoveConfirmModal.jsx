import { Modal, Row, Tag } from './ui/Primitives';

/**
 * MoveConfirmModal — confirms a proposed move for the currently-acting token.
 *
 * Mode is derived server-side (evaluation.mode) based on whether the token is
 * boarded on a rail or river. No more multi-mode picker — the user embarks
 * or disembarks via dedicated turn actions.
 */
const MODE_LABEL = { march: 'March', river: 'River', rail: 'Rail' };

const MoveConfirmModal = ({ evaluation, token, destination, mpLeft, onConfirm, onCancel }) => {
  if (!evaluation?.valid || !token || !destination) return null;

  const mode = evaluation.mode;
  const label = MODE_LABEL[mode] || MODE_LABEL.march;
  const cost = evaluation.cost;
  const canAfford = cost <= mpLeft;
  const ratePerMP = evaluation.ratesMilesPerMP?.[mode];

  return (
    <Modal
      title="Confirm the move"
      subtitle={token.name}
      width="max-w-sm"
      onClose={onCancel}
      dismissible={false}
      footer={
        <>
          <button onClick={onCancel} className="ui-btn flex-1">Cancel</button>
          <button
            onClick={() => onConfirm()}
            disabled={!canAfford}
            className="ui-btn ui-btn-primary flex-1"
          >
            Order the march
          </button>
        </>
      }
    >
      <Row label="By" value={label} />
      <Row label="Distance" value={`${evaluation.miles ?? 0} miles`} />
      {ratePerMP != null && <Row label="Rate" value={`${ratePerMP} miles per MP`} />}
      {evaluation.crossings > 0 && (
        <Row
          label="River crossings"
          value={<span className="text-mark">{evaluation.crossings} (+{evaluation.crossings} MP)</span>}
        />
      )}
      <Row label="Costs" value={`${cost} MP`} />
      <Row
        label="Left after"
        value={canAfford ? `${mpLeft - cost} of ${mpLeft} MP` : <span className="text-ink-3">—</span>}
      />

      {evaluation.boardedType && (
        <p className="ui-hint mt-3">
          Moving along the {evaluation.boardedType} it is aboard. The turn carries on
          while movement points remain — disembark when the men are to go ashore,
          which ends it.
        </p>
      )}

      {!canAfford && (
        <p className="text-[13px] mt-3">
          <Tag tone="mark">Too far</Tag>{' '}
          <span className="text-ink-2">Not enough movement points for this march.</span>
        </p>
      )}
    </Modal>
  );
};

export default MoveConfirmModal;
