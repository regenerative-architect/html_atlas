from pathlib import Path
from playwright.sync_api import sync_playwright
import json,traceback,sys,os
ROOT=Path(__file__).resolve().parent.parent
results=[]
def check(name,fn):
 try:
  fn();results.append((name,'PASS',''))
 except Exception as e:results.append((name,'FAIL',str(e)[:350]))
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)),args=['--no-sandbox'])
 def open_page(path):
  page=browser.new_page(accept_downloads=True)
  page.set_default_timeout(3500)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.evaluate('''() => {const m=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})}''')
  page.set_content((ROOT/path).read_text(),wait_until='domcontentloaded',timeout=8000)
  return page,errors
 for path in sorted((ROOT/'integrations').glob('*.html')):
  relative=path.relative_to(ROOT)
  def case(rel=relative):
   print('Testing',rel,flush=True)
   pg,errs=open_page(rel)
   assert pg.locator('h1').count()==1, 'missing h1'
   assert pg.locator('main').count()==1, 'missing main'
   if str(rel).startswith('integrations/'):
    assert pg.locator('#purpose').count()==1,'missing special workbench'
    before=pg.locator('#purpose-output').inner_text()
    pg.locator('#sample-load').click(timeout=5000)
    assert '1 saved' in pg.locator('#record-count').inner_text(),'sample not saved'
    assert pg.locator('#purpose-output').inner_text()!=before, 'special output failed to update'
    assert pg.locator('#records tr').count()==1, 'sample row missing'
   assert not errs, 'browser JS errors: '+repr(errs)
   pg.close()
  check('initial page + sample '+str(relative),case)
 def run_special(rel,act):
  pg,errs=open_page(Path('integrations')/(rel+'.html'))
  try:
   act(pg)
   assert not errs,'JS '+repr(errs)
  finally:pg.close()
 def garden(pg):
  pg.locator('#field-crop').fill('Peas');pg.locator('#field-area').fill('4');pg.locator('#field-yield').fill('3');pg.locator('#field-date').fill('2026-09-20');pg.locator('#record-save').click();assert '12 kg' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-budget').fill('3');assert '−1 m²' in pg.locator('#purpose-output').inner_text() or '-1 m²' in pg.locator('#purpose-output').inner_text()
 check('garden arithmetic and budget',lambda:run_special('food-garden',garden))
 def science(pg):
  pg.locator('#purpose-value').fill('0');pg.locator('#purpose-unit').select_option('c_f');pg.locator('#purpose-convert').click();assert '32 °F' in pg.locator('#conversion-out').inner_text()
 check('science unit conversion zero Celsius',lambda:run_special('science-workbench',science))
 def quest(pg):
  pg.locator('#sample-load').click();pg.locator('#purpose-output button').first.click();assert 'Completed with stated evidence: 1' in pg.locator('#purpose-output').inner_text();pg.locator('#purpose-output button').first.click();assert 'Completed with stated evidence: 0' in pg.locator('#purpose-output').inner_text()
 check('quest completion toggles',lambda:run_special('learning-quests',quest))
 def map_distance(pg):
  for place,lat,lon in [('A','0','0'),('B','0','1')]:
   for id,v in [('place',place),('lat',lat),('lon',lon),('description','known point')]:pg.locator('#field-'+id).fill(v)
   pg.locator('#record-save').click()
  pg.locator('#purpose-from').select_option(index=0);pg.locator('#purpose-to').select_option(index=1);pg.locator('#purpose-distance').click();assert '111' in pg.locator('#distance-result').inner_text()
 check('map great circle 1 degree equator',lambda:run_special('map-notebook',map_distance))
 def dataset(pg):
  for name,val,unit,u in [('a','10','kg','1'),('b','20','kg','2'),('c','9','m','1')]:
   for id,v in [('label',name),('value',val),('unit',unit),('uncertainty',u)]:pg.locator('#field-'+id).fill(v)
   pg.locator('#record-save').click()
  txt=pg.locator('#purpose-output').inner_text();assert 'kg' in txt and 'm' in txt and '15' in txt
 check('unit grouping mean and uncertainty',lambda:run_special('dataset-explorer',dataset))
 def pub(pg):
  pg.locator('#sample-load').click();pg.locator('#purpose-export').click();assert 'does not meet' in pg.locator('#purpose-status').inner_text();pg.locator('#records button').first.click();pg.locator('#field-state').select_option('Ready');pg.locator('#record-save').click();pg.locator('#purpose-export').click();assert 'downloaded' in pg.locator('#purpose-status').inner_text()
 check('publication metadata gate',lambda:run_special('publishing-desk',pub))
 def collab(pg):
  pg.locator('#sample-load').click();pg.locator('#purpose-output button').first.click();assert 'In progress (1)' in pg.locator('#purpose-output').inner_text();assert 'In progress' in pg.locator('#records').inner_text()
 check('kanban state advances',lambda:run_special('collaboration-studio',collab))
 def report(pg):
  pg.locator('#sample-load').click();pg.locator('#purpose-export').click();assert pg.locator('#purpose-output').count()==1
 check('exchange manifest click',lambda:run_special('exchange-hub',report))
 def persist(pg):
  pg.locator('#sample-load').click();pg.locator('#records button').first.click();pg.locator('#field-crop').fill('Changed');pg.locator('#record-save').click();assert 'Changed' in pg.locator('#records').inner_text();pg.once('dialog',lambda dialog:dialog.accept());pg.locator('#records button').nth(1).click();assert pg.locator('#records tr').count()==0
 check('record edit delete',lambda:run_special('food-garden',persist))
 def escape_xss():
  pg,errors=open_page(Path('labs/security.html'))
  try:
   assert pg.locator('#render-safe').count()==1
   pg.locator('#unsafe-string').fill('<img src=x onerror=alert(1)>')
   pg.locator('#render-safe').click();assert pg.locator('#safe-target img').count()==0;assert not errors
  finally:pg.close()
 check('XSS plain text injection',escape_xss)
 browser.close()
passed=sum(s=='PASS' for _,s,_ in results);failed=len(results)-passed
(Path(__file__).resolve().parent/'results_integrations.json').write_text(json.dumps({'total':len(results),'passed':passed,'failed':failed,'results':[{'test':n,'status':s,'detail':e} for n,s,e in results]},indent=2))
print('BROWSER_UI_TESTS',len(results),'PASS',passed,'FAIL',failed)
for n,s,e in results:
 if s=='FAIL':print('FAIL',n,e)
 if s=="PASS":print("OK",n,flush=True)
if failed:sys.exit(1)
