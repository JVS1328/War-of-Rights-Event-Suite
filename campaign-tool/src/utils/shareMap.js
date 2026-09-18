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
import { buildTurnSummary, buildDispatchParagraphs } from './turnSummary';

// v3 adds `di` — the turn's dispatch paragraphs, so the share view can print
// "Latest Intelligence". Nothing else moved, so v1 and v2 links still decode.
const V = 3;
const O2C = { 'USA': 'U', 'CSA': 'C', 'NEUTRAL': 'N' };
const C2O = { 'U': 'USA', 'C': 'CSA', 'N': 'NEUTRAL' };

const encodeTransition = (ts) => [ts.turnsRemaining, ts.totalTurns, O2C[ts.previousOwner] || 'N'];
const decodeTransition = ([r, t, p]) => ({ isTransitioning: true, turnsRemaining: r, totalTurns: t, previousOwner: C2O[p] || 'NEUTRAL' });

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
 */
export const createSharePayload = (campaign) => {
  const pending = (campaign.battles || [])
    .filter(b => b.status === 'pending' || !b.winner)
    .map(b => b.territoryId);

  const base = {
    v: V,
    n: campaign.name,
    tn: campaign.currentTurn,
    d: campaign.campaignDate?.displayString || null,
    iv: campaign.settings?.instantVPGains !== false ? 1 : 0,
    // Presentation carries over to a shared link so it looks like the board
    // the admin is actually running.
    at: campaign.settings?.atlasStyle === true ? 1 : 0,
    bc: (campaign.battles || []).filter(b => b.status !== 'pending' && b.winner).length,
  };

  if (campaign.cpSystemEnabled) {
    base.cp = 1;
    base.cU = campaign.combatPowerUSA || 0;
    base.cC = campaign.combatPowerCSA || 0;
    base.sp = {
      v: campaign.settings?.vpBase || 1,
      aE: campaign.settings?.baseAttackCostEnemy ?? 75,
      aN: campaign.settings?.baseAttackCostNeutral ?? 50,
      dF: campaign.settings?.baseDefenseCostFriendly ?? 25,
      dN: campaign.settings?.baseDefenseCostNeutral ?? 50,
    };
  }

  // Casualties totals
  const battles = campaign.battles || [];
  let casU = 0, casC = 0;
  battles.forEach(b => { casU += b.casualties?.USA || 0; casC += b.casualties?.CSA || 0; });
  if (casU || casC) base.cas = { u: casU, c: casC };

  // The turn's write-up, as plain paragraphs. The share view has no campaign
  // state to narrate from, so the prose travels with the link.
  const dispatch = buildDispatchParagraphs(buildTurnSummary(campaign, campaign.currentTurn));
  if (dispatch.length) base.di = dispatch;

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
  }

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
      };
    }
    return entry;
  });
  if (pending.length) base.pendingTerritoryIds = pending;

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

const normalize = (raw, territories, pendingTerritoryIds) => {
  const cas = raw.cas;
  const casU = cas?.u || 0, casC = cas?.c || 0;
  const rg = decodeRegiments(raw.rg);
  const gc = decodeGC(raw.g);

  return {
    name: raw.n ?? raw.name,
    turn: raw.tn ?? raw.turn,
    date: raw.d ?? raw.date,
    instantVP: raw.iv != null ? !!raw.iv : raw.instantVP,
    atlasStyle: raw.at != null ? !!raw.at : (raw.atlasStyle ?? true),
    battleCount: raw.bc ?? raw.battleCount ?? 0,
    pendingCount: pendingTerritoryIds.length || undefined,
    cpEnabled: raw.cp ? true : (raw.cpEnabled || false),
    cpUSA: raw.cU ?? raw.cpUSA ?? 0,
    cpCSA: raw.cC ?? raw.cpCSA ?? 0,
    spSettings: raw.sp ? {
      vpBase: raw.sp.v,
      attackEnemy: raw.sp.aE,
      attackNeutral: raw.sp.aN,
      defenseFriendly: raw.sp.dF,
      defenseNeutral: raw.sp.dN,
    } : raw.spSettings,
    casualties: { usa: casU, csa: casC, total: casU + casC },
    // Older payloads carry no `di`; they simply have no dispatch to show.
    dispatch: Array.isArray(raw.di) ? raw.di : [],
    regiments: rg?.regiments || null,
    regimentStats: rg?.regimentStats || null,
    territories,
    pendingTerritoryIds,
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
  return normalize(payload, territories, pendingTerritoryIds);
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

/** Long hash-based share URL (client-only fallback). */
export const generateShareUrl = (campaign) => {
  const encoded = encodeSharePayload(createSharePayload(campaign));
  return `${window.location.origin + window.location.pathname}#share=${encoded}`;
};

/** Short server-backed share URL. Throws on failure so caller can fallback. */
export const generateShortShareUrl = async (campaign) => {
  const payload = encodeSharePayload(createSharePayload(campaign));
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error('Share API unavailable');
  const { id } = await res.json();
  return `${window.location.origin + window.location.pathname}#s=${id}`;
};

/** Fetch and decode a short share payload by ID. */
export const fetchSharePayload = async (id) => {
  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const { payload } = await res.json();
    return decodeSharePayload(payload);
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
