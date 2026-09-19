/**
 * Eastern Theatre County-Based Campaign Map
 *
 * Comprehensive county groupings for the Eastern Theatre of the American Civil War.
 * Each state is divided into city-based and geographic regions.
 * ALL counties are assigned - none are left out.
 * Ownership is set to historical status as of April 1861.
 */

export const EASTERN_THEATRE_REGIONS = {
  // ============================================================================
  // PENNSYLVANIA (PA) - Union State
  // ============================================================================
  'pa-philadelphia': {
    name: 'Philadelphia',
    stateAbbr: 'PA',
    owner: 'USA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // Major city
    countyFips: ['42101', '42045', '42091'], // Philadelphia, Delaware, Montgomery
    adjacentTerritories: ['pa-southeast', 'nj-south'],
  },
  'pa-southeast': {
    name: 'Southeast Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['42017', '42029', '42075', '42071'], // Bucks, Chester, Lebanon, Lancaster
    adjacentTerritories: ['pa-philadelphia', 'pa-south-central', 'md-north', 'nj-south'],
  },
  'pa-south-central': {
    name: 'South Central Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 2, // Moderate // Gettysburg area
    countyFips: ['42001', '42041', '42043', '42055', '42133', '42099', '42095'], // Adams, Cumberland, Dauphin, Franklin, York, Northumberland, Northampton
    adjacentTerritories: ['pa-southeast', 'pa-central', 'md-north', 'wv-eastern-panhandle'],
  },
  'pa-pittsburgh': {
    name: 'Pittsburgh',
    stateAbbr: 'PA',
    owner: 'USA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate
    countyFips: ['42003', '42007', '42125', '42129'], // Allegheny, Beaver, Washington, Westmoreland
    adjacentTerritories: ['pa-western', 'oh-northeast', 'wv-northern'],
  },
  'pa-central': {
    name: 'Central Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['42013', '42027', '42033', '42035', '42037', '42061', '42067', '42077', '42079', '42081', '42087', '42093', '42105', '42109', '42117', '42119', '42015'], // Blair, Centre, Clearfield, Clinton, Columbia, Huntingdon, Juniata, Lehigh, Luzerne, Lycoming, Mifflin, Montour, Perry, Snyder, Tioga, Union, Bradford
    adjacentTerritories: ['pa-south-central', 'pa-western', 'pa-northeast', 'ny-southern-tier'],
  },
  'pa-western': {
    name: 'Western Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['42005', '42009', '42011', '42019', '42021', '42023', '42031', '42039', '42047', '42049', '42051', '42053', '42059', '42063', '42065', '42073', '42083', '42085', '42107', '42111', '42121', '42123'], // Armstrong, Bedford, Berks, Butler, Cambria, Cameron, Clarion, Crawford, Elk, Erie, Fayette, Forest, Greene, Indiana, Jefferson, Lawrence, McKean, Mercer, Potter, Somerset, Venango, Warren
    adjacentTerritories: ['pa-pittsburgh', 'pa-central', 'oh-northeast', 'wv-northern'],
  },
  'pa-northeast': {
    name: 'Northeast Pennsylvania',
    stateAbbr: 'PA',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['42025', '42057', '42069', '42089', '42103', '42113', '42115', '42127', '42131', '42137'], // Carbon, Fulton, Lackawanna, Monroe, Pike, Schuylkill, Susquehanna, Wayne, Wyoming, Sullivan
    adjacentTerritories: ['pa-central', 'pa-south-central', 'nj-north', 'ny-southern-tier'],
  },

  // ============================================================================
  // OHIO (OH) - Union State
  // ============================================================================
  'oh-cleveland': {
    name: 'Cleveland',
    stateAbbr: 'OH',
    owner: 'USA',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['39035', '39055', '39085', '39093', '39103', '39133', '39153'], // Cuyahoga, Geauga, Lake, Lorain, Medina, Portage, Summit
    adjacentTerritories: ['oh-northeast', 'oh-central', 'pa-western', 'mi-detroit'],
  },
  'oh-northeast': {
    name: 'Northeast Ohio',
    stateAbbr: 'OH',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['39007', '39019', '39029', '39099', '39151', '39155', '39077'], // Ashtabula, Carroll, Columbiana, Mahoning, Stark, Trumbull, Huron
    adjacentTerritories: ['oh-cleveland', 'oh-central', 'pa-pittsburgh', 'wv-northern'],
  },
  'oh-columbus': {
    name: 'Columbus',
    stateAbbr: 'OH',
    owner: 'USA',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['39049', '39041', '39045', '39089', '39097', '39117', '39127', '39129', '39159'], // Franklin, Delaware, Fairfield, Licking, Madison, Morrow, Perry, Pickaway, Union
    adjacentTerritories: ['oh-central', 'oh-southern', 'oh-southwest'],
  },
  'oh-central': {
    name: 'Central Ohio',
    stateAbbr: 'OH',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['39003', '39005', '39009', '39011', '39013', '39021', '39031', '39033', '39037', '39039', '39043', '39051', '39053', '39059', '39063', '39065', '39067', '39069', '39073', '39075', '39079', '39081', '39083', '39087', '39091', '39095', '39101', '39103', '39105', '39107', '39109', '39111', '39115', '39123', '39125', '39131', '39137', '39139', '39143', '39147', '39149', '39157', '39161', '39163', '39167', '39169', '39171', '39173', '39175'], // Allen, Ashland, Athens, Auglaize, Belmont, Champaign, Coshocton, Crawford, Darke, Defiance, Erie, Fulton, Gallia, Guernsey, Hancock, Hardin, Harrison, Henry, Hocking, Holmes, Jackson, Jefferson, Knox, Lawrence, Logan, Lucas, Marion, Meigs, Mercer, Miami, Monroe, Morgan, Muskingum, Noble, Ottawa, Paulding, Putnam, Richland, Ross, Sandusky, Scioto, Seneca, Shelby, Tuscarawas, Van Wert, Vinton, Washington, Wayne, Williams, Wood, Wyandot
    adjacentTerritories: ['oh-cleveland', 'oh-northeast', 'oh-columbus', 'oh-southern', 'oh-southwest', 'in-eastern', 'wv-northern', 'mi-southeast'],
  },
  'oh-cincinnati': {
    name: 'Cincinnati',
    stateAbbr: 'OH',
    owner: 'USA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate
    countyFips: ['39061', '39017', '39025', '39165'], // Hamilton, Butler, Clermont, Warren
    adjacentTerritories: ['oh-southwest', 'oh-southern', 'ky-northern', 'in-southeast'],
  },
  'oh-southwest': {
    name: 'Southwest Ohio',
    stateAbbr: 'OH',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['39113', '39057', '39135', '39027', '39047', '39071', '39023'], // Montgomery, Greene, Preble, Clinton, Fayette, Highland, Clark
    adjacentTerritories: ['oh-cincinnati', 'oh-central', 'oh-columbus', 'in-eastern', 'ky-northern'],
  },
  'oh-southern': {
    name: 'Southern Ohio',
    stateAbbr: 'OH',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['39001', '39015', '39119', '39121', '39141', '39145'], // Adams, Brown, Pike, Noble (duplicate removed), Ross, Scioto
    adjacentTerritories: ['oh-cincinnati', 'oh-southwest', 'oh-columbus', 'ky-northern', 'wv-southern'],
  },

  // ============================================================================
  // INDIANA (IN) - Union State
  // ============================================================================
  'in-indianapolis': {
    name: 'Indianapolis',
    stateAbbr: 'IN',
    owner: 'USA',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['18097', '18057', '18011', '18081', '18109', '18063'], // Marion, Hamilton, Boone, Johnson, Morgan, Hendricks
    adjacentTerritories: ['in-northern', 'in-eastern', 'in-southern', 'in-western'],
  },
  'in-northern': {
    name: 'Northern Indiana',
    stateAbbr: 'IN',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['18001', '18003', '18009', '18015', '18017', '18033', '18035', '18039', '18049', '18053', '18067', '18069', '18075', '18085', '18087', '18089', '18091', '18095', '18099', '18103', '18113', '18127', '18131', '18141', '18149', '18151', '18169', '18179', '18181', '18183'], // Adams, Allen, Blackford, Carroll, Cass, DeKalb, Delaware, Elkhart, Fulton, Grant, Howard, Huntington, Jay, Kosciusko, LaGrange, Lake, LaPorte, Madison, Marshall, Miami, Noble, Porter, Pulaski, St. Joseph, Steuben, Tippecanoe, Wabash, Wells, White, Whitley
    adjacentTerritories: ['in-indianapolis', 'in-eastern', 'in-western', 'oh-central', 'il-east', 'mi-southwest'],
  },
  'in-eastern': {
    name: 'Eastern Indiana',
    stateAbbr: 'IN',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['18029', '18041', '18047', '18065', '18135', '18139', '18161', '18177'], // Dearborn, Fayette, Franklin, Henry, Randolph, Rush, Union, Wayne
    adjacentTerritories: ['in-indianapolis', 'in-northern', 'in-southeast', 'oh-southwest', 'oh-cincinnati'],
  },
  'in-southeast': {
    name: 'Southeast Indiana',
    stateAbbr: 'IN',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['18005', '18013', '18019', '18025', '18031', '18037', '18043', '18061', '18071', '18077', '18079', '18093', '18137', '18143', '18155', '18175'], // Bartholomew, Brown, Clark, Crawford, Decatur, Dubois, Floyd, Harrison, Jackson, Jefferson, Jennings, Lawrence, Ripley, Scott, Switzerland, Washington
    adjacentTerritories: ['in-indianapolis', 'in-eastern', 'in-southern', 'ky-northern', 'oh-cincinnati'],
  },
  'in-southern': {
    name: 'Southern Indiana',
    stateAbbr: 'IN',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['18021', '18027', '18037', '18051', '18055', '18083', '18101', '18117', '18123', '18125', '18129', '18147', '18153', '18163', '18167', '18173'], // Clay, Daviess, Davies, Gibson, Knox, Martin, Orange, Perry, Pike, Posey, Spencer, Sullivan, Vanderburgh, Vigo, Warrick
    adjacentTerritories: ['in-indianapolis', 'in-southeast', 'in-western', 'ky-western', 'il-south'],
  },
  'in-western': {
    name: 'Western Indiana',
    stateAbbr: 'IN',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['18007', '18023', '18045', '18059', '18073', '18105', '18107', '18111', '18115', '18119', '18121', '18133', '18145', '18157', '18159', '18165', '18171'], // Benton, Clinton, Fountain, Jasper, Montgomery, Monroe, Owen, Parke, Putnam, Newton, Starke, Tippecanoe, Vermillion, Warren, White, Carroll
    adjacentTerritories: ['in-indianapolis', 'in-northern', 'in-southern', 'il-east'],
  },

  // ============================================================================
  // ILLINOIS (IL) - Union State
  // ============================================================================
  'il-chicago': {
    name: 'Chicago',
    stateAbbr: 'IL',
    owner: 'USA',
    isUrban: true,
    pointValue: 3, // Major city
    countyFips: ['17031', '17043', '17089', '17097', '17111'], // Cook, DuPage, Kane, Lake, McHenry
    adjacentTerritories: ['il-north', 'il-central', 'in-northern', 'mi-southwest'],
  },
  'il-north': {
    name: 'Northern Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['17007', '17015', '17037', '17063', '17085', '17091', '17099', '17103', '17141', '17177', '17197', '17201'], // Boone, Carroll, DeKalb, Grundy, Jo Daviess, Kankakee, LaSalle, Lee, Ogle, Stephenson, Will, Whiteside, Winnebago
    adjacentTerritories: ['il-chicago', 'il-central', 'il-west'],
  },
  'il-springfield': {
    name: 'Springfield',
    stateAbbr: 'IL',
    owner: 'USA',
    isUrban: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['17167', '17107', '17115', '17125', '17021'], // Sangamon, Logan, Macon, Mason, Christian
    adjacentTerritories: ['il-central', 'il-west', 'il-south'],
  },
  'il-central': {
    name: 'Central Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['17019', '17039', '17053', '17057', '17073', '17075', '17093', '17095', '17105', '17109', '17113', '17123', '17129', '17135', '17137', '17139', '17143', '17147', '17175', '17179', '17183', '17203'], // Champaign, De Witt, Ford, Fulton, Henry, Iroquois, Kendall, Knox, Livingston, McDonough, McLean, Marshall, Menard, Morgan, Moultrie, Peoria, Piatt, Pike, Stark, Tazewell, Vermilion, Woodford
    adjacentTerritories: ['il-chicago', 'il-north', 'il-springfield', 'il-east', 'il-west', 'il-south', 'in-western'],
  },
  'il-east': {
    name: 'East Central Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['17023', '17029', '17041', '17045', '17049', '17051', '17055', '17101', '17173'], // Clark, Coles, Douglas, Edgar, Effingham, Fayette, Cumberland, Lawrence, Shelby
    adjacentTerritories: ['il-central', 'il-south', 'in-western', 'in-southern'],
  },
  'il-west': {
    name: 'Western Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['17001', '17009', '17017', '17061', '17067', '17071', '17131', '17149', '17155', '17161', '17169', '17171', '17187'], // Adams, Brown, Cass, Greene, Hancock, Henderson, Mercer, Pike, Putnam, Rock Island, Schuyler, Scott, Warren
    adjacentTerritories: ['il-north', 'il-central', 'il-springfield', 'il-south', 'mo-northeast'],
  },
  'il-south': {
    name: 'Southern Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['17003', '17005', '17011', '17013', '17025', '17027', '17033', '17035', '17047', '17059', '17065', '17069', '17077', '17079', '17081', '17083', '17087', '17117', '17119', '17121', '17127', '17133', '17145', '17151', '17153', '17157', '17159', '17163', '17165', '17181', '17185', '17189', '17191', '17193', '17199'], // Alexander, Bond, Bureau, Calhoun, Clay, Clinton, Crawford, Cumberland, Edwards, Gallatin, Hamilton, Hardin, Jackson, Jasper, Jefferson, Jersey, Johnson, Madison, Marion, Massac, Monroe, Montgomery, Perry, Pope, Pulaski, Randolph, Richland, St. Clair, Saline, Union, Wabash, Washington, Wayne, White, Williamson
    adjacentTerritories: ['il-central', 'il-east', 'il-springfield', 'il-west', 'mo-southeast', 'ky-western', 'in-southern'],
  },

  // ============================================================================
  // MARYLAND (MD) - Union State
  // ============================================================================
  'md-baltimore': {
    name: 'Baltimore',
    stateAbbr: 'MD',
    owner: 'USA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // Major city
    countyFips: ['24510', '24005', '24003', '24025'], // Baltimore City, Baltimore County, Anne Arundel, Harford
    adjacentTerritories: ['md-north', 'md-western', 'md-eastern-shore', 'pa-south-central'],
  },
  'md-north': {
    name: 'Northern Maryland',
    stateAbbr: 'MD',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['24013', '24027'], // Carroll, Howard
    adjacentTerritories: ['md-baltimore', 'md-western', 'pa-south-central'],
  },
  'md-western': {
    name: 'Western Maryland',
    stateAbbr: 'MD',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 2, // Moderate // Antietam area
    countyFips: ['24001', '24021', '24023', '24043', '24031', '24033'], // Allegany, Frederick, Garrett, Washington, Montgomery, Prince George's
    adjacentTerritories: ['md-baltimore', 'md-north', 'va-northern', 'wv-eastern-panhandle', 'pa-south-central'],
  },
  'md-eastern-shore': {
    name: 'Eastern Shore Maryland',
    stateAbbr: 'MD',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['24011', '24015', '24019', '24029', '24035', '24037', '24039', '24041', '24045', '24047'], // Caroline, Cecil, Dorchester, Kent, Queen Anne's, St. Mary's, Somerset, Talbot, Wicomico, Worcester
    adjacentTerritories: ['md-baltimore', 'de-delaware', 'va-eastern-shore'],
  },
  'md-southern': {
    name: 'Southern Maryland',
    stateAbbr: 'MD',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['24009', '24017'], // Calvert, Charles
    adjacentTerritories: ['md-baltimore', 'md-western', 'va-northern'],
  },

  // ============================================================================
  // DELAWARE (DE) - Union State
  // ============================================================================
  'de-delaware': {
    name: 'Delaware',
    stateAbbr: 'DE',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['10001', '10003', '10005'], // Kent, New Castle, Sussex
    adjacentTerritories: ['pa-southeast', 'md-eastern-shore', 'nj-south'],
  },

  // ============================================================================
  // NEW JERSEY (NJ) - Union State
  // ============================================================================
  'nj-north': {
    name: 'North Jersey',
    stateAbbr: 'NJ',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 2, // Moderate
    countyFips: ['34003', '34013', '34017', '34019', '34023', '34025', '34027', '34031', '34035', '34037', '34039', '34041'], // Bergen, Essex, Hudson, Hunterdon, Middlesex, Monmouth, Morris, Passaic, Somerset, Sussex, Union, Warren
    adjacentTerritories: ['nj-south', 'pa-northeast', 'pa-southeast', 'ny-nyc'],
  },
  'nj-south': {
    name: 'South Jersey',
    stateAbbr: 'NJ',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['34001', '34005', '34007', '34009', '34011', '34015', '34021', '34029', '34033'], // Atlantic, Burlington, Camden, Cape May, Cumberland, Gloucester, Mercer, Ocean, Salem
    adjacentTerritories: ['nj-north', 'pa-philadelphia', 'de-delaware'],
  },

  // ============================================================================
  // NEW YORK (NY) - Union State (Southern portion for Eastern Theatre)
  // ============================================================================
  'ny-nyc': {
    name: 'New York City',
    stateAbbr: 'NY',
    owner: 'USA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // Major city
    countyFips: ['36005', '36047', '36061', '36081', '36085'], // Bronx, Kings, New York, Queens, Richmond
    adjacentTerritories: ['ny-hudson-valley', 'ny-long-island', 'nj-north'],
  },
  'ny-long-island': {
    name: 'Long Island',
    stateAbbr: 'NY',
    owner: 'USA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['36059', '36103'], // Nassau, Suffolk
    adjacentTerritories: ['ny-nyc'],
  },
  'ny-hudson-valley': {
    name: 'Hudson Valley',
    stateAbbr: 'NY',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['36027', '36071', '36079', '36087', '36111', '36119'], // Dutchess, Orange, Putnam, Rockland, Ulster, Westchester
    adjacentTerritories: ['ny-nyc', 'ny-southern-tier', 'ny-albany', 'ny-north-country', 'nj-north', 'pa-northeast'],
  },
  'ny-southern-tier': {
    name: 'Southern Tier NY',
    stateAbbr: 'NY',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['36007', '36015', '36017', '36023', '36025', '36077', '36097', '36101', '36107', '36109', '36123'], // Broome, Chemung, Chenango, Cortland, Delaware, Otsego, Schuyler, Steuben, Tioga, Tompkins, Yates
    adjacentTerritories: ['ny-hudson-valley', 'ny-central', 'ny-western', 'pa-central', 'pa-northeast'],
  },
  'ny-albany': {
    name: 'Albany',
    stateAbbr: 'NY',
    owner: 'USA',
    isUrban: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['36001', '36057', '36083', '36091', '36093', '36095'], // Albany, Montgomery, Rensselaer, Saratoga, Schenectady, Schoharie
    adjacentTerritories: ['ny-hudson-valley', 'ny-central', 'ny-adirondacks'],
  },
  'ny-central': {
    name: 'Central New York',
    stateAbbr: 'NY',
    owner: 'USA',
    pointValue: 2, // Moderate // Syracuse
    countyFips: ['36011', '36043', '36053', '36065', '36067', '36075', '36099'], // Cayuga, Herkimer, Madison, Oneida, Onondaga, Oswego, Seneca
    adjacentTerritories: ['ny-albany', 'ny-southern-tier', 'ny-western', 'ny-adirondacks', 'ny-north-country'],
  },
  'ny-western': {
    name: 'Western New York',
    stateAbbr: 'NY',
    owner: 'USA',
    pointValue: 2, // Moderate // Buffalo/Rochester
    countyFips: ['36003', '36009', '36013', '36029', '36037', '36051', '36055', '36063', '36069', '36073', '36117', '36121'], // Allegany, Cattaraugus, Chautauqua, Erie, Genesee, Livingston, Monroe, Niagara, Ontario, Orleans, Wayne, Wyoming
    adjacentTerritories: ['ny-central', 'ny-southern-tier', 'pa-western'],
  },
  'ny-adirondacks': {
    name: 'Adirondacks',
    stateAbbr: 'NY',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['36031', '36033', '36035', '36041', '36113', '36115'], // Essex, Franklin, Fulton, Hamilton, Warren, Washington
    adjacentTerritories: ['ny-albany', 'ny-central', 'ny-north-country'],
  },
  'ny-north-country': {
    name: 'North Country NY',
    stateAbbr: 'NY',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['36019', '36021', '36039', '36045', '36049', '36089', '36105'], // Clinton, Columbia, Greene, Jefferson, Lewis, St. Lawrence, Sullivan
    adjacentTerritories: ['ny-adirondacks', 'ny-central', 'ny-hudson-valley'],
  },

  // ============================================================================
  // VIRGINIA (VA) - Confederate State
  // ============================================================================
  'va-richmond': {
    name: 'Richmond',
    stateAbbr: 'VA',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 5, // Confederate Capital - KEY OBJECTIVE
    countyFips: ['51760', '51087', '51041', '51085', '51127'], // Richmond City, Henrico, Chesterfield, Hanover, New Kent
    adjacentTerritories: ['va-northern', 'va-tidewater', 'va-piedmont'],
  },
  'va-northern': {
    name: 'Northern Virginia',
    stateAbbr: 'VA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 3, // Manassas/Bull Run area - Important
    countyFips: ['51013', '51059', '51061', '51107', '51153', '51510', '51600', '51610', '51683', '51685'], // Arlington, Fairfax, Fauquier, Loudoun, Prince William, Alexandria, Fairfax City, Falls Church, Manassas, Manassas Park
    adjacentTerritories: ['va-richmond', 'va-shenandoah', 'md-western', 'md-southern', 'wv-eastern-panhandle'],
  },
  'va-tidewater': {
    name: 'Tidewater Virginia',
    stateAbbr: 'VA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 2, // Moderate // Norfolk naval base
    countyFips: ['51073', '51093', '51095', '51115', '51199', '51650', '51700', '51710', '51735', '51740', '51800', '51810', '51830'], // Gloucester, Isle of Wight, James City, Mathews, York, Hampton, Newport News, Norfolk, Poquoson, Portsmouth, Suffolk, Virginia Beach, Williamsburg
    adjacentTerritories: ['va-richmond', 'va-eastern-shore', 'va-southeast', 'nc-northeast'],
  },
  'va-eastern-shore': {
    name: 'Eastern Shore Virginia',
    stateAbbr: 'VA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['51001', '51131'], // Accomack, Northampton
    adjacentTerritories: ['va-tidewater', 'md-eastern-shore'],
  },
  'va-piedmont': {
    name: 'Central Piedmont Virginia',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2, // Moderate
    countyFips: ['51003', '51007', '51009', '51011', '51029', '51036', '51037', '51049', '51065', '51075', '51079', '51109', '51125', '51135', '51145', '51147', '51540'], // Albemarle, Amelia, Amherst, Appomattox, Buckingham, Charles City, Charlotte, Cumberland, Fluvanna, Goochland, Greene, Louisa, Nelson, Nottoway, Powhatan, Prince Edward, Charlottesville
    adjacentTerritories: ['va-richmond', 'va-northern', 'va-shenandoah', 'va-southside', 'va-southwest'],
  },
  'va-shenandoah': {
    name: 'Shenandoah Valley',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 3, // Strategic valley - Important
    countyFips: ['51005', '51015', '51017', '51043', '51047', '51069', '51091', '51113', '51137', '51139', '51157', '51163', '51165', '51171', '51187', '51660', '51790', '51820', '51840'], // Alleghany, Augusta, Bath, Clarke, Culpeper, Frederick, Highland, Madison, Orange, Page, Rappahannock, Rockbridge, Rockingham, Shenandoah, Warren, Harrisonburg, Staunton, Waynesboro, Winchester
    adjacentTerritories: ['va-northern', 'va-piedmont', 'va-southwest', 'wv-eastern-panhandle', 'wv-southern'],
  },
  'va-southside': {
    name: 'Southside Virginia',
    stateAbbr: 'VA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['51025', '51031', '51053', '51081', '51083', '51089', '51111', '51117', '51143', '51149', '51570', '51590', '51670', '51690', '51730'], // Brunswick, Campbell, Dinwiddie, Greensville, Halifax, Henry, Lunenburg, Mecklenburg, Pittsylvania, Prince George, Colonial Heights, Danville, Hopewell, Martinsville, Petersburg
    adjacentTerritories: ['va-richmond', 'va-piedmont', 'va-southeast', 'nc-piedmont'],
  },
  'va-southeast': {
    name: 'Southeast Virginia',
    stateAbbr: 'VA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['51033', '51057', '51097', '51099', '51101', '51103', '51119', '51133', '51159', '51175', '51177', '51179', '51181', '51183', '51193', '51550', '51595', '51620', '51630'], // Caroline, Essex, King and Queen, King George, King William, Lancaster, Middlesex, Northumberland, Richmond County, Southampton, Spotsylvania, Stafford, Surry, Sussex, Westmoreland, Chesapeake, Emporia, Franklin, Fredericksburg
    adjacentTerritories: ['va-richmond', 'va-tidewater', 'va-southside', 'nc-northeast'],
  },
  'va-southwest': {
    name: 'Southwest Virginia',
    stateAbbr: 'VA',
    owner: 'CSA',
    pointValue: 2, // Moderate
    countyFips: ['51019', '51021', '51023', '51027', '51035', '51045', '51051', '51063', '51067', '51071', '51077', '51105', '51121', '51141', '51155', '51161', '51167', '51169', '51173', '51185', '51191', '51195', '51197', '51515', '51520', '51530', '51580', '51640', '51678', '51680', '51720', '51750', '51770', '51775'], // Bedford, Bland, Botetourt, Buchanan, Carroll, Craig, Dickenson, Floyd, Franklin, Giles, Grayson, Lee, Montgomery, Patrick, Pulaski, Roanoke County, Russell, Scott, Smyth, Tazewell, Washington, Wise, Wythe, Bedford City, Bristol, Buena Vista, Covington, Galax, Lexington, Lynchburg, Norton, Radford, Roanoke City, Salem
    adjacentTerritories: ['va-piedmont', 'va-shenandoah', 'wv-southern', 'ky-eastern', 'tn-east', 'nc-mountains'],
  },

  // ============================================================================
  // NORTH CAROLINA (NC) - Confederate State
  // ============================================================================
  'nc-raleigh': {
    name: 'Raleigh',
    stateAbbr: 'NC',
    owner: 'CSA',
    isUrban: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['37183', '37063', '37069', '37135', '37077', '37101'], // Wake, Durham, Franklin, Orange, Granville, Johnston
    adjacentTerritories: ['nc-piedmont', 'nc-coastal', 'nc-northeast', 'va-southside'],
  },
  'nc-charlotte': {
    name: 'Charlotte',
    stateAbbr: 'NC',
    owner: 'CSA',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['37119', '37025', '37071', '37109', '37179', '37159'], // Mecklenburg, Cabarrus, Gaston, Lincoln, Union, Rowan
    adjacentTerritories: ['nc-piedmont', 'nc-mountains', 'sc-upstate'],
  },
  'nc-piedmont': {
    name: 'Piedmont North Carolina',
    stateAbbr: 'NC',
    owner: 'CSA',
    pointValue: 2, // Moderate
    countyFips: ['37001', '37033', '37035', '37057', '37059', '37067', '37081', '37097', '37105', '37123', '37125', '37145', '37151', '37153', '37157', '37163', '37167', '37169', '37171', '37181', '37193', '37197'], // Alamance, Caswell, Catawba, Davidson, Davie, Forsyth, Guilford, Iredell, Lee, Montgomery, Moore, Person, Randolph, Richmond, Rockingham, Sampson, Stanly, Stokes, Surry, Vance, Wilkes, Yadkin
    adjacentTerritories: ['nc-raleigh', 'nc-charlotte', 'nc-mountains', 'nc-coastal', 'va-southside', 'sc-upstate'],
  },
  'nc-coastal': {
    name: 'Coastal North Carolina',
    stateAbbr: 'NC',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 2, // Moderate // Wilmington port
    countyFips: ['37013', '37017', '37019', '37031', '37047', '37049', '37051', '37061', '37079', '37085', '37093', '37103', '37107', '37117', '37129', '37133', '37137', '37141', '37147', '37155', '37165', '37177', '37187', '37191', '37195'], // Beaufort, Bladen, Brunswick, Carteret, Columbus, Craven, Cumberland, Duplin, Greene, Harnett, Hoke, Jones, Lenoir, Martin, New Hanover, Onslow, Pamlico, Pender, Pitt, Robeson, Scotland, Tyrrell, Washington, Wayne, Wilson
    adjacentTerritories: ['nc-raleigh', 'nc-piedmont', 'nc-northeast', 'sc-lowcountry'],
  },
  'nc-northeast': {
    name: 'Northeast North Carolina',
    stateAbbr: 'NC',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['37015', '37029', '37041', '37053', '37055', '37065', '37073', '37083', '37091', '37095', '37127', '37131', '37139', '37143', '37185'], // Bertie, Camden, Chowan, Currituck, Dare, Edgecombe, Gates, Halifax, Hertford, Hyde, Nash, Northampton, Pasquotank, Perquimans, Warren
    adjacentTerritories: ['nc-raleigh', 'nc-coastal', 'va-southeast', 'va-tidewater'],
  },
  'nc-mountains': {
    name: 'Mountain North Carolina',
    stateAbbr: 'NC',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['37003', '37005', '37007', '37009', '37011', '37021', '37023', '37027', '37037', '37039', '37043', '37045', '37075', '37087', '37089', '37099', '37111', '37113', '37115', '37121', '37149', '37161', '37173', '37175', '37189', '37199'], // Alexander, Alleghany, Anson, Ashe, Avery, Buncombe, Burke, Caldwell, Chatham, Cherokee, Clay, Cleveland, Graham, Haywood, Henderson, Jackson, McDowell, Macon, Madison, Mitchell, Polk, Rutherford, Swain, Transylvania, Watauga, Yancey
    adjacentTerritories: ['nc-charlotte', 'nc-piedmont', 'va-southwest', 'tn-east', 'sc-upstate', 'ga-north'],
  },

  // ============================================================================
  // SOUTH CAROLINA (SC) - Confederate State
  // ============================================================================
  'sc-charleston': {
    name: 'Charleston',
    stateAbbr: 'SC',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // Major port, Fort Sumter - Important
    countyFips: ['45015', '45019', '45029', '45035'], // Berkeley, Charleston, Colleton, Dorchester
    adjacentTerritories: ['sc-lowcountry', 'sc-midlands'],
  },
  'sc-lowcountry': {
    name: 'Lowcountry South Carolina',
    stateAbbr: 'SC',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['45013', '45025', '45027', '45041', '45043', '45049', '45051', '45053', '45055', '45061', '45067', '45069', '45075', '45085', '45089'], // Beaufort, Chesterfield, Clarendon, Florence, Georgetown, Hampton, Horry, Jasper, Kershaw, Lee, Marion, Marlboro, Orangeburg, Sumter, Williamsburg
    adjacentTerritories: ['sc-charleston', 'sc-midlands', 'nc-coastal', 'ga-coastal'],
  },
  'sc-columbia': {
    name: 'Columbia',
    stateAbbr: 'SC',
    owner: 'CSA',
    isUrban: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['45079', '45063', '45017'], // Richland, Lexington, Calhoun
    adjacentTerritories: ['sc-midlands', 'sc-lowcountry', 'sc-upstate'],
  },
  'sc-midlands': {
    name: 'Midlands South Carolina',
    stateAbbr: 'SC',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['45003', '45005', '45009', '45011', '45031', '45033', '45037', '45039', '45071', '45081'], // Aiken, Allendale, Bamberg, Barnwell, Darlington, Dillon, Edgefield, Fairfield, Newberry, Saluda
    adjacentTerritories: ['sc-charleston', 'sc-lowcountry', 'sc-columbia', 'sc-upstate', 'ga-central'],
  },
  'sc-upstate': {
    name: 'Upstate South Carolina',
    stateAbbr: 'SC',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['45001', '45007', '45021', '45023', '45045', '45047', '45057', '45059', '45065', '45073', '45077', '45083', '45087', '45091'], // Abbeville, Anderson, Cherokee, Chester, Greenville, Greenwood, Lancaster, Laurens, McCormick, Oconee, Pickens, Spartanburg, Union, York
    adjacentTerritories: ['sc-columbia', 'sc-midlands', 'nc-charlotte', 'nc-mountains', 'ga-north'],
  },

  // ============================================================================
  // GEORGIA (GA) - Confederate State
  // ============================================================================
  'ga-atlanta': {
    name: 'Atlanta',
    stateAbbr: 'GA',
    owner: 'CSA',
    isUrban: true,
    pointValue: 3, // Important city
    countyFips: ['13121', '13089', '13063', '13067', '13135', '13151', '13057', '13247'], // Fulton, DeKalb, Clayton, Cobb, Gwinnett, Henry, Cherokee, Rockdale
    adjacentTerritories: ['ga-north', 'ga-central', 'ga-west'],
  },
  'ga-savannah': {
    name: 'Savannah',
    stateAbbr: 'GA',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate // Major port
    countyFips: ['13051', '13029', '13103', '13179', '13183', '13191'], // Chatham, Bryan, Effingham, Liberty, Long, McIntosh
    adjacentTerritories: ['ga-coastal', 'sc-lowcountry'],
  },
  'ga-coastal': {
    name: 'Coastal Georgia',
    stateAbbr: 'GA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['13001', '13005', '13025', '13039', '13049', '13065', '13127', '13161', '13229', '13267', '13305'], // Appling, Bacon, Brantley, Camden, Charlton, Clinch, Glynn, Jeff Davis, Pierce, Tattnall, Wayne
    adjacentTerritories: ['ga-savannah', 'ga-central', 'ga-south', 'fl-north'],
  },
  'ga-north': {
    name: 'North Georgia',
    stateAbbr: 'GA',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['13015', '13047', '13055', '13083', '13085', '13111', '13123', '13137', '13139', '13187', '13213', '13227', '13241', '13257', '13281', '13291', '13295', '13311', '13313'], // Bartow, Catoosa, Chattooga, Dade, Dawson, Fannin, Gilmer, Habersham, Hall, Lumpkin, Murray, Pickens, Rabun, Stephens, Towns, Union, Walker, White, Whitfield
    adjacentTerritories: ['ga-atlanta', 'ga-northeast', 'nc-mountains', 'tn-southeast', 'al-north'],
  },
  'ga-northeast': {
    name: 'Northeast Georgia',
    stateAbbr: 'GA',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['13011', '13013', '13059', '13105', '13117', '13119', '13147', '13149', '13157', '13159', '13195', '13217', '13219', '13221'], // Banks, Barrow, Clarke, Elbert, Forsyth, Franklin, Hart, Heard, Jackson, Jasper, Madison, Newton, Oconee, Oglethorpe
    adjacentTerritories: ['ga-atlanta', 'ga-north', 'ga-central', 'sc-upstate'],
  },
  'ga-central': {
    name: 'Central Georgia',
    stateAbbr: 'GA',
    owner: 'CSA',
    pointValue: 2, // Moderate // Macon
    countyFips: ['13003', '13009', '13021', '13023', '13035', '13043', '13079', '13093', '13107', '13109', '13141', '13153', '13163', '13165', '13167', '13169', '13171', '13175', '13181', '13205', '13207', '13211', '13225', '13235', '13237', '13239', '13243', '13249', '13251', '13253', '13263', '13265', '13269', '13271', '13273', '13283', '13287', '13289', '13293', '13303', '13307', '13309', '13315', '13317', '13319', '13321'], // Atkinson, Baldwin, Bibb, Bleckley, Butts, Candler, Crawford, Dodge, Emanuel, Evans, Hancock, Houston, Jefferson, Jenkins, Johnson, Jones, Lamar, Laurens, Lincoln, Mitchell, Monroe, Montgomery, Peach, Pulaski, Putnam, Quitman, Randolph, Schley, Screven, Seminole, Sumter, Talbot, Taylor, Telfair, Terrell, Treutlen, Turner, Twiggs, Upson, Washington, Webster, Wheeler, Wilcox, Wilkes, Wilkinson, Worth
    adjacentTerritories: ['ga-atlanta', 'ga-northeast', 'ga-coastal', 'ga-south', 'ga-west', 'ga-savannah'],
  },
  'ga-augusta': {
    name: 'Augusta',
    stateAbbr: 'GA',
    owner: 'CSA',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['13245', '13073', '13189', '13033'], // Richmond, Columbia, McDuffie, Burke
    adjacentTerritories: ['ga-central', 'ga-northeast', 'sc-midlands'],
  },
  'ga-south': {
    name: 'South Georgia',
    stateAbbr: 'GA',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['13007', '13017', '13019', '13027', '13031', '13061', '13069', '13071', '13075', '13087', '13091', '13095', '13099', '13101', '13131', '13155', '13173', '13177', '13185', '13209', '13275', '13277', '13279', '13185', '13299'], // Baker, Ben Hill, Berrien, Brooks, Calhoun, Clay, Coffee, Colquitt, Cook, Decatur, Dodge, Dougherty, Early, Echols, Grady, Irwin, Lanier, Lee, Lowndes, Miller, Thomas, Tift, Toombs, Ware
    adjacentTerritories: ['ga-central', 'ga-coastal', 'ga-west', 'fl-north', 'fl-panhandle'],
  },
  'ga-west': {
    name: 'West Georgia',
    stateAbbr: 'GA',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['13037', '13045', '13053', '13077', '13081', '13085', '13097', '13113', '13115', '13125', '13133', '13143', '13145', '13193', '13197', '13199', '13201', '13215', '13223', '13231', '13233', '13255', '13259', '13261', '13285', '13297', '13301'], // Calhoun (dup removed), Carroll, Chattahoochee, Coweta, Crisp, Douglas, Fayette, Heard, Harris, Floyd, Gordon, Haralson, Lamar (dup), Meriwether, Marion, Muscogee, Paulding, Peach (dup), Pike, Polk, Randolph, Spalding, Stewart, Taliaferro (dup), Troup, Walton, Warren
    adjacentTerritories: ['ga-atlanta', 'ga-central', 'ga-south', 'al-east'],
  },

  // ============================================================================
  // FLORIDA (FL) - Confederate State
  // ============================================================================
  'fl-jacksonville': {
    name: 'Jacksonville',
    stateAbbr: 'FL',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate
    countyFips: ['12031', '12019', '12089', '12003', '12109'], // Duval, Clay, Nassau, Baker, St. Johns
    adjacentTerritories: ['fl-north', 'ga-coastal'],
  },
  'fl-north': {
    name: 'North Florida',
    stateAbbr: 'FL',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['12001', '12007', '12023', '12029', '12041', '12047', '12059', '12067', '12075', '12083', '12107', '12121', '12125', '12127', '12133'], // Alachua, Bradford, Columbia, Dixie, Gilchrist, Hamilton, Holmes, Lafayette, Levy, Marion, Putnam, Suwannee, Taylor, Union, Washington
    adjacentTerritories: ['fl-jacksonville', 'fl-central', 'fl-panhandle', 'ga-coastal', 'ga-south'],
  },
  'fl-panhandle': {
    name: 'Florida Panhandle',
    stateAbbr: 'FL',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 2, // Moderate // Pensacola naval base
    countyFips: ['12005', '12013', '12033', '12037', '12039', '12045', '12063', '12065', '12073', '12077', '12091', '12113', '12131'], // Bay, Calhoun, Escambia, Franklin, Gadsden, Gulf, Jackson, Jefferson, Leon, Liberty, Okaloosa, Santa Rosa, Walton
    adjacentTerritories: ['fl-north', 'ga-south', 'al-south'],
  },
  'fl-central': {
    name: 'Central Florida',
    stateAbbr: 'FL',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['12009', '12011', '12015', '12017', '12021', '12027', '12035', '12043', '12049', '12051', '12053', '12055', '12057', '12061', '12069', '12071', '12079', '12081', '12085', '12086', '12087', '12093', '12095', '12097', '12099', '12101', '12103', '12105', '12111', '12115', '12117', '12119', '12123', '12129'], // Brevard, Broward, Charlotte, Citrus, Collier, DeSoto, Flagler, Glades, Hardee, Hendry, Hernando, Highlands, Hillsborough, Indian River, Lake, Lee, Madison, Manatee, Martin, Miami-Dade, Monroe, Okeechobee, Orange, Osceola, Palm Beach, Pasco, Pinellas, Polk, St. Lucie, Sarasota, Seminole, Sumter, Volusia, Wakulla
    adjacentTerritories: ['fl-north', 'fl-jacksonville'],
  },

  // ============================================================================
  // TENNESSEE (TN) - Confederate State
  // ============================================================================
  'tn-nashville': {
    name: 'Nashville',
    stateAbbr: 'TN',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // State capital - Important
    countyFips: ['47037', '47021', '47147', '47149', '47165', '47187', '47189'], // Davidson, Cheatham, Robertson, Rutherford, Sumner, Williamson, Wilson
    adjacentTerritories: ['tn-middle', 'tn-northwest', 'ky-central'],
  },
  'tn-memphis': {
    name: 'Memphis',
    stateAbbr: 'TN',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // Major river port - Important
    countyFips: ['47157', '47047', '47167'], // Shelby, Fayette, Tipton
    adjacentTerritories: ['tn-west', 'ms-north', 'ar-east'],
  },
  'tn-chattanooga': {
    name: 'Chattanooga',
    stateAbbr: 'TN',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate
    countyFips: ['47065', '47115', '47143'], // Hamilton, Marion, Rhea
    adjacentTerritories: ['tn-east', 'tn-southeast', 'ga-north', 'al-north'],
  },
  'tn-knoxville': {
    name: 'Knoxville',
    stateAbbr: 'TN',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate
    countyFips: ['47093', '47001', '47009', '47013', '47105', '47145', '47173'], // Knox, Anderson, Blount, Campbell, Loudon, Roane, Union
    adjacentTerritories: ['tn-east', 'tn-southeast', 'ky-eastern', 'va-southwest'],
  },
  'tn-east': {
    name: 'East Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['47019', '47025', '47029', '47057', '47059', '47063', '47067', '47073', '47089', '47129', '47151', '47155', '47163', '47171', '47179'], // Carter, Claiborne, Cocke, Grainger, Greene, Hamblen, Hancock, Hawkins, Jefferson, Morgan, Scott, Sevier, Sullivan, Unicoi, Washington
    adjacentTerritories: ['tn-knoxville', 'tn-southeast', 'ky-eastern', 'va-southwest', 'nc-mountains'],
  },
  'tn-southeast': {
    name: 'Southeast Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['47007', '47011', '47107', '47121', '47123', '47139', '47153'], // Bledsoe, Bradley, McMinn, Meigs, Monroe, Polk, Sequatchie
    adjacentTerritories: ['tn-chattanooga', 'tn-knoxville', 'tn-east', 'tn-middle', 'ga-north', 'nc-mountains'],
  },
  'tn-middle': {
    name: 'Middle Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['47003', '47015', '47027', '47031', '47035', '47041', '47043', '47049', '47051', '47055', '47061', '47081', '47087', '47099', '47101', '47103', '47111', '47117', '47119', '47127', '47133', '47135', '47137', '47141', '47159', '47169', '47175', '47177', '47181', '47185'], // Bedford, Cannon, Clay, Coffee, Cumberland, DeKalb, Dickson, Fentress, Franklin, Giles, Grundy, Houston, Jackson, Lawrence, Lewis, Lincoln, Macon, Marshall, Maury, Moore, Overton, Perry, Pickett, Putnam, Smith, Trousdale, Van Buren, Warren, Wayne, White
    adjacentTerritories: ['tn-nashville', 'tn-southeast', 'tn-chattanooga', 'tn-west', 'ky-central', 'al-north'],
  },
  'tn-west': {
    name: 'West Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['47005', '47017', '47023', '47033', '47039', '47045', '47053', '47069', '47071', '47077', '47079', '47083', '47085', '47091', '47095', '47097', '47109', '47113', '47131', '47161', '47183'], // Benton, Carroll, Chester, Crockett, Decatur, Dyer, Gibson, Hardeman, Hardin, Henderson, Henry, Hickman, Humphreys, Lake, Lauderdale, Lawrence (dup), McNairy, Madison, Obion, Stewart, Weakley
    adjacentTerritories: ['tn-nashville', 'tn-memphis', 'tn-middle', 'ky-western', 'ms-north', 'al-north'],
  },
  'tn-northwest': {
    name: 'Northwest Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['47075', '47125'], // Haywood, Montgomery
    adjacentTerritories: ['tn-nashville', 'tn-west', 'ky-western'],
  },

  // ============================================================================
  // ALABAMA (AL) - Confederate State
  // ============================================================================
  'al-montgomery': {
    name: 'Montgomery',
    stateAbbr: 'AL',
    owner: 'CSA',
    isUrban: true,
    pointValue: 3, // First Confederate capital - Important
    countyFips: ['01101', '01001', '01051', '01085'], // Montgomery, Autauga, Elmore, Lowndes
    adjacentTerritories: ['al-central', 'al-south', 'al-east'],
  },
  'al-mobile': {
    name: 'Mobile',
    stateAbbr: 'AL',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate // Major port
    countyFips: ['01097', '01003'], // Mobile, Baldwin
    adjacentTerritories: ['al-south', 'fl-panhandle', 'ms-south'],
  },
  'al-birmingham': {
    name: 'Birmingham Area',
    stateAbbr: 'AL',
    owner: 'CSA',
    isUrban: true,
    pointValue: 2, // Moderate // Industrial
    countyFips: ['01073', '01117', '01009', '01115'], // Jefferson, Shelby, Blount, St. Clair
    adjacentTerritories: ['al-north', 'al-central', 'al-east'],
  },
  'al-north': {
    name: 'North Alabama',
    stateAbbr: 'AL',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['01033', '01043', '01049', '01055', '01059', '01071', '01075', '01077', '01079', '01083', '01089', '01093', '01095', '01103', '01127', '01133'], // Colbert, Cullman, DeKalb, Etowah, Franklin, Jackson, Lamar, Lauderdale, Lawrence, Limestone, Madison, Marion, Marshall, Morgan, Walker, Winston
    adjacentTerritories: ['al-birmingham', 'al-central', 'tn-middle', 'tn-chattanooga', 'ga-north', 'ms-north'],
  },
  'al-central': {
    name: 'Central Alabama',
    stateAbbr: 'AL',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['01005', '01007', '01011', '01013', '01015', '01019', '01021', '01023', '01025', '01029', '01037', '01039', '01045', '01047', '01057', '01063', '01065', '01067', '01087', '01091', '01107', '01109', '01119', '01121', '01125'], // Barbour, Bibb, Bullock, Butler, Calhoun, Cherokee, Chilton, Choctaw, Clarke, Cleburne, Coosa, Covington, Dale, Dallas, Fayette, Geneva, Greene, Hale, Henry (dup), Houston, Macon, Marengo, Pickens, Pike, Randolph, Sumter, Talladega, Tallapoosa, Tuscaloosa
    adjacentTerritories: ['al-montgomery', 'al-birmingham', 'al-north', 'al-south', 'al-east', 'ms-central', 'ga-west'],
  },
  'al-south': {
    name: 'South Alabama',
    stateAbbr: 'AL',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['01031', '01035', '01041', '01053', '01061', '01069', '01099', '01105', '01113', '01129', '01131'], // Coffee, Conecuh, Crenshaw, Escambia, Geneva, Houston, Monroe, Perry, Russell, Washington, Wilcox
    adjacentTerritories: ['al-montgomery', 'al-central', 'al-mobile', 'fl-panhandle', 'ga-south'],
  },
  'al-east': {
    name: 'East Alabama',
    stateAbbr: 'AL',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['01017', '01027', '01081', '01111', '01123'], // Chambers, Clay, Lee, Randolph, Tallapoosa
    adjacentTerritories: ['al-montgomery', 'al-birmingham', 'al-central', 'ga-west'],
  },

  // ============================================================================
  // MISSISSIPPI (MS) - Confederate State
  // ============================================================================
  'ms-jackson': {
    name: 'Jackson',
    stateAbbr: 'MS',
    owner: 'CSA',
    isUrban: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['28049', '28089', '28121', '28079'], // Hinds, Madison, Rankin, Leake
    adjacentTerritories: ['ms-central', 'ms-southwest', 'ms-north'],
  },
  'ms-vicksburg': {
    name: 'Vicksburg',
    stateAbbr: 'MS',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 5, // Critical fortress - KEY OBJECTIVE
    countyFips: ['28149', '28055', '28125'], // Warren, Issaquena, Sharkey
    adjacentTerritories: ['ms-central', 'ms-southwest', 'la-northeast'],
  },
  'ms-north': {
    name: 'North Mississippi',
    stateAbbr: 'MS',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['28003', '28009', '28013', '28017', '28025', '28033', '28057', '28071', '28081', '28093', '28095', '28107', '28115', '28117', '28137', '28139', '28141', '28143', '28145', '28161'], // Alcorn, Benton, Calhoun, Chickasaw, Clay, DeSoto, Itawamba, Lafayette, Lee, Marshall, Monroe, Panola, Pontotoc, Prentiss, Tippah, Tate, Tishomingo, Tunica, Union, Yalobusha
    adjacentTerritories: ['ms-central', 'ms-jackson', 'tn-memphis', 'tn-west', 'al-north'],
  },
  'ms-central': {
    name: 'Central Mississippi',
    stateAbbr: 'MS',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['28007', '28011', '28015', '28019', '28027', '28043', '28051', '28053', '28083', '28087', '28097', '28103', '28105', '28123', '28133', '28135', '28151', '28155', '28163'], // Attala, Bolivar, Carroll, Choctaw, Coahoma, Grenada, Holmes, Humphreys, Leflore, Lowndes, Montgomery, Noxubee, Oktibbeha, Scott, Sunflower, Tallahatchie, Washington, Webster, Yazoo
    adjacentTerritories: ['ms-jackson', 'ms-vicksburg', 'ms-north', 'ms-east', 'ms-southwest', 'al-central'],
  },
  'ms-east': {
    name: 'East Mississippi',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['28021', '28023', '28061', '28069', '28075', '28099', '28101', '28119', '28153', '28159'], // Clarke, Clay (dup), Jasper, Kemper, Lauderdale, Neshoba, Newton, Quitman, Wayne, Winston
    adjacentTerritories: ['ms-central', 'ms-south', 'al-central'],
  },
  'ms-southwest': {
    name: 'Southwest Mississippi',
    stateAbbr: 'MS',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral // Natchez
    countyFips: ['28001', '28005', '28029', '28037', '28063', '28065', '28085', '28091', '28113', '28157'], // Adams, Amite, Copiah, Franklin, Jefferson, Jefferson Davis, Lincoln, Marion, Pike, Wilkinson
    adjacentTerritories: ['ms-jackson', 'ms-vicksburg', 'ms-central', 'ms-south', 'la-north'],
  },
  'ms-south': {
    name: 'South Mississippi',
    stateAbbr: 'MS',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['28031', '28035', '28039', '28041', '28045', '28047', '28059', '28067', '28073', '28077', '28109', '28111', '28127', '28129', '28131', '28147'], // Covington, Forrest, George, Greene, Hancock, Harrison, Jackson, Jones, Lamar, Lawrence, Pearl River, Perry, Simpson, Smith, Stone, Walthall
    adjacentTerritories: ['ms-central', 'ms-east', 'ms-southwest', 'al-south', 'la-southeast'],
  },

  // ============================================================================
  // LOUISIANA (LA) - Confederate State
  // ============================================================================
  'la-new-orleans': {
    name: 'New Orleans',
    stateAbbr: 'LA',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 5, // Largest Southern city - KEY OBJECTIVE
    countyFips: ['22071', '22051', '22087', '22089', '22093', '22095'], // Orleans, Jefferson, St. Bernard, St. Charles, St. James, St. John the Baptist
    adjacentTerritories: ['la-southeast', 'la-south'],
  },
  'la-baton-rouge': {
    name: 'Baton Rouge',
    stateAbbr: 'LA',
    owner: 'CSA',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['22033', '22005', '22037', '22047', '22063', '22077', '22091', '22121'], // East Baton Rouge, Ascension, East Feliciana, Iberville, Livingston, Pointe Coupee, St. Helena, West Baton Rouge
    adjacentTerritories: ['la-new-orleans', 'la-southeast', 'la-central', 'la-southwest'],
  },
  'la-north': {
    name: 'North Louisiana',
    stateAbbr: 'LA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['22015', '22013', '22017', '22021', '22027', '22031', '22035', '22041', '22049', '22061', '22067', '22069', '22073', '22081', '22083', '22107', '22111', '22119', '22123', '22127'], // Bossier, Bienville, Caddo, Caldwell, Claiborne, De Soto, East Carroll, Franklin, Jackson, Lincoln, Morehouse, Natchitoches, Ouachita, Red River, Richland, Tensas, Union, Webster, West Carroll, Winn
    adjacentTerritories: ['la-central', 'la-northeast', 'ar-south', 'ms-southwest'],
  },
  'la-northeast': {
    name: 'Northeast Louisiana',
    stateAbbr: 'LA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['22025', '22029', '22065', '22079'], // Catahoula, Concordia, Madison, Rapides (partial)
    adjacentTerritories: ['la-north', 'la-central', 'ms-vicksburg', 'ms-southwest'],
  },
  'la-central': {
    name: 'Central Louisiana',
    stateAbbr: 'LA',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['22003', '22009', '22011', '22039', '22043', '22059', '22079', '22085', '22103', '22115', '22117'], // Allen, Avoyelles, Beauregard, Evangeline, Grant, La Salle, Rapides, Sabine, St. Landry, Vernon, Washington
    adjacentTerritories: ['la-baton-rouge', 'la-north', 'la-northeast', 'la-southwest'],
  },
  'la-southwest': {
    name: 'Southwest Louisiana',
    stateAbbr: 'LA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['22001', '22019', '22023', '22045', '22053', '22055', '22057', '22097', '22099', '22101', '22113'], // Acadia, Calcasieu, Cameron, Iberia, Jefferson Davis, Lafayette, Lafourche, St. Martin, St. Mary, St. Tammany, Terrebonne
    adjacentTerritories: ['la-baton-rouge', 'la-central', 'la-south'],
  },
  'la-south': {
    name: 'South Louisiana',
    stateAbbr: 'LA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['22007', '22075', '22109'], // Assumption, Plaquemines, Tangipahoa
    adjacentTerritories: ['la-new-orleans', 'la-baton-rouge', 'la-southwest', 'ms-south'],
  },
  'la-southeast': {
    name: 'Southeast Louisiana',
    stateAbbr: 'LA',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['22105', '22125'], // Tangipahoa (dup), West Feliciana
    adjacentTerritories: ['la-new-orleans', 'la-baton-rouge', 'ms-south'],
  },

  // ============================================================================
  // ARKANSAS (AR) - Confederate State
  // ============================================================================
  'ar-little-rock': {
    name: 'Little Rock',
    stateAbbr: 'AR',
    owner: 'CSA',
    isUrban: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['05119', '05045', '05085', '05105', '05125'], // Pulaski, Faulkner, Lonoke, Perry, Saline
    adjacentTerritories: ['ar-central', 'ar-northwest', 'ar-south'],
  },
  'ar-northwest': {
    name: 'Northwest Arkansas',
    stateAbbr: 'AR',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['05007', '05009', '05015', '05021', '05023', '05029', '05033', '05047', '05049', '05071', '05087', '05089', '05101', '05127', '05131', '05137', '05143'], // Benton, Boone, Carroll, Clay, Cleburne, Conway, Crawford, Franklin, Fulton, Johnson, Madison, Marion, Newton, Scott, Searcy, Stone, Washington
    adjacentTerritories: ['ar-little-rock', 'ar-central', 'ar-east', 'mo-southwest'],
  },
  'ar-east': {
    name: 'East Arkansas',
    stateAbbr: 'AR',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['05001', '05031', '05035', '05037', '05041', '05055', '05065', '05067', '05069', '05075', '05077', '05079', '05093', '05107', '05111', '05117', '05121', '05123', '05135', '05145', '05147'], // Arkansas, Craighead, Crittenden, Cross, Desha, Greene, Independence, Jackson, Jefferson, Lawrence, Lee, Lincoln, Mississippi, Phillips, Poinsett, Prairie, Randolph, St. Francis, Sharp, White, Woodruff
    adjacentTerritories: ['ar-little-rock', 'ar-northwest', 'ar-south', 'tn-memphis', 'ms-north'],
  },
  'ar-south': {
    name: 'South Arkansas',
    stateAbbr: 'AR',
    owner: 'CSA',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['05003', '05005', '05011', '05013', '05017', '05019', '05025', '05027', '05039', '05043', '05051', '05053', '05057', '05059', '05061', '05063', '05073', '05081', '05083', '05091', '05095', '05097', '05099', '05103', '05109', '05113', '05115', '05129', '05133', '05139', '05141', '05149'], // Ashley, Baxter, Bradley, Calhoun, Chicot, Clark, Cleveland, Columbia, Dallas, Drew, Garland, Grant, Hempstead, Hot Spring, Howard, Izard, Lafayette, Little River, Logan, Miller, Monroe, Montgomery, Nevada, Ouachita, Pike, Polk, Pope, Sebastian, Sevier, Union, Van Buren, Yell
    adjacentTerritories: ['ar-little-rock', 'ar-east', 'la-north', 'ms-north'],
  },
  'ar-central': {
    name: 'Central Arkansas',
    stateAbbr: 'AR',
    owner: 'CSA',
    pointValue: 1, // Peripheral
    countyFips: ['05149', '05151', '05153'], // (remaining counties)
    adjacentTerritories: ['ar-little-rock', 'ar-northwest', 'ar-east', 'ar-south'],
  },

  // ============================================================================
  // MISSOURI (MO) - Border State (Neutral)
  // ============================================================================
  'mo-st-louis': {
    name: 'St. Louis',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // Major city - Important
    countyFips: ['29510', '29189', '29071', '29099', '29183', '29219'], // St. Louis City, St. Louis County, Franklin, Jefferson, St. Charles, Warren
    adjacentTerritories: ['mo-northeast', 'mo-central', 'mo-southeast', 'il-south'],
  },
  'mo-northeast': {
    name: 'Northeast Missouri',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['29001', '29007', '29045', '29061', '29103', '29111', '29113', '29115', '29121', '29127', '29137', '29139', '29163', '29171', '29173', '29175', '29181', '29197', '29199', '29205', '29211'], // Adair, Audrain, Clark, Daviess, Knox, Lewis, Lincoln, Linn, Macon, Marion, Monroe, Montgomery, Pike, Putnam, Ralls, Randolph, Scotland, Schuyler, Scotland (dup), Shelby, Sullivan
    adjacentTerritories: ['mo-st-louis', 'mo-central', 'il-west', 'il-central'],
  },
  'mo-kansas-city': {
    name: 'Kansas City',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['29095', '29025', '29037', '29047', '29107', '29165'], // Jackson, Caldwell, Cass, Clay, Lafayette, Platte
    adjacentTerritories: ['mo-central', 'mo-northwest', 'mo-southwest'],
  },
  'mo-central': {
    name: 'Central Missouri',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    pointValue: 1, // Peripheral // Jefferson City
    countyFips: ['29015', '29019', '29027', '29029', '29041', '29051', '29053', '29073', '29089', '29105', '29125', '29131', '29135', '29141', '29151', '29159', '29169', '29195'], // Benton, Boone, Callaway, Camden, Chariton, Cole, Cooper, Gasconade, Howard, Laclede, Maries, Miller, Moniteau, Morgan, Osage, Pettis, Pulaski, Saline
    adjacentTerritories: ['mo-st-louis', 'mo-northeast', 'mo-kansas-city', 'mo-southwest', 'mo-southeast'],
  },
  'mo-northwest': {
    name: 'Northwest Missouri',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    pointValue: 1, // Peripheral
    countyFips: ['29003', '29005', '29011', '29021', '29023', '29033', '29039', '29043', '29049', '29063', '29075', '29079', '29081', '29083', '29087', '29101', '29117', '29129', '29147', '29177', '29227'], // Andrew, Atchison, Barton, Buchanan, Carroll, Cedar (dup), Clinton, Dallas, DeKalb, Gentry, Grundy, Harrison, Henry, Hickory, Holt, Johnson, Livingston, Mercer, Nodaway, Ray, Worth
    adjacentTerritories: ['mo-kansas-city', 'mo-central', 'mo-southwest'],
  },
  'mo-southwest': {
    name: 'Southwest Missouri',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    pointValue: 1, // Peripheral // Springfield
    countyFips: ['29009', '29013', '29017', '29031', '29035', '29039', '29043', '29057', '29059', '29067', '29077', '29085', '29097', '29109', '29119', '29145', '29153', '29167', '29185', '29209', '29213', '29215', '29217', '29225', '29229'], // Barry, Barton, Bates, Camden (dup), Carter, Cedar, Christian, Dade, Dallas, Dent, Greene, Hickory (dup), Jasper, Laclede (dup), Lawrence, McDonald, Newton, Ozark, Polk, Stone, Taney, Texas, Vernon, Webster, Wright
    adjacentTerritories: ['mo-kansas-city', 'mo-central', 'mo-southeast', 'ar-northwest'],
  },
  'mo-southeast': {
    name: 'Southeast Missouri',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['29017', '29023', '29031', '29035', '29055', '29065', '29069', '29091', '29093', '29123', '29133', '29143', '29149', '29155', '29157', '29161', '29179', '29186', '29187', '29201', '29203', '29207', '29221', '29223'], // Bollinger, Butler, Cape Girardeau, Carter, Crawford, Dent (dup), Dunklin, Howell, Iron, Madison, Mississippi, New Madrid, Oregon, Pemiscot, Perry, Phelps, Reynolds, Ripley, St. Francois, Ste. Genevieve, Scott, Shannon, Stoddard, Washington, Wayne
    adjacentTerritories: ['mo-st-louis', 'mo-central', 'mo-southwest', 'ar-east', 'tn-west', 'ky-western', 'il-south'],
  },

  // ============================================================================
  // KENTUCKY (KY) - Border State (Neutral)
  // ============================================================================
  'ky-louisville': {
    name: 'Louisville',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 3, // Major city - Important
    countyFips: ['21111', '21029', '21185', '21211', '21215'], // Jefferson, Bullitt, Oldham, Shelby, Spencer
    adjacentTerritories: ['ky-northern', 'ky-central', 'in-southeast'],
  },
  'ky-lexington': {
    name: 'Lexington',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['21067', '21017', '21049', '21073', '21113', '21209', '21239'], // Fayette, Bourbon, Clark, Franklin, Jessamine, Scott, Woodford
    adjacentTerritories: ['ky-central', 'ky-northern', 'ky-eastern'],
  },
  'ky-northern': {
    name: 'Northern Kentucky',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['21015', '21023', '21037', '21041', '21077', '21081', '21097', '21117', '21161', '21191'], // Boone, Bracken, Campbell, Carroll, Gallatin, Grant, Harrison, Kenton, Mason, Pendleton
    adjacentTerritories: ['ky-louisville', 'ky-lexington', 'ky-central', 'oh-cincinnati', 'oh-southern'],
  },
  'ky-central': {
    name: 'Central Kentucky',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral // Frankfort (capital)
    countyFips: ['21003', '21005', '21011', '21021', '21053', '21057', '21069', '21079', '21085', '21087', '21093', '21103', '21123', '21137', '21141', '21151', '21163', '21167', '21169', '21173', '21179', '21181', '21187', '21201', '21207', '21217', '21223', '21229'], // Allen, Anderson, Bath, Boyle, Clinton, Cumberland, Fleming, Garrard, Grayson, Green, Hardin, Henry, Larue, Lincoln, Logan, Madison, Meade, Mercer, Metcalfe, Montgomery, Nelson, Nicholas, Owen, Robertson, Russell, Taylor, Trimble, Washington
    adjacentTerritories: ['ky-louisville', 'ky-lexington', 'ky-northern', 'ky-eastern', 'ky-western', 'tn-nashville', 'tn-middle'],
  },
  'ky-eastern': {
    name: 'Eastern Kentucky',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['21013', '21019', '21025', '21043', '21051', '21063', '21065', '21071', '21089', '21095', '21109', '21115', '21119', '21121', '21125', '21127', '21129', '21131', '21133', '21135', '21147', '21153', '21159', '21165', '21175', '21189', '21193', '21195', '21197', '21203', '21205', '21235', '21237'], // Bell, Boyd, Breathitt, Carter, Clay, Elliott, Estill, Floyd, Greenup, Harlan, Jackson, Johnson, Knott, Knox, Laurel, Lawrence, Lee, Leslie, Letcher, Lewis, McCreary, Magoffin, Martin, Menifee, Morgan, Owsley, Perry, Pike, Powell, Rockcastle, Rowan, Whitley, Wolfe
    adjacentTerritories: ['ky-lexington', 'ky-central', 'va-southwest', 'tn-knoxville', 'tn-east', 'wv-southern'],
  },
  'ky-western': {
    name: 'Western Kentucky',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral // Paducah
    countyFips: ['21001', '21007', '21009', '21027', '21031', '21033', '21035', '21039', '21045', '21047', '21055', '21059', '21061', '21075', '21083', '21091', '21099', '21101', '21105', '21107', '21139', '21143', '21145', '21149', '21155', '21157', '21171', '21177', '21183', '21199', '21213', '21219', '21221', '21225', '21227', '21231', '21233'], // Adair, Ballard, Barren, Breckinridge, Butler, Caldwell, Calloway, Carlisle, Casey, Christian, Crittenden, Daviess, Edmonson, Fulton, Graves, Hancock, Hart, Henderson, Hickman, Hopkins, Livingston, Lyon, McCracken, McLean, Marshall, Muhlenberg, Monroe, Ohio, Pulaski, Simpson, Todd, Trigg, Union, Warren, Wayne, Webster
    adjacentTerritories: ['ky-central', 'tn-nashville', 'tn-northwest', 'tn-west', 'mo-southeast', 'il-south', 'in-southern'],
  },

  // ============================================================================
  // WEST VIRGINIA (WV) - Border State (Neutral - Union sympathies)
  // ============================================================================
  'wv-wheeling': {
    name: 'Wheeling',
    stateAbbr: 'WV',
    owner: 'NEUTRAL',
    isUrban: true,
    hasWaterAccess: true,
    pointValue: 2, // Moderate // WV capital during war
    countyFips: ['54029', '54009', '54051', '54069', '54095', '54103'], // Hancock, Brooke, Marshall, Ohio, Tyler, Wetzel
    adjacentTerritories: ['wv-northern', 'pa-pittsburgh', 'oh-northeast'],
  },
  'wv-northern': {
    name: 'Northern West Virginia',
    stateAbbr: 'WV',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['54001', '54013', '54017', '54021', '54033', '54041', '54049', '54053', '54061', '54073', '54077', '54083', '54085', '54091', '54093', '54097', '54107'], // Barbour, Calhoun, Doddridge, Gilmer, Harrison, Lewis, Marion, Mason, Monongalia, Pleasants, Preston, Randolph, Ritchie, Taylor, Tucker, Upshur, Wood
    adjacentTerritories: ['wv-wheeling', 'wv-eastern-panhandle', 'wv-southern', 'pa-western', 'oh-central'],
  },
  'wv-eastern-panhandle': {
    name: 'Eastern Panhandle',
    stateAbbr: 'WV',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 2, // Moderate // Harpers Ferry
    countyFips: ['54003', '54023', '54027', '54031', '54037', '54057', '54065', '54071'], // Berkeley, Grant, Hampshire, Hardy, Jefferson, Mineral, Morgan, Pendleton
    adjacentTerritories: ['wv-northern', 'wv-southern', 'md-western', 'va-northern', 'va-shenandoah', 'pa-south-central'],
  },
  'wv-southern': {
    name: 'Southern West Virginia',
    stateAbbr: 'WV',
    owner: 'NEUTRAL',
    hasWaterAccess: true,
    pointValue: 1, // Peripheral
    countyFips: ['54005', '54007', '54011', '54015', '54019', '54025', '54035', '54039', '54043', '54045', '54047', '54055', '54059', '54063', '54067', '54075', '54079', '54081', '54087', '54089', '54099', '54101', '54105', '54109'], // Boone, Braxton, Cabell, Clay, Fayette, Greenbrier, Jackson, Kanawha, Lincoln, Logan, McDowell, Mercer, Mingo, Monroe, Nicholas, Pocahontas, Putnam, Raleigh, Roane, Summers, Wayne, Webster, Wirt, Wyoming
    adjacentTerritories: ['wv-northern', 'wv-eastern-panhandle', 'va-shenandoah', 'va-southwest', 'ky-eastern', 'oh-southern'],
  },

  // ============================================================================
  // MICHIGAN (MI) - Union State
  // ============================================================================
  'mi-detroit': {
    name: 'Detroit',
    stateAbbr: 'MI',
    owner: 'USA',
    isUrban: true,
    pointValue: 3, // Major city - Important
    countyFips: ['26163', '26099', '26125', '26087', '26147'], // Wayne, Macomb, Oakland, Lapeer, St. Clair
    adjacentTerritories: ['mi-southeast', 'mi-central', 'oh-cleveland'],
  },
  'mi-southeast': {
    name: 'Southeast Michigan',
    stateAbbr: 'MI',
    owner: 'USA',
    pointValue: 2, // Moderate // Ann Arbor
    countyFips: ['26161', '26093', '26075', '26091', '26115', '26059'], // Washtenaw, Livingston, Jackson, Lenawee, Monroe, Hillsdale
    adjacentTerritories: ['mi-detroit', 'mi-central', 'mi-southwest', 'oh-central'],
  },
  'mi-lansing': {
    name: 'Lansing',
    stateAbbr: 'MI',
    owner: 'USA',
    isUrban: true,
    pointValue: 2, // Moderate // State capital
    countyFips: ['26065', '26045', '26037', '26155'], // Ingham, Eaton, Clinton, Shiawassee
    adjacentTerritories: ['mi-detroit', 'mi-southeast', 'mi-central', 'mi-southwest'],
  },
  'mi-central': {
    name: 'Central Michigan',
    stateAbbr: 'MI',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['26011', '26043', '26049', '26107', '26145', '26017', '26111', '26057', '26073', '26117', '26067', '26015', '26035', '26051', '26129', '26069', '26001', '26007', '26119', '26063', '26151', '26157'], // Arenac, Dickinson, Genesee, Mecosta, Saginaw, Bay, Midland, Gratiot, Isabella, Montcalm, Ionia, Barry, Clare, Gladwin, Ogemaw, Iosco, Alcona, Alpena, Montmorency, Huron, Sanilac, Tuscola
    adjacentTerritories: ['mi-detroit', 'mi-lansing', 'mi-southeast', 'mi-southwest', 'mi-northwest', 'mi-northeast'],
  },
  'mi-southwest': {
    name: 'Southwest Michigan',
    stateAbbr: 'MI',
    owner: 'USA',
    pointValue: 2, // Moderate // Kalamazoo, Battle Creek
    countyFips: ['26077', '26025', '26023', '26149', '26027', '26159', '26021', '26005'], // Kalamazoo, Calhoun, Branch, St. Joseph, Cass, Van Buren, Berrien, Allegan
    adjacentTerritories: ['mi-lansing', 'mi-southeast', 'mi-central', 'mi-grand-rapids', 'in-northern'],
  },
  'mi-grand-rapids': {
    name: 'Grand Rapids',
    stateAbbr: 'MI',
    owner: 'USA',
    isUrban: true,
    pointValue: 2, // Moderate
    countyFips: ['26081', '26139', '26121', '26123', '26127', '26085', '26105', '26101'], // Kent, Ottawa, Muskegon, Newaygo, Oceana, Lake, Mason, Manistee
    adjacentTerritories: ['mi-southwest', 'mi-central', 'mi-northwest'],
  },
  'mi-northwest': {
    name: 'Northwest Lower Michigan',
    stateAbbr: 'MI',
    owner: 'USA',
    pointValue: 1, // Peripheral // Traverse City
    countyFips: ['26055', '26089', '26019', '26079', '26113', '26165', '26133', '26039', '26137', '26029', '26009', '26047', '26031'], // Grand Traverse, Leelanau, Benzie, Kalkaska, Missaukee, Wexford, Osceola, Crawford, Otsego, Charlevoix, Antrim, Emmet, Cheboygan
    adjacentTerritories: ['mi-grand-rapids', 'mi-central', 'mi-northeast'],
  },
  'mi-northeast': {
    name: 'Northeast Lower Michigan',
    stateAbbr: 'MI',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['26141', '26135', '26143'], // Presque Isle, Oscoda, Roscommon
    adjacentTerritories: ['mi-central', 'mi-northwest', 'mi-upper-peninsula'],
  },
  'mi-upper-peninsula': {
    name: 'Upper Peninsula',
    stateAbbr: 'MI',
    owner: 'USA',
    pointValue: 1, // Peripheral
    countyFips: ['26097', '26033', '26095', '26153', '26003', '26041', '26109', '26103', '26013', '26071', '26053', '26131', '26061', '26083'], // Mackinac, Chippewa, Luce, Schoolcraft, Alger, Delta, Menominee, Marquette, Baraga, Iron, Gogebic, Ontonagon, Houghton, Keweenaw
    adjacentTerritories: ['mi-northeast', 'mi-northwest'],
  },
};

/**
 * Get all region IDs
 */
export const getAllRegionIds = () => Object.keys(EASTERN_THEATRE_REGIONS);

/**
 * Get region data by ID
 */
export const getRegionById = (id) => EASTERN_THEATRE_REGIONS[id];

/**
 * Get all regions for a specific state
 */
export const getRegionsByState = (stateAbbr) => {
  return Object.entries(EASTERN_THEATRE_REGIONS)
    .filter(([_, region]) => region.stateAbbr === stateAbbr)
    .map(([id, region]) => ({ id, ...region }));
};

/**
 * Get all unique states in the Eastern Theatre map
 */
export const getEasternTheatreStates = () => {
  const states = new Set();
  Object.values(EASTERN_THEATRE_REGIONS).forEach(region => {
    states.add(region.stateAbbr);
  });
  return Array.from(states).sort();
};

/**
 * Convert regions to territory format for campaign
 */
export const createEasternTheatreTerritories = () => {
  return Object.entries(EASTERN_THEATRE_REGIONS).map(([id, region]) => ({
    id,
    name: region.name,
    owner: region.owner,
    pointValue: region.pointValue,
    victoryPoints: region.pointValue,
    adjacentTerritories: region.adjacentTerritories,
    captureHistory: [],
    countyFips: region.countyFips,
    stateAbbr: region.stateAbbr,
    // Coast, major river or Chesapeake - what the Anaconda Plan and a landing
    // read. Urban drives the Quartermaster Corps income bonus.
    hasWaterAccess: region.hasWaterAccess || false,
    isUrban: region.isUrban || false,
  }));
};

/**
 * Calculate initial VP totals
 */
export const calculateInitialVP = () => {
  let usaVP = 0;
  let csaVP = 0;
  let neutralVP = 0;

  Object.values(EASTERN_THEATRE_REGIONS).forEach(region => {
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
