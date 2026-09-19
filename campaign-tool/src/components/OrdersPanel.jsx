import { useState } from 'react';
import {
  ORDER_ACTIONS,
  getOrders,
  isOrderLocked,
  hasLandingRights,
} from '../utils/orders';
import { getSideDoctrines, getUsesRemaining } from '../utils/doctrines';
import { Section, SectionHead, SectionBody, Tag, Row, SIDE_TEXT } from './ui/Primitives';

/**
 * Orders of the Day.
 *
 * A side says what it intends before it picks the ground: the action, and
 * whether it spends its drafted offensive doctrine and its standing order on
 * it. Declaring first is what lets the plate dim the ground that is out of
 * reach before anyone commits to a battle.
 *
 * This panel renders and calls; every rule question - who is due, what is
 * locked, who holds landing rights, how many uses are left - is answered by
 * `utils/orders.js` and `utils/doctrines.js`.
 *
 * Set as the day's orders would be: the side picked off a rule of small caps,
 * the action the same, then the two things that may be spent on it as ruled
 * lines, and the orders once given printed back as a short register.
 */

const SIDE_NAME = { USA: 'Union', CSA: 'Confederate' };
const SIDES = ['USA', 'CSA'];

/** What each action is called on the picker, and how it reads once given. */
const ACTION_LABEL = { attack: 'Attack', defend: 'Defend', landing: 'Declare a landing' };
const ACTION_GIVEN = { attack: 'attack', defend: 'defend', landing: 'declared a landing' };

const OrdersPanel = ({ campaign, viewSide, onViewSide, onDeclare, onWithdraw }) => {
  // One draft per side per turn, so switching sides - or advancing the turn -
  // never hands a side the orders someone else was in the middle of writing.
  const [drafts, setDrafts] = useState({});

  if (!campaign) return null;

  const turn = campaign.currentTurn;
  const orders = getOrders(campaign);
  const side = SIDES.includes(viewSide) ? viewSide : 'USA';

  const key = `${side}:${turn}`;
  const draft = drafts[key] || { action: 'attack', doctrine: false, standingOrder: false };
  const setDraft = (patch) =>
    setDrafts(d => ({ ...d, [key]: { ...draft, ...patch } }));

  const given = orders[side];
  const locked = isOrderLocked(campaign, side);
  const landingRights = hasLandingRights(campaign, side);

  // A side already holding landing rights has transports at sea; there is
  // nothing to declare, so the option goes and an attack becomes a landing.
  const actions = landingRights ? ORDER_ACTIONS.filter(a => a !== 'landing') : ORDER_ACTIONS;
  const actionLabel = (a) =>
    a === 'attack' && landingRights ? 'Land' : ACTION_LABEL[a];

  // A defence makes no attack, so it spends nothing.
  const spends = draft.action !== 'defend';

  const offense = getSideDoctrines(campaign, side).offense;
  const usesLeft = getUsesRemaining(campaign, side);
  const ability = campaign.abilities?.[side] || null;
  const abilityResting = (ability?.cooldown || 0) > 0;

  const doctrineOff = !spends || usesLeft <= 0;
  const abilityOff = !spends || abilityResting;

  const give = () =>
    onDeclare?.(side, {
      action: draft.action,
      doctrine: spends && draft.doctrine && usesLeft > 0,
      standingOrder: spends && draft.standingOrder && !abilityResting,
    });

  /** One thing that may be spent on the order: what it is, and the toggle. */
  const spendLine = ({ eyebrow, name, note, tag, on, disabled, onToggle }) => (
    <div className="ui-row items-start">
      <span className="min-w-0">
        <span className="ui-eyebrow block">{eyebrow}</span>
        <span className={`font-bold ${disabled ? 'text-ink-3' : ''}`}>{name}</span>
        {note && <span className="ui-hint block">{note}</span>}
      </span>
      <span className="shrink-0 text-right">
        {tag && <span className="block mb-1">{tag}</span>}
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={`ui-btn ui-btn-sm ${on && !disabled ? 'ui-btn-primary' : ''}`}
        >
          {on && !disabled ? 'Spending a use' : 'Spend a use'}
        </button>
      </span>
    </div>
  );

  /** A side's orders once given, printed back as a line of the register. */
  const givenLine = (s) => {
    const order = orders[s];
    if (!order) return null;

    const doctrine = order.doctrine ? getSideDoctrines(campaign, s).offense : null;
    const parts = [ACTION_GIVEN[order.action] || order.action];
    if (doctrine?.name) parts.push(doctrine.name);
    if (order.standingOrder) parts.push(campaign.abilities?.[s]?.name || 'standing order');

    const sideLocked = isOrderLocked(campaign, s);

    return (
      <Row
        key={s}
        label={
          <>
            <span className={`font-bold ${SIDE_TEXT[s]}`}>{SIDE_NAME[s]}</span>
            <span className="text-ink-3"> · </span>
            <span className="text-ink-2">{parts.join(' · ')}</span>
          </>
        }
        value={
          sideLocked ? (
            <span className="ui-hint">on the board</span>
          ) : (
            <button
              type="button"
              onClick={() => onWithdraw?.(s)}
              className="ui-btn ui-btn-quiet ui-btn-sm"
              title={`Take the ${SIDE_NAME[s]} orders back off the table`}
            >
              Withdraw
            </button>
          )
        }
      />
    );
  };

  const anyGiven = SIDES.some(s => orders[s]);

  return (
    <Section>
      <SectionHead title="Orders of the Day" meta={`Turn ${turn}`} />
      <SectionBody>
        <div className="ui-segment mb-2">
          {SIDES.map(s => (
            <button
              key={s}
              onClick={() => onViewSide?.(s)}
              data-active={side === s}
              data-side={s}
            >
              {SIDE_NAME[s]}
            </button>
          ))}
        </div>

        {landingRights && (
          <p className="ui-hint mb-2">
            <Tag tone="mark">Landing rights this turn</Tag>
            <span className="not-italic text-ink-3"> — </span>
            any water region is in reach.
          </p>
        )}

        {given ? (
          <p className="ui-hint mb-2">
            {locked
              ? 'Orders given, and an engagement is already on the board.'
              : 'Orders given. Withdraw them below to write fresh ones.'}
          </p>
        ) : (
          <>
            <div className="ui-eyebrow mb-1">The action</div>
            <div className="ui-segment mb-2">
              {actions.map(a => (
                <button
                  key={a}
                  onClick={() => setDraft({ action: a })}
                  data-active={draft.action === a}
                >
                  {actionLabel(a)}
                </button>
              ))}
            </div>

            {offense && spendLine({
              eyebrow: 'Offensive doctrine',
              name: offense.name,
              note: offense.rules,
              tag: (
                <Tag tone={usesLeft > 0 ? 'neutral' : 'mark'}>
                  {usesLeft} use{usesLeft === 1 ? '' : 's'} left
                </Tag>
              ),
              on: draft.doctrine,
              disabled: doctrineOff,
              onToggle: () => setDraft({ doctrine: !draft.doctrine }),
            })}

            {ability && spendLine({
              eyebrow: 'Standing order',
              name: ability.name,
              note: abilityResting
                ? `Resting — ${ability.cooldown} turn${ability.cooldown === 1 ? '' : 's'} to recover.`
                : null,
              tag: abilityResting ? <Tag tone="mark">resting</Tag> : null,
              on: draft.standingOrder,
              disabled: abilityOff,
              onToggle: () => setDraft({ standingOrder: !draft.standingOrder }),
            })}

            {!spends && (
              <p className="ui-hint mt-1.5">
                A side that elects to defend makes no attack, and so spends nothing.
              </p>
            )}

            <button
              onClick={give}
              className="ui-btn ui-btn-primary ui-btn-block mt-3"
            >
              Give the orders
            </button>
          </>
        )}

        {anyGiven && (
          <div className="mt-3">
            <div className="ui-eyebrow mb-1">Given this turn</div>
            {SIDES.map(givenLine)}
          </div>
        )}
      </SectionBody>
    </Section>
  );
};

export default OrdersPanel;
