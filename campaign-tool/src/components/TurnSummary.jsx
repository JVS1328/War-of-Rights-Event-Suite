import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTurnOrder } from '../utils/initiative';
import { Modal, ScoreStrip, Row, Tag, SIDE_TEXT } from './ui/Primitives';
import { useDialog } from './ui/Dialog';
import { buildTurnSummary, formatTurnSummaryText, getSummarisableTurns } from '../utils/turnSummary';
import { num } from '../utils/format';

/**
 * TurnSummary: the end-of-turn dispatch, set as an extra edition.
 *
 * Reads a turn's battles back as a period field report — the weather, who went
 * in, what it cost, and what the map looks like heading into the next month —
 * printed as a headline, a standfirst and a numbered column of engagements.
 * The same text can be copied straight into Discord, optionally with a share
 * link to the live map.
 */

/** Copy button that flips to a tick-free "Copied" for a beat after a write. */
const CopyButton = ({ label, className = '', getText, onError }) => {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const { copyText } = useDialog();

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const text = await getText();
      if (text == null) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard blocked (insecure context, denied permission), so fall
        // back to a sheet the user can copy out of by hand.
        await copyText({ title: 'Copy the dispatch', text, copied: false });
      }
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch (error) {
      if (onError) onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={busy} className={className}>
      {done ? 'Copied' : label}
    </button>
  );
};

/** One engagement: a numbered story with its figures ruled underneath. */
const Engagement = ({ engagement, lead }) => {
  const e = engagement;
  const winnerTone = e.winner === 'DRAW' || e.winner === 'NEUTRAL' ? 'neutral' : e.winner;

  // The marginalia: scale of the fight, doctrine declared, ground taken,
  // formations destroyed. Words only — the colour repeats what they say.
  const marks = [
    e.scale ? <span key="scale">{e.scale}</span> : null,
    e.abilityLabel
      ? <span key="ability" className={SIDE_TEXT[e.abilityUsed]}>{e.abilityLabel}</span>
      : null,
    e.changedHands ? <span key="hands" className="text-mark">ground changed hands</span> : null,
    ...(e.wipes || []).map(w => (
      <span key={`wipe-${w.name}`} className="text-mark">{w.name} destroyed</span>
    )),
  ].filter(Boolean);

  return (
    <article className="mt-5 first:mt-0">
      <div className="flex items-baseline justify-between gap-x-4 gap-y-1 flex-wrap border-b border-rule pb-1">
        <h4 className="font-display font-bold text-[17px] uppercase tracking-wide min-w-0">
          <span className="text-ink-3">{e.ordinal}.</span>{' '}
          {e.title}
          {e.vp ? (
            <span className="ml-2 font-body font-normal text-[13px] text-ink-2 tabular">
              {e.vp} v.p.
            </span>
          ) : null}
        </h4>
        <div className="flex items-baseline gap-3 shrink-0">
          <Tag tone={e.attacker}>{e.attacker} attacking</Tag>
          <Tag tone={winnerTone}>
            {e.winner === 'DRAW' ? 'drawn' : e.winner === 'NEUTRAL' ? 'stays neutral' : `${e.winner} won`}
          </Tag>
        </div>
      </div>

      {e.subtitle && <div className="ui-caption text-left mt-1 mb-0">{e.subtitle}</div>}

      <p className={`mt-2 text-[14.5px] ${lead ? 'dropcap' : 'text-justify'}`}>{e.prose}</p>

      {(e.totalCasualties > 0 || e.attackerSP != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-9 mt-2.5">
          <Row
            label={<span className={SIDE_TEXT[e.attacker]}>{e.attacker} losses</span>}
            value={
              <span className="tabular">
                {num(e.attackerCasualties)}
                {e.attackerSP != null && (
                  <span className="font-normal text-ink-2"> · {num(e.attackerSP)} SP</span>
                )}
              </span>
            }
          />
          <Row
            label={<span className={SIDE_TEXT[e.defender]}>{e.defender} losses</span>}
            value={
              <span className="tabular">
                {num(e.defenderCasualties)}
                {e.defenderSP != null && (
                  <span className="font-normal text-ink-2"> · {num(e.defenderSP)} SP</span>
                )}
              </span>
            }
          />
        </div>
      )}

      {marks.length > 0 && (
        <p className="ui-eyebrow mt-2">
          {marks.map((mark, i) => (
            <span key={i}>
              {i > 0 && <span className="text-ink-3"> · </span>}
              {mark}
            </span>
          ))}
        </p>
      )}

      {e.notes && <p className="ui-hint mt-1.5">{e.notes}</p>}
    </article>
  );
};

const TurnSummary = ({ campaign, initialTurn = null, onClose, onRequestShareLink = null }) => {
  const turns = useMemo(() => getSummarisableTurns(campaign), [campaign]);
  const [turn, setTurn] = useState(() => {
    const wanted = initialTurn ?? campaign?.currentTurn;
    return turns.includes(wanted) ? wanted : (turns[turns.length - 1] ?? 1);
  });

  const summary = useMemo(() => buildTurnSummary(campaign, turn), [campaign, turn]);
  if (!summary) return null;

  const index = turns.indexOf(turn);
  const goPrev = () => setTurn(turns[Math.max(0, index - 1)]);
  const goNext = () => setTurn(turns[Math.min(turns.length - 1, index + 1)]);

  const s = summary.standings;
  const order = getTurnOrder(campaign?.initiative, summary.turn);

  const copyWithLink = async () => {
    if (!onRequestShareLink) return formatTurnSummaryText(summary);
    let shareUrl = null;
    try {
      shareUrl = await onRequestShareLink();
    } catch {
      // A dispatch without a map link still beats no dispatch.
      shareUrl = null;
    }
    return formatTurnSummaryText(summary, { shareUrl });
  };

  return (
    <Modal title="Turn Dispatch"
      width="max-w-3xl"
      onClose={onClose}
      footer={
        <>
          <div className="flex items-center gap-1 mr-auto">
            <button
              onClick={goPrev}
              disabled={index <= 0}
              className="ui-btn ui-btn-quiet ui-btn-icon"
              title="Previous turn"
              aria-label="Previous turn"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="ui-eyebrow tabular px-1 min-w-[4.5rem] text-center">
              Turn {turn}
            </span>
            <button
              onClick={goNext}
              disabled={index >= turns.length - 1}
              className="ui-btn ui-btn-quiet ui-btn-icon"
              title="Next turn"
              aria-label="Next turn"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <CopyButton
            label="Copy for Discord"
            className="ui-btn ui-btn-primary"
            getText={() => formatTurnSummaryText(summary)}
          />
          {onRequestShareLink && (
            <CopyButton
              label="Copy + map link"
              className="ui-btn"
              getText={copyWithLink}
            />
          )}
        </>
      }
    >
      {/* ── The edition's own masthead ───────────────────────────────── */}
      <header>
        <h2 className="headline !mt-0 text-[30px]">{summary.campaignName}</h2>

        <div className="dateline">
          <div className="ui-eyebrow">Turn {summary.turn} · Week {summary.week}</div>
          <div className="dateline-mid">{summary.dateLabel || `Turn ${summary.turn}`}</div>
          <div className="dateline-end ui-eyebrow">
            {order.length > 0 && (
              <span>
                <span className={SIDE_TEXT[order[0]]}>{order[0]}</span> moved first, then{' '}
                <span className={SIDE_TEXT[order[1]]}>{order[1]}</span>
              </span>
            )}
          </div>
        </div>

        {summary.seasonLine && <p className="deck mt-4">{summary.seasonLine}</p>}
        {/* What each side ordered, and any landing that came of it. */}
        {summary.orders && (
          <p className="mt-3 text-[14.5px] text-justify">{summary.orders}</p>
        )}
      </header>

      {/* ── Engagements ──────────────────────────────────────────────── */}
      <section className="mt-5">
        {summary.engagements.length === 0 ? (
          <>
            <p className="ui-empty !py-2">No general engagement was fought this turn.</p>
            <p className="dropcap text-[14.5px]">{summary.momentum}</p>
          </>
        ) : (
          summary.engagements.map((engagement, i) => (
            <Engagement key={engagement.id} engagement={engagement} lead={i === 0} />
          ))
        )}
      </section>

      {/* ── Places taken (Grand Campaign) ────────────────────────────── */}
      {summary.captures.length > 0 && (
        <section className="mt-6">
          <div className="ui-eyebrow mb-1">Taken this month</div>
          {summary.captures.map(c => (
            <Row
              key={`${c.name}-${c.side}`}
              label={
                <>
                  {c.name}
                  {c.isCapital && <span className="ml-1.5"><Tag tone="mark">capital</Tag></span>}
                </>
              }
              value={<span className={SIDE_TEXT[c.side]}>now {c.side}</span>}
            />
          ))}
        </section>
      )}

      {/* ── Still pending ────────────────────────────────────────────── */}
      {summary.pending.length > 0 && (
        <section className="mt-6">
          <div className="ui-eyebrow mb-1">Still to be fought</div>
          {summary.pending.map(p => (
            <Row
              key={p.id}
              label={
                <>
                  <span className="text-ink">{p.title}</span>
                  {p.subtitle && <span className="text-ink-3"> · {p.subtitle}</span>}
                </>
              }
              value={<Tag tone={p.attacker}>{p.attacker} attacking</Tag>}
            />
          ))}
        </section>
      )}

      {/* ── The ledger ───────────────────────────────────────────────── */}
      <section className="mt-7 pt-4 border-t-[3px] border-double border-rule">
        <div className="ui-eyebrow text-center">{summary.standingsLabel}</div>

        <ScoreStrip
          usaVP={s.usaVP}
          csaVP={s.csaVP}
          usaSP={s.spEnabled ? s.usaSP : null}
          csaSP={s.spEnabled ? s.csaSP : null}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-9 mt-5">
          {s.territories.total > 0 && (
            <Row
              label="Ground held"
              value={
                <span className="tabular">
                  <span className={SIDE_TEXT.USA}>{s.territories.USA}</span>
                  {' · '}
                  <span className={SIDE_TEXT.CSA}>{s.territories.CSA}</span>
                  {' · '}
                  <span className="font-normal text-ink-3">{s.territories.NEUTRAL} neutral</span>
                </span>
              }
            />
          )}
          <Row
            label="Fell this turn"
            value={
              <span className="tabular">
                {num((s.turnCasualties.USA || 0) + (s.turnCasualties.CSA || 0))}
              </span>
            }
          />
          <Row label="Dead and wounded, all told" value={<span className="tabular">{num(s.casualties.total)}</span>} />
          <Row
            label="By side"
            value={
              <span className="tabular">
                <span className={SIDE_TEXT.USA}>{num(s.casualties.USA)}</span>
                {' · '}
                <span className={SIDE_TEXT.CSA}>{num(s.casualties.CSA)}</span>
              </span>
            }
          />
          {s.grand && (
            <>
              <Row
                label="Treasury"
                value={
                  <span className="tabular">
                    <span className={SIDE_TEXT.USA}>${num(s.grand.pools?.USA?.treasury)}</span>
                    {' · '}
                    <span className={SIDE_TEXT.CSA}>${num(s.grand.pools?.CSA?.treasury)}</span>
                  </span>
                }
              />
              <Row
                label="Manpower"
                value={
                  <span className="tabular">
                    <span className={SIDE_TEXT.USA}>{num(s.grand.pools?.USA?.manpower)}</span>
                    {' · '}
                    <span className={SIDE_TEXT.CSA}>{num(s.grand.pools?.CSA?.manpower)}</span>
                  </span>
                }
              />
              <Row
                label="Cities"
                value={
                  <span className="tabular">
                    <span className={SIDE_TEXT.USA}>{s.grand.cities.USA}</span>
                    {' · '}
                    <span className={SIDE_TEXT.CSA}>{s.grand.cities.CSA}</span>
                  </span>
                }
              />
            </>
          )}
        </div>

        {summary.engagements.length > 0 && (
          <p className="mt-4 text-[14.5px] text-justify">{summary.momentum}</p>
        )}

        <p className="ui-hint mt-4 text-center">{summary.closing}</p>
      </section>
    </Modal>
  );
};

export default TurnSummary;
