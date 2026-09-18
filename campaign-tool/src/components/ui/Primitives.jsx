import { buildStandfirst } from '../../utils/standfirst';

/**
 * Shared presentational primitives for the campaign tracker.
 *
 * These wrap the broadsheet classes defined in index.css so a panel reads the
 * same in the tracker and in the read-only share view. The rules of the
 * design are documented at the top of index.css — paper and ink, hierarchy by
 * type and rules, colour only for meaning, no boxes / shadows / radius, and
 * no icons in headings.
 */

/* ---------- Sections ------------------------------------------------------ */

export const Section = ({ className = '', children, ...rest }) => (
  <section className={`ui-section ${className}`} {...rest}>
    {children}
  </section>
);

/**
 * A heading: tracked caps centred between two hairline rules, with an
 * optional italic meta note. Actions sit on their own right-aligned row
 * underneath rather than breaking the rule.
 */
export const SectionHead = ({ title, meta, actions, className = '' }) => (
  <>
    <h3 className={`ui-section-head ${className}`}>
      {title}
      {meta != null && meta !== '' && <small>{meta}</small>}
    </h3>
    {actions && <div className="ui-toolbar">{actions}</div>}
  </>
);

export const SectionBody = ({ className = '', children }) => (
  <div className={`ui-section-body ${className}`}>{children}</div>
);

/* ---------- Tags ---------------------------------------------------------- */

/**
 * A word, not a chip: bold small uppercase in the colour that carries the
 * meaning. `warn` is kept as an alias of `mark` so older call sites read
 * correctly until they are restyled.
 */
export const Tag = ({ tone = 'neutral', className = '', children }) => {
  const map = {
    USA: 'ui-tag-usa',
    CSA: 'ui-tag-csa',
    NEUTRAL: 'ui-tag-neutral',
    good: 'ui-tag-good',
    mark: 'ui-tag-mark',
    warn: 'ui-tag-mark',
    neutral: '',
  };
  return <span className={`ui-tag ${map[tone] ?? ''} ${className}`}>{children}</span>;
};

/* ---------- Rows ---------------------------------------------------------- */

/** Label / value line, ruled underneath. Used throughout the stat panels. */
export const Row = ({ label, value, className = '' }) => (
  <div className={`ui-row ${className}`}>
    <span className="ui-row-label">{label}</span>
    <span className="ui-row-value">{value}</span>
  </div>
);

export const EmptyState = ({ title, hint }) => (
  <div className="ui-empty">
    <div>{title}</div>
    {hint && <div className="mt-1">{hint}</div>}
  </div>
);

/* ---------- Side colours -------------------------------------------------- */

export const SIDE_TEXT = { USA: 'text-union', CSA: 'text-rebel', NEUTRAL: 'text-neutral' };
export const SIDE_BG = { USA: 'bg-union', CSA: 'bg-rebel', NEUTRAL: 'bg-neutral-wash' };

const SIDE_FULL = { USA: 'United States', CSA: 'Confederate States' };

/* ---------- Score strip --------------------------------------------------- */

/**
 * The state of the war, across the width of the page: each side's victory
 * points set large, its supply and territory count on the sub-lines, and the
 * margin between them in the middle. Shared by the tracker and the share view
 * so a campaign reads the same either side of a share link.
 */
export const ScoreStrip = ({
  usaVP,
  csaVP,
  usaSP = null,
  csaSP = null,
  usaNote = null,
  csaNote = null,
  vpLabel = 'VP',
  usaTerritories = null,
  csaTerritories = null,
  neutralTerritories = null,
}) => {
  const usa = usaVP || 0;
  const csa = csaVP || 0;
  const leader = usa === csa ? null : usa > csa ? 'USA' : 'CSA';
  const margin = Math.abs(usa - csa);
  const label = vpLabel === 'VP' ? 'Victory Points' : vpLabel;

  // The bar divides by ground held when we know it, and by points when we
  // don't — either way it is the same question the strip is answering.
  const haveTerritories = usaTerritories != null && csaTerritories != null;
  const territoryTotal = haveTerritories
    ? usaTerritories + csaTerritories + (neutralTerritories || 0)
    : 0;
  const pointTotal = usa + csa;
  const share = (n, total) => (total > 0 ? (n / total) * 100 : 50);
  const usaShare = haveTerritories
    ? share(usaTerritories, territoryTotal)
    : share(usa, pointTotal);
  const csaShare = haveTerritories
    ? share(csaTerritories, territoryTotal)
    : share(csa, pointTotal);

  const sub = (sp, note, territories) => {
    const tail = [note, territories != null ? `${territories} territories` : null]
      .filter(Boolean)
      .join(' · ');
    if (sp == null && !tail) return null;
    return (
      <div className="sub">
        {sp != null && (
          <>
            {sp.toLocaleString()} supply points
            {tail && <br />}
          </>
        )}
        {tail}
      </div>
    );
  };

  const points = (vp) => (
    <div className="vp">
      {vp}
      <small>{label}</small>
    </div>
  );

  return (
    // A container, so the strip reflows when it is narrow — in a modal, say —
    // and not only when the window is.
    <div className="score-block">
      <div className="score-strip">
        <div className="side">
          <div className={`who ${SIDE_TEXT.USA}`}>{SIDE_FULL.USA}</div>
          {points(usa)}
          {sub(usaSP, usaNote, usaTerritories)}
        </div>

        <div className="mid">
          <b>
            {leader ? `${leader} leads by ${margin}` : `Dead even at ${usa}`}
          </b>
          {haveTerritories && (
            <>
              {territoryTotal} territories in play
              {neutralTerritories ? (
                <>
                  <br />
                  {neutralTerritories} remain neutral
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="side r">
          <div className={`who ${SIDE_TEXT.CSA}`}>{SIDE_FULL.CSA}</div>
          {sub(csaSP, csaNote, csaTerritories)}
          {points(csa)}
        </div>
      </div>

      <div className="ui-bar" title={`USA ${usa} — CSA ${csa}`}>
        <i className="bg-union-wash" style={{ width: `${usaShare}%` }} />
        <i className="bg-rebel-wash" style={{ width: `${csaShare}%` }} />
        <i className="bg-neutral-wash flex-1" />
      </div>
    </div>
  );
};

/* ---------- Masthead ------------------------------------------------------ */

/**
 * The top of the sheet, shared by the tracker and the share view: overline,
 * nameplate, dateline, headline and standfirst. Anything passed as children
 * (in practice the ScoreStrip) prints under the standfirst.
 *
 * Every figure comes off the campaign record — there are no invented volume
 * numbers or dates.
 */
export const Masthead = ({
  campaignName,
  turn,
  date = null,
  movesFirst = null,
  battlesFought = 0,
  pendingCount = 0,
  pendingPlace = null,
  note = null,
  actions = null,
  usaVP = 0,
  csaVP = 0,
  vpLabel = 'VP',
  children,
}) => {
  const standfirst = buildStandfirst({
    usaVP,
    csaVP,
    vpLabel,
    movesFirst,
    pendingCount,
    pendingPlace,
  });

  return (
    <header>
      <div className="overline">War of Rights · Campaign Tracker</div>
      <h1 className="nameplate">The Campaign Dispatch</h1>

      <div className="dateline">
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 md:justify-start">
          <span>Turn {turn}</span>
          {movesFirst && (
            <>
              <span className="text-ink-3">·</span>
              <span className={SIDE_TEXT[movesFirst]}>{movesFirst} moves first</span>
            </>
          )}
          <span className="text-ink-3">·</span>
          <span>{battlesFought} {battlesFought === 1 ? 'battle' : 'battles'}</span>
          {pendingCount > 0 && (
            <>
              <span className="text-ink-3">·</span>
              <Tag tone="mark">{pendingCount} pending</Tag>
            </>
          )}
          {note && (
            <>
              <span className="text-ink-3">·</span>
              <span className="ui-eyebrow">{note}</span>
            </>
          )}
        </div>

        <div className="dateline-mid">{date || `Turn ${turn}`}</div>

        <div className="dateline-end">{actions}</div>
      </div>

      <h2 className="headline">{campaignName}</h2>
      {standfirst && <p className="deck">{standfirst}</p>}

      {children}
    </header>
  );
};

/* ---------- Modal --------------------------------------------------------- */

/** Modal shell: backdrop, double-ruled sheet, header with close control. */
export const Modal = ({ title, subtitle, onClose, width = 'max-w-2xl', children, footer }) => (
  <div className="ui-modal-backdrop" onClick={onClose}>
    <div className={`ui-modal ${width}`} onClick={(e) => e.stopPropagation()}>
      <div className="ui-modal-head">
        <div className="min-w-0">
          <div className="ui-modal-title">{title}</div>
          {subtitle && <div className="ui-hint mt-0.5">{subtitle}</div>}
        </div>
        {onClose && (
          <button onClick={onClose} className="ui-btn ui-btn-quiet ui-btn-sm" aria-label="Close">
            ✕
          </button>
        )}
      </div>
      <div className="ui-modal-body ui-scroll">{children}</div>
      {footer && <div className="ui-modal-foot">{footer}</div>}
    </div>
  </div>
);
