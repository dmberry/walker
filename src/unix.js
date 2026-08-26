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

// ---- the manual -------------------------------------------------------------
// The pages document the machinery, so they live with it; a flavour grafts them
// into its own disk with manPages() and may add pages of its own beside them.
const MAN = {
  ls: 'ls [-l] [path]\n  List a directory. A name ending in / is a\n  directory. -l gives the long form: mode,\n  links, owner, size, date.',
  cd: 'cd [path]\n  Change directory. `cd` alone goes home,\n  `cd ..` goes up.',
  pwd: 'pwd\n  Print the working directory.',
  cat: 'cat <file>\n  Print a file. Pipe it: cat var/log/bms.log | grep CRAC',
  echo: 'echo <text>\n  Print text. Redirect it:\n  echo "seen" > home/guest/notes',
  man: 'man <topic>\n  Read the manual for a command. The pages\n  are in /usr/man.',
  grep: 'grep <pattern> [file]\n  Print matching lines. Reads a pipe if no\n  file is given. The pattern is a regular\n  expression, case insensitive.',
  wc: 'wc [file]\n  Count lines, words and characters. Reads\n  a pipe if no file is given.',
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

export function manPages() {
  const man = {};
  for (const [k, v] of Object.entries(MAN)) man[k] = file(v);
  return dir(man);
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

/**
 * A live machine: a flavour's disk, a working directory, and the site clock.
 * The flavour rides along so the terminal can read the hostname and greeting
 * off the machine itself rather than being told twice.
 */
export function newShell(clock, flavour) {
  if (!flavour || !flavour.makeDisk) throw new Error('newShell needs an OS flavour');
  return { root: flavour.makeDisk(), cwd: [...flavour.home],
           clock: clock || (() => '00:00'), flavour };
}
