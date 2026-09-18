import { useState, useMemo } from 'react';
import { Modal, Row, Tag, SIDE_TEXT } from './ui/Primitives';
import { applyCasualtyModifiers, isWinterMonth } from '../utils/grandCampaignLogic';

/**
 * GrandBattleResolveModal — enter raw War of Rights casualty counts, pick a
 * winner, preview the applied modifiers (fatigue %, winter %, train/river %),
 * and confirm resolution. The store call does the manpower subtraction,
 * fatigue bump, retreat, last-stand / wipe status, and VP events.
 */
const GrandBattleResolveModal = ({ campaign, battle, onResolve, onCancel }) => {
  const gc = campaign?.grandCampaign;
  const [attackerRaw, setAttackerRaw] = useState('');
  const [defenderRaw, setDefenderRaw] = useState('');
  const [winner, setWinner] = useState(null);
  const [attackerOnTrainRiver, setAttackerOnTrainRiver] = useState(false);
  const [defenderOnTrainRiver, setDefenderOnTrainRiver] = useState(false);

  const attacker = gc?.tokens.find(t => t.id === battle?.attackerTokenId);
  const defender = gc?.tokens.find(t => t.id === battle?.defenderTokenId);
  const attackerSupport = battle?.attackerSupportId ? gc?.tokens.find(t => t.id === battle.attackerSupportId) : null;
  const defenderSupport = battle?.defenderSupportId ? gc?.tokens.find(t => t.id === battle.defenderSupportId) : null;

  const winter = useMemo(() => campaign ? isWinterMonth(campaign) : false, [campaign]);

  if (!attacker || !defender || !gc) return null;

  const rawAttacker = Number(attackerRaw) || 0;
  const rawDefender = Number(defenderRaw) || 0;

  const attackerTotal = applyCasualtyModifiers(rawAttacker, {
    fatigue: attacker.fatigue,
    isAttackerInWinter: winter,
    onTrainOrRiver: attackerOnTrainRiver,
  }, gc.settings);
  const defenderTotal = applyCasualtyModifiers(rawDefender, {
    fatigue: defender.fatigue,
    isAttackerInWinter: false,
    onTrainOrRiver: defenderOnTrainRiver,
  }, gc.settings);

  const canResolve = winner && (rawAttacker > 0 || rawDefender > 0);

  const commit = () => {
    if (!canResolve) return;
    onResolve({
      winner,
      attackerRaw: rawAttacker,
      defenderRaw: rawDefender,
      attackerOnTrainRiver,
      defenderOnTrainRiver,
    });
  };

  const tokenRow = (t, label) => (
    <Row
      label={label}
      value={
        <>
          <span className={SIDE_TEXT[t.side]}>{t.name}</span>
          <span className="text-ink-3 font-normal">
            {' · '}{(t.manpower || 0).toLocaleString('en-US')} men · fatigue {t.fatigue}
          </span>
        </>
      }
    />
  );

  /** One side's returns: the raw count, the train/river check, the modified total. */
  const returns = (which) => {
    const isAttacker = which === 'attacker';
    const value = isAttacker ? attackerRaw : defenderRaw;
    const setValue = isAttacker ? setAttackerRaw : setDefenderRaw;
    const checked = isAttacker ? attackerOnTrainRiver : defenderOnTrainRiver;
    const setChecked = isAttacker ? setAttackerOnTrainRiver : setDefenderOnTrainRiver;
    const total = isAttacker ? attackerTotal : defenderTotal;
    const id = `${which}-raw`;

    return (
      <div className="ui-box">
        <div className="ui-eyebrow mb-1">{isAttacker ? 'Attacker' : 'Defender'}</div>
        <label className="ui-label" htmlFor={id}>Casualties as counted</label>
        <input
          id={id}
          type="number"
          min="0"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="ui-field tabular"
        />
        <label className="flex items-start gap-1.5 text-[13px] text-ink-2 mt-1.5">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
          <span>On train or river (+{gc.settings.trainRiverCasPct}%)</span>
        </label>
        <div className="text-[13px] tabular mt-1.5 pt-1.5 border-t border-paper-3">
          <span className="text-ink-2">Carried to the roll: </span>
          <span className="font-bold">{total.toLocaleString('en-US')}</span>
        </div>
      </div>
    );
  };

  const outcomes = [
    { key: attacker.id, value: attacker.side, token: attacker, note: 'attacker carries the field' },
    { key: defender.id, value: defender.side, token: defender, note: 'defender holds the ground' },
  ];

  return (
    <Modal
      title="Resolve the engagement"
      subtitle={battle.mapName}
      width="max-w-lg"
      onClose={onCancel}
      dismissible={false}
      footer={
        <>
          <button onClick={onCancel} className="ui-btn flex-1">Cancel</button>
          <button
            onClick={commit}
            disabled={!canResolve}
            className="ui-btn ui-btn-primary flex-1"
          >
            Enter the returns
          </button>
        </>
      }
    >
      {tokenRow(attacker, 'Attacker')}
      {attackerSupport && tokenRow(attackerSupport, 'In support')}
      {tokenRow(defender, 'Defender')}
      {defenderSupport && tokenRow(defenderSupport, 'In support')}
      {winter && (
        <p className="text-[13px] mt-1.5">
          <Tag tone="mark">Winter</Tag>{' '}
          <span className="text-ink-2">
            Attacker's casualties are raised {gc.settings.winterAttackerCasPct}%.
          </span>
        </p>
      )}

      {/* Conquest indicator — so players remember whether the sides were
          swapped on the WoR board. */}
      {battle.isConquest && (
        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">Conquest map</div>
          <p className="text-[13px] text-ink-2">
            {battle.sidesSwapped
              ? 'Tails — the sides were swapped, so the Union played as the Confederacy and the other way about.'
              : 'Heads — both teams played their own colours.'}
            {' '}A draw is allowed here: it splits the payout evenly and sends both
            engaged formations back two march-MP.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {returns('attacker')}
        {returns('defender')}
      </div>

      <p className="ui-hint mt-2">
        Fatigue is added on its own — {attacker.fatigue * gc.settings.fatigueCasPct}% to the
        attacker and {defender.fatigue * gc.settings.fatigueCasPct}% to the defender.
        A supporting formation absorbs 40% of its side's total.
      </p>

      {/* Winner — labelled by the engaged token's name + campaign side.
          The underlying value we send to resolveGCBattle is still the
          side string, derived from the clicked token's side. */}
      <div className="mt-4">
        <div className="ui-eyebrow mb-1">The field</div>
        <div className={`grid gap-2 ${battle.isConquest ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {outcomes.map(({ key, value, token, note }) => (
            <button
              key={key}
              onClick={() => setWinner(value)}
              aria-pressed={winner === value}
              className={`ui-box text-left transition ${winner === value ? 'bg-paper-2' : ''} hover:bg-paper-2`}
            >
              <div className={`font-bold ${SIDE_TEXT[value]}`}>{token.name}</div>
              {winner === value
                ? <Tag tone={value}>Carried the field</Tag>
                : <div className="ui-hint">{note}</div>}
            </button>
          ))}
          {battle.isConquest && (
            <button
              onClick={() => setWinner('DRAW')}
              aria-pressed={winner === 'DRAW'}
              className={`ui-box text-left transition ${winner === 'DRAW' ? 'bg-paper-2' : ''} hover:bg-paper-2`}
            >
              <div className="font-bold">Drawn</div>
              {winner === 'DRAW'
                ? <Tag>Drawn field</Tag>
                : <div className="ui-hint">split payout, both fall back</div>}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default GrandBattleResolveModal;
