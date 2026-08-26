# Walker — tasks

Running list, kept in this file so nothing gets lost between sessions.

**Numbering.** Every task has a permanent ID. IDs are assigned in the order
tasks arrive, never reused, and never renumbered when something moves to Done —
so `W-07` means the same thing in six months as it does today. Sub-tasks take a
decimal (`W-06.3`). New work takes the next free number at the bottom of
**Open**; the next free number is **W-27**.

## In progress

(nothing at the moment)

## Open

- [ ] **W-26 · Loot and search on the mezzanine.** The offices are set
      dressing: desks, dead screens, cabinets. Searching them — and what they
      hold — is the game layer to come.
- [ ] **W-23 · Four terminals round the hall.** Each datacentre gets at least
      four of the perched screens, spread round the hall. For now they can all
      open the same shell; the placement should go in as a list of mount points
      with a `station` id handed to `createTerminal`, so giving each its own
      disk and host name later is filling in a stub rather than rewiring.
- [ ] **W-19 · Dressing the elevation — REOPENED, rule changed.** Two rounds
      built straight into the world were both rejected on sight: a scatter of
      130 kit props, then stair cores, a louvre bank and a loading dock. The
      wall is bare again. **Rule: nothing gets added to the building without a
      mock-up shown and approved first.**
- [ ] **W-22 · The skirt does not look like the terrain it extends.** The coarse
      ring beyond 146 m reads as a different place: darker, and its grass tiles
      at a visibly different density, so the join is a hard diagonal seam. Two
      causes. One texture is shared across all four strips, so a single
      `repeat` value lands on strips of very different dimensions and the tiling
      stretches. And the inner ground is a world-space colour canvas multiplied
      by grass as *brightness only* at `DETAIL_TILE` 6 m, while the skirt is a
      flat colour times the grass itself. The skirt should borrow the same
      treatment: per-strip repeat in world units at 6 m, and a base colour taken
      from the canvas rather than guessed.
- [ ] **W-18 · Extract more of the page into testable modules.** Collision
      radii, the step-over rule, the trail walker and the clip-speed maths all
      live inside `world-preview.html` and can only be guarded by reading the
      source. The first two have gone wrong more than once and are worth pulling
      out properly.
- [ ] **W-10 · A laptop for Walker to find.** At some point he picks one up, and
      the nostos mechanics come across with it: `unix.js` proper (pipes,
      redirect, `ed`/`pico`, man pages), the workspace, and a machine that is
      *his* rather than bolted to a floor. The hall terminal (W-06) is
      deliberately the smaller, fixed version of this — same console model
      underneath, so the laptop is an extension and not a rewrite.
- [ ] **W-11 · No climb or step-up clip** exists in either the 13-clip glb or
      the 24-clip source, so small hills are stepped over rather than climbed.
- [ ] **W-12 · Only the male Adventurer is converted.**
- [ ] **W-13 · three.js is still 768 KB at runtime.**
- [ ] **W-14 · `character-preview.html` cannot run from the published site.**

## Asset notes

**Modular SciFi MegaKit (Standard)** — `_tmp/`, CC0, Quaternius, same source as
the nature pack already in the repo. 190 glTF models on a 4 m module grid.
Worth pulling into the hall, in this order:

| Piece | Size m | Tris | For |
|---|---|---|---|
| `Prop_AccessPoint` | 0.44 × 0.47 × 1.3 | 738 | the terminal (W-06.5) |
| `Door_Metal` + `Door_Frame_Square` | 2.11 × 4.05 / 4.85 × 5.01 | 16 / 280 | doors that open (W-08) |
| `Column_Large_Straight` | 1.4 × 10 × 1.96 | 924 | the 17 m hall has no columns |
| `Decal_0`–`9`, `_A` `_K` `_V` `_X` `_Z`, `Decal_Line_Straight` | — | 2 each | row labels painted on the floor, matching `hall/inventory` in the terminal |
| `Prop_Vent_Big` / `_Wide` | 2 × 0.07 × 1 | 328 / 208 | cold-aisle floor grilles |
| `Prop_Fan_Small` | 1.68 × 0.44 × 1.68 | 434 | CRAC units — CRAC 4 has a bearing fault in the log |
| `Prop_Rail_2/3/4` | up to 0.07 × 0.86 × 3.93 | 920 | aisle containment |
| `Prop_Computer` | 0.74 × 1.59 × 0.56 | 519 | a second workstation |

Skip the Aliens (wrong game) and most of the 84 Walls (a 4 m corridor kit; the
hall shell is 168 m and already built).

Import caveat: the kit shares four 2048² trim atlases and one model can pull ten
images (`Column_Large_Straight` does). They need downsizing on the way in, the
same as `tools/import-nature.py` does for the nature pack, and only the files
actually loaded get copied out of `_tmp/`.

## Done

- [x] **W-24** 2026-08-26 **The mezzanine.** An office floor over the east end
      of the hall at 6 m, reached by a straight sixteen-step flight. See-through
      at 13 per cent from below (the camera looks down through it at the racks)
      and resolving to solid as you climb — driven by height, so it fades in on
      the stairs rather than popping. Green resin walking surface. Three stub
      offices: partitions, workstation desks with dead screens, chairs,
      cabinets. Under it, the movement grew a second floor: `groundY` takes a
      reference height and offers the deck and the stair ramp only when
      stepping onto them is a step; blockers gained a `bottom` gate so rails
      and desks at deck height do not wall off the aisles beneath; and walking
      off an edge past 1.5 m converts to a fall rather than snapping down.
      Beams block at all heights, like the posts in a real hall.
- [x] **W-25** 2026-08-26 **The OS is a flavour.** `unix.js` is pure machinery;
      everything site-specific — host, user, greeting, disk — lives in
      `src/os-ncds.js`, and `newShell` refuses to start without a flavour. A
      second datacentre running a different OS is a second flavour file.
- [x] **W-26 → renumbered, see Open. W-25b** 2026-08-26 **The datacentre is a
      spec.** `DC_SPEC` gathers footprint, height, wall colour, sign text, rack
      grouping, mezzanine flag and terminal OS; `buildDatacentre(spec)` reads
      only the spec. The world still holds one instance — extracting the
      builder to a module for true multiples is part of W-18.

- [x] **W-06** 2026-08-26 **Terminal access point.** A 2.3 m screen bolted to
      the rack row nearest the door, white on black at 56 × 20 so it reads as a
      terminal from across the aisle, with a conduit dropping to the floor.
      Walk up → `E ACCESS TERMINAL` → the same canvas opens full-screen; ESC or
      `exit` steps away, movement freezes while it is up, and every key
      (including ^C/^U/^L and Tab completion) goes to the shell. Behind it:
      `console-buffer.js` (nostos, unchanged), `unix.js` (the laptop's
      architecture, Neocloud's content — pipes, redirect, man pages on the
      disk, logs with CRAC 4's bearing fault open), `terminal.js` (the glue and
      the picture). The canvas uploads to the GPU only when something changed.
      MOTD and man pages hand-wrapped to 56 columns.
      Two placement bugs on the way: the reach test compared a 3D distance
      whose Y was plinth-local against a world-height position, so it never
      passed; and the first mount was a free-standing console that read as
      furniture.

- [x] **W-08b** 2026-08-26 **The door glitch, properly.** Not z-fighting.
      `shadowMap.autoUpdate` is off, so the map is baked on demand — and the
      doors are the only thing outside that moves every frame, so their shadows
      stayed where the leaves had been and the panels slid out from under them.
      The leaves cast nothing now: they are 12 cm panels against a wall in its
      own shade. Moving them proud of the slab was still right, but it was not
      the bug.

- [x] **W-09** 2026-08-26 **The black apron, and the elevation.** Same cause as
      the wall: `slab.jpg` averages 98 of 255, which is 0.13 linear against the
      0.3 paving actually returns. It passed in open sun and went black under the
      roof's own shadow. One shared `lifted()` helper now does the wall, the
      apron and the kit props. The elevation carries plant — one band of intake
      vents, sparse extract fans, a service run and the uplighters the wall wash
      is meant to come from — instanced, so about 130 pieces cost a handful of
      draw calls. First pass was far too busy; cut to a quarter and desaturated
      to grey, because the kit's red and orange trim reads as a spaceship.
      Door leaf moved proud of the wall face: at +0.12 it sat inside the slab's
      own half-thickness and slid through it, which was the flicker at the door.

- [x] **W-17** 2026-08-26 **Tests.** 48 of them, no dependencies, on Node's own
      runner: `npm test`. `src/console-buffer.js` and `src/unix.js` are pure and
      are tested directly. `world-preview.html` is one file that mostly needs a
      GPU, so `invariants.test.mjs` reads the source and checks the numbers —
      every assertion guards a bug that actually happened (the WCAG flash floor,
      the signed shift in `hash2`, `shadow.bias`, the key-to-fill ratio, the
      indoor sky, `.visible` vs intensity, stamina seconds, the derived door
      width, the rack atlas). A guard whose constant has been renamed **fails**
      rather than passing vacuously. `npm run mutants` puts each of those bugs
      back one at a time and checks the suite notices: 8 of 8 caught.
- [x] **W-16** 2026-08-26 **Shadows and walk speed.** r160 has no
      `shadow.intensity`, so shadow darkness is purely the key-to-fill ratio.
      Key 2.0 → 1.75 and sky floor 0.20 → 0.50 puts a shadow at 58 per cent of
      lit ground instead of 50, and roughly doubles what the world has after
      dark; the lit side moves 4 per cent. Walk pace 1.30 → 1.45, so 4.63 → 5.16
      m/s.

- [x] **W-08** 2026-08-26 **Doors.** Sliding leaves that part on approach were
      already there, built from boxes; they are `Door_Metal` from the MegaKit
      now. The opening was resized to fit the model rather than the model
      stretched to fit the opening — at 8 m wide the leaf had to go 1.9x
      sideways and its panel lines smeared. Scaled to the full 5.2 m height it
      is 2.71 wide, so the bay is 5.42 m and the model is untouched. Materials
      come down to base colour on the same Lambert as the walls, and the glTFs
      were pruned so they stop asking for the normal and ORM maps that are not
      shipped. 252 KB for the pair.

- [x] **W-07** 2026-08-26 **Share card.** Would not preview on Messages or
      WhatsApp: 600 × 315 is below the 1200 × 630 both clients want before they
      stop falling back to a thumbnail, and the RGBA alpha channel made both
      drop the preview outright. Now 1200 × 630 opaque JPEG, 20 KB, with BETA
      tiny at the wordmark's shoulder and "A story by David M. Berry" under the
      rule. Full card tags on both `index.html` and the game page, since the
      cache-busting redirect means either one can be what a crawler parses.
      Generator kept at `tools/share-card.html`.
- [x] **W-15** 2026-08-26 **`tools/dev-server.py`.** Serves the repo and takes
      PUT under `/_put/`, confined to the repo root and checked after path
      resolution. The card, the ground and signage textures and the rack faces
      are all drawn in a browser, and a browser cannot write to disk — the route
      back into the repo was copying base64 out of the console by hand. Now the
      canvas saves itself.
- [x] **W-05** 2026-08-26 **Rack lamps.** Every cabinet was the same cabinet
      lamp for lamp, and a blink was the whole panel tinting light or dark. The
      face is an atlas now, six cabinets by six lamp states; a per-instance cell
      picks one of the thirty-six, layout fixed, frame stepped on the cabinet's
      own timer. Blue and cyan are 79 per cent of lamps, red 2.5. Five lamps in
      eight never blink. Blink floor 620 ms (1.6 Hz), under WCAG 2.3.1's three.
- [x] **W-04** 2026-08-26 **Interior lighting.** Indoors the sun, the sky and
      every yard lamp were switched off, so nothing beyond the door had any
      light on it. The sky now dims to a floor value instead of going out; hall
      fill 0.55 → 1.75, lamps 64 → 128.
- [x] **W-03** 2026-08-26 **Rack bezel** down from 20 cm to 5, which is what a
      rack frame is.
- [x] **W-02** 2026-08-26 **Cache-busting entry page.** Pages sends
      `cache-control: max-age=600` and a real header beats the
      `<meta http-equiv>`, so pushes took ten minutes to show. `index.html`
      redirects to a timestamped URL.
- [x] **W-01** 2026-08-26 **Stamina** drain 19/s → 6.5/s. Fifteen seconds flat
      out, ~170 m.
