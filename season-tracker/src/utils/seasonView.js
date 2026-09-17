// How a season reads: standings, fixture list, roster and headline figures,
// derived from nothing but the stored season object.
//
// These used to live inside SeasonTracker as memos over its bound state. They
// were lifted out so the public, read-only site can draw the same tables from
// the same numbers — a season shown to a visitor and the same season open in
// the admin tracker are now the same computation, not two that have to be kept
// in step by hand.

import { nightLeadPairs } from './nightLeads';
import { nightPlayed } from '../stats/nightMatchup';
import { buildEloLadder } from './eloLadder';
import { replayActiveSeasonUpToWeekFromAppState, replayEventFromAppState } from './eloEngine';

/**
 * The sides as a round was actually played: a balance swap moves a unit across
 * for that round only, so the stored teamA/teamB are the night's shape rather
 * than the round's.
 */
export const getEffectiveTeams = (week, roundNum) => {
  const baseTeamA = week.teamA || [];
  const baseTeamB = week.teamB || [];
  const swaps = new Set(week.roundSwaps?.[`r${roundNum}`] || []);

  if (swaps.size === 0) return { teamA: baseTeamA, teamB: baseTeamB };

  const teamA = baseTeamA.filter(u => !swaps.has(u)).concat(baseTeamB.filter(u => swaps.has(u)));
  const teamB = baseTeamB.filter(u => !swaps.has(u)).concat(baseTeamA.filter(u => swaps.has(u)));
  return { teamA, teamB };
};

/**
 * Points and win/loss record per token unit, optionally only counting nights up
 * to `maxWeekIdx` (which is how the Elo ladder draws a unit's run week by week).
 * Non-token units play but never score, so they never get a row.
 */
export const seasonPoints = (season, maxWeekIdx = null) => {
  const units = season?.units || [];
  const nonTokenUnits = season?.nonTokenUnits || [];
  const weeks = season?.weeks || [];
  const pointSystem = season?.pointSystem || {};
  const manualAdjustments = season?.manualAdjustments || {};

  const stats = {};
  units.forEach(unit => {
    if (nonTokenUnits.includes(unit)) return;
    stats[unit] = {
      points: 0, balancePoints: 0,
      leadWins: 0, leadLosses: 0, assistWins: 0, assistLosses: 0,
    };
  });

  const weeksToProcess = maxWeekIdx !== null ? weeks.slice(0, maxWeekIdx + 1) : weeks;

  weeksToProcess.forEach(week => {
    if (!week.round1Winner && !week.round2Winner) return;
    // Fun rounds are exhibition: no points and no win/loss record.
    if (week.isFunRound) return;

    const isPlayoffs = week.isPlayoffs || false;
    const isSingleRoundLeads = week.isSingleRoundLeads || false;

    [1, 2].forEach(roundNum => {
      const winner = week[`round${roundNum}Winner`];
      if (!winner) return;

      const effective = getEffectiveTeams(week, roundNum);
      const winningTeam = winner === 'A' ? effective.teamA : effective.teamB;
      const losingTeam = winner === 'A' ? effective.teamB : effective.teamA;

      // Playoffs and single-round-lead nights carry a lead per round; a regular
      // night carries one lead for the whole night.
      let leadWinner, leadLoser;
      if (isPlayoffs || isSingleRoundLeads) {
        leadWinner = week[`lead${winner}_r${roundNum}`];
        leadLoser = week[`lead${winner === 'A' ? 'B' : 'A'}_r${roundNum}`];
      } else {
        leadWinner = week[`lead${winner}`];
        leadLoser = week[`lead${winner === 'A' ? 'B' : 'A'}`];
      }

      if (!isPlayoffs) {
        winningTeam.forEach(unit => {
          if (!stats[unit]) return;
          if (unit === leadWinner) {
            stats[unit].points += pointSystem.winLead;
            stats[unit].leadWins++;
          } else {
            stats[unit].points += pointSystem.winAssist;
            stats[unit].assistWins++;
          }
        });

        losingTeam.forEach(unit => {
          if (!stats[unit]) return;
          if (unit === leadLoser) {
            stats[unit].points += pointSystem.lossLead;
            stats[unit].leadLosses++;
          } else {
            stats[unit].points += pointSystem.lossAssist;
            stats[unit].assistLosses++;
          }
        });
      } else {
        // Playoffs still track the record, but award nothing.
        winningTeam.forEach(unit => {
          if (!stats[unit]) return;
          if (unit === leadWinner) stats[unit].leadWins++;
          else stats[unit].assistWins++;
        });

        losingTeam.forEach(unit => {
          if (!stats[unit]) return;
          if (unit === leadLoser) stats[unit].leadLosses++;
          else stats[unit].assistLosses++;
        });
      }
    });

    // 2-0 sweep bonus (skipped in playoffs).
    if (!isPlayoffs && week.round1Winner && week.round1Winner === week.round2Winner) {
      const sweepWinner = week.round1Winner;
      // Only units on the winning side in BOTH rounds get the sweep bonus.
      const effectiveR1 = getEffectiveTeams(week, 1);
      const effectiveR2 = getEffectiveTeams(week, 2);
      const r1WinTeam = new Set(sweepWinner === 'A' ? effectiveR1.teamA : effectiveR1.teamB);
      const r2WinTeam = new Set(sweepWinner === 'A' ? effectiveR2.teamA : effectiveR2.teamB);
      const sweepTeam = [...r1WinTeam].filter(u => r2WinTeam.has(u));

      if (isSingleRoundLeads) {
        const r1Lead = week[`lead${sweepWinner}_r1`];
        const r2Lead = week[`lead${sweepWinner}_r2`];
        const sweepLeads = new Set([r1Lead, r2Lead].filter(Boolean));

        sweepTeam.forEach(unit => {
          if (!stats[unit]) return;
          stats[unit].points += sweepLeads.has(unit)
            ? pointSystem.bonus2_0Lead
            : pointSystem.bonus2_0Assist;
        });
      } else {
        const sweepLead = week[`lead${sweepWinner}`];

        sweepTeam.forEach(unit => {
          if (!stats[unit]) return;
          stats[unit].points += unit === sweepLead
            ? pointSystem.bonus2_0Lead
            : pointSystem.bonus2_0Assist;
        });
      }
    }
  });

  // Balance points, skipping playoff weeks (nothing is awarded in playoffs) and
  // fun rounds (exhibition). They are kept on their own tally as well as in the
  // total, so the standings can show what a unit earned for balancing.
  if (pointSystem.balancePoints) {
    const award = unit => {
      if (!stats[unit]) return;
      stats[unit].points += pointSystem.balancePoints;
      stats[unit].balancePoints += pointSystem.balancePoints;
    };

    weeksToProcess.forEach(week => {
      if (week.isPlayoffs || week.isFunRound) return;
      const r1Swaps = week.roundSwaps?.r1 || [];
      const r2Swaps = week.roundSwaps?.r2 || [];

      if (pointSystem.balancePointsStyle === 'perRound') {
        r1Swaps.forEach(unit => award(unit));
        r2Swaps.forEach(unit => award(unit));
      } else if (pointSystem.balancePointsStyle === 'perRoundLoss') {
        // Per round, but only for a balanced unit that ended up on the losing
        // side of that round ("balance and lose → get the point").
        [1, 2].forEach(roundNum => {
          const winner = week[`round${roundNum}Winner`];
          if (!winner) return;
          const swaps = roundNum === 1 ? r1Swaps : r2Swaps;
          if (swaps.length === 0) return;
          const effective = getEffectiveTeams(week, roundNum);
          const losers = new Set(winner === 'A' ? effective.teamB : effective.teamA);
          swaps.forEach(unit => { if (losers.has(unit)) award(unit); });
        });
      } else {
        // perNight: each unit gets balance points at most once per week.
        new Set([...r1Swaps, ...r2Swaps]).forEach(unit => award(unit));
      }
    });
  }

  Object.entries(manualAdjustments).forEach(([unit, adjustment]) => {
    if (stats[unit]) stats[unit].points += adjustment;
  });

  return stats;
};

/** unit name → division name, for the screens that badge a row with it. */
export const divisionOfUnit = (season) => {
  const map = {};
  (season?.divisions || []).forEach(d => (d.units || []).forEach(u => { map[u] = d.name; }));
  return map;
};

/** The standings table: one row per token unit, ordered by points then name. */
export const standingRows = (season) => {
  const byUnit = divisionOfUnit(season);
  return Object.entries(seasonPoints(season))
    .map(([unit, d]) => {
      const w = (d.leadWins || 0) + (d.assistWins || 0);
      const l = (d.leadLosses || 0) + (d.assistLosses || 0);
      return {
        unit,
        division: byUnit[unit] ?? null,
        points: d.points || 0,
        balancePoints: d.balancePoints || 0,
        leadWins: d.leadWins || 0,
        leadLosses: d.leadLosses || 0,
        assistWins: d.assistWins || 0,
        assistLosses: d.assistLosses || 0,
        w, l,
        wr: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0,
      };
    })
    .sort((a, b) => b.points - a.points || a.unit.localeCompare(b.unit))
    .map((r, i) => ({ ...r, pos: i + 1 }));
};

/** The fixture list: one row per night, with both matchups of a split-lead night. */
export const nightRows = (season) => (season?.weeks || []).map((w, i) => {
  const { first, second } = nightLeadPairs(w);
  return {
    index: i,
    n: i + 1,
    name: w.name,
    leadA: first?.a ?? null,
    leadB: first?.b ?? null,
    leadA2: second?.a ?? null,
    leadB2: second?.b ?? null,
    map1: w.round1Map || null,
    map2: w.round2Map || null,
    sidesA: (w.teamA || []).length,
    sidesB: (w.teamB || []).length,
    r1: w.round1Winner || null,
    r2: w.round2Winner || null,
    played: nightPlayed(w),
    playoffs: !!w.isPlayoffs,
  };
});

/** Units that hold a standings token — the ones points and Elo are kept for. */
export const tokenUnitsOf = (season) =>
  (season?.units || []).filter(u => !(season?.nonTokenUnits || []).includes(u));

/** Season-at-a-glance figures for the overview strip. */
export const seasonKpis = (season) => {
  const weeks = season?.weeks || [];
  const units = season?.units || [];
  const divisions = season?.divisions || [];
  const tokens = tokenUnitsOf(season);

  let roundsPlayed = 0;
  let regular = 0;
  let usaCasualties = 0;
  let csaCasualties = 0;
  for (const w of weeks) {
    if (w.round1Winner || w.round1Draw) roundsPlayed += 1;
    if (w.round2Winner || w.round2Draw) roundsPlayed += 1;
    if (!w.isPlayoffs) regular += 1;
    // Which side is which faction flips per round, so read the flag first.
    for (const r of [1, 2]) {
      const a = w[`r${r}CasualtiesA`] || 0;
      const b = w[`r${r}CasualtiesB`] || 0;
      if (w[`round${r}Flipped`]) { usaCasualties += b; csaCasualties += a; }
      else { usaCasualties += a; csaCasualties += b; }
    }
  }
  const totalCasualties = usaCasualties + csaCasualties;
  return [
    { head: 'Units', value: units.length, hint: `${divisions.length} division${divisions.length === 1 ? '' : 's'}` },
    { head: 'Nights', value: weeks.length, hint: `${regular} regular · ${weeks.length - regular} playoff` },
    { head: 'Rounds played', value: roundsPlayed, hint: `of ${weeks.length * 2} scheduled` },
    { head: 'Token units', value: tokens.length, hint: `${units.length - tokens.length} score nothing` },
    { head: 'Casualties', value: totalCasualties.toLocaleString(), hint: `${usaCasualties.toLocaleString()} USA · ${csaCasualties.toLocaleString()} CSA` },
  ];
};

/** The season roster, with what each unit has done in it. */
export const rosterRows = (season) => {
  const units = season?.units || [];
  const nonTokenUnits = season?.nonTokenUnits || [];
  const weeks = season?.weeks || [];
  const counts = season?.unitPlayerCounts || {};
  const byUnit = divisionOfUnit(season);

  const nights = {};
  weeks.forEach(w => {
    new Set([...(w.teamA || []), ...(w.teamB || [])]).forEach(u => { nights[u] = (nights[u] || 0) + 1; });
  });

  return [...units].sort().map(u => ({
    name: u,
    token: !nonTokenUnits.includes(u),
    division: byUnit[u] ?? null,
    nights: nights[u] || 0,
    men: counts[u] ? ((counts[u].min || 0) + (counts[u].max || 0)) / 2 : null,
  }));
};

/**
 * Ratings after each week of a season, so the ladder can draw a unit's whole
 * run. One engine replay per week — the engine is pure and a season is a couple
 * of dozen weeks, so this is cheap enough to call rather than cache.
 */
export const eloLadderRows = (appState, event, season) => {
  const weeks = season?.weeks || [];
  const eloSystem = event?.eloSystem || {};
  const weekElo = weeks.map((_, i) =>
    replayActiveSeasonUpToWeekFromAppState(appState, event.id, season.id, i).unitElo);
  const { roundsPlayed } = weeks.length > 0
    ? replayActiveSeasonUpToWeekFromAppState(appState, event.id, season.id, weeks.length - 1)
    : { roundsPlayed: {} };

  const divisionOf = divisionOfUnit(season);
  // Where each unit sits on points, so the ladder can show the two orderings
  // side by side and say where they disagree.
  const byPoints = Object.entries(seasonPoints(season))
    .sort((a, b) => (b[1].points ?? 0) - (a[1].points ?? 0));
  const pointsRank = {};
  byPoints.forEach(([unit], i) => { pointsRank[unit] = i + 1; });

  return buildEloLadder({
    units: tokenUnitsOf(season),
    initialElo: eloSystem.initialElo,
    weekElo,
    roundsPlayed,
    provisionalRounds: eloSystem.provisionalRounds || 0,
    divisionOf,
    pointsRank,
  });
};

/** Event-wide Elo, used where a rating should not reset between seasons. */
export const eventEloRatings = (appState, eventId) => {
  const result = replayEventFromAppState(appState, eventId);
  return { eloRatings: result.unitElo, roundsPlayed: result.roundsPlayed };
};
