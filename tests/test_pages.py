"""Every page: loads over HTTP without errors, has the expected structure,
carries the privacy lock and the Zero Harm note, and contacts no other site.
Also opens a sample of pages straight from disk (file://).

Usage:  python3 tests/test_pages.py
"""
import sys
from playwright.sync_api import sync_playwright
from _harness import ROOT, Page, Results, all_pages, launch, serve

R = Results('pages')
srv, base = serve()
with sync_playwright() as p:
    b = launch(p)

    def check(rel):
        def run():
            pg = Page(b, base, rel)
            try:
                page = pg.page
                assert page.locator('h1').count() == 1, 'expected one h1'
                assert page.locator('main#main').count() == 1, 'expected one main'
                assert page.locator('meta[http-equiv="Content-Security-Policy"]').count() == 1, 'privacy lock missing'
                assert 'Zero Harm' in pg.text('footer.atlas-foot'), 'Zero Harm & Anti-Coercion note missing'
                if rel.startswith('labs/'):
                    assert page.locator('#live .demo').count() == 1, 'lab demo missing'
                    assert page.locator('#completed').count() == 1, 'completion checkbox missing'
                elif rel.startswith('integrations/'):
                    for sel in ('#record-form', '#purpose-output', '#records', '#integration-export', '#storage-health'):
                        assert page.locator(sel).count() == 1, sel + ' missing'
                    assert 'saved' in pg.text('#record-count'), 'record count not rendered'
                else:
                    assert page.locator('article.card[data-id]').count() == 68, 'expected 68 catalog cards'
                page.wait_for_timeout(150)
                pg.assert_clean()
            finally:
                pg.close()
        return run

    for rel in all_pages():
        R.run('loads cleanly: ' + rel, check(rel))

    def from_disk(rel):
        def run():
            ctx = b.new_context()
            page = ctx.new_page()
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            try:
                page.goto((ROOT / rel).as_uri(), wait_until='load')
                page.wait_for_timeout(400)
                assert page.locator('h1').count() == 1
                assert not errs, errs[:3]
            finally:
                ctx.close()
        return run

    for rel in ('index.html', 'labs/security.html', 'labs/workers-wasm.html', 'integrations/mutual-aid.html'):
        R.run('opens from disk (file://): ' + rel, from_disk(rel))
    b.close()
srv.shutdown()
sys.exit(1 if R.finish() else 0)
