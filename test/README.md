# Tests

    npm test          # or: node --test 'test/*.test.mjs'

No dependencies and no build. Node's own runner, `node:test`, on Node 18 or
later.

## What is tested, and what is not

`src/` is pure by design — the console model holds text and a caret, the shell
holds a disk and a command table — so it is tested directly and thoroughly.
That purity is the reason those files exist as separate modules at all.

`tools/world-preview.html` is one file and most of it needs a GPU, so it cannot
be unit tested the same way. What `invariants.test.mjs` does instead is read the
source and check the numbers. Every assertion in it guards a bug that actually
happened:

| Guard | The bug it caught |
|---|---|
| rack blink floor, caret rate | flashing faster than WCAG 2.3.1's three per second |
| `hash2` uses `>>>` | a signed shift cleared the sign bit, so the hash spanned [0, 0.5] and every hill came out a hole |
| `shadow.bias === 0` | bias is a fraction of the depth range, and at 169 units −0.0012 slid short shadows out from under their objects |
| shadow-to-lit ratio ≥ 0.5 | r160 has no `shadow.intensity`, so shadow darkness *is* the key-to-fill ratio |
| `hemi.visible = true` | with the sun off, the sky off and the roof stripped away, everything past the door had no light on it |
| lights switched by `.visible` | intensity zero is not off: three.js shades every visible light for every fragment |
| stamina seconds, regen ordering | a bar that emptied in five seconds, and a run/walk limit cycle at the bottom of it |
| `DOOR_W` derived from `DOOR_LEAF` | a hand-set width stretched the door model 1.9× and smeared its panel lines |
| `LAYOUTS >= 4`, frame-stepped blink | one baked face made every cabinet identical, and a blink tinted the whole panel |

A test that cannot find its constant **fails** rather than passing vacuously, so
renaming something does not quietly drop its guard. If a number moves for a good
reason, move the test with it — deliberately.

## What is still untested

Collision, the trail walker, terrain assembly, audio and the animation state
machine all live in the page and would need extracting before they could be
covered. The ones worth pulling out first are the ones that have already gone
wrong more than once: collision radii and the step-over rule.
