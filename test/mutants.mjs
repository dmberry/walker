// Does the suite actually catch anything?
//
// A test that passes no matter what is worse than no test, because it reads as
// cover. This puts each bug we have already had back into the source one at a
// time, runs the invariants suite, and reports whether it noticed. Nothing is
// written permanently: the file is restored on the way out, including if a run
// throws.
//
//     node test/mutants.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GAME = new URL('../tools/world-preview.html', import.meta.url);
const original = readFileSync(GAME, 'utf8');

// Each entry is a real regression, described the way it actually presented.
const MUTANTS = [
  ['lamps blink at 5 Hz',            'ledPeriod[i] = r < 0.16 ? 620', 'ledPeriod[i] = r < 0.16 ? 200'],
  ['signed shift in hash2',          'n = (n ^ (n >>> 13))',          'n = (n ^ (n >> 13))'],
  ['shadow bias slides shadows',     'key.shadow.bias = 0;',          'key.shadow.bias = -0.0012;'],
  ['sky switched off indoors',       'hemi.visible = true;',          'hemi.visible = !indoors;'],
  ['stamina empties in five seconds','const STA_DRAIN = 6.5',         'const STA_DRAIN = 19'],
  ['key up, fill down',              'key.intensity = 1.75',          'key.intensity = 3.4'],
  ['every cabinet identical',        'const LAYOUTS = 6;',            'const LAYOUTS = 1;'],
  ['door width set by hand',         'const DOOR_W = 2 * DOOR_LEAF[0] * DOOR_SCALE;', 'const DOOR_W = 8;'],
];

let caught = 0, skipped = 0;
try {
  for (const [name, from, to] of MUTANTS) {
    if (original.split(from).length - 1 !== 1) {
      console.log(`  SKIP    ${name}  (anchor is not unique; the mutant is stale)`);
      skipped++;
      continue;
    }
    writeFileSync(GAME, original.replace(from, to));
    let noticed = false;
    try {
      execFileSync('node', ['--test', 'test/invariants.test.mjs'], { stdio: 'pipe' });
    } catch {
      noticed = true;                       // a non-zero exit means the suite failed
    }
    caught += noticed;
    console.log(`  ${noticed ? 'caught ' : 'MISSED '} ${name}`);
  }
} finally {
  writeFileSync(GAME, original);            // put it back whatever happened
}

const missed = MUTANTS.length - caught - skipped;
console.log(`\n${caught}/${MUTANTS.length} caught, ${skipped} skipped, ${missed} missed`);
process.exit(missed ? 1 : 0);
