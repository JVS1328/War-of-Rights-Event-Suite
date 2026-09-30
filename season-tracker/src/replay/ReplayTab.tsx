/**
 * A round's replay, on the round screen. Loaded on its own chunk (RoundScreen
 * imports this lazily), so visitors who never open a replay never download the
 * viewer or the map art.
 */
import { useEffect, useMemo, useState } from 'react';
import ReplayViewer from './ReplayViewer';
import { downloadReplay, viewerPropsFor } from './replayStore';
import type { StoredScoreboard } from '../stats/StatsRepository';
import type { RegimentResolver } from '../stats/regimentMatcher';

type Loaded = Awaited<ReturnType<typeof downloadReplay>>;

export default function ReplayTab({ stored, resolveRegiment }: {
  stored: StoredScoreboard;
  resolveRegiment?: RegimentResolver;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    downloadReplay(stored.eventId, stored.id)
      .then((r) => { if (alive) setLoaded(r); })
      .catch((err) => { if (alive) setProblem(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
  }, [stored.eventId, stored.id]);

  const props = useMemo(() => viewerPropsFor(stored.scoreboard), [stored.scoreboard]);

  if (problem) return <div className="pb"><p className="note"><strong>The replay would not load: {problem}</strong></p></div>;
  if (!loaded) return <div className="pb"><p className="note">Loading the replay…</p></div>;
  return (
    <div className="pb replay-viewer">
      <ReplayViewer
        replay={loaded.replay}
        arty={loaded.arty}
        kills={props.kills}
        finalCasualties={props.finalCasualties}
        scoreboard={props.scoreboard}
        roundEndT={props.roundEndT}
        resolveRegiment={resolveRegiment}
      />
    </div>
  );
}
