import { useState } from 'react';
import {
  ORDER_ACTIONS,
  getOrders,
  isOrderLocked,
  hasLandingRights,
} from '../utils/orders';
import { getSideDoctrines, getCooldown, cooldownLabel } from '../utils/doctrines';
import { Section, SectionHead, SectionBody, Tag, Row, SIDE_TEXT } from './ui/Primitives';

/**
 * Orders of the Day.
 *
 * A side says what it intends before it picks the ground: the action, and
 * whether it declares its drafted offensive doctrine on it. Declaring first is what lets the plate dim the ground that is out of
 * reach before anyone commits to a battle.
 *
 * This panel renders and calls; every rule question - who is due, what is
 * locked, who holds landing rights, whether the doctrine is resting - is answered by
 * `utils/orders.js` and `utils/doctrines.js`.
 *
 * Set as the day's orders would be: the side picked off a rule of small caps,
 * the action the same, then the doctrine that may be declared on it as a ruled
 * line, and the orders once given printed back as a short register.
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
  const draft = drafts[key] || { action: 'attack', doctrine: false };
  const setDraft = (patch) =>
    setDrafts(d => ({ ...d, [key]: { ...draft, ...patch } }));

  const given = orders[side];
  const locked = isOrderLocked(campaign, side);
  const landingRights = hasLandingRights(campaign, side);

  // A side already holding landing rights has transports at sea; there is
  // nothing to declare, so the option goes and an attack becomes a landing.
  // A side already on the board has attacked, so attack is all it can order.
  const actions = ORDER_ACTIONS.filter(a =>
    !(a === 'landing' && landingRights) && !(locked && a !== 'attack'));
  const action = actions.includes(draft.action) ? draft.action : 'attack';
  const actionLabel = (a) =>
    a === 'attack' && landingRights ? 'Land' : ACTION_LABEL[a];

  // A defence makes no attack, so it declares nothing.
  const spends = action !== 'defend';

  const offense = getSideDoctrines(campaign, side).offense;
  const resting = getCooldown(campaign, side, 'offense');
  const doctrineOff = !spends || resting > 0;
  const declaring = draft.doctrine && !doctrineOff;

  const give = () =>
    onDeclare?.(side, { action, doctrine: declaring });

  /** A side's orders once given, printed back as a line of the register. */
  const givenLine = (s) => {
    const order = orders[s];
    if (!order) return null;

    const doctrine = order.doctrine ? getSideDoctrines(campaign, s).offense : null;
    const parts = [ACTION_GIVEN[order.action] || order.action];
    if (doctrine?.name) parts.push(doctrine.name);

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
                  data-active={action === a}
                >
                  {actionLabel(a)}
                </button>
              ))}
            </div>

            {offense && (
              <div className="ui-row items-start">
                <span className="min-w-0">
                  <span className="ui-eyebrow block">Offensive doctrine</span>
                  <span className={`font-bold ${doctrineOff ? 'text-ink-3' : ''}`}>{offense.name}</span>
                  <span className="ui-hint block">{offense.rules}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block mb-1">
                    <Tag tone={resting > 0 ? 'mark' : 'neutral'}>{cooldownLabel(resting)}</Tag>
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraft({ doctrine: !draft.doctrine })}
                    disabled={doctrineOff}
                    className={`ui-btn ui-btn-sm ${declaring ? 'ui-btn-primary' : ''}`}
                  >
                    {declaring ? 'Declaring' : 'Declare'}
                  </button>
                </span>
              </div>
            )}

            {!spends && (
              <p className="ui-hint mt-1.5">
                A side that elects to defend makes no attack, and so declares nothing.
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
