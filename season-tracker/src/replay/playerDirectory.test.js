import { describe, it, expect } from 'vitest';
import { groupEntriesByCompany, buildPlayerDirectory } from './playerDirectory.js';

describe('groupEntriesByCompany', () => {
  it('splits a regiment by company, in order, with the unassigned last', () => {
    const details = [{ company: 'B Company' }, { company: null }, { company: 'A Company' }, { company: 'B Company' }];
    const entries = details.map((_, index) => ({ index }));
    expect(groupEntriesByCompany(entries, details)).toEqual([
      { company: 'A Company', entries: [{ index: 2 }] },
      { company: 'B Company', entries: [{ index: 0 }, { index: 3 }] },
      { company: null, entries: [{ index: 1 }] },
    ]);
  });
});

describe('buildPlayerDirectory', () => {
  it('carries each player level from the scoreboard, by SteamID and else by name', () => {
    const replay = { players: [{ name: 'Renamed' }, { name: 'Bob' }, { name: 'Nobody' }] };
    const scoreboard = {
      roster: [{ name: 'Renamed', steamId: '7656' }],
      players: [{ name: 'Old Name', steamId: '7656', level: 56 }, { name: 'Bob', steamId: null, level: 3 }],
    };
    const { details } = buildPlayerDirectory(replay, scoreboard, () => null);
    expect(details.map((d) => d.level)).toEqual([56, 3, null]);
  });
});
