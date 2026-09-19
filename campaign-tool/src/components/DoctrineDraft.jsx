import { useState } from 'react';
import { DOCTRINES, getDoctrine } from '../data/doctrines';
import { getUsesRemaining, isDrafted } from '../utils/doctrines';
import { Section, SectionHead, SectionBody, Tag, SIDE_TEXT } from './ui/Primitives';

/**
 * Season doctrine draft.
 *
 * Both sides pick one Offensive and one Defensive doctrine before turn 1.
 * Picks are made blind - each side's card is covered until both are complete -
 * then revealed together and locked for the season.
 *
 * The blind phase is a UI nicety for drafting round a single screen or over a
 * call; nothing is hidden in the saved campaign, so an admin can always reveal
 * early or re-open the draft.
 *
 * Set as two boards of standing orders, one to a side, ruled off from the
 * page and covered until the reveal.
 */

const SIDE_NAME = { USA: 'United States', CSA: 'Confederate' };

const SLOT_META = {
  offense: { label: 'Offence', note: 'declared · two uses a season' },
  defense: { label: 'Defence', note: 'standing · always in force' },
};

/** One doctrine on the picker: a ruled line that takes the slot when clicked. */
const DoctrineLine = ({ doctrine, selected, onSelect, disabled, side }) => (
  <div className="ui-line" data-open={selected}>
    <button
      type="button"
      onClick={() => !disabled && onSelect(doctrine.id)}
      disabled={disabled}
      className="ui-line-head items-start"
    >
      <span className="min-w-0">
        <span className={selected ? `font-bold ${SIDE_TEXT[side]}` : ''}>{doctrine.name}</span>
        <span className="block ui-hint">{doctrine.rules}</span>
        {doctrine.blurb && <span className="block ui-hint italic">{doctrine.blurb}</span>}
      </span>
      {selected && <Tag tone={side}>taken</Tag>}
    </button>
  </div>
);

const DoctrineDraft = ({ campaign, onCommit, onReopen }) => {
  const drafted = isDrafted(campaign);
  const picks = campaign?.doctrines || {};

  // Local, in-progress picks during the draft.
  const [draft, setDraft] = useState(() => ({
    USA: { offense: picks.USA?.offense || null, defense: picks.USA?.defense || null },
    CSA: { offense: picks.CSA?.offense || null, defense: picks.CSA?.defense || null },
  }));
  // Which side's board is face-up while drafting. Null = both covered.
  const [openSide, setOpenSide] = useState(null);

  const sideReady = (side) => !!(draft[side].offense && draft[side].defense);
  const bothReady = sideReady('USA') && sideReady('CSA');

  const pick = (side, slot, id) =>
    setDraft(d => ({ ...d, [side]: { ...d[side], [slot]: id } }));

  // ---------- Locked view: the season is drafted ----------
  if (drafted) {
    return (
      <Section>
        <SectionHead
          title="Season Doctrines"
          meta="locked for the season"
          actions={
            <button
              onClick={onReopen}
              className="ui-btn ui-btn-sm"
              title="Re-open the draft. Doctrines are meant to be locked for the season."
            >
              Re-draft
            </button>
          }
        />
        <SectionBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['USA', 'CSA'].map(side => {
              const uses = getUsesRemaining(campaign, side);
              const off = getDoctrine(picks[side]?.offense);
              const def = getDoctrine(picks[side]?.defense);
              return (
                <div key={side} className="ui-box">
                  <div className="mb-1"><Tag tone={side}>{SIDE_NAME[side]}</Tag></div>
                  {[['offense', off], ['defense', def]].map(([slot, d]) => (
                    <div key={slot} className="mt-1.5 first:mt-0 text-[13.5px]">
                      <span className="text-ink-2">{SLOT_META[slot].label} · </span>
                      <b>{d?.name || '—'}</b>
                      {slot === 'offense' && (
                        <span className={uses > 0 ? 'text-ink-2' : 'text-ink-3 italic'}>
                          {' '}({uses} use{uses === 1 ? '' : 's'} left)
                        </span>
                      )}
                      {d?.rules && <span className="block ui-hint">{d.rules}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </SectionBody>
      </Section>
    );
  }

  // ---------- Draft view ----------
  return (
    <Section>
      <SectionHead
        title="Season Doctrines"
        meta="pick blind, reveal together"
        actions={
          <button
            onClick={() => onCommit(draft)}
            disabled={!bothReady}
            className="ui-btn ui-btn-primary ui-btn-sm"
            title={bothReady
              ? 'Reveal both boards and lock them for the season'
              : 'Both sides must take an offence and a defence first'}
          >
            Reveal &amp; lock
          </button>
        }
      />
      <SectionBody>
        <p className="ui-hint mb-2.5">
          Each side takes one offensive and one defensive doctrine, locked for the season.
          Pick blind — keep the other side&apos;s board covered — then reveal together.
        </p>

        <div className={openSide ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
          {['USA', 'CSA'].map(side => {
            const open = openSide === side;
            const ready = sideReady(side);
            return (
              <div key={side} className="ui-box">
                <button
                  type="button"
                  onClick={() => setOpenSide(open ? null : side)}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-2 text-left"
                >
                  <Tag tone={side}>{SIDE_NAME[side]}</Tag>
                  <span className="ui-hint shrink-0">
                    {open ? 'cover' : ready ? 'picked' : 'not picked'}
                  </span>
                </button>

                {open ? (
                  <div className="mt-2">
                    {['offense', 'defense'].map(slot => (
                      <div key={slot} className="mt-3 first:mt-0">
                        <div className="ui-eyebrow">
                          {SLOT_META[slot].label}
                          <span className="italic normal-case tracking-normal">
                            {' · '}{SLOT_META[slot].note}
                          </span>
                        </div>
                        {DOCTRINES[side][slot].map(d => (
                          <DoctrineLine
                            key={d.id}
                            doctrine={d}
                            side={side}
                            selected={draft[side][slot] === d.id}
                            onSelect={(id) => pick(side, slot, id)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ui-hint mt-1">
                    Board is covered. Click to pick for the {side}.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </SectionBody>
    </Section>
  );
};

export default DoctrineDraft;
