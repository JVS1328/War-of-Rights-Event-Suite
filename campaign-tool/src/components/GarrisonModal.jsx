import { useState } from 'react';
import { Modal, Row, SIDE_TEXT } from './ui/Primitives';

/**
 * GarrisonModal — detach men from the current token into (or pull them from)
 * the friendly city/fort at the token's position. Either operation ends the
 * token's turn.
 */
const GarrisonModal = ({ campaign, token, feature, onGarrison, onRecall, onCancel }) => {
  const [amount, setAmount] = useState('100');
  const [mode, setMode] = useState('detach'); // 'detach' | 'recall'

  if (!campaign || !token || !feature) return null;
  const gc = campaign.grandCampaign;
  const maxGarrison = gc.settings.maxGarrison;
  const currentGarrison = feature.garrison?.men || 0;

  const n = Math.max(0, Math.round(Number(amount) || 0));
  const detachCap = Math.min(token.manpower, maxGarrison - currentGarrison);
  const recallCap = currentGarrison;
  const cap = mode === 'detach' ? detachCap : recallCap;

  const validDetach = mode === 'detach' && n > 0 && n <= detachCap;
  const validRecall = mode === 'recall' && n > 0 && n <= recallCap;
  const canSubmit = validDetach || validRecall;

  const submit = () => {
    if (!canSubmit) return;
    if (mode === 'detach') onGarrison(feature.id, n);
    else onRecall(feature.id, n);
  };

  return (
    <Modal
      title={`Garrison — ${feature.name}`}
      subtitle="Leaving men behind, or taking them back up."
      width="max-w-sm"
      onClose={onCancel}
      dismissible={false}
      footer={
        <>
          <button onClick={onCancel} className="ui-btn flex-1">Cancel</button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="ui-btn ui-btn-primary flex-1"
          >
            Confirm
          </button>
        </>
      }
    >
      <Row label="In garrison" value={`${currentGarrison} of ${maxGarrison}`} />
      <Row
        label="Formation"
        value={
          <>
            <span className={SIDE_TEXT[token.side]}>{token.name}</span>
            <span className="text-ink-3 font-normal"> · {(token.manpower || 0).toLocaleString('en-US')} men</span>
          </>
        }
      />

      <div className="ui-box mt-3">
        <div className="ui-eyebrow mb-1">The order</div>
        <div className="ui-segment">
          {['detach', 'recall'].map(o => (
            <button
              key={o}
              type="button"
              onClick={() => setMode(o)}
              data-active={mode === o}
            >
              {o === 'detach' ? 'Detach to garrison' : 'Recall from garrison'}
            </button>
          ))}
        </div>
        <p className="ui-hint mt-1">
          {mode === 'detach'
            ? 'Men leave the column and hold the works.'
            : 'Men come out of the works and back to the colours.'}
        </p>

        <div className="mt-2.5">
          <label className="ui-label" htmlFor="garrison-amount">
            Men ({cap} at most)
          </label>
          <input
            id="garrison-amount"
            type="number"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="ui-field tabular"
          />
        </div>
      </div>

      <p className="ui-hint mt-3">This ends the formation's turn.</p>
    </Modal>
  );
};

export default GarrisonModal;
