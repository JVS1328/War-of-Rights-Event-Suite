import { useState, useMemo } from 'react';
import { Modal, Row } from './ui/Primitives';

/**
 * ReplenishModal — buy men for the current token in 100-unit increments.
 *
 * Live cost preview in treasury + national manpower. Amount is capped by
 * whichever pool runs out first. Button +/- moves one unit (replenishYield)
 * at a time; a slider and direct input are also available.
 */
const ReplenishModal = ({ campaign, token, onConfirm, onCancel }) => {
  const gc = campaign?.grandCampaign;
  const s = gc?.settings;

  const unit = s?.replenishYield || 100;
  const maxByTreasury = s ? Math.floor(gc.pools[token.side].treasury / s.replenishMoneyCost) * unit : 0;
  const maxByManpower = s ? Math.floor(gc.pools[token.side].manpower / s.replenishManpowerCost) * unit : 0;
  const maxAffordable = Math.max(0, Math.min(maxByTreasury, maxByManpower));

  const [men, setMen] = useState(Math.min(unit, maxAffordable));

  const breakdown = useMemo(() => {
    if (!s) return null;
    const units = Math.max(0, Math.floor(men / unit));
    return {
      units,
      actualMen: units * unit,
      moneyCost: units * s.replenishMoneyCost,
      manpowerCost: units * s.replenishManpowerCost,
    };
  }, [men, unit, s]);

  if (!gc || !token || !breakdown) return null;

  const pool = gc.pools[token.side];
  const canBuy = breakdown.units > 0 && breakdown.moneyCost <= pool.treasury && breakdown.manpowerCost <= pool.manpower;

  const adjust = (delta) => {
    const raw = Math.max(0, Math.min(maxAffordable, men + delta));
    setMen(Math.round(raw / unit) * unit);
  };

  const num = (n) => (n || 0).toLocaleString('en-US');
  const over = (cost, have) => (cost > have ? 'text-mark' : '');

  return (
    <Modal
      title={`Replenish — ${token.name}`}
      subtitle={`${unit} men for $${s.replenishMoneyCost} and ${s.replenishManpowerCost} from the depots.`}
      width="max-w-sm"
      onClose={onCancel}
      dismissible={false}
      footer={
        <>
          <button onClick={onCancel} className="ui-btn flex-1">Cancel</button>
          <button
            onClick={() => onConfirm(breakdown.actualMen)}
            disabled={!canBuy}
            className="ui-btn ui-btn-primary flex-1"
          >
            Take on {num(breakdown.actualMen)}
          </button>
        </>
      }
    >
      <Row label="Present strength" value={`${num(token.manpower)} men`} />

      <div className="ui-box mt-3">
        <div className="flex items-baseline justify-between">
          <span className="ui-eyebrow">Men to take on</span>
          <span className="ui-hint">{num(maxAffordable)} affordable</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => adjust(-unit)}
            disabled={men <= 0}
            className="ui-btn ui-btn-sm tabular"
            aria-label={`Fewer by ${unit}`}
          >
            −{unit}
          </button>
          <input
            type="number"
            step={unit}
            min="0"
            max={maxAffordable}
            value={men}
            onChange={e => setMen(Math.max(0, Math.min(maxAffordable, Number(e.target.value) || 0)))}
            aria-label="Men to take on"
            className="ui-field flex-1 text-center font-bold tabular"
          />
          <button
            onClick={() => adjust(unit)}
            disabled={men >= maxAffordable}
            className="ui-btn ui-btn-sm tabular"
            aria-label={`More by ${unit}`}
          >
            +{unit}
          </button>
        </div>
        {maxAffordable > 0 && (
          <input
            type="range"
            min="0"
            max={maxAffordable}
            step={unit}
            value={Math.min(men, maxAffordable)}
            onChange={e => setMen(Number(e.target.value))}
            aria-label="Men to take on"
            className="w-full mt-2 accent-ink"
          />
        )}
      </div>

      <div className="mt-3">
        <Row
          label="From the treasury"
          value={
            <span className={over(breakdown.moneyCost, pool.treasury)}>
              ${num(breakdown.moneyCost)}
              <span className="text-ink-3 font-normal"> of ${num(pool.treasury)}</span>
            </span>
          }
        />
        <Row
          label="From the depots"
          value={
            <span className={over(breakdown.manpowerCost, pool.manpower)}>
              {num(breakdown.manpowerCost)}
              <span className="text-ink-3 font-normal"> of {num(pool.manpower)}</span>
            </span>
          }
        />
        <Row
          label="Strength after"
          value={<span className="text-good">{num(token.manpower + breakdown.actualMen)} men</span>}
        />
      </div>

      <p className="ui-hint mt-3">This ends the formation's turn.</p>
    </Modal>
  );
};

export default ReplenishModal;
