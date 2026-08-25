// NostOS — a postAI Odyssey.
// Copyright (C) 2026 David M. Berry
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later
// version. This program is distributed WITHOUT ANY WARRANTY; see the GNU
// General Public License for details: <https://www.gnu.org/licenses/>.

// .gltf -> .glb, keeping only the animation clips the game asks for.
//
// The source packs ship .gltf with the whole binary buffer inlined as a base64
// data URI, which costs a third again in size and has to be decoded at load.
// GLB is the same data in a binary container. Dropping clips is the bigger
// saving: the packs carry 24 animations each and the game uses nine, and the
// unused keyframes are most of the buffer.
//
// Repacking is the point — it is not enough to delete the animation entries,
// because their keyframes stay in the buffer. This walks what is still
// referenced after the cut, copies only those byte ranges into a fresh buffer,
// and renumbers everything that pointed at them.
//
//   node tools/gltf2glb.mjs <in.gltf> <out.glb> [clip,clip,...]
//
// With no clip list, every animation is kept.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath, clipArg] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node tools/gltf2glb.mjs <in.gltf> <out.glb> [clip,clip,...]');
  process.exit(1);
}
const keepClips = clipArg ? new Set(clipArg.split(',').map((s) => s.trim())) : null;

const g = JSON.parse(readFileSync(inPath, 'utf8'));
if (!g.buffers || g.buffers.length !== 1) {
  console.error('expected exactly one buffer; got', g.buffers && g.buffers.length);
  process.exit(1);
}
const uri = g.buffers[0].uri || '';
const m = /^data:.*?;base64,/.exec(uri);
if (!m) { console.error('buffer is not an embedded base64 data URI'); process.exit(1); }
const srcBuf = Buffer.from(uri.slice(m[0].length), 'base64');

// ---- cut the clips we do not want ----------------------------------------
const beforeClips = (g.animations || []).length;
if (keepClips) {
  const missing = [...keepClips].filter((n) => !(g.animations || []).some((a) => a.name === n));
  if (missing.length) console.warn('warning: no such clip:', missing.join(', '));
  g.animations = (g.animations || []).filter((a) => keepClips.has(a.name));
}

// ---- find every accessor still referenced --------------------------------
const liveAcc = new Set();
for (const mesh of g.meshes || []) {
  for (const p of mesh.primitives || []) {
    for (const k of Object.keys(p.attributes || {})) liveAcc.add(p.attributes[k]);
    if (p.indices !== undefined) liveAcc.add(p.indices);
    for (const t of p.targets || []) for (const k of Object.keys(t)) liveAcc.add(t[k]);
  }
}
for (const s of g.skins || []) if (s.inverseBindMatrices !== undefined) liveAcc.add(s.inverseBindMatrices);
for (const a of g.animations || []) {
  for (const s of a.samplers || []) { liveAcc.add(s.input); liveAcc.add(s.output); }
}

// ---- and every bufferView those accessors need ---------------------------
const liveView = new Set();
for (const i of liveAcc) {
  const acc = g.accessors[i];
  if (acc && acc.bufferView !== undefined) liveView.add(acc.bufferView);
  if (acc && acc.sparse) {
    liveView.add(acc.sparse.indices.bufferView);
    liveView.add(acc.sparse.values.bufferView);
  }
}
for (const img of g.images || []) if (img.bufferView !== undefined) liveView.add(img.bufferView);

// ---- copy those ranges into a fresh buffer, 4-byte aligned ---------------
const viewMap = new Map();
const chunks = [];
let offset = 0;
const oldViews = g.bufferViews || [];
for (let i = 0; i < oldViews.length; i++) {
  if (!liveView.has(i)) continue;
  const v = oldViews[i];
  const start = v.byteOffset || 0;
  const slice = srcBuf.subarray(start, start + v.byteLength);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  viewMap.set(i, { index: viewMap.size, byteOffset: offset });
  chunks.push(slice);
  offset += slice.length;
}
const binBuf = Buffer.concat(chunks);

g.bufferViews = [];
for (const [oldIdx, info] of [...viewMap.entries()].sort((a, b) => a[1].index - b[1].index)) {
  const v = oldViews[oldIdx];
  const nv = { buffer: 0, byteOffset: info.byteOffset, byteLength: v.byteLength };
  if (v.byteStride !== undefined) nv.byteStride = v.byteStride;
  if (v.target !== undefined) nv.target = v.target;
  g.bufferViews.push(nv);
}
const remap = (i) => (viewMap.has(i) ? viewMap.get(i).index : undefined);
for (const acc of g.accessors || []) {
  if (acc.bufferView !== undefined) acc.bufferView = remap(acc.bufferView);
  if (acc.sparse) {
    acc.sparse.indices.bufferView = remap(acc.sparse.indices.bufferView);
    acc.sparse.values.bufferView = remap(acc.sparse.values.bufferView);
  }
}
for (const img of g.images || []) {
  if (img.bufferView !== undefined) img.bufferView = remap(img.bufferView);
}
g.buffers = [{ byteLength: binBuf.length }];

// ---- write the GLB container ---------------------------------------------
const pad4 = (b, fill) => {
  const n = (4 - (b.length % 4)) % 4;
  return n ? Buffer.concat([b, Buffer.alloc(n, fill)]) : b;
};
const jsonChunk = pad4(Buffer.from(JSON.stringify(g), 'utf8'), 0x20); // spaces
const binChunk = pad4(binBuf, 0x00);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);                                  // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(jsonChunk.length, 0);
jsonHead.writeUInt32LE(0x4e4f534a, 4);                                // 'JSON'

const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(binChunk.length, 0);
binHead.writeUInt32LE(0x004e4942, 4);                                 // 'BIN'

writeFileSync(outPath, Buffer.concat([header, jsonHead, jsonChunk, binHead, binChunk]));

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(
  `${inPath.split('/').pop()} -> ${outPath.split('/').pop()}\n` +
  `  source file   ${kb(readFileSync(inPath).length)}\n` +
  `  buffer        ${kb(srcBuf.length)} -> ${kb(binBuf.length)}\n` +
  `  bufferViews   ${oldViews.length} -> ${g.bufferViews.length}\n` +
  `  animations    ${beforeClips} -> ${(g.animations || []).length}\n` +
  `  written       ${kb(readFileSync(outPath).length)}`
);
