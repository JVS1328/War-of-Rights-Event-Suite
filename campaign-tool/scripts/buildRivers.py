"""
Build the river overlay for every county-based map.

Pulls river centrelines from the USGS National Hydrography Dataset (public
domain) for the country east of the Rockies, keeps only what runs over land -
tidal water such as the lower Potomac or Mobile Bay is already open water on
the plate - and cuts each river into stretches tagged with the counties they
run through. A campaign then draws whatever runs through the country it
shows, and knows which stretches are inside its own theatre, without any map
needing rivers of its own.

Each stretch is either

  navigable  where a flotilla could come up it in 1861-65 - gunboats,
             transports, the steamboat trade. What a landing or the Anaconda
             Plan is imagined to use. Drawn bold.
  river      everything else, drawn fine, so a reader can see where the
             navigable water runs without every creek competing with it.

Which rivers count as navigable, and how far up, is written out below with
the reason, so the map and the rules can be checked against one another.

The rivers kept are those NHD ranks as stream order 6 or more and names a
"River", plus a few smaller ones with a place in the war, and every river on
the navigable list whatever its size.

    pip install shapely
    python3 scripts/buildRivers.py

writes src/data/rivers/<state FIPS>.json, one file per state, and an index of
where each file's rivers lie. A map loads only the states it shows.

It also writes src/data/rivers/waterways.json: for every county on navigable
water, how much of it lies on each of the two waterways a landing can use -

  s  the sea and tidewater: the coast, the bays and sounds, and the rivers a
     ship came straight up from the sea (the James, the Potomac, the Carolina
     rivers, Mobile's rivers and the rest)
  w  the Western rivers: the Mississippi and everything navigable that feeds
     it, the Ohio, Tennessee, Cumberland and Missouri among them

- which is what the reach rules use to decide which water a region is on
(utils/waterways.js). Open water on the county map counts as sea when it
connects to the ocean, so the tidal Potomac does and Lake Erie does not.

Downloads are cached in scripts/.rivers-cache (safe to delete). Re-run after
changing the lists below; the data files are not edited by hand.
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

import numpy as np
import shapely
from shapely.geometry import LineString, MultiLineString, shape
from shapely.ops import linemerge, unary_union
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, 'src', 'data', 'rivers')
CACHE = os.path.join(HERE, '.rivers-cache')

COUNTY_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json'
# NHD "Flowline - Small Scale" (NHDPlus, about 1:100,000).
NHD_URL = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/4/query'

# Everything east of the Rockies, in 4-degree tiles for the download.
AREA = (-107.0, 24.0, -66.0, 50.0)
TILE = 4.0

MIN_ORDER = 6
# Tolerances in degrees. A theatre plate runs 85-110 px to the degree.
SIMPLIFY = 0.004
MIN_RIVER = 0.2      # a named river shorter than ~20 km on the map is noise
MIN_PIECE = 0.004
# The county outlines are simplified, so a river along a state line wanders a
# kilometre or two off the land here and there. Widening the land that much
# closes those slivers; a tidal estuary is far wider and still drops out.
LAND_PAD = 0.02
# NHD leaves the odd connector unnamed - a channel through a lake, an oxbow
# cut - which breaks a river into pieces. Ends of the same river this close
# are joined.
BRIDGE = 0.04
# A stretch belongs to every county within this distance, so a river that
# is a boundary (the Ohio, the Potomac) belongs to both banks.
COUNTY_REACH = 0.05

# Names that are channels or cut-offs rather than rivers.
SKIP_NAMES = {'Old River', 'Dead River', 'Front River', 'Big River', 'Little River', 'South River',
              'North River', 'Middle River', 'East River', 'West River'}

# Smaller rivers with a place in the war, kept whatever NHD ranks them.
# (name, box they must lie in)
FAMOUS = [
    ('Rapidan River', (-78.6, 38.0, -77.5, 38.6)),
    ('Chickahominy River', (-77.6, 37.2, -76.8, 37.7)),
    ('North Anna River', (-78.2, 37.7, -77.2, 38.2)),
    ('Pamunkey River', (-77.5, 37.5, -76.7, 37.9)),
    ('Mattaponi River', (-77.6, 37.5, -76.7, 38.2)),
    ('Stones River', (-86.7, 35.7, -86.2, 36.3)),
    ('Monocacy River', (-77.6, 39.0, -77.1, 39.8)),
]


def box(x0, y0, x1, y1):
    return lambda x, y: x0 <= x <= x1 and y0 <= y <= y1


def both(*tests):
    return lambda x, y: all(t(x, y) for t in tests)


ANY = lambda x, y: True  # noqa: E731

# The navigable reaches: NHD name -> test on (lon, lat). A name can stand for
# more than one river - there is a James in the Dakotas, a York in Maine, a
# Hudson in Georgia, a Delaware in Kansas - so every test says where.
NAVIGABLE = {
    # The river war itself.
    'Mississippi River': ANY,
    'Ohio River': ANY,
    'Missouri River': ANY,
    # Gunboats to Florence below Muscle Shoals (Feb 1862); steamboats above
    # them to Chattanooga and Knoxville - the Cracker Line.
    'Tennessee River': ANY,
    # From the Ohio past Nashville to Burnside, the head of steamboat
    # navigation below the Cumberland Falls gorge.
    'Cumberland River': lambda x, y: x < -84.60,
    # Gunboat expeditions to Yazoo City and Fort Pemberton, 1862-63.
    'Yazoo River': ANY,
    # Trans-Mississippi: the Red River campaign to Grand Ecore and
    # Shreveport; Arkansas Post and Little Rock to Fort Smith; the White
    # River expedition to St. Charles and Jacksonport; Camden on the Ouachita.
    'Red River': box(-94.1, 30.8, -91.5, 34.2),
    'Atchafalaya River': ANY,
    'Arkansas River': box(-94.5, 33.5, -90.9, 36.0),
    'White River': box(-92.2, 33.9, -90.9, 35.8),
    'Ouachita River': box(-93.0, 31.0, -91.5, 33.7),
    # Mobile's rivers: steamers to Montgomery and Wetumpka, up the Tombigbee
    # to Columbus, Miss., and the Black Warrior to Tuscaloosa.
    'Mobile River': ANY,
    'Alabama River': ANY,
    'Tombigbee River': lambda x, y: y < 33.52,
    'Black Warrior River': lambda x, y: y < 33.21,
    # The Gulf and Atlantic rivers: the Apalachicola and Chattahoochee to
    # Columbus, Ga.; the Savannah to Augusta. (NHD leaves the lower St. Johns
    # unnamed; it is broad water on the plate in any case.)
    'Apalachicola River': ANY,
    'Chattahoochee River': lambda x, y: y < 32.47,
    'Savannah River': box(-82.1, 31.9, -80.8, 33.48),
    # North Carolina's sounds and rivers: the Cape Fear to Fayetteville, the
    # Neuse to Kinston, the Tar to Greenville, the Roanoke to Weldon, the
    # Chowan.
    'Cape Fear River': lambda x, y: y < 35.06,
    'Neuse River': lambda x, y: x > -77.60,
    'Tar River': lambda x, y: x > -77.40,
    'Roanoke River': both(lambda x, y: y < 36.45, lambda x, y: x > -77.62),
    'Chowan River': ANY,
    # Virginia and the Chesapeake, to the fall line: the James to Richmond,
    # the Appomattox to Petersburg, the Pamunkey to White House Landing, the
    # Rappahannock to Fredericksburg, the Potomac to Georgetown, the
    # Patuxent, the Susquehanna below Port Deposit.
    'James River': box(-77.44, 36.8, -76.0, 37.7),
    'Appomattox River': box(-77.41, 37.1, -77.2, 37.4),
    'Pamunkey River': box(-77.10, 37.4, -76.7, 37.9),
    'York River': box(-77.0, 37.0, -76.2, 37.7),
    'Rappahannock River': box(-77.47, 37.4, -76.2, 38.4),
    'Potomac River': box(-77.10, 37.9, -76.2, 39.0),
    'Patuxent River': box(-77.0, 38.2, -76.3, 38.80),
    'Susquehanna River': box(-76.3, 39.4, -75.9, 39.61),
    # The Delaware to Trenton, the Schuylkill to Philadelphia's Fairmount
    # dam, the Hudson to Troy, the Connecticut to Hartford.
    'Delaware River': box(-75.9, 38.7, -74.6, 40.22),
    'Schuylkill River': box(-75.4, 39.8, -75.1, 39.97),
    'Hudson River': box(-74.3, 40.4, -73.6, 42.75),
    'Connecticut River': box(-72.8, 41.2, -72.3, 41.77),
    # West Virginia: Union steamers up the Kanawha to the falls; slackwater
    # on the Monongahela from Pittsburgh to the state line by 1856.
    'Kanawha River': ANY,
    'Monongahela River': lambda x, y: y > 39.72,
    # The Illinois and its canal: Union water, steamboats to LaSalle.
    'Illinois River': lambda x, y: x > -91.0 and y > 38.8,
}

# The navigable rivers that belong to the Western rivers - the Mississippi's
# system. Every other navigable river runs to the sea, and is tidewater.
WESTERN_RIVERS = {
    'Mississippi River', 'Ohio River', 'Missouri River', 'Tennessee River', 'Cumberland River',
    'Yazoo River', 'Red River', 'Atchafalaya River', 'Arkansas River', 'White River',
    'Ouachita River', 'Kanawha River', 'Monongahela River', 'Illinois River',
}

# Natural Earth (public domain): the ocean, to tell the sea from other open
# water; the Great Lakes, which are not the sea; Canada and Mexico, which have
# no counties but are land all the same.
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
GREAT_LAKES = {'Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario', 'Lake Saint Clair'}
# How close a stretch of coast or river must run to count toward a county.
WATER_REACH = 0.03

# Rivers that also carry a name on the plate, beyond the navigable ones and
# those of stream order 7 or more.
LABELLED = {'Shenandoah River', 'Rapidan River', 'Chickahominy River', 'Monocacy River',
            'Big Black River', 'Duck River', 'Stones River', 'Hatchie River', 'Green River',
            'Kentucky River', 'Wabash River', 'New River', 'North Anna River'}


def fetch_json(url, params=None, cache_key=None):
    path = os.path.join(CACHE, cache_key + '.json') if cache_key else None
    if path and os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    if params:
        url = f'{url}?{urllib.parse.urlencode(params)}'
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=240) as res:
                data = json.load(res)
            break
        except Exception as err:  # noqa: BLE001 - retry any network trouble
            if attempt == 3:
                raise
            print(f'    retrying ({err})', file=sys.stderr)
    if path:
        os.makedirs(CACHE, exist_ok=True)
        with open(path, 'w') as fh:
            json.dump(data, fh)
    return data


def nhd(where, bbox, key):
    """Every flowline matching `where` inside the box, paged."""
    feats, offset = [], 0
    while True:
        page = fetch_json(NHD_URL, {
            'where': where,
            'geometry': ','.join(map(str, bbox)),
            'geometryType': 'esriGeometryEnvelope',
            'inSR': 4326, 'outSR': 4326,
            'outFields': 'OBJECTID,GNIS_NAME,StreamOrde',
            'returnGeometry': 'true',
            'maxAllowableOffset': 0.001,
            'orderByFields': 'OBJECTID',
            'resultOffset': offset, 'resultRecordCount': 2000,
            'f': 'geojson',
        }, cache_key=f'{key}-{offset}')
        got = page.get('features', [])
        feats += got
        if len(got) < 2000:
            return feats
        offset += 2000


def download():
    """{name: [LineString]} for every river we keep."""
    by_id = {}
    x0, y0, x1, y1 = AREA
    tiles = [(x, y) for x in np.arange(x0, x1, TILE) for y in np.arange(y0, y1, TILE)]
    names = "', '".join(sorted(NAVIGABLE))
    where = (f"GNIS_NAME LIKE '% River' AND (StreamOrde >= {MIN_ORDER} "
             f"OR GNIS_NAME IN ('{names}'))")
    for i, (x, y) in enumerate(tiles):
        print(f'  tile {i + 1}/{len(tiles)}', end='\r', flush=True)
        for f in nhd(where, (x, y, x + TILE, y + TILE), f'tile-{x:.0f}-{y:.0f}'):
            by_id[f['id'] if 'id' in f else f['properties']['OBJECTID']] = f
    print()
    for name, bbox in FAMOUS:
        for f in nhd(f"GNIS_NAME = '{name}'", bbox, 'famous-' + name.replace(' ', '_')):
            by_id[f['id'] if 'id' in f else f['properties']['OBJECTID']] = f

    rivers = defaultdict(list)
    order = defaultdict(int)
    for f in by_id.values():
        g, p = f.get('geometry'), f['properties']
        name = (p.get('GNIS_NAME') or '').strip()
        if not g or not name or name in SKIP_NAMES:
            continue
        parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
        rivers[name] += [LineString(c) for c in parts if len(c) > 1]
        order[name] = max(order[name], p.get('StreamOrde') or 0)
    return rivers, order


def bridge(parts):
    """Join the pieces of one river wherever their ends nearly meet."""
    ends = [(i, pt) for i, p in enumerate(parts) for pt in (p.coords[0], p.coords[-1])]
    if len(ends) > 4000:
        return parts
    pts = np.array([pt for _, pt in ends])
    links = []
    for a, (i, p) in enumerate(ends):
        d = np.hypot(pts[:, 0] - p[0], pts[:, 1] - p[1])
        d[[b for b, (j, _) in enumerate(ends) if j == i]] = np.inf
        b = int(np.argmin(d))
        if 0 < d[b] < BRIDGE:
            links.append(LineString([p, ends[b][1]]))
    if not links:
        return parts
    merged = linemerge(MultiLineString(parts + links))
    return list(merged.geoms) if hasattr(merged, 'geoms') else [merged]


def as_polys(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == 'Polygon':
        return [geom]
    return [g for sub in getattr(geom, 'geoms', []) for g in as_polys(sub)]


def as_lines(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == 'LineString':
        return [geom]
    if hasattr(geom, 'geoms'):
        return [g for sub in geom.geoms for g in as_lines(sub)]
    return []


def main():
    print('counties…')
    feats = fetch_json(COUNTY_URL, cache_key='counties')['features']
    fips = [f['id'] for f in feats]
    geoms = [shape(f['geometry']).buffer(0) for f in feats]
    tree = STRtree(geoms)
    print('land…')
    land_exact = unary_union(geoms)
    land = land_exact.buffer(LAND_PAD)

    print('rivers…')
    rivers, order = download()
    print(f'  {len(rivers)} named rivers')

    chunks = defaultdict(lambda: defaultdict(list))   # state -> name -> pieces
    navigable_lines = {'s': [], 'w': []}
    labelled = set()
    for name in sorted(rivers):
        merged = linemerge(MultiLineString(rivers[name]))
        parts = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
        parts = bridge(parts)
        navigable = NAVIGABLE.get(name)
        # Keep the river itself, not every same-named creek in the country:
        # long enough to matter, or on the navigable list where it is
        # navigable, or one of the famous few.
        keep = [p for p in parts
                if p.length >= MIN_RIVER or name in dict(FAMOUS)
                or (navigable and any(navigable(*c) for c in p.coords))]
        if not keep:
            continue
        on_land = unary_union(keep).intersection(land)
        short = name[:-len(' River')] if name.endswith(' River') else name
        any_navigable = False
        for line in as_lines(linemerge(on_land) if on_land.geom_type == 'MultiLineString' else on_land):
            line = line.simplify(SIMPLIFY, preserve_topology=False)
            coords = np.asarray(line.coords)
            if len(coords) < 2:
                continue
            mids = shapely.points((coords[:-1] + coords[1:]) / 2)
            idx_pt, idx_county = tree.query(mids, predicate='dwithin', distance=COUNTY_REACH)
            sets = [set() for _ in range(len(mids))]
            for a, b in zip(idx_pt, idx_county):
                sets[a].add(int(fips[b]))
            nav = [bool(navigable and navigable(*m)) for m in (coords[:-1] + coords[1:]) / 2]

            # Consecutive segments with the same counties and the same
            # navigability make one stretch; each shares its end point with
            # the next so the river draws unbroken.
            start = 0
            for k in range(1, len(mids) + 1):
                if k < len(mids) and sets[k] == sets[start] and nav[k] == nav[start]:
                    continue
                pts = coords[start:k + 1]
                if LineString(pts).length >= MIN_PIECE and sets[start]:
                    counties = sorted(sets[start])
                    state = f'{counties[0] // 1000:02d}'
                    piece = [counties, 1 if nav[start] else 0,
                             [[round(float(x), 3), round(float(y), 3)] for x, y in pts]]
                    chunks[state][short].append(piece)
                    any_navigable = any_navigable or nav[start]
                    if nav[start]:
                        navigable_lines['w' if name in WESTERN_RIVERS else 's'].append(LineString(pts))
                start = k
        if any_navigable or order[name] >= 7 or name in LABELLED:
            labelled.add(short)

    os.makedirs(OUT_DIR, exist_ok=True)
    for old in os.listdir(OUT_DIR):
        if old.endswith('.json'):
            os.remove(os.path.join(OUT_DIR, old))
    index, total = {}, 0
    for state, named in sorted(chunks.items()):
        out = [{'n': n, **({'l': 1} if n in labelled else {}), 's': pieces}
               for n, pieces in sorted(named.items())]
        xs = [p[0] for r in out for s in r['s'] for p in s[2]]
        ys = [p[1] for r in out for s in r['s'] for p in s[2]]
        index[state] = [min(xs), min(ys), max(xs), max(ys)]
        path = os.path.join(OUT_DIR, f'{state}.json')
        with open(path, 'w') as fh:
            json.dump(out, fh, separators=(',', ':'))
        total += os.path.getsize(path)
    with open(os.path.join(OUT_DIR, 'index.json'), 'w') as fh:
        json.dump(index, fh, separators=(',', ':'))

    print('waterways…')
    ocean = unary_union([shape(f['geometry']) for f in fetch_json(NE + 'ne_10m_ocean.geojson', cache_key='ne_10m_ocean')['features']])
    lakes = unary_union([shape(f['geometry']).buffer(0) for f in fetch_json(NE + 'ne_10m_lakes.geojson', cache_key='ne_10m_lakes')['features']
                         if f['properties'].get('name') in GREAT_LAKES])
    abroad = unary_union([shape(f['geometry']).buffer(0) for f in fetch_json(NE + 'ne_110m_admin_0_countries.geojson', cache_key='ne_110m_admin_0_countries')['features']
                          if f['properties'].get('ADM0_A3') in ('CAN', 'MEX')])
    x0, y0, x1, y1 = AREA
    frame = shapely.box(x0, y0, x1, y1)
    gaps = frame.difference(land_exact).difference(lakes.buffer(0.05)).difference(abroad)
    sea = unary_union([g for g in as_polys(gaps) if g.intersects(ocean)]).buffer(0.01)

    water = {}
    for kind, lines in (('w', navigable_lines['w']), ('s', navigable_lines['s'])):
        river = unary_union(lines)
        for i in tree.query(river, predicate='dwithin', distance=WATER_REACH):
            n = river.intersection(geoms[i].buffer(WATER_REACH)).length
            if n >= 0.01:
                water.setdefault(fips[i], {})[kind] = round(n, 3)
    for i in tree.query(sea, predicate='intersects'):
        n = geoms[i].boundary.intersection(sea).length
        if n >= 0.01:
            entry = water.setdefault(fips[i], {})
            entry['s'] = round(entry.get('s', 0) + n, 3)
    with open(os.path.join(OUT_DIR, 'waterways.json'), 'w') as fh:
        json.dump(dict(sorted(water.items())), fh, separators=(',', ':'))
    print(f'  {len(water)} counties on navigable water')
    print(f'wrote {len(chunks)} state files to {os.path.relpath(OUT_DIR, ROOT)} ({total // 1024} KB)')


if __name__ == '__main__':
    main()
