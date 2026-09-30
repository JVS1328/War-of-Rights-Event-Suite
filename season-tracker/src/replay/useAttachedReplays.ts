import { useEffect, useState } from 'react';
import { cloudStatsRepo } from '../stats/repo';

/** Where a round's replay is stored: the database event, and the round in it. */
export interface ReplayRef {
  slug: string;
  id: string;
}

/**
 * The replays attached to a published event's rounds, by round filename.
 *
 * Replays live only in the database, while the tracker reads its rounds out of
 * this browser — so the tracker's round screen finds a round's replay here, by
 * the filename both copies of the round share. Read fresh on every mount, so a
 * replay attached on the Publish screen is there the next time a round is
 * opened. No slug (the event was never published) is no replays.
 */
export function useAttachedReplays(slug?: string): Map<string, ReplayRef> {
  const [attached, setAttached] = useState<Map<string, ReplayRef>>(new Map());
  useEffect(() => {
    if (!slug) return setAttached(new Map());
    let alive = true;
    cloudStatsRepo.listScoreboards({ eventId: slug })
      .then((rounds) => {
        if (!alive) return;
        setAttached(new Map(rounds
          .filter((r) => r.hasReplay)
          .map((r) => [r.sourceFilename, { slug, id: r.id }])));
      })
      // Offline, or the event is gone: the round screen simply offers no replay.
      .catch(() => { if (alive) setAttached(new Map()); });
    return () => { alive = false; };
  }, [slug]);
  return attached;
}
