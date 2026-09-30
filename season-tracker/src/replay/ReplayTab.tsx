/**
 * A round's replay, on the round screen. Loaded on its own chunk (RoundScreen
 * imports this lazily), so visitors who never open a replay never download the
 * viewer or the map art.
 */
import { useEffect, useMemo, useState } from 'react';
import ReplayViewer from './ReplayViewer';
import { downloadReplay, viewerPropsFor } from './replayStore';
import type { ReplayRef } from './useAttachedReplays';
import type { Scoreboard } from '../stats/types';
import type { RegimentResolver } from '../stats/regimentMatcher';

type Loaded = Awaited<ReturnType<typeof downloadReplay>>;

export default function ReplayTab({ replay, scoreboard, resolveRegiment }: {
  /** Where the replay is stored — not always where the round was read from. */
  replay: ReplayRef;
  scoreboard: Scoreboard;
  resolveRegiment?: RegimentResolver;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    downloadReplay(replay.slug, replay.id)
      .then((r) => { if (alive) setLoaded(r); })
      .catch((err) => { if (alive) setProblem(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
  }, [replay.slug, replay.id]);

  const props = useMemo(() => viewerPropsFor(scoreboard), [scoreboard]);

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
