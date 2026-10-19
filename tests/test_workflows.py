"""Atlas-wide features: home page counts and search, the command palette,
comfort settings, the privacy panel, page notes, completion and progress
backups, learning paths, the breathing pause, print styles, and the
offline copy (service worker) over HTTP.

Usage:  python3 tests/test_workflows.py
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from _harness import Page, Results, launch, serve

R = Results('workflows')
srv, base = serve()

with sync_playwright() as p:
    b = launch(p)

    def scenario(rel, act, **kw):
        def run():
            pg = Page(b, base, rel, **kw)
            try:
                act(pg, pg.page)
                pg.assert_clean()
            finally:
                pg.close()
        return run

    def home_counts(pg, page):
        assert page.locator('article.card[data-id]').count() == 68
        assert pg.text('#progress-number') == '0 of 68'
        assert pg.text('.hero-facts') .startswith('44')
        assert '24' in pg.text('.hero-facts')
        assert page.locator('#const-svg .node').count() == 68
    R.run('home page counts: 44 labs, 24 tools, 68 map points', scenario('index.html', home_counts))

    def catalog_search(pg, page):
        page.locator('#atlas-search').fill('peace')
        page.wait_for_timeout(300)
        visible = page.locator('article.card[data-id]:not([hidden]) h4')
        assert visible.count() >= 1 and 'Compassionate' in ' '.join(visible.all_inner_texts())
        page.locator('#atlas-search').fill('great-circle')
        page.wait_for_timeout(300)
        assert 'Geographic' in ' '.join(page.locator('article.card[data-id]:not([hidden]) h4').all_inner_texts())
        page.locator('#atlas-search').fill('')
        page.locator('#group-filter').select_option('integrations/')
        page.wait_for_timeout(200)
        assert page.locator('article.card[data-id]:not([hidden])').count() == 24
    R.run('catalog search: synonyms, specialties and filters', scenario('index.html', catalog_search))

    def palette(pg, page):
        page.keyboard.press('Control+k')
        page.wait_for_selector('#atlas-palette[open]')
        page.locator('#palette-input').fill('mutual aid')
        page.wait_for_timeout(250)
        assert 'Mutual aid' in pg.text('#palette-list')
        page.keyboard.press('Enter')
        page.wait_for_url('**/integrations/mutual-aid.html')
        page.wait_for_load_state('load')
        assert 'Mutual aid' in pg.text('h1')
    R.run('command palette finds and opens a page', scenario('labs/security.html', palette))

    def palette_terms(pg, page):
        page.locator('#open-palette').click()
        page.locator('#palette-input').fill('contrast ratio')
        page.wait_for_timeout(250)
        assert 'Contrast ratio' in pg.text('#palette-list')
        page.keyboard.press('Escape')
        page.wait_for_timeout(150)
        assert page.locator('#atlas-palette[open]').count() == 0
    R.run('command palette explains glossary terms', scenario('index.html', palette_terms))

    def comfort(pg, page):
        page.locator('#open-comfort').click()
        page.locator('#atlas-comfort input[name="theme"][value="day"]').check()
        page.locator('#atlas-comfort input[name="text"][value="large"]').check()
        assert page.evaluate("()=>document.documentElement.dataset.theme") == 'day'
        page.locator('#atlas-comfort .dialog-foot [data-close]').click()
        pg.goto('labs/privacy.html')
        assert page.evaluate("()=>document.documentElement.dataset.theme") == 'day', 'theme did not persist'
        size = page.evaluate("()=>parseFloat(getComputedStyle(document.documentElement).fontSize)")
        assert size > 16, 'large text did not apply (%s px)' % size
    R.run('comfort settings apply and persist across pages', scenario('index.html', comfort))

    def reduced_motion():
        ctx = b.new_context(reduced_motion='reduce', service_workers='block')
        page = ctx.new_page()
        try:
            page.goto(base + 'index.html', wait_until='load')
            assert page.evaluate("()=>document.documentElement.dataset.motion") == 'reduced'
            assert page.evaluate("()=>getComputedStyle(document.querySelector('.parallax-wrap')).perspective") == 'none'
        finally:
            ctx.close()
    R.run('device reduced-motion preference is respected', reduced_motion)

    def privacy_panel(pg, page):
        page.locator('#open-privacy').click()
        page.wait_for_selector('#atlas-privacy[open]')
        facts = pg.text('#privacy-facts')
        assert 'Privacy lock is on' in facts and 'contacted 0 outside websites' in facts
    R.run('privacy panel reports the lock and zero outside connections', scenario('labs/hosting.html', privacy_panel))

    def notes_and_completion(pg, page):
        page.locator('#page-notes').fill('Try the consent centre with the youth council.')
        page.wait_for_timeout(900)
        box = page.locator('#completed')
        box.click(); page.wait_for_timeout(60); box.click()                 # rapid toggles must converge
        page.wait_for_timeout(60); box.click()
        page.wait_for_timeout(900)
        assert box.is_checked()
        pg.goto('index.html')
        assert pg.text('#progress-number') == '1 of 68'
        assert 'Privacy' in pg.text('#notes-overview')
        assert page.locator('#const-svg .node.done').count() == 1
    R.run('page notes and completion reach the home dashboard', scenario('labs/privacy.html', notes_and_completion))

    def state_lock(pg, page):
        n = page.evaluate("""async()=>{await saveState({done:[],notes:'',hud:null});
          const ids=Array.from({length:20},(_,i)=>'labs/lock-'+i+'.html');
          await Promise.all([...ids.map(id=>markDone(id,true)),touchStreak()]);
          const s=await getState();return [s.done.length,!!(s.hud&&s.hud.lastVisit)]}""")
        assert n == [20, True], n
    R.run('state lock keeps 20 concurrent writes and the rhythm update', scenario('labs/security.html', state_lock))

    def progress_roundtrip(pg, page):
        page.evaluate("async()=>{await markDone('labs/privacy.html',true);await markDone('integrations/mutual-aid.html',true)}")
        pg.goto('index.html')
        assert pg.text('#progress-number') == '2 of 68'
        with page.expect_download() as d:
            page.locator('#export-progress').click()
        data = Path(d.value.path()).read_bytes()
        assert json.loads(data)['schema'] == 'atlas-progress/3'
        page.locator('#clear-progress').click()
        page.wait_for_function("()=>document.getElementById('progress-number').textContent==='0 of 68'")
        page.locator('#import-progress').set_input_files({'name': 'p.json', 'mimeType': 'application/json', 'buffer': data})
        page.wait_for_function("()=>document.getElementById('progress-number').textContent==='2 of 68'")
    R.run('progress backup, reset and restore', scenario('index.html', progress_roundtrip))

    def learning_path(pg, page):
        btn = page.locator('#path-foundations [data-follow]')
        btn.click()
        page.wait_for_timeout(300)
        assert btn.get_attribute('aria-pressed') == 'true'
        assert page.locator('#const-trail.on').count() == 1
        pg.goto('labs/semantic-html.html')
        assert 'Web foundations' in pg.text('body')
    R.run('following a learning path shows the trail and the path banner', scenario('index.html', learning_path))

    def pause(pg, page):
        page.locator('#open-comfort').click()
        page.locator('#open-pause').click()
        page.wait_for_selector('#atlas-pause[open]')
        page.locator('#breath-start').click()
        page.wait_for_timeout(500)
        assert pg.text('#breath-cue') != 'Ready when you are.'
        page.locator('#breath-stop').click()
    R.run('one-minute breathing pause starts and stops', scenario('index.html', pause))

    def print_styles(pg, page):
        page.emulate_media(media='print')
        hidden = page.evaluate("""()=>['.atlas-top','.side-nav','.page-actions','#atlas-ambient'].map(s=>{const e=document.querySelector(s);return !e||getComputedStyle(e).display==='none'})""")
        assert all(hidden), hidden
        assert page.evaluate("()=>getComputedStyle(document.body).backgroundColor") in ('rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)')
    R.run('print styles hide navigation and use a white page', scenario('labs/publishing.html', print_styles))

    def offline_copy():
        ctx = b.new_context(service_workers='allow')
        page = ctx.new_page()
        page.set_default_timeout(15000)
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        try:
            page.goto(base + 'index.html', wait_until='load')
            page.evaluate("async()=>{await navigator.serviceWorker.ready}")
            page.wait_for_function("""async()=>{const keys=await caches.keys();if(!keys.length)return false;
              const c=await caches.open(keys[0]);return !!(await c.match('./labs/privacy.html'))&&!!(await c.match('./integrations/mutual-aid.html'))}""", polling=500)
            ctx.set_offline(True)
            page.goto(base + 'labs/privacy.html', wait_until='load')
            assert page.locator('h1').count() == 1 and page.locator('#live .demo').count() == 1
            page.goto(base + 'integrations/mutual-aid.html', wait_until='load')
            assert 'Mutual aid' in page.locator('h1').inner_text()
            assert not errs, errs[:3]
        finally:
            ctx.close()
    R.run('offline copy: pages open with the network switched off', offline_copy)
    b.close()
srv.shutdown()
sys.exit(1 if R.finish() else 0)
