/**
 * Western Theatre Campaign Map
 *
 * The 1862 campaign for the Mississippi and the Tennessee: the Union river
 * base on the Ohio and the Missouri, the contested middle of Kentucky, and the
 * Confederate heartland running from Nashville down to Vicksburg.
 *
 * Built the same way as the Maryland campaign - counties grouped into regions,
 * rendered from their FIPS codes - but adjacency here was derived from the
 * county geometry rather than written by hand, so every border is a real one.
 *
 * Capitals (two per side, the capital-victory objectives):
 *   USA - St. Louis, Louisville
 *   CSA - Nashville, Vicksburg
 *
 * Starting balance is deliberately close but not level: USA 101 VP, CSA 112,
 * with 16 VP of contested ground in Kentucky and the Missouri bootheel. The
 * Confederacy opens ahead, so the Union has to come out and take something -
 * which is what the theatre actually looked like in 1862.
 *
 * War of Rights ships no western battlefields, so no region carries a named
 * map pool; terrain weights drive map selection instead.
 */

export const WESTERN_THEATRE_REGIONS = {

  // ==========================================================================
  // MISSOURI
  // ==========================================================================

  // USA CAPITAL - arsenal, shipyards and the Department of the Missouri
  'mo-stlouis': {
    name: 'St. Louis',
    stateAbbr: 'MO',
    owner: 'USA',
    pointValue: 7,
    isUrban: true,
    isCapital: true,
    countyFips: ['29189', '29510', '29183', '29099', '29071', '29219', '29113'],
    terrainWeights: { Farmlands: 2, Wooded: 1, Urban: 3 },
    adjacentTerritories: ['il-southwest', 'mo-cape', 'mo-central', 'mo-north', 'mo-southcentral'],
  },

  'mo-central': {
    name: 'Jefferson City & Central Missouri',
    stateAbbr: 'MO',
    owner: 'USA',
    pointValue: 4,
    isUrban: false,
    countyFips: ['29051', '29027', '29019', '29053', '29135', '29151', '29073', '29131', '29125'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['mo-north', 'mo-southcentral', 'mo-stlouis'],
  },

  'mo-north': {
    name: 'Northern Missouri',
    stateAbbr: 'MO',
    owner: 'USA',
    pointValue: 5,
    isUrban: false,
    countyFips: ['29127', '29173', '29137', '29007', '29163', '29139', '29175', '29121', '29205', '29111', '29045', '29103', '29199'],
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['il-southwest', 'mo-central', 'mo-stlouis'],
  },

  // KEY - the Missouri question fought out
  'mo-southwest': {
    name: "Springfield (Wilson's Creek)",
    stateAbbr: 'MO',
    owner: 'USA',
    pointValue: 4,
    isUrban: false,
    countyFips: ['29077', '29043', '29209', '29009', '29109', '29057', '29167', '29225', '29059', '29097', '29145', '29119'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['mo-southcentral'],
  },

  'mo-southcentral': {
    name: 'The Missouri Ozarks',
    stateAbbr: 'MO',
    owner: 'USA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['29229', '29215', '29091', '29149', '29203', '29035', '29181', '29023', '29223', '29179', '29093', '29123', '29065', '29161', '29169', '29105', '29067', '29153', '29213', '29055', '29187', '29221'],
    terrainWeights: { Farmlands: 1, Wooded: 5, Urban: 0 },
    adjacentTerritories: ['mo-cape', 'mo-central', 'mo-southeast', 'mo-southwest', 'mo-stlouis'],
  },

  'mo-cape': {
    name: 'Cape Girardeau',
    stateAbbr: 'MO',
    owner: 'USA',
    pointValue: 3,
    isUrban: true,
    countyFips: ['29031', '29017', '29157', '29186'],
    terrainWeights: { Farmlands: 3, Wooded: 2, Urban: 1 },
    adjacentTerritories: ['il-cairo', 'il-southern', 'il-southwest', 'mo-southcentral', 'mo-southeast', 'mo-stlouis'],
  },

  // KEY - Island No. 10, the upper Mississippi bar
  'mo-southeast': {
    name: 'New Madrid & the Bootheel',
    stateAbbr: 'MO',
    owner: 'NEUTRAL',
    pointValue: 5,
    isUrban: false,
    countyFips: ['29143', '29155', '29069', '29133', '29201', '29207'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['il-cairo', 'ky-paducah', 'mo-cape', 'mo-southcentral', 'tn-jackson'],
  },

  // ==========================================================================
  // ILLINOIS
  // ==========================================================================

  'il-central': {
    name: 'Springfield & Central Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    pointValue: 5,
    isUrban: true,
    countyFips: ['17167', '17115', '17021', '17135', '17107', '17129', '17137', '17171', '17017', '17125', '17039', '17147'],
    terrainWeights: { Farmlands: 5, Wooded: 0, Urban: 1 },
    adjacentTerritories: ['il-southeast', 'il-southwest'],
  },

  'il-southwest': {
    name: 'Alton & the American Bottom',
    stateAbbr: 'IL',
    owner: 'USA',
    pointValue: 4,
    isUrban: false,
    countyFips: ['17119', '17163', '17133', '17157', '17005', '17027', '17189', '17145', '17083', '17061', '17013', '17117'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['il-central', 'il-southeast', 'il-southern', 'mo-cape', 'mo-north', 'mo-stlouis'],
  },

  'il-southeast': {
    name: 'Southeastern Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    pointValue: 4,
    isUrban: false,
    countyFips: ['17191', '17047', '17185', '17193', '17065', '17055', '17081', '17121', '17025', '17159', '17101', '17033', '17079', '17049', '17051', '17173', '17139', '17029', '17035', '17023', '17045'],
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['il-central', 'il-southern', 'il-southwest', 'in-evansville'],
  },

  // KEY - Grant's forward river base at the confluence
  'il-cairo': {
    name: 'Cairo (Mound City)',
    stateAbbr: 'IL',
    owner: 'USA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['17003', '17153', '17127', '17181'],
    terrainWeights: { Farmlands: 2, Wooded: 1, Urban: 3 },
    adjacentTerritories: ['il-southern', 'ky-paducah', 'mo-cape', 'mo-southeast'],
  },

  'il-southern': {
    name: 'Southern Illinois',
    stateAbbr: 'IL',
    owner: 'USA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['17077', '17199', '17087', '17151', '17069', '17165', '17059'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['il-cairo', 'il-southeast', 'il-southwest', 'in-evansville', 'ky-henderson', 'ky-hopkinsville', 'ky-paducah', 'mo-cape'],
  },

  // ==========================================================================
  // INDIANA
  // ==========================================================================

  'in-evansville': {
    name: 'Evansville & the Lower Wabash',
    stateAbbr: 'IN',
    owner: 'USA',
    pointValue: 4,
    isUrban: true,
    countyFips: ['18163', '18129', '18051', '18173', '18147', '18123', '18025', '18037', '18125', '18083', '18027', '18101', '18117'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['il-southeast', 'il-southern', 'in-indianapolis', 'in-southern', 'ky-henderson'],
  },

  'in-southern': {
    name: 'New Albany & the Falls',
    stateAbbr: 'IN',
    owner: 'USA',
    pointValue: 4,
    isUrban: true,
    countyFips: ['18043', '18019', '18061', '18143', '18175', '18077', '18155', '18115', '18029', '18137', '18079'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['in-evansville', 'in-indianapolis', 'ky-henderson', 'ky-louisville', 'ky-northern', 'oh-cincinnati'],
  },

  'in-indianapolis': {
    name: 'Indianapolis',
    stateAbbr: 'IN',
    owner: 'USA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['18097', '18063', '18081', '18145', '18059', '18109', '18011', '18057', '18095', '18005', '18031', '18013', '18105', '18119', '18133', '18021', '18055', '18093', '18071'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['in-evansville', 'in-southern'],
  },

  // ==========================================================================
  // OHIO
  // ==========================================================================

  // KEY - the Ohio's great manufacturing city
  'oh-cincinnati': {
    name: 'Cincinnati',
    stateAbbr: 'OH',
    owner: 'USA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['39061', '39017', '39165', '39025', '39015', '39027', '39071'],
    terrainWeights: { Farmlands: 2, Wooded: 1, Urban: 3 },
    adjacentTerritories: ['in-southern', 'ky-northern', 'oh-southern'],
  },

  'oh-southern': {
    name: 'Southern Ohio',
    stateAbbr: 'OH',
    owner: 'USA',
    pointValue: 5,
    isUrban: false,
    countyFips: ['39001', '39145', '39131', '39141', '39079', '39087', '39053', '39163', '39105', '39009', '39073', '39047', '39129'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['ky-eastern', 'ky-northern', 'oh-cincinnati'],
  },

  // ==========================================================================
  // KENTUCKY
  // ==========================================================================

  // USA CAPITAL - the Ohio River depot feeding the whole theatre
  'ky-louisville': {
    name: 'Louisville',
    stateAbbr: 'KY',
    owner: 'USA',
    pointValue: 7,
    isUrban: true,
    isCapital: true,
    countyFips: ['21111', '21185', '21029', '21211', '21215', '21041', '21077', '21103', '21187', '21223'],
    terrainWeights: { Farmlands: 2, Wooded: 1, Urban: 3 },
    adjacentTerritories: ['in-southern', 'ky-bluegrass', 'ky-henderson', 'ky-northern', 'ky-perryville'],
  },

  // KEY - the Tennessee and Cumberland river mouths
  'ky-paducah': {
    name: 'Paducah & the Purchase',
    stateAbbr: 'KY',
    owner: 'USA',
    pointValue: 5,
    isUrban: true,
    countyFips: ['21145', '21007', '21039', '21105', '21075', '21083', '21157', '21139', '21035'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['il-cairo', 'il-southern', 'ky-hopkinsville', 'mo-southeast', 'tn-forts', 'tn-jackson'],
  },

  'ky-northern': {
    name: 'Covington & the Northern Bank',
    stateAbbr: 'KY',
    owner: 'USA',
    pointValue: 4,
    isUrban: true,
    countyFips: ['21117', '21037', '21015', '21081', '21191', '21097', '21023', '21161', '21201'],
    terrainWeights: { Farmlands: 3, Wooded: 1, Urban: 2 },
    adjacentTerritories: ['in-southern', 'ky-bluegrass', 'ky-eastern', 'ky-louisville', 'oh-cincinnati', 'oh-southern'],
  },

  'ky-henderson': {
    name: 'Henderson & the Green River',
    stateAbbr: 'KY',
    owner: 'USA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['21101', '21225', '21233', '21059', '21091', '21149', '21027', '21085', '21093', '21163', '21183'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['il-southern', 'in-evansville', 'in-southern', 'ky-barren', 'ky-bowling-green', 'ky-hopkinsville', 'ky-louisville', 'ky-perryville'],
  },

  // KEY - the 1862 invasion was decided here
  'ky-perryville': {
    name: 'Perryville & the Salt River',
    stateAbbr: 'KY',
    owner: 'USA',
    pointValue: 4,
    isUrban: false,
    countyFips: ['21021', '21167', '21229', '21179', '21155', '21005', '21079'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['ky-barren', 'ky-bluegrass', 'ky-eastern', 'ky-henderson', 'ky-louisville', 'ky-mill-springs'],
  },

  'ky-mill-springs': {
    name: 'Mill Springs & the Upper Cumberland',
    stateAbbr: 'KY',
    owner: 'USA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['21199', '21231', '21207', '21045', '21001', '21053', '21137', '21147'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['ky-barren', 'ky-cumberland-gap', 'ky-eastern', 'ky-perryville', 'tn-cumberland-plateau'],
  },

  'ky-barren': {
    name: 'Barren River Country',
    stateAbbr: 'KY',
    owner: 'USA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['21009', '21099', '21087', '21169', '21171', '21057', '21217', '21123'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['ky-bowling-green', 'ky-henderson', 'ky-mill-springs', 'ky-perryville', 'tn-cumberland-plateau'],
  },

  // KEY - the prize both sides courted
  'ky-bluegrass': {
    name: 'Lexington & the Bluegrass',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    pointValue: 5,
    isUrban: true,
    countyFips: ['21067', '21209', '21017', '21049', '21113', '21239', '21151', '21073'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['ky-eastern', 'ky-louisville', 'ky-northern', 'ky-perryville'],
  },

  // KEY - the gate into East Tennessee
  'ky-cumberland-gap': {
    name: 'Cumberland Gap',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    pointValue: 4,
    isUrban: false,
    countyFips: ['21013', '21095', '21121', '21235', '21125', '21051', '21131'],
    terrainWeights: { Farmlands: 1, Wooded: 5, Urban: 0 },
    adjacentTerritories: ['ky-eastern', 'ky-mill-springs', 'tn-cumberland-plateau', 'tn-upper-east'],
  },

  'ky-eastern': {
    name: 'Eastern Kentucky Mountains',
    stateAbbr: 'KY',
    owner: 'NEUTRAL',
    pointValue: 2,
    isUrban: false,
    countyFips: ['21195', '21071', '21115', '21127', '21159', '21153', '21025', '21193', '21133', '21119', '21205', '21175', '21063', '21043', '21019', '21089', '21135', '21069', '21181', '21011', '21173', '21165', '21197', '21065', '21109', '21189', '21237', '21129', '21203'],
    terrainWeights: { Farmlands: 1, Wooded: 5, Urban: 0 },
    adjacentTerritories: ['ky-bluegrass', 'ky-cumberland-gap', 'ky-mill-springs', 'ky-northern', 'ky-perryville', 'oh-southern'],
  },

  // KEY - Albert Sidney Johnston's fortified centre
  'ky-bowling-green': {
    name: 'Bowling Green',
    stateAbbr: 'KY',
    owner: 'CSA',
    pointValue: 5,
    isUrban: true,
    countyFips: ['21227', '21213', '21003', '21141', '21031', '21061'],
    terrainWeights: { Farmlands: 3, Wooded: 2, Urban: 1 },
    adjacentTerritories: ['ky-barren', 'ky-henderson', 'ky-hopkinsville', 'tn-cumberland-plateau', 'tn-nashville'],
  },

  'ky-hopkinsville': {
    name: 'Hopkinsville',
    stateAbbr: 'KY',
    owner: 'CSA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['21047', '21219', '21221', '21033', '21107', '21177', '21143', '21055'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['il-southern', 'ky-bowling-green', 'ky-henderson', 'ky-paducah', 'tn-cumberland-plateau', 'tn-forts'],
  },

  // ==========================================================================
  // TENNESSEE
  // ==========================================================================

  // CSA CAPITAL - state capital, foundries, and the Cumberland
  'tn-nashville': {
    name: 'Nashville',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 7,
    isUrban: true,
    isCapital: true,
    countyFips: ['47037', '47187', '47165', '47189'],
    terrainWeights: { Farmlands: 2, Wooded: 1, Urban: 3 },
    adjacentTerritories: ['ky-bowling-green', 'tn-columbia', 'tn-cumberland-plateau', 'tn-forts', 'tn-murfreesboro'],
  },

  // KEY - the twin river forts; their loss opened Tennessee
  'tn-forts': {
    name: 'Forts Henry & Donelson',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 6,
    isUrban: false,
    countyFips: ['47161', '47083', '47125', '47043', '47085', '47005'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['ky-hopkinsville', 'ky-paducah', 'tn-columbia', 'tn-cumberland-plateau', 'tn-jackson', 'tn-nashville', 'tn-shiloh'],
  },

  // KEY - the Mississippi's great river port
  'tn-memphis': {
    name: 'Memphis',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['47157', '47167', '47047', '47075', '47069'],
    terrainWeights: { Farmlands: 2, Wooded: 1, Urban: 3 },
    adjacentTerritories: ['ms-corinth', 'ms-holly-springs', 'tn-jackson', 'tn-shiloh'],
  },

  'tn-jackson': {
    name: 'Jackson & West Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['47113', '47053', '47033', '47045', '47097', '47131', '47183', '47079', '47017', '47095'],
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['ky-paducah', 'mo-southeast', 'tn-forts', 'tn-memphis', 'tn-shiloh'],
  },

  // KEY - the landing on the Tennessee
  'tn-shiloh': {
    name: 'Shiloh & Pittsburg Landing',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 5,
    isUrban: false,
    countyFips: ['47071', '47109', '47023', '47077', '47039', '47135', '47181'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['al-huntsville', 'ms-corinth', 'tn-columbia', 'tn-forts', 'tn-jackson', 'tn-memphis'],
  },

  'tn-columbia': {
    name: 'Columbia & the Duck River',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['47119', '47117', '47101', '47081', '47055', '47099'],
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['al-huntsville', 'tn-forts', 'tn-murfreesboro', 'tn-nashville', 'tn-shiloh'],
  },

  // KEY - the Nashville & Chattanooga railroad
  'tn-murfreesboro': {
    name: 'Murfreesboro (Stones River)',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 5,
    isUrban: false,
    countyFips: ['47149', '47003', '47015', '47031', '47127', '47051', '47103'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['al-huntsville', 'tn-chattanooga', 'tn-columbia', 'tn-cumberland-plateau', 'tn-nashville'],
  },

  // KEY - the gateway to Georgia
  'tn-chattanooga': {
    name: 'Chattanooga',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['47065', '47115', '47153', '47007', '47143', '47121'],
    terrainWeights: { Farmlands: 1, Wooded: 3, Urban: 2 },
    adjacentTerritories: ['al-huntsville', 'ga-chickamauga', 'tn-cumberland-plateau', 'tn-knoxville', 'tn-murfreesboro', 'tn-polk'],
  },

  // Unionist country under Confederate occupation
  'tn-knoxville': {
    name: 'Knoxville & East Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 5,
    isUrban: true,
    countyFips: ['47093', '47009', '47105', '47145', '47001', '47173', '47057', '47089', '47155'],
    terrainWeights: { Farmlands: 2, Wooded: 3, Urban: 1 },
    adjacentTerritories: ['tn-chattanooga', 'tn-cumberland-plateau', 'tn-polk', 'tn-upper-east'],
  },

  'tn-upper-east': {
    name: 'Upper East Tennessee',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['47163', '47179', '47059', '47073', '47019', '47091', '47171', '47067', '47025', '47029', '47063'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['ky-cumberland-gap', 'tn-cumberland-plateau', 'tn-knoxville'],
  },

  'tn-cumberland-plateau': {
    name: 'The Cumberland Plateau',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['47035', '47049', '47129', '47151', '47013', '47137', '47133', '47141', '47185', '47175', '47061', '47177', '47041', '47159', '47087', '47027', '47111', '47169', '47147', '47021'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['ky-barren', 'ky-bowling-green', 'ky-cumberland-gap', 'ky-hopkinsville', 'ky-mill-springs', 'tn-chattanooga', 'tn-forts', 'tn-knoxville', 'tn-murfreesboro', 'tn-nashville', 'tn-upper-east'],
  },

  'tn-polk': {
    name: 'The Hiwassee & Copper Basin',
    stateAbbr: 'TN',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['47139', '47011', '47107', '47123'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['ga-chickamauga', 'tn-chattanooga', 'tn-knoxville'],
  },

  // ==========================================================================
  // MISSISSIPPI
  // ==========================================================================

  // KEY - where the Memphis & Charleston crosses the Mobile & Ohio
  'ms-corinth': {
    name: 'Corinth',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 6,
    isUrban: true,
    countyFips: ['28003', '28141', '28117', '28139', '28009'],
    terrainWeights: { Farmlands: 3, Wooded: 2, Urban: 1 },
    adjacentTerritories: ['al-huntsville', 'ms-east-central', 'ms-holly-springs', 'tn-memphis', 'tn-shiloh'],
  },

  // CSA CAPITAL - the fortress that holds the Mississippi
  'ms-vicksburg': {
    name: 'Vicksburg',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 7,
    isUrban: true,
    isCapital: true,
    countyFips: ['28149', '28049', '28021', '28055', '28125'],
    terrainWeights: { Farmlands: 2, Wooded: 2, Urban: 2 },
    adjacentTerritories: ['ms-delta', 'ms-jackson', 'ms-south'],
  },

  // State capital and rail junction
  'ms-jackson': {
    name: 'Jackson',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 5,
    isUrban: true,
    countyFips: ['28089', '28121', '28123', '28163', '28079'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['ms-delta', 'ms-east-central', 'ms-grenada', 'ms-south', 'ms-vicksburg'],
  },

  // Grant's overland supply depot
  'ms-holly-springs': {
    name: 'Holly Springs & the Delta Rim',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 4,
    isUrban: false,
    countyFips: ['28093', '28071', '28033', '28137', '28107', '28145', '28115'],
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['ms-corinth', 'ms-delta', 'ms-east-central', 'ms-grenada', 'tn-memphis'],
  },

  'ms-delta': {
    name: 'The Yazoo Delta',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['28027', '28143', '28119', '28011', '28133', '28151', '28053', '28083', '28135'],
    terrainWeights: { Farmlands: 5, Wooded: 1, Urban: 0 },
    adjacentTerritories: ['ms-grenada', 'ms-holly-springs', 'ms-jackson', 'ms-vicksburg'],
  },

  'ms-grenada': {
    name: 'Grenada & the Central Hills',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 2,
    isUrban: false,
    countyFips: ['28043', '28015', '28097', '28007', '28051', '28161'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['ms-delta', 'ms-east-central', 'ms-holly-springs', 'ms-jackson'],
  },

  // Rail junction and the black prairie behind it
  'ms-east-central': {
    name: 'Meridian & the Prairie',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['28075', '28069', '28099', '28101', '28159', '28103', '28023', '28061', '28129', '28087', '28095', '28025', '28105', '28017', '28057', '28081', '28013', '28155', '28019'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['al-heartland', 'al-huntsville', 'ms-corinth', 'ms-grenada', 'ms-holly-springs', 'ms-jackson', 'ms-south'],
  },

  'ms-south': {
    name: 'Natchez & Southern Mississippi',
    stateAbbr: 'MS',
    owner: 'CSA',
    pointValue: 3,
    isUrban: true,
    countyFips: ['28001', '28063', '28037', '28157', '28005', '28085', '28029', '28077', '28045', '28047', '28059', '28109', '28091', '28113', '28147', '28065', '28031', '28067', '28153', '28035', '28073', '28111', '28041', '28039', '28131', '28127'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['al-heartland', 'ms-east-central', 'ms-jackson', 'ms-vicksburg'],
  },

  // ==========================================================================
  // ALABAMA
  // ==========================================================================

  // KEY - the Memphis & Charleston trunk line
  'al-huntsville': {
    name: 'Huntsville & the Tennessee Valley',
    stateAbbr: 'AL',
    owner: 'CSA',
    pointValue: 5,
    isUrban: true,
    countyFips: ['01089', '01083', '01103', '01079', '01077', '01033', '01071', '01095', '01059'],
    terrainWeights: { Farmlands: 4, Wooded: 1, Urban: 1 },
    adjacentTerritories: ['al-gadsden', 'al-heartland', 'ga-chickamauga', 'ms-corinth', 'ms-east-central', 'tn-chattanooga', 'tn-columbia', 'tn-murfreesboro', 'tn-shiloh'],
  },

  'al-gadsden': {
    name: 'Gadsden & the Coosa',
    stateAbbr: 'AL',
    owner: 'CSA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['01055', '01015', '01019', '01049', '01009', '01115', '01043', '01073', '01117', '01121'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['al-heartland', 'al-huntsville', 'ga-chickamauga', 'ga-rome'],
  },

  // First capital, the arsenal at Selma, and the Gulf port - deep rear
  'al-heartland': {
    name: 'Montgomery, Selma & Mobile',
    stateAbbr: 'AL',
    owner: 'CSA',
    pointValue: 4,
    isUrban: true,
    countyFips: ['01101', '01001', '01051', '01085', '01087', '01011', '01047', '01105', '01091', '01131', '01065', '01063', '01119', '01023', '01097', '01003', '01129', '01025', '01125', '01007', '01107', '01057', '01075', '01127', '01133', '01093', '01045', '01031', '01061', '01069', '01067', '01005', '01109', '01041', '01013', '01035', '01039', '01053', '01099', '01081', '01017', '01111', '01027', '01037', '01123', '01021', '01113'],
    terrainWeights: { Farmlands: 4, Wooded: 2, Urban: 0 },
    adjacentTerritories: ['al-gadsden', 'al-huntsville', 'ms-east-central', 'ms-south'],
  },

  // ==========================================================================
  // GEORGIA
  // ==========================================================================

  // KEY - the approach to Atlanta
  'ga-chickamauga': {
    name: 'Chickamauga & Ringgold',
    stateAbbr: 'GA',
    owner: 'CSA',
    pointValue: 5,
    isUrban: false,
    countyFips: ['13047', '13295', '13083', '13313', '13213', '13055'],
    terrainWeights: { Farmlands: 2, Wooded: 4, Urban: 0 },
    adjacentTerritories: ['al-gadsden', 'al-huntsville', 'ga-rome', 'tn-chattanooga', 'tn-polk'],
  },

  'ga-rome': {
    name: 'Rome & the Etowah',
    stateAbbr: 'GA',
    owner: 'CSA',
    pointValue: 3,
    isUrban: false,
    countyFips: ['13115', '13129', '13015', '13233', '13143', '13223'],
    terrainWeights: { Farmlands: 3, Wooded: 3, Urban: 0 },
    adjacentTerritories: ['al-gadsden', 'ga-chickamauga'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const createWesternTheatreTerritories = () => {
  return Object.entries(WESTERN_THEATRE_REGIONS).map(([id, region]) => ({
    id,
    name: region.name,
    owner: region.owner,
    pointValue: region.pointValue,
    victoryPoints: region.pointValue,
    isCapital: region.isCapital || false,
    isUrban: region.isUrban || false,
    stateAbbr: region.stateAbbr,
    countyFips: region.countyFips,
    adjacentTerritories: region.adjacentTerritories,
    captureHistory: [],
    maps: region.maps,
    terrainWeights: region.terrainWeights,
  }));
};

export const calculateInitialVP = () => {
  let usaVP = 0;
  let csaVP = 0;
  let neutralVP = 0;

  Object.values(WESTERN_THEATRE_REGIONS).forEach(region => {
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

export const getCapitalTerritories = () => {
  return Object.entries(WESTERN_THEATRE_REGIONS)
    .filter(([, region]) => region.isCapital)
    .map(([id, region]) => ({ id, ...region }));
};
