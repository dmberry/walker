// Walker.
// Copyright (C) 2026 David M. Berry
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later
// version. This program is distributed WITHOUT ANY WARRANTY; see the GNU
// General Public License for details: <https://www.gnu.org/licenses/>.

// The reusable console model, carried over from nostos (src/game/console-buffer.js)
// unchanged apart from this header. Same author, same licence.
//
// It is the island-agnostic model of a console rendered ON a canvas: scrollback,
// one editable input line, history, and word-wrap to a column width. It is
// deliberately pure — it holds text and a cursor and nothing else — so it can
// drive a full-screen overlay and a texture on a rack door at the same time,
// from the same state.
//
// It does NOT run commands. The host calls submit() to take the typed line, runs
// it however that machine runs it, and calls print() with the result. Keeping
// dispatch outside is what makes one buffer serve every console.

/**
 * A fresh console.
 * @param {object} opts
 *   prompt  the prompt string drawn before the input (default '>')
 *   cols    wrap width in characters (default 64)
 *   max     scrollback cap in lines (default 1000)
 *   theme   free-form object the renderer reads for colours; the model ignores it
 */
export function newConsole(opts = {}) {
  return {
    lines: [],                    // scrollback: committed output, already wrapped-agnostic
    input: '',                    // the current editable line
    cursor: 0,                    // caret index into input
    prompt: opts.prompt ?? '>',
    cols: Math.max(8, opts.cols ?? 64),
    max: Math.max(32, opts.max ?? 1000),
    history: [],                  // submitted commands, oldest first
    histIdx: -1,                  // -1 = editing a fresh line; else index into history
    stash: '',                    // the in-progress line, kept while browsing history
    scroll: 0,                    // lines scrolled up from the bottom (0 = pinned to newest)
    theme: opts.theme ?? null,
  };
}

/** Append output lines to the scrollback. Strings only; newlines split. */
export function print(cx, ...items) {
  for (const item of items) {
    for (const line of String(item).split('\n')) cx.lines.push(line);
  }
  if (cx.lines.length > cx.max) cx.lines.splice(0, cx.lines.length - cx.max);
  cx.scroll = 0;   // any new output pins the view to the bottom
  return cx;
}

export function clearScreen(cx) { cx.lines = []; cx.scroll = 0; return cx; }

export function setPrompt(cx, p) { cx.prompt = String(p); return cx; }

// ---- editing ----------------------------------------------------------------

export function typeChar(cx, ch) {
  const s = String(ch);
  if (!s) return cx;
  cx.input = cx.input.slice(0, cx.cursor) + s + cx.input.slice(cx.cursor);
  cx.cursor += s.length;
  cx.histIdx = -1;
  return cx;
}

export function backspace(cx) {
  if (cx.cursor <= 0) return cx;
  cx.input = cx.input.slice(0, cx.cursor - 1) + cx.input.slice(cx.cursor);
  cx.cursor -= 1;
  cx.histIdx = -1;
  return cx;
}

export function del(cx) {
  if (cx.cursor >= cx.input.length) return cx;
  cx.input = cx.input.slice(0, cx.cursor) + cx.input.slice(cx.cursor + 1);
  cx.histIdx = -1;
  return cx;
}

/** Move the caret. dir is left|right|home|end. */
export function moveCursor(cx, dir) {
  if (dir === 'left') cx.cursor = Math.max(0, cx.cursor - 1);
  else if (dir === 'right') cx.cursor = Math.min(cx.input.length, cx.cursor + 1);
  else if (dir === 'home') cx.cursor = 0;
  else if (dir === 'end') cx.cursor = cx.input.length;
  return cx;
}

/** Set the whole input line (e.g. accepting an autocomplete). */
export function setInput(cx, s) {
  cx.input = String(s);
  cx.cursor = cx.input.length;
  cx.histIdx = -1;
  return cx;
}

// ---- submit and history -----------------------------------------------------

/**
 * Take the typed line: echo it into the scrollback as `<prompt> <line>`, clear
 * the input, record it in history, and RETURN it for the host to run. An empty
 * line still echoes the bare prompt, which is what a real console does.
 */
export function submit(cx) {
  const line = cx.input;
  print(cx, `${cx.prompt} ${line}`);
  if (line.trim() && cx.history[cx.history.length - 1] !== line) cx.history.push(line);
  cx.input = '';
  cx.cursor = 0;
  cx.histIdx = -1;
  cx.stash = '';
  return line;
}

// Set the input directly WITHOUT touching histIdx, so history browsing can
// keep its place (setInput resets the index, which is right for typing).
function _put(cx, s) { cx.input = String(s); cx.cursor = cx.input.length; }

/** Recall a previous (up) or later (down) command into the input. */
export function recall(cx, dir) {
  if (!cx.history.length) return cx;
  if (dir === 'up') {
    if (cx.histIdx === -1) { cx.stash = cx.input; cx.histIdx = cx.history.length; }
    cx.histIdx = Math.max(0, cx.histIdx - 1);
    _put(cx, cx.history[cx.histIdx]);
  } else if (dir === 'down') {
    if (cx.histIdx === -1) return cx;
    cx.histIdx += 1;
    if (cx.histIdx >= cx.history.length) { _put(cx, cx.stash); cx.histIdx = -1; }
    else _put(cx, cx.history[cx.histIdx]);
  }
  return cx;
}

// ---- scrolling --------------------------------------------------------------

/** Scroll the view. `by` lines up (positive) or down (negative), clamped. */
export function scrollBy(cx, by, viewRows) {
  const rows = Math.max(1, viewRows | 0);
  const wrapped = wrapAll(cx.lines, cx.cols).length;
  const maxScroll = Math.max(0, wrapped - rows);
  cx.scroll = Math.max(0, Math.min(maxScroll, cx.scroll + by));
  return cx;
}

// ---- rendering helpers (pure; the canvas renderer calls these) --------------

/** Wrap one logical line to `cols`, never returning fewer than one row. */
export function wrap(line, cols) {
  const s = String(line);
  if (s.length <= cols) return [s];
  const out = [];
  for (let i = 0; i < s.length; i += cols) out.push(s.slice(i, i + cols));
  return out;
}

/** All scrollback, wrapped. */
export function wrapAll(lines, cols) {
  const out = [];
  for (const l of lines) for (const w of wrap(l, cols)) out.push(w);
  return out;
}

/**
 * The rows the renderer should draw for a window `rows` tall: the wrapped
 * scrollback plus the live input line, honouring the scroll offset. The last
 * row is the input unless the view is scrolled up. Returns an array of
 * { text, input } — `input:true` marks the editable line so the renderer can
 * place the caret.
 */
export function view(cx, rows) {
  const r = Math.max(1, rows | 0);
  const body = wrapAll(cx.lines, cx.cols);
  const inputRow = { text: `${cx.prompt} ${cx.input}`, input: true };
  const all = [...body.map((text) => ({ text, input: false })), inputRow];
  // scroll counts from the bottom; 0 shows the newest r rows (input at foot).
  const end = all.length - cx.scroll;
  const start = Math.max(0, end - r);
  return all.slice(start, end);
}

/** Where the caret sits in the input row: its column, prompt included. */
export function caretCol(cx) {
  return cx.prompt.length + 1 + cx.cursor;
}
