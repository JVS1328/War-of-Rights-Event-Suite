import { describe, it, expect } from 'vitest';
import { causeLabel, formatCompany, ticketDamage, pctShare, formatPct, weaponLabel } from './labels';

describe('ticketDamage', () => {
  it('weights In Formation·1 + Skirmish·3 + Out of Line·5', () => {
    expect(ticketDamage(1, 0, 0)).toBe(1);
    expect(ticketDamage(0, 1, 0)).toBe(3);
    expect(ticketDamage(0, 0, 1)).toBe(5);
    expect(ticketDamage(2, 1, 1)).toBe(2 * 1 + 1 * 3 + 1 * 5); // 10
    expect(ticketDamage(0, 0, 0)).toBe(0);
  });

  it('is additive — a unit total equals the sum of its members', () => {
    const a = ticketDamage(1, 2, 0); // 7
    const b = ticketDamage(0, 1, 1); // 8
    expect(ticketDamage(1, 3, 1)).toBe(a + b); // 15
  });
});

describe('pctShare / formatPct', () => {
  it('returns a fraction, or null when the total is zero', () => {
    expect(pctShare(3, 12)).toBeCloseTo(0.25, 5);
    expect(pctShare(0, 10)).toBe(0);
    expect(pctShare(5, 0)).toBeNull();
  });

  it('formats a fraction as a whole-number percent, or an em dash when null', () => {
    expect(formatPct(0.25)).toBe('25%');
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(1)).toBe('100%');
    expect(formatPct(null)).toBe('—');
  });
});

describe('formatCompany', () => {
  it('strips a trailing "Company" word so the label reads next to a "Co." prefix', () => {
    expect(formatCompany('A Company')).toBe('A');
    expect(formatCompany('B Company')).toBe('B');
    expect(formatCompany('1st Company')).toBe('1st');
  });

  it('is case-insensitive on the "Company" suffix', () => {
    expect(formatCompany('A company')).toBe('A');
    expect(formatCompany('C COMPANY')).toBe('C');
  });

  it('leaves bare company labels untouched', () => {
    expect(formatCompany('A')).toBe('A');
    expect(formatCompany('1st')).toBe('1st');
  });

  it('falls back to the original when the value is only "Company"', () => {
    expect(formatCompany('Company')).toBe('Company');
  });
});

describe('weaponLabel', () => {
  it('names the round ball for what it is, not artillery round shot', () => {
    expect(weaponLabel('round')).toBe('Round ball');
  });

  it('names the two the guns actually fire', () => {
    expect(weaponLabel('canister')).toBe('Canister');
    expect(weaponLabel('shell')).toBe('Shell');
  });

  it('spells out the terse keys', () => {
    expect(weaponLabel('minie')).toBe('Minié ball');
    expect(weaponLabel('env')).toBe('Environment');
  });

  it('capitalises a key it has never seen rather than dropping it', () => {
    expect(weaponLabel('rocket')).toBe('Rocket');
  });
});

describe('causeLabel', () => {
  it('names a killfeed cause the way the deaths-by-weapon table does', () => {
    expect(causeLabel('Minie')).toBe('Minié ball');
    expect(causeLabel('Env')).toBe('Environment');
    expect(causeLabel('Bayonet')).toBe('Bayonet');
  });
});
