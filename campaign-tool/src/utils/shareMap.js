/**
 * Shareable Campaign Map Utility
 *
 * Encodes campaign state into a compressed URL-safe string for sharing.
 *
 * For template-based campaigns: stores template ID + a single owner string
 * ("UUCNNC...") where each char's position maps to the template territory
 * array index. VP overrides and transitions stored as sparse index maps.
 *
 * For custom maps: stores optimized territory data (SVG paths stripped when
 * MapView can resolve them from usaStates).
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { CAMPAIGN_TEMPLATES } from '../data/defaultCampaign';
import { buildTurnSummary, buildDispatchParagraphs, getSummarisableTurns } from './turnSummary';
import { battleCounts, casualtyTotals } from './campaignTotals';
import { getOrders, hasLandingRights } from './orders';
import { turnIncome } from './cpSystem';
import { getBoardSeason } from './dateSystem';
import { pendingBattles, recentBattles, markDetail } from './battleMarks';
import { getSideReach, heldWaterways, waterReach } from './reach';
import { getWaterways } from './waterways';
import { boardAtTurn } from './boardHistory';

// v3 adds `di` — the turn's dispatch paragraphs, so the share view can print
// "Latest Intelligence". Nothing else moved, so v1 and v2 links still decode.
//
// `or` (this turn's orders) and `l` (landing rights) came later and are both
// optional — a payload without them decodes to no orders and no rights, which
// is exactly what an older link meant — so the version stays where it is.
// So are `rc` (each side's reach) and `rs` (the side the admin was looking
// at): without them the shared plate simply dims nothing. And `ww` (the
// water each region lies on), `hw` (the water each side holds) and `wr` (how
// each side reaches by water this turn), which let the shared sheet say where
// a landing can go; an older link says nothing about it. And `h`, the turns
// already played, which an older link simply has none of.
const V = 3;
const O2C = { 'USA': 'U', 'CSA': 'C', 'NEUTRAL': 'N' };
const C2O = { 'U': 'USA', 'C': 'CSA', 'N': 'NEUTRAL' };

// A raid's window rides along as a fourth flag; older links simply lack it.
const encodeTransition = (ts) => [ts.turnsRemaining, ts.totalTurns, O2C[ts.previousOwner] || 'N', ...(ts.raided ? [1] : [])];
const decodeTransition = ([r, t, p, raided]) => ({
  isTransitioning: true, turnsRemaining: r, totalTurns: t, previousOwner: C2O[p] || 'NEUTRAL',
  ...(raided ? { raided: true } : {}),
});

/**
 * The battles the plate marks, so a shared board draws the same fights in
 * the same weather: [where, 'a' active | 'r' fought, attacker, winner,
 * weather, time]. `where` is a template index or a territory id. Optional -
 * a link without it shows pending fights only, as before.
 */
const encodeMarks = (campaign, keyOf) => [
  ...recentBattles(campaign).map(b => ['r', b]),
  ...pendingBattles(campaign).map(b => ['a', b]),
].flatMap(([phase, b]) => {
  const key = keyOf(b.territoryId);
  if (key == null) return [];
  const d = markDetail(b);
  return [[key, phase, O2C[d.attacker] || '', O2C[d.winner] || '', d.weather || '', d.time || '']];
});

const decodeMarks = (bm, keyToId) => {
  const recentTerritoryIds = [];
  const battleDetails = {};
  for (const [key, phase, a, w, weather, time] of Array.isArray(bm) ? bm : []) {
    const id = keyToId(key);
    if (!id) continue;
    if (phase === 'r') recentTerritoryIds.push(id);
    battleDetails[id] = {
      attacker: C2O[a] || null, winner: C2O[w] || null,
      weather: weather || null, time: time || null,
    };
  }
  return { recentTerritoryIds, battleDetails };
};

/**
 * The turns already played, so the shared sheet can page back through them.
 * One entry per past turn that saw fighting: the turn `t`, its date `d`, who
 * held what at its close (`o`, an owner string in `ids` order), captures
 * still consolidating (`ts`, sparse by index), battles fought and casualties
 * taken by then (`bc`, `cas`), the marks for that turn's own fights (`bm`)
 * and its dispatch (`di`). The
 * Grand Campaign moves tokens, whose past positions are not kept, so it has
 * none.
 */
const encodeHistory = (campaign, ids, keyOf) => {
  if (campaign.grandCampaign) return [];
  return getSummarisableTurns(campaign)
    .filter(turn => turn < campaign.currentTurn)
    .map(turn => {
      const board = boardAtTurn(campaign, turn);
      const upTo = (campaign.battles || []).filter(b => b.turn <= turn);
      const cas = casualtyTotals(upTo);
      const summary = buildTurnSummary(campaign, turn);
      // That turn's own fights, all of them fought.
      const closed = {
        ...campaign,
        currentTurn: turn,
        battles: (campaign.battles || []).filter(b => b.turn === turn && b.status === 'completed' && b.winner),
      };
      const ts = {};
      ids.forEach((id, i) => {
        const transition = board.get(id)?.transitionState;
        if (transition) ts[i] = encodeTransition(transition);
      });
      return {
        t: turn,
        d: summary?.dateLabel || null,
        o: ids.map(id => O2C[board.get(id)?.owner] || 'N').join(''),
        ...(Object.keys(ts).length ? { ts } : {}),
        bc: battleCounts(upTo).fought,
        cas: { u: cas.usa, c: cas.csa },
        bm: encodeMarks(closed, keyOf),
        di: buildDispatchParagraphs(summary),
      };
    });
};

/** Inverse of encodeHistory, against the territories the link decoded to. */
const decodeHistory = (h, territories, keyToId) => (Array.isArray(h) ? h : []).map(entry => ({
  turn: entry.t,
  date: entry.d || null,
  owners: territories.map((t, i) => C2O[entry.o?.[i]] || t.owner),
  transitions: territories.map((t, i) => (entry.ts?.[i] ? decodeTransition(entry.ts[i]) : null)),
  battleCount: entry.bc ?? null,
  casualties: entry.cas
    ? { usa: entry.cas.u || 0, csa: entry.cas.c || 0, total: (entry.cas.u || 0) + (entry.cas.c || 0) }
    : null,
  ...decodeMarks(entry.bm, keyToId),
  dispatch: Array.isArray(entry.di) ? entry.di : [],
}));

/**
 * Each side's reach, worked out here because the share view has none of the
 * doctrines, orders or settings it takes. `ids` fixes the order: one code per
 * territory, 0 for ground in reach, otherwise 1 + an index into a table of
 * the distinct [reason, hint] pairs - there are only ever a handful.
 */
const encodeReach = (campaign, ids, ways) => {
  const out = {};
  for (const side of ['USA', 'CSA']) {
    const reach = getSideReach(campaign, side, ways);
    const table = [];
    const seen = new Map();
    const m = ids.map(id => {
      const e = reach.get(id);
      if (!e || e.ok) return 0;
      const key = `${e.reason}\u0000${e.hint || ''}`;
      if (!seen.has(key)) {
        table.push(e.hint ? [e.reason, e.hint] : [e.reason]);
        seen.set(key, table.length);
      }
      return seen.get(key);
    });
    out[O2C[side]] = { t: table, m };
  }
  return out;
};

/** Inverse of encodeReach: { USA, CSA } of Map<territoryId, entry>, or null. */
const decodeReach = (rc, territories) => {
  if (!rc) return null;
  const decodeSide = (r) => {
    if (!r || !Array.isArray(r.m)) return null;
    return new Map(territories.map((t, i) => {
      const row = r.m[i] ? r.t?.[r.m[i] - 1] : null;
      return [t.id, row
        ? { ok: false, reason: row[0] || null, hint: row[1] || null }
        : { ok: true, reason: null, hint: null }];
    }));
  };
  const USA = decodeSide(rc.U);
  const CSA = decodeSide(rc.C);
  return USA || CSA ? { USA, CSA } : null;
};

// Round numeric coordinates to 1 decimal place — matches the projector's
// precision (MapView uses .toFixed(1)) and keeps the compressed payload small.
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Encode Grand Campaign state (tokens + map features + national pools)
 * into a compact share block. Keys are 1-2 chars for payload size.
 *
 * GC VP (capital captures + token wipes) lives on the campaign root as
 * `victoryPointsUSA` / `victoryPointsCSA` — the caller passes them in.
 */
const encodeGC = (gc, vpUSA, vpCSA) => {
  const pt = (p) => [r1(p.x), r1(p.y)];
  const line = (l) => ({ i: l.id, n: l.name, p: (l.points || []).map(pt) });
  return {
    ph: gc.phase,
    tr: { u: gc.pools?.USA?.treasury ?? 0, c: gc.pools?.CSA?.treasury ?? 0 },
    mp: { u: gc.pools?.USA?.manpower ?? 0, c: gc.pools?.CSA?.manpower ?? 0 },
    tk: (gc.tokens || []).map(t => ({
      i: t.id, n: t.name, s: O2C[t.side] || 'N',
      m: t.manpower, f: t.fatigue || 0, st: t.status || 'active',
      p: t.position ? pt(t.position) : null,
      ...(t.boarded ? { b: [t.boarded.type === 'rail' ? 'R' : 'V', t.boarded.featureId] } : {}),
      ...(t.garrisonedAt ? { g: [t.garrisonedAt.featureId, t.garrisonedAt.men] } : {}),
    })),
    mf: {
      c:  (gc.mapFeatures?.cities   || []).map(f => ({ i: f.id, n: f.name, s: O2C[f.side] || 'N', x: r1(f.x), y: r1(f.y), ...(f.isCapital ? { cap: 1 } : {}) })),
      f:  (gc.mapFeatures?.forts    || []).map(f => ({ i: f.id, n: f.name, s: O2C[f.side] || 'N', x: r1(f.x), y: r1(f.y) })),
      st: (gc.mapFeatures?.stations || []).map(f => ({ i: f.id, n: f.name,                          x: r1(f.x), y: r1(f.y) })),
      r:  (gc.mapFeatures?.railways || []).map(line),
      rv: (gc.mapFeatures?.rivers   || []).map(line),
    },
    v: { u: vpUSA || 0, c: vpCSA || 0 },
  };
};

/** Inverse of encodeGC. */
const decodeGC = (g) => {
  if (!g) return null;
  const pt = ([x, y]) => ({ x, y });
  const line = (l) => ({ id: l.i, name: l.n, points: (l.p || []).map(pt) });
  return {
    phase: g.ph || 'playing',
    pools: {
      USA: { treasury: g.tr?.u ?? 0, manpower: g.mp?.u ?? 0 },
      CSA: { treasury: g.tr?.c ?? 0, manpower: g.mp?.c ?? 0 },
    },
    tokens: (g.tk || []).map(t => ({
      id: t.i, name: t.n, side: C2O[t.s] || 'NEUTRAL',
      manpower: t.m, fatigue: t.f || 0, status: t.st || 'active',
      position: t.p ? pt(t.p) : null,
      boarded: t.b ? { type: t.b[0] === 'R' ? 'rail' : 'river', featureId: t.b[1] } : null,
      garrisonedAt: t.g ? { featureId: t.g[0], men: t.g[1] } : null,
    })),
    mapFeatures: {
      cities:   (g.mf?.c  || []).map(f => ({ id: f.i, name: f.n, kind: 'city',    side: C2O[f.s] || 'NEUTRAL', x: f.x, y: f.y, isCapital: !!f.cap })),
      forts:    (g.mf?.f  || []).map(f => ({ id: f.i, name: f.n, kind: 'fort',    side: C2O[f.s] || 'NEUTRAL', x: f.x, y: f.y })),
      stations: (g.mf?.st || []).map(f => ({ id: f.i, name: f.n, kind: 'station', side: 'NEUTRAL',              x: f.x, y: f.y })),
      railways: (g.mf?.r  || []).map(line),
      rivers:   (g.mf?.rv || []).map(line),
    },
    vpUSA: g.v?.u || 0,
    vpCSA: g.v?.c || 0,
  };
};

/**
 * Create a minimal share payload from the full campaign state.
 *
 * `viewSide` is the side the admin's sheet is set to; the shared plate opens
 * on that side's reach, as the admin sees it.
 */
export const createSharePayload = (campaign, { viewSide = null } = {}) => {
  const pending = pendingBattles(campaign).map(b => b.territoryId);

  const base = {
    v: V,
    n: campaign.name,
    tn: campaign.currentTurn,
    d: campaign.campaignDate?.displayString || null,
    iv: campaign.settings?.instantVPGains !== false ? 1 : 0,
    // Presentation carries over to a shared link so it looks like the board
    // the admin is actually running.
    at: campaign.settings?.atlasStyle === true ? 1 : 0,
    se: getBoardSeason(campaign) || undefined,
    bc: battleCounts(campaign.battles).fought,
  };

  if (campaign.cpSystemEnabled) {
    base.cp = 1;
    base.cU = campaign.combatPowerUSA || 0;
    base.cC = campaign.combatPowerCSA || 0;
    // Income as the tracker quotes it. The share view lacks the settings and
    // doctrines to work it out, and older links without it fall back to VP.
    const income = turnIncome(campaign);
    base.in = { u: income.USA, c: income.CSA };
    base.sp = {
      v: campaign.settings?.vpBase || 1,
      aE: campaign.settings?.baseAttackCostEnemy ?? 75,
      aN: campaign.settings?.baseAttackCostNeutral ?? 50,
      dF: campaign.settings?.baseDefenseCostFriendly ?? 25,
      dN: campaign.settings?.baseDefenseCostNeutral ?? 50,
      // Ticket billing and the VP curve change what a battle can cost, so the
      // shared board quotes the same figures as the admin's.
      tm: campaign.settings?.ticketCostEnabled === true ? 1 : 0,
      td: campaign.settings?.ticketCostDivisor ?? 100,
      vc: campaign.settings?.vpCurve || 'linear',
    };
  }

  const cas = casualtyTotals(campaign.battles);
  if (cas.total) base.cas = { u: cas.usa, c: cas.csa };

  // The turn's write-up, as plain paragraphs. The share view has no campaign
  // state to narrate from, so the prose travels with the link.
  const dispatch = buildDispatchParagraphs(buildTurnSummary(campaign, campaign.currentTurn));
  if (dispatch.length) base.di = dispatch;

  // Orders of the day, and any landing rights standing this turn. Both are
  // left off entirely when there is nothing to say, so a campaign that has
  // given no orders produces the same payload it always did.
  const orders = getOrders(campaign);
  const packOrder = (o) => (o ? { a: o.action, d: o.doctrine ? 1 : 0 } : undefined);
  const or = {};
  if (orders.USA) or.U = packOrder(orders.USA);
  if (orders.CSA) or.C = packOrder(orders.CSA);
  if (or.U || or.C) base.or = or;

  const landU = hasLandingRights(campaign, 'USA') ? 1 : 0;
  const landC = hasLandingRights(campaign, 'CSA') ? 1 : 0;
  if (landU || landC) base.l = { U: landU, C: landC };

  // Regiment data (only if regiments exist)
  const regs = campaign.regiments || { USA: [], CSA: [] };
  if (regs.USA.length || regs.CSA.length) {
    const stats = campaign.regimentStats || {};
    const encodeStats = (s) => ({
      w: s.wins || 0, l: s.losses || 0, c: s.casualties || 0,
      sp: s.spLost || 0, vg: s.vpGained || 0, vl: s.vpLost || 0,
      b: (s.battles || []).map(b => ({
        t: b.territoryName, tn: b.turn, w: b.won ? 1 : 0, r: b.role === 'Attacker' ? 'A' : 'D',
        m: b.mapName, c: b.casualties || 0, sp: b.spLost || 0, vg: b.vpGained || 0, vl: b.vpLost || 0,
      })),
    });
    const s = {};
    [...regs.USA, ...regs.CSA].forEach(r => { if (stats[r.id]) s[r.id] = encodeStats(stats[r.id]); });
    base.rg = {
      U: regs.USA.map(r => ({ i: r.id, n: r.name })),
      C: regs.CSA.map(r => ({ i: r.id, n: r.name })),
      s,
    };
  }

  // Grand Campaign: pack tokens, map features, and national pools so the
  // shared map actually shows the board — not just the territory ownership.
  if (campaign.grandCampaign) {
    base.g = encodeGC(campaign.grandCampaign, campaign.victoryPointsUSA, campaign.victoryPointsCSA);
  } else if (viewSide) {
    base.rs = O2C[viewSide];
  }
  // Reach belongs to the standard campaign; the Grand Campaign moves tokens.
  // The water a landing can come by travels with it, so the shared sheet can
  // say where one may go.
  const ways = campaign.grandCampaign ? null : getWaterways(campaign);
  const packReach = (ids) => {
    if (campaign.grandCampaign) return;
    base.rc = encodeReach(campaign, ids, ways);
    if (ways) {
      base.ww = ids.map(id => (ways.get(id) || []).join(''));
      base.hw = {
        U: [...heldWaterways(campaign, 'USA', ways)].join(''),
        C: [...heldWaterways(campaign, 'CSA', ways)].join(''),
      };
    }
    const wr = { U: waterReach(campaign, 'USA'), C: waterReach(campaign, 'CSA') };
    if (wr.U || wr.C) base.wr = wr;
  };

  const tplKey = campaign.mapTemplate;
  const template = tplKey && tplKey !== 'custom' && CAMPAIGN_TEMPLATES[tplKey];

  // Template-based: owner string + sparse overrides
  if (template) {
    const fresh = template.create();
    const campaignMap = new Map(campaign.territories.map(t => [t.id, t]));
    const idToIndex = new Map(fresh.territories.map((t, i) => [t.id, i]));

    let o = '';
    const vp = {};  // index -> changed VP
    const ts = {};  // index -> [turnsRemaining, totalTurns, prevOwnerChar]

    fresh.territories.forEach((tmpl, i) => {
      const t = campaignMap.get(tmpl.id);
      if (!t) { o += 'N'; return; }

      o += O2C[t.owner] || 'N';

      const curVP = t.victoryPoints ?? t.pointValue ?? 0;
      const tplVP = tmpl.victoryPoints ?? tmpl.pointValue ?? 0;
      if (curVP !== tplVP) vp[i] = curVP;

      if (t.transitionState?.isTransitioning) ts[i] = encodeTransition(t.transitionState);
    });

    base.tpl = tplKey;
    base.o = o;
    if (Object.keys(vp).length) base.vp = vp;
    if (Object.keys(ts).length) base.ts = ts;
    if (pending.length) base.p = pending.map(id => idToIndex.get(id)).filter(i => i != null);
    const bm = encodeMarks(campaign, id => idToIndex.get(id));
    if (bm.length) base.bm = bm;
    packReach(fresh.territories.map(t => t.id));
    const h = encodeHistory(campaign, fresh.territories.map(t => t.id), id => idToIndex.get(id));
    if (h.length) base.h = h;

    return base;
  }

  // Custom map fallback: optimized full territory data
  base.territories = campaign.territories.map(t => {
    const entry = {
      id: t.id,
      name: t.name,
      owner: t.owner,
      victoryPoints: t.victoryPoints ?? t.pointValue ?? 0,
      adjacentTerritories: t.adjacentTerritories || [],
    };
    if (t.svgPath && !t.states?.length) entry.svgPath = t.svgPath;
    if (t.center) entry.center = t.center;
    if (t.labelPosition) entry.labelPosition = t.labelPosition;
    if (t.countyFips?.length) entry.countyFips = t.countyFips;
    if (t.states?.length) entry.states = t.states;
    if (t.isCapital) entry.isCapital = true;
    if (t.transitionState?.isTransitioning) {
      entry.transitionState = {
        isTransitioning: true,
        turnsRemaining: t.transitionState.turnsRemaining,
        totalTurns: t.transitionState.totalTurns,
        previousOwner: t.transitionState.previousOwner,
        ...(t.transitionState.raided ? { raided: true } : {}),
      };
    }
    return entry;
  });
  if (pending.length) base.pendingTerritoryIds = pending;
  const bm = encodeMarks(campaign, id => id);
  if (bm.length) base.bm = bm;
  packReach(campaign.territories.map(t => t.id));
  const h = encodeHistory(campaign, campaign.territories.map(t => t.id), id => id);
  if (h.length) base.h = h;

  return base;
};

/**
 * Normalize a decoded payload into the shape SharedMapView expects.
 */
const decodeRegiments = (rg) => {
  if (!rg) return null;
  const decodeStats = (s) => ({
    wins: s.w || 0, losses: s.l || 0, casualties: s.c || 0,
    spLost: s.sp || 0, vpGained: s.vg || 0, vpLost: s.vl || 0,
    battles: (s.b || []).map(b => ({
      territoryName: b.t, turn: b.tn, won: !!b.w, role: b.r === 'A' ? 'Attacker' : 'Defender',
      mapName: b.m, casualties: b.c || 0, spLost: b.sp || 0, vpGained: b.vg || 0, vpLost: b.vl || 0,
    })),
  });
  const regimentStats = {};
  Object.entries(rg.s || {}).forEach(([id, s]) => { regimentStats[id] = decodeStats(s); });
  return {
    regiments: {
      USA: (rg.U || []).map(r => ({ id: r.i, name: r.n })),
      CSA: (rg.C || []).map(r => ({ id: r.i, name: r.n })),
    },
    regimentStats,
  };
};

/**
 * One side's orders back out of the payload, in the shape `getOrders` returns.
 * `declaredAt` is not carried in a share link, so it comes back null.
 */
const decodeOrder = (o) =>
  (o ? { action: o.a, doctrine: !!o.d, declaredAt: null } : null);

const normalize = (raw, territories, pendingTerritoryIds, keyToId = (key) => key) => {
  const cas = raw.cas;
  const marks = decodeMarks(raw.bm, keyToId);
  const casU = cas?.u || 0, casC = cas?.c || 0;
  const rg = decodeRegiments(raw.rg);
  const gc = decodeGC(raw.g);

  return {
    name: raw.n ?? raw.name,
    turn: raw.tn ?? raw.turn,
    date: raw.d ?? raw.date,
    instantVP: raw.iv != null ? !!raw.iv : raw.instantVP,
    atlasStyle: raw.at != null ? !!raw.at : (raw.atlasStyle ?? true),
    season: raw.se || null,
    battleCount: raw.bc ?? raw.battleCount ?? 0,
    pendingCount: pendingTerritoryIds.length || undefined,
    cpEnabled: raw.cp ? true : (raw.cpEnabled || false),
    cpUSA: raw.cU ?? raw.cpUSA ?? 0,
    cpCSA: raw.cC ?? raw.cpCSA ?? 0,
    income: raw.in ? { USA: raw.in.u || 0, CSA: raw.in.c || 0 } : null,
    spSettings: raw.sp ? {
      vpBase: raw.sp.v,
      attackEnemy: raw.sp.aE,
      attackNeutral: raw.sp.aN,
      defenseFriendly: raw.sp.dF,
      defenseNeutral: raw.sp.dN,
      ticketMode: !!raw.sp.tm,
      ticketCostDivisor: raw.sp.td,
      vpCurve: raw.sp.vc,
    } : raw.spSettings,
    casualties: { usa: casU, csa: casC, total: casU + casC },
    // Older payloads carry no `di`; they simply have no dispatch to show.
    dispatch: Array.isArray(raw.di) ? raw.di : [],
    // Likewise `or` and `l`: absent means no orders were given and no side
    // holds landing rights.
    orders: { USA: decodeOrder(raw.or?.U), CSA: decodeOrder(raw.or?.C) },
    landingRights: { USA: !!raw.l?.U, CSA: !!raw.l?.C },
    regiments: rg?.regiments || null,
    regimentStats: rg?.regimentStats || null,
    territories,
    reach: decodeReach(raw.rc, territories),
    reachSide: C2O[raw.rs] || null,
    waterways: Array.isArray(raw.ww)
      ? new Map(territories.map((t, i) => [t.id, (raw.ww[i] || '').split('')]))
      : null,
    heldWaterways: raw.hw
      ? { USA: (raw.hw.U || '').split(''), CSA: (raw.hw.C || '').split('') }
      : null,
    waterReach: { USA: raw.wr?.U || null, CSA: raw.wr?.C || null },
    pendingTerritoryIds,
    recentTerritoryIds: marks.recentTerritoryIds,
    battleDetails: marks.battleDetails,
    history: decodeHistory(raw.h, territories, keyToId),
    grandCampaign: gc,
  };
};

/**
 * Reconstruct from template + owner string (v2 compact).
 */
const reconstructFromOwnerString = (payload) => {
  const template = CAMPAIGN_TEMPLATES[payload.tpl];
  if (!template) return null;

  const fresh = template.create();
  const vpOverrides = payload.vp || {};
  const tsOverrides = payload.ts || {};
  // GC uses a fresh-ownership influence gradient in the shared view — we
  // don't serialize mid-transition influence. `reseed` lines influence up
  // with the decoded owner so the gradient colour matches the map state.
  const reseedInfluence = !!payload.g && fresh.grandCampaign != null;
  const threshold = fresh.grandCampaign?.settings?.influenceThreshold ?? 0;

  const territories = fresh.territories.map((t, i) => {
    const owner = C2O[payload.o[i]] || 'NEUTRAL';
    const result = { ...t, owner };
    if (vpOverrides[i] != null) {
      result.victoryPoints = vpOverrides[i];
      result.pointValue = vpOverrides[i];
    }
    if (tsOverrides[i]) result.transitionState = decodeTransition(tsOverrides[i]);
    if (reseedInfluence) {
      result.influence = owner === 'USA' ? threshold : owner === 'CSA' ? -threshold : 0;
    }
    return result;
  });

  const pendingTerritoryIds = (payload.p || []).map(i => fresh.territories[i]?.id).filter(Boolean);
  return normalize(payload, territories, pendingTerritoryIds, i => fresh.territories[i]?.id);
};

/**
 * Reconstruct from template + td object (v2 legacy dict format).
 */
const reconstructFromTd = (payload) => {
  const template = CAMPAIGN_TEMPLATES[payload.tpl];
  if (!template) return null;

  const fresh = template.create();
  const territories = fresh.territories.map(t => {
    const dynamic = payload.td[t.id];
    if (!dynamic) return t;
    if (typeof dynamic === 'string') return { ...t, owner: C2O[dynamic] || 'NEUTRAL' };
    const result = { ...t, owner: C2O[dynamic.o] || 'NEUTRAL' };
    if (dynamic.vp != null) { result.victoryPoints = dynamic.vp; result.pointValue = dynamic.vp; }
    if (dynamic.ts) result.transitionState = { isTransitioning: true, turnsRemaining: dynamic.ts.r, totalTurns: dynamic.ts.t, previousOwner: C2O[dynamic.ts.p] || 'NEUTRAL' };
    return result;
  });

  return normalize(payload, territories, payload.pending || []);
};

export const encodeSharePayload = (payload) => compressToEncodedURIComponent(JSON.stringify(payload));

/**
 * Decode a compressed share string. Supports v1 (full), v2/v3 td (dict) and
 * v2/v3 o (owner string) — older links stay readable.
 */
export const decodeSharePayload = (encoded) => {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const p = JSON.parse(json);
    if (!p?.v) return null;

    // V1: full territory data
    if (p.v === 1 && p.territories) return normalize(p, p.territories, p.pendingTerritoryIds || []);

    // V2+ compact: template + owner string
    if (p.v >= 2 && p.tpl && p.o) return reconstructFromOwnerString(p);

    // V2+ legacy: template + td dict
    if (p.v >= 2 && p.tpl && p.td) return reconstructFromTd(p);

    // V2+ custom: full territory data
    if (p.v >= 2 && p.territories) return normalize(p, p.territories, p.pendingTerritoryIds || []);

    return null;
  } catch {
    return null;
  }
};

const shortUrl = (id) => `${window.location.origin + window.location.pathname}#s=${id}`;

/** Long hash-based share URL (client-only fallback). */
export const generateShareUrl = (campaign, opts) => {
  const encoded = encodeSharePayload(createSharePayload(campaign, opts));
  return `${window.location.origin + window.location.pathname}#share=${encoded}`;
};

/**
 * Short server-backed share URL, frozen at the moment it is made. Throws on
 * failure so the caller can fall back.
 */
export const generateShortShareUrl = async (campaign, opts) => {
  const payload = encodeSharePayload(createSharePayload(campaign, opts));
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error('Share API unavailable');
  const { id } = await res.json();
  return shortUrl(id);
};

// ---------------------------------------------------------------------------
// Live links.
//
// One link per tracker that keeps showing the board as it stands: the server
// hands out an id and a write key, the tracker keeps both in this browser and
// republishes to the same id whenever the board changes, and anyone holding
// the link picks the change up without being sent a new one.
//
// The key stays out of the campaign itself, so an exported campaign file
// cannot be used to overwrite the link.
// ---------------------------------------------------------------------------

const LIVE_KEY = 'WarOfRightsCampaignTracker.liveShare';

/** The live link this browser publishes to, as { id, key }, or null. */
export const getLiveShare = () => {
  try {
    const live = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
    return live?.id && live?.key ? live : null;
  } catch {
    return null;
  }
};

const setLiveShare = (live) => {
  try {
    if (live) localStorage.setItem(LIVE_KEY, JSON.stringify(live));
    else localStorage.removeItem(LIVE_KEY);
  } catch {
    // Storage refused - the link still works until the page is closed.
  }
};

export const liveShareUrl = (live) => shortUrl(live.id);

/**
 * The live link, created on first use. Throws when the server cannot be
 * reached, so the caller can fall back to a long snapshot link.
 */
export const ensureLiveShare = async (campaign, opts) => {
  const existing = getLiveShare();
  if (existing) return existing;
  const payload = encodeSharePayload(createSharePayload(campaign, opts));
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, live: true }),
  });
  if (!res.ok) throw new Error('Share API unavailable');
  const { id, key } = await res.json();
  if (!id || !key) throw new Error('Share API unavailable');
  const live = { id, key };
  setLiveShare(live);
  return live;
};

/**
 * Push an already-encoded payload to the live link. Returns false when the
 * server no longer knows the link (or the key), in which case it is dropped
 * and the next share makes a fresh one; network trouble just throws.
 */
export const publishLiveShare = async (live, payload) => {
  const res = await fetch('/api/share', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: live.id, key: live.key, payload }),
  });
  if (res.status === 403 || res.status === 404) {
    if (getLiveShare()?.id === live.id) setLiveShare(null);
    return false;
  }
  if (!res.ok) throw new Error(`Share API error ${res.status}`);
  return true;
};

/** Stop publishing to the live link. The link itself keeps its last board. */
export const forgetLiveShare = () => setLiveShare(null);

/**
 * Fetch a short share by ID: the raw payload, and whether it is a live link
 * that is worth checking again. Null when it cannot be had.
 */
export const fetchSharePayload = async (id) => {
  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { payload, live } = await res.json();
    return typeof payload === 'string' ? { payload, live: !!live } : null;
  } catch {
    return null;
  }
};

/**
 * Read the URL hash. Returns:
 * - decoded share data for legacy #share= links
 * - { pending: true, id } for short #s= links (needs async fetch)
 * - null if no share hash
 */
export const getShareFromUrl = () => {
  const hash = window.location.hash;
  if (hash.startsWith('#s=')) return { pending: true, id: hash.slice(3) };
  if (hash.startsWith('#share=')) return decodeSharePayload(hash.slice(7));
  return null;
};
