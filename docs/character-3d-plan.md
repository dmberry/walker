# Real 3D characters in the isometric world — the plan

David, 2026-08-25, on the Quaternius packs: *"can we use these 3D characters in
Nostos as they would be a huge improvement on what we already have… explain how
they can be incorporated as real 3D models rendered into the world."* Then, on
the approach: *"B sounds good. It has the advantage of solving the armour
problem as part of the model can be coloured for each armour piece."*

This is that plan. It is a design document, not a diff. Everything under
"Verified" was measured, not assumed; everything under "Open" is not yet
settled.

---

## 1. What a character is today

`assets/textures/characters/` holds pre-rendered PNGs: 8 compass directions ×
(1 idle + 4 walk) = 40 frames per skin, 64×64, drawn at scale 0.6 in
`drawPlayerSprite`. On screen that is ~61 CSS px at the default close zoom
(1.6) and ~115 px at zoom 3.

Four skins were baked; two are wired up. `loadCharacterSet` is called for
`humanMaleA` and `humanFemaleA` only, and `CHARACTER_SPRITE_SETS.u` (Neve)
aliases the male set — the comment says so: *"no distinct 'other' skin rendered
yet."* The zombie sets sit on disk unused.

The player is the only human in the game. `CHARACTER_SPRITE_SETS` is referenced
from three places, all inside `drawPlayer`. There are no NPCs.

**Combat has no body animation at all.** There are 23 weapon/tool/gun/gadget
defs, `swingTimer`, `swingCooldown`, `hurtTimer`, projectiles and a death hook,
and none of it moves the character. `drawPlayerSprite` picks idle or walk;
`drawHeldItem` rotates a 2D icon about a point near where a hand would be, with
five hand-tuned constants and a manual front/back depth test (`heldBehind`).

## 2. The approach: live 3D rendered into the existing depth slot

The 2D renderer draws the character as one sprite in one depth-sorted slot.
Change where that sprite comes from: each frame, pose the skeleton, render it
with an orthographic camera at the iso angle into an offscreen WebGL canvas,
then `drawImage` that region where `drawPlayerSprite` currently draws the PNG.

The painter's algorithm never learns anything changed. Self-occlusion (an arm
across the torso) is the GPU depth buffer. Scene occlusion (the player behind a
house) stays the 2D sort, exactly as now.

Rejected alternatives, and why:

- **Bake to sprites.** Extends the existing `tools/sprite-render.html`
  pipeline, zero runtime risk. But it keeps the 8-way facing snap, cannot blend
  a slash into a walk, and cannot report where the hand is. Kept as the
  fallback for a failed WebGL context.
- **One WebGL layer over the whole viewport.** Composites over the 2D canvas,
  so the player draws in front of every building. Needs a depth mask the 2D
  renderer does not produce.
- **Port the renderer to three.js.** A different project. See
  `docs/terrain-3d-plan.md`, which wants the terrain model rewritten first.

## 3. The assets

CC0, Quaternius: "Ultimate Modular Men" (11 outfits) and "Ultimate Modular
Women" (10). They live in the gitignored `_tmp/sprites/`; only baked or
converted outputs would ever ship.

Per character: 5,240 triangles, 62 joints, 24 animation clips, **no textures**
(flat materials, `baseColorFactor` only), 906 KB of binary. The 3 MB `.gltf`
figure is base64 inflation; a trimmed `.glb` is far less.

### Verified

- **Every outfit within a pack carries the identical 62-joint skeleton in the
  identical order.** Checked across all 21. Grafting a part from one outfit
  onto another's skeleton needs no bone remapping.
- **The two packs share bone names, bone order and all 24 clip names, but not
  proportions.** 58 of 62 bones sit at different rest translations — the men
  are broader at the shoulder (`Shoulder.L` x = 0.0987 vs 0.0685), the women
  longer in the forearm (`LowerArm.L` y = 0.217 vs 0.1819). Animations are
  therefore interchangeable across packs; *meshes are not safely so*. A
  cross-pack head graft renders without visible error (the head is effectively
  rigid on one bone); a cross-pack torso is the case that would deform.
- **Every mesh is split into primitives by material, and each is separately
  hideable.** The Adventurer's head group is Skin (448 tris) + Eyebrows (24) +
  Hair (3,124) + Eye (24).
- **No head in the women's pack is short-haired.** Female Casual and Suit carry
  two hair primitives, `Hair_Brown` at 40 tris and `Hair_Blond` at 2,128 — but
  the 40-triangle piece is a hairline strip that exists only to sit under the
  long hair, and shown alone it reads as a broken cap. It is not a crop.
  Female Adventurer's is 286 (tucked under a hat); every other female head is
  1,000+. The shortest genuine cut in either pack is the men's **Casual_2** at
  1,188.
- **A head grafts across packs without deforming.** It hangs off one rigid
  bone, so the proportion divergence above does not reach it. Verified by
  putting the men's `Casual_2` head on the women's Adventurer body: correct
  neck join, no gap. A torso is the case that would break.
- **Modular decomposition matches `ARMOUR_SLOTS` exactly.** The packs cut into
  Head / Body / Legs / Feet; `armour.js` has `['head', 'chest', 'legs',
  'feet']`. Parts available: men 12 heads / 11 bodies / 11 legs / 11 feet;
  women 10 of each.

## 4. Character creation

David, 2026-08-25: *"Two bases - adventurer MAN/WOMAN (other represented
through editing WOMAN as base - e.g. shorter hair default?) then options for
SOLDIER / SCI-FI later in the game?"*

Two bases, both Adventurer, one per pack. Every edit stays inside its own pack,
so the cross-pack proportion divergence in §3 is never exercised. The third
option (`player.gender = 'u'`, Neve, currently aliasing the male sprite set)
becomes the woman base with a short cut. That cut has to be borrowed from the
men's pack (`Casual_2`) — the first attempt hid Eve's long hair expecting a
crop underneath and got the hairline strip instead. It is the one cross-pack
graft the plan uses, and only because a head is rigid on one bone.

| Base | `gender` | Body | Head | Hair |
|---|---|---|---|---|
| Man | `m` | m/Adventurer | m/Adventurer | own |
| Woman | `f` | f/Adventurer | f/Casual | long, blonde in the asset |
| Neither | `u` | f/Adventurer | m/Casual_2 | short |

Editable at creation: base, head (from that pack's 10–12), hair primitive
on/off, hair colour, skin colour, eye colour. Every material is a plain `baseColorFactor`
with no texture, so recolouring anything is a one-line material change and
costs no new asset.

Later outfits unlock as body/legs/feet swaps within the pack. "Soldier" and
"SciFi" are the women's-pack names; the men's equivalents are **Swat** and
**Spacesuit**. Those four are also the only outfits in either pack that read as
protective rather than civilian, which is what makes them the ones worth
gating.

The Adventurer is the only outfit in either pack with the backpack as a
**separate mesh**, so it can be shown or hidden independently — available if
carried weight should ever read on the body.

`_tmp/character-preview.html` (not in the repo) is the working prototype of this screen: pack,
outfit grid, per-slot graft, per-primitive grooming, hair colour, armour tier,
all 24 clips, and a side-by-side against the current sprite at both game zooms.
Neither the tool nor the art it reads is committed; the numbers it produced are, in §7a.

## 5. Armour

`armourTint` currently takes only the heaviest worn piece's colour and returns
one value; `drawPlayerSprite` blurs that into a single silhouette around the
whole figure. A T-plate helm worn with black-plate boots shows one colour for
both, and per-piece durability (70–210 points, decremented on every hit) is
invisible until a piece breaks and drops out of the tint.

With four meshes and four slots, each part takes the colour of the piece in its
slot. Three rules found by building it:

1. **Blend toward the tier colour rather than replacing with it.** A flat fill
   erases the straps and seams the outfit already has and the figure reads as
   painted. Strength wants to be tunable; 0.55 to 0.85 is the usable band.
2. **Never plate skin, hair, eyes or brows.** A cuirass recolouring a forearm
   and a face is most of what makes a tinted character look wrong. Match the
   material name, not the mesh.
3. **A helm is geometry, not a tint.** Once skin and hair are protected there is
   almost nothing on a bare head left to colour. Swap the head mesh instead.
   The men's pack has two covered heads — **Swat** (`Swat_Black` / `Swat` /
   `Visor`) and **Spacesuit** (`SciFi_Light` / `SciFi_Light_Accent` / `Grey`)
   — both on the same skeleton, so the swap is free. **The women's pack has
   none**: all ten heads carry a `Skin` material, Soldier and SciFi included.
   A helm on the woman or Neither base can therefore only take the hair off
   and plate what head geometry is not skin, which is thin. If the third slot
   is to read properly on all three bases, one helmet head needs modelling, or
   the men's Swat head needs rebinding to the women's skeleton — and that is a
   cross-pack graft, so it needs the corrective offset from §3.

Durability can read as the material desaturating toward bare.

**Eyes are found by colour, not by name.** Every head in both packs paints its
eyes the same linear `[0.031, 0.018, 0.011]`, but the men call that material
`Eye` and the women call it `Brown` — which is also a clothing colour on the
same figure. Matching the name would recolour a woman's jacket along with her
eyes, and would let a helm plate them. Match the base colour. (On female Formal
and Medieval that primitive is 64 triangles rather than 24: eyes and brows
together, since those heads carry no separate `Eyebrows`.) At 24 triangles
these are stylised dots, not an iris with white around it — the colour reads at
game size and reads as a coloured dot at close range.

**Note on material naming.** The two packs do not name equivalent materials
alike. The men's heads carry `Eye` and `Eyebrows`; the women's have neither —
the eyes are painted with a material called `Brown`, which is also a clothing
colour elsewhere on the same figure. Anything that protects or recolours by
material name needs a per-pack table, not one regex.

**Slot classification, in two corrections.** The first attempt sorted the mesh
groups by height and took the top four as head/chest/legs/feet. The Adventurer
has five: the backpack sits at torso height, so it took the chest slot and
pushed body → legs → feet down by one, and every armour piece coloured the part
below the one it names. So: classify on where a group's centre sits as a
fraction of the figure's height.

That still leaves more than one group in the torso band. The second attempt
picked the body as the one carrying a `Skin` material, which is right on the
Adventurer (bare arms on the body, none on the backpack) and destroys the
**Spacesuit**, which is sealed and carries no `Skin` anywhere — its entire
4,022-triangle torso was filed as an accessory, so a body swap had no chest to
graft and produced a head and a pair of legs. **The body is the largest group
in the torso band; skin only breaks a tie.** Everything else at torso height is
worn over it: a backpack, a tactical vest.

A body swap must also carry the donor's own over-body pieces across, or the
Swat arrives without its vest.

Deletes when this lands: `armourTint`'s best-piece selection, the `tintScratch`
silhouette pass, and the blur compositing in `drawPlayerSprite`.

## 6. The held item

The rig has `Wrist.R` plus a full finger set (`Index1.R` … `Thumb3.R`), so
there is a real attachment point that moves correctly through every clip
including `Sword_Slash`.

**Two traps, both hit while building the prototype.** First, three.js renames
the bones on load: a dot is a path separator in its animation binding, so
`PropertyBinding.sanitizeNodeName` **deletes** it — `Wrist.R` arrives as
`WristR`, not `Wrist_R`. Match on the name with non-alphanumerics stripped.
Second, ask `skeleton.bones` for the joint rather than traversing the scene for
`isBone`; GLTFLoader does not guarantee the joints hang under the mesh's node.

Draw the existing 2D item icon as a camera-facing quad parented to `Wrist.R`,
inside the 3D pass. The depth buffer then decides whether the weapon is in
front of the torso or behind it, so a blade crossing the body during a slash
occludes correctly instead of popping front-to-back at the halfway point of the
turn. All 23 item icons keep working; nothing needs modelling.

Deletes: the five placement constants in `drawHeldItem`, `grip`, `extraAng`,
and `heldBehind`.

## 7. Clip mapping

| Game state | Clip |
|---|---|
| melee in hand, idle | `Idle_Sword` |
| gun in hand, idle | `Idle_Gun`, `Idle_Gun_Pointing` |
| `swingTimer` active, melee | `Sword_Slash` |
| `swingTimer` active, gun | `Gun_Shoot`, `Run_Shoot` while moving |
| bare hands | `Punch_Left/Right`, `Kick_Left/Right` |
| `hurtTimer` > 0 | `HitRecieve`, `HitRecieve_2` |
| `onDeath` | `Death` |
| moving | `Walk`, `Run`, `Run_Back/Left/Right` |
| gathering, opening | `Interact` |

`Roll` has no game state behind it; there is no dodge.

## 7a. Props in the hand

The prototype that produced all of this — `_tmp/character-preview.html` —
**is not in the repo**. It reads art that is not in the repo either, and it is
an instrument rather than a deliverable. What came out of it is below, so the
coordinates survive the directory being cleared.

Three grip constants (`gun`, `tool` for blades, `haft` for long shafts), each a
fixed offset in the BONE's frame, with per-item overrides on top. Of the 26
items the game can put in `hands`: 20 have coordinates and 6 have no model.

Several of those 20 are one model wearing a different colour, which is the
cheapest way to widen the set: the `Knife` is the penknife, machete, katana and
robot sword at four lengths; the `Radio` is the bluebox, the Wi-Fi block, the
OB spoofer and the FSF card; and the unlit `WoodenTorch`, blackened at the top
end and taken from wood to steel, is the crowbar.

The previewer and this fence are the same numbers in two places. Regenerate
rather than hand-edit: `python3 _tmp/sync-item-map.py`.

```js
const GRIPS = {
  // A gun lies along its own +X, and this sends that axis to the bone's +Y —
  // out through the fingers, pointing where he is looking.
  //
  // Getting here took two wrong turns. [0, 180, −90] read as held but fired
  // backwards; flipping the sign of the Z turn reversed the barrel and left the
  // weapon upside down, because the Y=180 had already rolled it. Barrel
  // direction and roll are separate, and both had to move.
  // The 0.15 along the bone's +Y matters: the joint is at the WRIST, and a hand
  // is about that long, so without it the weapon hangs off the joint instead of
  // sitting in the fist.
  // Five weapons trimmed by hand came out within a couple of centimetres of
  // each other: along −0.08…+0.01, across 0.10…0.15, out −0.05…0.00. That
  // spread is about the size of the trimming itself, so there is no formula
  // worth deriving — but the middle of it makes a much better default than any
  // single weapon's numbers, and most guns need no trim from here.
  gun:  { rot: [180, 180, -90], off: [-0.03, 0.12, -0.03] },
  // Tools lie along +Y, which is already the bone's own axis, so there is no
  // axis swap to do — only a roll. But one tool grip turned out not to be
  // enough: a blade is held near its own end and a long shaft is held partway
  // up, which is a different rotation AND a much bigger shift along the model.
  // Hence two rows. An ITEM_MAP entry may name which with `grip: 'haft'`.
  tool: { rot: [0, 180, 0], off: [-0.02, 0.15, -0.03] },     // blades
  haft: { rot: [-100, 6, 92], off: [0.23, 0.12, -0.05] },    // shovel, hammer, torch
};

const HAFTED = new Set(['shovel', 'sledgehammer', 'torch']);

const ITEM_MAP = {
  // --- guns the game already means literally ---
  pistol:     { dir: GUNS, of: 'Pistol_1',        len: 0.22, off: [-0.02, 0.14, -0.02] },
  shotgun:    { dir: GUNS, of: 'Shotgun_1',       len: 1.00, off: [-0.07, 0.10, -0.04] },
  // --- reskins ---
  stungun:    { dir: GUNS, of: 'Pistol_4',        len: 0.24, off: [0.01, 0.12, -0.05],
                cols: { Black: '#2b3140', Metal: '#2fb8c8', DarkMetal: '#141416' }, glow: 0.8 },
  electrogun: { dir: GUNS, of: 'Bullpup_1',       len: 0.80, rot: [180, 172, -87], off: [0.02, 0.12, -0.03],
                cols: { MainDark: '#141416', MainLight: '#7b3fd4', Main: '#2b3140' }, glow: 1.2 },
  railgun:    { dir: GUNS, of: 'SniperRifle_4',   len: 1.20, off: [-0.08, 0.11, -0.02],
                cols: { Black: '#141416', DarkMetal: '#41464d', Metal: '#3f6fd4', Glass: '#3f6fd4' }, glow: 1.0 },
  wavegun:    { dir: GUNS, of: 'AssaultRifle2_1', len: 0.90, off: [0.01, 0.11, -0.03],
                cols: { MainDark: '#2b3140', MainLight: '#2fb8c8', Main: '#41464d' }, glow: 0.9 },
  obgun:      { dir: GUNS, of: 'AssaultRifle2_3', len: 0.95, rot: [180, 180, -94], off: [0, 0.13, -0.03],
                cols: { MainDark: '#141416', MainLight: '#3fd46f', Main: '#1b2118' }, glow: 1.4 },
  bow:        null,   // nothing in either pack
  // --- tools ---
  // Red handle, steel left alone — a Swiss Army knife, which is what the word
  // means. Same Knife mesh as the machete, katana and robot sword; only the
  // length and the handle colour tell them apart.
  penknife:     { dir: SURV, of: 'Knife',   len: 0.32, rot: [-7, 180, -76], off: [-0.01, 0.16, -0.03],
                  cols: { DarkWood: '#ff3b2a' } },
  machete:      { dir: SURV, of: 'Knife',   len: 0.61, rot: [12, -174, -15], off: [-0.02, 0.16, -0.03] },
  shovel:       { dir: SURV, of: 'Shovel',  len: 1.10, rot: [-100, 6, 92], off: [0.23, 0.12, -0.05] },
  sledgehammer: { dir: SURV, of: 'Axe',     len: 0.90, rot: [-9, 180, -73], off: [0.11, 0.12, -0.02],
                  cols: { Wood: '#3b2a16' } },
  katana:       { dir: SURV, of: 'Knife',   len: 0.49, rot: [171, 2, 83], off: [0.01, 0.17, -0.03],
                  cols: { Metal: '#b6b2a6' } },
  // "A heavy blade beaten out of machine parts" — so it is bare cut metal, not
  // a painted casing. The Knife's four materials are blade / handle / edge /
  // rivet; the blade and edge go bright tin, the handle takes T2's chassis
  // grey (#2e3138) because that is literally what it was made from. Kept
  // clear of #cfd4dc, which is Achilles' silver-white and belongs to him.
  robot_sword:  { dir: SURV, of: 'Knife',   len: 0.66, rot: [-6, 180, -43], off: [-0.02, 0.18, -0.04],
                  cols: { Grey: '#c3c9d1', LightGrey: '#e2e7ec', DarkWood: '#2e3138', Yellow: '#8a8574' } },
  // Lit, and the model separates the flame from the stick: Fire (33% of the
  // mesh) is the core, Yellow (36%) the outer, DarkWood and LightGrey the
  // shaft and its binding. Only the first two take a colour, so only they take
  // the emissive — the wood stays wood.
  torch:        { dir: SURV, of: 'WoodenTorch_Fire', len: 0.55,
                  rot: [105, 180, -69], off: [0.03, 0.15, -0.05],
                  cols: { Fire: '#fff2dc', Yellow: '#ff9a3c' }, glow: 1.8 },
  compass:      { dir: SURV, of: 'Compass_Open', len: 0.10, rot: [0, 0, 0], off: [0.01, 0.14, -0.06] },
  // NOT A HAND PROP. The phone lives in its own slot — player.js:340, "the
  // PHONE box beside the walkman" — so it never reaches `hands` and nothing
  // would ever ask for it here. Same goes for the walkman (player.js:360).
  nokia_3310:   null,
  sniffer:      { dir: SURV, of: 'Radio',   len: 0.22, rot: [-4, -14, 90], off: [0.05, 0.16, -0.03] },
  // Actually blue. The Radio's materials are Black / LightGrey / DarkGrey / Red
  // — there is no `Grey`, which is what the first version keyed on, so it did
  // nothing at all. Casing and face go blue; the Red stays a red LED, and is
  // left un-overridden so it keeps out of the emissive pass.
  bluebox:      { dir: SURV, of: 'Radio',   len: 0.18, rot: [0, 0, 0], off: [-0.03, 0.12, -0.06],
                  cols: { Black: '#25407a', LightGrey: '#5c8fd6', DarkGrey: '#16233f' } },
  // Bark and the cut face are separate materials (93% / 7%), so the sawn end can
  // stay pale against a lighter bark rather than the pack's dark red-brown.
  wood:         { dir: SURV, of: 'WoodLog', len: 0.42, rot: [0, 0, 0], off: [0.01, 0.10, -0.05],
                  cols: { Wood: '#b08a58', LightWood: '#e0c894' } },

  // A CROWBAR OUT OF A TORCH. David's spot: the unlit WoodenTorch is three parts
  // stacked by height — Yellow at the bottom (y −0.31…0.36), LightGrey at the
  // top (1.29…2.11) and DarkWood as the shaft through both — so blackening the
  // top end and taking the wood to steel reads as a bar with a blackened claw.
  // Greys from the island's own chassis palette (T2 #2e3138, T1 #41464d).
  crowbar:      { dir: SURV, of: 'WoodenTorch', len: 0.75, rot: [0, 180, -82], off: [-0.02, 0.15, -0.03],
                  cols: { DarkWood: '#2e3138', LightGrey: '#141416', Yellow: '#41464d' } },

  // --- gadgets: the same box, recoloured -------------------------------------
  // None of the three has a model of its own and none needs one — they are all
  // hand-sized boxes with a lamp on. Reuse the Radio at the bluebox's grip and
  // let colour do the telling apart, taking the hues from the game's own lamp
  // palette (robots.js:439) rather than inventing any.
  //
  //   wifiblock   jams hunter sensors      → black case, amber face
  //   ob_spoofer  fakes an obelisk         → the OB green
  //   fsf_card    "a live system on a card"→ white, per David
  wifiblock:    { dir: SURV, of: 'Radio',   len: 0.18, rot: [0, 0, 0], off: [-0.03, 0.12, -0.06],
                  cols: { Black: '#1a1c20', LightGrey: '#ffb020', DarkGrey: '#0e1013' } },
  ob_spoofer:   { dir: SURV, of: 'Radio',   len: 0.18, rot: [0, 0, 0], off: [-0.03, 0.12, -0.06],
                  cols: { Black: '#123a24', LightGrey: '#49e07a', DarkGrey: '#0b2416' } },
  fsf_card:     { dir: SURV, of: 'Radio',   len: 0.16, rot: [0, 0, 0], off: [-0.03, 0.12, -0.06],
                  cols: { Black: '#e8e8e4', LightGrey: '#f6f6f2', DarkGrey: '#b9b9b2' } },

  // --- no model yet ---
  bat: null, screwdriver: null, saw: null, seatbelt: null,
};

const RAW_TUNED = {
  Matchbox:    { len: 0.20, rot: [0, 6, 93], off: [0.01, 0.18, -0.04] },
  // The kit's Red is 52% of the mesh and the pack ships it dark. Brightened to
  // the game's own lamp red (robots.js:439) so it is the same red the island
  // already uses, and the cross goes properly white.
  FirstAidKit: { len: 0.36, rot: [-9, 9, 87], off: [0.15, 0.14, -0.11],
                 cols: { Red: '#ff3b2a', White: '#f4f4f0' } },
  WaterBottle_1: { len: 0.19, rot: [0, 0, 100], off: [-0.02, 0.15, -0.03] },
  // The electric torch. Its lens is its own material (LightBlue, 3% of the
  // mesh) so the beam end can go white and take the emissive on its own while
  // the black body stays dark. A colder, whiter light than WoodenTorch_Fire —
  // see the note in docs/character-3d-plan.md; this wants to be an item.
  Torch:       { len: 0.53, rot: [0, 0, 0], off: [-0.02, 0.30, -0.05],
                 cols: { LightBlue: '#f2f8ff' }, glow: 2.0 },
};
```


Sources, both CC0 Quaternius, both in `_tmp/sprites/`: "Ultimate Gun Pack"
(41 guns, 15 attachments) and "Survival Pack" (53 props). Untextured, flat
named materials, 118–1,160 triangles each — so a reskin is a colour change.

Three things that fell out of doing it:

- **The sci-fi weapons reskin real ones.** Reach for the **Bullpup** and
  **AssaultRifle2** families first: their materials are named `Main` /
  `MainDark` / `MainLight` — role slots rather than literal colours — so three
  values repaint the whole weapon. Everything else names its materials `Black`,
  `DarkMetal`, `DarkWood`, which recolour fine but read as a wooden gun painted
  purple rather than a purple gun.
- **Emissive is what sells it.** The packs ship `Ke 0`, but a flat material
  with an emissive term needs no texture and no extra geometry. That is the
  difference between an electro-gun and a violet rifle.
- **Colours should come from the island's own palette**, not be invented.
  `robots.js:439` has `red #ff3b2a`, `amber #ffb020`, `green #49e07a`; the
  chassis greys are `T1_BODY #41464d` and `T2_BODY #2e3138`. The robot sword is
  "beaten out of machine parts", so its handle takes T2's own grey.

**Proposed item: an electric torch.** David, 2026-08-25, on the Survival Pack's
`Torch` model: *"this should be a thing in the game! throwing a different kind
of whiter light"*. The game has `torch` already — a burning brand, a resource.
This is the other thing: a scavenged electric torch, colder and whiter, and it
sits with the Nokia and the Walkman in the pre-collapse register. The model
keeps its lens as a separate material (`LightBlue`, 3% of the mesh), so the
beam end lights on its own while the body stays dark. Adding it is items.js
work, not preview work: a new `kind`, a battery cost, a spawn table entry, and
a decision about whether the two torches light differently or only look it.

## 8. Open

- **No archery clip.** 24 animations, no bow draw. Needs a hand-keyed pose
  blended against the skeleton, or the bow falls back to `Idle_Gun_Pointing`
  and looks wrong.
- **Art direction.** The Quaternius humans are more smoothly proportioned than
  the Kenney Cube Pets animals and the Kenney retro trees they will stand
  among. Flat shading, a hard key light and posterised colour push them back
  toward the toy register. This wants deciding by eye at both zoom levels
  before the rest is built.
- **The dependency.** No `package.json`, no bundler. Either vendor
  `three.module.js` (~700 KB minified, already an ES module, imports directly)
  or write the skinned-mesh renderer — plausible here because there are no
  textures, no shadows and no PBR, so it is a skinning shader, a glTF skin
  parser and an animation sampler.
- **Scale.** A sword slash at 61 px is roughly twenty pixels of arm travel. It
  reads much better at zoom 3. Worth a spike before committing to the rest.

## 9. Staging

1. Skinned mesh to an offscreen canvas, composited into the existing depth
   slot. Idle only. This is where the risk is.
2. Clip mapping and blending (§7).
3. Bone attachment for the held item (§6); delete `drawHeldItem`'s constants
   and `heldBehind`.
4. Per-slot armour materials (§5); delete `armourTint`'s best-piece logic and
   the silhouette pass.
5. Character creation screen (§4), from the `tools/character-preview.html`
   prototype.
6. Baked sprite fallback for a failed WebGL context.

Steps 3 and 4 are deletion of workarounds that exist only because the character
is a flat image.
