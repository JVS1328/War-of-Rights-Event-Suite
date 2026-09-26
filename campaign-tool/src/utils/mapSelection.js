import { ALL_MAPS, MAPS_BY_MAPSET } from '../data/territories';

/**
 * Roll a weighted random terrain type from a territory's terrain weights.
 *
 * @param {Object} terrainWeights - e.g. { Wooded: 4, Farmlands: 1, Urban: 1 }
 * @returns {{ terrainType: string, roll: number, total: number }}
 */
export const rollTerrainType = (terrainWeights) => {
  const entries = Object.entries(terrainWeights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const roll = Math.random() * total;
  let cumulative = 0;
  for (const [terrain, weight] of entries) {
    cumulative += weight;
    if (roll < cumulative) {
      return { terrainType: terrain, roll, total };
    }
  }
  // Fallback (shouldn't happen with valid weights)
  return { terrainType: entries[entries.length - 1][0], roll, total };
};

/**
 * Resolve the map pool for a territory.
 * Priority: territory.maps > territory.terrainGroup (from settings) > ALL_MAPS
 *
 * For territories with terrainWeights, the caller must roll first and pass
 * the result as rolledTerrainType. This keeps the roll visible to the UI.
 *
 * @param {Object} territory - The territory object
 * @param {Object} terrainGroups - Terrain group definitions from campaign settings
 * @param {string} [rolledTerrainType] - Result of a terrain roll (if applicable)
 * @returns {string[]} Array of map names
 */
export const resolveTerrainMaps = (territory, terrainGroups = {}, rolledTerrainType = null) => {
  if (territory?.maps && territory.maps.length > 0) {
    return territory.maps;
  }
  // Weighted roll result takes priority over static terrainGroup
  if (rolledTerrainType && terrainGroups[rolledTerrainType]) {
    return terrainGroups[rolledTerrainType];
  }
  if (territory?.terrainGroup && terrainGroups[territory.terrainGroup]) {
    return terrainGroups[territory.terrainGroup];
  }
  return ALL_MAPS;
};

/**
 * Get available maps for a territory, considering:
 * 1. Maps assigned to the territory, or resolved from terrain group, or all maps
 * 2. Cooldown period - maps played recently cannot be replayed (campaign-wide)
 *
 * @param {Object} territory - The territory object with optional 'maps' array or 'terrainGroup' string
 * @param {Array} battles - All battles in the campaign
 * @param {number} currentTurn - The current turn number
 * @param {Object} terrainGroups - Terrain group definitions from campaign settings
 * @param {number} [mapCooldownTurns=2] - Number of cooldown turns after a map is played
 * @returns {Object} { availableMaps: string[], cooldownMaps: Map<string, number> }
 */
export const getAvailableMapsForTerritory = (territory, battles = [], currentTurn = 1, terrainGroups = {}, mapCooldownTurns = 2) => {
  // Determine base map pool for this territory
  const territoryMaps = resolveTerrainMaps(territory, terrainGroups);

  // Find maps on cooldown (played within the cooldown window across the entire campaign)
  const cooldownMaps = new Map(); // Map name -> turn it was last played

  if (battles && battles.length > 0) {
    battles.forEach(battle => {
      const turnsSincePlay = currentTurn - battle.turn;

      // Map is on cooldown if played in current turn or within the cooldown window
      // Example with default 2: Map played in turn 5 is unavailable in turns 5, 6, 7
      // and available again in turn 8 (turnsSincePlay >= cooldownTurns + 1)
      if (turnsSincePlay <= mapCooldownTurns) {
        // Store the most recent turn this map was played
        if (!cooldownMaps.has(battle.mapName) || battle.turn > cooldownMaps.get(battle.mapName)) {
          cooldownMaps.set(battle.mapName, battle.turn);
        }
      }
    });
  }

  // Filter out maps on cooldown
  const availableMaps = territoryMaps.filter(map => !cooldownMaps.has(map));

  return {
    availableMaps,
    cooldownMaps
  };
};

/**
 * Get a human-readable message about why a map is unavailable
 *
 * @param {string} mapName - Name of the map
 * @param {Map} cooldownMaps - Map of map names to turn they were last played
 * @param {number} currentTurn - Current turn number
 * @param {number} [mapCooldownTurns=2] - Number of cooldown turns after a map is played
 * @returns {string} Human-readable cooldown message
 */
export const getMapCooldownMessage = (mapName, cooldownMaps, currentTurn, mapCooldownTurns = 2) => {
  if (!cooldownMaps.has(mapName)) {
    return '';
  }

  const lastPlayedTurn = cooldownMaps.get(mapName);
  const turnsSince = currentTurn - lastPlayedTurn;
  const turnsUntilAvailable = (mapCooldownTurns + 1) - turnsSince;

  if (turnsUntilAvailable <= 0) {
    return '(Available now)';
  }

  return `(Turn ${lastPlayedTurn}, available in ${turnsUntilAvailable} turn${turnsUntilAvailable !== 1 ? 's' : ''})`;
};

/**
 * Is `mapName` a Conquest-type map?
 *
 * The canonical list lives in MAPS_BY_MAPSET (data/territories.js) where
 * dedicated "*Conquest" buckets hold the conquest variants
 * ("Antietam Conquest", "South Mountain Conquest", etc). We also check any
 * caller-supplied terrainGroups that match the same pattern so the user
 * can add their own conquest maps via settings later.
 */
export const isConquestMap = (mapName, terrainGroups = {}) => {
  if (!mapName) return false;
  const scan = (bucket) => {
    for (const [groupName, maps] of Object.entries(bucket || {})) {
      if (!groupName || !groupName.toLowerCase().includes('conquest')) continue;
      if (Array.isArray(maps) && maps.includes(mapName)) return true;
    }
    return false;
  };
  return scan(MAPS_BY_MAPSET) || scan(terrainGroups);
};

/**
 * The Conquest sides coin, at even odds. true means the sides are flipped:
 * each team plays the other side's colours on the War of Rights board.
 */
export const rollConquestSides = () => Math.random() < 0.5;

/** How each face of the Conquest coin reads. */
export const CONQUEST_SIDES = {
  normal: 'Normal sides',
  flipped: 'Flipped',
};

/**
 * Randomly select maps for the pick/ban phase
 * Uses Fisher-Yates shuffle for unbiased random selection
 *
 * @param {string[]} availableMaps - Array of available map names
 * @param {number} count - Number of maps to select (default 5)
 * @returns {string[]} Array of randomly selected maps
 */
export const selectMapsForPickBan = (availableMaps, count = 5) => {
  if (!availableMaps || availableMaps.length === 0) {
    return [];
  }

  // If fewer maps available than requested, return all
  if (availableMaps.length <= count) {
    return [...availableMaps];
  }

  // Fisher-Yates shuffle on a copy, then take first N
  const shuffled = [...availableMaps];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
};
