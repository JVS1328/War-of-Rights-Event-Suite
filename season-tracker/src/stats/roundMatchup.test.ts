import { describe, it, expect } from 'vitest';
import { ticketCost, matchupScore, matchupRows, matchupKeys, spaceCamel, ticketsText } from './roundMatchup';
import { spineRow, isTextRow } from '../components/ui/spineModel';
import type { Scoreboard, Team, TeamCasualties } from './types';

const cas = (inForm: number, skirm: number, oob: number): TeamCasualties => ({
  total: inForm + skirm + oob,
  inForm,
  skirm,
  oob,
});

function board(over: {
  usa?: TeamCasualties;
  csa?: TeamCasualties;
  winner?: Team | null;
  usaWeapons?: Record<string, number>;
  csaWeapons?: Record<string, number>;
  moraleUsa?: string | null;
  moraleCsa?: string | null;
}): Scoreboard {
  return {
    sourceFilename: 'x.csv',
    recordedAt: null,
    meta: {
      roundStartTime: null,
      roundEndTime: null,
      roundDurationS: null,
      map: 'Antietam',
      mode: 'Skirmish',
      area: 'Cornfield',
      // `?? ` would swallow an explicit null, which is how a draw is recorded.
      winner: 'winner' in over ? (over.winner ?? null) : 'CSA',
      popNow: null,
      popRoundStart: null,
      popRoundPeak: null,
      popRoundMax: null,
      popRoundEnd: null,
      moraleUsa: over.moraleUsa ?? null,
      moraleCsa: over.moraleCsa ?? null,
      casualties: { USA: over.usa ?? cas(62, 39, 27), CSA: over.csa ?? cas(42, 18, 19) },
      deathsByWeapon: { USA: over.usaWeapons ?? {}, CSA: over.csaWeapons ?? {} },
    },
    players: [],
    officers: [],
    roster: [],
    kills: [],
    joinLeaves: [],
  };
}

const findRow = (sb: Scoreboard, label: string) =>
  matchupRows(sb).find((r) => r.label === label);

describe('ticketCost', () => {
  it('weights the stances 1, 3 and 5', () => {
    expect(ticketCost(cas(10, 0, 0))).toBe(10);
    expect(ticketCost(cas(0, 10, 0))).toBe(30);
    expect(ticketCost(cas(0, 0, 10))).toBe(50);
    expect(ticketCost(cas(62, 39, 27))).toBe(62 + 117 + 135);
  });

  it('is zero for a side that lost nobody', () => {
    expect(ticketCost(cas(0, 0, 0))).toBe(0);
  });
});

describe('matchupScore', () => {
  it("scores each side by the casualties it inflicted, not the ones it took", () => {
    const s = matchupScore(board({}));
    expect(s.usaInflicted).toBe(79); // CSA's losses
    expect(s.csaInflicted).toBe(128); // USA's losses
  });

  it('carries the ticket losses per side', () => {
    const s = matchupScore(board({}));
    expect(s.usaTicketsLost).toBe(314);
    expect(s.csaTicketsLost).toBe(191);
  });
});

describe('matchupRows', () => {
  it('puts casualties inflicted the right way round', () => {
    const r = findRow(board({}), 'Casualties inflicted')!;
    expect(isTextRow(r)).toBe(false);
    if (!isTextRow(r)) {
      expect(r.a).toBe(79);
      expect(r.b).toBe(128);
      expect(spineRow(r).winner).toBe('b'); // CSA inflicted more
    }
  });

  it('marks casualties taken as lower-is-better', () => {
    const r = findRow(board({}), 'Casualties taken')!;
    if (!isTextRow(r)) expect(spineRow(r).winner).toBe('b'); // CSA lost fewer
  });

  it('gives holding the line to the side with the higher in-formation share', () => {
    const r = findRow(board({}), 'Held the line')!;
    if (!isTextRow(r)) {
      expect(r.aText).toBe('48%');
      expect(r.bText).toBe('53%');
      expect(spineRow(r).winner).toBe('b');
    }
  });

  it('omits cost per death when a side lost nobody', () => {
    const sb = board({ csa: cas(0, 0, 0) });
    expect(findRow(sb, 'Cost per death')).toBeUndefined();
  });

  it('includes cost per death once both sides have losses, lower winning', () => {
    const r = findRow(board({}), 'Cost per death')!;
    if (!isTextRow(r)) {
      expect(r.aText).toBe('2.5');
      expect(r.bText).toBe('2.4');
      expect(spineRow(r).winner).toBe('b');
    }
  });

  it('omits weapon rows the round has no data for', () => {
    const sb = board({});
    expect(findRow(sb, 'Melee deaths')).toBeUndefined();
    expect(findRow(sb, 'Artillery deaths')).toBeUndefined();
  });

  it('sums canister and shell into one artillery row', () => {
    const sb = board({
      usaWeapons: { canister: 16, shell: 22, minie: 121 },
      csaWeapons: { canister: 8, shell: 3 },
    });
    const r = findRow(sb, 'Artillery deaths')!;
    if (!isTextRow(r)) {
      expect(r.a).toBe(38);
      expect(r.b).toBe(11);
      expect(spineRow(r).winner).toBe('b'); // fewer lost to guns
    }
  });

  it('leaves round ball out of it — that is a musket, not a gun', () => {
    // The meta block's `round` key is the smoothbore's round ball. Counting it
    // as artillery put every musket death on the guns' tab.
    const sb = board({
      usaWeapons: { canister: 10, round: 200 },
      csaWeapons: { canister: 10, round: 4 },
    });
    const r = findRow(sb, 'Artillery deaths')!;
    if (!isTextRow(r)) {
      expect(r.a).toBe(10);
      expect(r.b).toBe(10);
    }
  });

  it('has no artillery row for a round the guns never touched', () => {
    const sb = board({ usaWeapons: { round: 40, minie: 60 }, csaWeapons: { round: 25 } });
    expect(findRow(sb, 'Artillery deaths')).toBeUndefined();
  });

  it('adds morale as a text row only when the round recorded it', () => {
    expect(findRow(board({}), 'Morale at the end')).toBeUndefined();
    const sb = board({ moraleUsa: 'Wavering', moraleCsa: 'FinalPush' });
    const r = findRow(sb, 'Morale at the end')!;
    expect(isTextRow(r)).toBe(true);
    if (isTextRow(r)) expect(r.bText).toBe('Final Push');
  });

  it('adds tickets left only when the round recorded them, of the start where known', () => {
    expect(findRow(board({}), 'Tickets left')).toBeUndefined();
    const sb = board({});
    Object.assign(sb.meta, { ticketsUsa: 122, ticketsCsa: 122, ticketsLeftUsa: 31, ticketsLeftCsa: 0 });
    expect(findRow(sb, 'Tickets left')).toMatchObject({ a: 31, b: 0, aText: '31 / 122', bText: '0 / 122' });
    expect(ticketsText(null, 100)).toBe('100');
    expect(ticketsText(null, null)).toBe('—');
  });

  it('survives a round where nobody died', () => {
    const sb = board({ usa: cas(0, 0, 0), csa: cas(0, 0, 0) });
    expect(() => matchupRows(sb)).not.toThrow();
    const r = findRow(sb, 'Held the line')!;
    if (!isTextRow(r)) expect(r.aText).toBe('0%');
  });
});

describe('matchupKeys', () => {
  it('has nothing to say about a draw', () => {
    expect(matchupKeys(board({ winner: null }))).toEqual([]);
  });

  it('leads with the winner’s discipline, quoting both shares', () => {
    const [k] = matchupKeys(board({}));
    expect(k.side).toBe('CSA');
    expect(k.title).toBe('Confederate discipline');
    expect(k.body).toContain('53% of Confederate losses');
    expect(k.body).toContain('48% for the Union');
  });

  it('calls out the loser’s out-of-line cost', () => {
    const k = matchupKeys(board({})).find((x) => x.title === 'Caught out of line')!;
    expect(k.side).toBe('USA');
    expect(k.body).toContain('27 men out of line');
    expect(k.body).toContain('135 tickets');
  });

  it('skips the out-of-line note when the loser kept formation', () => {
    const sb = board({ usa: cas(80, 0, 0), csa: cas(20, 0, 0), winner: 'CSA' });
    expect(matchupKeys(sb).some((k) => k.title === 'Caught out of line')).toBe(false);
  });

  it('says the winner won the ticket exchange when it did', () => {
    const k = matchupKeys(board({})).find((x) => x.title === 'The margin')!;
    expect(k.body).toContain('won the ticket exchange 314 to 191');
    expect(k.body).toContain('123-ticket margin');
  });

  it('says so plainly when the winner lost the ticket exchange', () => {
    // CSA kills fewer men but each costs more, so USA wins on bodies only.
    const sb = board({ usa: cas(10, 0, 2), csa: cas(0, 0, 8), winner: 'CSA' });
    const k = matchupKeys(sb).find((x) => x.title === 'The margin')!;
    expect(k.body).toContain('won on bodies, not tickets');
  });

  it('has nothing to say when neither side lost anyone', () => {
    expect(matchupKeys(board({ usa: cas(0, 0, 0), csa: cas(0, 0, 0) }))).toEqual([]);
  });
});

describe('spaceCamel', () => {
  it('splits the overlay’s camel-case morale', () => {
    expect(spaceCamel('FinalPush')).toBe('Final Push');
    expect(spaceCamel('Steady')).toBe('Steady');
  });
  it('shows a dash for nothing recorded', () => {
    expect(spaceCamel(null)).toBe('—');
  });
});
