import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Map, Loader, Plus, Minus, Maximize2 } from 'lucide-react';
import { usaStates } from '../data/usaStates';
import { getMaxBattleCPCosts, getVPMultiplier } from '../utils/cpSystem';
import { isTerritorySupplied } from '../utils/supplyLines';
import { generateTerrainPatterns, resolvePatternId, DEFAULT_TERRAIN_VIZ } from '../utils/terrainPatterns.jsx';
import { usePanZoom } from '../utils/usePanZoom';
import { useCoarsePointer } from '../utils/useMediaQuery';

// Cache for county GeoJSON data
let countyGeoJsonCache = null;
let countyPathsCache = {};

/**
 * Fetch and cache county GeoJSON
 */
const fetchCountyGeoJson = async () => {
  if (countyGeoJsonCache) return countyGeoJsonCache;

  const response = await fetch('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json');
  const data = await response.json();
  countyGeoJsonCache = data;
  return data;
};

/**
 * Convert GeoJSON coordinates to SVG path
 */
const coordinatesToSvgPath = (coordinates, bounds, width = 1000, height = 589) => {
  const { minLon, maxLon, minLat, maxLat } = bounds;
  const padding = 20;
  const scaleX = (width - padding * 2) / (maxLon - minLon);
  const scaleY = (height - padding * 2) / (maxLat - minLat);

  const project = ([lon, lat]) => {
    const x = padding + (lon - minLon) * scaleX;
    const y = height - (padding + (lat - minLat) * scaleY);
    return [x, y];
  };

  const pathParts = [];
  const polygons = coordinates[0]?.[0]?.[0] instanceof Array ? coordinates : [coordinates];

  polygons.forEach(polygon => {
    polygon.forEach(ring => {
      ring.forEach((coord, i) => {
        const [x, y] = project(coord);
        pathParts.push(i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`);
      });
      pathParts.push('Z');
    });
  });

  return pathParts.join(' ');
};

/**
 * Calculate bounds for a set of FIPS codes
 */
const calculateBoundsForFips = (geoJson, allFips) => {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  const fipsSet = new Set(allFips);

  geoJson.features.forEach(feature => {
    const fips = feature.id || feature.properties?.GEOID;
    if (!fipsSet.has(fips)) return;

    const coords = feature.geometry?.coordinates;
    if (!coords) return;

    const polygons = coords[0]?.[0]?.[0] instanceof Array ? coords : [coords];
    polygons.forEach(polygon => {
      polygon.forEach(ring => {
        ring.forEach(([lon, lat]) => {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        });
      });
    });
  });

  return { minLon, maxLon, minLat, maxLat };
};

/**
 * Convert FIPS codes to SVG paths
 */
/**
 * Counties around the play area, for the out-of-theatre backdrop.
 *
 * Everything inside the map's bounding box that no territory claims - the
 * neighbouring states and the rest of the states the theatre cuts through.
 * Drawn dim and non-interactive so the board is framed by land rather than
 * sitting in black space, and so the edge of the campaign reads as fog rather
 * than as the edge of the world.
 */
const convertSurroundingToPaths = (geoJson, claimedFips, bounds, pad = 0.12) => {
  const claimed = new Set(claimedFips);
  const spanLon = bounds.maxLon - bounds.minLon;
  const spanLat = bounds.maxLat - bounds.minLat;
  const box = {
    minLon: bounds.minLon - spanLon * pad,
    maxLon: bounds.maxLon + spanLon * pad,
    minLat: bounds.minLat - spanLat * pad,
    maxLat: bounds.maxLat + spanLat * pad,
  };

  const paths = [];
  geoJson.features.forEach(feature => {
    const fips = feature.id || feature.properties?.GEOID;
    if (!fips || claimed.has(fips)) return;
    const coords = feature.geometry?.coordinates;
    if (!coords) return;

    // Cheap bbox reject: keep a county if any vertex falls in the padded box.
    let near = false;
    const scan = (node) => {
      if (near) return;
      if (typeof node[0] === 'number') {
        const [lon, lat] = node;
        if (lon >= box.minLon && lon <= box.maxLon && lat >= box.minLat && lat <= box.maxLat) near = true;
        return;
      }
      for (const child of node) scan(child);
    };
    scan(coords);
    if (!near) return;

    paths.push({ fips, svgPath: coordinatesToSvgPath(coords, bounds) });
  });

  return paths;
};

const convertFipsToPaths = (geoJson, fipsCodes, bounds) => {
  const fipsSet = new Set(fipsCodes);
  const paths = [];

  geoJson.features.forEach(feature => {
    const fips = feature.id || feature.properties?.GEOID;
    if (!fipsSet.has(fips)) return;

    const coords = feature.geometry?.coordinates;
    if (!coords) return;

    paths.push({
      fips,
      svgPath: coordinatesToSvgPath(coords, bounds)
    });
  });

  return paths;
};

const MapView = ({
  territories,
  selectedTerritory,
  onTerritoryClick,
  onTerritoryDoubleClick,
  onTerritoryCtrlDoubleClick,
  isCountyView = false,
  // 1860s atlas presentation: parchment ground, plate tints, inked borders.
  atlasStyle = false,
  pendingBattleTerritoryIds = [],
  recentBattleTerritoryIds = [],
  spSettings = null,
  terrainViz = null,
  tokens = null,          // Grand Campaign: array of tokens to render as overlays
  moveModeTokenId = null, // Grand Campaign: id of token awaiting placement
  onMapClick = null,      // Grand Campaign: called with { x, y } in SVG coords when in move mode
  onTokenClick = null,    // Grand Campaign: called with a token object on click
  mapFeatures = null,     // Grand Campaign: { cities, forts, stations, railways, rivers }
  featureTool = null,     // Grand Campaign: 'city' | 'fort' | 'station' | 'railway' | 'river' | null
  lineDraft = null,       // Grand Campaign: [{x,y},...] points already clicked for in-progress polyline
  interactionLocked = false, // Any edit/setup mode active — suppresses territory click handlers.
  influenceThreshold = 0, // Grand Campaign: when > 0, territory.influence drives gradient colour.
  rulerFromPoint = null, // Grand Campaign: {x,y} SVG origin for the live movement ruler.
  rulerEvaluator = null, // Grand Campaign: fn(point) -> { miles, cost, mode, valid, reason }
  readOnly = false,      // Share view: hide hints for interactions that aren't available.
}) => {
  const [hoveredTerritory, setHoveredTerritory] = useState(null);
  const [countyPaths, setCountyPaths] = useState({});
  // Counties around the play area, drawn as an out-of-theatre backdrop.
  const [surroundingPaths, setSurroundingPaths] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [bounds, setBounds] = useState(null);

  // Pan/zoom lives in a hook so mouse, wheel and touch all drive one view.
  const panZoom = usePanZoom(1000);

  // Touch devices have no hover and no modifier keys, so the Ctrl-gated
  // gestures below need a tap-shaped equivalent.
  const isTouch = useCoarsePointer();

  // Mouse position relative to map container (for tooltip placement)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  // Cursor in SVG viewBox coords — updated inside handleMouseMove when the
  // ruler is active, so the ruler overlay can render live.
  const [svgCursor, setSvgCursor] = useState(null);
  const mapContainerRef = useRef(null);

  // Click timeout ref to distinguish single-click from double-click
  const clickTimeoutRef = useRef(null);
  const lastClickEventRef = useRef(null);

  // SVG refs used for coordinate conversion (Grand Campaign move-mode placement)
  const svgRef = panZoom.elementRef;
  const transformGroupRef = useRef(null);

  // Track whether Ctrl/Cmd is currently held — the territory tooltip only
  // shows while it is, and single-click only pins while it is.
  const [ctrlHeld, setCtrlHeld] = useState(false);
  useEffect(() => {
    const sync = (e) => setCtrlHeld(e.ctrlKey || e.metaKey);
    const clear = () => setCtrlHeld(false);
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    // If focus leaves the window we can't see a keyup — reset defensively.
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // Convert a client (screen) point to SVG viewBox coordinates, accounting
  // for the <g> pan/zoom transform. Used when placing / moving tokens.
  const clientToSvgCoords = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    const g = transformGroupRef.current;
    if (!svg || !g) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = g.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const svgP = pt.matrixTransform(inv);
    return { x: svgP.x, y: svgP.y };
  }, []);

  // Territory click routing:
  //   Ctrl+single-click  → pin / unpin the tooltip (onTerritoryClick)
  //   Plain single-click → no-op with a mouse, pins on touch
  //   Double-click       → open battle recorder
  //   Ctrl+double-click  → open territory editor
  const handleTerritoryPathClick = useCallback((territory, e) => {
    // In any edit/setup mode, territories don't respond — SVG-level handler takes over.
    if (moveModeTokenId || featureTool || interactionLocked) return;
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      if ((lastClickEventRef.current?.ctrlKey || lastClickEventRef.current?.metaKey) &&
          (e?.ctrlKey || e?.metaKey)) {
        onTerritoryCtrlDoubleClick?.(territory);
      } else {
        onTerritoryDoubleClick?.(territory);
      }
      lastClickEventRef.current = null;
    } else {
      lastClickEventRef.current = e;
      const wasCtrlSingle = !!(e?.ctrlKey || e?.metaKey);
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        lastClickEventRef.current = null;
        // Ctrl/Cmd + click pins. A plain click is a no-op with a mouse, where
        // hovering already shows the tooltip — but on touch it is the only
        // gesture there is, so a tap pins.
        if (wasCtrlSingle || isTouch) onTerritoryClick(territory);
      }, 250);
    }
  }, [onTerritoryClick, onTerritoryDoubleClick, onTerritoryCtrlDoubleClick, moveModeTokenId, featureTool, interactionLocked, isTouch]);

  // Map-level click for token move mode OR feature edit tools OR setup
  // placement — fires onMapClick with { x, y, territoryId } in SVG coords.
  // Shift-clicks are pan gestures and ignored.
  const handleSvgClick = useCallback((e) => {
    if (!onMapClick) return;
    if (e.shiftKey) return;
    const point = clientToSvgCoords(e.clientX, e.clientY);
    if (!point) return;
    // Identify the territory at the click point via the DOM stack (topmost
    // element under the cursor that carries a data-territory-id).
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const territoryEl = stack.find(el => el?.dataset?.territoryId);
    const territoryId = territoryEl?.dataset?.territoryId || null;
    onMapClick({ ...point, territoryId });
  }, [onMapClick, clientToSvgCoords]);

  // Cleanup click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    };
  }, []);

  // Check if any territory has countyFips
  const hasCountyData = useMemo(() => {
    return territories.some(t => t.countyFips && t.countyFips.length > 0);
  }, [territories]);

  // Merge provided viz with defaults so every terrain group has a pattern definition
  const vizConfig = useMemo(() => ({ ...DEFAULT_TERRAIN_VIZ, ...terrainViz }), [terrainViz]);

  // Load county data when needed
  useEffect(() => {
    if (!hasCountyData) return;

    const loadCountyData = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const geoJson = await fetchCountyGeoJson();

        // Collect all FIPS codes from all territories
        const allFips = [];
        territories.forEach(t => {
          if (t.countyFips) {
            allFips.push(...t.countyFips);
          }
        });

        // Calculate bounds for all counties
        const calculatedBounds = calculateBoundsForFips(geoJson, allFips);
        setBounds(calculatedBounds);

        // Convert each territory's FIPS codes to paths
        const pathsByTerritory = {};
        territories.forEach(t => {
          if (t.countyFips && t.countyFips.length > 0) {
            pathsByTerritory[t.id] = convertFipsToPaths(geoJson, t.countyFips, calculatedBounds);
          }
        });

        setCountyPaths(pathsByTerritory);
        setSurroundingPaths(convertSurroundingToPaths(geoJson, allFips, calculatedBounds));
      } catch (error) {
        console.error('Failed to load county data:', error);
        setLoadError('Failed to load county map data');
      } finally {
        setIsLoading(false);
      }
    };

    loadCountyData();
  }, [territories, hasCountyData]);

  // Helper to get base color for an owner.
  //
  // Atlas mode swaps the screen palette for the flat, chalky plate tints a
  // hand-coloured 1860s map was washed with - the colours sit on the paper
  // rather than glowing off it.
  const getOwnerColor = (owner) => {
    if (atlasStyle) {
      if (owner === 'USA') return '#7d93ad';     // faded indigo wash
      if (owner === 'CSA') return '#c08a7d';     // madder red wash
      if (owner === 'NEUTRAL') return '#cbb06a'; // ochre
      return '#b4a888';                          // bare plate
    }
    if (owner === 'USA') return '#3b82f6'; // Blue
    if (owner === 'CSA') return '#ef4444'; // Red
    if (owner === 'NEUTRAL') return '#f59e0b'; // Orange
    return '#64748b'; // Gray (unassigned)
  };

  // Helper to interpolate between two hex colors
  const interpolateColor = (color1, color2, factor) => {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const getTerritoryColor = (territory) => {
    // Grand Campaign: blend the side colour with neutral amber based on how
    // saturated the territory's influence is. Fully held = full side colour;
    // freshly contested = amber mixed in.
    if (typeof territory.influence === 'number' && influenceThreshold > 0) {
      const strength = Math.min(1, Math.abs(territory.influence) / influenceThreshold);
      if (territory.influence === 0) return '#f59e0b';
      const sideColor = territory.influence > 0 ? '#3b82f6' : '#ef4444';
      return interpolateColor('#f59e0b', sideColor, strength);
    }
    if (territory.transitionState?.isTransitioning) {
      const transition = territory.transitionState;
      const previousColor = getOwnerColor(transition.previousOwner);
      const newColor = getOwnerColor(territory.owner);
      const turnsElapsed = transition.totalTurns - transition.turnsRemaining;
      const progress = turnsElapsed / transition.totalTurns;
      return interpolateColor(previousColor, newColor, progress);
    }
    return getOwnerColor(territory.owner);
  };

  const getTerritoryStroke = (territory) => {
    if (selectedTerritory?.id === territory.id) return '#fbbf24';
    if (hoveredTerritory?.id === territory.id) return '#fbbf24';
    return atlasStyle ? '#6b5836' : '#1e293b';
  };

  const getStrokeWidth = (territory) => {
    if (selectedTerritory?.id === territory.id) return hasCountyData ? '2' : '4';
    if (hoveredTerritory?.id === territory.id) return hasCountyData ? '1.5' : '3';
    return hasCountyData ? '0.5' : '2';
  };

  // Panning and zooming belong to usePanZoom; this only tracks where the
  // cursor is, for the tooltip and the movement ruler.
  const handleMouseMove = (e) => {
    if (mapContainerRef.current) {
      const rect = mapContainerRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    // Live SVG-coord cursor for the movement ruler.
    if (rulerFromPoint) {
      const pt = clientToSvgCoords(e.clientX, e.clientY);
      if (pt) setSvgCursor(pt);
    } else if (svgCursor) {
      setSvgCursor(null);
    }
  };

  // Render loading state for county view
  if (hasCountyData && isLoading) {
    return (
      <div className="ui-card">
        <div className="ui-card-head">
          <h2 className="ui-title">
            <Map className="w-4 h-4" />
            Campaign Map
          </h2>
        </div>
        <div className="relative m-3 rounded-xl bg-ink-950 border border-ink-700 p-4 h-96 flex items-center justify-center">
          <div className="text-center">
            <Loader className="w-10 h-10 text-brass-400 animate-spin mx-auto mb-4" />
            <p className="text-mist-400 text-sm">Loading county map data…</p>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (loadError) {
    return (
      <div className="ui-card">
        <div className="ui-card-head">
          <h2 className="ui-title">
            <Map className="w-4 h-4" />
            Campaign Map
          </h2>
        </div>
        <div className="relative m-3 rounded-xl bg-ink-950 border border-ink-700 p-4 h-96 flex items-center justify-center">
          <div className="text-center text-rebel-400">
            <p className="mb-2 text-sm">{loadError}</p>
            <p className="text-xs text-mist-500">Try refreshing the page</p>
          </div>
        </div>
      </div>
    );
  }

  // Compute bounding box center from SVG path data (for territories without explicit center)
  const getPathsCenter = (pathsArray) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { svgPath } of pathsArray) {
      const re = /[ML]\s*(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/gi;
      let match;
      while ((match = re.exec(svgPath)) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (minX === Infinity) return null;
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  };

  // Resolve center for any territory type, falling back to SVG path computation
  const getTerritoryCenter = (territory) => {
    if (territory.center) return territory.center;
    if (territory.labelPosition) return territory.labelPosition;
    if (territory.countyFips && countyPaths[territory.id]) {
      return getPathsCenter(countyPaths[territory.id]);
    }
    if (territory.countyPaths?.length > 0) {
      return getPathsCenter(territory.countyPaths);
    }
    if (territory.states?.length > 0) {
      const statePaths = territory.states
        .map(abbr => usaStates.find(s => s.abbreviation === abbr))
        .filter(Boolean)
        .map(s => ({ svgPath: s.svgPath }));
      if (statePaths.length > 0) return getPathsCenter(statePaths);
    }
    return null;
  };

  // Smoke layer configs for battle effects (top-down battlefield view)
  // Active: dense rolling musket clouds with wind drift
  // Aftermath: lighter dissipating smoke, no flashes
  const SMOKE_LAYERS = {
    active: [
      { dx: -2, dy: 1, rx: 20, ry: 15, dur: '6s', delay: '0s', peak: 0.45, color: '#6b7280' },
      { dx: 3, dy: -2, rx: 18, ry: 13, dur: '7s', delay: '1.2s', peak: 0.4, color: '#78716c' },
      { dx: -5, dy: -3, rx: 16, ry: 14, dur: '6.5s', delay: '2.5s', peak: 0.38, color: '#6b7280' },
      { dx: 4, dy: 4, rx: 17, ry: 12, dur: '7.5s', delay: '0.7s', peak: 0.35, color: '#9ca3af' },
      { dx: 8, dy: -2, rx: 14, ry: 10, dur: '5.5s', delay: '1.8s', peak: 0.28, color: '#9ca3af' },
      { dx: -6, dy: 5, rx: 15, ry: 11, dur: '8s', delay: '3.2s', peak: 0.3, color: '#78716c' },
      { dx: 12, dy: -5, rx: 10, ry: 8, dur: '5s', delay: '0.4s', peak: 0.18, color: '#d1d5db' },
    ],
    aftermath: [
      { dx: 0, dy: 0, rx: 16, ry: 12, dur: '9s', delay: '0s', peak: 0.2, color: '#9ca3af' },
      { dx: -4, dy: -3, rx: 13, ry: 10, dur: '10s', delay: '2.5s', peak: 0.15, color: '#d1d5db' },
      { dx: 5, dy: 2, rx: 12, ry: 9, dur: '11s', delay: '5s', peak: 0.15, color: '#9ca3af' },
    ],
  };

  const WIND = { active: { dx: 15, dy: -6 }, aftermath: { dx: 8, dy: -3 } };

  // Unified battle effects renderer — 'active' for ongoing, 'aftermath' for recently fought
  const renderBattleEffects = (cx, cy, intensity = 'active') => {
    const layers = SMOKE_LAYERS[intensity];
    const wind = WIND[intensity];
    const isActive = intensity === 'active';

    return (
      <g className="pointer-events-none" filter="url(#battle-smoke)">
        {layers.map((layer, i) => (
          <ellipse
            key={i}
            cx={cx + layer.dx}
            cy={cy + layer.dy}
            rx="0"
            ry="0"
            fill={layer.color}
            opacity="0"
          >
            <animate attributeName="opacity" values={`0;${layer.peak};${layer.peak * 0.8};${layer.peak * 0.5};0`} dur={layer.dur} begin={layer.delay} repeatCount="indefinite" />
            <animate attributeName="rx" values={`${layer.rx * 0.2};${layer.rx * 0.6};${layer.rx}`} dur={layer.dur} begin={layer.delay} repeatCount="indefinite" />
            <animate attributeName="ry" values={`${layer.ry * 0.2};${layer.ry * 0.6};${layer.ry}`} dur={layer.dur} begin={layer.delay} repeatCount="indefinite" />
            <animate attributeName="cx" values={`${cx + layer.dx};${cx + layer.dx + wind.dx}`} dur={layer.dur} begin={layer.delay} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${cy + layer.dy};${cy + layer.dy + wind.dy}`} dur={layer.dur} begin={layer.delay} repeatCount="indefinite" />
          </ellipse>
        ))}
        {isActive && (
          <>
            <circle cx={cx - 6} cy={cy - 2} fill="#fbbf24" opacity="0">
              <animate attributeName="opacity" values="0;0;0.9;0.4;0;0;0;0;0;0" dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="r" values="1;1;7;3;1;1;1;1;1;1" dur="2.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={cx + 5} cy={cy + 3} fill="#fb923c" opacity="0">
              <animate attributeName="opacity" values="0;0;0;0;0;0.85;0.3;0;0;0" dur="3.5s" begin="1.2s" repeatCount="indefinite" />
              <animate attributeName="r" values="1;1;1;1;1;6;2;1;1;1" dur="3.5s" begin="1.2s" repeatCount="indefinite" />
            </circle>
            <circle cx={cx + 1} cy={cy - 5} fill="#fde68a" opacity="0">
              <animate attributeName="opacity" values="0;0;0;0.95;0;0;0;0" dur="4s" begin="2.5s" repeatCount="indefinite" />
              <animate attributeName="r" values="1;1;1;5;1;1;1;1" dur="4s" begin="2.5s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </g>
    );
  };

  // Terrain overlay — returns pattern ID + opacity for a territory's dominant terrain
  const getTerrainOverlay = (territory) => {
    const weights = territory.terrainWeights;
    if (!weights) return null;
    const entries = Object.entries(weights);
    if (entries.length === 0) return null;

    const [dominant, dominantWeight] = entries.reduce((best, curr) => curr[1] > best[1] ? curr : best);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    const dominance = dominantWeight / total;

    return { patternId: resolvePatternId(dominant, dominance, vizConfig), opacity: 0.08 + dominance * 0.14 };
  };

  // Render terrain pattern overlay on territory paths (DRY across all 4 rendering modes)
  const renderTerrainOverlay = (svgPaths, territory) => {
    const overlay = getTerrainOverlay(territory);
    if (!overlay) return null;
    return svgPaths.map((path, i) => (
      <path
        key={`terrain-${i}`}
        d={typeof path === 'string' ? path : path.svgPath}
        fill={`url(#${overlay.patternId})`}
        opacity={overlay.opacity}
        className="pointer-events-none"
      />
    ));
  };

  return (
    <div className="ui-card">
      <div className="ui-card-head">
        <h2 className="ui-title">
          <Map className="w-4 h-4" />
          Campaign Map
          {hasCountyData && <span className="text-mist-500 font-normal normal-case tracking-normal">County view</span>}
        </h2>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-2 ml-auto">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 text-mist-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-union-500" />USA
            </span>
            <span className="flex items-center gap-1.5 text-mist-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-rebel-500" />CSA
            </span>
            <span className="flex items-center gap-1.5 text-mist-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />Neutral
            </span>
          </div>

          {/* Zoom controls. The only way in without a scroll wheel, and they
              live here rather than over the map so they never eat a tap
              aimed at a territory underneath. */}
          <div className="flex items-center gap-1">
            {[
              { key: 'in', icon: Plus, label: 'Zoom in', onClick: () => panZoom.zoomBy(1.4) },
              { key: 'out', icon: Minus, label: 'Zoom out', onClick: () => panZoom.zoomBy(1 / 1.4) },
              { key: 'reset', icon: Maximize2, label: 'Reset view', onClick: panZoom.reset, needsView: true },
            ].map(({ key, icon: Icon, label, onClick, needsView }) => (
              <button
                key={key}
                onClick={onClick}
                disabled={needsView && panZoom.isDefaultView}
                title={label}
                aria-label={label}
                className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon"
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={mapContainerRef}
        className={`relative m-2 sm:m-3 rounded-xl border p-2 sm:p-3 ${
          atlasStyle ? 'border-[#8b7a52]' : 'bg-ink-950 border-ink-700'
        }`}
        style={atlasStyle ? {
          // Aged plate: warm paper with the foxing heavier toward the edges.
          background:
            'radial-gradient(ellipse at 50% 45%, #f2e4c4 0%, #e8d6ae 45%, #d8c294 75%, #c9b184 100%)',
        } : undefined}
        onMouseMove={handleMouseMove}
      >
        <svg
          ref={panZoom.attachRef}
          viewBox="0 0 1000 589"
          className="w-full h-full"
          style={{
            cursor: (moveModeTokenId || featureTool || interactionLocked)
              ? 'crosshair'
              : (panZoom.isPanning ? 'grabbing' : 'default'),
            touchAction: panZoom.touchAction,
          }}
          onMouseDown={panZoom.onMouseDown}
          onTouchStart={panZoom.onTouchStart}
          onTouchMove={panZoom.onTouchMove}
          onTouchEnd={panZoom.onTouchEnd}
          onClick={handleSvgClick}
        >
          <defs>
            {/* Out-of-theatre fog: land fades out toward the edge of the board */}
            <radialGradient id="fog-fade" cx="50%" cy="50%" r="62%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="80%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
            </radialGradient>
            <mask id="fog-mask">
              <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#fog-fade)" />
            </mask>

            {/* 1860s atlas: laid-paper grain, plus a warm plate tint. The grain
                is a fixed-seed turbulence so the texture doesn't crawl. */}
            <filter id="atlas-paper" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="7" result="grain" />
              <feColorMatrix in="grain" type="saturate" values="0" result="grey" />
              <feComponentTransfer in="grey" result="soft">
                <feFuncA type="linear" slope="0.09" intercept="0" />
              </feComponentTransfer>
              <feComposite in="soft" in2="SourceGraphic" operator="atop" />
            </filter>
            <filter id="atlas-ink" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="11" result="wobble" />
              <feDisplacementMap in="SourceGraphic" in2="wobble" scale="1.4"
                                 xChannelSelector="R" yChannelSelector="G" />
            </filter>

            <filter id="battle-smoke" x="-100%" y="-100%" width="300%" height="300%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="3" result="noise">
                <animate attributeName="seed" values="1;2;3;4;5;6;7;8;9;10" dur="8s" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="G" result="displaced" />
              <feGaussianBlur in="displaced" stdDeviation="1.5" />
            </filter>
            {/* Terrain patterns — generated from vizConfig for all terrain groups */}
            {Object.entries(vizConfig).flatMap(([name, cfg]) => generateTerrainPatterns(name, cfg))}
          </defs>
          {/* Sea. Sits under every layer and outside the pan/zoom group so it
              fills the frame whatever the view, which is what stops the Gulf
              and the Atlantic reading as a hole in the board. In atlas mode
              it's a translucent wash so the paper still reads through it. */}
          <rect
            x="0" y="0" width="1000" height="589"
            fill={atlasStyle ? '#9db4bd' : '#15324e'}
            opacity={atlasStyle ? 0.5 : 1}
            pointerEvents="none"
          />

          <g ref={transformGroupRef} transform={panZoom.transform} filter={atlasStyle ? "url(#atlas-ink)" : undefined}>
            {/* Out-of-theatre backdrop. Land beyond the campaign, dimmed and
                faded toward the edges so the board sits in country rather than
                in black space. Non-interactive - it is scenery, not ground. */}
            {surroundingPaths.length > 0 && (
              <g mask="url(#fog-mask)" pointerEvents="none" aria-hidden="true">
                {surroundingPaths.map((county) => (
                  <path
                    key={`fog-${county.fips}`}
                    d={county.svgPath}
                    fill={atlasStyle ? '#d7c6a0' : '#353d4b'}
                    stroke={atlasStyle ? '#9c8a63' : '#49525f'}
                    strokeWidth="0.5"
                  />
                ))}
              </g>
            )}

            {/* Territory polygons */}
            {territories.map(territory => {
              const center = getTerritoryCenter(territory);
              const labelX = center?.x;
              const labelY = center?.y;
              const hasPendingBattle = pendingBattleTerritoryIds.includes(territory.id);
              const hasRecentBattle = !hasPendingBattle && recentBattleTerritoryIds.includes(territory.id);

              // For county-based territories, render each county
              if (territory.countyFips && countyPaths[territory.id]) {
                const paths = countyPaths[territory.id];
                return (
                  <g key={territory.id}>
                    {paths.map((county, idx) => (
                      <path
                        key={`${territory.id}-${county.fips || idx}`}
                        d={county.svgPath}
                        fill={getTerritoryColor(territory)}
                        stroke={getTerritoryStroke(territory)}
                        strokeWidth={getStrokeWidth(territory)}
                        className="cursor-pointer hover:opacity-80 transition-all"
                        onClick={(e) => handleTerritoryPathClick(territory, e)}
                        onMouseEnter={() => setHoveredTerritory(territory)}
                        onMouseLeave={() => setHoveredTerritory(null)}
                        data-territory-id={territory.id}
                      />
                    ))}
                    {renderTerrainOverlay(paths, territory)}
                    {hasPendingBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'active')}
                    {hasRecentBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'aftermath')}
                  </g>
                );
              }

              // For grouped state-based territories, render each state individually
              if (territory.states && territory.states.length > 0) {
                return (
                  <g key={territory.id}>
                    {territory.states.map(stateAbbr => {
                      const state = usaStates.find(s => s.abbreviation === stateAbbr);
                      if (!state) return null;

                      return (
                        <path
                          key={`${territory.id}-${stateAbbr}`}
                          d={state.svgPath}
                          fill={getTerritoryColor(territory)}
                          stroke={getTerritoryStroke(territory)}
                          strokeWidth={getStrokeWidth(territory)}
                          className="cursor-pointer hover:opacity-80 transition-all"
                          onClick={(e) => handleTerritoryPathClick(territory, e)}
                          onMouseEnter={() => setHoveredTerritory(territory)}
                          onMouseLeave={() => setHoveredTerritory(null)}
                          data-territory-id={territory.id}
                        />
                      );
                    })}
                    {renderTerrainOverlay(
                      territory.states.map(a => usaStates.find(s => s.abbreviation === a)).filter(Boolean),
                      territory
                    )}
                    {territory.isCapital && (
                      <circle
                        cx={labelX}
                        cy={labelY}
                        r="5"
                        fill="#fbbf24"
                        stroke={atlasStyle ? "#5c4a2f" : "#1e293b"}
                        strokeWidth="2"
                        className="pointer-events-none"
                      />
                    )}
                    {hasPendingBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'active')}
                    {hasRecentBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'aftermath')}
                  </g>
                );
              }

              // For grouped county-based territories (pre-loaded paths)
              if (territory.countyPaths && territory.countyPaths.length > 0) {
                return (
                  <g key={territory.id}>
                    {territory.countyPaths.map(county => (
                      <path
                        key={`${territory.id}-${county.id}`}
                        d={county.svgPath}
                        fill={getTerritoryColor(territory)}
                        stroke={getTerritoryStroke(territory)}
                        strokeWidth={getStrokeWidth(territory)}
                        className="cursor-pointer hover:opacity-80 transition-all"
                        onClick={(e) => handleTerritoryPathClick(territory, e)}
                        onMouseEnter={() => setHoveredTerritory(territory)}
                        onMouseLeave={() => setHoveredTerritory(null)}
                        data-territory-id={territory.id}
                      />
                    ))}
                    {renderTerrainOverlay(territory.countyPaths, territory)}
                    {territory.isCapital && (
                      <circle
                        cx={labelX}
                        cy={labelY}
                        r="5"
                        fill="#fbbf24"
                        stroke={atlasStyle ? "#5c4a2f" : "#1e293b"}
                        strokeWidth="2"
                        className="pointer-events-none"
                      />
                    )}
                    {hasPendingBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'active')}
                    {hasRecentBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'aftermath')}
                  </g>
                );
              }

              // For other territories (legacy), use combined svgPath
              const pathData = territory.svgPath || territory.coordinates?.data;
              if (!pathData) return null;

              return (
                <g key={territory.id}>
                  <path
                    d={pathData}
                    fill={getTerritoryColor(territory)}
                    stroke={getTerritoryStroke(territory)}
                    strokeWidth={getStrokeWidth(territory)}
                    className="cursor-pointer hover:opacity-80 transition-all"
                    onClick={(e) => handleTerritoryPathClick(territory, e)}
                    onMouseEnter={() => setHoveredTerritory(territory)}
                    onMouseLeave={() => setHoveredTerritory(null)}
                    data-territory-id={territory.id}
                  />
                  {renderTerrainOverlay([pathData], territory)}
                  {territory.isCapital && (
                    <circle
                      cx={labelX}
                      cy={labelY}
                      r="5"
                      fill="#fbbf24"
                      stroke={atlasStyle ? "#5c4a2f" : "#1e293b"}
                      strokeWidth="2"
                      className="pointer-events-none"
                    />
                  )}
                  {hasPendingBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'active')}
                    {hasRecentBattle && labelX && labelY && renderBattleEffects(labelX, labelY, 'aftermath')}
                </g>
              );
            })}

            {/* Grand Campaign map features — rivers + rails drawn under points so
                cities/forts/stations sit on top. Tokens render last (topmost). */}
            {mapFeatures?.rivers?.map(river => (
              <polyline
                key={river.id}
                points={river.points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
                className="pointer-events-none"
              />
            ))}
            {mapFeatures?.railways?.map(rail => (
              <g key={rail.id} className="pointer-events-none">
                <polyline
                  points={rail.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={rail.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="1,2"
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* In-progress polyline preview while user is drawing */}
            {lineDraft && lineDraft.length > 0 && featureTool && (featureTool === 'railway' || featureTool === 'river') && (
              <g className="pointer-events-none">
                <polyline
                  points={lineDraft.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={featureTool === 'river' ? '#0ea5e9' : '#e2e8f0'}
                  strokeWidth="2"
                  strokeDasharray="3,2"
                  opacity="0.9"
                />
                {lineDraft.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="2" fill="#fbbf24" />
                ))}
              </g>
            )}

            {/* Stations — small circle with cross bar */}
            {mapFeatures?.stations?.map(s => (
              <g key={s.id} className="pointer-events-none">
                <circle cx={s.x} cy={s.y} r="3.5" fill="#475569" stroke="#0f172a" strokeWidth="0.8" />
                <line x1={s.x - 2.2} y1={s.y} x2={s.x + 2.2} y2={s.y} stroke="#e2e8f0" strokeWidth="0.8" />
                <text x={s.x} y={s.y + 8} textAnchor="middle" fontSize="4" fill="#cbd5e1" className="select-none">
                  {s.name}
                </text>
              </g>
            ))}

            {/* Forts — square + diagonal cross */}
            {mapFeatures?.forts?.map(f => {
              const fill = f.side === 'USA' ? '#3b82f6' : f.side === 'CSA' ? '#ef4444' : '#f59e0b';
              return (
                <g key={f.id} className="pointer-events-none">
                  <rect x={f.x - 4} y={f.y - 4} width="8" height="8" fill={fill} stroke="#0f172a" strokeWidth="1" />
                  <line x1={f.x - 4} y1={f.y - 4} x2={f.x + 4} y2={f.y + 4} stroke="#0f172a" strokeWidth="0.8" />
                  <line x1={f.x + 4} y1={f.y - 4} x2={f.x - 4} y2={f.y + 4} stroke="#0f172a" strokeWidth="0.8" />
                  <text x={f.x} y={f.y + 10} textAnchor="middle" fontSize="4" fontWeight="bold" fill="#fef3c7" stroke="#0f172a" strokeWidth="0.3" paintOrder="stroke" className="select-none">
                    {f.name}
                  </text>
                </g>
              );
            })}

            {/* Cities — diamond, capitals get a gold star ring */}
            {mapFeatures?.cities?.map(c => {
              const fill = c.side === 'USA' ? '#3b82f6' : c.side === 'CSA' ? '#ef4444' : '#f59e0b';
              return (
                <g key={c.id} className="pointer-events-none">
                  {c.isCapital && (
                    <circle cx={c.x} cy={c.y} r="8" fill="none" stroke="#fbbf24" strokeWidth="1.2" />
                  )}
                  <polygon
                    points={`${c.x},${c.y - 5} ${c.x + 5},${c.y} ${c.x},${c.y + 5} ${c.x - 5},${c.y}`}
                    fill={fill}
                    stroke="#0f172a"
                    strokeWidth="1"
                  />
                  <text x={c.x} y={c.y + 11} textAnchor="middle" fontSize="4.5" fontWeight="bold" fill="#fef3c7" stroke="#0f172a" strokeWidth="0.35" paintOrder="stroke" className="select-none">
                    {c.name}{c.isCapital ? ' ★' : ''}
                  </text>
                </g>
              );
            })}

            {/* Grand Campaign movement ruler — a dashed tracer from the
                acting token to the cursor, with a colour tint for the
                currently-suggested movement mode. Drawn under tokens so the
                markers stay on top. */}
            {rulerFromPoint && svgCursor && (() => {
              const evalResult = rulerEvaluator?.(svgCursor);
              // Invalid (e.g. off-rail while boarded) tints the tracer red
              // so the user sees the reject before they click.
              const isInvalid = evalResult && evalResult.valid === false;
              const mode = evalResult?.mode || 'march';
              const tint = isInvalid ? '#f87171'
                : mode === 'rail' ? '#fbbf24'
                : mode === 'river' ? '#0ea5e9'
                : '#e2e8f0';
              return (
                <g className="pointer-events-none">
                  <line
                    x1={rulerFromPoint.x}
                    y1={rulerFromPoint.y}
                    x2={svgCursor.x}
                    y2={svgCursor.y}
                    stroke={tint}
                    strokeOpacity="0.85"
                    strokeWidth="1.2"
                    strokeDasharray="3,2"
                  />
                  <circle cx={rulerFromPoint.x} cy={rulerFromPoint.y} r="2" fill={tint} />
                  <circle cx={svgCursor.x} cy={svgCursor.y} r="2.2" fill="#0f172a" stroke={tint} strokeWidth="0.8" />
                </g>
              );
            })()}

            {/* Grand Campaign token overlays — small side-colored markers */}
            {tokens && tokens.map(token => {
              if (!token.position || token.status === 'wiped') return null;
              const { x, y } = token.position;
              const isMoving = moveModeTokenId === token.id;
              const fill = token.side === 'USA' ? '#3b82f6' : '#ef4444';
              const stroke = isMoving ? '#fbbf24' : '#0f172a';
              return (
                <g
                  key={token.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onTokenClick && !moveModeTokenId) onTokenClick(token);
                  }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isMoving ? 2 : 1.2}
                  />
                  {token.status === 'last-stand' && (
                    <circle cx={x} cy={y} r="9" fill="none" stroke="#f97316" strokeWidth="1.2" strokeDasharray="2,1.5" />
                  )}
                  {token.inCombat && (
                    <circle cx={x} cy={y} r="11" fill="none" stroke="#fbbf24" strokeWidth="0.8" opacity="0.8" />
                  )}
                  {token.boarded?.type === 'rail' && (
                    <text x={x + 5} y={y - 4} fontSize="5" fill="#fbbf24" className="pointer-events-none select-none">🚂</text>
                  )}
                  {token.boarded?.type === 'river' && (
                    <text x={x + 5} y={y - 4} fontSize="5" fill="#0ea5e9" className="pointer-events-none select-none">⛵</text>
                  )}
                  <text
                    x={x}
                    y={y - 9}
                    textAnchor="middle"
                    fontSize="6"
                    fontWeight="bold"
                    fill="#fef3c7"
                    stroke="#0f172a"
                    strokeWidth="0.3"
                    paintOrder="stroke"
                    className="pointer-events-none select-none"
                  >
                    {token.name}
                  </text>
                </g>
              );
            })}
          </g>
          {atlasStyle && (
            <rect x="0" y="0" width="1000" height="589" pointerEvents="none"
                  fill="#8a7448" opacity="0.18" filter="url(#atlas-paper)" />
          )}
        </svg>

        {/* Movement ruler chip — floats near the cursor while the ruler is
            active, shows live distance (miles), MP cost, and the derived
            mode. Switches to a red "invalid" state when the evaluator
            rejects the destination (e.g. off the boarded rail/river). */}
        {rulerFromPoint && svgCursor && rulerEvaluator && (() => {
          const r = rulerEvaluator(svgCursor);
          if (!r) return null;
          const containerEl = mapContainerRef.current;
          const containerW = containerEl?.clientWidth || 800;
          const containerH = containerEl?.clientHeight || 500;
          const placeLeft = mousePos.x > containerW / 2;
          const placeAbove = mousePos.y > containerH / 2;
          const style = {
            ...(placeLeft
              ? { right: Math.max(0, containerW - mousePos.x + 14) }
              : { left: mousePos.x + 14 }),
            ...(placeAbove
              ? { bottom: Math.max(0, containerH - mousePos.y + 14) }
              : { top: mousePos.y + 14 }),
          };
          // Invalid destination — show the evaluator's reason in a red chip.
          if (!r.valid) {
            return (
              <div
                className="absolute z-20 bg-red-950/95 border border-rebel-500/70 rounded px-2 py-1 text-[11px] shadow-lg pointer-events-none whitespace-nowrap text-red-200"
                style={style}
              >
                ✕ {r.reason || 'invalid destination'}
              </div>
            );
          }
          const mode = r.mode || 'march';
          const cost = r.cost;
          const miles = r.miles ?? 0;
          const modeColor = mode === 'rail' ? 'text-brass-300'
            : mode === 'river' ? 'text-sky-300'
            : 'text-mist-300';
          return (
            <div
              className="absolute z-20 bg-ink-900/95 border border-brass-400/70 rounded px-2 py-1 text-[11px] shadow-lg pointer-events-none whitespace-nowrap"
              style={style}
            >
              <span className="text-white font-semibold">{miles} mi</span>
              <span className="mx-1 text-mist-500">·</span>
              <span className="text-white">{cost} MP</span>
              <span className="mx-1 text-mist-500">·</span>
              <span className={`font-semibold uppercase tracking-wide ${modeColor}`}>{mode}</span>
              {r.crossings > 0 && (
                <span className="ml-1 text-orange-400">+{r.crossings} ford</span>
              )}
            </div>
          );
        })()}

        {/* Tooltip — shown only while Ctrl/Cmd is held (hover) or when pinned. */}
        {(() => {
          // Hover tooltip requires Ctrl/Cmd; the pinned tooltip stays regardless.
          const hoverVisible = ctrlHeld && hoveredTerritory;
          const tooltipTerritory = hoverVisible ? hoveredTerritory : selectedTerritory;
          if (!tooltipTerritory) return null;
          const isPinned = !hoverVisible && selectedTerritory;

          // A finger leaves no cursor to anchor to, so on touch the card docks
          // along the bottom of the map instead of chasing a stale mousePos.
          const tooltipOffset = 16;
          const containerEl = mapContainerRef.current;
          const containerW = containerEl?.clientWidth || 800;
          const containerH = containerEl?.clientHeight || 500;
          const placeLeft = mousePos.x > containerW / 2;
          const placeAbove = mousePos.y > containerH / 2;

          const style = isTouch
            ? { left: '0.5rem', right: '0.5rem', bottom: '0.5rem' }
            : {
                ...(placeLeft
                  ? { right: Math.max(0, containerW - mousePos.x + tooltipOffset) }
                  : { left: mousePos.x + tooltipOffset }),
                ...(placeAbove
                  ? { bottom: Math.max(0, containerH - mousePos.y + tooltipOffset) }
                  : { top: mousePos.y + tooltipOffset }),
                maxWidth: '260px',
              };

          return (
            <div
              className={`absolute z-10 bg-ink-850/95 backdrop-blur-sm border rounded p-2 shadow-lg ${
                isTouch ? '' : 'pointer-events-none'
              } ${isPinned ? 'border-brass-400' : 'border-brass-400/60'}`}
              style={style}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-brass-400 font-semibold text-xs">{tooltipTerritory.name}</span>
                {isPinned && !isTouch && <span className="text-[9px] text-mist-500 bg-ink-800 px-1 py-0.5 rounded leading-none">pinned</span>}
                {isTouch && (
                  <button
                    onClick={() => onTerritoryClick(tooltipTerritory)}
                    className="ui-btn ui-btn-quiet ui-btn-sm ml-auto !min-h-0 !py-0.5"
                    aria-label="Close territory info"
                  >
                    Close
                  </button>
                )}
              </div>
              <div className="text-xs text-mist-300 space-y-0.5">
                <div>Owner: <span className={`font-semibold ${
                  tooltipTerritory.owner === 'USA' ? 'text-union-400' :
                  tooltipTerritory.owner === 'CSA' ? 'text-rebel-400' :
                  'text-orange-400'
                }`}>{tooltipTerritory.owner}</span>
                  {' · '}VP: <span className="text-green-400 font-semibold">{tooltipTerritory.pointValue || tooltipTerritory.victoryPoints}</span>
                </div>
                {tooltipTerritory.terrainWeights && (() => {
                  const entries = Object.entries(tooltipTerritory.terrainWeights);
                  const total = entries.reduce((sum, [, w]) => sum + w, 0);
                  return (
                    <div>Terrain: {entries.map(([type, w], i) => (
                      <span key={type}>
                        {i > 0 && ' · '}
                        <span style={{ color: vizConfig[type]?.color || '#94a3b8' }}>{type} {Math.round(w / total * 100)}%</span>
                      </span>
                    ))}</div>
                  );
                })()}
                {tooltipTerritory.stateAbbr && (
                  <div>State: <span className="text-mist-400">{tooltipTerritory.stateAbbr}</span></div>
                )}
                {tooltipTerritory.transitionState?.isTransitioning && (
                  <div className="mt-1 pt-1 border-t border-ink-700">
                    <div className="text-orange-400 font-semibold text-[10px]">Capturing...</div>
                    <div className="text-[10px]">
                      <span>Turns Left: <span className="text-yellow-400 font-semibold">{tooltipTerritory.transitionState.turnsRemaining}</span></span>
                      {' · '}From: <span className={`font-semibold ${
                        tooltipTerritory.transitionState.previousOwner === 'USA' ? 'text-union-400' :
                        tooltipTerritory.transitionState.previousOwner === 'CSA' ? 'text-rebel-400' :
                        'text-mist-400'
                      }`}>{tooltipTerritory.transitionState.previousOwner}</span>
                    </div>
                  </div>
                )}
                {pendingBattleTerritoryIds.includes(tooltipTerritory.id) && (
                  <div className="mt-1 pt-1 border-t border-ink-700">
                    <div className="text-brass-400 font-semibold text-[10px]">Battle Ongoing</div>
                  </div>
                )}
                {!pendingBattleTerritoryIds.includes(tooltipTerritory.id) && recentBattleTerritoryIds.includes(tooltipTerritory.id) && (
                  <div className="mt-1 pt-1 border-t border-ink-700">
                    <div className="text-mist-400 font-semibold text-[10px]">Battle Recently Fought</div>
                  </div>
                )}
                {tooltipTerritory.countyFips && (
                  <div className="text-[10px] text-mist-500">Counties: {tooltipTerritory.countyFips.length}</div>
                )}
                {spSettings && (() => {
                  const vp = tooltipTerritory.pointValue || tooltipTerritory.victoryPoints || 1;
                  const isNeutral = tooltipTerritory.owner === 'NEUTRAL';
                  const attacker = isNeutral ? 'USA' : (tooltipTerritory.owner === 'USA' ? 'CSA' : 'USA');
                  const defender = attacker === 'USA' ? 'CSA' : 'USA';
                  const isIsolated = !isNeutral && !isTerritorySupplied(tooltipTerritory, territories);
                  const { attackerMax, defenderMax } = getMaxBattleCPCosts(
                    vp, tooltipTerritory.owner, defender,
                    spSettings.vpBase, isIsolated, {
                      attackNeutral: spSettings.attackNeutral,
                      attackEnemy: spSettings.attackEnemy,
                      defenseFriendly: spSettings.defenseFriendly,
                      defenseNeutral: spSettings.defenseNeutral,
                    }
                  );
                  return (
                    <div className="mt-1 pt-1 border-t border-ink-700">
                      <div className="text-brass-400 font-semibold text-[10px] mb-0.5">Max SP Loss</div>
                      <div className="text-[10px]">
                        <span>Atk: <span className="text-orange-400 font-semibold">-{attackerMax}</span></span>
                        {' · '}Def: <span className="text-orange-400 font-semibold">-{defenderMax}</span>
                        {isIsolated && <span className="text-rebel-400 ml-1">(2x iso)</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {isPinned && !isTouch && (
                <div className="text-[9px] text-mist-500 mt-1 pt-0.5 border-t border-ink-800">
                  {readOnly ? 'Ctrl+click to unpin' : 'Ctrl+click to unpin · Dbl-click battle · Ctrl+dbl edit'}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Gesture hints — one list per input device, so a phone is never told
          to hold a key it hasn't got. */}
      <div className="px-3 sm:px-4 pb-3 -mt-1 flex flex-wrap justify-center items-center gap-x-1.5 text-[11px] text-mist-500 leading-relaxed">
        {(isTouch
          ? [
              <>tap for territory info</>,
              ...(readOnly ? [] : [<>double-tap for battle</>]),
              <>pinch to zoom</>,
              <>drag to pan when zoomed</>,
            ]
          : [
              <><kbd className="ui-kbd">Ctrl</kbd> territory info</>,
              <><kbd className="ui-kbd">Ctrl</kbd>+click to pin</>,
              ...(readOnly ? [] : [<>double-click for battle</>]),
              <><kbd className="ui-kbd">Shift</kbd>+scroll to zoom</>,
              <><kbd className="ui-kbd">Shift</kbd>+drag to pan</>,
            ]
        ).map((hint, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-ink-600">·</span>}
            <span className="whitespace-nowrap">{hint}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default MapView;