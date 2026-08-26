// Walker.
// Copyright (C) 2026 David M. Berry
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later
// version. This program is distributed WITHOUT ANY WARRANTY; see the GNU
// General Public License for details: <https://www.gnu.org/licenses/>.

// The access terminal in the hall: a shell, a small filesystem, and a canvas
// renderer. The console model underneath is console-buffer.js, which holds the
// text and the caret and knows nothing about commands or pixels.
//
// ONE CANVAS, TWO CONSUMERS. The same canvas is the map on the screen bolted to
// the rack and the picture in the full-screen overlay. Drawing it twice would
// mean two sets of state that can disagree.

import * as CB from './console-buffer.js';

export const COLS = 74;
export const ROWS = 30;

const HOST = 'ncds-hal-01';
const USER = 'guest';

// ---------------------------------------------------------------- filesystem --
// Directories are objects, files are strings. Small on purpose: this is the
// shape to hang the rest on, not the finished estate.
const FS = {
  README: [
    'NEOCLOUD DATA SOLUTIONS — HALL 1 ACCESS TERMINAL',
    '',
    'This console is for floor use: environmental readings, rack',
    'inventory, and the maintenance log. It has no route to the',
    'control plane. For anything above the floor, use a station in',
    'the operations room.',
    '',
    'Type `help` for the command list.',
  ].join('\n'),
  hall: {
    'inventory.txt': [
      'ROW   CABINETS  POPULATED  POWER kW',
      'A-01        24         24      31.2',
      'A-02        24         23      29.8',
      'A-03        24         24      30.9',
      'B-01        24         18      22.4',
      'B-02        24         11      13.7',
      'C-01        24          0       0.0',
      '',
      'Rows C-02 to C-06 are racked and unpowered.',
    ].join('\n'),
    'environment.txt': [
      'Cold aisle      18.4 C',
      'Hot aisle       31.1 C',
      'Humidity        41 %RH',
      'Pressure diff   12 Pa',
      'CRAC 1          running',
      'CRAC 2          running',
      'CRAC 3          standby',
      'CRAC 4          fault  — bearing, work order NC-4471',
    ].join('\n'),
    'maintenance.log': [
      '2026-05-02  NC-4390  CRAC 3 filter change                closed',
      '2026-05-19  NC-4412  Row B-02 PDU B phase imbalance      closed',
      '2026-06-08  NC-4433  Door 1 closer adjusted              closed',
      '2026-07-14  NC-4458  Yard lamp 3 replaced                closed',
      '2026-08-03  NC-4471  CRAC 4 bearing noise                open',
      '2026-08-17  NC-4480  Row C-01 left unpowered pending     open',
      '                     capacity review',
    ].join('\n'),
  },
  site: {
    'access.txt': [
      'Perimeter fence     intact',
      'Gate                unlocked',
      'Door 1 (south)      unlocked',
      'Door 2 (north)      sealed',
      'Cameras             8 of 8 reporting',
    ].join('\n'),
  },
};

function resolve(fs, parts) {
  let node = fs;
  for (const p of parts) {
    if (typeof node !== 'object' || !(p in node)) return null;
    node = node[p];
  }
  return node;
}

function normalise(cwd, arg) {
  const parts = arg.startsWith('/') ? [] : cwd.slice();
  for (const seg of arg.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts;
}

// ------------------------------------------------------------------ the shell --
export function createTerminal(opts = {}) {
  const cx = CB.newConsole({ prompt: '$', cols: COLS });
  let cwd = [];
  let closed = false;
  const started = Date.now();

  const path = () => '/' + cwd.join('/');
  const setPrompt = () => CB.setPrompt(cx, `${USER}@${HOST}:${path() || '/'}$`);

  const clock = () => {
    // The site clock, not the wall clock: the host passes in the game's own
    // time of day so the terminal agrees with the sky outside.
    const t = opts.timeOfDay ? opts.timeOfDay() : 0.5;
    const m = Math.round(t * 24 * 60);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' +
           String(m % 60).padStart(2, '0');
  };

  const CMDS = {
    help() {
      return [
        'ls [path]        list a directory',
        'cd [path]        change directory',
        'cat <file>       print a file',
        'pwd              print the working directory',
        'env              site readings, live',
        'ps               what this machine is running',
        'who              sessions on this host',
        'uptime           how long the hall has been up',
        'date             site clock',
        'echo <text>      print text',
        'clear            clear the screen',
        'exit             leave the terminal',
      ].join('\n');
    },
    ls(args) {
      const node = resolve(FS, normalise(cwd, args[0] || '.'));
      if (node === null) return `ls: ${args[0]}: no such file or directory`;
      if (typeof node === 'string') return args[0];
      const names = Object.keys(node).sort();
      return names.map(n => typeof node[n] === 'object' ? n + '/' : n).join('   ');
    },
    cd(args) {
      const parts = normalise(cwd, args[0] || '');
      const node = resolve(FS, parts);
      if (node === null) return `cd: ${args[0]}: no such file or directory`;
      if (typeof node === 'string') return `cd: ${args[0]}: not a directory`;
      cwd = parts;
      setPrompt();
      return '';
    },
    cat(args) {
      if (!args[0]) return 'cat: which file?';
      const node = resolve(FS, normalise(cwd, args[0]));
      if (node === null) return `cat: ${args[0]}: no such file or directory`;
      if (typeof node === 'object') return `cat: ${args[0]}: is a directory`;
      return node;
    },
    pwd() { return path() || '/'; },
    echo(args) { return args.join(' '); },
    env() {
      return FS.hall['environment.txt'];
    },
    ps() {
      return [
        '  PID  USER      TIME  COMMAND',
        '    1  root      0:04  /sbin/init',
        '  118  root      2:31  bmsd --site hall-1',
        '  204  root      0:57  cracd',
        '  219  root     14:02  pdud --rows a,b,c',
        '  260  root      0:11  camd --devices 8',
        '  318  ncds      0:02  sshd: guest [priv]',
        '  411  guest     0:00  sh',
      ].join('\n');
    },
    who() {
      return `${USER}  console  ${clock()}  (local)`;
    },
    uptime() {
      const d = Math.floor((Date.now() - started) / 1000);
      return `${clock()} up 412 days, session ${d}s, load 0.31 0.28 0.30`;
    },
    date() { return `${clock()} site time`; },
    clear() { CB.clearScreen(cx); return ''; },
    exit() { closed = true; return ''; },
  };
  CMDS.dir = CMDS.ls;
  CMDS.logout = CMDS.quit = CMDS.exit;

  function run(line) {
    const argv = line.trim().split(/\s+/).filter(Boolean);
    if (!argv.length) return;
    const cmd = CMDS[argv[0]];
    if (!cmd) { CB.print(cx, `${argv[0]}: command not found`); return; }
    const out = cmd(argv.slice(1));
    if (out) CB.print(cx, out);
  }

  setPrompt();
  CB.print(cx,
    'Neocloud Data Solutions — Hall 1 floor access',
    `${HOST}  guest session`,
    '',
    'Type `help` for the command list, `exit` to step away.',
    '');

  // ------------------------------------------------------------ the picture --
  const canvas = document.createElement('canvas');
  const PAD = 18, LH = 21, FS_ = 16;
  canvas.width = PAD * 2 + Math.ceil(COLS * FS_ * 0.6);
  canvas.height = PAD * 2 + ROWS * LH;
  const c = canvas.getContext('2d');
  c.font = `${FS_}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const CW = c.measureText('M').width;

  let caretOn = true, caretT = 0;

  function draw() {
    c.fillStyle = '#060b10';
    c.fillRect(0, 0, canvas.width, canvas.height);

    c.font = `${FS_}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    c.textBaseline = 'top';
    const rows = CB.view(cx, ROWS);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      c.fillStyle = r.input ? '#d8f2ff' : '#8fc6e8';
      c.fillText(r.text, PAD, PAD + i * LH);
      if (r.input && caretOn) {
        c.fillStyle = '#d8f2ff';
        c.fillRect(PAD + CB.caretCol(cx) * CW, PAD + i * LH + 2, CW, FS_);
      }
    }

    // Scanlines, and a little glow at the edges. A flat panel of text on a
    // rack door does not read as a screen without them.
    c.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < canvas.height; y += 3) c.fillRect(0, y, canvas.width, 1);
    const g = c.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.25,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g;
    c.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 1.4 Hz, which is a caret and not a strobe.
  function tick(dt) {
    caretT += dt;
    if (caretT > 0.36) { caretT = 0; caretOn = !caretOn; return true; }
    return false;
  }

  // ------------------------------------------------------------------ input --
  // Returns true if the key was consumed, so the host can leave the rest alone.
  function key(e) {
    const k = e.key;
    if (k === 'Enter') { run(CB.submit(cx)); }
    else if (k === 'Backspace') CB.backspace(cx);
    else if (k === 'Delete') CB.del(cx);
    else if (k === 'ArrowLeft') CB.moveCursor(cx, 'left');
    else if (k === 'ArrowRight') CB.moveCursor(cx, 'right');
    else if (k === 'Home') CB.moveCursor(cx, 'home');
    else if (k === 'End') CB.moveCursor(cx, 'end');
    else if (k === 'ArrowUp') CB.recall(cx, 'up');
    else if (k === 'ArrowDown') CB.recall(cx, 'down');
    else if (k === 'PageUp') CB.scrollBy(cx, 8, ROWS);
    else if (k === 'PageDown') CB.scrollBy(cx, -8, ROWS);
    else if (k === 'Escape') closed = true;
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) CB.typeChar(cx, k);
    else if (k === 'u' && e.ctrlKey) CB.setInput(cx, '');
    else if (k === 'c' && e.ctrlKey) { CB.print(cx, `${cx.prompt} ${cx.input}^C`); CB.setInput(cx, ''); }
    else if (k === 'l' && e.ctrlKey) CB.clearScreen(cx);
    else return false;
    caretOn = true; caretT = 0;
    draw();
    return true;
  }

  draw();
  return {
    cx, canvas, key, draw, tick,
    isClosed: () => closed,
    reopen: () => { closed = false; },
  };
}
