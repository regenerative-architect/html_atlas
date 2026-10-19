from pathlib import Path
from playwright.sync_api import sync_playwright
import json,sys,os
root=Path(__file__).resolve().parent.parent
results=[]
def test(name,fn):
 try:fn();results.append((name,'PASS',''))
 except Exception as e:results.append((name,'FAIL',str(e)[:230]))
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)),args=['--no-sandbox'])
 def page(slug,group='integrations'):
  pg=b.new_page(accept_downloads=True);pg.set_default_timeout(2000);errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.evaluate('''() => {let d=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d.has(k)?d.get(k):null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k)}})}''')
  pg.set_content((root/group/(slug+'.html')).read_text(),wait_until='domcontentloaded',timeout=9000)
  return pg,errs
 def simple(slug,act):
  pg,errors=page(slug)
  try:act(pg);assert not errors,str(errors)
  finally:pg.close()
 def archive(pg):
  for title,notes in [('First','[[Second]]'),('Second','[[Absent]]')]:
   for k,v in [('title',title),('source','https://example.org/shared'),('notes',notes)]:pg.locator('#field-'+k).fill(v)
   pg.locator('#record-save').click()
  x=pg.locator('#purpose-output').inner_text();assert 'resolved' in x and 'missing target' in x and 'Repeated source URLs' in x
 test('archive resolved and broken backlinks',lambda:simple('offline-archive',archive))
 def field(pg):
  for label,unit in [('S1','mg/L'),('S1','ppm')]:
   for k,v in [('location','site'),('sample',label),('reading','15'),('unit',unit),('method','calibrated method log')]:pg.locator('#field-'+k).fill(v)
   pg.locator('#record-save').click()
  x=pg.locator('#purpose-output').inner_text();assert 'Duplicate sample identifiers: S1' in x and 'mg/L' in x and 'ppm' in x
 test('field survey duplicates and units',lambda:simple('field-survey',field))
 def review(pg):
  pg.locator('#sample-load').click();x=pg.locator('#purpose-output').inner_text();assert 'Unverified' in x
 test('evidence ledger human statuses',lambda:simple('evidence-ledger',review))
 def inventory(pg):
  pg.locator('#sample-load').click();assert 'High' in pg.locator('#purpose-output').inner_text()
 test('resilience priority inventory',lambda:simple('household-resilience',inventory))
 def decision(pg):
  pg.locator('#sample-load').click();pg.locator('#purpose-stage').select_option('Deferred');assert 'Displayed proposals: 0' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-stage').select_option('Proposed');assert 'Displayed proposals: 1' in pg.locator('#purpose-output').inner_text()
 test('community decision stage filter',lambda:simple('community-decisions',decision))
 def story(pg):
  pg.locator('#sample-load').click();assert 'Motif' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('story motif and document action',lambda:simple('story-studio',story))
 def audio(pg):
  pg.locator('#sample-load').click();assert 'Transcript words' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('audio transcript analysis and export',lambda:simple('audio-journal',audio))
 def accessibility(pg):
  pg.locator('#sample-load').click();assert 'Pass' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('accessibility defect triage and export',lambda:simple('accessibility-audit',accessibility))
 def privacy(pg):
  pg.locator('#sample-load').click();assert 'Essential records: 1' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('privacy necessity inventory and export',lambda:simple('privacy-workbench',privacy))
 def restoration(pg):
  for k,v in [('plot','A'),('baseline','0'),('current','15'),('metric','plants')]:pg.locator('#field-'+k).fill(v)
  pg.locator('#record-save').click();assert 'not available' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('restoration zero baseline and export',lambda:simple('restoration-monitor',restoration))
 def eval(pg):
  pg.locator('#sample-load').click();pg.locator('#records button').first.click();pg.locator('#field-result').select_option('Uncertain');pg.locator('#record-save').click();assert 'No reviewed tests' in pg.locator('#purpose-output').inner_text();pg.locator('#records button').first.click();pg.locator('#field-result').select_option('Pass');pg.locator('#record-save').click();assert '100%' in pg.locator('#purpose-output').inner_text()
 test('AI evaluation reviewed denominator',lambda:simple('ai-evaluation',eval))
 def deployment(pg):
  pg.locator('#sample-load').click();assert 'NOT SATISFIED' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('deployment missing-area gate',lambda:simple('deployment-audit',deployment))
 def expiry(pg):
  pg.locator('#sample-load').click();pg.locator('#purpose-window').fill('0');assert 'Items requiring review:' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('expiry horizon changes and export',lambda:simple('emergency-kit',expiry))
 def careers(pg):
  pg.locator('#sample-load').click();assert 'Transferable skill' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-export').click()
 test('careers skill crosswalk export',lambda:simple('careers-map',careers))
 def interchange(pg):
  pg.locator('#sample-load').click()
  with pg.expect_download(timeout=3000) as out: pg.locator('#purpose-export').click()
  d=out.value;assert d.suggested_filename=='interchange_manifest.json'
 test('exchange manifest generated download',lambda:simple('exchange-hub',interchange))
 def roundtrip(pg):
  pg.locator('#sample-load').click()
  with pg.expect_download(timeout=3000) as down:pg.locator('#integration-export').click()
  path=down.value.path(); data=Path(path).read_bytes()
  pg.once('dialog',lambda d:d.accept());pg.locator('#integration-clear').click();assert pg.locator('#records tr').count()==0
  pg.locator('#integration-import').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':data})
  pg.wait_for_function("()=>document.querySelectorAll('#records tr').length===1")  # the import reads the file asynchronously: wait for it instead of racing it
  assert pg.locator('#records tr').count()==1
  assert 'Validated and merged 1' in pg.locator('#status').inner_text()
 test('JSON backup export clear restore',lambda:simple('food-garden',roundtrip))
 def index():
  pg=b.new_page();pg.set_default_timeout(2200)
  pg.evaluate('''() => {let d=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k)}})}''')
  pg.set_content((root/'index.html').read_text(),wait_until='domcontentloaded',timeout=9000)
  try:
   assert pg.locator('article[data-id]').count()==63
   pg.locator('#atlas-search').fill('great-circle');assert 'great-circle' in pg.locator('article[data-id]:not([hidden])').first.get_attribute('data-search')
  finally:pg.close()
 test('master index cross-lab specialty search',index)
 def rapid_toggle():
  # regression: a second change inside the rate-limit window used to be dropped, leaving the screen and the saved state disagreeing
  pg=b.new_page();pg.set_default_timeout(3000)
  pg.evaluate('''() => {let d=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k)}})}''')
  pg.set_content((root/'index.html').read_text(),wait_until='domcontentloaded',timeout=9000)
  try:
   pg.wait_for_function("()=>!document.getElementById('splash').classList.contains('is-active')",timeout=4000)
   box=pg.locator('#completed')
   box.click();pg.wait_for_timeout(60);box.click()
   pg.wait_for_timeout(900)
   assert not box.is_checked() and pg.locator('#progress-number').text_content()=='0 / 64'
   box.click();pg.wait_for_timeout(40);box.click();pg.wait_for_timeout(40);box.click()
   pg.wait_for_timeout(900)
   assert box.is_checked() and pg.locator('#progress-number').text_content()=='1 / 64'
  finally:pg.close()
 test('completion checkbox converges after rapid toggles',rapid_toggle)
 def lock_test():
  # regression: overlapping read-modify-write cycles used to overwrite each other
  pg=b.new_page();pg.set_default_timeout(3000)
  pg.evaluate('''() => {let d=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k)}})}''')
  pg.set_content((root/'labs'/'security.html').read_text(),wait_until='domcontentloaded',timeout=9000)
  try:
   n=pg.evaluate('''async()=>{await saveState({done:[],notes:'',hud:null});const ids=Array.from({length:20},(_,i)=>'labs/lock-'+i+'.html');await Promise.all([...ids.map(id=>markDone(id,true)),touchStreak()]);const s=await getState();return [s.done.length,!!(s.hud&&s.hud.lastVisit)]}''')
   assert n==[20,True],n
  finally:pg.close()
 test('state lock keeps 20 concurrent writes and the streak update',lock_test)
 b.close()
print('EXTRA',len(results),'PASS',sum(x[1]=='PASS' for x in results),'FAIL',sum(x[1]=='FAIL' for x in results))
for n,s,e in results:
 if s=='FAIL':print('FAIL',n,repr(e))
(Path(__file__).resolve().parent/'results_workflows.json').write_text(json.dumps(results,indent=2))
if any(x[1]=='FAIL' for x in results):sys.exit(1)
