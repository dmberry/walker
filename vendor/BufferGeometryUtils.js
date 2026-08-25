// A SHIM, NOT THE REAL MODULE.
//
// GLTFLoader statically imports `toTrianglesDrawMode` so that it can convert
// triangle strips and fans into plain triangles. Every mesh this game loads is
// already TrianglesDrawMode (mode 4) — the Quaternius packs export nothing
// else — so pulling in the full BufferGeometryUtils for a branch that never
// runs would be 100 KB of dead weight.
//
// It throws rather than returning something wrong if a strip or fan ever does
// turn up: a silent bad conversion would be far harder to trace than a stop.

const TrianglesDrawMode = 0;
const TriangleStripDrawMode = 1;
const TriangleFanDrawMode = 2;

export function toTrianglesDrawMode(geometry, drawMode) {
  if (drawMode === TrianglesDrawMode) return geometry;
  const name = drawMode === TriangleStripDrawMode ? 'TriangleStrip'
    : drawMode === TriangleFanDrawMode ? 'TriangleFan' : String(drawMode);
  throw new Error(
    `vendor/BufferGeometryUtils.js is a shim and only handles TrianglesDrawMode; ` +
    `this geometry is ${name}. Vendor the real module from three/examples/jsm/utils/.`
  );
}
