import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, X, Film, Trophy, Users, MapPin, Paperclip, Trash2,
  AlertTriangle, Pencil, Check,
  Activity, Navigation, Flag, Swords, Flame, Share2, FileDown, Sun, Moon,
} from 'lucide-react';
import { useTheme } from './utils/useTheme';
import { parseReplayCsv, looksLikeReplayCsv, timestampFromFilename } from './utils/replayParser';
import { encodeReplay, decodeReplay } from './utils/replayCodec';
import { putReplay, getReplay, deleteReplay, computeReplayId } from './utils/replayStore';
import { parseScoreboardCsv, looksLikeScoreboardCsv } from './scoreboard/parseScoreboard';
import { parseArtyCsv, looksLikeArtyCsv, replayFilenameForArty } from './utils/artyParser';
import {
  loadEvent, saveEvent, newEvent, makeRound, upsertRound,
  matchScoreboardsToRounds, scoreboardStartSec,
} from './event/eventStore';
import ReplayViewer from './ReplayViewer';
import AttritionTimeline from './components/afteraction/AttritionTimeline';
import MovementFrontline from './components/afteraction/MovementFrontline';
import Leadership from './components/afteraction/Leadership';
import Engagement from './components/afteraction/Engagement';
import Heatmap from './components/afteraction/Heatmap';
import { createEventShareUrl } from './share/shareEvent';
import { computeEventStats } from './analytics/eventStats';

const TEAM_NAME = { 1: 'USA', 2: 'CSA', USA: 'USA', CSA: 'CSA' };

// Display a raw winner field (team code or name) as USA/CSA/—.
function winnerLabel(w) {
  if (w == null || w === '') return null;
  return TEAM_NAME[w] || String(w);
}

// ms epoch → local HH:MM (round start clock, for the round list).
function clockLabel(ts) {
  if (ts == null) return null;
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// The round an arty CSV belongs to: its replay by filename (replay_X_arty.csv
// sits next to replay_X.csv), else the round whose filename timestamp matches.
function roundForArty(rounds, artyName) {
  const replayName = replayFilenameForArty(artyName);
  const byName = rounds.find((r) => r.filename === replayName);
  if (byName) return byName;
  const d = timestampFromFilename(artyName);
  if (!d) return null;
  return rounds.find((r) => r.ts != null && Math.abs(r.ts - d.getTime()) <= 2000) || null;
}

// Immutably patch one round inside an event.
function updateRound(event, roundId, patch) {
  return { ...event, rounds: event.rounds.map(r => (r.id === roundId ? { ...r, ...patch } : r)) };
}

export default function ReplaySuite({ initialEvent = null, initialReplays = null }) {
  const [event, setEvent] = useState(null);
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  const [replays, setReplays] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);       // { kind: 'error' | 'info', text }
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  const fileInputRef = useRef(null);
  const scoreboardInputRef = useRef(null);
  const artyInputRef = useRef(null);

  // --- boot: hydrate from a shared event if one was passed, else load the
  // persisted event (or a fresh one) ---
  useEffect(() => {
    if (initialEvent) {
      setEvent(initialEvent);
      saveEvent(initialEvent);
      if (initialReplays && initialReplays.size) {
        setReplays(new Map(initialReplays));
        (async () => {
          for (const [id, replay] of initialReplays) {
            try { await putReplay(id, encodeReplay(replay)); } catch { /* best effort */ }
          }
        })();
      }
      if (initialEvent.rounds.length) setSelectedRoundId(initialEvent.rounds[0].id);
      return;
    }
    const evt = loadEvent() || newEvent();
    setEvent(evt);
    if (evt.rounds.length) setSelectedRoundId(evt.rounds[0].id);
  }, [initialEvent, initialReplays]);

  // --- persist event on change ---
  useEffect(() => {
    if (event) saveEvent(event);
  }, [event]);

  // --- rehydrate replay payloads from IndexedDB for any round missing one ---
  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    const missing = event.rounds.map(r => r.replayId).filter(id => id && !replays.has(id));
    if (missing.length === 0) return;
    (async () => {
      const loaded = new Map();
      for (const id of missing) {
        try {
          const buf = await getReplay(id);
          if (buf) loaded.set(id, decodeReplay(buf));
        } catch (err) {
          console.warn('Failed to load replay from IDB', id, err);
        }
      }
      if (cancelled || loaded.size === 0) return;
      setReplays(prev => {
        const next = new Map(prev);
        for (const [id, replay] of loaded) next.set(id, replay);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [event, replays]);

  const selectedRound = event?.rounds.find(r => r.id === selectedRoundId) || null;

  // --- ingest uploaded files: route replay vs scoreboard, persist, attach ---
  const ingestFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter(f => /\.csv$/i.test(f.name));
    if (files.length === 0) {
      setNotice({ kind: 'error', text: 'Please upload replay, scoreboard or arty .csv files.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const texts = await Promise.all(files.map(async f => ({ name: f.name, text: await f.text() })));
      const replayFiles = [];
      const scoreboardFiles = [];
      const artyFiles = [];
      for (const t of texts) {
        if (looksLikeReplayCsv(t.text)) replayFiles.push(t);
        else if (looksLikeScoreboardCsv(t.text)) scoreboardFiles.push(t);
        else if (looksLikeArtyCsv(t.text)) artyFiles.push(t);
      }
      if (replayFiles.length === 0 && scoreboardFiles.length === 0 && artyFiles.length === 0) {
        setNotice({ kind: 'error', text: 'No replay, scoreboard or arty CSVs recognized in that upload.' });
        return;
      }

      let nextEvent = event || newEvent();
      const nextReplays = new Map(replays);
      let firstNewRoundId = null;

      // Replays → rounds (deduped by replayId; preserves an existing round's
      // attached scoreboard if the same replay is re-uploaded).
      for (const rf of replayFiles) {
        let parsed;
        try { parsed = parseReplayCsv(rf.text); }
        catch (err) { console.warn('Replay parse failed for', rf.name, err); continue; }
        if (!parsed) continue;
        const id = computeReplayId(rf.name, parsed.meta.sampleCount, parsed.frameCount);
        try { await putReplay(id, encodeReplay(parsed)); }
        catch (err) { console.warn('Failed to persist replay to IDB', err); }
        nextReplays.set(id, parsed);
        const round = makeRound(id, rf.name, parsed, timestampFromFilename);
        const existing = nextEvent.rounds.find(r => r.id === id);
        if (existing) {
          round.scoreboard = existing.scoreboard;
          round.scoreboardFilename = existing.scoreboardFilename;
          round.arty = existing.arty || null;
          round.artyFilename = existing.artyFilename || null;
        }
        nextEvent = upsertRound(nextEvent, round);
        if (!firstNewRoundId) firstNewRoundId = id;
      }

      // Scoreboards → auto-attach to replay rounds as a single 1:1 batch. Doing
      // the whole batch at once (rather than one nearest-match per file) is what
      // stops two scoreboards from collapsing onto the same round.
      const unmatched = [];
      const parsedScoreboards = [];
      for (const sf of scoreboardFiles) {
        const sb = parseScoreboardCsv(sf.text);
        if (!sb) { unmatched.push(sf.name); continue; }
        const d = timestampFromFilename(sf.name);
        parsedScoreboards.push({
          name: sf.name,
          sb,
          ts: d ? d.getTime() : null,
          startSec: scoreboardStartSec(sb),
        });
      }
      const roundInfos = nextEvent.rounds.map(r => ({
        id: r.id,
        ts: r.ts,
        startSec: r.meta?.roundStartSec ?? null,
        hasScoreboard: !!r.scoreboard,
      }));
      const { assignments } = matchScoreboardsToRounds(roundInfos, parsedScoreboards);
      parsedScoreboards.forEach((ps, idx) => {
        const roundId = assignments[idx];
        if (roundId) {
          nextEvent = updateRound(nextEvent, roundId, { scoreboard: ps.sb, scoreboardFilename: ps.name });
        } else {
          unmatched.push(ps.name);
        }
      });

      // Arty CSVs → their replay's round, by filename (then timestamp).
      for (const af of artyFiles) {
        const arty = parseArtyCsv(af.text);
        const round = arty && roundForArty(nextEvent.rounds, af.name);
        if (round) nextEvent = updateRound(nextEvent, round.id, { arty, artyFilename: af.name });
        else unmatched.push(af.name);
      }

      setReplays(nextReplays);
      setEvent(nextEvent);
      const selectId = firstNewRoundId || (nextEvent.rounds[0] && nextEvent.rounds[0].id);
      if (selectId && !selectedRoundId) setSelectedRoundId(selectId);

      if (unmatched.length) {
        setNotice({
          kind: 'info',
          text: `Added ${replayFiles.length} replay(s). ${unmatched.length} file(s) had no matching replay — attach them from a round: ${unmatched.join(', ')}.`,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [event, replays, selectedRoundId]);

  const onFileInput = (e) => {
    if (e.target.files?.length) ingestFiles(e.target.files);
    e.target.value = '';
  };

  const onAttachScoreboard = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedRound) return;
    const text = await file.text();
    const sb = parseScoreboardCsv(text);
    if (!sb) {
      setNotice({ kind: 'error', text: `"${file.name}" isn't a recognizable scoreboard CSV.` });
      return;
    }
    setEvent(ev => updateRound(ev, selectedRound.id, { scoreboard: sb, scoreboardFilename: file.name }));
  };

  const onAttachArty = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedRound) return;
    const arty = parseArtyCsv(await file.text());
    if (!arty) {
      setNotice({ kind: 'error', text: `"${file.name}" isn't an arty CSV (replay_…_arty.csv).` });
      return;
    }
    setEvent(ev => updateRound(ev, selectedRound.id, { arty, artyFilename: file.name }));
  };

  const detachArty = (roundId) => {
    setEvent(ev => updateRound(ev, roundId, { arty: null, artyFilename: null }));
  };

  const detachScoreboard = (roundId) => {
    setEvent(ev => updateRound(ev, roundId, { scoreboard: null, scoreboardFilename: null }));
  };

  const removeRound = async (roundId) => {
    const round = event.rounds.find(r => r.id === roundId);
    if (!round) return;
    const rounds = event.rounds.filter(r => r.id !== roundId);
    setEvent({ ...event, rounds });
    // Replay id == round id here, so nothing else references it — drop from IDB.
    try { await deleteReplay(round.replayId); } catch { /* best effort */ }
    setReplays(prev => { const next = new Map(prev); next.delete(round.replayId); return next; });
    if (selectedRoundId === roundId) setSelectedRoundId(rounds[0]?.id || null);
  };

  const commitName = () => {
    const name = nameDraft.trim() || 'Untitled Event';
    setEvent(ev => ({ ...ev, name }));
    setEditingName(false);
  };

  const handleShare = async () => {
    if (!event.rounds.length) return;
    setBusy(true);
    setNotice(null);
    try {
      // Yield once so the button's busy state paints before the encode runs.
      await new Promise((r) => setTimeout(r, 0));
      const { url, stride } = await createEventShareUrl(event, replays);
      const note = stride > 1
        ? ` Shared playback was thinned to 1 in every ${stride} frames so the link fits — your local copy is untouched.`
        : '';
      try {
        await navigator.clipboard.writeText(url);
        setNotice({ kind: 'info', text: `Share link copied to clipboard.${note}` });
      } catch {
        setNotice({ kind: 'info', text: url });
      }
    } catch (err) {
      console.error('Share failed', err);
      setNotice({ kind: 'error', text: 'Could not build a share link — see console.' });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!event.rounds.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const stats = computeEventStats(event.rounds, replays);
      // Lazy-load the PDF generator so @react-pdf stays out of the main bundle.
      const { generateEventReportPDF } = await import('./export/eventReport');
      await generateEventReportPDF({ event, stats });
    } catch (err) {
      console.error('Report export failed', err);
      setNotice({ kind: 'error', text: 'Report export failed — see console.' });
    } finally {
      setBusy(false);
    }
  };

  // --- drag & drop over the whole surface ---
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files);
  };

  if (!event) return null;

  const hasRounds = event.rounds.length > 0;

  return (
    <div
      className="min-h-screen bg-app text-text"
      onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
    >
      {/* header */}
      <header className="border-b border-border bg-app/85 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-3">
          <h1 className="text-[13px] font-semibold leading-none shrink-0 flex items-center gap-2">
            <img src="assets/icons/impact.png" alt="" className="w-4 h-4" />
            WoR <span className="text-muted font-normal">After Action</span>
          </h1>

          <span className="text-border-strong select-none">/</span>

          {editingName ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                className="px-2 py-1 text-sm inset text-text focus:outline-none focus:border-accent"
              />
              <button onClick={commitName} className="btn-bare p-1 text-accent" title="Save"><Check className="w-4 h-4" /></button>
            </span>
          ) : (
            <button
              onClick={() => { setNameDraft(event.name); setEditingName(true); }}
              className="group flex items-center gap-1.5 text-sm text-muted hover:text-text transition min-w-0"
              title="Rename event"
            >
              <span className="truncate wor-name">{event.name}</span>
              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0" />
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {hasRounds && (
              <>
                <button onClick={handleExport} disabled={busy} className="btn btn-ghost" title="Download an after-action report (PDF)">
                  <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Report</span>
                </button>
                <button onClick={handleShare} disabled={busy} className="btn btn-ghost" title="Copy a share link for this event">
                  <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">Share</span>
                </button>
              </>
            )}
            <button onClick={toggleTheme} className="btn btn-ghost !px-2" title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn btn-primary">
              <Upload className="w-4 h-4" /> {busy ? 'Loading…' : 'Add replays'}
            </button>
          </div>
        </div>
        {notice && (
          <div className={`max-w-[1400px] mx-auto px-4 pb-2 -mt-1 text-xs flex items-start gap-1.5 ${notice.kind === 'error' ? 'text-csa' : 'text-accent'}`}>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="break-all">{notice.text}</span>
            <button onClick={() => setNotice(null)} className="ml-auto text-faint hover:text-text shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        multiple
        onChange={onFileInput}
        className="hidden"
      />

      {!hasRounds ? (
        <EmptyState onPick={() => fileInputRef.current?.click()} busy={busy} dragOver={dragOver} />
      ) : (
        <div className="max-w-[1400px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* round list */}
          <aside className="space-y-1.5">
            <div className="label px-1 mb-1.5">Rounds · {event.rounds.length}</div>
            {event.rounds.map((r, i) => (
              <RoundListItem
                key={r.id}
                round={r}
                index={i}
                selected={r.id === selectedRoundId}
                onSelect={() => setSelectedRoundId(r.id)}
              />
            ))}
          </aside>

          {/* selected round */}
          <main>
            {selectedRound ? (
              <RoundView
                round={selectedRound}
                replay={replays.get(selectedRound.replayId)}
                onAttachScoreboard={() => scoreboardInputRef.current?.click()}
                onDetachScoreboard={() => detachScoreboard(selectedRound.id)}
                onAttachArty={() => artyInputRef.current?.click()}
                onDetachArty={() => detachArty(selectedRound.id)}
                onRemove={() => removeRound(selectedRound.id)}
              />
            ) : (
              <div className="text-faint text-sm p-8 text-center">Select a round.</div>
            )}
          </main>
        </div>
      )}

      <input
        ref={scoreboardInputRef}
        type="file"
        accept=".csv"
        onChange={onAttachScoreboard}
        className="hidden"
      />
      <input
        ref={artyInputRef}
        type="file"
        accept=".csv"
        onChange={onAttachArty}
        className="hidden"
      />

      {dragOver && (
        <div className="fixed inset-0 z-50 bg-app/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="card px-8 py-6 border-dashed border-accent flex items-center gap-3 text-accent text-lg font-semibold shadow-xl">
            <Upload className="w-6 h-6" /> Drop replay / scoreboard / arty CSVs
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onPick, busy, dragOver }) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-20 flex flex-col items-center">
      <button
        onClick={onPick}
        disabled={busy}
        className={`group w-full max-w-2xl rounded-2xl border border-dashed p-14 text-center transition ${
          dragOver ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong bg-surface'
        }`}
      >
        <span className="grid place-items-center w-14 h-14 rounded-xl bg-accent-soft text-accent mx-auto mb-5">
          <Film className="w-7 h-7" />
        </span>
        <div className="text-lg font-semibold mb-1.5 uppercase tracking-wide">Drop your War of Rights replays</div>
        <div className="sans text-sm text-muted mb-6 max-w-md mx-auto leading-relaxed">
          Build an after-action from a night of rounds. Each replay CSV becomes a round;
          drop the matching scoreboard and <span className="font-mono">_arty</span> CSVs alongside
          to add kills, casualties, impacts and guns.
        </div>
        <span className="btn btn-primary">
          <Upload className="w-4 h-4" /> {busy ? 'Loading…' : 'Choose CSV files'}
        </span>
        <div className="text-xs text-faint mt-5">
          Replay CSVs are the spine · scoreboards and arty are optional
        </div>
      </button>
    </div>
  );
}

function RoundListItem({ round, index, selected, onSelect }) {
  const win = winnerLabel(round.meta.winner);
  const clock = clockLabel(round.ts);
  return (
    <button
      onClick={onSelect}
      className={`relative w-full text-left rounded-lg px-3 py-2.5 border transition ${
        selected ? 'bg-surface border-border-strong' : 'border-transparent hover:bg-surface'
      }`}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}
      <div className="flex items-center gap-2">
        <span className="text-xs text-faint tabular-nums w-4 shrink-0">{index + 1}</span>
        <span className={`text-sm truncate flex-1 wor-name ${selected ? 'font-medium text-text' : 'text-muted'}`}>{round.meta.map || 'Unknown map'}</span>
        {round.scoreboard && <Paperclip className="w-3 h-3 text-accent shrink-0" title="Scoreboard attached" />}
        {round.arty && <img src="assets/icons/impact.png" alt="Arty attached" title="Arty attached" className="w-3 h-3 shrink-0" />}
      </div>
      <div className="flex items-center gap-2 mt-1 text-[11px] text-faint pl-6">
        {round.meta.area && <span className="truncate wor-name">{round.meta.area}</span>}
        {clock && <span className="tabular-nums">{clock}</span>}
        {win && (
          <span className="flex items-center gap-0.5 ml-auto">
            <Trophy className="w-3 h-3 text-accent" />{win}
          </span>
        )}
      </div>
    </button>
  );
}

const ROUND_TABS = [
  { key: 'playback', label: 'Playback', icon: Film },
  { key: 'attrition', label: 'Attrition', icon: Activity },
  { key: 'movement', label: 'Movement', icon: Navigation },
  { key: 'leadership', label: 'Flags & Officers', icon: Flag },
  { key: 'engagement', label: 'Engagement', icon: Swords },
  { key: 'heatmap', label: 'Heatmap', icon: Flame },
];

function RoundView({ round, replay, onAttachScoreboard, onDetachScoreboard, onAttachArty, onDetachArty, onRemove }) {
  const meta = round.meta;
  const win = winnerLabel(meta.winner);
  const sb = round.scoreboard;
  const finalCasualties = sb?.metadata
    ? { usa: sb.metadata.casualties_usa, csa: sb.metadata.casualties_csa }
    : null;

  // Reset to Playback when switching rounds so a tab never renders against the
  // wrong replay for a frame.
  const [tab, setTab] = useState('playback');
  useEffect(() => { setTab('playback'); }, [round.id]);

  return (
    <div className="space-y-3">
      {/* round header */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-soft text-accent shrink-0">
          <MapPin className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-[15px] truncate wor-name">{meta.map || 'Unknown map'}</div>
          <div className="text-xs text-muted flex items-center gap-2 flex-wrap mt-0.5">
            {meta.area && <span className="wor-name">{meta.area}</span>}
            {meta.mode && <span className="text-faint">· {meta.mode}</span>}
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{meta.playerCount}</span>
            {win && <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-accent" />{win}</span>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {sb ? (
            <button onClick={onDetachScoreboard} className="btn btn-ghost !py-1" title={`Scoreboard: ${round.scoreboardFilename}`}>
              <Paperclip className="w-3.5 h-3.5 text-accent" /> Scoreboard <X className="w-3 h-3" />
            </button>
          ) : (
            <button onClick={onAttachScoreboard} className="btn btn-ghost !py-1" title="Attach a scoreboard CSV for kills & casualties">
              <Paperclip className="w-3.5 h-3.5" /> Attach scoreboard
            </button>
          )}
          {round.arty ? (
            <button onClick={onDetachArty} className="btn btn-ghost !py-1" title={`Arty: ${round.artyFilename}`}>
              <img src="assets/icons/impact.png" alt="" className="w-3.5 h-3.5" /> Arty <X className="w-3 h-3" />
            </button>
          ) : (
            <button onClick={onAttachArty} className="btn btn-ghost !py-1" title="Attach the round's _arty.csv for impacts, guns & caissons">
              <img src="assets/icons/impact.png" alt="" className="w-3.5 h-3.5 opacity-70" /> Attach arty
            </button>
          )}
          <button onClick={onRemove} className="btn-bare p-1.5 hover:text-csa" title="Remove round">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!replay ? (
        <div className="card p-12 text-center text-muted text-sm">
          Loading replay from cache…
        </div>
      ) : (
        <>
          {/* tab bar */}
          <div className="flex items-center gap-1 flex-wrap border-b border-border">
            {ROUND_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`tab ${tab === t.key ? 'tab-active' : ''}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>

          {/* tab content */}
          {tab === 'playback' && (
            <ReplayViewer replay={replay} kills={sb?.kills || null} finalCasualties={finalCasualties} scoreboard={sb || null} arty={round.arty || null} />
          )}
          {tab === 'attrition' && <AttritionTimeline replay={replay} scoreboard={sb} />}
          {tab === 'movement' && <MovementFrontline replay={replay} />}
          {tab === 'leadership' && <Leadership replay={replay} />}
          {tab === 'engagement' && <Engagement replay={replay} />}
          {tab === 'heatmap' && <Heatmap replay={replay} scoreboard={sb} />}
        </>
      )}
    </div>
  );
}
