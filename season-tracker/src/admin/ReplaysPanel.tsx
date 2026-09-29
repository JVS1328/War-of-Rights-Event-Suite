import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { cloudStatsRepo } from '../stats/repo';
import type { ScoreboardSummary } from '../stats/StatsRepository';
import {
  detachReplay, matchUploads, packReplay, readReplayFiles, uploadReplay,
} from '../replay/replayStore';
import type { ParsedUpload } from '../replay/replayStore';

/**
 * Replays for a published event's rounds.
 *
 * Replays live only in the database — the tracker in this browser never holds
 * one — so they are attached here, against the rounds already uploaded, and
 * are visible on the site exactly when their round is. Pick a batch (each
 * replay_<stamp>.csv with its _arty.csv, if any) and every replay is placed on
 * the round that started when it did; a round can also be given one by hand.
 */
export function ReplaysPanel({ slug }: { slug: string }) {
  const [rounds, setRounds] = useState<ScoreboardSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const batchInput = useRef<HTMLInputElement>(null);
  const oneInput = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRounds(await cloudStatsRepo.listScoreboards({ eventId: slug }));
    } catch {
      setRounds([]);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  // A read of a published event may come from a cache for a few seconds, so
  // the table follows what was just done rather than re-reading it.
  const mark = (id: string, hasReplay: boolean) =>
    setRounds((rs) => rs.map((r) => (r.id === id ? { ...r, hasReplay } : r)));

  const run = async (job: () => Promise<string>) => {
    setMessage(null);
    setProblem(null);
    try {
      setMessage(await job());
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
    cloudStatsRepo.invalidate(slug);
  };

  const put = async (u: ParsedUpload, id: string) => {
    await uploadReplay(slug, id, packReplay(u.replay, u.arty));
    mark(id, true);
  };

  const attachBatch = (files: File[]) =>
    run(async () => {
      setBusy('Reading files');
      const { uploads, skipped } = await readReplayFiles(files);
      const placed = matchUploads(uploads, rounds);
      const unplaced = uploads.filter((_, i) => !placed[i]).map((u) => u.filename);
      let done = 0;
      for (const [i, u] of uploads.entries()) {
        const id = placed[i];
        if (!id) continue;
        setBusy(`Uploading ${done + 1} of ${placed.filter(Boolean).length}`);
        await put(u, id);
        done += 1;
      }
      const notes = [
        `${done} replay${done === 1 ? '' : 's'} attached.`,
        unplaced.length ? ` No round started when ${unplaced.join(', ')} did — attach ${unplaced.length === 1 ? 'it' : 'those'} by hand.` : '',
        skipped.length ? ` Not a replay: ${skipped.join(', ')}.` : '',
      ];
      return notes.join('');
    });

  const attachOne = (id: string, files: File[]) =>
    run(async () => {
      setBusy('Uploading');
      const { uploads } = await readReplayFiles(files);
      if (uploads.length !== 1) throw new Error('Pick one replay CSV (and its _arty.csv, if there is one).');
      await put(uploads[0], id);
      return `Replay attached to ${rounds.find((r) => r.id === id)?.sourceFilename ?? 'the round'}.`;
    });

  const remove = (r: ScoreboardSummary) =>
    run(async () => {
      setBusy('Removing');
      await detachReplay(slug, r.id);
      mark(r.id, false);
      return `Replay removed from ${r.sourceFilename}.`;
    });

  const withReplay = rounds.filter((r) => r.hasReplay).length;
  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    return files;
  };

  return (
    <div className="panel" style={{ marginTop: 13 }}>
      <header className="ph">
        <h2>Replays</h2>
        <span className="rule" />
        <span className="meta">{withReplay} of {rounds.length} rounds have one</span>
      </header>
      <div className="pb">
        <p className="note">
          A replay goes on a round already in the database, and shows on the site as that round's Replay tab.
          Pick a night's worth at once — each replay CSV with its _arty.csv — and each lands on the round
          that started when it did.
        </p>
        <input
          ref={batchInput} type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }}
          onChange={(e) => { const f = picked(e); if (f.length) void attachBatch(f); }}
        />
        <input
          ref={oneInput} type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }}
          onChange={(e) => { const f = picked(e); if (f.length && target) void attachOne(target, f); }}
        />
        <div className="ctl" style={{ marginTop: 9 }}>
          <button className="gh" onClick={() => batchInput.current?.click()} disabled={!!busy || !rounds.length}>
            <Upload className="w-3 h-3" /> Attach replays
          </button>
          {busy && <span className="meta">{busy}…</span>}
        </div>
        {message && <p className="note" style={{ marginTop: 9 }}>{message}</p>}
        {problem && <p className="note" style={{ marginTop: 9 }}><strong>{problem}</strong></p>}
      </div>
      <div className="pb flush scroll-x">
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Map</th>
              <th>Winner</th>
              <th>Replay</th>
              <th className="num" />
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  {r.recordedAt ? `${r.recordedAt.slice(0, 10)} ${r.recordedAt.slice(11, 16)}` : r.sourceFilename}
                </td>
                <td className="wor-name">{r.map}{r.area ? ` · ${r.area}` : ''}</td>
                <td>{r.winner ?? '—'}</td>
                <td>{r.hasReplay ? 'Attached' : '—'}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="gh" disabled={!!busy}
                    onClick={() => { setTarget(r.id); oneInput.current?.click(); }}
                  >
                    {r.hasReplay ? 'Replace' : 'Attach'}
                  </button>
                  {r.hasReplay && (
                    <button
                      className="gh c-danger" style={{ marginLeft: 5 }} disabled={!!busy}
                      onClick={() => { if (window.confirm(`Remove the replay from ${r.sourceFilename}?`)) void remove(r); }}
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rounds.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--ink-3)' }}>No rounds in the database under this short name yet — publish first.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
