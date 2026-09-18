import { useMemo, useState } from 'react';
import { getTurnOrder } from '../utils/initiative';
import {
  ScrollText, ChevronLeft, ChevronRight, Copy, Check, Skull, Zap,
  Flag, Clock, Link2, Landmark,
} from 'lucide-react';
import { Modal, ScoreBoard, Row, Badge, SIDE_TEXT } from './ui/Primitives';
import { buildTurnSummary, formatTurnSummaryText, getSummarisableTurns } from '../utils/turnSummary';

/**
 * TurnSummary: the end-of-turn dispatch.
 *
 * Reads a turn's battles back as a period field report. The weather, who went
 * in, what it cost, and what the map looks like heading into the next month.
 * The same text can be copied straight into Discord, optionally with a share
 * link to the live map.
 */

const num = (n) => (n || 0).toLocaleString('en-US');

/** Copy button that flips to a tick for a beat after a successful write. */
const CopyButton = ({ label, icon: Icon = Copy, className = '', getText, onError }) => {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

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
        // back to a prompt the user can copy out of by hand.
        window.prompt('Copy the dispatch:', text);
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
      {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      {done ? 'Copied' : label}
    </button>
  );
};

/** One engagement: headline, scene, prose, and the numbers underneath. */
const Engagement = ({ engagement }) => {
  const e = engagement;
  const winnerTone = e.winner === 'DRAW' || e.winner === 'NEUTRAL' ? 'neutral' : e.winner;

  return (
    <article className="ui-inset p-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="ui-eyebrow text-brass-400 shrink-0">{e.ordinal}</span>
            <h4 className="text-base font-bold text-mist-100 tracking-wide uppercase truncate">
              {e.title}
            </h4>
            {e.vp ? (
              <span className="text-sm font-bold text-brass-300 tabular shrink-0">
                {e.vp}
                <span className="text-[10px] text-mist-500 ml-0.5">VP</span>
              </span>
            ) : null}
          </div>
          {e.subtitle && (
            <div className="text-xs text-mist-500 mt-0.5 italic truncate">{e.subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge tone={e.attacker}>{e.attacker} attacking</Badge>
          <Badge tone={winnerTone}>
            {e.winner === 'DRAW' ? 'drawn' : e.winner === 'NEUTRAL' ? 'stays neutral' : `${e.winner} won`}
          </Badge>
        </div>
      </header>

      <p className="mt-3 text-sm text-mist-300 leading-relaxed">{e.prose}</p>

      {(e.totalCasualties > 0 || e.attackerSP != null) && (
        <div className="mt-3 pt-3 border-t border-ink-700 grid grid-cols-2 gap-x-6 gap-y-2">
          <Row
            label={<span className={SIDE_TEXT[e.attacker]}>{e.attacker} losses</span>}
            value={
              <span className="tabular">
                {num(e.attackerCasualties)}
                {e.attackerSP != null && (
                  <span className="text-mist-500 text-xs ml-1.5">{num(e.attackerSP)} SP</span>
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
                  <span className="text-mist-500 text-xs ml-1.5">{num(e.defenderSP)} SP</span>
                )}
              </span>
            }
          />
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px] text-mist-500">
        {e.scale && (
          <span className="inline-flex items-center gap-1">
            <Skull className="w-3 h-3" /> {e.scale}
          </span>
        )}
        {e.abilityLabel && (
          <span className={`inline-flex items-center gap-1 ${SIDE_TEXT[e.abilityUsed]}`}>
            <Zap className="w-3 h-3" /> {e.abilityLabel}
          </span>
        )}
        {e.changedHands && (
          <span className="inline-flex items-center gap-1 text-brass-300">
            <Flag className="w-3 h-3" /> ground changed hands
          </span>
        )}
        {(e.wipes || []).map(w => (
          <span key={w.name} className="inline-flex items-center gap-1 text-rebel-400">
            <Skull className="w-3 h-3" /> {w.name} destroyed
          </span>
        ))}
      </div>

      {e.notes && (
        <p className="mt-2.5 text-xs text-mist-400 border-l-2 border-ink-600 pl-2.5">{e.notes}</p>
      )}
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
    <Modal
      icon={<ScrollText className="w-5 h-5" />}
      title="Turn Dispatch"
      subtitle={`${summary.campaignName} · Turn ${summary.turn}${summary.dateLabel ? ` · ${summary.dateLabel}` : ''}`}
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
            <span className="text-xs text-mist-400 tabular px-1 min-w-[4.5rem] text-center">
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
              icon={Link2}
              className="ui-btn ui-btn-ghost"
              getText={copyWithLink}
            />
          )}
        </>
      }
    >
      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <header className="text-center border-y border-brass-500/30 py-4">
        <div className="ui-eyebrow text-brass-400">{summary.campaignName}</div>
        <h2 className="mt-1.5 text-2xl font-bold text-mist-100 tracking-wide">
          Turn {summary.turn} · Week {summary.week}
        </h2>
        {summary.dateLabel && (
          <div className="mt-1 text-sm text-mist-400 italic">{summary.dateLabel}</div>
        )}
        {(() => {
          // Whose move opens this turn, from the season initiative roll.
          const order = getTurnOrder(campaign?.initiative, summary.turn);
          if (order.length === 0) return null;
          const cls = (side) => (side === 'USA' ? 'text-union-400' : 'text-rebel-400');
          return (
            <div className="mt-2 text-sm text-mist-300">
              <span className={`font-semibold ${cls(order[0])}`}>{order[0]}</span>
              <span className="text-mist-500"> moves first, then </span>
              <span className={`font-semibold ${cls(order[1])}`}>{order[1]}</span>
            </div>
          );
        })()}
      </header>

      {summary.seasonLine && (
        <p className="mt-4 text-sm text-mist-400 italic text-center leading-relaxed">
          {summary.seasonLine}
        </p>
      )}

      {/* ── Engagements ──────────────────────────────────────────────── */}
      <section className="mt-5 space-y-3">
        {summary.engagements.length === 0 ? (
          <div className="ui-inset p-5 text-center">
            <div className="ui-eyebrow mb-2">No general engagement</div>
            <p className="text-sm text-mist-400 leading-relaxed">{summary.momentum}</p>
          </div>
        ) : (
          summary.engagements.map(engagement => (
            <Engagement key={engagement.id} engagement={engagement} />
          ))
        )}
      </section>

      {/* ── Places taken (Grand Campaign) ────────────────────────────── */}
      {summary.captures.length > 0 && (
        <section className="mt-5">
          <div className="ui-eyebrow flex items-center gap-1.5 mb-2">
            <Landmark className="w-3.5 h-3.5" />
            Taken this month
          </div>
          <div className="ui-inset p-3 space-y-1.5">
            {summary.captures.map(c => (
              <div key={`${c.name}-${c.side}`} className="text-sm text-mist-300 flex items-center gap-2">
                <Flag className={`w-3.5 h-3.5 ${SIDE_TEXT[c.side]}`} />
                <span className="text-mist-100">{c.name}</span>
                {c.isCapital && <Badge tone="warn">capital</Badge>}
                <span className="ml-auto text-xs text-mist-500">now {c.side}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Still pending ────────────────────────────────────────────── */}
      {summary.pending.length > 0 && (
        <section className="mt-5">
          <div className="ui-eyebrow flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5" />
            Still to be fought
          </div>
          <div className="ui-inset p-3 space-y-1.5">
            {summary.pending.map(p => (
              <div key={p.id} className="text-sm text-mist-300 flex items-center gap-2">
                <span className="text-mist-100 truncate">{p.title}</span>
                {p.subtitle && <span className="text-xs text-mist-500 truncate">{p.subtitle}</span>}
                <span className="ml-auto shrink-0">
                  <Badge tone={p.attacker}>{p.attacker} attacking</Badge>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── The ledger ───────────────────────────────────────────────── */}
      <section className="mt-6 pt-5 border-t border-ink-700">
        <div className="ui-eyebrow mb-3">{summary.standingsLabel}</div>

        <ScoreBoard
          usaVP={s.usaVP}
          csaVP={s.csaVP}
          usaSP={s.spEnabled ? s.usaSP : null}
          csaSP={s.spEnabled ? s.csaSP : null}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-5">
          {s.territories.total > 0 && (
            <Row
              label="Ground held"
              value={
                <span className="tabular">
                  <span className={SIDE_TEXT.USA}>{s.territories.USA}</span>
                  {' · '}
                  <span className={SIDE_TEXT.CSA}>{s.territories.CSA}</span>
                  {' · '}
                  <span className="text-mist-500">{s.territories.NEUTRAL} neutral</span>
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
          <p className="mt-4 text-sm text-mist-300 leading-relaxed">{summary.momentum}</p>
        )}

        <p className="mt-4 text-xs text-mist-500 italic text-center">{summary.closing}</p>
      </section>
    </Modal>
  );
};

export default TurnSummary;
