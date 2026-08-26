// The hall terminal's shell. Pure: a disk that is a plain object, a command
// table, and one line at a time. No canvas, no world, no three.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../src/unix.js';

const shell = () => U.newShell(() => '09:30');
const run = (env, line) => U.runShell(line, env);
const out = (env, line) => run(env, line).text;

test('resolvePath handles absolute, relative, dot, dotdot and tilde', () => {
  assert.deepEqual(U.resolvePath('/etc/hosts'), ['etc', 'hosts']);
  assert.deepEqual(U.resolvePath('hosts', ['etc']), ['etc', 'hosts']);
  assert.deepEqual(U.resolvePath('./hosts', ['etc']), ['etc', 'hosts']);
  assert.deepEqual(U.resolvePath('../var', ['etc', 'sub']), ['etc', 'var']);
  assert.deepEqual(U.resolvePath('~', []), ['home', 'guest']);
  assert.deepEqual(U.resolvePath('~/notes', []), ['home', 'guest', 'notes']);
  assert.deepEqual(U.resolvePath('', ['a', 'b']), ['a', 'b']);
});

test('dotdot at the root stays at the root', () => {
  assert.deepEqual(U.resolvePath('../../..', []), []);
  assert.deepEqual(U.resolvePath('/../etc', []), ['etc']);
});

test('the shell starts in the guest home', () => {
  assert.equal(out(shell(), 'pwd'), '/home/guest');
});

test('ls marks directories with a slash', () => {
  const listing = out(shell(), 'ls /').split(/\s+/);
  assert.ok(listing.includes('etc/'), 'etc is a directory');
  assert.ok(listing.includes('hall/'));
  assert.ok(!listing.includes('etc'), 'and is not also listed bare');
});

test('cd changes the prompt and the working directory', () => {
  const env = shell();
  assert.equal(run(env, 'cd /hall').ok, true);
  assert.equal(out(env, 'pwd'), '/hall');
  assert.deepEqual(env.cwd, ['hall']);
});

test('cd into a file is refused, and leaves you where you were', () => {
  const env = shell();
  const r = run(env, 'cd /etc/motd');
  assert.equal(r.ok, false);
  assert.match(r.text, /not a directory/);
  assert.deepEqual(env.cwd, ['home', 'guest'], 'a failed cd does not move you');
});

test('cat reads a file and refuses a directory', () => {
  const env = shell();
  assert.match(out(env, 'cat /etc/hostname'), /ncds-hal-01/);
  assert.match(run(env, 'cat /etc').text, /is a directory/);
  assert.match(run(env, 'cat /nope').text, /no such file/);
});

test('pipes carry stdin from stage to stage', () => {
  const env = shell();
  const lines = out(env, 'cat /var/log/bms.log | grep CRAC4').split('\n');
  assert.ok(lines.length >= 3);
  assert.ok(lines.every(l => /CRAC4/.test(l)));

  // and a three-stage pipe reduces to one line of counts
  const counted = out(env, 'cat /var/log/bms.log | grep CRAC4 | wc');
  assert.match(counted, /^\s*\d+\s+\d+\s+\d+$/);
});

test('grep is case insensitive and reports a bad expression', () => {
  const env = shell();
  assert.ok(out(env, 'cat /etc/hosts | grep GATEWAY').length > 0);
  assert.match(run(env, 'cat /etc/hosts | grep [').text, /bad expression/);
});

test('head and tail take a count', () => {
  const env = shell();
  assert.equal(out(env, 'cat /etc/motd | head -2').split('\n').length, 2);
  assert.equal(out(env, 'cat /etc/motd | tail -1').split('\n').length, 1);
});

test('redirect writes a file, and the file reads back', () => {
  const env = shell();
  assert.equal(out(env, 'echo hello > note'), '', 'a redirect prints nothing');
  assert.equal(out(env, 'cat note'), 'hello');
  assert.equal(out(env, 'cat /home/guest/note'), 'hello', 'written relative to cwd');
});

test('redirect at the end of a pipe captures the last stage only', () => {
  const env = shell();
  run(env, 'cat /var/log/bms.log | grep CRAC4 > faults');
  const saved = out(env, 'cat faults').split('\n');
  assert.ok(saved.every(l => /CRAC4/.test(l)));
});

test('an unknown command is an error, not a throw', () => {
  const r = run(shell(), 'sudo');
  assert.equal(r.ok, false);
  assert.match(r.text, /not found/);
});

test('a blank line and a comment do nothing', () => {
  assert.deepEqual(run(shell(), '   '), { ok: true, text: '' });
  assert.deepEqual(run(shell(), '# a note'), { ok: true, text: '' });
});

test('quoted arguments survive the tokeniser', () => {
  assert.equal(out(shell(), 'echo "two  words"'), 'two  words');
});

test('man reads the page off the disk rather than out of the binary', () => {
  const env = shell();
  assert.match(out(env, 'man grep'), /regular expression/);
  assert.match(run(env, 'man nosuchthing').text, /no manual entry/);
  // the pages really are files
  assert.match(out(env, 'cat /usr/man/grep'), /regular expression/);
});

test('mkdir, cp, mv and rm move files around the disk', () => {
  const env = shell();
  run(env, 'mkdir scratch');
  assert.match(out(env, 'ls'), /scratch\//);

  run(env, 'echo one > a');
  run(env, 'cp a scratch/b');
  assert.equal(out(env, 'cat scratch/b'), 'one');

  run(env, 'mv a scratch/c');
  assert.match(run(env, 'cat a').text, /no such file/, 'mv removes the original');
  assert.equal(out(env, 'cat scratch/c'), 'one');

  run(env, 'rm scratch/c');
  assert.match(run(env, 'cat scratch/c').text, /no such file/);
  assert.match(run(env, 'rm scratch').text, /is a directory/);
});

test('the clock comes from the world, not from the host', () => {
  let hour = '06:15';
  const env = U.newShell(() => hour);
  assert.match(out(env, 'date'), /06:15/);
  hour = '21:40';
  assert.match(out(env, 'date'), /21:40/);
  assert.match(out(env, 'who'), /21:40/);
});

test('every command in the table has a man page', () => {
  const env = shell();
  const missing = U.COMMAND_NAMES.filter(
    n => !U.isFile(U.lookup(env.root, ['usr', 'man', n])));
  assert.deepEqual(missing, [], 'undocumented commands');
});

test('help lists commands that actually exist', () => {
  const env = shell();
  const named = out(env, 'help')
    .split('\n').slice(0, 5).join(' ')
    .split(/\s+/).filter(Boolean);
  const unknown = named.filter(n => !U.COMMAND_NAMES.includes(n)
                                 && !['clear', 'exit'].includes(n));
  assert.deepEqual(unknown, [], 'help names a command that is not there');
});

test('the disk is a plain object, so it serialises whole', () => {
  const env = shell();
  run(env, 'echo kept > marker');
  const round = JSON.parse(JSON.stringify(env.root));
  assert.equal(U.lookup(round, ['home', 'guest', 'marker']).f, 'kept');
});
