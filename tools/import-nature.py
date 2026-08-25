#!/usr/bin/env python3
"""Copy the handful of Stylized Nature MegaKit models the game uses out of the
gitignored _tmp/ and into assets/nature, downscaling their textures on the way.

The kit is 117 MB for 68 models and the game wants about twenty of them, so
none of it belongs in the repository. This is the record of which ones were
taken and at what size, so the import can be repeated rather than remembered.

    python3 tools/import-nature.py
"""
import json, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / '_tmp/Stylized Nature MegaKit[Standard]/glTF'
DST = ROOT / 'assets/nature'
TEX_PX = 512          # the kit ships 1024 and 2048; nothing here is seen that close

WANTED = [
    # conifers, the cheapest trees in the kit at about 4k triangles
    'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5',
    # broadleaf, about 6k
    'CommonTree_1', 'CommonTree_2', 'CommonTree_3',
    # bare, for the higher ground
    'DeadTree_1', 'DeadTree_2',
    'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
    'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Square_1',
    'Bush_Common', 'Grass_Common_Tall', 'Fern_1',
]

if not SRC.is_dir():
    sys.exit('not found: %s\nPut the pack in _tmp/ first.' % SRC)

DST.mkdir(parents=True, exist_ok=True)
images, total_tris = set(), 0

for name in WANTED:
    gltf = SRC / (name + '.gltf')
    if not gltf.exists():
        print('missing:', name); continue
    j = json.loads(gltf.read_text())
    total_tris += sum(j['accessors'][p['indices']]['count'] // 3
                      for m in j['meshes'] for p in m['primitives'])
    for im in j.get('images', []):
        if im.get('uri'):
            images.add(im['uri'])
    shutil.copy2(gltf, DST / gltf.name)
    for b in j.get('buffers', []):
        if b.get('uri'):
            shutil.copy2(SRC / b['uri'], DST / b['uri'])

for uri in sorted(images):
    src = SRC / uri
    if not src.exists():
        print('missing texture:', uri); continue
    out = DST / uri
    shutil.copy2(src, out)
    subprocess.run(['sips', '-Z', str(TEX_PX), str(out)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

size = sum(f.stat().st_size for f in DST.rglob('*') if f.is_file())
print('%d models, %d textures at %dpx, %d triangles, %.1f MB'
      % (len(WANTED), len(images), TEX_PX, total_tris, size / 1e6))
