// The game is one file and most of it needs a GPU, so it cannot be unit tested
// the way the shell can. What CAN be tested is the set of numbers we have
// already been bitten by, read straight out of the source.
//
// Every one of these guards a bug that actually happened. If a constant moves
// for a good reason, the test moves with it — but it moves deliberately, which
// is the point. A test that cannot find its constant FAILS rather than passes
// vacuously, so renaming something does not silently drop the guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const GAME = readFileSync(new URL('../tools/world-preview.html', import.meta.url), 'utf8');
const TERM = readFileSync(new URL('../src/terminal.js', import.meta.url), 'utf8');

/** Pull one capture out of the source, failing loudly if the shape has moved. */
function grab(src, re, what) {
  const m = src.match(re);
  assert.ok(m, `could not find ${what} — it was renamed or removed, so its guard is gone`);
  return m;
}
const num = (src, re, what) => Number(grab(src, re, what)[1]);

// ---- does it even parse ------------------------------------------------------

test('the game module parses', () => {
  // The cheapest test here and the one that earns its keep most often: the page
  // is three thousand lines of inline module, and a dropped brace shows up as a
  // blank screen and a "loading..." that never clears. Imports are stripped
  // because Function() is not a module scope; everything else is checked as-is.
  const m = GAME.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, 'no module script in the page');
  const body = m[1].replace(/^import .*$/gm, '');
  assert.doesNotThrow(() => new Function(body));
});

// ---- WCAG 2.3.1: nothing flashes more than three times a second -------------

test('the rack lamps cannot blink faster than three times a second', () => {
  const floor = num(GAME, /ledPeriod\[i\]\s*=\s*r\s*<\s*[\d.]+\s*\?\s*(\d+)/,
                     'the rack blink floor');
  // The draw also multiplies the period by 0.75 at its fastest.
  const fastest = floor * 0.75;
  const hz = 1000 / fastest;
  assert.ok(hz <= 3, `rack lamps blink at up to ${hz.toFixed(2)} Hz, over the 3 Hz limit`);
  assert.ok(hz <= 2.5, `${hz.toFixed(2)} Hz leaves no margin under the 3 Hz limit`);
});

test('the blink jitter multiplier is still the one the floor was worked out for', () => {
  const m = grab(GAME, /ledNext\[i\]\s*=\s*now\s*\+\s*ledPeriod\[i\]\s*\*\s*\(([\d.]+)\s*\+/,
                 'the blink jitter');
  assert.equal(Number(m[1]), 0.75,
    'the fastest-case multiplier changed; rework the Hz sum above');
});

test('the terminal caret is a caret and not a strobe', () => {
  const half = num(TERM, /caretT\s*>\s*([\d.]+)/, 'the caret blink period');
  const hz = 1 / (half * 2);
  assert.ok(hz <= 3, `caret blinks at ${hz.toFixed(2)} Hz`);
});

// ---- the terrain hash -------------------------------------------------------

test('the terrain hash shifts unsigned', () => {
  const fn = grab(GAME, /function hash2\(i, j\) \{[\s\S]*?\n\}/, 'hash2()')[0];
  // The comment above the function explains the bug and therefore contains the
  // very `>>` it warns about, so the comments come out before the code is read.
  const code = fn.replace(/\/\/[^\n]*/g, '');
  assert.ok(!/>>[^>]/.test(code.replace(/>>>/g, '')),
    'hash2 uses a signed >>; the sign bit survives the xor and the hash only '
    + 'spans [0, 0.5], which makes every hill a hole');
  // Three of them: the two hash shifts, and the unsigned cast on the way out.
  assert.ok((code.match(/>>>/g) || []).length >= 3, 'a shift lost its third chevron');
});

test('the terrain hash actually spans zero to one', () => {
  // Run the real thing rather than trusting the shape of it.
  const src = grab(GAME, /function hash2\(i, j\) \{[\s\S]*?\n\}/, 'hash2()')[0];
  const hash2 = new Function(src + '; return hash2;')();

  let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
  for (let i = -60; i < 60; i++) {
    for (let j = -60; j < 60; j++) {
      const v = hash2(i, j);
      lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; n++;
    }
  }
  assert.ok(lo < 0.02, `hash floor is ${lo.toFixed(3)}`);
  assert.ok(hi > 0.98, `hash ceiling is ${hi.toFixed(3)}`);
  const mean = sum / n;
  assert.ok(Math.abs(mean - 0.5) < 0.02,
    `hash mean is ${mean.toFixed(3)}; at 0.244 the ground only ever dipped`);
});

// ---- shadows ----------------------------------------------------------------

test('the shadow bias is zero, with the offset on normalBias', () => {
  const bias = num(GAME, /key\.shadow\.bias\s*=\s*(-?[\d.]+)/, 'key.shadow.bias');
  assert.equal(bias, 0,
    'shadow.bias is a fraction of the depth range, and the range here is 169 '
    + 'units — a bias of -0.0012 slid short shadows out from under their objects');
  const nb = num(GAME, /key\.shadow\.normalBias\s*=\s*([\d.]+)/, 'key.shadow.normalBias');
  assert.ok(nb > 0 && nb < 0.2, `normalBias ${nb} is outside the useful range`);
});

test('the shadow frustum is wider than the view', () => {
  const span = num(GAME, /const SHADOW_SPAN\s*=\s*(\d+)/, 'SHADOW_SPAN');
  assert.ok(span >= 40,
    'at a narrow span a tree crosses the frustum edge while you watch and its '
    + 'shadow arrives a beat late');
});

test('a shadowed surface keeps at least half the light of a lit one', () => {
  // r160 has no light.shadow.intensity, so shadow darkness IS the ratio between
  // the key and the fill. Read all three curves and check the extremes.
  const keyMul = num(GAME, /key\.intensity\s*=\s*([\d.]+)\s*\*\s*Math\.pow/, 'the key curve');
  const [, hemiFloor, hemiDay] =
    grab(GAME, /hemi\.intensity\s*=\s*indoors\s*\?\s*[\d.]+\s*:\s*([\d.]+)\s*\+\s*day\s*\*\s*([\d.]+)/,
         'the sky curve');
  const [, rimFloor, rimDay] =
    grab(GAME, /rim\.intensity\s*=\s*([\d.]+)\s*\+\s*day\s*\*\s*([\d.]+)/, 'the rim curve');

  for (const day of [1, 0.6, 0.3]) {
    const key = keyMul * Math.pow(day, 0.7) * 0.9;      // 0.9 ~ N.L on the ground
    const fill = (Number(hemiFloor) + day * Number(hemiDay))
               + (Number(rimFloor) + day * Number(rimDay)) * 0.47;
    const ratio = fill / (key + fill);
    assert.ok(ratio >= 0.5,
      `at day=${day} a shadow sits at ${(ratio * 100).toFixed(0)}% of lit ground, `
      + 'which reads as black behind anything as big as the datacentre');
  }
});

test('the sky is dimmed indoors, never switched off', () => {
  assert.match(GAME, /hemi\.visible\s*=\s*true/,
    'with the sun off, the sky off and the roof stripped away, everything '
    + 'beyond the door had no light on it at all');
  const indoor = num(GAME, /hemi\.intensity\s*=\s*indoors\s*\?\s*([\d.]+)/, 'the indoor sky');
  assert.ok(indoor > 0.3, `indoor sky at ${indoor} leaves the world outside black`);
});

test('lights are switched with visible, not with intensity', () => {
  assert.match(GAME, /l\.visible\s*=\s*indoors/,
    'intensity zero is not off: three.js shades every VISIBLE light for every '
    + 'fragment whether it contributes or not');
});

test('a resized texture canvas is disposed before it is re-uploaded', () => {
  // THE BUG UNDER ALL THE OTHERS. siteTex hands back a texture built against an
  // 8x8 placeholder so callers get something synchronously, then resizes the
  // canvas when the image lands. Flagging needsUpdate re-uploads level 0 into
  // storage allocated for the placeholder and leaves the mip chain above it
  // dead — which only shows where a texture minifies hard enough to reach those
  // levels. The apron does: 2.4 m slabs over 198 m is a repeat of 82 by 45, and
  // it rendered pure 0,0,0 at full midday with the sun's shadow disabled, a
  // white base colour and a canvas measuring 186 of 255. The wall was dimmed by
  // the same fault and merely looked like dark concrete, which is what sent the
  // first three attempts off after albedo instead.
  // Scoped to siteTex: the ground detail map has its own onload earlier in the
  // file and matching that one would test nothing.
  const fn = grab(GAME, /const siteTex = [\s\S]*?\n\};/, 'siteTex')[0];
  const onload = grab(fn, /img\.onload = \(\) => \{[\s\S]*?\n  \};/, "siteTex's onload")[0];
  assert.match(onload, /\.dispose\(\)/,
    'the texture must be disposed after the canvas resizes, or its mip chain '
    + 'stays as it was built for the 8x8 placeholder');
  // Comments first, again: the explanation above the fix names needsUpdate
  // several lines before the code reaches it. Third time this has caught me out
  // in this file — hash2's warning about `>>` contained a `>>`, and the texture
  // guard tripped on filenames in prose.
  const code = onload.replace(/\/\/[^\n]*/g, '');
  assert.ok(code.indexOf('dispose()') < code.indexOf('needsUpdate'),
    'dispose has to come before needsUpdate');
});

test('site texture level is set once, at load, and never stacked', () => {
  // Each texture is drawn through a canvas filter at load. Nothing may lift a
  // map a second time in a shader: x2.6 on top of the x1.85 already applied
  // pushed most of the range past 1.0 and everything clipped to flat colour.
  const gains = [...GAME.matchAll(/siteTex\('([^']+)',\s*([\d.]+)/g)]
    .map(m => [m[1], Number(m[2])]);
  assert.ok(gains.length >= 3, 'siteTex calls have moved; this guard is blind');
  for (const [file, gain] of gains) {
    assert.ok(gain >= 1 && gain <= 3, `${file} loads at brightness(${gain})`);
  }
  assert.ok(!/diffuseColor\.rgb = diffuseColor\.rgb \* [\d.]+ \+/.test(GAME),
    'a shader gain is stacked on a texture siteTex has already lifted; it clips');
  assert.ok(!/mix\(vec3\(0\.34, 0\.34, 0\.33\)/.test(GAME),
    'the old blend-toward-grey is back on the wall; it flattens the texture');
});

test('the tiled site textures go through the one loader', () => {
  // slab.jpg used to be built by a near-identical copy of siteTex: two functions
  // to keep in step, and a texture outside the clone family, so a siteClone of
  // it would have come back blank and never repainted.
  //
  // floor.jpg and hazard.jpg are not in scope: the first is composited into a
  // tiled canvas and the second is drawn under sign lettering, so both do want
  // their own loader. What must go through siteTex is anything used as a tiling
  // map with a level to set — which is concrete and slab.
  // Comments name these files while explaining the history, so the comments go
  // first — the same trap as the `>>` in hash2's own warning about `>>`.
  const code = GAME.replace(/^\s*\/\/[^\n]*$/gm, '');
  for (const file of ['concrete.jpg', 'slab.jpg']) {
    const at = code.indexOf(file);
    assert.ok(at >= 0, `${file} is no longer loaded at all`);
    const line = code.slice(code.lastIndexOf('\n', at) + 1, code.indexOf('\n', at));
    assert.match(line, /siteTex\(/, `${file} does not go through siteTex: ${line.trim()}`);
    assert.equal(code.indexOf(file, at + 1), -1, `${file} is loaded in more than one place`);
  }
});

// ---- movement ---------------------------------------------------------------

test('a full stamina bar is a sprint, not a dash', () => {
  const drain = num(GAME, /const STA_DRAIN\s*=\s*([\d.]+)/, 'STA_DRAIN');
  const seconds = 100 / drain;
  assert.ok(seconds >= 12, `${seconds.toFixed(1)}s flat out is not enough to get anywhere`);
  assert.ok(seconds <= 40, `${seconds.toFixed(1)}s flat out makes the bar meaningless`);
});

test('stamina comes back faster than it goes, and resting beats walking', () => {
  const drain = num(GAME, /const STA_DRAIN\s*=\s*([\d.]+)/, 'STA_DRAIN');
  const regen = num(GAME, /STA_REGEN\s*=\s*([\d.]+)/, 'STA_REGEN');
  const rest = num(GAME, /STA_REST\s*=\s*([\d.]+)/, 'STA_REST');
  assert.ok(regen > drain, 'a bar that drains faster than it fills is a bar you never use');
  assert.ok(rest > regen, 'standing still should beat walking');
});

test('walk and run speeds are derived from the measured clips', () => {
  const walkPace = num(GAME, /let walkPace\s*=\s*([\d.]+)/, 'walkPace');
  const runPace = num(GAME, /let runPace\s*=\s*([\d.]+)/, 'runPace');
  const refs = grab(GAME, /REFS\s*=\s*\{\s*Walk:\s*([\d.]+),\s*Run:\s*([\d.]+)/,
                    'the measured clip speeds');
  const walk = Number(refs[1]) * walkPace;
  const run = Number(refs[2]) * runPace;

  assert.ok(walk > 4 && walk < 7, `walking at ${walk.toFixed(2)} m/s`);
  assert.ok(run > walk * 1.6, `running at ${run.toFixed(2)} m/s is barely faster than walking`);
  assert.ok(runPace <= 3.2 && walkPace >= 0.35, 'pace outside the rate-scaling bounds');
});

// ---- the door ---------------------------------------------------------------

test('the doorway is derived from the leaf, so the model is never stretched', () => {
  const leaf = grab(GAME, /const DOOR_LEAF\s*=\s*\[([\d.]+),\s*([\d.]+)\]/, 'DOOR_LEAF');
  const [w, h] = [Number(leaf[1]), Number(leaf[2])];
  assert.match(GAME, /const DOOR_W\s*=\s*2\s*\*\s*DOOR_LEAF\[0\]\s*\*\s*DOOR_SCALE/,
    'DOOR_W must follow the leaf; a hand-set width is how the panel got smeared');

  const doorH = num(GAME, /const DOOR_H\s*=\s*([\d.]+)/, 'DOOR_H');
  const scale = (doorH - 0.12) / h;
  const openW = 2 * w * scale;
  assert.ok(openW > 4, `a ${openW.toFixed(2)} m bay is too narrow for a hall this size`);
  assert.match(GAME, /m\.scale\.setScalar\(DOOR_SCALE\)/, 'the leaf must scale uniformly');
});

test('nothing in the doorway shares a plane with anything else', () => {
  // Three coplanar pairs caused the barcode striping at the door, one per axis,
  // and each was found only after the previous one was fixed. The frame laps the
  // opening rather than butting against it, and the leaves run clear in front.
  const lap = num(GAME, /const DOOR_LAP = ([\d.]+)/, 'DOOR_LAP');
  assert.ok(lap > 0.02,
    'without a lap the jamb\'s inner face and the lintel\'s underside sit exactly '
    + 'on the wall\'s own faces, and the depth buffer cannot separate them');

  assert.match(GAME, /const FRAME_Z = D \/ 2 \+ 0\.34 \+ JAMB_D \/ 2/,
    'the front of the frame must be computed, not guessed at');
  const m = grab(GAME, /leaf\.position\.set\([^,]+,\s*base,\s*FRAME_Z \+ ([\d.]+)\)/,
                 'the leaf standoff');
  assert.ok(Number(m[1]) > 0,
    'the leaf must sit in front of the frame; at any smaller offset it slides '
    + 'through the jamb as it opens');
});

test('the sliding leaves cast no shadow', () => {
  // shadowMap.autoUpdate is off, so anything that moves every frame drags a
  // stale shadow behind it. The doors are the only continuously moving geometry
  // outside, and the displaced shadow was the flicker at the doorway.
  assert.match(GAME, /o\.castShadow = false;/,
    'the door leaves are casting again; their shadow will lag behind them');
  assert.match(GAME, /renderer\.shadowMap\.autoUpdate = false/,
    'if the shadow map updates every frame this guard is moot — and the cost is back');
});

test('the rack blockers hold a standing pose clear of the face', () => {
  // At hd 1.06 the capsule could stand 0.36 m from the face plane, and an idle
  // stance puts the leading foot 0.4 m past the capsule centre — through the
  // plane, which sliced the leg. The face sits 1.05 from the row centre; the
  // blocker must hold the centre a stride's reach beyond that.
  const hd = num(GAME, /hw: \(r\.x1 - r\.x0\) \/ 2, hd: ([\d.]+)/, 'the row blocker depth');
  assert.ok(hd >= 1.4, `row blocker hd ${hd}: feet reach the face plane again`);
});

// ---- the mezzanine ----------------------------------------------------------

test('the second floor is chosen by reference height, never unconditionally', () => {
  // groundY once returned terrain only; the mezzanine adds candidates that are
  // eligible only when stepping onto them from the caller's height is a step.
  // A caller that passes no height must get the old ground answer, or every
  // tree and rock under the deck would be planted six metres up.
  assert.match(GAME, /function groundY\(x, z, refY\)/, 'groundY lost its reference height');
  assert.match(GAME, /refY !== undefined/, 'the no-reference path must fall back to ground');
  assert.match(GAME, /ry <= refY \+ STEP_UP/, 'the ramp must qualify by step height');
});

test('mezzanine blockers are gated below as well as above', () => {
  // Rails and desks live at deck height; without a bottom gate they were
  // invisible walls across the ground-floor aisles beneath them.
  assert.match(GAME, /b\.bottom !== undefined && feetY < b\.bottom\) continue/,
    'blocked() lost the bottom gate');
});

test('walking off an edge falls rather than teleports', () => {
  assert.match(GAME, /pos\.y - gh > 1\.5\) \{ airborne = true/,
    'the drop-to-fall conversion is gone; stepping off the deck snaps 6 m down');
});

// ---- the rack faces ---------------------------------------------------------

test('there is more than one cabinet in the hall', () => {
  const frames = num(GAME, /const FRAMES\s*=\s*(\d+)/, 'FRAMES');
  const layouts = num(GAME, /const LAYOUTS\s*=\s*(\d+)/, 'LAYOUTS');
  assert.ok(layouts >= 4,
    'one baked face meant every cabinet in the room was the same cabinet lamp '
    + 'for lamp, which reads as wallpaper');
  assert.ok(frames >= 4, 'too few lamp states to read as activity');
});

test('a blink moves lamps, not the brightness of the whole panel', () => {
  assert.ok(!/ledMesh\.setColorAt\([^)]*\)[\s\S]{0,200}instanceColor\.needsUpdate\s*=\s*true;\s*\n\s*\}/
    .test(GAME.slice(GAME.indexOf('if (indoors && ledMesh)'))),
    'the per-instance colour is being animated again; that tints the entire '
    + 'cabinet face light or dark, which is not what a rack does');
  assert.match(GAME, /ledFrame\[i \* 2\]\s*=\s*\(ledFrame\[i \* 2\]\s*\+\s*1/,
    'the blink should step the atlas frame');
});
