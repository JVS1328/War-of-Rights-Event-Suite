"""
Build the river overlay for the county-based theatre maps.

Pulls river centrelines from the USGS National Hydrography Dataset (public
domain), keeps only the stretches that run over land - tidal water such as
the lower Potomac, the James below City Point and the Chesapeake is already
open water on the plate - and marks each stretch:

  navigable  the reach a flotilla could actually use in 1861-65: gunboats,
             transports, the steamboat trade. What a landing or the Anaconda
             Plan is imagined to come up. Drawn bold.
  backdrop   outside the theatre's counties, so it is drawn in the faded
             country around the board rather than over it.

Everything else is context - drawn thin, so a reader can see where a
navigable river runs without every creek on the map competing with it.

Which rivers count as navigable, and how far up, is written out below with
the reason, so the map and the rules can be checked against one another.

    pip install shapely
    python3 scripts/buildTheatreRivers.py

writes src/data/theatreRivers.js. Re-run it after changing the lists below or
a theatre's counties; the data file is not edited by hand.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request

from shapely.geometry import LineString, MultiLineString, shape
from shapely.ops import linemerge, unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'src', 'data', 'theatreRivers.js')

COUNTY_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json'
# NHD "Flowline - Small Scale" (NHDPlus, about 1:100,000).
NHD_URL = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/4/query'

# Tolerances in degrees. A theatre plate runs 85-110 px to the degree, so
# 0.004 is well under half a pixel.
SIMPLIFY = 0.004
MIN_LENGTH = 0.008
THEATRE_PAD = 0.08   # a river on a theatre's edge (the Ohio, the Mississippi) still counts as in it
# The county outlines are simplified, so a river along a state line wanders a
# kilometre or two off the land here and there. Widening the land that much
# closes those slivers; a tidal estuary is far wider and still drops out.
LAND_PAD = 0.02
# NHD leaves the odd connector unnamed - a channel through a lake, an oxbow
# cut - which breaks a river into pieces. Ends of the same river this close
# are joined.
BRIDGE = 0.04


def east_of(lon):
    return lambda x, y: x > lon


def west_of(lon):
    return lambda x, y: x < lon


def south_of(lat):
    return lambda x, y: y < lat


def north_of(lat):
    return lambda x, y: y > lat


ALL = lambda x, y: True  # noqa: E731

# name     - the NHD (GNIS) name
# label    - printed along the river; None for no label
# navigable - which of it a flotilla could use, as a test on (lon, lat), or
#             None for none of it
THEATRES = {
    'western-theatre': {
        'source': 'src/data/westernTheatre.js',
        'rivers': [
            # The river war itself.
            ('Mississippi River', 'Mississippi R.', ALL),
            ('Ohio River', 'Ohio R.', ALL),
            ('Missouri River', 'Missouri R.', ALL),
            # Gunboats to Florence below Muscle Shoals (Feb 1862); steamboats
            # above them to Chattanooga and Knoxville - the Cracker Line.
            ('Tennessee River', 'Tennessee R.', ALL),
            # Navigable from the Ohio past Nashville to Burnside, the head of
            # steamboat navigation below the Cumberland Falls gorge; Union
            # supply boats ran to Mill Springs.
            ('Cumberland River', 'Cumberland R.', west_of(-84.60)),
            # Gunboat expeditions to Yazoo City and Fort Pemberton, 1862-63.
            ('Yazoo River', 'Yazoo R.', ALL),
            # Mobile's rivers: steamers to Montgomery, and up the Tombigbee to
            # Columbus, Miss.
            ('Mobile River', None, ALL),
            ('Alabama River', 'Alabama R.', ALL),
            ('Tombigbee River', 'Tombigbee R.', south_of(33.52)),
            # Context only: lock-and-dam or low-water rivers no fleet went up.
            ('Green River', 'Green R.', None),
            ('Kentucky River', 'Kentucky R.', None),
            ('Wabash River', 'Wabash R.', None),
            ('Illinois River', None, None),
            ('Duck River', 'Duck R.', None),
            ('Hatchie River', None, None),
            ('Big Black River', 'Big Black R.', None),
            ('Pearl River', None, None),
            ('Tallahatchie River', None, None),
            ('Coosa River', None, None),
            ('Black Warrior River', None, None),
        ],
    },
    'eastern-theatre': {
        'source': 'src/data/marylandCampaign1862.js',
        'rivers': [
            # Tidal to Georgetown; above Little Falls only the C&O Canal.
            ('Potomac River', 'Potomac R.', east_of(-77.10)),
            # Tidal to the falls at Richmond - Drewry's Bluff, City Point,
            # Bermuda Hundred.
            ('James River', 'James R.', east_of(-77.44)),
            # To Petersburg from City Point.
            ('Appomattox River', 'Appomattox R.', east_of(-77.41)),
            # McClellan's base at White House Landing, 1862.
            ('Pamunkey River', 'Pamunkey R.', east_of(-77.10)),
            ('York River', 'York R.', ALL),
            # Tidal to Fredericksburg.
            ('Rappahannock River', 'Rappahannock R.', east_of(-77.47)),
            ('Ohio River', 'Ohio R.', ALL),
            # Union steamers from Point Pleasant up to Charleston and the falls.
            ('Kanawha River', 'Kanawha R.', ALL),
            # Slackwater from Pittsburgh to the state line by 1856.
            ('Monongahela River', 'Monongahela R.', north_of(39.72)),
            # Tidal to the falls at Trenton.
            ('Delaware River', 'Delaware R.', south_of(40.22)),
            # Tidal only below the falls at Port Deposit.
            ('Susquehanna River', 'Susquehanna R.', south_of(39.61)),
            # Context only.
            ('Shenandoah River', 'Shenandoah R.', None),
            ('North Fork Shenandoah River', None, None),
            ('South Fork Shenandoah River', None, None),
            ('North Branch Potomac River', None, None),
            ('South Branch Potomac River', None, None),
            ('Rapidan River', 'Rapidan R.', None),
            ('Chickahominy River', 'Chickahominy R.', None),
            ('North Anna River', None, None),
            ('Monocacy River', 'Monocacy R.', None),
            ('Juniata River', None, None),
            ('West Branch Susquehanna River', None, None),
            ('Allegheny River', 'Allegheny R.', None),
            ('New River', 'New R.', None),
            ('Greenbrier River', None, None),
            ('Roanoke River', None, None),
            ('Staunton River', None, None),
            ('Schuylkill River', None, None),
        ],
    },
}


def fetch_json(url, params=None):
    if params:
        url = f'{url}?{urllib.parse.urlencode(params)}'
    with urllib.request.urlopen(url, timeout=180) as res:
        return json.load(res)


def theatre_fips(source):
    text = open(os.path.join(ROOT, source), encoding='utf-8').read()
    arrays = re.findall(r'countyFips:\s*\[([^\]]*)\]', text)
    return set(re.findall(r"""['"](\d{5})['"]""", ' '.join(arrays)))


def fetch_river(name, bbox):
    """Every NHD flowline carrying this name inside the box, merged into lines."""
    lines, offset = [], 0
    while True:
        page = fetch_json(NHD_URL, {
            'where': f"GNIS_NAME = '{name}'",
            'geometry': ','.join(map(str, bbox)),
            'geometryType': 'esriGeometryEnvelope',
            'inSR': 4326, 'outSR': 4326,
            'outFields': 'GNIS_NAME',
            'returnGeometry': 'true',
            'maxAllowableOffset': 0.001,
            'resultOffset': offset, 'resultRecordCount': 1000,
            'f': 'geojson',
        })
        feats = page.get('features', [])
        for f in feats:
            g = f.get('geometry')
            if not g:
                continue
            parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
            lines += [LineString(p) for p in parts if len(p) > 1]
        if len(feats) < 1000:
            break
        offset += 1000
    if not lines:
        return None
    merged = linemerge(MultiLineString(lines))
    parts = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    parts = bridge(parts)
    # A name can turn up on an unrelated creek inside the box; keep the river.
    longest = max(p.length for p in parts)
    return [p for p in parts if p.length >= max(0.05, 0.1 * longest)]


def bridge(parts):
    """Join the pieces of one river wherever their ends nearly meet."""
    ends = [(i, pt) for i, p in enumerate(parts) for pt in (p.coords[0], p.coords[-1])]
    links = []
    for a, (i, p) in enumerate(ends):
        best = None
        for j, q in ends:
            if j == i:
                continue
            d = ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) ** 0.5
            if d < BRIDGE and (best is None or d < best[0]):
                best = (d, q)
        if best and best[0] > 0:
            links.append(LineString([p, best[1]]))
    if not links:
        return parts
    merged = linemerge(MultiLineString(parts + links))
    return list(merged.geoms) if hasattr(merged, 'geoms') else [merged]


def as_lines(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == 'LineString':
        return [geom]
    if hasattr(geom, 'geoms'):
        return [g for sub in geom.geoms for g in as_lines(sub)]
    return []


def split_by(line, test):
    """Cut a line where `test` changes, keeping the cut point on both sides."""
    if test is None:
        return [(False, list(line.coords))]
    runs, cur, state = [], [], None
    for pt in line.coords:
        s = bool(test(*pt))
        if state is None or s == state:
            cur.append(pt)
        else:
            runs.append((state, cur + [pt]))
            cur = [pt]
        state = s
    if cur:
        runs.append((state, cur))
    return runs


def pack(coords):
    line = LineString(coords).simplify(SIMPLIFY, preserve_topology=False)
    if line.length < MIN_LENGTH:
        return None
    return [[round(x, 3), round(y, 3)] for x, y in line.coords]


def build_theatre(key, cfg, counties):
    fips = theatre_fips(cfg['source'])
    missing = fips - counties.keys()
    if missing:
        sys.exit(f'{key}: {len(missing)} counties not in the county file')
    theatre = unary_union([counties[f] for f in fips])
    minx, miny, maxx, maxy = theatre.bounds
    # The plate is fitted to the theatre with a small margin of country
    # around it; bring the rivers through that margin and no further.
    bbox = (minx - 0.4, miny - 0.4, maxx + 0.4, maxy + 0.4)
    box = shape({'type': 'Polygon', 'coordinates': [[
        (bbox[0], bbox[1]), (bbox[2], bbox[1]), (bbox[2], bbox[3]), (bbox[0], bbox[3]), (bbox[0], bbox[1])]]})
    land = unary_union([g for g in counties.values() if g.intersects(box)]).buffer(LAND_PAD)
    inside = theatre.buffer(THEATRE_PAD)

    out = []
    for name, label, navigable in cfg['rivers']:
        parts = fetch_river(name, bbox)
        if not parts:
            print(f'  {name}: not found', file=sys.stderr)
            continue
        river = unary_union(parts).intersection(land)
        reaches = []
        for where, geom in (('theatre', river.intersection(inside)), ('backdrop', river.difference(inside))):
            lines = as_lines(geom)
            if len(lines) > 1:
                lines = as_lines(linemerge(lines))
            for line in lines:
                for nav, coords in split_by(line, navigable):
                    pts = pack(coords)
                    if pts:
                        reach = {'points': pts}
                        if nav:
                            reach['navigable'] = True
                        if where == 'backdrop':
                            reach['backdrop'] = True
                        reaches.append(reach)
        if reaches:
            entry = {'name': name.replace(' River', '')}
            if label:
                entry['label'] = label
            entry['reaches'] = reaches
            out.append(entry)
            n = sum(len(r['points']) for r in reaches)
            print(f'  {name}: {len(reaches)} reaches, {n} points')
    return out


def main():
    print('counties…')
    counties = {f['id']: shape(f['geometry']).buffer(0)
                for f in fetch_json(COUNTY_URL)['features']}
    data = {}
    for key, cfg in THEATRES.items():
        print(key)
        data[key] = build_theatre(key, cfg, counties)

    header = (
        '/**\n'
        ' * Rivers for the county-based theatre maps, as [lon, lat] reaches.\n'
        ' *\n'
        ' * GENERATED by scripts/buildTheatreRivers.py from the USGS National\n'
        ' * Hydrography Dataset (public domain). Do not edit by hand: change the\n'
        ' * lists in that script and run it again.\n'
        ' *\n'
        ' * A reach is `navigable` where a flotilla could use it in 1861-65, and\n'
        ' * `backdrop` where it runs outside the theatre\'s counties.\n'
        ' */\n\n'
    )
    body = 'export const THEATRE_RIVERS = ' + json.dumps(data, separators=(',', ':')) + ';\n'
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(header + body)
    print(f'wrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
