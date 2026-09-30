// The replay module's only ties to the app it is embedded in. Everything else
// in src/replay/ imports nothing outside this folder, so another app (the PUBS
// dashboard, Kepi) can take the folder as is and supply its own host.js.
export { UNTAGGED, tagRegimentResolver } from '../stats/regimentMatcher';
export { FORMATION_LABEL } from '../stats/labels';

// Where the map art and icons are served from, relative to the page.
export const ASSET_BASE = 'assets/';
