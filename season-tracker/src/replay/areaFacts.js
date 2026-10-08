// What the game's own area definitions say about each Skirmish area, for rounds
// whose scoreboard and replay don't (recorders before 2026-10-05): the defender,
// the Final Push timer and each side's starting tickets. From the level files'
// Skirmish.json SkirmishDescriptor (DefendingTeam, FinalPushTime, TicketsUSA,
// TicketsCSA), 2026-10-08 -- refresh them when the game changes an area.
// Conquest and Contention always start both sides on 100 tickets.

// areaKey (roundAnalysis) -> [defending team, Final Push s, USA tickets, CSA tickets]
const SKIRMISH = {
  // Antietam
  "antietam|skirmish|east woods skirmish": [2, 194, 143, 115],
  "antietam|skirmish|hooker's push": [2, 370, 122, 122],
  "antietam|skirmish|hagerstown turnpike": [2, 110, 130, 110],
  "antietam|skirmish|miller's cornfield": [1, 122, 134, 122],
  "antietam|skirmish|east woods": [1, 198, 130, 124],
  "antietam|skirmish|nicodemus hill": [2, 146, 174, 89],
  "antietam|skirmish|bloody lane": [2, 186, 146, 100],
  "antietam|skirmish|pry ford": [2, 178, 124, 84],
  "antietam|skirmish|pry grist mill": [2, 164, 150, 106],
  "antietam|skirmish|pry house": [1, 124, 115, 125],
  "antietam|skirmish|west woods": [2, 132, 137, 101],
  "antietam|skirmish|dunker church": [2, 224, 137, 103],
  "antietam|skirmish|burnside bridge": [2, 264, 137, 93],
  "antietam|skirmish|cooke's countercharge": [1, 168, 143, 122],
  "antietam|skirmish|otto & sherrick farm": [2, 136, 159, 92],
  "antietam|skirmish|roulette lane": [1, 146, 127, 135],
  "antietam|skirmish|piper farm": [2, 132, 124, 100],
  "antietam|skirmish|hill's counterattack": [1, 158, 135, 121],
  // Harpers Ferry
  "harpers-ferry|skirmish|maryland heights": [1, 154, 155, 149],
  "harpers-ferry|skirmish|river crossing": [1, 262, 111, 159],
  "harpers-ferry|skirmish|downtown": [1, 132, 135, 124],
  "harpers-ferry|skirmish|school house ridge": [1, 90, 157, 150],
  "harpers-ferry|skirmish|high street": [1, 112, 147, 114],
  "harpers-ferry|skirmish|bolivar heights camp": [1, 188, 145, 120],
  "harpers-ferry|skirmish|shenandoah street": [1, 74, 145, 122],
  "harpers-ferry|skirmish|harpers graveyard": [1, 104, 124, 88],
  "harpers-ferry|skirmish|bolivar heights redoubt": [1, 204, 142, 134],
  "harpers-ferry|skirmish|washington street": [1, 116, 140, 123],
  // South Mountain
  "south-mountain|skirmish|garland's stand": [2, 246, 152, 120],
  "south-mountain|skirmish|cox's push": [2, 190, 163, 102],
  "south-mountain|skirmish|hatch's attack": [2, 208, 134, 115],
  "south-mountain|skirmish|anderson's counterattack": [1, 200, 151, 110],
  "south-mountain|skirmish|reno's fall": [1, 221, 138, 102],
  "south-mountain|skirmish|colquitt's defence": [2, 242, 168, 117],
  // Drill Camp
  "drill-camp|skirmish|alexander farm": [2, 244, 159, 117],
  "drill-camp|skirmish|crossroads": [2, 214, 145, 106],
  "drill-camp|skirmish|smith field": [2, 244, 137, 106],
  "drill-camp|skirmish|crecy's cornfield": [1, 244, 120, 100],
  "drill-camp|skirmish|larsen homestead": [1, 244, 125, 104],
  "drill-camp|skirmish|south woodlot": [1, 214, 153, 127],
  "drill-camp|skirmish|flemming's meadow": [2, 244, 154, 102],
  "drill-camp|skirmish|wagon road": [2, 244, 171, 120],
  "drill-camp|skirmish|crossley creek": [2, 244, 162, 103],
  "drill-camp|skirmish|union camp": [1, 214, 156, 125],
  "drill-camp|skirmish|pat's turnpike": [1, 224, 157, 129],
  "drill-camp|skirmish|stefan's lot": [1, 234, 131, 137],
  "drill-camp|skirmish|confederate encampment": [2, 244, 156, 107],
};

/**
 * The game's setup for an area (roundAnalysis areaKey): { defending: 1 | 2,
 * finalPushS, tickets: { 1, 2 } } for a Skirmish area, { tickets } for Conquest
 * and Contention, or null for an area it doesn't know.
 */
export function areaFacts(key) {
  const s = SKIRMISH[key];
  if (s) return { defending: s[0], finalPushS: s[1], tickets: { 1: s[2], 2: s[3] } };
  const mode = String(key).split('|')[1];
  return mode === 'conquest' || mode === 'contention' ? { tickets: { 1: 100, 2: 100 } } : null;
}
