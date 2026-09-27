import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, useId } from 'react';
import { SIDE_TEXT } from './ui/Primitives';
import BattleMarks from './BattleMarks';
import SeasonSky from './SeasonSky';
import { usaStates } from '../data/usaStates';
import { getMaxBattleCPCosts } from '../utils/cpSystem';
import { isTerritorySupplied } from '../utils/supplyLines';
import { generateTerrainPatterns, resolvePatternId, DEFAULT_TERRAIN_VIZ } from '../utils/terrainPatterns.jsx';
import { usePanZoom } from '../utils/usePanZoom';
import { useCoarsePointer } from '../utils/useMediaQuery';
import { loadRivers, projectRivers, RIVER_LABEL_SIZE } from '../utils/riverPaths';
import { waterwayList } from '../utils/waterways';
import { reliefTilesFor } from '../utils/reliefTiles';

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

/**
 * Ink for the Grand Campaign overlays — tokens, cities, forts, stations,
 * rails, rivers and the movement ruler.
 *
 * The board is a parchment plate, so these are drawn the way an engraver
 * would have cut them: ink outlines, flat side washes, labels haloed in paper
 * so they stay legible over a county. Values are the index.css tokens, which
 * can't be read from an SVG attribute.
 */
const PLATE = {
  ink: '#241d13',
  ink3: '#7a6d57',
  paper: '#efe5cc',
  union: '#2f4d7e',
  rebel: '#8f2c25',
  neutral: '#8b7d5a',
  mark: '#b4531a',
  // The same wash the sea is painted with, so a river reads as water.
  water: '#9db4bd',
  // River names, set in a deeper shade of the water they name.
  waterInk: '#35525e',
};

// Whether this reader keeps the rivers on the plate. Theirs alone, so it
// lives in the browser rather than in the campaign.
const RIVERS_PREF = 'WarOfRightsCampaignTracker.rivers';
const RELIEF_PREF = 'WarOfRightsCampaignTracker.relief';

/** The colour a side's ground and markers are washed in. */
const plateSide = (side) =>
  side === 'USA' ? PLATE.union : side === 'CSA' ? PLATE.rebel : PLATE.neutral;

/** A label set in ink and haloed in paper, so it survives any ground under it. */
const PLATE_LABEL = {
  fill: PLATE.ink,
  stroke: PLATE.paper,
  paintOrder: 'stroke',
  strokeLinejoin: 'round',
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
  // { [territoryId]: { weather, time, winner } } for the battles above, so
  // their marks can show the conditions they were fought in.
  battleDetails = {},
  // 'winter' | 'spring' | 'summer' | 'autumn' | null - the sky over the board.
  season = null,
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
  // Reach, from utils/reach.js: Map<territoryId, { ok, reason, hint }> for one
  // side under its declared orders. Ground it refuses is washed back and the
  // tooltip says why. Absent — the Grand Campaign, an older share link —
  // nothing is dimmed and the plate reads as it always did.
  reach = null,
  reachSide = null,      // whose reach it is, named on the tooltip
  toolbarExtra = null,   // printed in the toolbar between the key and the zoom
  // Draw the rivers of the country a county map shows (utils/riverPaths.js).
  // Off for the Grand Campaign, whose own rivers are part of the game.
  rivers = false,
  // Which water each region lies on (utils/waterways.js), named on the card.
  waterways = null,
  // Shade the hills and mountains of the country a county map shows
  // (utils/reliefTiles.js).
  relief = false,
}) => {
  const [hoveredTerritory, setHoveredTerritory] = useState(null);
  const [countyPaths, setCountyPaths] = useState({});
  // Counties around the play area, drawn as an out-of-theatre backdrop.
  const [surroundingPaths, setSurroundingPaths] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [bounds, setBounds] = useState(null);

  // Rivers: the states the map covers are loaded once its bounds are known,
  // and projected through those same bounds so the rivers run where the
  // counties say. Which stretches are in the theatre follows from the
  // campaign's own counties, so any county map gets its rivers unasked.
  const [riverData, setRiverData] = useState(null);
  const [showRivers, setShowRivers] = useState(() => {
    try { return localStorage.getItem(RIVERS_PREF) !== 'off'; } catch { return true; }
  });
  const boundsKey = bounds ? [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].join(',') : '';
  useEffect(() => {
    if (!rivers || !bounds) return undefined;
    let live = true;
    loadRivers(bounds)
      .then(r => { if (live) setRiverData(r); })
      .catch(() => { if (live) setRiverData(null); });
    return () => { live = false; };
    // Reload only when the ground covered changes, not on every new object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivers, boundsKey]);
  const theatreFipsKey = useMemo(
    () => territories.flatMap(t => t.countyFips || []).join(','),
    [territories],
  );
  const riverPlate = useMemo(() => {
    if (!rivers || !riverData?.length || !bounds) return null;
    const theatre = new Set(theatreFipsKey.split(',').filter(Boolean).map(Number));
    return projectRivers(riverData, bounds, theatre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivers, riverData, boundsKey, theatreFipsKey]);
  const toggleRivers = () => setShowRivers(on => {
    try { localStorage.setItem(RIVERS_PREF, on ? 'off' : 'on'); } catch { /* per-visit only */ }
    return !on;
  });
  const riverIdBase = `rv${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Relief: the shaded tiles under the map's bounds, laid in the same
  // projection. Like the rivers, whether to show it is the reader's own.
  const [showRelief, setShowRelief] = useState(() => {
    try { return localStorage.getItem(RELIEF_PREF) !== 'off'; } catch { return true; }
  });
  const reliefTiles = useMemo(
    () => (relief && bounds ? reliefTilesFor(bounds) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [relief, boundsKey],
  );
  const toggleRelief = () => setShowRelief(on => {
    try { localStorage.setItem(RELIEF_PREF, on ? 'off' : 'on'); } catch { /* per-visit only */ }
    return !on;
  });

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

  // Centres of the state-drawn territories, measured off the drawn outline.
  // The centres stored with the state shapes (and copied into saved
  // campaigns) were plotted for a half-size plate, so anything placed on
  // them - battle marks, capitals - landed out in the sea. County-drawn
  // territories work theirs out from county data and are left alone.
  const [measuredCenters, setMeasuredCenters] = useState({});
  useLayoutEffect(() => {
    const group = transformGroupRef.current;
    if (!group) return;
    const next = {};
    for (const territory of territories) {
      if (territory.countyFips || territory.countyPaths?.length) continue;
      const paths = group.querySelectorAll(`path[data-territory-id="${CSS.escape(territory.id)}"]`);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const path of paths) {
        const b = path.getBBox();
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
      }
      if (minX !== Infinity) next[territory.id] = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
    setMeasuredCenters(prev => {
      const same = Object.keys(next).length === Object.keys(prev).length
        && Object.entries(next).every(([id, c]) => prev[id]?.x === c.x && prev[id]?.y === c.y);
      return same ? prev : next;
    });
  }, [territories]);

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
        onTerritoryDoubleClick?.(territory, { reach: reach?.get(territory.id) });
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
  }, [onTerritoryClick, onTerritoryDoubleClick, onTerritoryCtrlDoubleClick, moveModeTokenId, featureTool, interactionLocked, isTouch, reach]);

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
      // Neutral is the ground's own wash; the side colours are the same ones
      // every other territory is painted in, so a contested county reads as a
      // half-finished colouring rather than a different legend.
      const contested = getOwnerColor('NEUTRAL');
      if (territory.influence === 0) return contested;
      const strength = Math.min(1, Math.abs(territory.influence) / influenceThreshold);
      const sideColor = getOwnerColor(territory.influence > 0 ? 'USA' : 'CSA');
      return interpolateColor(contested, sideColor, strength);
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
    // On the plate a picked territory is ruled in ink, not highlighter.
    if (selectedTerritory?.id === territory.id) return '#241d13';
    if (hoveredTerritory?.id === territory.id) return '#4d4333';
    return atlasStyle ? '#6b5836' : '#1e293b';
  };

  const getStrokeWidth = (territory) => {
    if (selectedTerritory?.id === territory.id) return hasCountyData ? '2' : '4';
    if (hoveredTerritory?.id === territory.id) return hasCountyData ? '1.5' : '3';
    return hasCountyData ? '0.5' : '2';
  };

  /**
   * One layer of rivers: every bank first, then every stretch of water, so
   * where two rivers meet the water runs through unbroken. Navigable reaches
   * are cut broad; the rest are a fine line for finding your way by.
   */
  const renderRiverStrokes = (layer) => (
    <>
      {layer.river && <path d={layer.river} stroke={PLATE.ink} strokeOpacity="0.3" strokeWidth="1.7" />}
      {layer.navigable && <path d={layer.navigable} stroke={PLATE.ink} strokeOpacity="0.6" strokeWidth="4.4" />}
      {layer.river && <path d={layer.river} stroke={PLATE.water} strokeWidth="0.9" />}
      {layer.navigable && <path d={layer.navigable} stroke={PLATE.water} strokeWidth="2.9" />}
    </>
  );

  /**
   * Ground the reach rules refuse is held back — the wash is printed light so
   * the ground a side may actually go at stands forward of it. One value on
   * the territory's group, so the atlas and the screen plate wash back alike.
   */
  // Ground the ordered side cannot reach washes back; its own ground stays
  // at full strength, since it is never a target and the plate must still
  // read as who holds what.
  const getReachOpacity = (territory) => {
    if (!reach) return undefined;
    const entry = reach.get(territory.id);
    if (!entry || entry.ok || entry.reason === 'your own ground') return undefined;
    return 0.5;
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
      <section className="ui-section">
        <h3 className="ui-section-head">The Theatre of War</h3>
        <div className="ui-plate">
          <div className="ui-plate-inner h-96 grid place-items-center">
            <p className="ui-caption">The plate is being drawn…</p>
          </div>
        </div>
      </section>
    );
  }

  // Render error state
  if (loadError) {
    return (
      <section className="ui-section">
        <h3 className="ui-section-head">The Theatre of War</h3>
        <div className="ui-plate">
          <div className="ui-plate-inner h-96 grid place-items-center px-4 text-center">
            <div>
              <p className="text-mark font-bold">{loadError}</p>
              <p className="ui-caption">Reload the page to try for the plate again.</p>
            </div>
          </div>
        </div>
      </section>
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
    if (measuredCenters[territory.id]) return measuredCenters[territory.id];
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

  // Every battle site on the board, drawn as one layer over the ground.
  // Captured ground still consolidating keeps its mark until the capture
  // completes, so its ring can show how far the handover has come.
  const battleSites = territories.flatMap(territory => {
    const ts = territory.transitionState;
    const handover = ts?.isTransitioning && !ts.raided && ts.totalTurns > 0 ? ts : null;
    const phase = pendingBattleTerritoryIds.includes(territory.id) ? 'active'
      : recentBattleTerritoryIds.includes(territory.id) ? 'aftermath'
        : handover ? 'holding'
          : null;
    const center = phase && getTerritoryCenter(territory);
    if (!center) return [];
    // Counted in steps of a turn, with the capture itself as the first, so
    // the ring is never empty while ground is held and closes on completion.
    const steps = handover ? handover.totalTurns + 1 : 0;
    const transition = handover && {
      from: handover.previousOwner,
      to: territory.owner,
      steps,
      progress: (handover.totalTurns - handover.turnsRemaining + 1) / steps,
    };
    return [{ id: territory.id, x: center.x, y: center.y, phase, transition, ...battleDetails[territory.id] }];
  });

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
    <section className="ui-section">
      <h3 className="ui-section-head">
        The Theatre of War
        {hasCountyData && <small>County view</small>}
      </h3>

      <div className="ui-toolbar">
        {/* Key to the plate. */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mr-auto text-xs text-ink-2">
          {[
            ['bg-union-wash', 'Union'],
            ['bg-rebel-wash', 'Confederate'],
            ['bg-neutral-wash', 'Neutral'],
          ].map(([swatch, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 border border-rule ${swatch}`} />
              {label}
            </span>
          ))}
          {/* The river key is also its switch. */}
          {riverPlate && (
            <button
              type="button"
              onClick={toggleRivers}
              aria-pressed={showRivers}
              className={`flex items-center gap-1.5 cursor-pointer hover:text-ink ${showRivers ? '' : 'opacity-50 line-through'}`}
              title={showRivers
                ? 'Navigable rivers are drawn broad, other rivers fine. Click to hide them.'
                : 'Click to show the rivers'}
            >
              <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
                <line x1="1" y1="4" x2="17" y2="4" stroke={PLATE.ink} strokeOpacity="0.6" strokeWidth="4.4" strokeLinecap="round" />
                <line x1="1" y1="4" x2="17" y2="4" stroke={PLATE.water} strokeWidth="2.9" strokeLinecap="round" />
              </svg>
              Navigable river
            </button>
          )}
          {reliefTiles.length > 0 && (
            <button
              type="button"
              onClick={toggleRelief}
              aria-pressed={showRelief}
              className={`flex items-center gap-1.5 cursor-pointer hover:text-ink ${showRelief ? '' : 'opacity-50 line-through'}`}
              title={showRelief ? 'Hills and mountains are shaded. Click to hide the shading.' : 'Click to shade the hills and mountains'}
            >
              <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
                <path d="M1 9 L6 2 L9 6 L12 3 L17 9" fill="none" stroke="#584229" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M6 2 L7.5 9 M12 3 L13.5 9" stroke="#584229" strokeOpacity="0.45" strokeWidth="0.9" />
              </svg>
              Relief
            </button>
          )}
        </div>

        {toolbarExtra}

        {/* Zoom controls. The only way in without a scroll wheel, and they
            live here rather than over the map so they never eat a tap
            aimed at a territory underneath. */}
        {[
          { key: 'in', label: 'Zoom in', glyph: '+', onClick: () => panZoom.zoomBy(1.4) },
          { key: 'out', label: 'Zoom out', glyph: '−', onClick: () => panZoom.zoomBy(1 / 1.4) },
          { key: 'reset', label: 'Reset view', glyph: 'Reset', onClick: panZoom.reset, needsView: true },
        ].map(({ key, label, glyph, onClick, needsView }) => (
          <button
            key={key}
            onClick={onClick}
            disabled={needsView && panZoom.isDefaultView}
            title={label}
            aria-label={label}
            className="ui-btn ui-btn-sm"
          >
            {glyph}
          </button>
        ))}
      </div>

      <div className="ui-plate">

        <div
          ref={mapContainerRef}
          className={`ui-plate-inner relative p-2 sm:p-3 ${atlasStyle ? '' : 'bg-paper-2'}`}
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

            {/* Terrain patterns — generated from vizConfig for all terrain groups */}
            {Object.entries(vizConfig).flatMap(([name, cfg]) => generateTerrainPatterns(name, cfg))}
          </defs>
          {/* Sea. Sits under every layer and outside the pan/zoom group so it
              fills the frame whatever the view, which is what stops the Gulf
              and the Atlantic reading as a hole in the board. In atlas mode
              it's a translucent wash so the paper still reads through it. */}
          <rect
            x="0" y="0" width="1000" height="589"
            fill="#9db4bd"
            opacity={0.5}
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
                    fill="#d7c6a0"
                    stroke="#9c8a63"
                    strokeWidth="0.5"
                  />
                ))}
              </g>
            )}
            {/* Rivers beyond the theatre, faded with the country they run through. */}
            {riverPlate && showRivers && (
              <g mask="url(#fog-mask)" opacity="0.55" fill="none" strokeLinecap="round"
                 strokeLinejoin="round" pointerEvents="none" aria-hidden="true">
                {renderRiverStrokes(riverPlate.backdrop)}
              </g>
            )}

            {/* Territory polygons */}
            {territories.map(territory => {
              const center = getTerritoryCenter(territory);
              const labelX = center?.x;
              const labelY = center?.y;

              // For county-based territories, render each county
              if (territory.countyFips && countyPaths[territory.id]) {
                const paths = countyPaths[territory.id];
                return (
                  <g key={territory.id} opacity={getReachOpacity(territory)}>
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
                  </g>
                );
              }

              // For grouped state-based territories, render each state individually
              if (territory.states && territory.states.length > 0) {
                return (
                  <g key={territory.id} opacity={getReachOpacity(territory)}>
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
                        fill={atlasStyle ? '#241d13' : '#fbbf24'}
                        stroke={atlasStyle ? "#5c4a2f" : "#1e293b"}
                        strokeWidth="2"
                        className="pointer-events-none"
                      />
                    )}
                  </g>
                );
              }

              // For grouped county-based territories (pre-loaded paths)
              if (territory.countyPaths && territory.countyPaths.length > 0) {
                return (
                  <g key={territory.id} opacity={getReachOpacity(territory)}>
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
                        fill={atlasStyle ? '#241d13' : '#fbbf24'}
                        stroke={atlasStyle ? "#5c4a2f" : "#1e293b"}
                        strokeWidth="2"
                        className="pointer-events-none"
                      />
                    )}
                  </g>
                );
              }

              // For other territories (legacy), use combined svgPath
              const pathData = territory.svgPath || territory.coordinates?.data;
              if (!pathData) return null;

              return (
                <g key={territory.id} opacity={getReachOpacity(territory)}>
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
                      fill={atlasStyle ? '#241d13' : '#fbbf24'}
                      stroke={atlasStyle ? "#5c4a2f" : "#1e293b"}
                      strokeWidth="2"
                      className="pointer-events-none"
                    />
                  )}
                </g>
              );
            })}

            {/* Hills and mountains, shaded over the ground and under the rivers. */}
            {showRelief && reliefTiles.length > 0 && (
              <g pointerEvents="none" aria-hidden="true" opacity={atlasStyle ? 0.85 : 0.7}>
                {reliefTiles.map(tile => (
                  <image
                    key={tile.key}
                    href={tile.href}
                    x={tile.x}
                    y={tile.y}
                    width={tile.width}
                    height={tile.height}
                    preserveAspectRatio="none"
                  />
                ))}
              </g>
            )}

            {/* Rivers over the ground, under every mark set on it. */}
            {riverPlate && showRivers && (
              <g pointerEvents="none" aria-hidden="true">
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {renderRiverStrokes(riverPlate.theatre)}
                </g>
                {riverPlate.labels.map(label => {
                  const id = `${riverIdBase}-${label.key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
                  const size = RIVER_LABEL_SIZE[label.navigable ? 'navigable' : 'river'];
                  return (
                    <g key={label.key}>
                      <path id={id} d={label.d} fill="none" />
                      <text
                        fontSize={size}
                        fontStyle="italic"
                        letterSpacing="0.6"
                        dy={label.navigable ? -3.4 : -2.2}
                        fill={PLATE.waterInk}
                        stroke={PLATE.paper}
                        strokeWidth={size * 0.28}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        style={{ fontFamily: 'var(--font-body)' }}
                        className="select-none"
                      >
                        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                          {label.text}
                        </textPath>
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* Grand Campaign map features — rivers + rails drawn under points so
                cities/forts/stations sit on top. Tokens render last (topmost). */}
            {/* Rivers: the water wash with its banks lined in, so a river
                still reads where it runs across a side's own colour. */}
            {mapFeatures?.rivers?.map(river => {
              const points = river.points.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <g key={river.id} className="pointer-events-none" fill="none"
                   strokeLinecap="round" strokeLinejoin="round">
                  <polyline points={points} stroke={PLATE.ink} strokeOpacity="0.45" strokeWidth="3.4" />
                  <polyline points={points} stroke={PLATE.water} strokeWidth="2.2" />
                </g>
              );
            })}
            {/* Rails: an ink line ticked across, the way an atlas hatches one. */}
            {mapFeatures?.railways?.map(rail => (
              <g key={rail.id} className="pointer-events-none">
                <polyline
                  points={rail.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={PLATE.ink}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={rail.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={PLATE.paper}
                  strokeWidth="0.9"
                  strokeDasharray="1,2"
                  strokeLinecap="butt"
                />
              </g>
            ))}

            {/* In-progress polyline preview while user is drawing */}
            {lineDraft && lineDraft.length > 0 && featureTool && (featureTool === 'railway' || featureTool === 'river') && (
              <g className="pointer-events-none">
                <polyline
                  points={lineDraft.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={featureTool === 'river' ? PLATE.water : PLATE.ink}
                  strokeWidth="1.6"
                  strokeDasharray="3,2"
                />
                {lineDraft.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="1.8" fill={PLATE.mark} />
                ))}
              </g>
            )}

            {/* Stations — a small ring on the line, barred across */}
            {mapFeatures?.stations?.map(s => (
              <g key={s.id} className="pointer-events-none">
                <circle cx={s.x} cy={s.y} r="3" fill={PLATE.paper} stroke={PLATE.ink} strokeWidth="0.9" />
                <line x1={s.x - 3} y1={s.y} x2={s.x + 3} y2={s.y} stroke={PLATE.ink} strokeWidth="0.9" />
                <text
                  x={s.x} y={s.y + 7.5} textAnchor="middle" fontSize="4"
                  {...PLATE_LABEL} strokeWidth="0.7"
                  className="select-none"
                >
                  {s.name}
                </text>
              </g>
            ))}

            {/* Forts — a square bastion with a saltire cut through it */}
            {mapFeatures?.forts?.map(f => (
              <g key={f.id} className="pointer-events-none">
                <rect
                  x={f.x - 4} y={f.y - 4} width="8" height="8"
                  fill={plateSide(f.side)} stroke={PLATE.ink} strokeWidth="0.9"
                />
                <line x1={f.x - 4} y1={f.y - 4} x2={f.x + 4} y2={f.y + 4} stroke={PLATE.paper} strokeWidth="0.8" />
                <line x1={f.x + 4} y1={f.y - 4} x2={f.x - 4} y2={f.y + 4} stroke={PLATE.paper} strokeWidth="0.8" />
                <text
                  x={f.x} y={f.y + 9.5} textAnchor="middle" fontSize="4" fontWeight="bold"
                  {...PLATE_LABEL} strokeWidth="0.75"
                  className="select-none"
                >
                  {f.name}
                </text>
              </g>
            ))}

            {/* Cities — a diamond; a capital is ringed in ink */}
            {mapFeatures?.cities?.map(c => (
              <g key={c.id} className="pointer-events-none">
                {c.isCapital && (
                  <circle cx={c.x} cy={c.y} r="7.5" fill="none" stroke={PLATE.ink} strokeWidth="0.9" />
                )}
                <polygon
                  points={`${c.x},${c.y - 5} ${c.x + 5},${c.y} ${c.x},${c.y + 5} ${c.x - 5},${c.y}`}
                  fill={plateSide(c.side)}
                  stroke={PLATE.ink}
                  strokeWidth="0.9"
                />
                <text
                  x={c.x} y={c.isCapital ? c.y + 13 : c.y + 10.5} textAnchor="middle"
                  fontSize="4.5" fontWeight="bold"
                  {...PLATE_LABEL} strokeWidth="0.8"
                  className="select-none"
                >
                  {c.name}{c.isCapital ? ' ★' : ''}
                </text>
              </g>
            ))}

            {/* Grand Campaign movement ruler — a tracer stepped off from the
                acting token to the cursor, in the rust the sheet uses for
                anything pending. A destination the evaluator refuses (off-rail
                while boarded, say) breaks the line up and crosses the far end,
                so the reject reads before the click. Drawn under the tokens so
                the markers stay on top. */}
            {rulerFromPoint && svgCursor && (() => {
              const evalResult = rulerEvaluator?.(svgCursor);
              const isInvalid = evalResult && evalResult.valid === false;
              return (
                <g className="pointer-events-none" stroke={PLATE.mark}>
                  <line
                    x1={rulerFromPoint.x}
                    y1={rulerFromPoint.y}
                    x2={svgCursor.x}
                    y2={svgCursor.y}
                    strokeWidth="1.1"
                    strokeDasharray={isInvalid ? '1,2.5' : '4,2.5'}
                  />
                  <circle cx={rulerFromPoint.x} cy={rulerFromPoint.y} r="1.8" fill={PLATE.mark} strokeWidth="0" />
                  <circle cx={svgCursor.x} cy={svgCursor.y} r="2.4" fill={PLATE.paper} strokeWidth="0.9" />
                  {isInvalid && (
                    <>
                      <line x1={svgCursor.x - 1.6} y1={svgCursor.y - 1.6} x2={svgCursor.x + 1.6} y2={svgCursor.y + 1.6} strokeWidth="0.9" />
                      <line x1={svgCursor.x + 1.6} y1={svgCursor.y - 1.6} x2={svgCursor.x - 1.6} y2={svgCursor.y + 1.6} strokeWidth="0.9" />
                    </>
                  )}
                </g>
              );
            })()}

            {/* Grand Campaign token overlays — a side-washed counter, named
                above it in ink on a paper halo. */}
            {tokens && tokens.map(token => {
              if (!token.position || token.status === 'wiped') return null;
              const { x, y } = token.position;
              const isMoving = moveModeTokenId === token.id;
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
                    r="5.5"
                    fill={plateSide(token.side)}
                    stroke={isMoving ? PLATE.mark : PLATE.ink}
                    strokeWidth={isMoving ? 1.8 : 1}
                  />
                  {token.status === 'last-stand' && (
                    <circle cx={x} cy={y} r="8.5" fill="none" stroke={PLATE.mark} strokeWidth="1" strokeDasharray="2,1.5" />
                  )}
                  {token.inCombat && (
                    <circle cx={x} cy={y} r="10.5" fill="none" stroke={PLATE.ink} strokeWidth="0.7" />
                  )}
                  {/* Aboard: a rail's ties, or the water's ripple. */}
                  {token.boarded?.type === 'rail' && (
                    <text x={x + 6} y={y - 3} fontSize="5.5" fontWeight="bold" fill={PLATE.ink} className="pointer-events-none select-none">≡</text>
                  )}
                  {token.boarded?.type === 'river' && (
                    <text x={x + 6} y={y - 3} fontSize="5.5" fontWeight="bold" fill={PLATE.water} stroke={PLATE.ink} strokeWidth="0.25" paintOrder="stroke" className="pointer-events-none select-none">≈</text>
                  )}
                  <text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    fontSize="6"
                    fontWeight="bold"
                    {...PLATE_LABEL}
                    strokeWidth="1"
                    className="pointer-events-none select-none"
                  >
                    {token.name}
                  </text>
                </g>
              );
            })}
          </g>
          {/* Battle marks ride the same pan and zoom but sit outside the ink
              filter, so their animation never makes the whole board refilter. */}
          <g transform={panZoom.transform}>
            <BattleMarks sites={battleSites} atlasStyle={atlasStyle} scale={hasCountyData ? 1 : 1.8} />
          </g>
          {/* The season is sky, not ground: it holds still while the map moves. */}
          <SeasonSky season={season} atlasStyle={atlasStyle} />
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
                className="ui-box absolute z-20 bg-paper !px-2 !py-1 text-[11px] pointer-events-none whitespace-nowrap text-mark font-bold"
                style={style}
              >
                ✕ {r.reason || 'invalid destination'}
              </div>
            );
          }
          const mode = r.mode || 'march';
          const cost = r.cost;
          const miles = r.miles ?? 0;
          return (
            <div
              className="ui-box absolute z-20 bg-paper !px-2 !py-1 text-[11px] pointer-events-none whitespace-nowrap tabular"
              style={style}
            >
              <span className="font-bold">{miles} mi</span>
              <span className="mx-1 text-ink-3">·</span>
              <span>{cost} MP</span>
              <span className="mx-1 text-ink-3">·</span>
              <span className="ui-tag">{mode}</span>
              {r.crossings > 0 && (
                <span className="ml-1 text-mark font-bold">+{r.crossings} ford</span>
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
              className={`ui-box absolute z-10 bg-paper !p-2 ${isTouch ? '' : 'pointer-events-none'}`}
              style={style}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-bold text-xs">{tooltipTerritory.name}</span>
                {isPinned && !isTouch && <span className="ui-eyebrow !text-[9px]">pinned</span>}
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
              <div className="text-xs text-ink-2 space-y-0.5">
                <div>Owner: <span className={`font-bold ${SIDE_TEXT[tooltipTerritory.owner] || 'text-neutral'}`}>{tooltipTerritory.owner}</span>
                  {' · '}VP: <span className="font-bold text-ink tabular">{tooltipTerritory.pointValue || tooltipTerritory.victoryPoints}</span>
                </div>
                {tooltipTerritory.terrainWeights && (() => {
                  const entries = Object.entries(tooltipTerritory.terrainWeights);
                  const total = entries.reduce((sum, [, w]) => sum + w, 0);
                  return (
                    <div>Terrain: {entries.map(([type, w], i) => (
                      <span key={type}>
                        {i > 0 && ' · '}
                        <span style={{ color: vizConfig[type]?.color || undefined }}>{type} {Math.round(w / total * 100)}%</span>
                      </span>
                    ))}</div>
                  );
                })()}
                {tooltipTerritory.stateAbbr && (
                  <div>State: <span className="text-ink">{tooltipTerritory.stateAbbr}</span></div>
                )}
                {tooltipTerritory.transitionState?.isTransitioning && (
                  <div className="mt-1 pt-1 border-t border-paper-3">
                    <div className="ui-tag ui-tag-mark">Capturing</div>
                    <div className="text-[10px]">
                      <span>Turns left: <span className="text-mark font-bold tabular">{tooltipTerritory.transitionState.turnsRemaining}</span></span>
                      {' · '}From: <span className={`font-bold ${SIDE_TEXT[tooltipTerritory.transitionState.previousOwner] || 'text-neutral'}`}>{tooltipTerritory.transitionState.previousOwner}</span>
                    </div>
                  </div>
                )}
                {pendingBattleTerritoryIds.includes(tooltipTerritory.id) && (
                  <div className="mt-1 pt-1 border-t border-paper-3">
                    <div className="ui-tag ui-tag-mark">Engagement pending</div>
                  </div>
                )}
                {!pendingBattleTerritoryIds.includes(tooltipTerritory.id) && recentBattleTerritoryIds.includes(tooltipTerritory.id) && (
                  <div className="mt-1 pt-1 border-t border-paper-3">
                    <div className="ui-tag">Lately fought over</div>
                  </div>
                )}
                {tooltipTerritory.countyFips && (
                  <div className="text-[10px] text-ink-3">Counties: {tooltipTerritory.countyFips.length}</div>
                )}
                {/* The water a landing could come by. */}
                {tooltipTerritory.hasWaterAccess && (
                  <div className="text-[10px] text-ink-2">
                    ≈ {waterways?.get(tooltipTerritory.id)?.length
                      ? `On ${waterwayList(waterways.get(tooltipTerritory.id), 'and')}`
                      : 'Water access'}
                  </div>
                )}
                {/* Why this ground is out of reach, and what would have reached it. */}
                {(() => {
                  const entry = reach?.get(tooltipTerritory.id);
                  if (!entry || entry.ok !== false) return null;
                  return (
                    <div className="mt-1 pt-1 border-t border-paper-3">
                      <div className="text-mark">
                        Out of reach{reachSide ? ` for ${reachSide}` : ''} — {entry.reason}
                      </div>
                      {entry.hint && <div className="text-mark italic">{entry.hint}</div>}
                    </div>
                  );
                })()}
                {spSettings && (() => {
                  const vp = tooltipTerritory.pointValue || tooltipTerritory.victoryPoints || 1;
                  const isNeutral = tooltipTerritory.owner === 'NEUTRAL';
                  const attacker = isNeutral ? 'USA' : (tooltipTerritory.owner === 'USA' ? 'CSA' : 'USA');
                  const defender = attacker === 'USA' ? 'CSA' : 'USA';
                  const isIsolated = !isNeutral && !isTerritorySupplied(tooltipTerritory, territories);
                  // spSettings carries both the base costs and the ticket options.
                  const { attackerMax, defenderMax, ticketMode } = getMaxBattleCPCosts(
                    vp, tooltipTerritory.owner, defender,
                    spSettings.vpBase, isIsolated, spSettings, spSettings
                  );
                  return (
                    <div className="mt-1 pt-1 border-t border-paper-3">
                      <div className="ui-eyebrow mb-0.5">
                        {ticketMode ? 'SP per 1k tickets lost' : 'Most a side can lose'}
                      </div>
                      <div className="text-[10px] tabular">
                        <span>Atk: <span className="text-mark font-bold">−{attackerMax}</span></span>
                        {' · '}Def: <span className="text-mark font-bold">−{defenderMax}</span>
                        {isIsolated && <span className="ui-tag ui-tag-mark ml-1">cut off, 2×</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {isPinned && !isTouch && (
                <div className="text-[9px] text-ink-3 italic mt-1 pt-0.5 border-t border-paper-3">
                  {readOnly ? 'Ctrl+click to unpin' : 'Ctrl+click to unpin · Dbl-click battle · Ctrl+dbl edit'}
                </div>
              )}
            </div>
          );
        })()}
        </div>
      </div>

      {/* Gesture hints — one list per input device, so a phone is never told
          to hold a key it hasn't got. */}
      <p className="ui-caption flex flex-wrap justify-center items-center gap-x-1.5">
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
            {i > 0 && <span className="text-ink-3">·</span>}
            <span className="whitespace-nowrap">{hint}</span>
          </span>
        ))}
      </p>
    </section>
  );
};

export default MapView;