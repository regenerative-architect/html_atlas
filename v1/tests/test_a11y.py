"""Accessibility audit of every page with axe-core (optional: needs a local copy of axe-core).

Usage:  AXE_PATH=/path/to/axe.min.js python3 tests/test_a11y.py
axe-core is not bundled with the atlas (the pages themselves stay dependency-free). Get the file once with
`npm install axe-core` and point AXE_PATH at node_modules/axe-core/axe.min.js. Without AXE_PATH this test
prints a notice and exits 0 so it never blocks a run that has no copy of axe-core.
It found, among others, a static-image role wrapped around clickable links (nested-interactive) and a bare <img> with no alt text.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,sys,os
root=Path(__file__).resolve().parent.parent
axe=os.environ.get('AXE_PATH')
if not axe or not Path(axe).is_file():
 print('SKIPPED: set AXE_PATH to a local axe-core axe.min.js to run the accessibility audit');sys.exit(0)
pages=['index.html']+sorted(str(p.relative_to(root)) for g in ('labs','integrations') for p in (root/g).glob('*.html'))
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)),args=['--no-sandbox'])
 for rel in pages:
  pg=b.new_page();pg.set_default_timeout(15000)
  try:
   pg.set_content((root/rel).read_text(),wait_until='domcontentloaded',timeout=9000)
   if rel=='index.html':pg.wait_for_function("()=>!document.getElementById('splash').classList.contains('is-active')",timeout=5000)
   pg.wait_for_timeout(250)
   pg.add_script_tag(path=axe)
   found=pg.evaluate("async()=>(await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.impact+' '+v.id+' x'+v.nodes.length)")
   results.append((rel,'FAIL' if found else 'PASS',found))
  except Exception as e:results.append((rel,'FAIL',[str(e)[:200]]))
  finally:pg.close()
 b.close()
bad=[r for r in results if r[1]=='FAIL']
print('ACCESSIBILITY (axe-core)',len(results),'pages | PASS',len(results)-len(bad),'FAIL',len(bad))
for rel,_,found in bad:print('FAIL',rel,found)
(Path(__file__).resolve().parent/'results_a11y.json').write_text(json.dumps(results,indent=2))
if bad:sys.exit(1)
