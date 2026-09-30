// A night read as a matchup: the two sides, the rounds they split, and — when
// scoreboards have been bound to those rounds — everything the two rounds add
// up to. Same shapes as the round matchup, one level up.
//
// Sides are the league's Team A / Team B, never USA/CSA: a flipped round swaps
// which faction each side played, so the roll-up maps factions onto sides
// before adding anything together (see rollupNight).
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Panel, Pill, EmptyHint } from '../ui';
import { Spine } from '../ui/Spine';
import { Scoreline } from '../ui/Scoreline';
import { StanceBar } from '../ui/StanceBar';
import { CauseTable, TicketPct } from './drawerPrimitives';
import { formatAvgT, formatRate, AVG_TD_LABEL, AVG_TK_LABEL, KILL_RATE_LABEL, LOSS_RATE_LABEL, TICKET_INFLICTED_LABEL, TICKET_RECEIVED_LABEL } from '../../stats/labels';
import {
  nightType,
  hasPerRoundLeads,
  leadsPerNight,
  nightRounds,
  nightScore,
  nightRows,
  nightKeys,
  nightPoints,
  nightFormations,
  effectiveTeams,
  latestPlayedWeek,
  rollupNight,
  type NightWeek,
  type NightRoundScoreboard,
  type NightSideRoll,
  type NightUnitRoll,
  type PointSystem,
  type Side,
} from '../../stats/nightMatchup';
import type { StoredScoreboard } from '../../stats/StatsRepository';
import type { RegimentAssignmentMap } from '../../stats/StatsRepository';
import type { EngineOptions } from '../../stats/statsEngine';

/** Small qualifier in a panel's right slot. */
const Hint = ({ children }: { children: ReactNode }) => (
  <span className="cap">{children}</span>
);

/** Team A takes the Union hue, Team B the Confederate one — the tracker's convention. */
const SIDE_TONE = { A: 'usa', B: 'csa' } as const;
const SIDE_HUE = { A: 'var(--color-usa)', B: 'var(--color-csa)' } as const;

export function NightMatchup({
  weeks,
  stored,
  pointSystem,
  tokenUnits,
  assignments = {},
  options = {},
  onOpenRound,
  onEditNight,
  night,
  readOnly = false,
}: {
  weeks: NightWeek[];
  /** Every stored scoreboard for the event; bound ones are matched to a round. */
  stored: StoredScoreboard[];
  pointSystem?: PointSystem;
  /** Units holding a standings token; anything else scores nothing. */
  tokenUnits?: string[];
  assignments?: RegimentAssignmentMap;
  options?: EngineOptions;
  onOpenRound?: (filename: string) => void;
  /** Jump to the tracker's night builder for this week. */
  onEditNight?: (weekId: string) => void;
  /** The night to open on — one clicked elsewhere. Read once, on mount. */
  night?: string;
  /** On the public site there is nobody who could bind a scoreboard. */
  readOnly?: boolean;
}) {
  // Open on the night asked for, else the night last played, not the last one
  // scheduled — see latestPlayedWeek.
  const [weekId, setWeekId] = useState<string>(() => night ?? String(latestPlayedWeek(weeks)?.id ?? ''));
  const week = weeks.find((w) => String(w.id) === weekId) ?? latestPlayedWeek(weeks);

  if (!week) {
    return (
      <Panel title="Night matchup">
        <EmptyHint>Add a week in the tracker to read it as a matchup</EmptyHint>
      </Panel>
    );
  }

  return (
    <NightBody
      key={String(week.id)}
      week={week}
      weeks={weeks}
      weekId={String(week.id)}
      setWeekId={setWeekId}
      stored={stored}
      pointSystem={pointSystem}
      tokenUnits={tokenUnits}
      assignments={assignments}
      options={options}
      onOpenRound={onOpenRound}
      onEditNight={onEditNight}
      readOnly={readOnly}
    />
  );
}

function NightBody({
  week,
  weeks,
  weekId,
  setWeekId,
  stored,
  pointSystem,
  tokenUnits,
  assignments,
  options,
  onOpenRound,
  onEditNight,
  readOnly = false,
}: {
  week: NightWeek;
  weeks: NightWeek[];
  weekId: string;
  setWeekId: (id: string) => void;
  stored: StoredScoreboard[];
  pointSystem?: PointSystem;
  tokenUnits?: string[];
  assignments: RegimentAssignmentMap;
  options: EngineOptions;
  onOpenRound?: (filename: string) => void;
  onEditNight?: (weekId: string) => void;
  readOnly?: boolean;
}) {
  const type = nightType(week);
  const perRound = hasPerRoundLeads(type);
  const score = nightScore(week);
  const rounds = nightRounds(week);
  const rows = nightRows(week);
  const keys = nightKeys(week);
  const form = nightFormations(week);

  // The scoreboard bound to each round of this night, if one is.
  const boundByRound = useMemo(() => {
    const m = new Map<1 | 2, StoredScoreboard>();
    for (const s of stored) {
      if (s.binding?.weekId === weekId) m.set(s.binding.round, s);
    }
    return m;
  }, [stored, weekId]);

  const roll = useMemo(() => {
    const imported: NightRoundScoreboard[] = [];
    for (const r of rounds) {
      const s = boundByRound.get(r.round);
      if (s) imported.push({ round: r.round, sb: s.scoreboard, factionA: r.factionA });
    }
    return imported.length ? rollupNight(imported, assignments, options) : null;
  }, [rounds, boundByRound, assignments, options]);

  /**
   * One set of figures for the night, not two.
   *
   * The scoreboard is richer wherever it exists — kills, ticket value, the
   * stance splits — so it leads when a round is bound. But only the tracker
   * knows the result: how many rounds each side took and who led them. Those
   * two ride along rather than being lost to the swap, because they are the
   * facts the night is actually about.
   */
  const spineRows = useMemo(() => {
    if (!roll) return rows;
    const won = rows.filter((r) => r.label === 'Rounds won');
    const led = rows.filter((r) => r.label === 'Lead unit');
    return [...won, ...roll.rows, ...led];
  }, [roll, rows]);

  const points = useMemo(
    () => (pointSystem ? nightPoints(week, pointSystem, tokenUnits) : []),
    [week, pointSystem, tokenUnits],
  );

  const teams = effectiveTeams(week, 1);
  const label = score.played === 0 ? 'Not played' : score.winner ? 'Final' : 'Split';

  return (
    <div >
      <Panel title="Night matchup">
        <div className="ctl">
          <span className="text-xs uppercase tracking-wider text-[color:var(--color-text-2)]">Night</span>
          <select
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
            
          >
            {weeks.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>
          <Pill tone={type === 'Playoffs' ? 'warn' : type === 'Fun round' ? 'neutral' : 'accent'}>{type}</Pill>
          <Pill tone="neutral">{leadsPerNight(type)} leads</Pill>
          {boundByRound.size > 0 && (
            <Pill tone="ok">
              {boundByRound.size}/2 rounds imported
            </Pill>
          )}
          <span className="flex-1" />
          {onEditNight && (
            <button
              onClick={() => onEditNight(weekId)}
              className="border border-[color:var(--color-border)] px-2 py-0.5 text-xs uppercase tracking-wider text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-0)]"
            >
              Edit night
            </button>
          )}
        </div>

        <Scoreline
          winner={score.winner === 'A' ? 'a' : score.winner === 'B' ? 'b' : null}
          label={label}
          a={{
            chip: <Pill tone="usa">Team A</Pill>,
            name: perRound ? `${teams.A.length} units` : week.leadA ? `${week.leadA} leading` : 'No lead recorded',
            value: score.roundsA,
            sub: `rounds won · ${score.casualtiesA} men lost`,
            hue: SIDE_HUE.A,
          }}
          b={{
            chip: <Pill tone="csa">Team B</Pill>,
            name: perRound ? `${teams.B.length} units` : week.leadB ? `${week.leadB} leading` : 'No lead recorded',
            value: score.roundsB,
            sub: `rounds won · ${score.casualtiesB} men lost`,
            hue: SIDE_HUE.B,
          }}
        />
      </Panel>

      <Panel title="Rounds" right={<Hint>two rounds make a night</Hint>}>
        <div className="cols">
          {rounds.map((r) => {
            const bound = boundByRound.get(r.round);
            const open = bound && onOpenRound ? () => onOpenRound(bound.scoreboard.sourceFilename) : null;
            const inflictedA = r.casualtiesB ?? 0;
            const inflictedB = r.casualtiesA ?? 0;
            const bar = inflictedA + inflictedB;
            return (
              <div
                key={r.round}
                role={open ? 'button' : undefined}
                tabIndex={open ? 0 : undefined}
                onClick={open ?? undefined}
                onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && open() : undefined}
                className={`col ${
                  open ? 'cursor-pointer hover:bg-[color:var(--color-bg-2)]' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-[color:var(--color-text-2)]">
                    Round {r.round}
                  </span>
                  <span className="h-px flex-1 bg-[color:var(--color-border)]" />
                  {r.winner ? (
                    <Pill tone={SIDE_TONE[r.winner]}>Team {r.winner}</Pill>
                  ) : r.draw ? (
                    <Pill tone="neutral">Draw</Pill>
                  ) : (
                    <Pill tone="neutral">Not played</Pill>
                  )}
                </div>
                <div className="wor-name mt-1.5 text-sm text-[color:var(--color-text-0)]">{r.map ?? '—'}</div>
                <div className="mt-1 text-[color:var(--color-text-2)]">
                  Team A as {r.factionA} · Team B as {r.factionB}
                  {r.flipped && ' · sides flipped'}
                </div>
                {perRound && (
                  <div className="mt-1 text-[color:var(--color-text-2)]">
                    Leads: <span className="wor-name text-[color:var(--color-text-1)]">{r.leadA ?? '—'}</span> vs{' '}
                    <span className="wor-name text-[color:var(--color-text-1)]">{r.leadB ?? '—'}</span>
                  </div>
                )}
                {r.played && bar > 0 && (
                  <>
                    <div className="mt-2 flex h-1.5">
                      <span style={{ width: `${(inflictedA / bar) * 100}%`, background: SIDE_HUE.A }} />
                      <span className="flex-1" style={{ background: SIDE_HUE.B }} />
                    </div>
                    <div className="mt-1 flex justify-between tabular-nums text-[color:var(--color-text-2)]">
                      <span>A inflicted {inflictedA}</span>
                      <span>B inflicted {inflictedB}</span>
                    </div>
                  </>
                )}
                {(r.moraleA || r.moraleB) && (
                  <div className="mt-1.5 text-[color:var(--color-text-2)]">
                    Morale: {r.moraleA ?? '—'} vs {r.moraleB ?? '—'}
                  </div>
                )}
                <div
                  className={`mt-2 uppercase tracking-wider ${
                    open ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-2)]'
                  }`}
                >
                  {open ? 'Open the round matchup →' : 'No scoreboard bound to this round'}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="The night in numbers"
        right={<Hint>{roll ? `from ${roll.roundsImported} of 2 scoreboards` : 'from the recorded results'}</Hint>}
      >
        <Spine rows={spineRows} aSide="usa" bSide="csa" />
        {!roll && (
          <p className="note" style={{ padding: '11px 13px 13px' }}>
            {readOnly
              ? "The night's recorded results. No scoreboard has been bound to either round, so there are no stance splits, per-unit stats or killfeed to show alongside them."
              : "The night's recorded results. Bind a scoreboard to a round and these figures come from it instead, with the stance splits, the per-unit stats and the killfeed alongside."}
          </p>
        )}
      </Panel>

      {form.A && form.B && (form.A.in_form + form.A.skirm + form.A.oob > 0 || form.B.in_form + form.B.skirm + form.B.oob > 0) && (
        <Panel title="Where the losses happened" right={<Hint>across both rounds</Hint>}>
          <div className="cols pb">
            <StanceBar counts={form.A} label="Team A" />
            <StanceBar counts={form.B} label="Team B" />
          </div>
        </Panel>
      )}

      {keys.length > 0 && (
        <Panel title="What decided it">
          {keys.map((k) => (
            <div key={k.title} className="pb" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2">
                {k.side ? <Pill tone={SIDE_TONE[k.side]}>Team {k.side}</Pill> : <Pill tone="neutral">Night</Pill>}
                <strong className="text-sm text-[color:var(--color-text-0)]">{k.title}</strong>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-text-1)]">{k.body}</p>
            </div>
          ))}
        </Panel>
      )}

      {roll && (
        <>
          <Panel title="Weapons across the night">
            <div className="cols pb">
              <CauseTable title="Team A killed with" data={roll.A.killsByCause} />
              <CauseTable title="Team B killed with" data={roll.B.killsByCause} />
              <CauseTable title="Team A died to" data={roll.A.casualtiesByCause} />
              <CauseTable title="Team B died to" data={roll.B.casualtiesByCause} />
            </div>
            <p className="note" style={{ padding: '0 13px 13px' }}>
              What one side killed with is mostly what the other died to. They differ where a death had no
              killer in the feed — the environment, and anything the feed missed.
            </p>
          </Panel>
          <UnitRoll roll={roll.A} />
          <UnitRoll roll={roll.B} />
        </>
      )}

      <Rosters week={week} points={points} hasPoints={!!pointSystem} />
    </div>
  );
}

/** One side's units across the night, ordered by ticket damage dealt. */
function UnitRoll({ roll }: { roll: NightSideRoll }) {
  if (roll.units.length === 0) return null;
  const factions = [...new Set(roll.factions)].join(' then ');
  return (
    <Panel title={`Team ${roll.side} — units across the night`} right={<Hint>{`played ${factions}`}</Hint>}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-2)] uppercase tracking-wider text-[color:var(--color-text-2)]">
              <th className="text-left">Unit</th>
              <th className="text-right">Rds</th>
              <th className="text-right">Men</th>
              <th className="text-right">Kills</th>
              <th className="text-right">Lost</th>
              <th className="text-right">K/D</th>
              <th className="text-right" title={KILL_RATE_LABEL}>KR</th>
              <th className="text-right" title={LOSS_RATE_LABEL}>LR</th>
              <th className="text-right" title={AVG_TK_LABEL}>×Tk</th>
              <th className="text-right" title={AVG_TD_LABEL}>×Td</th>
              <th className="text-right" title={TICKET_INFLICTED_LABEL}>TDI</th>
              <th className="text-right" title={TICKET_RECEIVED_LABEL}>TDR</th>
            </tr>
          </thead>
          <tbody>
            {roll.units.map((u: NightUnitRoll) => (
              <tr key={u.unit} className="border-b border-[color:var(--color-border)]">
                <td className="wor-name">{u.unit}</td>
                <td className="text-right tabular-nums text-[color:var(--color-text-2)]">{u.rounds}</td>
                <td className="text-right tabular-nums">{u.fielded}</td>
                <td className="text-right tabular-nums">{u.kills}</td>
                <td className="text-right tabular-nums">{u.deaths}</td>
                <td className="text-right tabular-nums">{u.kd.toFixed(2)}</td>
                <td className="text-right tabular-nums text-[color:var(--color-text-2)]">{formatRate(u.killRate)}</td>
                <td className="text-right tabular-nums text-[color:var(--color-text-2)]">{formatRate(u.lossRate)}</td>
                <td className="text-right tabular-nums">{formatAvgT(u.avgTk)}</td>
                <td className="text-right tabular-nums">{formatAvgT(u.avgTd)}</td>
                <td className="text-right">
                  <TicketPct share={u.pctInflicted / 100} shareTitle={TICKET_INFLICTED_LABEL} />
                </td>
                <td className="text-right">
                  <TicketPct share={u.pctReceived / 100} shareTitle={TICKET_RECEIVED_LABEL} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Who was on each side, who led, and what the night was worth to them. */
function Rosters({
  week,
  points,
  hasPoints,
}: {
  week: NightWeek;
  points: ReturnType<typeof nightPoints>;
  hasPoints: boolean;
}) {
  const type = nightType(week);
  const perRound = hasPerRoundLeads(type);
  const byUnit = new Map(points.map((p) => [p.unit, p]));
  const teams = effectiveTeams(week, 1);
  const rounds = nightRounds(week);

  const ledIn = (unit: string): number[] =>
    rounds.filter((r) => r.leadA === unit || r.leadB === unit).map((r) => r.round);

  return (
    <Panel title="Rosters" right={<Hint>{perRound ? 'leads are set per round' : 'lead marked ★'}</Hint>}>
      <div className="cols">
        {(['A', 'B'] as Side[]).map((side) => {
          const units = teams[side];
          const total = units.reduce((n, u) => n + (byUnit.get(u)?.points ?? 0), 0);
          return (
            <div key={side} className="col">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={SIDE_TONE[side]}>Team {side}</Pill>
                <span className="h-px flex-1 bg-[color:var(--color-border)]" />
                <span className="cap">
                  {units.length} units{hasPoints && ` · ${total} pts`}
                </span>
              </div>
              {units.length === 0 ? (
                <div className="mt-2 text-xs text-[color:var(--color-text-2)]">No units on this side</div>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {units.map((u) => {
                      const p = byUnit.get(u);
                      const led = ledIn(u);
                      return (
                        <tr key={u} className="border-b border-[color:var(--color-border)]">
                          <td className={`wor-name ${p?.token === false ? 'text-[color:var(--color-text-2)]' : 'text-[color:var(--color-text-0)]'}`}>
                            {u}
                            {led.length > 0 && (
                              <span className="ml-1.5 uppercase tracking-wider text-[color:var(--color-accent)]">
                                ★ {perRound ? `R${led.join(' R')}` : 'lead'}
                              </span>
                            )}
                            {p?.token === false && (
                              <span className="ml-1.5 uppercase tracking-wider text-[color:var(--color-text-2)]">
                                no token
                              </span>
                            )}
                          </td>
                          <td className="num" style={{ color: 'var(--ink-3)' }}>
                            {p ? `${p.roundsWon}–${p.roundsLost}` : ''}
                            {p && p.swappedRounds > 0 && ` · balanced ×${p.swappedRounds}`}
                          </td>
                          {hasPoints && (
                            <td className="num">
                              {p?.points ?? 0}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {hasPoints && type === 'Playoffs' && (
                <div className="mt-2 text-[color:var(--color-text-2)]">
                  Playoff nights award no points — the record still counts.
                </div>
              )}
              {hasPoints && type === 'Fun round' && (
                <div className="mt-2 text-[color:var(--color-text-2)]">
                  Fun rounds are exhibition — no points and no record.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
