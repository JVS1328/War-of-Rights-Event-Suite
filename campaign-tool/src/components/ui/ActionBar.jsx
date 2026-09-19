import { useEffect, useRef, useState } from 'react';

const VARIANT_CLASS = {
  primary: 'ui-btn ui-btn-primary',
  ghost: 'ui-btn',
  quiet: 'ui-btn',
};

/**
 * Dateline actions declared once and rendered twice: the full row on a wide
 * screen, and — below the `lg` breakpoint, where ten buttons overflow the
 * masthead — the pinned actions plus an overflow menu.
 *
 * Each action is `{ key, label, icon, onClick, variant?, pinned?, title?,
 * divider? }`; `pinned` keeps an action out of the menu at every width.
 * Icons are accepted and ignored: the broadsheet sets its controls in small
 * caps and leaves the glyphs out.
 */
export const ActionBar = ({ actions }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKeyDown = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const items = actions.filter(Boolean);
  const pinned = items.filter(a => a.pinned);
  const overflow = items.filter(a => !a.pinned);

  const button = (action) => {
    const { key, label, onClick, variant = 'ghost', title } = action;
    return (
      <button
        key={key}
        onClick={onClick}
        title={title || label}
        aria-label={label}
        className={`ui-btn-sm ${VARIANT_CLASS[variant] || VARIANT_CLASS.ghost}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 md:justify-end">
      {pinned.map(button)}

      {/* Wide: every action on show. Ten controls in small caps measure
          ~850px, so the whole row only fits beside the dateline at `2xl`. */}
      <div className="hidden 2xl:contents">
        {overflow.map(action =>
          action.divider
            ? [<span key={`${action.key}-div`} className="text-ink-3 px-0.5">·</span>, button(action)]
            : button(action)
        )}
      </div>

      {/* Narrow: one button, everything behind it. */}
      <div className="relative 2xl:hidden" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(open => !open)}
          className="ui-btn ui-btn-sm"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          More ⌄
        </button>

        {menuOpen && (
          <div className="ui-box absolute right-0 top-full mt-1 w-56 z-40 bg-paper !p-1 text-left">
            {overflow.map(({ key, label, onClick }) => (
              <button
                key={key}
                onClick={() => { setMenuOpen(false); onClick(); }}
                className="ui-btn ui-btn-quiet ui-btn-sm ui-btn-block !justify-start"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
