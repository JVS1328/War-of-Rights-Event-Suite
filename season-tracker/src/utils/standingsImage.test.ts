import { describe, it, expect } from 'vitest';
import { initialsOf, sealText } from './standingsImage';

describe('sealText', () => {
  it.each([
    ['Week 7', 7, { label: 'WEEK', big: '7' }],
    ['9/30/2026 - W9', 9, { label: 'WEEK', big: '9' }],
    ['Night 3', 3, { label: 'NIGHT', big: '3' }],
    ['SSL Wk#12 — rematch', 12, { label: 'WEEK', big: '12' }],
    ['Round 2', 5, { label: 'ROUND', big: '2' }],
    ['Playoffs 2', 11, { label: 'PLAYOFFS', big: '2' }],
    ['9/30/2026', 4, { label: '2026', big: '9/30' }],
    ['2026-09-30 Sunday', 4, { label: '2026', big: '9/30' }],
    ['Grand Melee', 6, { label: 'NIGHT', big: '6' }],
  ])('reads %s', (night, n, want) => {
    expect(sealText(night, n)).toEqual(want);
  });
});

describe('initialsOf', () => {
  it('keeps short names and Roman numerals whole', () => {
    expect(initialsOf('JD')).toBe('JD');
    expect(initialsOf('II Corps')).toBe('IIC');
    expect(initialsOf('7th OH')).toBe('7O');
  });
});
