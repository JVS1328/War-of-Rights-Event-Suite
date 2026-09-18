/**
 * Eastern Theatre of the War - County-Based Campaign Map
 *
 * Campaign Timeline: April 1861 - December 1865
 * Turn Length: 2 months (6 turns per year)
 * Victory: December 1865 date OR either side reaches ≤0 CP/SP
 *
 * Geographic scope:
 * - Maryland (all counties)
 * - West Virginia (all counties)
 * - Virginia (all counties/independent cities)
 * - Pennsylvania (all counties)
 *
 * VP BALANCE:
 * - Each side has TWO capital regions worth 7 VP each
 * - USA Capitals: Washington DC Region, Philadelphia
 * - CSA Capitals: Richmond, Petersburg
 * - Normal regions: 1-5 VP
 * - Neutral buffer zone in contested areas
 *
 * Region Design: MAX 2-3 counties per region for strategic maneuverability
 */

// ============================================================================
// WAR OF RIGHTS MAP ASSIGNMENTS
// ============================================================================
export const MARYLAND_1862_MAPS = {
  antietam: [
    "East Woods Skirmish", "Hooker's Push", "Hagerstown Turnpike",
    "Miller's Cornfield", "East Woods", "Nicodemus Hill",
    "Bloody Lane", "Pry Ford", "Pry Grist Mill", "Pry House",
    "West Woods", "Dunker Church", "Burnside's Bridge",
    "Cooke's Countercharge", "Otto and Sherrick Farms",
    "Roulette Lane", "Piper Farm", "Hill's Counterattack"
  ],
  harpersFerry: [
    "Maryland Heights", "River Crossing", "Downtown",
    "School House Ridge", "Bolivar Heights Camp", "High Street",
    "Shenandoah Street", "Harpers Ferry Graveyard", "Washington Street",
    "Bolivar Heights Redoubt"
  ],
  southMountain: [
    "Garland's Stand", "Cox's Push", "Hatch's Attack",
    "Anderson's Counterattack", "Reno's Fall", "Colquitt's Defense"
  ],
};

// ============================================================================
// EASTERN THEATRE REGIONS
// VP Scale: 7=capital, 5=key objective, 4=major, 3=important, 2=moderate, 1=peripheral
// ============================================================================
export const MARYLAND_1862_REGIONS = {
  // ==========================================================================
  // MARYLAND - 24 Counties (12 regions)
  // ==========================================================================

  // USA CAPITAL - Washington DC Region (Montgomery + Prince George's)
  'md-washington-dc': {
    name: 'Washington DC Region',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 7, // USA CAPITAL
    isUrban: true,
    isCapital: true,
    countyFips: ['24031', '24033'], // Montgomery, Prince George's
    terrainWeights: { Urban: 4, Farmlands: 1, Wooded: 1 },
    adjacentTerritories: ['md-frederick', 'md-howard', 'md-anne-arundel', 'md-charles', 'va-loudoun', 'va-fairfax'],
  },

  // Western Maryland - Allegany + Garrett
  'md-western': {
    name: 'Western Maryland',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['24001', '24023'], // Allegany, Garrett
    terrainWeights: { Wooded: 4, Farmlands: 2, Urban: 0 },
    adjacentTerritories: ['md-washington-county', 'wv-potomac-highlands', 'pa-alleghenies'],
  },

  // Washington County (Antietam battlefield)
  'md-washington-county': {
    name: 'Washington County (Antietam)',
    stateAbbr: 'MD',
    owner: 'NEUTRAL',
    pointValue: 5, // KEY OBJECTIVE - Main battlefield
    isUrban: false,
    countyFips: ['24043'], // Washington County
    maps: MARYLAND_1862_MAPS.antietam,
    adjacentTerritories: ['md-western', 'md-frederick', 'wv-jefferson', 'pa-cumberland-valley'],
  },

  // Frederick County (South Mountain)
  'md-frederick': {
    name: 'Frederick County',
    stateAbbr: 'MD',
    owner: 'NEUTRAL',
    pointValue: 4, // MAJOR - South Mountain battles
    isUrban: false,
    countyFips: ['24021'], // Frederick County
    maps: MARYLAND_1862_MAPS.southMountain,
    adjacentTerritories: ['md-washington-county', 'md-carroll', 'md-howard', 'md-washington-dc', 'wv-jefferson', 'pa-cumberland-valley'],
  },

  // Carroll County
  'md-carroll': {
    name: 'Carroll County',
    stateAbbr: 'MD',
    owner: 'NEUTRAL',
    pointValue: 2,
    isUrban: false,
    countyFips: ['24013'], // Carroll
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['md-frederick', 'md-baltimore', 'md-howard', 'pa-cumberland-valley'],
  },

  // Baltimore Region (City + County)
  'md-baltimore': {
    name: 'Baltimore',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 4, // MAJOR - Key port city
    isUrban: true,
    countyFips: ['24510', '24005'], // Baltimore City, Baltimore County
    terrainWeights: { Urban: 4, Farmlands: 1, Wooded: 1 },
    adjacentTerritories: ['md-carroll', 'md-harford-cecil', 'md-howard', 'md-anne-arundel'],
  },

  // Harford + Cecil (Northeast MD)
  'md-harford-cecil': {
    name: 'Harford & Cecil',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['24025', '24015'], // Harford, Cecil
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['md-baltimore', 'md-kent', 'pa-southeast', 'pa-cumberland-valley'],
  },

  // Howard County
  'md-howard': {
    name: 'Howard County',
    stateAbbr: 'MD',
    owner: 'NEUTRAL',
    pointValue: 2,
    isUrban: false,
    countyFips: ['24027'], // Howard
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['md-frederick', 'md-carroll', 'md-baltimore', 'md-anne-arundel', 'md-washington-dc'],
  },

  // Anne Arundel (Annapolis)
  'md-anne-arundel': {
    name: 'Anne Arundel (Annapolis)',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 3, // IMPORTANT - State capital
    isUrban: true,
    countyFips: ['24003'], // Anne Arundel
    terrainWeights: { Farmlands: 3, Wooded: 1, Urban: 2 },
    adjacentTerritories: ['md-baltimore', 'md-howard', 'md-washington-dc', 'md-calvert', 'md-queen-annes'],
  },

  // Charles County
  'md-charles': {
    name: 'Charles County',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['24017'], // Charles
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-washington-dc', 'md-calvert', 'md-st-marys', 'va-king-george'],
  },

  // Calvert County
  'md-calvert': {
    name: 'Calvert County',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['24009'], // Calvert
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-anne-arundel', 'md-charles', 'md-st-marys'],
  },

  // St. Mary's County
  'md-st-marys': {
    name: "St. Mary's County",
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['24037'], // St. Mary's
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-charles', 'md-calvert', 'va-northumberland'],
  },

  // Kent County
  'md-kent': {
    name: 'Kent County',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['24029'], // Kent
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-harford-cecil', 'md-queen-annes'],
  },

  // Queen Anne's + Caroline
  'md-queen-annes': {
    name: "Queen Anne's & Caroline",
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['24035', '24011'], // Queen Anne's, Caroline
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-anne-arundel', 'md-kent', 'md-talbot'],
  },

  // Talbot + Dorchester
  'md-talbot': {
    name: 'Talbot & Dorchester',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['24041', '24019'], // Talbot, Dorchester
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-queen-annes', 'md-wicomico'],
  },

  // Wicomico + Somerset + Worcester (Lower Eastern Shore)
  'md-wicomico': {
    name: 'Lower Eastern Shore',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['24045', '24039', '24047'], // Wicomico, Somerset, Worcester
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-talbot', 'va-accomack'],
  },

  // ==========================================================================
  // WEST VIRGINIA - 55 Counties (8 regions)
  // ==========================================================================

  // KEY OBJECTIVE - kept whole, it carries the Harper's Ferry map pool
  'wv-jefferson': {
    name: "Harper's Ferry (Jefferson Co.)",
    stateAbbr: 'WV',
    owner: 'NEUTRAL',
    pointValue: 5,
    isUrban: true,
    countyFips: ['54037'],
    maps: MARYLAND_1862_MAPS.harpersFerry,
    adjacentTerritories: ['md-washington-county', 'md-frederick', 'wv-eastern-panhandle', 'va-loudoun', 'va-clarke'],
  },

  // B&O corridor, contested from the start
  'wv-eastern-panhandle': {
    name: 'Eastern Panhandle',
    stateAbbr: 'WV',
    owner: 'NEUTRAL',
    pointValue: 5,
    isUrban: false,
    countyFips: ['54003', '54065', '54027', '54031'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['wv-jefferson', 'va-clarke', 'va-shenandoah-county', 'wv-potomac-highlands'],
  },

  // The Alleghenies between the Valley and the Ohio watershed
  'wv-potomac-highlands': {
    name: 'Potomac Highlands',
    stateAbbr: 'WV',
    owner: 'USA',
    pointValue: 6,
    isUrban: false,
    countyFips: ['54057', '54023', '54071', '54093', '54083', '54075', '54101'],
    terrainWeights: { Farmlands: 2, Wooded: 5, Urban: 0 },
    adjacentTerritories: ['md-western', 'wv-eastern-panhandle', 'va-highland', 'wv-monongahela', 'wv-greenbrier'],
  },

  // Southern approach to the Virginia Central
  'wv-greenbrier': {
    name: 'Greenbrier Valley',
    stateAbbr: 'WV',
    owner: 'USA',
    pointValue: 5,
    isUrban: false,
    countyFips: ['54025', '54089', '54063', '54055', '54067', '54015'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['wv-potomac-highlands', 'wv-kanawha', 'va-bath', 'wv-ohio-valley', 'va-tazewell', 'va-giles', 'wv-monongahela'],
  },

  // B&O main stem - the link between Wheeling and Pennsylvania
  'wv-monongahela': {
    name: 'Monongahela Valley',
    stateAbbr: 'WV',
    owner: 'USA',
    pointValue: 8,
    isUrban: false,
    countyFips: ['54061', '54077', '54091', '54049', '54041', '54033', '54097', '54001', '54007', '54021'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['pa-pittsburgh', 'wv-wheeling', 'wv-potomac-highlands', 'wv-greenbrier', 'wv-kanawha'],
  },

  // Seat of the Restored Government
  'wv-wheeling': {
    name: 'Wheeling & the Northern Panhandle',
    stateAbbr: 'WV',
    owner: 'USA',
    pointValue: 4,
    isUrban: true,
    countyFips: ['54051', '54069', '54009', '54029', '54095', '54103', '54073', '54017', '54085', '54013'],
    terrainWeights: { Farmlands: 1, Wooded: 4, Urban: 1 },
    adjacentTerritories: ['pa-pittsburgh', 'wv-ohio-valley', 'wv-monongahela'],
  },

  // Salt works and the Charleston approach
  'wv-kanawha': {
    name: 'Kanawha Valley',
    stateAbbr: 'WV',
    owner: 'USA',
    pointValue: 4,
    isUrban: true,
    countyFips: ['54039', '54019', '54087', '54079', '54005', '54043', '54045'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['wv-greenbrier', 'wv-monongahela', 'wv-ohio-valley'],
  },

  // The Ohio River frontier
  'wv-ohio-valley': {
    name: 'Ohio Valley & the Southwest',
    stateAbbr: 'WV',
    owner: 'USA',
    pointValue: 7,
    isUrban: false,
    countyFips: ['54107', '54105', '54035', '54053', '54011', '54099', '54059', '54081', '54109', '54047'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['wv-wheeling', 'wv-kanawha', 'wv-greenbrier', 'va-buchanan'],
  },

  // ==========================================================================
  // VIRGINIA - Counties/Independent Cities (44 regions)
  // ==========================================================================

  // Loudoun County - Key Potomac crossing
  'va-loudoun': {
    name: 'Loudoun County',
    stateAbbr: 'VA',
    owner: 'NEUTRAL',
    pointValue: 3, // IMPORTANT - Key crossing
    isUrban: false,
    countyFips: ['51107'], // Loudoun
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['md-washington-dc', 'wv-jefferson', 'va-fairfax', 'va-clarke', 'va-fauquier'],
  },

  // Fairfax + Arlington + Alexandria (Northern Virginia)
  'va-fairfax': {
    name: 'Northern Virginia',
    stateAbbr: 'VA',
    owner: 'NEUTRAL',
    pointValue: 4, // MAJOR - Near DC
    isUrban: true,
    countyFips: ['51059', '51013', '51510', '51600', '51610'], // Fairfax, Arlington, Alexandria City, Fairfax City, Falls Church
    terrainWeights: { Farmlands: 3, Wooded: 2, Urban: 1 },
    adjacentTerritories: ['md-washington-dc', 'va-loudoun', 'va-prince-william', 'va-clarke'],
  },

  // Prince William + Manassas
  'va-prince-william': {
    name: 'Prince William (Manassas)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 5, // KEY OBJECTIVE - Bull Run battles
    isUrban: true,
    countyFips: ['51153', '51683', '51685'], // Prince William, Manassas, Manassas Park
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-fairfax', 'va-fauquier', 'va-stafford'],
  },

  // Fauquier + Culpeper
  'va-fauquier': {
    name: 'Fauquier & Culpeper',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['51061', '51047'], // Fauquier, Culpeper
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-prince-william', 'va-loudoun', 'va-page', 'va-stafford', 'va-orange'],
  },

  // Clarke + Frederick VA + Winchester
  'va-clarke': {
    name: 'Clarke & Frederick (Winchester)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 4, // MAJOR - Winchester
    isUrban: true,
    countyFips: ['51043', '51069', '51840'], // Clarke, Frederick, Winchester
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['wv-jefferson', 'wv-eastern-panhandle', 'va-loudoun', 'va-fairfax', 'va-warren', 'va-shenandoah-county'],
  },

  // Warren County
  'va-warren': {
    name: 'Warren County',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51187'], // Warren
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-clarke', 'va-shenandoah-county', 'va-page'],
  },

  // Shenandoah County
  'va-shenandoah-county': {
    name: 'Shenandoah County',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3, // IMPORTANT - Valley
    isUrban: false,
    countyFips: ['51171'], // Shenandoah
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['wv-eastern-panhandle', 'va-clarke', 'va-warren', 'va-page', 'va-rockingham'],
  },

  // Page + Rappahannock
  'va-page': {
    name: 'Page & Rappahannock',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51139', '51157'], // Page, Rappahannock
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-shenandoah-county', 'va-warren', 'va-rockingham', 'va-madison', 'va-fauquier'],
  },

  // Madison + Greene
  'va-madison': {
    name: 'Madison & Greene',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51113', '51079'], // Madison, Greene
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-page', 'va-orange', 'va-albemarle', 'va-rockingham'],
  },

  // Rockingham + Harrisonburg
  'va-rockingham': {
    name: 'Rockingham (Harrisonburg)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3, // IMPORTANT - Valley
    isUrban: true,
    countyFips: ['51165', '51660'], // Rockingham, Harrisonburg
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['va-shenandoah-county', 'va-page', 'va-madison', 'va-augusta', 'va-highland'],
  },

  // Highland County
  'va-highland': {
    name: 'Highland County',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51091'], // Highland County VA
    terrainWeights: { Wooded: 5, Farmlands: 1, Urban: 0 },
    adjacentTerritories: ['wv-potomac-highlands', 'va-rockingham', 'va-augusta', 'va-bath'],
  },

  // Augusta + Staunton + Waynesboro
  'va-augusta': {
    name: 'Augusta (Staunton)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3, // IMPORTANT - Valley hub
    isUrban: true,
    countyFips: ['51015', '51790', '51820'], // Augusta, Staunton, Waynesboro
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['va-rockingham', 'va-highland', 'va-bath', 'va-rockbridge', 'va-albemarle', 'va-nelson'],
  },

  // Bath + Alleghany (VA)
  'va-bath': {
    name: 'Bath & Alleghany',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51017', '51005'], // Bath, Alleghany
    terrainWeights: { Wooded: 5, Farmlands: 1, Urban: 0 },
    adjacentTerritories: ['va-highland', 'va-augusta', 'va-rockbridge', 'wv-greenbrier', 'va-botetourt'],
  },

  // Orange + Louisa
  'va-orange': {
    name: 'Orange & Louisa',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51137', '51109'], // Orange, Louisa
    terrainWeights: { Wooded: 5, Farmlands: 1, Urban: 0 },
    adjacentTerritories: ['va-fauquier', 'va-madison', 'va-albemarle', 'va-stafford', 'va-caroline', 'va-fluvanna'],
  },

  // Stafford + Spotsylvania + Fredericksburg
  'va-stafford': {
    name: 'Stafford & Spotsylvania (Fredericksburg)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 5, // KEY OBJECTIVE - Fredericksburg battles
    isUrban: true,
    countyFips: ['51179', '51177', '51630'], // Stafford, Spotsylvania, Fredericksburg
    terrainWeights: { Farmlands: 2, Wooded: 3, Urban: 1 },
    adjacentTerritories: ['va-prince-william', 'va-fauquier', 'va-orange', 'va-caroline', 'va-king-george'],
  },

  // King George + Westmoreland
  'va-king-george': {
    name: 'King George & Westmoreland',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51099', '51193'], // King George, Westmoreland
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['md-charles', 'va-stafford', 'va-caroline', 'va-northumberland', 'va-richmond-county'],
  },

  // Northumberland + Lancaster
  'va-northumberland': {
    name: 'Northumberland & Lancaster',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51133', '51103'], // Northumberland, Lancaster
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-st-marys', 'va-king-george', 'va-richmond-county', 'va-middlesex'],
  },

  // Richmond County + Essex
  'va-richmond-county': {
    name: 'Richmond County & Essex',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51159', '51057'], // Richmond County, Essex
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['va-king-george', 'va-northumberland', 'va-caroline', 'va-king-queen'],
  },

  // Middlesex + Mathews
  'va-middlesex': {
    name: 'Middlesex & Mathews',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51119', '51115'], // Middlesex, Mathews
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['va-northumberland', 'va-king-queen', 'va-gloucester'],
  },

  // King & Queen + King William
  'va-king-queen': {
    name: 'King & Queen',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51097', '51101'], // King & Queen, King William
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-richmond-county', 'va-middlesex', 'va-caroline', 'va-new-kent'],
  },

  // Caroline + Hanover
  'va-caroline': {
    name: 'Caroline & Hanover',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51033', '51085'], // Caroline, Hanover
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-stafford', 'va-king-george', 'va-richmond-county', 'va-king-queen', 'va-orange', 'va-richmond'],
  },

  // Albemarle + Charlottesville
  'va-albemarle': {
    name: 'Albemarle (Charlottesville)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3,
    isUrban: true,
    countyFips: ['51003', '51540'], // Albemarle, Charlottesville
    terrainWeights: { Farmlands: 3, Wooded: 2, Urban: 1 },
    adjacentTerritories: ['va-madison', 'va-orange', 'va-augusta', 'va-nelson', 'va-fluvanna', 'va-buckingham'],
  },

  // Nelson + Amherst
  'va-nelson': {
    name: 'Nelson & Amherst',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51125', '51009'], // Nelson, Amherst
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-augusta', 'va-albemarle', 'va-rockbridge', 'va-bedford', 'va-buckingham', 'va-appomattox'],
  },

  // Rockbridge + Lexington + Buena Vista
  'va-rockbridge': {
    name: 'Rockbridge (Lexington)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: true,
    countyFips: ['51163', '51678', '51530'], // Rockbridge, Lexington, Buena Vista
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-augusta', 'va-bath', 'va-nelson', 'va-botetourt', 'va-bedford'],
  },

  // Botetourt + Craig
  'va-botetourt': {
    name: 'Botetourt & Craig',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51023', '51045'], // Botetourt, Craig
    terrainWeights: { Wooded: 4, Farmlands: 2, Urban: 0 },
    adjacentTerritories: ['va-rockbridge', 'va-bath', 'va-roanoke', 'va-giles', 'va-bedford'],
  },

  // Bedford + Bedford City
  'va-bedford': {
    name: 'Bedford County',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51019', '51515'], // Bedford, Bedford City
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-rockbridge', 'va-nelson', 'va-botetourt', 'va-roanoke', 'va-appomattox', 'va-campbell'],
  },

  // Fluvanna + Goochland
  'va-fluvanna': {
    name: 'Fluvanna & Goochland',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51065', '51075'], // Fluvanna, Goochland
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-albemarle', 'va-orange', 'va-buckingham', 'va-powhatan', 'va-richmond'],
  },

  // Buckingham + Cumberland
  'va-buckingham': {
    name: 'Buckingham & Cumberland',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51029', '51049'], // Buckingham, Cumberland
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-albemarle', 'va-nelson', 'va-fluvanna', 'va-appomattox', 'va-powhatan'],
  },

  // Appomattox + Prince Edward
  'va-appomattox': {
    name: 'Appomattox & Prince Edward',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3, // IMPORTANT - Surrender site
    isUrban: false,
    countyFips: ['51011', '51147'], // Appomattox, Prince Edward
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-nelson', 'va-bedford', 'va-buckingham', 'va-campbell', 'va-charlotte', 'va-nottoway'],
  },

  // Powhatan + Amelia
  'va-powhatan': {
    name: 'Powhatan & Amelia',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51145', '51007'], // Powhatan, Amelia
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-fluvanna', 'va-buckingham', 'va-richmond', 'va-chesterfield', 'va-nottoway'],
  },

  // CSA CAPITAL - Richmond + Henrico
  'va-richmond': {
    name: 'Richmond',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 7, // CSA CAPITAL
    isUrban: true,
    isCapital: true,
    countyFips: ['51760', '51087'], // Richmond City, Henrico
    terrainWeights: { Urban: 4, Farmlands: 1, Wooded: 1 },
    adjacentTerritories: ['va-caroline', 'va-fluvanna', 'va-powhatan', 'va-chesterfield', 'va-new-kent', 'va-petersburg'],
  },

  // New Kent + Charles City
  'va-new-kent': {
    name: 'New Kent & Charles City',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51127', '51036'], // New Kent, Charles City
    terrainWeights: { Wooded: 4, Farmlands: 2, Urban: 0 },
    adjacentTerritories: ['va-king-queen', 'va-richmond', 'va-james-city', 'va-gloucester', 'va-petersburg'],
  },

  // Gloucester + York
  'va-gloucester': {
    name: 'Gloucester & York',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51073', '51199'], // Gloucester, York
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-middlesex', 'va-new-kent', 'va-james-city', 'va-hampton'],
  },

  // James City + Williamsburg
  'va-james-city': {
    name: 'James City (Williamsburg)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: true,
    countyFips: ['51095', '51830'], // James City, Williamsburg
    terrainWeights: { Wooded: 3, Farmlands: 2, Urban: 1 },
    adjacentTerritories: ['va-new-kent', 'va-gloucester', 'va-hampton', 'va-isle-of-wight'],
  },

  // CSA CAPITAL - Petersburg Region
  'va-petersburg': {
    name: 'Petersburg',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 7, // CSA CAPITAL
    isUrban: true,
    isCapital: true,
    countyFips: ['51730', '51149', '51570', '51670'], // Petersburg, Prince George, Colonial Heights, Hopewell
    terrainWeights: { Urban: 4, Farmlands: 1, Wooded: 1 },
    adjacentTerritories: ['va-richmond', 'va-chesterfield', 'va-sussex', 'va-new-kent'],
  },

  // Chesterfield + Dinwiddie
  'va-chesterfield': {
    name: 'Chesterfield & Dinwiddie',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51041', '51053'], // Chesterfield, Dinwiddie
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-richmond', 'va-powhatan', 'va-petersburg', 'va-nottoway', 'va-brunswick'],
  },

  // Nottoway + Lunenburg
  'va-nottoway': {
    name: 'Nottoway & Lunenburg',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51135', '51111'], // Nottoway, Lunenburg
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-powhatan', 'va-appomattox', 'va-chesterfield', 'va-charlotte', 'va-brunswick', 'va-mecklenburg'],
  },

  // Charlotte + Halifax
  'va-charlotte': {
    name: 'Charlotte & Halifax',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51037', '51083'], // Charlotte, Halifax
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['va-appomattox', 'va-nottoway', 'va-campbell', 'va-pittsylvania', 'va-mecklenburg'],
  },

  // Campbell + Lynchburg
  'va-campbell': {
    name: 'Campbell (Lynchburg)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 4, // Lynchburg - key supply hub
    isUrban: true,
    countyFips: ['51031', '51680'], // Campbell, Lynchburg
    terrainWeights: { Farmlands: 2, Wooded: 2, Urban: 2 },
    adjacentTerritories: ['va-bedford', 'va-appomattox', 'va-charlotte', 'va-pittsylvania', 'va-roanoke'],
  },

  // Roanoke + Salem + Roanoke City
  'va-roanoke': {
    name: 'Roanoke',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3, // IMPORTANT
    isUrban: true,
    countyFips: ['51161', '51775', '51770'], // Roanoke County, Salem, Roanoke City
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-botetourt', 'va-bedford', 'va-campbell', 'va-franklin', 'va-montgomery'],
  },

  // Franklin + Floyd
  'va-franklin': {
    name: 'Franklin & Floyd',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51067', '51063'], // Franklin, Floyd
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-roanoke', 'va-pittsylvania', 'va-henry', 'va-montgomery', 'va-carroll'],
  },

  // Pittsylvania + Danville
  'va-pittsylvania': {
    name: 'Pittsylvania (Danville)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: true,
    countyFips: ['51143', '51590'], // Pittsylvania, Danville
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['va-campbell', 'va-charlotte', 'va-franklin', 'va-henry'],
  },

  // Henry + Martinsville + Patrick
  'va-henry': {
    name: 'Henry & Patrick',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51089', '51690', '51141'], // Henry, Martinsville, Patrick
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-pittsylvania', 'va-franklin', 'va-carroll'],
  },

  // Carroll + Grayson + Galax
  'va-carroll': {
    name: 'Carroll & Grayson',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51035', '51077', '51640'], // Carroll, Grayson, Galax
    terrainWeights: { Wooded: 4, Farmlands: 2, Urban: 0 },
    adjacentTerritories: ['va-franklin', 'va-henry', 'va-wythe'],
  },

  // Montgomery + Radford + Pulaski
  'va-montgomery': {
    name: 'Montgomery & Pulaski',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: true,
    countyFips: ['51121', '51750', '51155'], // Montgomery, Radford, Pulaski
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-roanoke', 'va-franklin', 'va-giles', 'va-wythe'],
  },

  // Giles + Bland
  'va-giles': {
    name: 'Giles & Bland',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51071', '51021'], // Giles, Bland
    terrainWeights: { Wooded: 5, Farmlands: 1, Urban: 0 },
    adjacentTerritories: ['va-botetourt', 'va-montgomery', 'wv-greenbrier', 'va-tazewell', 'va-wythe'],
  },

  // Wythe + Smyth
  'va-wythe': {
    name: 'Wythe & Smyth',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['51197', '51173'], // Wythe, Smyth
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-montgomery', 'va-carroll', 'va-giles', 'va-tazewell', 'va-washington-va'],
  },

  // Tazewell + Russell
  'va-tazewell': {
    name: 'Tazewell & Russell',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51185', '51167'], // Tazewell, Russell
    terrainWeights: { Wooded: 4, Farmlands: 2, Urban: 0 },
    adjacentTerritories: ['va-giles', 'va-wythe', 'wv-greenbrier', 'va-buchanan', 'va-washington-va', 'va-wise'],
  },

  // Washington VA + Bristol
  'va-washington-va': {
    name: 'Washington (Bristol)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: true,
    countyFips: ['51191', '51520'], // Washington, Bristol
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-wythe', 'va-tazewell', 'va-scott'],
  },

  // Scott + Lee
  'va-scott': {
    name: 'Scott & Lee',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51169', '51105'], // Scott, Lee
    terrainWeights: { Wooded: 5, Farmlands: 1, Urban: 0 },
    adjacentTerritories: ['va-washington-va', 'va-wise'],
  },

  // Wise + Dickenson + Norton
  'va-wise': {
    name: 'Wise & Dickenson',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51195', '51051', '51720'], // Wise, Dickenson, Norton
    terrainWeights: { Wooded: 5, Farmlands: 1, Urban: 0 },
    adjacentTerritories: ['va-scott', 'va-buchanan', 'va-tazewell'],
  },

  // Buchanan County
  'va-buchanan': {
    name: 'Buchanan County',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51027'], // Buchanan
    terrainWeights: { Wooded: 5, Farmlands: 1, Urban: 0 },
    adjacentTerritories: ['va-tazewell', 'va-wise', 'wv-ohio-valley'],
  },

  // Brunswick + Greensville
  'va-brunswick': {
    name: 'Brunswick & Greensville',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51025', '51081'], // Brunswick, Greensville
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-chesterfield', 'va-nottoway', 'va-mecklenburg', 'va-sussex'],
  },

  // Mecklenburg County
  'va-mecklenburg': {
    name: 'Mecklenburg County',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51117'], // Mecklenburg
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['va-nottoway', 'va-charlotte', 'va-brunswick'],
  },

  // Sussex + Southampton
  'va-sussex': {
    name: 'Sussex & Southampton',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51183', '51175'], // Sussex, Southampton
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-petersburg', 'va-brunswick', 'va-isle-of-wight', 'va-suffolk'],
  },

  // Isle of Wight + Surry
  'va-isle-of-wight': {
    name: 'Isle of Wight & Surry',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51093', '51181'], // Isle of Wight, Surry (Note: 51181 is Surry)
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['va-james-city', 'va-sussex', 'va-suffolk', 'va-hampton', 'va-norfolk'],
  },

  // Hampton + Poquoson + Newport News
  'va-hampton': {
    name: 'Hampton & Newport News',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 4, // Fort Monroe area
    isUrban: true,
    countyFips: ['51650', '51735', '51700'], // Hampton, Poquoson, Newport News
    terrainWeights: { Farmlands: 2, Wooded: 2, Urban: 2 },
    adjacentTerritories: ['va-gloucester', 'va-james-city', 'va-norfolk', 'va-isle-of-wight'],
  },

  // Norfolk + Portsmouth + Virginia Beach + Chesapeake
  'va-norfolk': {
    name: 'Norfolk Region',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 5, // KEY OBJECTIVE - Naval base
    isUrban: true,
    countyFips: ['51710', '51740', '51810', '51550'], // Norfolk, Portsmouth, Virginia Beach, Chesapeake
    terrainWeights: { Urban: 4, Farmlands: 1, Wooded: 1 },
    adjacentTerritories: ['va-hampton', 'va-isle-of-wight', 'va-suffolk', 'va-accomack'],
  },

  // Suffolk + Emporia
  'va-suffolk': {
    name: 'Suffolk',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2,
    isUrban: true,
    countyFips: ['51800', '51595'], // Suffolk, Emporia
    terrainWeights: { Wooded: 4, Farmlands: 2, Urban: 0 },
    adjacentTerritories: ['va-sussex', 'va-isle-of-wight', 'va-norfolk'],
  },

  // Accomack + Northampton (Eastern Shore VA)
  'va-accomack': {
    name: 'Eastern Shore (VA)',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 1,
    isUrban: false,
    countyFips: ['51001', '51131'], // Accomack, Northampton
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['md-wicomico', 'va-norfolk'],
  },

  // ==========================================================================
  // PENNSYLVANIA - 67 Counties (10 regions)
  // ==========================================================================

  // USA CAPITAL - kept whole as the capital-victory objective
  'pa-philadelphia': {
    name: 'Philadelphia',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 7,
    isUrban: true,
    isCapital: true,
    countyFips: ['42101', '42045'],
    terrainWeights: { Farmlands: 1, Wooded: 1, Urban: 4 },
    adjacentTerritories: ['pa-southeast'],
  },

  // Philadelphia's hinterland - the last ground before the capital
  'pa-southeast': {
    name: 'Southeastern Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['42091', '42017', '42029', '42071', '42011'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['pa-philadelphia', 'pa-lehigh', 'md-harford-cecil', 'pa-cumberland-valley', 'pa-harrisburg'],
  },

  // Anthracite country
  'pa-lehigh': {
    name: 'Lehigh Valley & the Poconos',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['42077', '42095', '42025', '42089', '42103', '42127', '42107'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 1 },
    adjacentTerritories: ['pa-southeast', 'pa-wyoming-valley', 'pa-harrisburg'],
  },

  // Upper Susquehanna
  'pa-wyoming-valley': {
    name: 'Wyoming Valley',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['42069', '42115', '42079', '42131', '42015', '42037', '42093', '42097'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 1 },
    adjacentTerritories: ['pa-lehigh', 'pa-north-central', 'pa-harrisburg'],
  },

  // State capital and the PRR trunk
  'pa-harrisburg': {
    name: 'Harrisburg & the Susquehanna',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 5,
    isUrban: true,
    countyFips: ['42075', '42043', '42109', '42119', '42087', '42099', '42067'],
    terrainWeights: { Farmlands: 3, Wooded: 2, Urban: 1 },
    adjacentTerritories: ['pa-southeast', 'pa-lehigh', 'pa-wyoming-valley', 'pa-cumberland-valley', 'pa-north-central', 'pa-alleghenies'],
  },

  // Allegheny Plateau
  'pa-north-central': {
    name: 'North Central Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 5,
    isUrban: false,
    countyFips: ['42113', '42081', '42117', '42105', '42035', '42027', '42083', '42023', '42047'],
    terrainWeights: { Farmlands: 2, Wooded: 5, Urban: 0 },
    adjacentTerritories: ['pa-wyoming-valley', 'pa-harrisburg', 'pa-alleghenies', 'pa-northwest'],
  },

  // FRONTLINE - the invasion corridor out of Maryland
  'pa-cumberland-valley': {
    name: 'Cumberland Valley (Gettysburg)',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 7,
    isUrban: false,
    countyFips: ['42041', '42001', '42057', '42055', '42133'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['pa-harrisburg', 'md-frederick', 'md-carroll', 'pa-alleghenies', 'md-washington-county', 'pa-southeast', 'md-harford-cecil'],
  },

  // FRONTLINE - the mountain route from western Maryland
  'pa-alleghenies': {
    name: 'Allegheny Highlands',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 7,
    isUrban: false,
    countyFips: ['42061', '42013', '42111', '42009', '42021', '42063', '42033', '42065'],
    terrainWeights: { Farmlands: 3, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['pa-harrisburg', 'pa-north-central', 'pa-pittsburgh', 'pa-cumberland-valley', 'md-western', 'pa-northwest'],
  },

  // FRONTLINE - western industry, the prize at the end of the western axis
  'pa-pittsburgh': {
    name: 'Pittsburgh & the Monongahela',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 8,
    isUrban: true,
    countyFips: ['42003', '42125', '42059', '42051', '42129', '42007'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 1 },
    adjacentTerritories: ['pa-northwest', 'wv-wheeling', 'pa-alleghenies', 'wv-monongahela'],
  },

  // Lake Erie and the oil region
  'pa-northwest': {
    name: 'Northwestern Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 7,
    isUrban: true,
    countyFips: ['42049', '42039', '42085', '42073', '42019', '42123', '42053', '42121', '42005', '42031'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['pa-pittsburgh', 'pa-north-central', 'pa-alleghenies'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const getAllRegionIds = () => Object.keys(MARYLAND_1862_REGIONS);

export const getRegionById = (id) => MARYLAND_1862_REGIONS[id];

export const getRegionsByState = (stateAbbr) => {
  return Object.entries(MARYLAND_1862_REGIONS)
    .filter(([_, region]) => region.stateAbbr === stateAbbr)
    .map(([id, region]) => ({ id, ...region }));
};

export const getMaryland1862States = () => {
  const states = new Set();
  Object.values(MARYLAND_1862_REGIONS).forEach(region => {
    states.add(region.stateAbbr);
  });
  return Array.from(states).sort();
};

export const getMapsForRegion = (regionId) => {
  const region = MARYLAND_1862_REGIONS[regionId];
  if (!region) return [];
  return region.maps || [];
};

export const getRandomMapForRegion = (regionId) => {
  const maps = getMapsForRegion(regionId);
  if (maps.length === 0) return null;
  return maps[Math.floor(Math.random() * maps.length)];
};

export const createMaryland1862Territories = () => {
  return Object.entries(MARYLAND_1862_REGIONS).map(([id, region]) => ({
    id,
    name: region.name,
    owner: region.owner,
    pointValue: region.pointValue,
    victoryPoints: region.pointValue,
    adjacentTerritories: region.adjacentTerritories,
    captureHistory: [],
    countyFips: region.countyFips,
    stateAbbr: region.stateAbbr,
    isUrban: region.isUrban || false,
    isCapital: region.isCapital || false,
    maps: region.maps,
    terrainWeights: region.terrainWeights,
  }));
};

export const calculateInitialVP = () => {
  let usaVP = 0;
  let csaVP = 0;
  let neutralVP = 0;

  Object.values(MARYLAND_1862_REGIONS).forEach(region => {
    if (region.owner === 'USA') {
      usaVP += region.pointValue;
    } else if (region.owner === 'CSA') {
      csaVP += region.pointValue;
    } else {
      neutralVP += region.pointValue;
    }
  });

  return { usa: usaVP, csa: csaVP, neutral: neutralVP };
};

export const getKeyCampaignTerritories = () => {
  return Object.entries(MARYLAND_1862_REGIONS)
    .filter(([_, region]) => region.pointValue >= 3)
    .map(([id, region]) => ({ id, ...region }));
};

export const getTerritoriesByOwner = (owner) => {
  return Object.entries(MARYLAND_1862_REGIONS)
    .filter(([_, region]) => region.owner === owner)
    .map(([id, region]) => ({ id, ...region }));
};

export const getUrbanTerritories = () => {
  return Object.entries(MARYLAND_1862_REGIONS)
    .filter(([_, region]) => region.isUrban)
    .map(([id, region]) => ({ id, ...region }));
};

export const getCapitalTerritories = () => {
  return Object.entries(MARYLAND_1862_REGIONS)
    .filter(([_, region]) => region.isCapital)
    .map(([id, region]) => ({ id, ...region }));
};
