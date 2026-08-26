#!/usr/bin/env python3
"""Copy models out of the MegaKit in _tmp and into assets/kit.

The record of what came across and why, in the same spirit as import-nature.py.
Source packs stay in _tmp and never ship: only the files the game actually loads
are copied out.

Three things happen on the way in.

  Textures come down to 512. The kit ships 2048 atlases and a single model can
  pull ten of them; at this camera a vent on a wall is forty pixels tall.

  Normal and ORM maps are dropped. Every kit material becomes a Lambert with a
  base colour when it loads, because nothing else in this world is lit any other
  way and one object responding differently to light reads as pasted in.

  The glTF is pruned to match, so it stops asking for the maps that are no
  longer there. Without this every load was a run of 404s.

    python3 tools/import-kit.py
"""

import json
import os
import shutil
import subprocess

KIT = '_tmp/Modular SciFi MegaKit[Standard]'
OUT = 'assets/kit'
TEX_PX = 512

# What the elevation is dressed with, and what it is for.
# Only what the game actually loads. The elevation was dressed with vents, a
# service run and uplighters for a while and it read as a texture made of plant
# rather than plant on a wall, so it came back out; the models are still in _tmp
# if that is revisited.
MODELS = [
    ('Platforms', 'Door_Metal'),          # the sliding leaves
    ('Platforms', 'Door_Frame_Square'),   # and their frame
    ('Props', 'Prop_AccessPoint'),        # the floor terminal in the hall
]


def prune(path):
    """Keep base colour only, and renumber what is left."""
    g = json.load(open(path))
    keep = set()
    for m in g.get('materials', []):
        for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture'):
            m.pop(k, None)
        pbr = m.get('pbrMetallicRoughness', {})
        pbr.pop('metallicRoughnessTexture', None)
        if 'baseColorTexture' in pbr:
            keep.add(pbr['baseColorTexture']['index'])

    old = g.get('textures', [])
    tex_map, new_tex = {}, []
    for i in sorted(keep):
        tex_map[i] = len(new_tex)
        new_tex.append(old[i])

    img_keep = sorted({t['source'] for t in new_tex if 'source' in t})
    img_map = {o: n for n, o in enumerate(img_keep)}
    new_img = [g['images'][i] for i in img_keep]
    for t in new_tex:
        if 'source' in t:
            t['source'] = img_map[t['source']]
    for m in g.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pbr:
            pbr['baseColorTexture']['index'] = tex_map[pbr['baseColorTexture']['index']]

    g['textures'], g['images'] = new_tex, new_img
    json.dump(g, open(path, 'w'), separators=(',', ':'))
    return [i['uri'] for i in new_img]


def main():
    os.makedirs(OUT, exist_ok=True)
    wanted = set()
    for sub, name in MODELS:
        src = f'{KIT}/glTF/{sub}/{name}'
        shutil.copy(src + '.gltf', f'{OUT}/{name}.gltf')
        shutil.copy(src + '.bin', f'{OUT}/{name}.bin')
        kept = prune(f'{OUT}/{name}.gltf')
        wanted.update(kept)
        print(f'  {name:26} {len(kept)} texture(s)')

    for uri in sorted(wanted):
        dst = f'{OUT}/{uri}'
        shutil.copy(f'{KIT}/Textures/{uri}', dst)
        subprocess.run(['sips', '-Z', str(TEX_PX), dst], capture_output=True)
        print(f'  {uri:34} {os.path.getsize(dst) // 1024} KB')

    # Anything left behind by an earlier run. This used to check the textures
    # only, so dropping a model left its .gltf and .bin in the repo for good —
    # eight of them, quietly, after the elevation plant came out. The rule is
    # that assets/kit holds exactly what MODELS names and nothing else.
    expected = set(wanted)
    for _, name in MODELS:
        expected.update((f'{name}.gltf', f'{name}.bin'))
    for f in sorted(os.listdir(OUT)):
        if f not in expected:
            os.remove(f'{OUT}/{f}')
            print(f'  removed stale {f}')

    total = sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))
    print(f'\n{len(MODELS)} models, {total // 1024} KB in {OUT}')


if __name__ == '__main__':
    main()
