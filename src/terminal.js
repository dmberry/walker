// Walker.
// Copyright (C) 2026 David M. Berry
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the GNU General
// Public License as published by the Free Software Foundation, either version 3
// of the License, or (at your option) any later version. This program is
// distributed WITHOUT ANY WARRANTY; see <https://www.gnu.org/licenses/>.

// The access terminal in the hall: the glue, and the picture.
//
// Three parts, deliberately separate. console-buffer.js holds the text and the
// caret and knows nothing about commands or pixels. unix.js holds the disk and
// the command table and knows nothing about a screen. This file joins them and
// draws the result, and is the only one of the three that touches a canvas.
//
// ONE CANVAS, TWO CONSUMERS. The same canvas is the map on the screen bolted to
// the rack and the picture in the full-screen overlay. Drawing it twice would
// be two sets of state that can disagree.

import * as CB from './console-buffer.js';
import * as U from './unix.js';
import NCDS from './os-ncds.js';

// FEWER, LARGER CHARACTERS. At 78 columns the glyphs on the screen in the hall
// were under a pixel across and the whole thing read as a black rectangle. 56
// by 20 is still a usable console — the man pages and the log lines are written
// to fit it — and each character is half as wide again on the rack.
export const COLS = 56;
export const ROWS = 20;

export function createTerminal(opts = {}) {
  // The OS is a parameter: different datacentres run different flavours, and
  // the terminal reads everything site-specific — host, user, greeting, disk —
  // off the machine it is showing.
  const os = opts.os || NCDS;
  const cx = CB.newConsole({ prompt: '$', cols: COLS });
  const env = U.newShell(opts.clock || (() => '00:00'), os);
  let closed = false;

  const setPrompt = () =>
    CB.setPrompt(cx, `${os.user}@${os.host}:${U.pathString(env.cwd) || '/'}$`);

  // Commands that act on the screen or on the world rather than on the disk.
  // unix.js takes these as hooks so it never has to know either exists.
  const hooks = {
    clear: () => { CB.clearScreen(cx); return { ok: true, text: '' }; },
    exit: () => { closed = true; return { ok: true, text: '' }; },
  };
  hooks.logout = hooks.quit = hooks.exit;

  function submit() {
    const line = CB.submit(cx);
    const r = U.runShell(line, env, hooks);
    if (r && r.text) CB.print(cx, r.text);
    setPrompt();
  }

  setPrompt();
  CB.print(cx, os.motd, '');

  // ------------------------------------------------------------- the picture --
  const canvas = document.createElement('canvas');
  const PAD = 16, LH = 30, SIZE = 22;
  const FONT = `${SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const c = canvas.getContext('2d');
  c.font = FONT;
  const CW = c.measureText('M').width;
  canvas.width = Math.ceil(PAD * 2 + COLS * CW);
  canvas.height = PAD * 2 + ROWS * LH;

  let caretOn = true, caretT = 0;

  function draw() {
    // BLACK AND WHITE, AND NOTHING OVER THE TOP OF IT. This was pale blue on
    // dark navy with scanlines and a vignette, which looks like a terminal in a
    // screenshot and is unreadable as a texture three metres away across a dark
    // room — the contrast that survives minification is white on black and
    // nothing else. The scanlines went with it: at this size they were eating
    // every third row of the glyphs.
    c.fillStyle = '#000000';
    c.fillRect(0, 0, canvas.width, canvas.height);

    c.font = FONT;
    c.textBaseline = 'top';
    const rows = CB.view(cx, ROWS);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      c.fillStyle = r.input ? '#ffffff' : '#d8d8d8';
      c.fillText(r.text, PAD, PAD + i * LH);
      if (r.input && caretOn) {
        c.fillStyle = '#ffffff';
        c.fillRect(PAD + CB.caretCol(cx) * CW, PAD + i * LH + 2, CW, SIZE);
      }
    }
  }

  // 1.4 Hz, which is a caret and not a strobe.
  function tick(dt) {
    caretT += dt;
    if (caretT > 0.36) { caretT = 0; caretOn = !caretOn; draw(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- the input --
  // Returns true if the key was consumed, so the host can leave the rest alone.
  function key(e) {
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k === 'u') CB.setInput(cx, '');
      else if (k === 'c') { CB.print(cx, `${cx.prompt} ${cx.input}^C`); CB.setInput(cx, ''); }
      else if (k === 'l') CB.clearScreen(cx);
      else if (k === 'a') CB.moveCursor(cx, 'home');
      else if (k === 'e') CB.moveCursor(cx, 'end');
      else return false;
    }
    else if (k === 'Enter') submit();
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
    else if (k === 'Tab') complete();
    else if (k.length === 1) CB.typeChar(cx, k);
    else return false;

    caretOn = true; caretT = 0;
    draw();
    return true;
  }

  // Tab completion, over commands at the start of a line and over names in the
  // working directory after it. A shell without it feels like a prop.
  function complete() {
    const head = cx.input.slice(0, cx.cursor);
    const parts = head.split(/\s+/);
    const word = parts[parts.length - 1];
    const first = parts.length === 1;

    let pool;
    if (first) {
      pool = U.COMMAND_NAMES.concat(['clear', 'exit']);
    } else {
      const node = U.lookup(env.root, env.cwd);
      pool = U.isDir(node) ? Object.keys(node.d) : [];
    }
    const hits = pool.filter(n => n.startsWith(word)).sort();
    if (!hits.length) return;

    if (hits.length === 1) {
      CB.setInput(cx, head.slice(0, head.length - word.length) + hits[0]
                    + cx.input.slice(cx.cursor));
      return;
    }
    // The common prefix, then the options — which is what a shell does.
    let pre = hits[0];
    for (const h of hits) {
      while (!h.startsWith(pre)) pre = pre.slice(0, -1);
    }
    if (pre.length > word.length) {
      CB.setInput(cx, head.slice(0, head.length - word.length) + pre
                    + cx.input.slice(cx.cursor));
    } else {
      CB.print(cx, `${cx.prompt} ${cx.input}`, hits.join('   '));
    }
  }

  draw();
  return {
    cx, env, canvas, key, draw, tick, complete,
    isClosed: () => closed,
    reopen: () => { closed = false; },
  };
}
