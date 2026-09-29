import { describe, it, expect } from 'vitest';
import { matchToRounds } from './matchRounds.js';
import { timestampFromFilename } from './replayParser.js';

const ts = (name) => {
  const d = timestampFromFilename(name);
  return d ? d.getTime() : null;
};
// seconds-since-midnight helper for building round/scoreboard start times
const sec = (h, m, s = 0) => h * 3600 + m * 60 + s;

describe('matchToRounds', () => {
  // The regression this whole change exists for. Two rounds, two scoreboards.
  // Replay filenames are stamped at round END, scoreboard filenames at round
  // START, so absolute-nearest-by-filename piled both scoreboards onto round A.
  // Content matching on the real round-start time fixes it 1:1.
  it('does not collapse two scoreboards onto one round (content match)', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_201200.csv'), startSec: sec(20, 0) },
      { id: 'B', ts: ts('replay_20260718_202700.csv'), startSec: sec(20, 13) },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_200000.csv'), startSec: sec(20, 0) },  // round A
      { ts: ts('scoreboard_20260718_201300.csv'), startSec: sec(20, 13) }, // round B
    ];
    const { assignments, unmatched } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'A', 1: 'B' });
    expect(unmatched).toEqual([]);
  });

  // Content match must survive a start-time skew inside tolerance (recording
  // often starts a few seconds after the round clock).
  it('tolerates a small round-start skew between replay and scoreboard', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_201200.csv'), startSec: sec(20, 0, 4) },
      { id: 'B', ts: ts('replay_20260718_202700.csv'), startSec: sec(20, 13, 2) },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_200000.csv'), startSec: sec(20, 0, 0) },
      { ts: ts('scoreboard_20260718_201300.csv'), startSec: sec(20, 13, 0) },
    ];
    const { assignments } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'A', 1: 'B' });
  });

  // Order of the scoreboard array must not matter — content decides.
  it('is order-independent for the scoreboard batch', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_201200.csv'), startSec: sec(20, 0) },
      { id: 'B', ts: ts('replay_20260718_202700.csv'), startSec: sec(20, 13) },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_201300.csv'), startSec: sec(20, 13) }, // B first
      { ts: ts('scoreboard_20260718_200000.csv'), startSec: sec(20, 0) },  // A second
    ];
    const { assignments } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'B', 1: 'A' });
  });

  // Fallback path: older files with no round_start_time. Filename order pairing
  // keeps the batch 1:1 even under a consistent replay↔scoreboard offset.
  it('falls back to filename order-pairing when start times are absent', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_200000.csv'), startSec: null },
      { id: 'B', ts: ts('replay_20260718_201300.csv'), startSec: null },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_201200.csv'), startSec: null }, // A's scoreboard, end-stamped
      { ts: ts('scoreboard_20260718_202700.csv'), startSec: null }, // B's scoreboard, end-stamped
    ];
    const { assignments, unmatched } = matchToRounds(rounds, scoreboards);
    // Each round gets exactly one scoreboard — the two do not merge.
    expect(assignments).toEqual({ 0: 'A', 1: 'B' });
    expect(unmatched).toEqual([]);
    expect(new Set(Object.values(assignments)).size).toBe(2);
  });

  // A content-matchable scoreboard and a legacy one in the same batch: layer 1
  // handles the first, layer 2 pairs the rest.
  it('mixes content match and filename fallback in one batch', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_200000.csv'), startSec: sec(20, 0) },
      { id: 'B', ts: ts('replay_20260718_201300.csv'), startSec: null },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_202700.csv'), startSec: null },     // legacy → B via fallback
      { ts: ts('scoreboard_20260718_200000.csv'), startSec: sec(20, 0) }, // content → A
    ];
    const { assignments } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'B', 1: 'A' });
  });

  // The fuzzy fallback must never overwrite a round that already carries a
  // scoreboard just because it sorts first by filename time.
  it('does not clobber an already-attached round in the fallback', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_200000.csv'), startSec: null, attached: true },
      { id: 'B', ts: ts('replay_20260718_201300.csv'), startSec: null },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_201400.csv'), startSec: null }, // should land on B, not steal A
    ];
    const { assignments } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'B' });
  });

  // Content match may replace the scoreboard on an already-attached round when
  // it is unambiguously the same round (re-upload / correction).
  it('lets a content match replace an existing scoreboard on the same round', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_200000.csv'), startSec: sec(20, 0), attached: true },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_200000.csv'), startSec: sec(20, 0) },
    ];
    const { assignments } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'A' });
  });

  // A different day that happens to share a wall-clock start time must not
  // content-match — the same-session filename window rejects it.
  it('rejects a cross-day content collision via the sanity window', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_200000.csv'), startSec: sec(20, 0) },
    ];
    const scoreboards = [
      // same 20:00 start seconds, but the filename is the next day
      { ts: ts('scoreboard_20260719_200000.csv'), startSec: sec(20, 0) },
    ];
    const { assignments, unmatched } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({});
    expect(unmatched).toEqual([0]);
  });

  // A scoreboard with no round and no usable time is simply reported unmatched.
  it('reports a scoreboard with no matchable round as unmatched', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_200000.csv'), startSec: sec(20, 0) },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_200000.csv'), startSec: sec(20, 0) }, // → A
      { ts: null, startSec: null },                                       // → nothing
    ];
    const { assignments, unmatched } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'A' });
    expect(unmatched).toEqual([1]);
  });

  // Start times either side of midnight are close, not ~24h apart.
  it('handles the midnight wrap for start-time deltas', () => {
    const rounds = [
      { id: 'A', ts: ts('replay_20260718_235900.csv'), startSec: sec(23, 58) },
    ];
    const scoreboards = [
      { ts: ts('scoreboard_20260718_235900.csv'), startSec: sec(0, 0, 30) }, // 00:00:30, 2.5m later
    ];
    const { assignments } = matchToRounds(rounds, scoreboards);
    expect(assignments).toEqual({ 0: 'A' });
  });

  it('returns empty results for an empty scoreboard batch', () => {
    const rounds = [{ id: 'A', ts: 1, startSec: 0 }];
    expect(matchToRounds(rounds, [])).toEqual({ assignments: {}, unmatched: [] });
  });
});
