#!/usr/bin/env python3
"""Static server for the repo, plus PUT.

Why PUT: several things in this project are DRAWN rather than authored — the
share card, the ground and signage textures, the rack faces. The only renderer
that can draw them is the browser, and a browser cannot write to disk. Without
this the only route from a canvas back to the repo was copying a base64 string
out of the devtools console by hand, which is slow and gets a character wrong.

    fetch('/_put/assets/brand/share-card.jpg', {method:'PUT', body: blob})

Writes are confined to the repo root and rejected for anything that resolves
outside it. Read-only otherwise, and it is a dev tool: do not run it anywhere
that is not a local machine.
"""

import http.server
import os
import sys
import posixpath
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_PUT(self):
        if not self.path.startswith('/_put/'):
            self.send_error(404, 'PUT only under /_put/')
            return

        rel = posixpath.normpath(self.path[len('/_put/'):]).lstrip('/')
        dest = (ROOT / rel).resolve()
        # The check is on the RESOLVED path, so `..` and symlinks both land
        # inside the repo or not at all.
        if not str(dest).startswith(str(ROOT) + os.sep):
            self.send_error(403, 'outside the repo')
            return

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)

        print(f'PUT {rel}  {len(body)} bytes', flush=True)
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(f'{rel} {len(body)}\n'.encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def end_headers(self):
        # The game page and its assets change on every edit; a cached module is
        # a bug that looks like a code bug.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    print(f'walker dev server: {ROOT}  http://localhost:{port}', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
