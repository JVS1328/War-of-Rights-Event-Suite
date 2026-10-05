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
import { apiGet } from '../cloud/api';

type Loaded = Awaited<ReturnType<typeof downloadReplay>>;

export default function ReplayTab({ replay, scoreboard, resolveRegiment }: {
  /** Where the replay is stored — not always where the round was read from. */
  replay: ReplayRef;
  scoreboard: Scoreboard;
  resolveRegiment?: RegimentResolver;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The events' own win model, which trains itself on season rounds (api/_lib/roundModel.js).
  // Without it the replay still plays; the Analysis panel just has no win chance.
  const [model, setModel] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    apiGet<{ model: unknown }>('/round-model')
      .then((r) => { if (alive) setModel(r.model); })
      .catch(() => { /* no model: nothing to show, nothing to report */ });
    return () => { alive = false; };
  }, []);

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
        events={loaded.events}
        kills={props.kills}
        finalCasualties={props.finalCasualties}
        scoreboard={props.scoreboard}
        roundEndT={props.roundEndT}
        resolveRegiment={resolveRegiment}
        model={model}
      />
    </div>
  );
}
