# Walker — tasks

Running list, kept in this file so nothing gets lost between sessions.
Newest requests go to the bottom of **Open**. Move a line to **Done** with the
date when it ships.

## In progress

- [ ] **The apron outside the door.** The strip of dark concrete between the
      building and the fence still reads as solid black from inside. The hall
      and the wider landscape are fixed; this one band is not.
- [ ] **Terminal access point.** One rack in the hall gets a screen, and the
      screen runs a simulated terminal. Basis: the laptop terminal from nostos,
      copied in rather than rewritten.

## Open

- [ ] No climb or step-up clip exists in either the 13-clip glb or the 24-clip
      source, so small hills are stepped over rather than climbed.
- [ ] Only the male Adventurer is converted.
- [ ] three.js is still 768 KB at runtime.
- [ ] `character-preview.html` cannot run from the published site.

## Done

- 2026-08-26 Interior lighting. Indoors the sun, the sky and every yard lamp
  were switched off, so nothing beyond the door had any light on it at all. The
  sky now dims to a floor value instead of switching off, and the hall's own
  fill is up: hemisphere 0.55 -> 1.75, lamps 64 -> 128.
- 2026-08-26 Rack faces are an atlas, six cabinets by six lamp states. Every
  cabinet used to be the same cabinet lamp for lamp, and a blink was the whole
  panel tinting light or dark. A per-instance cell picks one of thirty-six, the
  layout half fixed and the frame half stepped on a timer, so a blink moves a
  handful of five-pixel lamps. Blue and cyan are now 79 per cent of lamps and
  red 2.5. Blink floor 620 ms (1.6 Hz), under WCAG 2.3.1's three a second.

- 2026-08-26 Cache-busting entry page. Pages sends `cache-control: max-age=600`
  and a real header beats the `<meta http-equiv>`, so pushes took ten minutes to
  appear. `index.html` now redirects to a timestamped URL.
- 2026-08-26 Stamina drain 19/s → 6.5/s. Fifteen seconds flat out, about 170 m.
- 2026-08-26 Thinner bezel round the rack faces: the panel went from
  1.05 x 2.10 to 1.34 x 2.26 on a 1.45 x 2.35 cabinet.
