import { describe, it, expect } from 'vitest';
import { levelTier } from './LevelBadge.jsx';

describe('levelTier', () => {
  it('picks the game\'s icon: floor(level / 10) * 10', () => {
    expect([1, 9, 10, 56, 99, 100].map(levelTier)).toEqual([0, 0, 10, 50, 90, 100]);
  });
});
