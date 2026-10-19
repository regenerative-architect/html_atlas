"""Shared helpers for the atlas test suites.

The suites serve this folder over HTTP on a free local port (127.0.0.1 only),
open pages in headless Chromium with Playwright, and record every page error
and console error. Nothing is contacted outside this computer.

Environment variables:
  CHROMIUM_PATH  optional path to a Chromium/Chrome executable
  AXE_PATH       path to axe.min.js (axe-core) for the accessibility suite
"""
import functools
import http.server
import json
import os
import socketserver
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent

# Messages that come from the headless test browser itself, not from the atlas.
IGNORE = ('Service Worker registration blocked', 'WebGPU', 'GPU stall', 'WebGL',
          'GroupMarkerNotSet', 'Automatic fallback to software')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.webmanifest': 'application/manifest+json', '.js': 'text/javascript',
                      '.json': 'application/json', '.wasm': 'application/wasm', '.md': 'text/markdown'}

    def log_message(self, *args):
        pass


def serve():
    """Serve the atlas folder; returns (server, base_url)."""
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


def launch(playwright):
    exe = os.environ.get('CHROMIUM_PATH') or None
    return playwright.chromium.launch(headless=True, executable_path=exe, args=['--no-sandbox'])


def all_pages():
    pages = ['index.html']
    for group in ('labs', 'integrations'):
        pages += sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / group).glob('*.html'))
    return pages


class Page:
    """A fresh browser context and page with error collection."""

    def __init__(self, browser, base, rel, service_workers='block', color_scheme='dark', width=1280, timeout=4000):
        self.ctx = browser.new_context(accept_downloads=True, service_workers=service_workers,
                                       color_scheme=color_scheme, viewport={'width': width, 'height': 900})
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(timeout)
        self.errors, self.console, self.outside = [], [], []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)[:300]))
        self.page.on('console', lambda m: self.console.append(m.text[:300])
                     if m.type == 'error' and not any(s in m.text for s in IGNORE) else None)
        self.page.on('request', lambda r: self.outside.append(r.url)
                     if r.url.startswith(('http://', 'https://')) and not r.url.startswith(base) else None)
        self.page.on('dialog', lambda d: d.accept())
        self.base = base
        if rel:
            self.goto(rel)

    def goto(self, rel):
        self.page.goto(self.base + rel, wait_until='load')
        self.page.wait_for_timeout(250)

    def text(self, selector):
        return self.page.locator(selector).inner_text()

    def assert_clean(self):
        assert not self.errors, 'page errors: %r' % self.errors[:3]
        assert not self.console, 'console errors: %r' % self.console[:3]
        assert not self.outside, 'requests to other sites: %r' % self.outside[:3]

    def close(self):
        self.ctx.close()


class Results:
    def __init__(self, name):
        self.name, self.rows, self.started = name, [], time.time()

    def run(self, label, fn):
        try:
            fn()
            self.rows.append((label, 'PASS', ''))
            print('PASS', label, flush=True)
        except Exception as e:  # report and continue with the next test
            self.rows.append((label, 'FAIL', str(e).splitlines()[0][:400] if str(e) else repr(e)))
            print('FAIL', label, '-', self.rows[-1][2], flush=True)

    def finish(self):
        passed = sum(1 for r in self.rows if r[1] == 'PASS')
        failed = len(self.rows) - passed
        out = {'suite': self.name, 'total': len(self.rows), 'passed': passed, 'failed': failed,
               'seconds': round(time.time() - self.started, 1),
               'results': [{'test': n, 'status': s, 'detail': d} for n, s, d in self.rows]}
        (HERE / ('results_%s.json' % self.name)).write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')
        print('%s: %d tests, %d passed, %d failed' % (self.name.upper(), len(self.rows), passed, failed))
        return failed
