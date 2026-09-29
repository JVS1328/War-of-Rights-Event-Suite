import { describe, it, expect } from 'vitest';
import { groupEntriesByCompany } from './playerDirectory.js';

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
