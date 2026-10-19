"""Automated accessibility scan of every page with axe-core, in the Night and
Day themes, plus the High contrast theme on the home page.

axe-core is not bundled (the atlas ships no third-party code). Install it
with `npm install axe-core` and point AXE_PATH at axe.min.js:

    AXE_PATH=node_modules/axe-core/axe.min.js python3 tests/test_a11y.py

Automated checks find only part of the barriers people meet; see TESTING.md
for the manual checks that matter just as much.
"""
import os
import sys
from playwright.sync_api import sync_playwright
from _harness import Results, all_pages, launch, serve

AXE = os.environ.get('AXE_PATH')
if not AXE or not os.path.exists(AXE):
    print('AXE_PATH is not set to axe.min.js; skipping the automated accessibility scan.')
    sys.exit(0)

R = Results('a11y')
srv, base = serve()
with sync_playwright() as p:
    b = launch(p)

    def scan(rel, theme):
        def run():
            ctx = b.new_context(service_workers='block', color_scheme='light' if theme == 'day' else 'dark')
            ctx.add_init_script("try{localStorage.setItem('atlas_settings_v3',JSON.stringify({theme:'%s'}))}catch(e){}" % theme)
            page = ctx.new_page()
            try:
                page.goto(base + rel, wait_until='load')
                page.wait_for_timeout(300)
                page.add_script_tag(path=AXE)
                v = page.evaluate("""async()=>(await axe.run(document,{resultTypes:['violations']})).violations
                    .map(x=>x.id+' ('+x.impact+'): '+x.nodes.slice(0,2).map(n=>n.target.join(' ')).join(', '))""")
                assert not v, '; '.join(v)[:400]
            finally:
                ctx.close()
        return run

    for theme in ('night', 'day'):
        for rel in all_pages():
            R.run('axe %s: %s' % (theme, rel), scan(rel, theme))
    R.run('axe contrast: index.html', scan('index.html', 'contrast'))
    b.close()
srv.shutdown()
sys.exit(1 if R.finish() else 0)
