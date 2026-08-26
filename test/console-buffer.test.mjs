// The console model: text and a caret, no commands and no pixels. Everything
// here is pure, which is the whole reason it was pulled out of the page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as CB from '../src/console-buffer.js';

test('print splits on newlines and caps the scrollback', () => {
  const cx = CB.newConsole({ max: 32 });
  CB.print(cx, 'one\ntwo', 'three');
  assert.deepEqual(cx.lines, ['one', 'two', 'three']);

  for (let i = 0; i < 100; i++) CB.print(cx, 'x' + i);
  assert.equal(cx.lines.length, 32);
  assert.equal(cx.lines.at(-1), 'x99');
});

test('typing, backspace and delete respect the caret', () => {
  const cx = CB.newConsole();
  for (const ch of 'grep') CB.typeChar(cx, ch);
  assert.equal(cx.input, 'grep');
  assert.equal(cx.cursor, 4);

  CB.moveCursor(cx, 'home');
  CB.typeChar(cx, '!');
  assert.equal(cx.input, '!grep');

  CB.moveCursor(cx, 'end');
  CB.backspace(cx);
  assert.equal(cx.input, '!gre');

  CB.moveCursor(cx, 'home');
  CB.del(cx);
  assert.equal(cx.input, 'gre');
});

test('the caret cannot walk off either end', () => {
  const cx = CB.newConsole();
  CB.moveCursor(cx, 'left');
  assert.equal(cx.cursor, 0);
  CB.backspace(cx);                       // and backspace at 0 is a no-op
  assert.equal(cx.input, '');

  CB.setInput(cx, 'ls');
  CB.moveCursor(cx, 'right');
  CB.moveCursor(cx, 'right');
  assert.equal(cx.cursor, 2);
});

test('submit echoes the prompt, returns the line, and clears', () => {
  const cx = CB.newConsole({ prompt: '$' });
  CB.setInput(cx, 'ls -l');
  const line = CB.submit(cx);

  assert.equal(line, 'ls -l');
  assert.equal(cx.lines.at(-1), '$ ls -l');
  assert.equal(cx.input, '');
  assert.equal(cx.cursor, 0);
});

test('an empty line still echoes the bare prompt', () => {
  const cx = CB.newConsole({ prompt: '$' });
  assert.equal(CB.submit(cx), '');
  assert.equal(cx.lines.at(-1), '$ ');
});

test('history does not record blanks or immediate repeats', () => {
  const cx = CB.newConsole();
  for (const l of ['ls', 'ls', '', '   ', 'pwd']) { CB.setInput(cx, l); CB.submit(cx); }
  assert.deepEqual(cx.history, ['ls', 'pwd']);
});

test('recall walks back, walks forward, and restores what was being typed', () => {
  const cx = CB.newConsole();
  for (const l of ['one', 'two']) { CB.setInput(cx, l); CB.submit(cx); }

  CB.setInput(cx, 'half-typed');
  CB.recall(cx, 'up');
  assert.equal(cx.input, 'two');
  CB.recall(cx, 'up');
  assert.equal(cx.input, 'one');
  CB.recall(cx, 'up');                    // already at the oldest
  assert.equal(cx.input, 'one');

  CB.recall(cx, 'down');
  assert.equal(cx.input, 'two');
  CB.recall(cx, 'down');
  assert.equal(cx.input, 'half-typed', 'the stash comes back');
});

test('wrap never returns fewer than one row, even for an empty line', () => {
  assert.deepEqual(CB.wrap('', 8), ['']);
  assert.deepEqual(CB.wrap('abc', 8), ['abc']);
  assert.deepEqual(CB.wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
});

test('view returns the newest rows with the input line at the foot', () => {
  const cx = CB.newConsole({ prompt: '>' });
  for (let i = 0; i < 10; i++) CB.print(cx, 'line' + i);
  CB.setInput(cx, 'typing');

  const rows = CB.view(cx, 4);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.text), ['line7', 'line8', 'line9', '> typing']);
  assert.equal(rows.at(-1).input, true);
  assert.equal(rows.filter(r => r.input).length, 1);
});

test('scrolling up moves the window and new output pins it back', () => {
  const cx = CB.newConsole();
  for (let i = 0; i < 20; i++) CB.print(cx, 'line' + i);

  CB.scrollBy(cx, 5, 4);
  assert.equal(cx.scroll, 5);
  assert.ok(!CB.view(cx, 4).some(r => r.input), 'scrolled up, so no input row');

  CB.scrollBy(cx, 999, 4);
  assert.ok(cx.scroll <= 20, 'clamped to the top of the scrollback');

  CB.print(cx, 'fresh');
  assert.equal(cx.scroll, 0, 'output pins the view back to the bottom');
});

test('caretCol accounts for the prompt and its space', () => {
  const cx = CB.newConsole({ prompt: 'ncds$' });
  CB.setInput(cx, 'ab');
  assert.equal(CB.caretCol(cx), 'ncds$'.length + 1 + 2);
});
