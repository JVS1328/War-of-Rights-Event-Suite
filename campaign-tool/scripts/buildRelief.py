"""
Build the hill shading for every county-based map.

Takes a multidirectional hillshade of the country east of the Rockies from
the USGS 3D Elevation Program (public domain) and turns it into the shading
an engraver would have put on a plate: shadow only, in a sepia ink, strong
on the ridges and nothing at all on flat ground or open water - so the Blue
Ridge and the Cumberland Plateau stand out and the Delta stays clean paper.

The shading is cut into 2-degree tiles; a map loads the tiles it shows. Tiles
with no relief worth drawing are left out.

    pip install shapely pillow
    python3 scripts/buildRelief.py

writes public/relief/<lon>_<lat>.webp (named for each tile's south-west
corner) and src/data/reliefTiles.json, the list of tiles there are. Downloads
are cached in scripts/.rivers-cache/relief (safe to delete). Re-run after
changing the settings below; the tiles are not edited by hand.
"""

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, 'public', 'relief')
INDEX = os.path.join(ROOT, 'src', 'data', 'reliefTiles.json')
CACHE = os.path.join(HERE, '.rivers-cache', 'relief')

HILLSHADE_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'

# The same country the rivers cover, in 2-degree tiles of 400 px: 200 px to
# the degree, about twice what a plate shows before it is zoomed.
AREA = (-107, 24, -66, 50)
TILE = 2
PIXELS = 400

# Flat ground - and open water - comes back from the hillshade as one grey.
# Shadow is measured down from it: nothing within DEAD of it (the noise of
# flat country), full ink SPAN below it, eased by GAMMA so low hills still
# show.
FLAT = 242
DEAD = 3
SPAN = 34
GAMMA = 0.65
INK = (88, 66, 42)
# A tile whose strongest shadow is fainter than this has nothing to show.
MIN_SHADE = 0.08


def fetch_tile(lon, lat):
    path = os.path.join(CACHE, f'{lon}_{lat}.png')
    if os.path.exists(path):
        return Image.open(path)
    params = {
        'bbox': f'{lon},{lat},{lon + TILE},{lat + TILE}',
        'bboxSR': 4326, 'imageSR': 4326,
        'size': f'{PIXELS},{PIXELS}',
        'format': 'png', 'pixelType': 'U8',
        'renderingRule': json.dumps({'rasterFunction': 'Hillshade Multidirectional'}),
        'f': 'image',
    }
    url = f'{HILLSHADE_URL}?{urllib.parse.urlencode(params)}'
    for attempt in range(8):
        try:
            with urllib.request.urlopen(url, timeout=240) as res:
                data = res.read()
            image = Image.open(io.BytesIO(data))
            image.load()
            break
        except Exception as err:  # noqa: BLE001 - the service drops the odd request
            if attempt == 7:
                raise
            # It falls over under a burst; give it room before asking again.
            wait = min(60, 2 ** (attempt + 1))
            print(f'    retrying {lon},{lat} in {wait}s ({err})', file=sys.stderr)
            time.sleep(wait)
    os.makedirs(CACHE, exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(data)
    return image


def shade(image):
    """Hillshade in, sepia shadow with alpha out; None when there is none."""
    grey = np.asarray(image.convert('L').filter(ImageFilter.GaussianBlur(0.7))).astype(float)
    strength = np.clip((FLAT - DEAD - grey) / SPAN, 0, 1) ** GAMMA
    if strength.max() < MIN_SHADE:
        return None
    rgba = np.zeros(grey.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = INK
    rgba[..., 3] = np.round(strength * 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for old in os.listdir(OUT_DIR):
        if old.endswith('.webp'):
            os.remove(os.path.join(OUT_DIR, old))

    x0, y0, x1, y1 = AREA
    tiles = [(lon, lat) for lon in range(x0, x1, TILE) for lat in range(y0, y1, TILE)]
    kept, total = [], 0
    for i, (lon, lat) in enumerate(tiles):
        print(f'  tile {i + 1}/{len(tiles)}', end='\r', flush=True)
        out = shade(fetch_tile(lon, lat))
        if out is None:
            continue
        path = os.path.join(OUT_DIR, f'{lon}_{lat}.webp')
        out.save(path, 'WEBP', quality=60, alpha_quality=60, method=6)
        total += os.path.getsize(path)
        kept.append([lon, lat])
    print()
    with open(INDEX, 'w') as fh:
        json.dump({'size': TILE, 'tiles': kept}, fh, separators=(',', ':'))
    print(f'wrote {len(kept)} of {len(tiles)} tiles to {os.path.relpath(OUT_DIR, ROOT)} ({total // 1024} KB)')


if __name__ == '__main__':
    main()
