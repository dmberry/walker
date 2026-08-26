// Walker.
// Copyright (C) 2026 David M. Berry
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later
// version. This program is distributed WITHOUT ANY WARRANTY; see the GNU
// General Public License for details: <https://www.gnu.org/licenses/>.

// The shell behind the hall's access terminal.
//
// Built on the architecture of the nostos laptop (src/game/unix.js): a
// directory is {d:{name:node}}, a file is {f:'text'}, paths resolve through
// resolvePath/lookup, commands are a table of (args, stdin, env) -> text, and
// one line is a `|` chain with an optional `> file` on the end. That file is
// 2,875 lines and wired into pdfs, books, seals, uucp and eliza, so what comes
// across is the shape and none of the Odyssey.
//
// Scope, deliberately: files are text, directories are maps, the shell is one
// line at a time. No processes, no users, no permissions, no editor. What makes
// it read as a machine is the path filesystem, the man pages on the disk, and
// pipes and redirect that actually work.
//
// This module owns the FILESYSTEM and the SHELL only: no canvas, no world, no
// three.js. The terminal wires it to a screen.

export class ShellError extends Error {}

// ---- filesystem -------------------------------------------------------------
export function dir(children = {}) { return { d: children }; }
export function file(text = '') { return { f: text }; }
export function isDir(n) { return !!(n && n.d); }
export function isFile(n) { return !!(n && typeof n.f === 'string'); }

/** Split a path, resolving `.`, `..` and `~` against a cwd. */
export function resolvePath(path, cwd = []) {
  const raw = String(path == null ? '' : path).trim();
  let parts;
  if (raw === '') parts = [...cwd];
  else if (raw === '~' || raw.startsWith('~/')) parts = ['home', 'guest', ...raw.slice(2).split('/')];
  else if (raw.startsWith('/')) parts = raw.split('/');
  else parts = [...cwd, ...raw.split('/')];
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') { out.pop(); continue; }
    out.push(p);
  }
  return out;
}

export function pathString(parts) { return '/' + parts.join('/'); }

export function lookup(root, parts) {
  let n = root;
  for (const p of parts) {
    if (!isDir(n)) return null;
    n = n.d[p];
    if (n === undefined) return null;
  }
  return n || null;
}

function parentOf(root, parts) {
  if (!parts.length) return null;
  const parent = lookup(root, parts.slice(0, -1));
  if (!isDir(parent)) return null;
  return { parent, name: parts[parts.length - 1] };
}

// ---- the disk ---------------------------------------------------------------
const MAN = {
  ls: 'ls [-l] [path]\n  List a directory. A name ending in / is a directory.\n  -l gives the long form: mode, links, owner, size, date.',
  cd: 'cd [path]\n  Change directory. `cd` alone goes home, `cd ..` goes up.',
  pwd: 'pwd\n  Print the working directory.',
  cat: 'cat <file>\n  Print a file. Pipe it: cat var/log/bms.log | grep CRAC',
  echo: 'echo <text>\n  Print text. Redirect it: echo "seen" > home/guest/notes',
  man: 'man <topic>\n  Read the manual for a command. The pages are in /usr/man.',
  grep: 'grep <pattern> [file]\n  Print matching lines. Reads a pipe if no file is given.\n  The pattern is a regular expression, case insensitive.',
  wc: 'wc [file]\n  Count lines, words and characters. Reads a pipe if no file is given.',
  head: 'head [-n] [file]\n  First lines only, ten by default.',
  tail: 'tail [-n] [file]\n  Last lines only, ten by default.',
  sort: 'sort [file]\n  Sort lines.',
  uniq: 'uniq [file]\n  Drop repeated adjacent lines.',
  mkdir: 'mkdir <dir>\n  Make a directory.',
  rm: 'rm <file>\n  Remove a file. It does not ask.',
  cp: 'cp <a> <b>\n  Copy a file.',
  mv: 'mv <a> <b>\n  Move a file, or rename it.',
  df: 'df\n  Free space, by filesystem.',
  ps: 'ps\n  What this machine is running.',
  who: 'who\n  Sessions on this host.',
  date: 'date\n  Site clock. It reads the hall, not your wrist.',
  uptime: 'uptime\n  How long this machine has been up, and its load.',
  env: 'env\n  The environment.',
  help: 'help\n  The command list. `man <name>` has the detail.',
  exit: 'exit\n  Step away from the terminal. Escape does the same.',
};

const MOTD = [
  'NEOCLOUD DATA SOLUTIONS',
  'Hall 1 floor access terminal.',
  '',
  'This machine reads the building: environment, power, rack inventory,',
  'the maintenance log and the door and camera records. It has no route',
  'to the control plane and no route off site. Anything above the floor',
  'is done from operations.',
  '',
  'Guest sessions are not logged out. Walk away and it stays where you',
  'left it.',
].join('\n');

function makeDisk() {
  const man = {};
  for (const [k, v] of Object.entries(MAN)) man[k] = file(v);

  return dir({
    bin: dir({}),
    etc: dir({
      motd: file(MOTD),
      hostname: file('ncds-hal-01'),
      hosts: file([
        '127.0.0.1        localhost',
        '10.14.0.11       ncds-hal-01   this machine',
        '10.14.0.1        ncds-gw-01    gateway (filtered)',
        '10.14.2.4        ncds-bms-01   building management',
        '10.14.2.9        ncds-cam-01   camera recorder',
        '10.14.9.1        ncds-ops-01   operations (no route from here)',
      ].join('\n')),
      'hall.conf': file([
        'site            NCDS-01',
        'hall            1',
        'rows            18',
        'cabinets        432',
        'populated       288',
        'design_load_kW  1120',
        'current_load_kW  742',
        'cooling         4x CRAC, N+1',
        'utility_feed    dual, A live, B live',
        'generator       1x 1.6MVA, 2140 litres',
      ].join('\n')),
    }),
    usr: dir({ man: dir(man) }),
    var: dir({
      log: dir({
        'bms.log': file([
          '08-24 02:11  CRAC4  vibration above threshold, 4.1 mm/s',
          '08-24 02:11  CRAC4  alarm raised, work order NC-4471',
          '08-24 02:12  CRAC3  brought out of standby',
          '08-25 06:40  HALL1  cold aisle 18.2 C, within band',
          '08-25 13:02  HALL1  hot aisle 31.6 C, within band',
          '08-25 19:55  CRAC4  vibration 4.6 mm/s, rising',
          '08-26 04:18  HALL1  humidity 41 %RH, within band',
          '08-26 09:30  CRAC4  vibration 5.0 mm/s, engineer not attended',
        ].join('\n')),
        'power.log': file([
          '08-24 00:00  FEED A  381 kW   FEED B  361 kW',
          '08-24 12:00  FEED A  392 kW   FEED B  358 kW',
          '08-25 00:00  FEED A  377 kW   FEED B  364 kW',
          '08-25 12:00  FEED A  390 kW   FEED B  359 kW',
          '08-26 00:00  FEED A  374 kW   FEED B  368 kW',
          '08-26 09:30  FEED A  379 kW   FEED B  363 kW',
          '',
          'Row C-01 is racked and unpowered. Capacity review NC-4480.',
        ].join('\n')),
        'door.log': file([
          '08-19 07:41  DOOR1  open   badge 0041',
          '08-19 07:58  DOOR1  closed',
          '08-19 16:22  DOOR1  open   badge 0041',
          '08-19 16:24  DOOR1  closed',
          '08-21 11:03  DOOR1  open   badge 0017',
          '08-21 11:49  DOOR1  closed',
          '08-21 11:49  DOOR1  closer adjusted, work order NC-4433',
          '08-26 --:--  DOOR1  open   no badge',
        ].join('\n')),
      }),
    }),
    hall: dir({
      inventory: file([
        'ROW    CABINETS  POPULATED  LOAD kW',
        'A-01         24         24     31.2',
        'A-02         24         23     29.8',
        'A-03         24         24     30.9',
        'A-04         24         24     31.4',
        'B-01         24         18     22.4',
        'B-02         24         11     13.7',
        'B-03         24         14     17.9',
        'C-01         24          0      0.0',
        '',
        'Rows C-02 to C-06 are racked and unpowered.',
      ].join('\n')),
      environment: file([
        'Cold aisle       18.4 C',
        'Hot aisle        31.1 C',
        'Humidity         41 %RH',
        'Pressure diff    12 Pa',
        'CRAC 1           running',
        'CRAC 2           running',
        'CRAC 3           running',
        'CRAC 4           fault, bearing, work order NC-4471',
      ].join('\n')),
      'maintenance.log': file([
        '2026-05-02  NC-4390  CRAC 3 filter change               closed',
        '2026-05-19  NC-4412  Row B-02 PDU phase imbalance       closed',
        '2026-06-08  NC-4433  Door 1 closer adjusted             closed',
        '2026-07-14  NC-4458  Yard lamp 3 replaced               closed',
        '2026-08-03  NC-4471  CRAC 4 bearing noise               open',
        '2026-08-17  NC-4480  Row C-01 unpowered, capacity        open',
        '                     review pending',
      ].join('\n')),
    }),
    site: dir({
      access: file([
        'Perimeter fence     intact',
        'Gate                unlocked',
        'Door 1  south       unlocked',
        'Door 2  north       sealed, plated 2026-04',
        'Cameras             8 of 8 reporting',
        'Yard lamps          4 of 4',
        'Sign floodlights    4 of 4',
      ].join('\n')),
      cameras: file([
        'CAM  VIEW                    STATE     RECORDING',
        '  1  gate, outbound          ok        7 days',
        '  2  gate, inbound           ok        7 days',
        '  3  south elevation, west   ok        7 days',
        '  4  south elevation, east   ok        7 days',
        '  5  door 1                  ok        7 days',
        '  6  sign                    ok        7 days',
        '  7  north elevation         ok        7 days',
        '  8  yard, plant             ok        7 days',
      ].join('\n')),
    }),
    home: dir({
      guest: dir({
        notes: file('Nothing written here yet.'),
      }),
    }),
  });
}

// ---- helpers ----------------------------------------------------------------
function textOf(n, name) {
  if (!n) throw new ShellError(`${name}: no such file or directory`);
  if (isDir(n)) throw new ShellError(`${name}: is a directory`);
  return n.f;
}

function inputOf(args, stdin, env) {
  if (args.length) {
    return args.map((a) => textOf(lookup(env.root, resolvePath(a, env.cwd)), a)).join('\n');
  }
  if (stdin == null) throw new ShellError('nothing to read');
  return stdin;
}

// No clock on the disk, so the dates are fixed and come out of the name's own
// hash. A listing should read as a filing cabinet, not as this morning's work.
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
function stamp(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return `${MONTH[h % MONTH.length]} ${String(h % 28 + 1).padStart(2)} ${String(h % 24).padStart(2, '0')}:${String(h % 60).padStart(2, '0')}`;
}

// ---- commands ---------------------------------------------------------------
const COMMANDS = {
  pwd: (_a, _in, env) => pathString(env.cwd) || '/',

  ls: (args, _in, env) => {
    const long = args.includes('-l');
    const rest = args.filter((a) => a[0] !== '-');
    const parts = resolvePath(rest[0] || '', env.cwd);
    const n = lookup(env.root, parts);
    if (!n) throw new ShellError(`${rest[0] || pathString(parts)}: no such file or directory`);
    if (isFile(n)) return rest[0];
    const names = Object.keys(n.d).sort();
    if (!names.length) return '';
    if (!long) return names.map((k) => k + (isDir(n.d[k]) ? '/' : '')).join('  ');
    return names.map((k) => {
      const c = n.d[k], d = isDir(c);
      const mode = d ? 'drwxr-xr-x' : '-rw-r--r--';
      const links = d ? String(Object.keys(c.d).length + 2) : '1';
      const size = d ? Object.keys(c.d).length * 32 + 64 : c.f.length;
      return `${mode} ${links.padStart(2)} root  ncds ${String(size).padStart(7)} ${stamp(k)} ${k}${d ? '/' : ''}`;
    }).join('\n');
  },

  cd: (args, _in, env) => {
    const parts = resolvePath(args[0] || '~', env.cwd);
    const n = lookup(env.root, parts);
    if (!n) throw new ShellError(`${args[0] || '~'}: no such file or directory`);
    if (!isDir(n)) throw new ShellError(`${args[0]}: not a directory`);
    env.cwd = parts;
    return '';
  },

  cat: (args, stdin, env) => inputOf(args, stdin, env),
  echo: (args) => args.join(' '),

  man: (args, _in, env) => {
    const topic = (args[0] || '').toLowerCase();
    if (!topic) return 'man <topic>. try: man grep';
    const n = lookup(env.root, ['usr', 'man', topic]);
    if (!isFile(n)) throw new ShellError(`no manual entry for ${topic}`);
    return n.f;
  },

  grep: (args, stdin, env) => {
    const pat = args[0];
    if (!pat) throw new ShellError('grep needs a pattern');
    let re;
    try { re = new RegExp(pat, 'i'); }
    catch { throw new ShellError(`grep: ${pat}: bad expression`); }
    return inputOf(args.slice(1), stdin, env).split('\n').filter((l) => re.test(l)).join('\n');
  },

  wc: (args, stdin, env) => {
    const t = inputOf(args, stdin, env);
    const lines = t === '' ? 0 : t.split('\n').length;
    const words = t.split(/\s+/).filter(Boolean).length;
    return `${String(lines).padStart(6)}${String(words).padStart(7)}${String(t.length).padStart(8)}`;
  },

  head: (args, stdin, env) => {
    let n = 10, rest = args;
    if (args[0] && /^-\d+$/.test(args[0])) { n = +args[0].slice(1); rest = args.slice(1); }
    return inputOf(rest, stdin, env).split('\n').slice(0, n).join('\n');
  },

  tail: (args, stdin, env) => {
    let n = 10, rest = args;
    if (args[0] && /^-\d+$/.test(args[0])) { n = +args[0].slice(1); rest = args.slice(1); }
    return inputOf(rest, stdin, env).split('\n').slice(-n).join('\n');
  },

  sort: (args, stdin, env) => inputOf(args, stdin, env).split('\n').sort().join('\n'),

  uniq: (args, stdin, env) => {
    const out = [];
    for (const l of inputOf(args, stdin, env).split('\n')) {
      if (out[out.length - 1] !== l) out.push(l);
    }
    return out.join('\n');
  },

  mkdir: (args, _in, env) => {
    if (!args[0]) throw new ShellError('mkdir needs a name');
    const at = parentOf(env.root, resolvePath(args[0], env.cwd));
    if (!at) throw new ShellError(`${args[0]}: no such directory`);
    if (at.parent.d[at.name]) throw new ShellError(`${args[0]}: already exists`);
    at.parent.d[at.name] = dir({});
    return '';
  },

  rm: (args, _in, env) => {
    if (!args[0]) throw new ShellError('rm needs a file');
    const at = parentOf(env.root, resolvePath(args[0], env.cwd));
    if (!at || !at.parent.d[at.name]) throw new ShellError(`${args[0]}: no such file`);
    if (isDir(at.parent.d[at.name])) throw new ShellError(`${args[0]}: is a directory`);
    delete at.parent.d[at.name];
    return '';
  },

  cp: (args, _in, env) => {
    if (args.length < 2) throw new ShellError('cp needs two names');
    const text = textOf(lookup(env.root, resolvePath(args[0], env.cwd)), args[0]);
    writeFile(env, args[1], text);
    return '';
  },

  mv: (args, _in, env) => {
    if (args.length < 2) throw new ShellError('mv needs two names');
    const text = textOf(lookup(env.root, resolvePath(args[0], env.cwd)), args[0]);
    writeFile(env, args[1], text);
    COMMANDS.rm([args[0]], null, env);
    return '';
  },

  df: () => [
    'Filesystem      Blocks    Used    Free  Capacity  Mounted on',
    '/dev/sd0         65536   41208   24328       63%  /',
    '/dev/sd1        262144  198410   63734       76%  /var',
  ].join('\n'),

  ps: () => [
    '  PID  USER   TIME  COMMAND',
    '    1  root   0:04  /sbin/init',
    '  118  root   2:31  bmsd --site hall-1',
    '  204  root   0:57  cracd',
    '  219  root  14:02  pdud --rows a,b,c',
    '  260  root   0:11  camd --devices 8',
    '  318  ncds   0:02  getty console',
    '  411  guest  0:00  sh',
  ].join('\n'),

  who: (_a, _in, env) => `guest  console  ${env.clock()}  (floor)`,
  date: (_a, _in, env) => `${env.clock()} site time`,

  uptime: (_a, _in, env) =>
    `${env.clock()} up 412 days, 1 user, load 0.31 0.28 0.30`,

  env: (_a, _in, env) => [
    'USER=guest',
    'HOME=/home/guest',
    'HOST=ncds-hal-01',
    'SITE=NCDS-01',
    'HALL=1',
    `PWD=${pathString(env.cwd) || '/'}`,
  ].join('\n'),

  help: () => [
    'ls  cd  pwd  cat  echo  man',
    'grep  wc  head  tail  sort  uniq',
    'mkdir  rm  cp  mv',
    'df  ps  who  date  uptime  env',
    'clear  exit',
    '',
    'Pipes and redirect work:',
    '  cat var/log/bms.log | grep CRAC4 | wc',
    '  ls -l hall > home/guest/notes',
    '',
    '`man <name>` has the detail. Up and down recall what you typed.',
  ].join('\n'),
};

export const COMMAND_NAMES = Object.keys(COMMANDS).sort();

export function writeFile(env, path, text) {
  const at = parentOf(env.root, resolvePath(path, env.cwd));
  if (!at) throw new ShellError(`${path}: no such directory`);
  if (isDir(at.parent.d[at.name])) throw new ShellError(`${path}: is a directory`);
  at.parent.d[at.name] = file(text);
}

// ---- the shell --------------------------------------------------------------
function words(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { q = !q; continue; }
    if (!q && /\s/.test(c)) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Run ONE line: a `|` chain, with an optional `> file` on the end. `hooks` lets
 * the terminal bolt on the commands that act on the screen or the world (clear,
 * exit) without this module knowing either exists.
 */
export function runShell(line, env, hooks = {}) {
  const src = String(line == null ? '' : line).trim();
  if (!src || src.startsWith('#')) return { ok: true, text: '' };

  let redirect = null, body = src;
  const gt = src.lastIndexOf('>');
  if (gt >= 0) {
    const target = src.slice(gt + 1).trim();
    if (target && !target.includes('|')) { redirect = words(target)[0]; body = src.slice(0, gt); }
  }

  try {
    let stdin = null, out = '';
    for (const stage of body.split('|')) {
      const w = words(stage.trim());
      if (!w.length) throw new ShellError('empty command in the pipe');
      const name = w[0].toLowerCase();
      const args = w.slice(1);
      if (hooks[name]) return hooks[name](args, env);
      const cmd = COMMANDS[name];
      if (!cmd) throw new ShellError(`${name}: not found`);
      out = cmd(args, stdin, env);
      stdin = out;
    }
    if (redirect) { writeFile(env, redirect, out); return { ok: true, text: '' }; }
    return { ok: true, text: out };
  } catch (e) {
    if (e instanceof ShellError) return { ok: false, text: e.message };
    throw e;
  }
}

export function newShell(clock) {
  const root = makeDisk();
  return { root, cwd: ['home', 'guest'], clock: clock || (() => '00:00') };
}

export { MOTD };
