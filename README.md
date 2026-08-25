# Walker

**Walker** — a game of its own, grown out of the three-dimensional character
work taken out of NostOS and parked here.

The work reached the point where the player could be a posed, animated model
standing in the world rather than one of forty baked PNGs, and it worked. Then
it was reverted, for a reason that had nothing to do with whether it worked:
**the world was built around the other character.** NostOS is furnished with
Kenney's retro trees and Cube Pets animals, and a smoothly proportioned
Quaternius human standing among them reads as a visitor from a different game.
That risk was named before any of it was written and it turned out to be the
one that mattered.

So this is not a failed branch. It is a finished piece of work waiting for a
world that suits it — or for the day the rest of NostOS moves toward it rather
than the character moving toward NostOS.

---

## What is here

```
docs/character-3d-plan.md   the design, the findings, and every coordinate
patches/                    the NostOS integration, as a diff against v1.8
src/character3d.js          the renderer: poses a skeleton, draws it flat
tools/character-preview.html    the instrument all the numbers came out of
tools/import-nature.py          copies the used nature models out of _tmp/
tools/world-preview.html        the character in a 3D world of its own
tools/gltf2glb.mjs          .gltf -> .glb, dropping clips you do not want
tools/sync-item-map.py      copies the item table into the plan doc
models/adventurer-m.glb     the male Adventurer, 13 clips, 1.7 MB
vendor/                     three.js r160 + glTF loader, imports rewritten
sprites/                    the CC0 Quaternius packs, unmodified
reference/kenney/           the sprites this replaced, for comparison
```

`docs/character-3d-plan.md` is the thing to read first. It carries what was
measured rather than assumed, which is most of the value here.

## A world of its own

`tools/world-preview.html` is the other question: not how the figure fits into
NostOS, but what it looks like in a scene made of the same asset family and lit
once, at one angle. Ground, trees, rocks and a camp built from the Survival Pack
OBJs already in `sprites/`, with the figure driven around it on WASD.

It loads nothing from the network. three.js is the vendored r160, and the OBJ
reader is forty lines inline rather than another loader — the packs are
positions, normals and `usemtl` with no UVs, so there is not much to read.

Keys: WASD and SHIFT to move, SPACE to jump, CLICK to strike, `[` `]` to turn
the camera, `-` `=` to zoom, `P` for perspective instead of the 2:1
orthographic, `1` `2` `0` for stance, `E` `V` `H` `X` for the one-shot clips,
`L` for shading, `K` for the three light rigs, `G` for the isometric lattice,
`M` and `8` `9` for the wind, `,` `.` to trim the walk pace (`SHIFT` with them
for run) and `;` `'` for the size of the held weapon.

Health and stamina are wired to what the world already does rather than shown
for decoration: SHIFT spends stamina and drops back to a walk when it is gone,
health returns only after a spell of not being hit, and at zero he goes down and
gets back up at the camp a few seconds later. The wind is synthesised — pink
noise through a lowpass whose corner and level are walked by two slow sines — so
the page still needs no assets and nothing that can fail to load.

The ground is value noise in three octaves with a ridge pass and a terrace pass,
all of it behind one `heightAt()` that the plane's vertices, every tree, rock,
tuft and prop, the figure's feet and the jump's landing all read. Chalk tracks
are painted into a world-space ground texture. A slope past 46° is a wall, and
SPACE is the way over it.

It also closes §6 of the plan: `1` and `2` put a real model in the right hand,
parented to `Wrist.R` with the grip constants copied out of the plan unchanged.
Those numbers had been worked out in the previewer and never used by anything.
They transfer as written, with one adjustment — `len` is a finished length in
metres, so the scale divides out the bone's accumulated world scale rather than
assuming the bone frame is life-sized.

Four things it settled on the way, and four more the landscape turned up:

- **The model is 0.65 units tall as authored**, not human-scaled. The world here
  is built in metres and the figure scaled to 1.75 to meet it.
- **An untextured ground plane has no speed.** Running across a flat fill looks
  the same as standing on one; the legs end up as the only thing reporting
  motion. A mottled canvas texture and 1,600 instanced tufts fix it, and neither
  is detail for its own sake.
- **`shadow.bias` is a fraction of the shadow camera's depth range**, which is
  119 units wide here. A bias of −0.0012 works out to about 0.14 units along the
  light and slides every short shadow out from under the thing casting it; only
  the trees were tall enough to keep one. Use `normalBias`, which is in world
  units, and leave `bias` at 0.
- **The clip reference speeds are measurable, and Walk's guess was low.**
  `measureRef()` samples a foot bone through a full cycle in the root's own
  frame, takes the stride as its peak-to-peak travel along +Z, and divides two
  strides by the cycle time. At 1.75 m:

  | clip | measured | plan |
  |---|---|---|
  | `Walk` | **3.56 m/s** | 2.6, marked a guess |
  | `Run` | **7.00 m/s** | 7.5, marked confirmed |
  | `Run_Shoot` | **6.71 m/s** | 7.5 |

  A reference set too low makes the legs cycle faster than the body travels,
  which is what reads as the ground being stuck.
- **The clip should lead and the ground should follow.** Choosing a travel speed
  and deriving the playback rate from it leaves two numbers that have to agree,
  and they will not. Inverted — pace is the rate, and the body travels at the
  clip's own measured speed times that rate — there is one number, and a planted
  foot is planted by construction. `walkPace` and `runPace` default to 1.30 and
  1.65, which is 4.63 and 11.55 m/s.
- **A signed shift kills a hash.** `n ^ (n >> 16)` on an int32 always clears the
  sign bit, because an arithmetic shift copies it — so the hash spanned [0, 0.5]
  rather than [0, 1] (measured mean 0.244) and the terrain could only ever dip.
  Every hill was a hole. `>>>` on both shifts.
- **A slope test must use a fixed lookahead, not the frame's travel.** Measured
  across the 8 cm a frame covers, a terrace face reads as a near-vertical
  gradient from well back, so the figure stopped in open ground — and could end
  up somewhere every direction failed and stay there. Sample at a fixed 0.55 m,
  allow any step under 0.45 m whatever the gradient, and never refuse a move
  that does not go up, which is what guarantees a way back out.
- **The shadow frustum has to clear the view, not match it.** At ±26 it was
  barely wider than the visible ground, so trees crossed its edge while you
  watched and their shadows arrived a beat late. ±42 at 4096, with the light
  target snapped to whole shadow texels so the edges stop crawling as you walk.
- **A path cannot be laid over the ground.** A ribbon of quads 5 cm clear
  vanished: its quads are wider than the terrain's triangles, so on any
  convexity the flat chord cuts below the interpolated surface, and lifting it
  clear only makes it hover. Painted into a world-space texture instead, which
  also gives an edge as fine as the canvas rather than as coarse as the mesh.
- **There is no climb clip, and no jump clip.** Not in the 13-clip glb and not
  in the 24-clip source: the pack ships `Roll`, a dodge, and nothing else off
  the flat. The jump is physics with the body holding whatever pose it left the
  ground in, and slopes are met by pitching the root into the gradient. Both are
  stand-ins for hand-keyed poses, the same gap the plan records for archery.
- **Canopies inside the ground's own colour range disappear.** The first trees
  were a green the terrain also had, so on a shaded slope a whole tree dropped
  out and left its trunk standing alone — it read as a field of bare poles, and
  the trees were intact all along. Canopies now sit darker and bluer than any
  ground the texture produces. The tool runs the measurement
  at load and uses what it finds, so the constants in the file are only a
  fallback. Nothing here transfers to NostOS unaltered: those numbers are in
  its own world units, not metres.

## Running the previewer

Any static server from this directory:

```bash
python3 -m http.server 8000
```

then `tools/character-preview.html`. It wants no build and no dependencies.

## Putting it back into NostOS

`patches/nostos-3d-integration.patch` is a diff against **v1.8** covering the
three files the game itself needed: the hook in `renderer.js`, the frame-loop
driving and clip choice in `main.js`, and two keys in `input.js`. Everything
else is a new file and copies straight in.

```bash
cd path/to/nostos
git checkout v1.8
git apply /path/to/Clouds/patches/nostos-3d-integration.patch
cp -r /path/to/Clouds/vendor .
mkdir -p assets/models && cp /path/to/Clouds/models/*.glb assets/models/
cp /path/to/Clouds/src/character3d.js src/engine/
```

## What was settled, and what was not

Settled, and in the plan doc with the numbers:

- The character composites into the existing 2D depth slot. The painter's
  algorithm never learns anything changed.
- Scale 1.1, dialled in play. Derivation said 1.5 and was wrong.
- The model faces **+Z**. Assuming −Z mirrors every angle.
- The foot line is **measured** off the rendered alpha (0.9023), not derived
  from the bounding box (0.8666), or the shadow sits off the boots.
- Clip rate follows the distance actually covered, which picks up wading,
  foliage and lotus torpor for free.
- Grip constants and a model for all twenty held items.

Not settled, and waiting:

- **The dependency.** three.js is vendored at 768 KB to get something testable.
  A hand-written skinned-mesh renderer is plausible — no textures, no shadows,
  no PBR — and would not touch the integration.
- **`hurt` and `swinging` render the same pose.** A hit should win.
- **`Walk`'s reference speed of 2.6** is a guess; `Run`'s 7.5 is confirmed.
- **The waterline at 0.42** was carried over from the sprite's proportions.
- **The held item** is still a flat icon at an approximated hand. The `Wrist.R`
  constants are worked out and written down; nothing has used them yet.
- **No women's model was converted.** Only `adventurer-m.glb` exists.

## Running it

The published build is at **https://dmberry.github.io/walker/**, which serves
`tools/world-preview.html` and needs no build step.

Locally, any static server from this directory:

```bash
python3 -m http.server 8000
```

`tools/character-preview.html` is the exception. It reads the two modular
character packs as glTF, and those are not in the repository — twenty-one
outfits of base64 glTF runs to about 140 MB and the game loads none of it, using
`models/adventurer-m.glb` instead. Put the packs in `_tmp/sprites/` to run it.

## Where the art lives

Source packs go in the gitignored `_tmp/` and **only what is loaded is copied
into `assets/`**. The four Quaternius kits together are about 670 MB on disk;
the game reads roughly six of it.

```
assets/props/    the 15 Survival Pack props the camp and the hands use, plus Pistol_1
assets/nature/   19 of the Stylized Nature MegaKit's 68 models, textures at 512
models/          adventurer-m.glb
_tmp/            every pack in full. Nothing here ships.
```

`tools/import-nature.py` is the record of which nature models were taken and at
what texture size, so the import can be repeated rather than remembered.
Everything is CC0 from Quaternius; each folder carries its licence.

## Licences

The Quaternius packs in `sprites/` are CC0. three.js in `vendor/` is MIT.
`reference/kenney/` are renders of Kenney's CC0 pack. `src/`, `tools/` and
`docs/` are GPL-3.0, the same as NostOS.
