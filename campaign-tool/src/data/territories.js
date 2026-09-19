// Territory definitions for War of Rights Campaign Tracker
// Simplified map of Civil War theater focusing on Maryland, Virginia, Pennsylvania, West Virginia

export const INITIAL_TERRITORIES = [
  {
    id: 'maryland-antietam',
    name: 'Antietam (MD)',
    mapName: 'Antietam',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    victoryPoints: 15,
    isCapital: false,
    coordinates: {
      type: 'polygon',
      data: 'M 300,180 L 380,180 L 380,240 L 300,240 Z'
    },
    labelPosition: { x: 340, y: 210 },
    adjacentTerritories: ['harpers-ferry', 'south-mountain', 'virginia-north']
  },
  {
    id: 'harpers-ferry',
    name: "Harper's Ferry (WV)",
    mapName: 'Harpers Ferry',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    victoryPoints: 20,
    isCapital: false,
    coordinates: {
      type: 'polygon',
      data: 'M 260,240 L 320,240 L 320,300 L 260,300 Z'
    },
    labelPosition: { x: 290, y: 270 },
    adjacentTerritories: ['maryland-antietam', 'virginia-north', 'virginia-shenandoah']
  },
  {
    id: 'south-mountain',
    name: 'South Mountain (MD)',
    mapName: 'South Mountain',
    owner: 'NEUTRAL',
    victoryPoints: 10,
    isCapital: false,
    coordinates: {
      type: 'polygon',
      data: 'M 380,140 L 450,140 L 450,200 L 380,200 Z'
    },
    labelPosition: { x: 415, y: 170 },
    adjacentTerritories: ['maryland-antietam', 'pennsylvania-gettysburg']
  },
  {
    id: 'pennsylvania-gettysburg',
    name: 'Gettysburg (PA)',
    mapName: 'Drill Camp',
    owner: 'USA',
    victoryPoints: 25,
    isCapital: false,
    coordinates: {
      type: 'polygon',
      data: 'M 380,80 L 480,80 L 480,160 L 380,160 Z'
    },
    labelPosition: { x: 430, y: 120 },
    adjacentTerritories: ['south-mountain']
  },
  {
    id: 'virginia-north',
    name: 'Northern Virginia',
    mapName: 'Drill Camp',
    owner: 'CSA',
    hasWaterAccess: true,
    victoryPoints: 15,
    isCapital: false,
    coordinates: {
      type: 'polygon',
      data: 'M 260,300 L 380,300 L 380,380 L 260,380 Z'
    },
    labelPosition: { x: 320, y: 340 },
    adjacentTerritories: ['harpers-ferry', 'maryland-antietam', 'virginia-richmond', 'virginia-shenandoah']
  },
  {
    id: 'virginia-shenandoah',
    name: 'Shenandoah Valley (VA)',
    mapName: 'Drill Camp',
    owner: 'CSA',
    victoryPoints: 15,
    isCapital: false,
    coordinates: {
      type: 'polygon',
      data: 'M 200,280 L 280,280 L 280,360 L 200,360 Z'
    },
    labelPosition: { x: 240, y: 320 },
    adjacentTerritories: ['harpers-ferry', 'virginia-north', 'virginia-richmond']
  },
  {
    id: 'virginia-richmond',
    name: 'Richmond (VA)',
    mapName: 'Drill Camp',
    owner: 'CSA',
    hasWaterAccess: true,
    victoryPoints: 30,
    coordinates: {
      type: 'polygon',
      data: 'M 280,360 L 400,360 L 400,440 L 280,440 Z'
    },
    labelPosition: { x: 340, y: 400 },
    adjacentTerritories: ['virginia-north', 'virginia-shenandoah']
  },
  {
    id: 'washington-dc',
    name: 'Washington D.C.',
    mapName: 'Drill Camp',
    owner: 'USA',
    hasWaterAccess: true,
    victoryPoints: 30,
    coordinates: {
      type: 'polygon',
      data: 'M 340,240 L 400,240 L 400,280 L 340,280 Z'
    },
    labelPosition: { x: 370, y: 260 },
    adjacentTerritories: ['maryland-antietam', 'virginia-north']
  }
];

// Map-to-Territory mapping based on War of Rights maps
export const MAP_TERRITORY_MAPPING = {
  // Antietam maps -> Maryland
  "East Woods Skirmish": "maryland-antietam",
  "Hooker's Push": "maryland-antietam",
  "Hagerstown Turnpike": "maryland-antietam",
  "Miller's Cornfield": "maryland-antietam",
  "East Woods": "maryland-antietam",
  "Nicodemus Hill": "maryland-antietam",
  "Bloody Lane": "maryland-antietam",
  "Pry Ford": "maryland-antietam",
  "Pry Grist Mill": "maryland-antietam",
  "Pry House": "maryland-antietam",
  "West Woods": "maryland-antietam",
  "Dunker Church": "maryland-antietam",
  "Burnside's Bridge": "maryland-antietam",
  "Cooke's Countercharge": "maryland-antietam",
  "Otto and Sherrick Farms": "maryland-antietam",
  "Roulette Lane": "maryland-antietam",
  "Piper Farm": "maryland-antietam",
  "Hill's Counterattack": "maryland-antietam",
  
  // Harpers Ferry maps
  "Maryland Heights": "harpers-ferry",
  "River Crossing": "harpers-ferry",
  "Downtown": "harpers-ferry",
  "School House Ridge": "harpers-ferry",
  "Bolivar Heights Camp": "harpers-ferry",
  "High Street": "harpers-ferry",
  "Shenandoah Street": "harpers-ferry",
  "Harpers Ferry Graveyard": "harpers-ferry",
  "Washington Street": "harpers-ferry",
  "Bolivar Heights Redoubt": "harpers-ferry",
  
  // South Mountain maps
  "Garland's Stand": "south-mountain",
  "Cox's Push": "south-mountain",
  "Hatch's Attack": "south-mountain",
  "Anderson's Counterattack": "south-mountain",
  "Reno's Fall": "south-mountain",
  "Colquitt's Defense": "south-mountain",
  
  // Drill Camp maps (generic - can be used for any territory)
  "Alexander Farm": "virginia-north",
  "Crossroads": "virginia-north",
  "Smith Field": "virginia-north",
  "Crecy's Cornfield": "virginia-shenandoah",
  "Crossley Creek": "virginia-shenandoah",
  "Larsen Homestead": "virginia-richmond",
  "South Woodlot": "virginia-richmond",
  "Flemming's Meadow": "pennsylvania-gettysburg",
  "Wagon Road": "pennsylvania-gettysburg",
  "Union Camp": "washington-dc",
  "Pat's Turnpike": "virginia-north",
  "Stefan's Lot": "virginia-shenandoah",
  "Confederate Encampment": "virginia-richmond",

  // Antietam Conquest maps -> Maryland
  "Framing Fencelines": "maryland-antietam",
  "Smokestacks": "maryland-antietam",
  "Forest Stream": "maryland-antietam",
  "Farmland": "maryland-antietam",
  "Limestone Bridge": "maryland-antietam",
  "Waterways": "maryland-antietam",

  // Drill Camp Conquest maps
  "Towering Trunks": "virginia-north",
  "Corn Crib": "virginia-north",
  "Orchards": "pennsylvania-gettysburg",
  "Railroad Cut": "pennsylvania-gettysburg",

  // Harpers Ferry Conquest maps
  "Overlook": "harpers-ferry",
  "River Town": "harpers-ferry",
  "Outskirts": "harpers-ferry",
  "Valley": "harpers-ferry",

  // South Mountain Conquest maps
  "Log Cabin": "south-mountain",
  "Wheat Fields": "south-mountain",
  "Rocky Slopes": "south-mountain",
  "Hilltop": "south-mountain"
};

// Helper function to get territory ID from map name
export const getTerritoryForMap = (mapName) => {
  return MAP_TERRITORY_MAPPING[mapName] || null;
};

// All available War of Rights maps
export const ALL_MAPS = [
  // Antietam
  "East Woods Skirmish", "Hooker's Push", "Hagerstown Turnpike",
  "Miller's Cornfield", "East Woods", "Nicodemus Hill",
  "Bloody Lane", "Pry Ford", "Pry Grist Mill", "Pry House",
  "West Woods", "Dunker Church", "Burnside's Bridge",
  "Cooke's Countercharge", "Otto and Sherrick Farms",
  "Roulette Lane", "Piper Farm", "Hill's Counterattack",
  // Harpers Ferry
  "Maryland Heights", "River Crossing", "Downtown",
  "School House Ridge", "Bolivar Heights Camp", "High Street",
  "Shenandoah Street", "Harpers Ferry Graveyard", "Washington Street",
  "Bolivar Heights Redoubt",
  // South Mountain
  "Garland's Stand", "Cox's Push", "Hatch's Attack",
  "Anderson's Counterattack", "Reno's Fall", "Colquitt's Defense",
  // Drill Camp
  "Alexander Farm", "Crossroads", "Smith Field",
  "Crecy's Cornfield", "Crossley Creek", "Larsen Homestead",
  "South Woodlot", "Flemming's Meadow", "Wagon Road",
  "Union Camp", "Pat's Turnpike", "Stefan's Lot",
  "Confederate Encampment",
  // Antietam Conquest
  "Framing Fencelines", "Smokestacks", "Forest Stream",
  "Farmland", "Limestone Bridge", "Waterways",
  // Drill Camp Conquest
  "Towering Trunks", "Corn Crib", "Orchards", "Railroad Cut",
  // Harpers Ferry Conquest
  "Overlook", "River Town", "Outskirts", "Valley",
  // South Mountain Conquest
  "Log Cabin", "Wheat Fields", "Rocky Slopes", "Hilltop"
].sort();

// ============================================================================
// DEFAULT TERRAIN TYPE MAP GROUPINGS
// These are configurable via campaign settings. Maps can appear in multiple groups.
// Location-specific mapsets (Antietam, Harpers Ferry, South Mountain) remain
// on territories directly via the 'maps' array and are NOT terrain groups.
// ============================================================================

export const DEFAULT_TERRAIN_GROUPS = {
  'Farmlands': [
    'Alexander Farm', 'Bloody Lane', 'Bolivar Heights Camp',
    'Bolivar Heights Redoubt', "Burnside's Bridge", "Cooke's Countercharge",
    'Corn Crib', "Cox's Push", "Crecy's Cornfield", 'Crossley Creek',
    'Crossroads', 'Dunker Church', 'East Woods Skirmish', 'Farmland',
    "Flemming's Meadow", 'Forest Stream', 'Framing Fencelines',
    'Hagerstown Turnpike', "Hill's Counterattack", 'Hilltop',
    "Hooker's Push", 'Limestone Bridge', "Miller's Cornfield",
    'Nicodemus Hill', 'Otto and Sherrick Farms', "Pat's Turnpike",
    'Piper Farm', 'Pry Ford', 'Pry House', 'Railroad Cut',
    'Rocky Slopes', 'Roulette Lane', 'School House Ridge', 'Smith Field',
    "Stefan's Lot", 'Union Camp', 'Valley', 'Wagon Road'
  ],
  'Wooded': [
    "Anderson's Counterattack", "Burnside's Bridge", "Colquitt's Defense",
    'Corn Crib', 'East Woods', 'East Woods Skirmish', 'Forest Stream',
    "Garland's Stand", "Hatch's Attack", 'Hilltop', 'Larsen Homestead',
    'Log Cabin', 'Maryland Heights', 'Orchards', 'Overlook',
    'Pry Grist Mill', 'Railroad Cut', "Reno's Fall", 'Rocky Slopes',
    'Smokestacks', 'South Woodlot', 'Towering Trunks', 'Waterways',
    'West Woods'
  ],
  'Urban': [
    'Bolivar Heights Camp', 'Bolivar Heights Redoubt',
    'Confederate Encampment', 'Crossroads', 'Downtown',
    'Harpers Ferry Graveyard', 'High Street', 'Otto and Sherrick Farms',
    'Outskirts', 'River Crossing', 'River Town', 'Shenandoah Street',
    'Union Camp', 'Washington Street'
  ]
};

// War of Rights maps organized by mapset
export const MAPS_BY_MAPSET = {
  'Antietam': [
    "East Woods Skirmish", "Hooker's Push", "Hagerstown Turnpike",
    "Miller's Cornfield", "East Woods", "Nicodemus Hill",
    "Bloody Lane", "Pry Ford", "Pry Grist Mill", "Pry House",
    "West Woods", "Dunker Church", "Burnside's Bridge",
    "Cooke's Countercharge", "Otto and Sherrick Farms",
    "Roulette Lane", "Piper Farm", "Hill's Counterattack"
  ],
  'Harpers Ferry': [
    "Maryland Heights", "River Crossing", "Downtown",
    "School House Ridge", "Bolivar Heights Camp", "High Street",
    "Shenandoah Street", "Harpers Ferry Graveyard", "Washington Street",
    "Bolivar Heights Redoubt"
  ],
  'South Mountain': [
    "Garland's Stand", "Cox's Push", "Hatch's Attack",
    "Anderson's Counterattack", "Reno's Fall", "Colquitt's Defense"
  ],
  'Drill Camp': [
    "Alexander Farm", "Crossroads", "Smith Field",
    "Crecy's Cornfield", "Crossley Creek", "Larsen Homestead",
    "South Woodlot", "Flemming's Meadow", "Wagon Road",
    "Union Camp", "Pat's Turnpike", "Stefan's Lot",
    "Confederate Encampment"
  ],
  'Antietam Conquest': [
    "Framing Fencelines", "Smokestacks", "Forest Stream",
    "Farmland", "Limestone Bridge", "Waterways"
  ],
  'Drill Camp Conquest': [
    "Towering Trunks", "Corn Crib", "Orchards", "Railroad Cut"
  ],
  'Harpers Ferry Conquest': [
    "Overlook", "River Town", "Outskirts", "Valley"
  ],
  'South Mountain Conquest': [
    "Log Cabin", "Wheat Fields", "Rocky Slopes", "Hilltop"
  ]
};