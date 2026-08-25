#!/usr/bin/env python3
"""Copy the grip constants and the item->model table out of the previewer and
into docs/character-3d-plan.md.

The previewer lives in the gitignored _tmp/ and the plan doc is in the repo, so
the numbers exist in two places. This makes the doc a copy rather than a second
original: edit the previewer, run this, never hand-edit the fence in the doc.

    python3 _tmp/sync-item-map.py
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / '_tmp/character-preview.html').read_text()
doc_path = root / 'docs/character-3d-plan.md'
doc = doc_path.read_text()

def grab(name, pattern):
    m = re.search(pattern, src, re.S)
    if not m:
        sys.exit('could not find %s in the previewer' % name)
    return m.group(1)

blocks = [
    grab('GRIPS',     r'(const GRIPS = \{.*?\n\};)'),
    grab('HAFTED',    r'(const HAFTED = new Set\(.*?\);)'),
    grab('ITEM_MAP',  r'(const ITEM_MAP = \{.*?\n\};)'),
    grab('RAW_TUNED', r'(const RAW_TUNED = \{.*?\n\};)'),
]
body = '\n\n'.join(blocks)

new_doc, n = re.subn(r'```js\nconst GRIPS = \{.*?\n```',
                     '```js\n' + body + '\n```', doc, count=1, flags=re.S)
if n != 1:
    sys.exit('could not find the coordinate fence in %s' % doc_path.name)
doc_path.write_text(new_doc)
print('synced %d lines into %s' % (body.count('\n') + 1, doc_path.name))
