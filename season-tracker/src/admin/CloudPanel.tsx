import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Upload, Trash2, RefreshCw } from 'lucide-react';
import { slugify, isSlug } from './slugClient';
import { listEvents, deleteEvent, saveEvent } from '../cloud/events';
import type { CloudEvent } from '../cloud/events';
import { eventFromExport, publishEvent, pullEventStats, pullTrackerEvent } from '../cloud/publish';
import type { TrackerEvent } from '../cloud/publish';
import { cloudStatsRepo } from '../stats/repo';
import { ReplaysPanel } from './ReplaysPanel';
import { clearAdminToken } from '../cloud/session';
import { hrefFor } from '../cloud/route';
import type { StatsBundle } from '../stats/statsBundle';
import type { TrackerMapStats } from '../stats/statsEngine';

export interface CloudPanelProps {
  /** The event open in the tracker. */
  event: TrackerEvent;
  /** The slug it publishes under, remembered on the event itself. */
  slug: string;
  onSlug: (slug: string) => void;
  /** Build the active event's stats bundle out of IndexedDB. */
  buildStats: () => Promise<StatsBundle | null>;
  /** Map win/loss tallies the tracker computes; carried so the site matches. */
  mapStats: () => { overall?: TrackerMapStats; bySeason?: Record<string, TrackerMapStats> };
  /** Bring an event down from the database into the tracker. */
  onPulled: (event: TrackerEvent) => void;
}

type Busy = null | { what: string; done?: number; total?: number };

/** Name the rounds the database would not take, rather than quietly dropping them. */
const describeFailures = (failed: { sourceFilename: string; reason: string }[]): string => {
  if (!failed.length) return '';
  const names = failed.slice(0, 3).map((f) => f.sourceFilename).join(', ');
  const rest = failed.length > 3 ? ` and ${failed.length - 3} more` : '';
  return ` ${failed.length} round${failed.length === 1 ? '' : 's'} would not go up (${names}${rest}) — ${failed[0].reason}`;
};

/**
 * Publish to the site.
 *
 * The tracker still works entirely offline — the season lives in this browser
 * and nothing here is required to run one. What this screen does is copy an
 * event up to the database so the public site can read it, bring one back down
 * on a new machine, and take an exported file straight into the database
 * without opening it in the tracker first.
 */
export function CloudPanel({ event, slug, onSlug, buildStats, mapStats, onPulled }: CloudPanelProps) {
  const [draft, setDraft] = useState(slug || slugify(event.name));
  const [name, setName] = useState(event.name);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Follow the tracker: switching events in the crumb re-seeds the slug field.
  useEffect(() => {
    setDraft(slug || slugify(event.name));
    setName(event.name);
  }, [slug, event.name]);

  const refresh = useCallback(async () => {
    try {
      setEvents(await listEvents());
    } catch {
      setEvents([]); // The list is a convenience; a failure here blocks nothing.
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (what: string, job: (report: (done: number, total: number) => void) => Promise<string>) => {
    setBusy({ what });
    setMessage(null);
    setProblem(null);
    try {
      const said = await job((done, total) => setBusy({ what, done, total }));
      setMessage(said);
      await refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  };

  const publish = (published: boolean) =>
    run(published ? 'Publishing' : 'Saving', async (report) => {
      if (!isSlug(draft)) throw new Error('The short name must be 2–48 characters of a–z, 0–9 and dashes.');
      const stats = await buildStats();
      const result = await publishEvent({
        slug: draft,
        event,
        name,
        stats,
        published,
        mapStats: mapStats(),
        onProgress: report,
      });
      onSlug(draft);
      return `${result.event.name} is ${published ? 'live' : 'saved but unpublished'} — ${result.scoreboards} round${result.scoreboards === 1 ? '' : 's'} uploaded.${describeFailures(result.failed)}`;
    });

  const pull = () =>
    run('Pulling', async (report) => {
      if (!isSlug(draft)) throw new Error('Type the event’s short name first.');
      const pulled = await pullTrackerEvent(draft);
      if (!pulled) throw new Error(`No season is stored under "${draft}".`);
      // Rounds first, under the pulled event's id, so the tracker's screens
      // find them the moment it becomes the active event.
      const rounds = await pullEventStats({ slug: draft, eventId: pulled.id, onProgress: report });
      onPulled(pulled);
      onSlug(draft);
      return `Pulled "${pulled.name}" into the tracker — ${rounds} round${rounds === 1 ? '' : 's'} of player stats.`;
    });

  const importFile = (file: File) =>
    run('Importing', async (report) => {
      if (!isSlug(draft)) throw new Error('Give the event a short name before importing it.');
      const parsed = eventFromExport(JSON.parse(await file.text()));
      const result = await publishEvent({
        slug: draft,
        event: parsed.event,
        name,
        stats: parsed.stats,
        published: true,
        onProgress: report,
      });
      return `Imported "${result.event.name}" from ${file.name} — ${result.scoreboards} round${result.scoreboards === 1 ? '' : 's'}. It is live on the site.${describeFailures(result.failed)}`;
    });

  const togglePublished = (target: CloudEvent) =>
    run(target.published ? 'Unpublishing' : 'Publishing', async () => {
      await saveEvent({ slug: target.slug, published: !target.published });
      return `${target.name} is ${target.published ? 'hidden from the site' : 'live on the site'}.`;
    });

  const remove = (target: CloudEvent) =>
    run('Deleting', async () => {
      await deleteEvent(target.slug);
      cloudStatsRepo.invalidate(target.slug);
      return `${target.name} is gone from the database. Your copy in this browser is untouched.`;
    });

  const publicUrl = `${window.location.origin}${window.location.pathname}${hrefFor({ kind: 'event', slug: draft, screen: 'overview', season: null })}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const linked = events.find((e) => e.slug === draft) ?? null;

  return (
    <>
      <div className="panel">
        <header className="ph">
          <h2>Publish to the site</h2>
          <span className="rule" />
          <span className="meta">{event.name}</span>
        </header>
        <div className="pb">
          <div className="grid-f">
            <div className="fld">
              <label className="cap" htmlFor="cloud-name">Name on the site</label>
              <input
                id="cloud-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={event.name}
              />
              <div className="note">
                How the event is titled for visitors. Old season files carry no name of their own.
              </div>
            </div>
            <div className="fld">
              <label className="cap" htmlFor="cloud-slug">Short name</label>
              <input
                id="cloud-slug"
                value={draft}
                onChange={(e) => setDraft(e.target.value.toLowerCase().trim())}
                placeholder="ssl-season-3"
              />
              <div className="note">
                What someone types on the site to find this event. Lower case, no spaces.
              </div>
            </div>
            <div className="fld">
              <label className="cap">Public link</label>
              <input readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} />
              <div className="note">
                <button className="gh" onClick={copyLink} disabled={!isSlug(draft)}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          </div>

          <div className="ctl" style={{ marginTop: 11 }}>
            <button className="gh live" onClick={() => publish(true)} disabled={!!busy || !name.trim()}>
              <Upload className="w-3 h-3" /> Publish
            </button>
            <button className="gh" onClick={() => publish(false)} disabled={!!busy}>
              Save without publishing
            </button>
            <button className="gh" onClick={pull} disabled={!!busy}>
              <Download className="w-3 h-3" /> Pull into the tracker
            </button>
            <span className="rule" />
            <span className="meta">
              {linked
                ? `${linked.scoreboardCount} round${linked.scoreboardCount === 1 ? '' : 's'} stored · ${linked.published ? 'live' : 'not published'}`
                : 'nothing stored under this name yet'}
            </span>
          </div>

          <p className="note" style={{ marginTop: 9 }}>
            Publishing copies this event's season and every imported round into the database, and
            replaces whatever was there under this short name. Your copy in this browser stays
            where it is — this is a copy up, not a move.
          </p>

          {busy && (
            <p className="note" style={{ marginTop: 9 }}>
              {busy.what}…
              {busy.total ? ` ${busy.done} of ${busy.total} rounds.` : ''}
            </p>
          )}
          {message && <p className="note" style={{ marginTop: 9 }}>{message}</p>}
          {problem && <p className="note" style={{ marginTop: 9 }}><strong>{problem}</strong></p>}
        </div>
      </div>

      {linked && (
        // Re-read when a publish changes how many rounds there are.
        <ReplaysPanel key={`${linked.slug}:${linked.scoreboardCount}`} slug={linked.slug} />
      )}

      <div className="panel" style={{ marginTop: 13 }}>
        <header className="ph">
          <h2>Import a file straight into the database</h2>
          <span className="rule" />
        </header>
        <div className="pb">
          <p className="note">
            An event or season export from the tracker — including an old one — goes up under the
            name and short name above without being opened here first. This is how a season that
            only exists as a file gets onto the site.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file);
            }}
          />
          <button
            className="gh"
            style={{ marginTop: 9 }}
            onClick={() => fileInput.current?.click()}
            disabled={!!busy || !isSlug(draft) || !name.trim()}
          >
            <Upload className="w-3 h-3" /> Choose a JSON export
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 13 }}>
        <header className="ph">
          <h2>In the database</h2>
          <span className="rule" />
          <button className="gh" onClick={refresh} title="Re-read the list">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </header>
        <div className="pb flush scroll-x">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Short name</th>
                <th className="num">Seasons</th>
                <th className="num">Rounds</th>
                <th>On the site</th>
                <th className="num" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.slug}>
                  <td className="wor-name">{e.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{e.slug}</td>
                  <td className="num">{e.seasons?.length ?? 0}</td>
                  <td className="num">{e.scoreboardCount ?? 0}</td>
                  <td>
                    <button className="gh" onClick={() => togglePublished(e)} disabled={!!busy}>
                      {e.published ? 'Live' : 'Hidden'}
                    </button>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="gh" onClick={() => setDraft(e.slug)}>Use</button>
                    <button
                      className="gh c-danger"
                      style={{ marginLeft: 5 }}
                      disabled={!!busy}
                      onClick={() => {
                        if (window.confirm(`Delete "${e.name}" and every round in it from the database? Your copy in this browser is not touched.`)) {
                          void remove(e);
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={6} style={{ color: 'var(--ink-3)' }}>Nothing published yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 13 }}>
        <header className="ph">
          <h2>This browser</h2>
          <span className="rule" />
        </header>
        <div className="pb">
          <p className="note">
            The admin pass is remembered here so you are not asked for it every visit. Forget it if
            this is not your machine.
          </p>
          <button
            className="gh c-danger"
            style={{ marginTop: 9 }}
            onClick={() => { clearAdminToken(); window.location.reload(); }}
          >
            Forget the admin pass
          </button>
        </div>
      </div>
    </>
  );
}
