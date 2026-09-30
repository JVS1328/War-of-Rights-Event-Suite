import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Shell } from '../components/Shell';
import { SeasonOverview, StandingsScreen, ScheduleScreen } from '../components/season/SeasonScreens';
import { RosterScreen } from '../components/season/Roster';
import { Playoffs } from '../components/season/Playoffs';
import { PairingsScreen } from '../components/season/PairingsScreen';
import { EloLadder } from '../components/EloLadder';
import StatsArea from '../components/stats/StatsArea';
import { cloudStatsRepo } from '../stats/repo';
import { getEvent } from '../cloud/events';
import type { CloudEvent } from '../cloud/events';
import { pullTrackerEvent, appStateForEvent } from '../cloud/publish';
import type { TrackerEvent, TrackerSeason } from '../cloud/publish';
import { hrefFor, navigate, PUBLIC_SCREENS } from '../cloud/route';
import type { PublicScreen } from '../cloud/route';
import { OVERALL_SCOPE, defaultSeasonScope } from '../stats/statsBundle';
import { latestSeason } from '../utils/seasonOrder';
import {
  standingRows,
  nightRows,
  seasonKpis,
  rosterRows,
  eloLadderRows,
  tokenUnitsOf,
} from '../utils/seasonView';
import { bracketSlots } from '../utils/playoffBracket';
import { buildPairHeatmap } from '../utils/pairHeatmap';
import type { PairMode } from '../utils/pairHeatmap';

/**
 * One event, as anyone may read it: the season the tracker keeps and the player
 * stats beside it, with nothing to click that would change either.
 *
 * The screens are the tracker's own — SeasonOverview, StandingsScreen and the
 * rest — fed from utils/seasonView, so what a visitor sees is the same
 * computation the owner sees rather than a second implementation of it.
 */
export function PublicEventView({
  slug,
  screen,
  season: seasonFromUrl,
  night,
}: {
  slug: string;
  screen: PublicScreen;
  season: string | null;
  /** The night the matchup screen opens on, from the URL. */
  night?: string;
}) {
  const [meta, setMeta] = useState<CloudEvent | null>(null);
  const [tracker, setTracker] = useState<TrackerEvent | null>(null);
  const [fallbackScope, setFallbackScope] = useState(OVERALL_SCOPE);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setState('loading');
    (async () => {
      try {
        const [event, trackerEvent] = await Promise.all([getEvent(slug), pullTrackerEvent(slug)]);
        if (!live) return;
        setMeta(event);
        setTracker(trackerEvent);
        setState('ready');
        // Which season to open on when the URL does not say. The summaries are
        // the cheap half of the stats — no players, no killfeed — and they are
        // what says whether a season has any rounds bound to it at all.
        try {
          const summaries = await cloudStatsRepo.listScoreboards({ eventId: slug });
          if (live) setFallbackScope(defaultSeasonScope(event.seasons ?? [], summaries));
        } catch {
          if (live) setFallbackScope(OVERALL_SCOPE);
        }
      } catch (err) {
        if (!live) return;
        const message = err instanceof Error ? err.message : 'Could not load this event.';
        setError(message);
        setState(/not found/i.test(message) ? 'missing' : 'error');
      }
    })();
    return () => { live = false; };
  }, [slug]);

  const seasons = tracker?.seasons ?? [];

  /**
   * One scope for the whole event view, and it lives in the URL — so a season
   * picked on the standings is still picked on the player stats, and a link
   * carries it. `overall` means every season at once, which only the stats
   * screens can actually draw.
   */
  const scope = seasonFromUrl ?? fallbackScope;

  /**
   * Which season the season screens read. Overall has no answer for them, so
   * they fall back to the most recent one — an event is nearly always about
   * the season being played now rather than the first one ever recorded.
   */
  const activeSeason = useMemo(() => {
    if (!seasons.length) return null;
    const named = scope === OVERALL_SCOPE ? null : seasons.find((s) => s.id === scope);
    return named ?? latestSeason(seasons) ?? seasons[0];
  }, [seasons, scope]);

  /**
   * Plenty of events are scoreboards and nothing else — rounds imported for the
   * stats, with no season ever built around them. Standings, a schedule and a
   * bracket are all empty for one of those, so the season half of the site
   * simply is not there: no rail group, no season picker, no screens.
   */
  const hasSeason = seasons.some((s) => (s.weeks?.length ?? 0) > 0);

  if (state === 'loading') return <Waiting message="Loading the event…" />;
  if (state === 'missing') {
    return (
      <Waiting
        message={`No published event called "${slug}".`}
        hint="It may not be published yet, or the short name may be different."
      />
    );
  }
  if (state === 'error' || !meta) return <Waiting message={error ?? 'Could not load this event.'} />;

  // With no season behind the event there is only one screen, whatever the URL
  // was pointing at when it arrived.
  const here: PublicScreen = hasSeason ? screen : 'stats';

  const goScreen = (next: string) =>
    navigate({ kind: 'event', slug, screen: next as PublicScreen, season: scope });

  const goScope = (next: string) =>
    navigate({ kind: 'event', slug, screen: here, season: next });

  const nav = [
    ...(hasSeason && activeSeason
      ? [{
          title: 'Season',
          items: PUBLIC_SCREENS.filter((s) => s.key !== 'stats').map((s) => ({
            key: s.key,
            label: s.label,
            count:
              s.key === 'schedule' ? activeSeason.weeks?.length ?? null
              : s.key === 'roster' ? activeSeason.units?.length ?? null
              : null,
          })),
        }]
      : []),
    {
      title: 'Stats',
      items: [{ key: 'stats', label: 'Player stats', count: meta.scoreboardCount || null }],
    },
  ];

  return (
    <Shell
      nav={nav}
      screen={here}
      onScreen={goScreen}
      title="War of Rights"
      subtitle={meta.name}
      crumb={
        <>
          <a className="gh" href={hrefFor({ kind: 'directory' })} title="Back to every event">
            <ArrowLeft className="w-3 h-3" /> Events
          </a>
          <span className="wor-name">{meta.name}</span>
          {seasons.length > 0 && hasSeason && (
            <select value={scope} onChange={(e) => goScope(e.target.value)} aria-label="Season">
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              {/* Only the stats read every season at once; the season screens
                  fall back to the most recent one and say which. */}
              <option value={OVERALL_SCOPE}>All seasons</option>
            </select>
          )}
          {scope === OVERALL_SCOPE && here !== 'stats' && activeSeason && (
            <span className="cap">showing {activeSeason.name}</span>
          )}
          <span className="tag q">read only</span>
        </>
      }
    >
      {here === 'stats' || here === 'nights' ? (
        <PublicStats
          slug={slug}
          meta={meta}
          scope={scope}
          onScope={goScope}
          season={activeSeason}
          // The night matchup is a stats tab in the tracker too; naming it
          // here is what turns the panel into that one screen.
          tab={here === 'nights' ? 'nights' : undefined}
          night={night}
        />
      ) : activeSeason ? (
        <SeasonScreen
          screen={here}
          event={tracker!}
          season={activeSeason}
          eventName={meta.name}
          onOpenUnit={() => goScreen('standings')}
          onOpenNight={(weekId) =>
            navigate({ kind: 'event', slug, screen: 'nights', season: scope, night: weekId })}
        />
      ) : null}
    </Shell>
  );
}

/** One of the tracker's season screens, read-only. */
function SeasonScreen({
  screen,
  event,
  season,
  eventName,
  onOpenUnit,
  onOpenNight,
}: {
  screen: PublicScreen;
  event: TrackerEvent;
  season: TrackerSeason;
  eventName: string;
  onOpenUnit: () => void;
  /** Opens the night matchup on one of this season's nights, by week id. */
  onOpenNight: (weekId: string) => void;
}) {
  const standings = useMemo(() => standingRows(season), [season]);
  const nights = useMemo(() => nightRows(season), [season]);
  const kpis = useMemo(() => seasonKpis(season), [season]);
  const roster = useMemo(() => rosterRows(season), [season]);
  const ladder = useMemo(
    () => eloLadderRows(appStateForEvent(event), event, season),
    [event, season],
  );
  // The projected bracket, not just the nights already played — the same
  // seeding the tracker runs, so a visitor sees who is on course to meet whom.
  const bracket = useMemo(
    () => bracketSlots({ appState: appStateForEvent(event), event, season }),
    [event, season],
  );

  // Pairings read either this season or the whole event — a unit's history with
  // another one does not reset in January.
  const [pairMode, setPairMode] = useState<PairMode>('together');
  const [pairScope, setPairScope] = useState<'season' | 'event'>('season');
  const pairings = useMemo(() => {
    const scanned = pairScope === 'event' ? event.seasons ?? [] : [season];
    return buildPairHeatmap(scanned.flatMap((s) => s.weeks ?? []));
  }, [pairScope, event, season]);

  const divisions = season.divisions ?? [];
  const openNight = (index: number) => {
    const week = season.weeks?.[index];
    if (week) onOpenNight(String(week.id));
  };

  switch (screen) {
    case 'standings':
      return <StandingsScreen standings={standings} divisions={divisions} onOpenUnit={onOpenUnit} />;
    case 'schedule':
      return <ScheduleScreen nights={nights} onOpenNight={openNight} readOnly />;
    case 'roster':
      return <RosterScreen seasonName={season.name} units={roster} readOnly />;
    case 'playoffs':
      return (
        <Playoffs
          enabled={!!season.playoffConfig?.enabled}
          bracket={bracket}
          standings={standings}
          divisions={divisions}
          qualifyPerDivision={season.playoffConfig?.teamsPerDivision ?? 2}
          nightsAvailable={(season.weeks ?? []).filter((w) => w.isPlayoffs).length}
          // No planner on the public site: choosing a format is the owner's job.
          formats={[]}
        />
      );
    case 'pairings':
      return (
        <PairingsScreen
          map={pairings}
          mode={pairMode}
          onMode={setPairMode}
          scope={pairScope}
          onScope={setPairScope}
          seasonName={season.name}
          seasonCount={event.seasons?.length ?? 1}
        />
      );
    case 'ladder':
      return (
        <EloLadder
          rows={ladder}
          settings={(event.eloSystem ?? {}) as Parameters<typeof EloLadder>[0]['settings']}
          nights={(season.weeks ?? []).length}
          onOpenUnit={onOpenUnit}
        />
      );
    default:
      return (
        <SeasonOverview
          eventName={eventName}
          seasonName={season.name}
          kpis={kpis}
          standings={standings}
          nights={nights}
          pointSystem={
            (season.pointSystem ?? {}) as unknown as Parameters<typeof SeasonOverview>[0]['pointSystem']
          }
          onOpenUnit={onOpenUnit}
          onOpenNight={openNight}
        />
      );
  }
}

/**
 * The player-stats panel, reading straight from the database. Same component
 * the tracker uses, handed the remote repository and told it is read-only, so
 * the Import tab and every editing affordance stay hidden.
 */
function PublicStats({
  slug,
  meta,
  scope,
  onScope,
  season,
  tab,
  night,
}: {
  slug: string;
  meta: CloudEvent;
  scope: string;
  onScope: (scope: string) => void;
  /** The season whose nights the Night matchup screen reads. */
  season: TrackerSeason | null;
  /** Pin the panel to one tab — the rail is the navigation for that screen. */
  tab?: 'nights';
  night?: string;
}) {
  const seasons = meta.seasons ?? [];

  const trackerMapStats = useMemo(() => {
    if (!meta.mapStats) return undefined;
    return scope === OVERALL_SCOPE
      ? meta.mapStats.overall
      : meta.mapStats.bySeason?.[scope] ?? meta.mapStats.overall;
  }, [meta.mapStats, scope]);

  return (
    <StatsArea
      repo={cloudStatsRepo}
      eventId={slug}
      eventName={meta.name}
      registryUnits={meta.registryUnits ?? []}
      seasons={seasons}
      seasonScope={scope}
      onSeasonScope={onScope}
      trackerMapStats={trackerMapStats}
      weeks={(season?.weeks ?? []).map((w) => ({ ...w, id: String(w.id) }))}
      pointSystem={season?.pointSystem}
      tokenUnits={tokenUnitsOf(season)}
      tab={tab}
      night={night}
      readOnly
    />
  );
}

/** A bare page for the states where there is nothing to draw yet. */
function Waiting({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="app solo">
      <div className="main">
        <div className="body">
          <div className="panel">
            <div className="pb">
              <p className="note">{message}</p>
              {hint && <p className="note" style={{ marginTop: 5 }}>{hint}</p>}
              <a className="gh" style={{ marginTop: 11 }} href={hrefFor({ kind: 'directory' })}>
                <ArrowLeft className="w-3 h-3" /> Every event
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
