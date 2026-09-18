import { useState } from 'react';
import { ScrollText, Check, Eye, EyeOff, Lock, RotateCcw, Swords, Shield } from 'lucide-react';
import { DOCTRINES, getDoctrine } from '../data/doctrines';
import { getUsesRemaining, isDrafted } from '../utils/doctrines';

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
 */

const SIDE_STYLE = {
  USA: { text: 'text-union-400', border: 'border-union-500/50', bg: 'bg-union-900/20' },
  CSA: { text: 'text-rebel-400', border: 'border-rebel-500/50', bg: 'bg-rebel-900/20' },
};

const SLOT_META = {
  offense: { label: 'Offensive', icon: Swords, note: 'active · 2 uses per season' },
  defense: { label: 'Defensive', icon: Shield, note: 'passive · always on' },
};

const DoctrineCard = ({ doctrine, selected, onSelect, disabled, side }) => {
  const style = SIDE_STYLE[side];
  return (
    <button
      onClick={() => !disabled && onSelect(doctrine.id)}
      disabled={disabled}
      className={`w-full text-left p-3 rounded border transition-colors ${
        selected
          ? `${style.bg} ${style.border}`
          : disabled
            ? 'border-ink-800 opacity-50 cursor-not-allowed'
            : 'border-ink-700 hover:border-ink-500'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`font-semibold text-sm ${selected ? style.text : 'text-mist-200'}`}>
          {doctrine.name}
        </span>
        {selected && <Check className={`w-4 h-4 flex-shrink-0 ${style.text}`} />}
      </div>
      <div className="text-xs text-mist-400 mt-1">{doctrine.rules}</div>
      <div className="text-[11px] text-mist-600 italic mt-1">{doctrine.blurb}</div>
    </button>
  );
};

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
      <div className="ui-inset p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-brass-400" />
            <span className="text-sm font-semibold text-mist-200">Season Doctrines</span>
            <Lock className="w-3 h-3 text-mist-600" />
          </div>
          <button
            onClick={onReopen}
            className="ui-btn ui-btn-sm text-mist-400 hover:text-mist-200"
            title="Re-open the draft. Doctrines are meant to be locked for the season."
          >
            <RotateCcw className="w-3 h-3" />
            Re-draft
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {['USA', 'CSA'].map(side => {
            const style = SIDE_STYLE[side];
            const uses = getUsesRemaining(campaign, side);
            const off = getDoctrine(picks[side]?.offense);
            const def = getDoctrine(picks[side]?.defense);
            return (
              <div key={side} className={`rounded border p-3 ${style.border} ${style.bg}`}>
                <div className={`font-bold text-sm mb-2 ${style.text}`}>{side}</div>
                {[['offense', off], ['defense', def]].map(([slot, d]) => {
                  const Icon = SLOT_META[slot].icon;
                  return (
                    <div key={slot} className="mb-2 last:mb-0">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-mist-500">
                        <Icon className="w-3 h-3" />
                        {SLOT_META[slot].label}
                        {slot === 'offense' && (
                          <span className={uses > 0 ? 'text-brass-400' : 'text-mist-600'}>
                            · {uses} use{uses === 1 ? '' : 's'} left
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-mist-200 font-semibold">{d?.name || '—'}</div>
                      <div className="text-xs text-mist-400">{d?.rules}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- Draft view ----------
  return (
    <div className="ui-inset p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-brass-400" />
          <span className="text-sm font-semibold text-mist-200">Draft Season Doctrines</span>
        </div>
        <button
          onClick={() => onCommit(draft)}
          disabled={!bothReady}
          className={`ui-btn ui-btn-sm ${bothReady ? 'ui-btn-primary' : 'opacity-50 cursor-not-allowed'}`}
        >
          <Check className="w-3 h-3" />
          Reveal &amp; Lock
        </button>
      </div>
      <p className="text-xs text-mist-500 mb-3">
        Each side takes one Offensive and one Defensive doctrine, locked for the season.
        Pick blind — keep the other side&apos;s board covered — then reveal together.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {['USA', 'CSA'].map(side => {
          const style = SIDE_STYLE[side];
          const open = openSide === side;
          const ready = sideReady(side);
          return (
            <div key={side} className={`rounded border ${style.border} overflow-hidden`}>
              <button
                onClick={() => setOpenSide(open ? null : side)}
                className={`w-full flex items-center justify-between px-3 py-2 ${style.bg}`}
              >
                <span className={`font-bold text-sm ${style.text}`}>{side}</span>
                <span className="flex items-center gap-2 text-xs text-mist-400">
                  {ready ? 'ready' : 'not picked'}
                  {open ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </span>
              </button>

              {open ? (
                <div className="p-2 space-y-3">
                  {['offense', 'defense'].map(slot => {
                    const Icon = SLOT_META[slot].icon;
                    return (
                      <div key={slot}>
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-mist-500 mb-1.5">
                          <Icon className="w-3 h-3" />
                          {SLOT_META[slot].label}
                          <span className="text-mist-600 normal-case">· {SLOT_META[slot].note}</span>
                        </div>
                        <div className="space-y-1.5">
                          {DOCTRINES[side][slot].map(d => (
                            <DoctrineCard
                              key={d.id}
                              doctrine={d}
                              side={side}
                              selected={draft[side][slot] === d.id}
                              onSelect={(id) => pick(side, slot, id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-mist-600">
                  <EyeOff className="w-5 h-5 mx-auto mb-1.5 opacity-50" />
                  Covered — click to pick for {side}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DoctrineDraft;
