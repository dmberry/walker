// NostOS — a postAI Odyssey.
// Copyright (C) 2026 David M. Berry
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later
// version. This program is distributed WITHOUT ANY WARRANTY; see the GNU
// General Public License for details: <https://www.gnu.org/licenses/>.

// THE CHARACTER, POSED AND DRAWN FRESH EVERY FRAME.
//
// The world is painted by a 2D canvas back to front, and the player is one
// sprite in one slot of that order. This does not change any of that. It
// changes where the sprite comes from: instead of picking one of 40 baked PNGs,
// it poses a skeleton, renders it with an orthographic camera at the isometric
// angle into an offscreen WebGL canvas, and hands back that canvas for
// `drawImage` to place exactly where the PNG went.
//
// The painter's algorithm never learns anything happened. An arm crossing the
// torso is sorted by the GPU's depth buffer; the player standing behind a house
// is sorted by the 2D pass, as before.
//
// What it buys, in the order the game will notice: the character turns through
// every angle instead of snapping to eight; a clip can blend into another, so a
// swing interrupts a walk; and the hand is a real bone, which is what lets a
// weapon be held rather than approximated (see docs, and drawHeldItem's five
// tuned constants, which this is meant to retire).
//
// EVERYTHING HERE IS OPTIONAL. If WebGL will not start, if the model will not
// load, if anything throws, `ready()` stays false and the renderer keeps using
// the baked sprites. That path is not a stub — it is the shipping one until
// this proves itself.

import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

// The true 2:1 isometric angle: atan(0.5) above the horizon. The whole world is
// drawn on 64x32 diamonds, so this is not a taste decision.
const ISO_ELEV_DEG = 26.565;

// Render target. Bigger than the character ever appears (about 61 CSS px at the
// close zoom, 115 at the far one) so that zooming in does not soften it, and a
// power of two because some drivers still prefer it.
const TILE = 256;

// How much of the frame the figure fills. Slack at the edges is for clips that
// reach past a standing pose — a sword slash, a death.
const FIT = 0.78;

// Clip names in the pack, mapped to what the game already tracks.
const CLIPS = {
  idle: 'Idle',
  idleNeutral: 'Idle_Neutral',
  idleGun: 'Idle_Gun',
  idleSword: 'Idle_Sword',
  walk: 'Walk',
  run: 'Run',
  runShoot: 'Run_Shoot',
  interact: 'Interact',
  wave: 'Wave',
  death: 'Death',
  hit: 'HitRecieve',
  slash: 'Sword_Slash',
  shoot: 'Gun_Shoot',
};

// Seconds to blend from one clip to the next. Short enough to feel responsive
// on a swing, long enough that a walk does not snap out of an idle.
const FADE = 0.16;

// FEET THAT KEEP UP WITH THE GROUND.
//
// A clip plays at whatever tempo it was animated at, and the game moves the
// player at whatever the terrain allows — 4.2 tiles a second walking, 7.5
// sprinting, times 0.45 in the sea, 0.55 in a stream, 0.75 through foliage, and
// less again under the lotus. Played straight, the walk skates.
//
// So the rate is the speed actually covered divided by the speed the clip was
// drawn for. These are the latter, per clip, in tiles per second. Run's 7.5 is
// the game's own SPRINT_SPEED and needs no correction — David: "running feels
// right" — which is what makes the walk's number a measurement rather than a
// guess: it is the one that had to move.
const CLIP_SPEED = { Walk: 2.6, Run: 7.5, Run_Shoot: 7.5 };

// Beyond this the legs blur and it reads worse than sliding.
const RATE_MIN = 0.35;
const RATE_MAX = 2.6;

let renderer = null;
let scene = null;
let camera = null;
let root = null;
let mixer = null;
let clips = new Map();
let current = null;
let failed = false;
let loading = false;
let radius = 1;
let packNode = null;
const focus = new THREE.Vector3();

// A REAL SHADOW, not a blob. The figure is already posed, so a second pass
// looking straight down at it — everything painted flat black — gives the
// silhouette its limbs actually cast: arms out when running, a blade raised
// mid-swing, legs apart. The ellipse it replaces could not know any of that.
//
// Kept on its own 2D canvas because there is one GL context and the main pass
// wants to stay in it. One 128px copy a frame.
let shadowCam = null;
let shadowCanvas = null;
let shadowCtx = null;
let shadowMat = null;
let shadowTop = 1;
let shadowOn = false;   // the cast silhouette; off by default, see setShadow
const SHADOW_PX = 128;

/** Has a character loaded and is the pipeline usable this frame? */
export function ready() {
  return !!(renderer && root && mixer && !failed);
}

/** Why it is not ready, for the debug readout. Null when it is. */
export function status() {
  if (failed) return 'failed';
  if (loading) return 'loading';
  if (!renderer) return 'not started';
  if (!root) return 'no model';
  return null;
}

/** The offscreen canvas, for the 2D pass to blit from. */
export function surface() {
  return renderer ? renderer.domElement : null;
}

/**
 * Start WebGL and begin loading a character. Safe to call more than once.
 * Never throws: a failure here just means the baked sprites keep being used.
 */
export function start(url) {
  if (renderer || failed) return;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(TILE, TILE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch (err) {
    // No WebGL, a blocked context, a driver that will not allocate. Not an
    // error the player should ever see.
    console.warn('[character3d] no WebGL context; keeping baked sprites', err);
    failed = true;
    renderer = null;
    return;
  }

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  // HIGHER UP, FAINTER. A foot on the ground casts a hard edge; an arm held out
  // at chest height casts a soft, weak one, because the further a thing is from
  // the surface the more the light wraps round it. Flat black gave the arms the
  // same weight as the boots and the silhouette read as a stain.
  //
  // Done by injecting into MeshBasicMaterial rather than writing a shader from
  // scratch, so three's skinning still runs — the height has to be the SKINNED
  // position or the arms fade by where they are in the bind pose, not where the
  // animation put them. Hence the insertion after <skinning_vertex>.
  shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
  shadowMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGroundTop = { value: 1.0 };  // set from the model's own height
    shadowMat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vShadowH;')
      .replace('#include <skinning_vertex>',
               '#include <skinning_vertex>\nvShadowH = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>',
               '#include <common>\nvarying float vShadowH;\nuniform float uGroundTop;')
      // AFTER the chunk, not before it: <opaque_fragment> is where gl_FragColor
      // is assigned, so a line above it writes to something not yet set and is
      // then overwritten. The fade has to be applied to the finished colour.
      .replace('#include <opaque_fragment>',
               '#include <opaque_fragment>\n' +
               'gl_FragColor.a *= clamp(1.0 - vShadowH / max(uGroundTop, 0.001), 0.10, 1.0);');
  };
  shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = SHADOW_PX;
  shadowCtx = shadowCanvas.getContext('2d');

  // Flat, hard and slightly warm from one side. The models carry no textures —
  // every surface is one colour — so the light is doing all of the shaping, and
  // a soft three-point setup turns them to mush at 60 pixels.
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.0);
  key.position.set(1.2, 2, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0e8, 0.42);
  rim.position.set(-1.3, 0.9, -1.1);
  scene.add(rim);

  loading = true;
  new GLTFLoader().load(url, (gltf) => {
    root = gltf.scene;
    scene.add(root);
    mixer = new THREE.AnimationMixer(root);
    for (const c of gltf.animations) clips.set(c.name, c);
    // THE PACK IS ITS OWN NODE, and the model says so: the parts arrive named
    // Adventurer_Body / _Feet / _Head / _Legs and Backpack, so this is a name
    // match rather than a guess at which lump of geometry sits behind the
    // shoulders. Off until the game says otherwise — you wash ashore with
    // nothing, and the pack is a thing you find.
    root.traverse((c) => { if (/^backpack/i.test(c.name || '')) packNode = c; });
    setBackpack(false);
    frameModel();
    play(CLIPS.idle, 0);
    loading = false;
  }, undefined, (err) => {
    console.warn('[character3d] model failed to load; keeping baked sprites', err);
    failed = true;
    loading = false;
  });
}

// ONE FRAMING, TAKEN ONCE. A SkinnedMesh reports the box of its UNPOSED
// geometry, so there is nothing to gain by sampling clips, and measuring per
// frame would make the character breathe in and out as its limbs move.
function frameModel() {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((c) => {
    if (!c.isMesh || !c.visible) return;
    c.geometry.computeBoundingBox();
    box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
  });
  const size = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(focus);
  radius = Math.max(size.y, size.x, 0.001) / 2 / FIT;
  // The fade runs from the ground to the crown, so it is the same shape on any
  // model rather than a number tuned to this one.
  shadowTop = Math.max(size.y, 0.001);
  const sh = shadowMat && shadowMat.userData.shader;
  if (sh) sh.uniforms.uGroundTop.value = shadowTop;
}

/** Switch clips, blending rather than cutting. Same clip twice is a no-op. */
export function play(name, fade = FADE) {
  if (!mixer) return;
  const clip = clips.get(name);
  if (!clip) return;
  if (current && current.getClip() === clip) return;
  const next = mixer.clipAction(clip);
  next.reset();
  next.setLoop(THREE.LoopRepeat, Infinity);
  next.enabled = true;
  if (current && fade > 0) {
    next.setEffectiveWeight(1);
    current.crossFadeTo(next, fade, false);
  } else {
    if (current) current.stop();
    next.setEffectiveWeight(1);
  }
  next.play();
  current = next;
}

/**
 * Show or hide the backpack.
 *
 * Called with the game's own state each frame, so finding one puts it on and
 * dying with it takes it off without anything here tracking a copy.
 */
export function setBackpack(on) {
  if (packNode) packNode.visible = !!on;
}

/** Does the loaded model have a separable pack at all? */
export function hasBackpack() {
  return !!packNode;
}

/** Is this clip name in the loaded model? */
export function hasClip(name) {
  return clips.has(name);
}

export { CLIPS };

/**
 * Advance the animation and redraw the offscreen canvas.
 *
 * `facing` is the player's world-space direction. The camera never moves — the
 * world is isometric and the view is fixed — so it is the MODEL that turns,
 * which is the whole reason this can be continuous where eight baked
 * directions could not be.
 */
export function update(dt, facing, groundSpeed = null) {
  if (!ready()) return;
  if (current) {
    const ref = CLIP_SPEED[current.getClip().name];
    current.setEffectiveTimeScale(
      ref && groundSpeed != null
        ? Math.min(RATE_MAX, Math.max(RATE_MIN, groundSpeed / ref))
        : 1
    );
  }
  mixer.update(dt);
  root.rotation.y = modelYaw(facing);

  // SHADOW FIRST, while the GL canvas is free. Skipped unless something asks
  // for it — a whole extra render pass a frame for a shape that reads as noise
  // at sixty pixels is not worth spending, and the renderer draws a soft
  // ellipse instead.
  if (shadowOn) drawShadowPass();

  aim();
  renderer.render(scene, camera);
  if (!footMeasured) measureFoot();
}

/**
 * The cast silhouette: a real shadow, the shape the limbs actually make.
 *
 * Kept because it is right, and off because it is not better. At the size the
 * character appears the outline breaks up and reads as a smudge rather than as
 * a body, and a plain soft ellipse grounds him more convincingly. Turn it on
 * with setShadow(true) if the camera ever gets close enough to want it.
 */
function drawShadowPass() {
  // Straight down, flat black, no lights involved: it is a silhouette, and
  // lighting it would only muddy the edge. Copied out to 2D before the main
  // pass overwrites the context.
  const half = radius;
  shadowCam.position.set(focus.x, focus.y + half * 4, focus.z);
  shadowCam.up.set(0, 0, -1);
  shadowCam.lookAt(focus.x, focus.y, focus.z);
  shadowCam.left = -half; shadowCam.right = half;
  shadowCam.top = half; shadowCam.bottom = -half;
  shadowCam.near = 0.01; shadowCam.far = half * 8;
  shadowCam.updateProjectionMatrix();
  scene.overrideMaterial = shadowMat;
  renderer.setSize(SHADOW_PX, SHADOW_PX, false);
  renderer.render(scene, shadowCam);
  // onBeforeCompile does not run until the first render, which is after the
  // model was measured — so the height lands on the second frame, not the first.
  const compiled = shadowMat.userData.shader;
  if (compiled) compiled.uniforms.uGroundTop.value = shadowTop;
  shadowCtx.clearRect(0, 0, SHADOW_PX, SHADOW_PX);
  shadowCtx.drawImage(renderer.domElement, 0, 0, SHADOW_PX, SHADOW_PX);
  scene.overrideMaterial = null;
  renderer.setSize(TILE, TILE, false);
}

/** Turn the cast silhouette on or off. Off means the pass never runs. */
export function setShadow(on) {
  shadowOn = !!on;
}

/** Is the cast silhouette being rendered? */
export function shadowActive() {
  return shadowOn;
}

/** Did the shadow's height fade actually compile? For diagnosis only. */
export function shadowDebug() {
  const sh = shadowMat && shadowMat.userData.shader;
  if (!sh) return 'onBeforeCompile has not run';
  return {
    hasVarying: sh.fragmentShader.includes('vShadowH'),
    fadeAfterChunk: /#include <opaque_fragment>\s*\n\s*gl_FragColor\.a \*=/.test(sh.fragmentShader),
    groundTop: sh.uniforms.uGroundTop && sh.uniforms.uGroundTop.value,
  };
}

/** The top-down silhouette, for the 2D pass to lay on the ground. */
export function shadowSurface() {
  return shadowCanvas;
}

export const SHADOW_TILE_PX = SHADOW_PX;

/**
 * World facing -> model rotation about Y.
 *
 * A world step of (fx, fy) moves ((fx - fy) * 32, (fx + fy) * 16) on screen, so
 * world (1, 1) is straight down the screen, and rotation 0 is already south.
 *
 * THE MODEL FACES +Z, NOT -Z, which is the whole of the sign. The camera sits
 * at +Z looking back at the figure, and at rotation 0 you see its front — so
 * its forward axis points AT the camera rather than away. R_y(t) then sends
 * that forward to (sin t, 0, cos t), and screen-right is +X, so east is +90.
 * Assuming -Z gives every angle mirrored about the vertical, which is what it
 * did in play. Compare against a baked sprite before changing this: they are
 * the same directions and the PNGs are the older, settled answer.
 */
export function modelYaw(facing) {
  const fx = (facing && facing.x) || 0;
  const fy = (facing && facing.y) || 0;
  if (!fx && !fy) return 0;
  const sx = fx - fy;          // screen right
  const sy = (fx + fy) * 0.5;  // screen down, halved by the 2:1 diamond
  return Math.atan2(sx, sy);
}

function aim() {
  const e = THREE.MathUtils.degToRad(ISO_ELEV_DEG);
  const d = Math.max(radius * 4, 10);
  camera.position.set(focus.x, focus.y + Math.sin(e) * d, focus.z + Math.cos(e) * d);
  camera.up.set(0, 1, 0);
  camera.lookAt(focus);
  camera.left = -radius;
  camera.right = radius;
  camera.top = radius;
  camera.bottom = -radius;
  camera.near = 0.01;
  camera.far = d + radius * 2;
  camera.updateProjectionMatrix();
}

/**
 * Where the character's feet sit inside the rendered tile, as a fraction of it.
 *
 * MEASURED, NOT DERIVED. It can be worked out from FIT and the model's box, and
 * that answer is close but not right — the framing is taken from the bind pose
 * with the arms out, so the figure does not sit where the arithmetic says, and
 * the shadow ends up a few pixels off the boots. Reading the rendered alpha for
 * the lowest lit row is the thing itself rather than a prediction of it.
 *
 * Taken once, from the idle pose, because a running frame lifts a foot.
 */
let footFrac = 0.5 + (FIT / 2) * (1 - 0.06);   // until the first measurement
let footMeasured = false;

export function footFraction() {
  return footFrac;
}

function measureFoot() {
  const gl = renderer.getContext();
  const w = TILE, h = TILE;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  // readPixels is bottom-up, so row 0 is the bottom of the image.
  for (let row = 0; row < h; row++) {
    let lit = 0;
    for (let col = 0; col < w; col++) if (px[(row * w + col) * 4 + 3] > 16) lit++;
    if (lit >= 2) {                       // two pixels, so one stray sample is not a floor
      footFrac = 1 - row / h;
      footMeasured = true;
      return;
    }
  }
}

export const TILE_PX = TILE;
