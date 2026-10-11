from pathlib import Path
from playwright.sync_api import sync_playwright
import json,sys,os
root=Path(__file__).resolve().parent.parent;results=[]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)),args=['--no-sandbox'])
 for f in sorted((root/'labs').glob('*.html')):
  pg=b.new_page();pg.set_default_timeout(1500);errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  try:
   pg.evaluate('''() => {let d=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k)}})}''')
   pg.set_content(f.read_text(),wait_until='domcontentloaded',timeout=7000)
   assert pg.locator('h1').count()==1 and pg.locator('#live').count()==1
   assert not errs,repr(errs)
   results.append((f.stem,'PASS',''))
  except Exception as e:results.append((f.stem,'FAIL',str(e)[:150]))
  finally:pg.close()
 b.close()
print('LABS',len(results),'PASS',sum(s=='PASS' for _,s,_ in results),'FAIL',sum(s=='FAIL' for _,s,_ in results));print('Errors',[x for x in results if x[1]=='FAIL']);(Path(__file__).resolve().parent/'results_topics.json').write_text(json.dumps(results,indent=2))
if any(x[1]=='FAIL' for x in results):sys.exit(1)
