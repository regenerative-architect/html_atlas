"""Working tools: the shared record engine and every purpose-built workbench.

Covers samples, saving and reloading, the IndexedDB backup copy, edit,
delete with Undo, JSON backup and restore, CSV formula protection, strict
import checks, and one specialist check per tool. Also checks that the
security lab shows hostile text as plain text.

Usage:  python3 tests/test_tools.py
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from _harness import ROOT, Page, Results, launch, serve

R = Results('tools')
srv, base = serve()
TOOLS = sorted(p.stem for p in (ROOT / 'integrations').glob('*.html'))

with sync_playwright() as p:
    b = launch(p)

    def tool(slug, act):
        def run():
            pg = Page(b, base, 'integrations/%s.html' % slug)
            try:
                act(pg, pg.page)
                pg.assert_clean()
            finally:
                pg.close()
        return run

    # ---- every tool: a sample is saved, shown, analysed and survives a reload
    def generic(pg, page):
        before = pg.text('#purpose-output')
        page.locator('#sample-load').click()
        assert '1 saved' in pg.text('#record-count'), 'sample not saved'
        assert page.locator('#records tr').count() == 1, 'sample row missing'
        assert pg.text('#purpose-output') != before, 'workbench did not update'
        pg.goto(page.url.split(base)[1])
        assert page.locator('#records tr').count() == 1, 'record lost after reload'
        assert 'Saved' in pg.text('#storage-health'), 'storage health not reporting'
    for slug in TOOLS:
        R.run('sample, workbench and reload: ' + slug, tool(slug, generic))

    # ---- engine features, exercised on the food garden planner
    def edit_delete_undo(pg, page):
        page.locator('#sample-load').click()
        page.get_by_role('button', name='Edit').first.click()
        page.locator('#field-crop').fill('Changed crop')
        page.locator('#record-save').click()
        assert 'Changed crop' in pg.text('#records')
        page.get_by_role('button', name='Delete').first.click()
        assert page.locator('#records tr').count() == 0
        page.locator('.toast button', has_text='Undo').click()
        assert page.locator('#records tr').count() == 1, 'Undo did not restore the record'
        assert 'Changed crop' in pg.text('#records')
    R.run('edit, delete and Undo', tool('food-garden', edit_delete_undo))

    def backup_roundtrip(pg, page):
        page.locator('#sample-load').click()
        page.locator('#sample-load').click()
        with page.expect_download() as d:
            page.locator('#integration-export').click()
        data = Path(d.value.path()).read_bytes()
        backup = json.loads(data)
        assert backup['format'] == 'atlas-integration/1' and len(backup['records']) == 2
        page.locator('#integration-clear').click()          # confirm() is accepted by the harness
        assert page.locator('#records tr').count() == 0
        page.locator('#integration-import').set_input_files({'name': 'backup.json', 'mimeType': 'application/json', 'buffer': data})
        page.wait_for_function("()=>document.querySelectorAll('#records tr').length===2")
        assert 'Validated and merged 2' in pg.text('#status')
    R.run('JSON backup, delete all, restore', tool('food-garden', backup_roundtrip))

    def import_rejects(pg, page):
        bad = json.dumps({'format': 'atlas-integration/1', 'project': 'another-tool', 'records': []}).encode()
        page.locator('#integration-import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': bad})
        page.wait_for_function("()=>document.getElementById('status').textContent.includes('Import stopped')")
        wrong = json.dumps({'format': 'atlas-integration/1', 'project': 'food-garden',
                            'records': [{'id': 'r1', 'crop': 'Beans', 'area': 'lots', 'yield': '2', 'date': '2026-05-01'}]}).encode()
        page.locator('#integration-import').set_input_files({'name': 'y.json', 'mimeType': 'application/json', 'buffer': wrong})
        page.wait_for_function("()=>document.getElementById('status').textContent.includes('not a number')")
        assert page.locator('#records tr').count() == 0
    R.run('import refuses other tools and bad values', tool('food-garden', import_rejects))

    def csv_guard(pg, page):
        page.locator('#field-crop').fill('=HYPERLINK("http://example.org","x")')
        page.locator('#field-area').fill('2')
        page.locator('#field-yield').fill('1')
        page.locator('#field-date').fill('2026-05-01')
        page.locator('#record-save').click()
        with page.expect_download() as d:
            page.locator('#integration-csv').click()
        text = Path(d.value.path()).read_text(encoding='utf-8-sig')
        assert '"\'=HYPERLINK' in text, 'formula was not neutralised: ' + text[:120]
    R.run('CSV export neutralises formulas', tool('food-garden', csv_guard))

    def idb_copy(pg, page):
        page.locator('#sample-load').click()
        page.wait_for_function("()=>document.getElementById('storage-health').textContent.includes('Saved')")
        page.wait_for_timeout(300)
        page.evaluate("()=>localStorage.clear()")      # as if the browser cleared its quick store
        pg.goto('integrations/food-garden.html')
        page.wait_for_function("()=>document.querySelectorAll('#records tr').length===1")
        assert 'Restored 1 record' in pg.text('#toast-region')
    R.run('IndexedDB copy restores cleared quick store', tool('food-garden', idb_copy))

    # ---- one specialist check per workbench
    def garden(pg, page):
        for k, v in [('crop', 'Peas'), ('area', '4'), ('yield', '3'), ('date', '2026-09-20')]:
            page.locator('#field-' + k).fill(v)
        page.locator('#record-save').click()
        assert '12 kg' in pg.text('#purpose-output')
        page.locator('#purpose-budget').fill('3')
        out = pg.text('#purpose-output')
        assert '−1 m²' in out or '-1 m²' in out
    R.run('garden yield and space budget', tool('food-garden', garden))

    def science(pg, page):
        page.locator('#purpose-value').fill('0')
        page.locator('#purpose-unit').select_option('c_f')
        page.locator('#purpose-convert').click()
        assert '32 °F' in pg.text('#conversion-out')
    R.run('science converts 0 °C to 32 °F', tool('science-workbench', science))

    def quests(pg, page):
        page.locator('#sample-load').click()
        page.locator('#purpose-output button').first.click()
        assert 'Completed with stated evidence: 1' in pg.text('#purpose-output')
        page.locator('#purpose-output button').first.click()
        assert 'Completed with stated evidence: 0' in pg.text('#purpose-output')
    R.run('quest completion toggles', tool('learning-quests', quests))

    def map_distance(pg, page):
        for place, lat, lon in [('A', '0', '0'), ('B', '0', '1')]:
            for k, v in [('place', place), ('lat', lat), ('lon', lon), ('description', 'known point')]:
                page.locator('#field-' + k).fill(v)
            page.locator('#record-save').click()
        page.locator('#purpose-from').select_option(index=0)
        page.locator('#purpose-to').select_option(index=1)
        page.locator('#purpose-distance').click()
        assert '111' in pg.text('#distance-result')
    R.run('map: one degree at the equator is about 111 km', tool('map-notebook', map_distance))

    def dataset(pg, page):
        for name, val, unit, u in [('a', '10', 'kg', '1'), ('b', '20', 'kg', '2'), ('c', '9', 'm', '1')]:
            for k, v in [('label', name), ('value', val), ('unit', unit), ('uncertainty', u)]:
                page.locator('#field-' + k).fill(v)
            page.locator('#record-save').click()
        txt = pg.text('#purpose-output')
        assert 'kg' in txt and '15' in txt
    R.run('dataset groups by unit before averaging', tool('dataset-explorer', dataset))

    def archive(pg, page):
        for title, notes in [('First', '[[Second]]'), ('Second', '[[Absent]]')]:
            for k, v in [('title', title), ('source', 'https://example.org/shared'), ('notes', notes)]:
                page.locator('#field-' + k).fill(v)
            page.locator('#record-save').click()
        x = pg.text('#purpose-output')
        assert 'resolved' in x and 'missing target' in x
    R.run('archive backlinks resolve and flag missing targets', tool('offline-archive', archive))

    def field_survey(pg, page):
        for label, unit in [('S1', 'mg/L'), ('S1', 'ppm')]:
            for k, v in [('location', 'site'), ('sample', label), ('reading', '15'), ('unit', unit), ('method', 'calibrated method log')]:
                page.locator('#field-' + k).fill(v)
            page.locator('#record-save').click()
        assert 'Duplicate sample identifiers: S1' in pg.text('#purpose-output')
    R.run('field survey flags duplicate sample ids', tool('field-survey', field_survey))

    def decisions(pg, page):
        page.locator('#sample-load').click()
        page.locator('#purpose-stage').select_option('Deferred')
        assert 'Displayed proposals: 0' in pg.text('#purpose-output')
        page.locator('#purpose-stage').select_option('Proposed')
        assert 'Displayed proposals: 1' in pg.text('#purpose-output')
    R.run('decision register filters by stage', tool('community-decisions', decisions))

    def publishing(pg, page):
        page.locator('#sample-load').click()
        page.get_by_role('button', name='Edit').first.click()
        page.locator('#field-state').select_option('Draft')
        page.locator('#record-save').click()
        page.locator('#purpose-export').click()
        assert 'does not meet' in pg.text('#purpose-status')
        page.get_by_role('button', name='Edit').first.click()
        page.locator('#field-state').select_option('Ready')
        page.locator('#record-save').click()
        page.locator('#purpose-export').click()
        assert 'downloaded' in pg.text('#purpose-status')
    R.run('publishing desk gates on review state', tool('publishing-desk', publishing))

    def collaboration(pg, page):
        page.locator('#sample-load').click()
        before = pg.text('#records')
        page.locator('#purpose-output button').first.click()
        assert pg.text('#records') != before, 'state did not advance'
    R.run('task board advances a task', tool('collaboration-studio', collaboration))

    def ai_eval(pg, page):
        page.locator('#sample-load').click()
        page.get_by_role('button', name='Edit').first.click()
        page.locator('#field-result').select_option('Uncertain')
        page.locator('#record-save').click()
        assert 'No reviewed tests' in pg.text('#purpose-output')
        page.get_by_role('button', name='Edit').first.click()
        page.locator('#field-result').select_option('Pass')
        page.locator('#record-save').click()
        assert '100%' in pg.text('#purpose-output')
    R.run('AI evaluation counts only reviewed tests', tool('ai-evaluation', ai_eval))

    def deployment(pg, page):
        page.locator('#sample-load').click()
        assert 'NOT SATISFIED' in pg.text('#purpose-output')
    R.run('release gate stays closed without evidence', tool('deployment-audit', deployment))

    def expiry(pg, page):
        for _ in range(5):
            page.locator('#sample-load').click()
        page.locator('#purpose-window').fill('0')
        out = pg.text('#purpose-output')
        assert 'Items requiring review: 1 of 5' in out, out[:200]
        page.locator('#purpose-window').fill('60')
        assert 'Items requiring review: 2 of 5' in pg.text('#purpose-output')
    R.run('emergency kit expiry window (relative sample dates)', tool('emergency-kit', expiry))

    def exchange(pg, page):
        page.locator('#sample-load').click()
        with page.expect_download() as d:
            page.locator('#purpose-export').click()
        assert d.value.suggested_filename == 'interchange_manifest.json'
    R.run('exchange hub builds a manifest', tool('exchange-hub', exchange))

    def restoration(pg, page):
        for k, v in [('plot', 'A'), ('baseline', '0'), ('current', '15'), ('metric', 'plants')]:
            page.locator('#field-' + k).fill(v)
        page.locator('#record-save').click()
        assert 'not available' in pg.text('#purpose-output')
    R.run('restoration refuses a percentage from a zero baseline', tool('restoration-monitor', restoration))

    # ---- the two new tools
    def compassion(pg, page):
        page.locator('#sample-load').click()
        page.locator('#cm-pick').select_option(index=2)          # the saved sample
        draft = page.locator('#cm-draft').input_value()
        assert draft.startswith('Hi Flatmates,') and 'I feel frustrated' in draft and draft.rstrip().endswith('what would.')
        assert 'No harsh patterns' in pg.text('#purpose-output')
        page.locator('#cm-rough').click()
        out = pg.text('#purpose-output')
        for expected in ('threat', 'Labels judge', 'Absolutes', 'demand', 'capitals', 'A kinder rewrite'):
            assert expected in out, expected + ' not flagged'
        page.locator('#cm-draft').fill('Would you be willing to wash up tonight?')
        assert 'No harsh patterns' in pg.text('#purpose-output')
        with page.expect_download() as d:
            page.locator('#purpose-export').click()
        assert Path(d.value.path()).read_text().startswith('Would you be willing')
    R.run('compassionate messages: compose, check, rough draft, download', tool('compassionate-messages', compassion))

    def mutual(pg, page):
        for _ in range(6):
            page.locator('#sample-load').click()
        out = pg.text('#purpose-output')
        assert 'Possible matches: 2' in out, out[:300]
        assert 'Can drive on weekday mornings' in out and 'same area (Riverside)' in out
        page.locator('#ma-view').select_option('ending')
        out = pg.text('#purpose-output')
        assert 'Ended: 1' in out and 'Ending within three days: 1' in out
        page.locator('#ma-view').select_option('privacy')
        assert 'street address' in pg.text('#purpose-output')
        with page.expect_download() as d:
            page.locator('#purpose-export').click()
        text = Path(d.value.path()).read_text()
        assert 'Contact:' not in text and 'Notes:' not in text and 'Fix a dripping kitchen tap' not in text
        page.locator('#ma-names').check()
        with page.expect_download() as d:
            page.locator('#purpose-export').click()
        assert 'Contact: Dee' in Path(d.value.path()).read_text()
    R.run('mutual aid: matching, expiry, privacy check, minimal list', tool('mutual-aid', mutual))

    # ---- hostile text stays text
    def xss():
        pg = Page(b, base, 'labs/security.html')
        try:
            page = pg.page
            page.locator('#unsafe-string').fill('<img src=x onerror="window.__pwned=1">')
            page.locator('#render-safe').click()
            assert page.locator('#safe-target img').count() == 0
            assert page.evaluate('()=>window.__pwned') is None
            assert 'onerror' in pg.text('#danger-analysis')
            pg.assert_clean()
        finally:
            pg.close()
    R.run('security lab shows hostile markup as plain text', xss)
    b.close()
srv.shutdown()
sys.exit(1 if R.finish() else 0)
