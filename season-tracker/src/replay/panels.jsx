// The replay viewer's foldable panels: one header style, and which ones are open
// remembered per browser. A panel nobody has set starts open on a wide screen and
// folded on a narrow one, so a phone opens on the map rather than on controls.
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const PANELS_KEY = 'woraat-panels';
const isNarrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;

function loadOpen() {
  try { return JSON.parse(localStorage.getItem(PANELS_KEY) || '{}') || {}; } catch { return {}; /* private mode */ }
}

/** `{ isOpen(id, wideDefault), toggle(id, wideDefault) }` over every panel in the viewer. */
export function usePanels() {
  const [open, setOpen] = useState(loadOpen);
  const isOpen = (id, wideDefault = true) => open[id] ?? (isNarrow() ? false : wideDefault);
  const toggle = (id, wideDefault = true) => setOpen((o) => {
    const next = { ...o, [id]: !(o[id] ?? (isNarrow() ? false : wideDefault)) };
    try { localStorage.setItem(PANELS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  return { isOpen, toggle };
}

/** A titled panel that folds to its header. */
export function Panel({ panels, id, title, icon: Icon, wideDefault = true, className = '', children }) {
  const open = panels.isOpen(id, wideDefault);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => panels.toggle(id, wideDefault)}
        aria-expanded={open}
        className="w-full px-2 py-1 flex items-center gap-1.5 hover:bg-bg-2 transition"
        title={open ? 'Minimize' : 'Expand'}
      >
        {Icon && <Icon className="w-3.5 h-3.5 text-accent shrink-0" />}
        <span className="font-semibold flex-1 text-left truncate">{title}</span>
        <Chevron className="w-3 h-3 shrink-0" />
      </button>
      {open && children}
    </div>
  );
}
