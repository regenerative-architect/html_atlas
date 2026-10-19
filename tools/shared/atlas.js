'use strict';
/* =====================================================================
   ATLAS RUNTIME v3 — shared by every page (copied in by the build tool).
   Edit tools/shared/atlas.js, then run: python3 tools/atlas_build.py

   What lives here, in order:
     0. Small helpers page scripts rely on ($, say, download, …)
     1. The atlas store: progress, notes and rhythm, saved on this device
     2. Comfort settings (theme, motion, light, text size, reading spacing)
     3. Toast messages (with Undo)
     4. Page chrome: completion box, sidebar contents, print, source viewer
     5. Command palette (Ctrl/⌘ K or "/")
     6. Privacy lock, transparency meter, offline copy and "erase everything"
     7. Notes on this page
     8. A one-minute pause (box breathing)
     9. Ambient light: fireflies and bokeh drawn behind the glass
    10. Learning-path banner and boot sequence
   Nothing in this file contacts any server. Everything is local.
   ===================================================================== */

/* ---------- 0. Helpers kept as plain globals for page scripts -------- */
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const safe=v=>String(v??'');
/* When an action runs again and its result comes out the same, briefly
   highlight the result so the person can see it really was checked again. */
function flashSame(e){if(!e)return;e.classList.remove('refreshed');void e.offsetWidth;e.classList.add('refreshed');clearTimeout(e._flashT);e._flashT=setTimeout(()=>e.classList.remove('refreshed'),800)}
const say=(v,id='#status')=>{const e=$(id);if(!e)return;const t=safe(v);if(t&&e.textContent===t)flashSame(e);e.textContent=t};
/* Save text as a file on this device (no upload; uses a temporary blob URL). */
function download(name,text,type='application/json'){
  const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type}));
  a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),2000);
}
/* Ignore repeats within `ms` (one-shot actions such as starting a download). */
function gentleLimit(fn,ms=350){let last=0;return(...args)=>{const now=Date.now();if(now-last<ms)return;last=now;return fn(...args)}}
/* Run at once, then collapse a burst of calls into one final run, so what
   is saved always matches the person's last action. */
function coalesceCalls(fn,ms=300){
  let timer=null,queued=false,latest=[];
  const settle=()=>{timer=null;if(queued){queued=false;fn(...latest)}};
  return(...args)=>{latest=args;if(timer===null)fn(...args);else{queued=true;clearTimeout(timer)}timer=setTimeout(settle,ms)};
}

/* ---------- 1. Atlas store --------------------------------------------
   PURPOSE: progress, notes and learning rhythm survive reloads, offline.
   HOW: IndexedDB first; every write is mirrored to localStorage; if
   IndexedDB is unavailable the mirror is used alone. The names below are
   unchanged from version 2, so earlier progress carries over untouched.
   EXTEND: add fields to the state object and call saveState(s). */
const ATLAS_DB='foster_navi_atlas_db',ATLAS_STORE='kv',ATLAS_KEY='foster_navi_atlas_v1';
let _atlasDbPromise=null;
function openAtlasDB(){
  if(_atlasDbPromise)return _atlasDbPromise;
  _atlasDbPromise=new Promise(resolve=>{
    try{
      if(!('indexedDB'in window)){resolve(null);return}
      const req=indexedDB.open(ATLAS_DB,1);
      req.onupgradeneeded=()=>{try{req.result.createObjectStore(ATLAS_STORE)}catch{}};
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();_atlasDbPromise=null};resolve(db)};
      req.onerror=()=>resolve(null);
      req.onblocked=()=>resolve(null);
    }catch{resolve(null)}
  });
  return _atlasDbPromise;
}
function idbGet(key){
  return openAtlasDB().then(db=>new Promise(resolve=>{
    if(!db){resolve(undefined);return}
    try{const rq=db.transaction(ATLAS_STORE,'readonly').objectStore(ATLAS_STORE).get(key);rq.onsuccess=()=>resolve(rq.result);rq.onerror=()=>resolve(undefined)}catch{resolve(undefined)}
  }));
}
function idbSet(key,value){
  return openAtlasDB().then(db=>new Promise(resolve=>{
    if(!db){resolve(false);return}
    try{const tx=db.transaction(ATLAS_STORE,'readwrite');tx.objectStore(ATLAS_STORE).put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false)}catch{resolve(false)}
  }));
}
async function getState(){
  const fromIdb=await idbGet(ATLAS_KEY);
  if(fromIdb&&typeof fromIdb==='object')return fromIdb;
  try{
    let parsed=JSON.parse(localStorage.getItem(ATLAS_KEY)||'{}');
    if(!parsed||typeof parsed!=='object')parsed={};
    if(Object.keys(parsed).length)idbSet(ATLAS_KEY,parsed);
    return parsed;
  }catch{return {}}
}
async function saveState(s){
  const ok=await idbSet(ATLAS_KEY,s);
  let mirrored=false;
  try{localStorage.setItem(ATLAS_KEY,JSON.stringify(s));mirrored=true}catch{}
  try{dispatchEvent(new CustomEvent('atlas:statechange',{detail:s}))}catch{}
  return ok||mirrored;
}
/* Every read-modify-write goes through this queue so two quick actions
   can never overwrite each other. Never call a locked helper from inside
   another locked task. */
let _stateLock=Promise.resolve();
function withStateLock(task){const run=_stateLock.then(task,task);_stateLock=run.catch(()=>{});return run}
async function markDone(id,on){
  return withStateLock(async()=>{
    const s=await getState();
    s.done=Array.isArray(s.done)?s.done:[];
    s.done=on?[...new Set([...s.done,id])]:s.done.filter(x=>x!==id);
    await saveState(s);
    return s.done.length;
  });
}
/* Learning rhythm: counts the days you chose to learn. Rest days never
   erase anything: "daysVisited" only grows, and a paused run is shown
   kindly, never as a loss. Local calendar dates only. */
function localYMD(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
async function touchStreak(){return withStateLock(touchStreakLocked)}
async function touchStreakLocked(){
  const s=await getState(),today=localYMD();
  const h=s.hud&&typeof s.hud==='object'?s.hud:{streak:0,longestStreak:0,lastVisit:null,daysVisited:0};
  if(h.lastVisit===today)return;
  let consecutive=false;
  if(h.lastVisit){
    const prev=new Date(h.lastVisit+'T00:00:00'),now=new Date(today+'T00:00:00');
    consecutive=Math.round((now-prev)/86400000)===1;
  }
  h.streak=consecutive?(h.streak||0)+1:1;
  h.longestStreak=Math.max(h.longestStreak||0,h.streak);
  h.daysVisited=(Number(h.daysVisited)||0)+1;
  h.lastVisit=today;
  s.hud=h;
  await saveState(s);
}

/* ---------- Everything new in v3 lives inside this one namespace ---------
   so it can never collide with names used by an individual page script. */
const Atlas=(()=>{
  const D=typeof ATLAS_DATA==='object'?ATLAS_DATA:{pages:[],paths:[],glossary:[],counts:{total:0}};
  const root=document.documentElement;
  const page=document.body.dataset.page||'index.html';
  const base=document.body.dataset.root||'';
  const byId=new Map(D.pages.map(p=>[p.id,p]));
  const mqReduce=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch{return false}};
  const motionReduced=()=>root.dataset.motion==='reduced';
  const svg=(name)=>{
    const P={
      search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/>',
      page:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
      tool:'<path d="M4 7h16M4 12h16M4 17h10"/>',
      hash:'<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
      book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
      spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
      lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
      leaf:'<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l8-8"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(P[name]||P.page)+'</svg>';
  };
  const href=id=>base+id;
  const groupName=g=>g==='labs'?'Topic lab':g==='integrations'?'Working tool':'Atlas home';

  /* ---------- 2. Comfort settings ------------------------------------
     Saved in localStorage under one key, read by the boot script in
     <head> before first paint. EXTEND: add a key to DEFAULTS, a fieldset
     in the dialog (tools/shared/footer.html) and a line in apply(). */
  const SETTINGS_KEY='atlas_settings_v3';
  const DEFAULTS={theme:'auto',motion:'auto',ambient:'on',glass:'frosted',text:'normal',reading:'normal',game:'on'};
  let memorySettings=null;
  function readSettings(){
    if(memorySettings)return {...memorySettings};
    try{return {...DEFAULTS,...(JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{})}}catch{return {...DEFAULTS}}
  }
  function applySettings(s){
    root.dataset.theme=s.theme;
    root.dataset.motion=s.motion==='reduced'||(s.motion!=='full'&&mqReduce())?'reduced':'full';
    root.dataset.ambient=s.ambient;
    root.dataset.text=s.text;
    root.dataset.reading=s.reading;
    root.dataset.game=s.game;
    if(s.glass==='solid')root.dataset.glass='lite';else delete root.dataset.glass;
    const dayNow=isDay();
    $$('meta[name="theme-color"]').forEach(m=>{if(s.theme!=='auto'){m.content=dayNow?'#e8f0eb':'#061a1c';m.removeAttribute('media')}});
    try{dispatchEvent(new CustomEvent('atlas:settings',{detail:s}))}catch{}
  }
  function saveSettings(s){
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));memorySettings=null}catch{memorySettings={...s}}
    applySettings(s);
  }
  function isDay(){
    const t=root.dataset.theme;
    if(t==='day')return true;
    if(t==='night'||t==='contrast')return false;
    try{return matchMedia('(prefers-color-scheme: light)').matches}catch{return false}
  }
  function initComfort(){
    const dlg=$('#atlas-comfort');if(!dlg)return;
    const sync=()=>{const s=readSettings();$$('input[type=radio]',dlg).forEach(r=>{r.checked=s[r.name]===r.value})};
    dlg.addEventListener('change',e=>{
      const r=e.target;if(!r.matches('input[type=radio]'))return;
      const s=readSettings();s[r.name]=r.value;saveSettings(s);
      toast('Saved: '+r.closest('fieldset').querySelector('legend').textContent.trim().toLowerCase()+' set to '+r.parentElement.textContent.trim()+'.');
    });
    $('#comfort-reset')?.addEventListener('click',()=>{saveSettings({...DEFAULTS});sync();toast('Comfort settings are back to their defaults.')});
    const btn=$('#open-comfort');if(btn){btn.hidden=false;btn.addEventListener('click',()=>{sync();openDialog(dlg)})}
    try{matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>applySettings(readSettings()))}catch{}
    try{matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>applySettings(readSettings()))}catch{}
  }

  /* Dialog helper: native <dialog> gives focus trapping and Escape for free.
     We return focus to whatever opened it. */
  function openDialog(dlg){
    if(!dlg||dlg.open)return;
    const opener=document.activeElement;
    if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
    dlg.addEventListener('close',()=>{if(opener&&opener.focus&&document.contains(opener))opener.focus()},{once:true});
  }
  function closeDialog(dlg){if(dlg&&dlg.open){if(typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open')}}
  document.addEventListener('click',e=>{const c=e.target.closest('[data-close]');if(c)closeDialog(c.closest('dialog'))});
  /* Clicking the dimmed backdrop closes a dialog, like most apps. */
  document.addEventListener('click',e=>{const d=e.target;if(d instanceof HTMLDialogElement&&d.open&&d.classList.contains('atlas-dialog')){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d)}});

  /* ---------- 3. Toasts ------------------------------------------------
     toast('Saved.') or toast('Deleted.',{action:{label:'Undo',run:fn},focus:true})
     Messages are announced politely to screen readers via the live region. */
  function toast(message,opts={}){
    const region=$('#toast-region');if(!region)return null;
    const el=document.createElement('div');el.className='toast';
    const text=document.createElement('span');text.textContent=message;el.append(text);
    let timer=0;
    const done=()=>{clearTimeout(timer);el.remove();if(opts.returnFocus&&document.contains(opts.returnFocus))opts.returnFocus.focus()};
    if(opts.action){
      const b=document.createElement('button');b.type='button';b.textContent=opts.action.label;
      b.addEventListener('click',()=>{try{opts.action.run()}finally{done()}});
      b.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();done()}});
      el.append(b);
    }
    while(region.children.length>2)region.firstElementChild.remove();
    region.append(el);
    timer=setTimeout(()=>el.remove(),opts.timeout||(opts.action?9000:4500));
    if(opts.focus&&el.querySelector('button'))el.querySelector('button').focus({preventScroll:true});
    return el;
  }

  /* ---------- Result helpers for page scripts ---------------------------
     Atlas.facts(target,[[label,value,note],…])  → tidy summary tiles
     Atlas.checklist(target,[[state,text],…])     → ✓ / ! / ✕ / i list
       (state: 'ok' | 'warn' | 'bad' | 'info')
     Atlas.highlight(target,text,terms)           → text with <mark> on terms
     All build DOM nodes with textContent, so untrusted text stays text. */
  function facts(target,rows){
    const el=typeof target==='string'?$(target):target;if(!el)return;
    const dl=document.createElement('dl');dl.className='facts';
    rows.forEach(([k,v,n])=>{const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=safe(v);if(n){const s=document.createElement('small');s.className='muted';s.textContent=n;dd.append(s)}d.append(dt,dd);dl.append(d)});
    const before=el.textContent;el.replaceChildren(dl);if(before&&before===el.textContent)flashSame(el);return dl;
  }
  function checklist(target,rows){
    const el=typeof target==='string'?$(target):target;if(!el)return;
    const ul=document.createElement('ul');ul.className='checklist';
    const sym={ok:'✓',warn:'!',bad:'✕',info:'i'},word={ok:'Yes',warn:'Check',bad:'No',info:'Note'};
    rows.forEach(([state,text])=>{const li=document.createElement('li'),m=document.createElement('span'),sr=document.createElement('span'),s=document.createElement('span');m.className='mark '+state;m.textContent=sym[state]||'i';m.setAttribute('aria-hidden','true');sr.className='sr-only';sr.textContent=(word[state]||'Note')+': ';s.textContent=safe(text);li.append(m,sr,s);ul.append(li)});
    const before=el.textContent;el.replaceChildren(ul);if(before&&before===el.textContent)flashSame(el);return ul;
  }
  function highlight(target,text,terms){
    const el=typeof target==='string'?$(target):target;if(!el)return;
    const words=[...new Set((terms||[]).map(t=>safe(t).trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);
    el.replaceChildren();
    if(!words.length){el.textContent=text;return}
    const re=new RegExp('('+words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','gi');
    safe(text).split(re).forEach((part,i)=>{if(i%2){const m=document.createElement('mark');m.textContent=part;el.append(m)}else if(part)el.append(document.createTextNode(part))});
  }
  /* ---------- 4. Page chrome -------------------------------------------- */
  async function initCompletion(){
    const box=$('#completed');if(!box)return;
    const st=await getState();
    box.checked=(st.done||[]).includes(page);
    box.addEventListener('change',coalesceCalls(async()=>{
      await markDone(page,box.checked);
      const note=$('#progress-note');
      const msg=box.checked?'Marked complete on this device.':'Completion removed.';
      if(note)note.textContent=msg;
      updateSideProgress();
    },300));
  }
  async function updateSideProgress(){
    const box=$('#side-progress');if(!box)return;
    const s=await getState(),done=new Set((s.done||[]).filter(id=>byId.has(id)&&byId.get(id).g!=='index'));
    const total=(D.counts.labs+D.counts.tools)||1;
    box.hidden=false;
    $('#side-progress-text').textContent='You have completed '+done.size+' of '+total+' labs and tools.';
    $('#side-progress-fill').style.width=Math.round(done.size/total*100)+'%';
  }
  /* Sidebar "On this page": built from every <section> that has an <h2>,
     so a new section appears automatically. Highlights what is in view. */
  function initSidebar(){
    const list=$('#side-nav-list'),main=$('#main');
    if(list&&main){
      list.replaceChildren();
      $$('section > h2, section > .panel-head > h2',main).forEach(h=>{
        const sec=h.closest('section');if(!sec||sec.hidden)return;
        if(!sec.id)sec.id=(h.textContent.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'section');
        const li=document.createElement('li'),a=document.createElement('a');
        a.href='#'+sec.id;a.textContent=h.textContent.trim();li.append(a);list.append(li);
      });
      const links=$$('a',list),map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
      if(links.length&&'IntersectionObserver'in window){
        const io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){const a=map.get(en.target.id);if(a){links.forEach(l=>{l.classList.toggle('active',l===a);l.removeAttribute('aria-current')});a.setAttribute('aria-current','location')}}}),{rootMargin:'-20% 0px -70% 0px'});
        map.forEach((a,id)=>{const el=document.getElementById(id);if(el)io.observe(el)});
      }
    }
    const t=$('#side-nav-toggle'),nav=$('#side-nav');
    if(t&&nav){t.hidden=false;t.addEventListener('click',()=>{const open=nav.classList.toggle('open');t.setAttribute('aria-expanded',String(open))});
      list?.addEventListener('click',e=>{if(e.target.closest('a')&&nav.classList.contains('open')){nav.classList.remove('open');t.setAttribute('aria-expanded','false')}});}
  }
  /* "Start here" guides can be folded away once you know your way around.
     One choice for every page, remembered on this device. */
  function initGuideToggle(){
    const KEY='atlas_guides_folded';
    let folded=false;try{folded=localStorage.getItem(KEY)==='1'}catch{}
    const apply=()=>$$('.guide-toggle').forEach(b=>{const body=document.getElementById(b.getAttribute('aria-controls'));if(body)body.hidden=folded;b.setAttribute('aria-expanded',String(!folded));b.textContent=folded?'Show the guide':'Fold the guide away'});
    $$('.guide-toggle').forEach(b=>b.addEventListener('click',()=>{folded=!folded;try{localStorage.setItem(KEY,folded?'1':'0')}catch{}apply()}));
    apply();
  }
  /* Print: open every collapsed section first so nothing is left out. */
  function initPrint(){
    $$('[data-atlas-print]').forEach(b=>{b.hidden=false;b.addEventListener('click',()=>window.print())});
    let reopened=[];
    addEventListener('beforeprint',()=>{reopened=$$('main details:not([open])');reopened.forEach(d=>d.open=true)});
    addEventListener('afterprint',()=>{reopened.forEach(d=>d.open=false);reopened=[]});
  }
  function initPromptCopy(){
    const copy=$('#copy-prompt');if(!copy)return;
    copy.addEventListener('click',async()=>{
      const t=$('#ai-prompt')?.textContent||'';
      try{await navigator.clipboard.writeText(t);$('#copy-state').textContent='Copied to your clipboard.';toast('Prompt copied.')}
      catch{const r=document.createRange();r.selectNodeContents($('#ai-prompt'));const sel=getSelection();sel.removeAllRanges();sel.addRange(r);$('#copy-state').textContent='Selected. Press Ctrl+C (or ⌘C) to copy.'}
    });
  }
  /* "Look under the hood": show the exact code that runs on this page. */
  function initSourceViewer(){
    const pageSrc=$('#source-code');
    if(pageSrc){
      const parts=['#integration-config','#demo-script'].map(s=>$(s)).filter(Boolean).map(s=>s.textContent.trim());
      if(parts.length)pageSrc.textContent=parts.join('\n\n/* ---- */\n\n');
    }
    const shared=$('#runtime-source');
    if(shared){shared.addEventListener('toggle',()=>{const pre=$('#runtime-code');if(shared.open&&pre&&!pre.dataset.filled){pre.textContent=['#integration-engine','#atlas-runtime'].map(s=>$(s)).filter(Boolean).map(s=>s.textContent.trim()).join('\n\n/* ---- */\n\n');pre.dataset.filled='1'}})}
  }
  function initServiceWorker(){
    const sw=document.body.dataset.sw;
    if(!sw||!('serviceWorker'in navigator))return;
    if(location.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
      navigator.serviceWorker.register(base+sw).catch(()=>{});
    }
  }
  /* Respect "Calm" motion for native page transitions too. */
  function initTransitions(){
    const skip=e=>{if(e.viewTransition&&motionReduced())e.viewTransition.skipTransition()};
    addEventListener('pageswap',skip);addEventListener('pagereveal',skip);
  }
  /* Pointer light: surfaces catch a soft glow under a mouse or pen. */
  function initPointerLight(){
    let fine=false;try{fine=matchMedia('(pointer: fine)').matches}catch{}
    if(!fine)return;
    let raf=0,ev=null,lit=null;
    document.addEventListener('pointermove',e=>{ev=e;if(!raf)raf=requestAnimationFrame(()=>{raf=0;
      if(motionReduced()||root.dataset.theme==='contrast'){if(lit){lit.classList.remove('lit');lit=null}return}
      const el=ev.target.closest?.('.panel,.card');
      if(lit&&lit!==el){lit.classList.remove('lit');lit=null}
      if(!el)return;
      const r=el.getBoundingClientRect();
      el.style.setProperty('--mx',(ev.clientX-r.left)+'px');el.style.setProperty('--my',(ev.clientY-r.top)+'px');
      if(!el.classList.contains('lit')){el.classList.add('lit');lit=el}
    })},{passive:true});
  }

  /* ---------- 5. Command palette ---------------------------------------
     One search box for every page, the sections of this page, glossary
     terms and actions. Open with the Search button, Ctrl/⌘ K, or "/".
     Built on <dialog> + the ARIA combobox/listbox pattern. */
  const palette={items:null,active:-1,shown:[]};
  const norm=s=>safe(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  function actionItems(){
    const acts=[];
    const add=(title,sub,run,keys='')=>acts.push({kind:'action',title,sub,run,keys:norm(title+' '+sub+' '+keys)});
    add(isDay()?'Switch to Night theme':'Switch to Day theme','Comfort',()=>{const s=readSettings();s.theme=isDay()?'night':'day';saveSettings(s);toast('Theme changed. Comfort settings has more options.')},'theme dark light colour color mode');
    add('Comfort settings','Theme, motion, light, text size, reading spacing',()=>{$('#open-comfort')?.click()},'settings preferences accessibility dark light contrast font size dyslexia');
    add('Take a one-minute pause','A short guided breathing break',()=>openPause(),'breathe calm rest break relax');
    add('Privacy, offline copy and erase','See what this page stores and can contact',()=>openPrivacy(),'privacy data delete erase offline cache security');
    if($('#completed'))add($('#completed').checked?'Mark this page as not complete':'Mark this page complete','Your progress',()=>{const b=$('#completed');b.checked=!b.checked;b.dispatchEvent(new Event('change',{bubbles:true}))},'done finish progress');
    if($('#page-notes'))add('Write notes on this page','Saved on this device',()=>{$('#your-notes')?.scrollIntoView({block:'start'});$('#page-notes')?.focus({preventScroll:true})},'notes journal');
    add('Print or save as PDF','Opens your browser\'s print dialog',()=>window.print(),'print pdf paper');
    add('Go to the atlas home','Dashboard, learning paths, all pages',()=>{location.href=href('index.html')},'home index start dashboard');
    add('Browse learning paths','Guided routes for different people',()=>{location.href=href('index.html#paths')},'path journey route course');
    add('Open the glossary','Plain-language meanings of technical words',()=>{location.href=href('index.html#glossary')},'words terms definitions jargon');
    return acts;
  }
  function buildPaletteItems(){
    const items=actionItems();
    $$('#side-nav-list a').forEach(a=>items.push({kind:'section',title:a.textContent,sub:'On this page',run:()=>{const t=document.getElementById(a.getAttribute('href').slice(1));t?.scrollIntoView({block:'start'});history.replaceState(null,'',a.getAttribute('href'))},keys:norm(a.textContent)}));
    D.pages.forEach(p=>items.push({kind:p.g==='labs'?'lab':p.g==='integrations'?'tool':'home',title:p.t,sub:(p.g==='index'?'Atlas home':groupName(p.g)+' '+p.n)+(p.s?': '+p.s:''),run:()=>{location.href=href(p.id)},keys:norm(p.t+' '+(p.s||'')+' '+(p.k||'')+' '+(p.a||'')),current:p.id===page}));
    D.glossary.forEach(g=>items.push({kind:'term',title:g.term,sub:g.def,run:()=>showTerm(g),keys:norm(g.term+' '+(g.aka||'')+' '+g.def),term:g}));
    return items;
  }
  function scoreItem(it,tokens){
    if(!tokens.length)return 1;
    const title=norm(it.title);let score=0;
    for(const t of tokens){
      if(title.startsWith(t))score+=9;
      else if(title.split(/[^a-z0-9]+/).some(w=>w.startsWith(t)))score+=6;
      else if(title.includes(t))score+=4;
      else if(it.keys.split(/[^a-z0-9]+/).some(w=>w.startsWith(t)))score+=2;
      else if(it.keys.includes(t))score+=1;
      else return 0;
    }
    if(title===tokens.join(' '))score+=10;
    if(it.kind==='action')score+=1;
    return score;
  }
  const KIND_LABEL={action:'Actions',section:'On this page',lab:'Topic labs',tool:'Working tools',home:'Atlas home',term:'Glossary'};
  const KIND_ICON={action:'spark',section:'hash',lab:'page',tool:'tool',home:'leaf',term:'book'};
  function renderPalette(q){
    const list=$('#palette-list'),input=$('#palette-input');
    const tokens=norm(q).split(/\s+/).filter(Boolean);
    let ranked=palette.items.map(it=>({it,s:scoreItem(it,tokens)})).filter(x=>x.s>0);
    /* With an empty box, offer actions and this page's sections first. */
    if(!tokens.length)ranked=ranked.filter(x=>x.it.kind==='action'||x.it.kind==='section');
    ranked.sort((a,b)=>b.s-a.s);
    const order=['action','section','lab','tool','home','term'];
    const groups=new Map(order.map(k=>[k,[]]));
    ranked.slice(0,60).forEach(x=>{const k=x.it.kind;if(groups.get(k).length<(tokens.length?12:8))groups.get(k).push(x.it)});
    list.replaceChildren();palette.shown=[];
    let i=0;
    for(const k of order){
      const arr=groups.get(k);if(!arr.length)continue;
      const g=document.createElement('div');g.setAttribute('role','group');g.setAttribute('aria-label',KIND_LABEL[k]);
      const lab=document.createElement('div');lab.className='group-label';lab.setAttribute('aria-hidden','true');lab.textContent=KIND_LABEL[k];g.append(lab);
      arr.forEach(it=>{
        const o=document.createElement('div');o.setAttribute('role','option');o.id='pal-opt-'+(i++);o.setAttribute('aria-selected','false');
        o.innerHTML=svg(KIND_ICON[k]);
        const t=document.createElement('span');t.className='opt-title';t.textContent=it.title+(it.current?' (this page)':'');
        const kind=document.createElement('span');kind.className='opt-kind';kind.textContent=k==='term'?'Meaning':k==='action'?'Action':'';
        const sub=document.createElement('span');sub.className='opt-sub';sub.textContent=it.sub;
        o.append(t,kind,sub);
        o.addEventListener('click',()=>activate(palette.shown.indexOf(it)));
        o.addEventListener('pointermove',()=>setActive(palette.shown.indexOf(it)));
        g.append(o);palette.shown.push(it);
      });
      list.append(g);
    }
    if(!palette.shown.length){const e=document.createElement('div');e.className='palette-empty';e.textContent=tokens.length?'No matches for “'+q.trim()+'”. Try a broader word, such as “map”, “privacy” or “storage”.':'Start typing to search every page and term.';list.append(e)}
    setActive(palette.shown.length?0:-1);
    input.setAttribute('aria-expanded',palette.shown.length?'true':'false');
  }
  function setActive(i){
    palette.active=i;
    $$('#palette-list [role="option"]').forEach((o,j)=>o.setAttribute('aria-selected',String(j===i)));
    const cur=i>=0?$('#pal-opt-'+i):null;
    $('#palette-input').setAttribute('aria-activedescendant',cur?cur.id:'');
    cur?.scrollIntoView({block:'nearest'});
  }
  function activate(i){
    const it=palette.shown[i];if(!it)return;
    if(it.kind==='term'){it.run();return}
    closeDialog($('#atlas-palette'));
    setTimeout(()=>it.run(),0);
  }
  function showTerm(g){
    const box=$('#palette-detail');box.hidden=false;box.replaceChildren();
    const h=document.createElement('h3');h.textContent=g.term;
    const p=document.createElement('p');p.textContent=g.def;
    box.append(h,p);
    if(g.page&&byId.has(g.page)){const a=document.createElement('a');a.href=href(g.page);a.textContent='Learn more: '+byId.get(g.page).t;box.append(a)}
  }
  function openPalette(initial=''){
    const dlg=$('#atlas-palette');if(!dlg)return;
    palette.items=buildPaletteItems();
    const input=$('#palette-input');input.value=initial;$('#palette-detail').hidden=true;
    renderPalette(initial);openDialog(dlg);input.focus();
  }
  function initPalette(){
    const dlg=$('#atlas-palette'),input=$('#palette-input');if(!dlg||!input)return;
    const btn=$('#open-palette');
    if(btn){btn.hidden=false;btn.addEventListener('click',()=>openPalette());
      const k=btn.querySelector('kbd');if(k&&/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent))k.textContent='⌘ K';}
    input.addEventListener('input',()=>{$('#palette-detail').hidden=true;renderPalette(input.value)});
    input.addEventListener('keydown',e=>{
      const n=palette.shown.length;
      if(e.key==='ArrowDown'){e.preventDefault();if(n)setActive((palette.active+1)%n)}
      else if(e.key==='ArrowUp'){e.preventDefault();if(n)setActive((palette.active-1+n)%n)}
      else if(e.key==='Home'&&e.ctrlKey){e.preventDefault();if(n)setActive(0)}
      else if(e.key==='End'&&e.ctrlKey){e.preventDefault();if(n)setActive(n-1)}
      else if(e.key==='Enter'){e.preventDefault();activate(palette.active)}
    });
    document.addEventListener('keydown',e=>{
      const typing=e.target.closest&&e.target.closest('input,textarea,select,[contenteditable="true"]');
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();if(dlg.open)closeDialog(dlg);else openPalette()}
      else if(e.key==='/'&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]')){e.preventDefault();openPalette()}
    });
  }

  /* ---------- 6. Privacy lock & transparency ---------------------------
     The page carries a Content-Security-Policy that tells your browser to
     refuse connections to any other website. This panel shows that it is
     on, counts what the page has actually loaded, manages the optional
     offline copy, and can erase everything the atlas stored here. */
  function outsideRequests(){
    let n=0,local=0;
    try{performance.getEntriesByType('resource').forEach(e=>{let o='';try{o=new URL(e.name,location.href).origin}catch{}if(/^(data|blob):/.test(e.name)||o===location.origin)local++;else n++})}catch{}
    return {outside:n,local};
  }
  function refreshPrivacyChip(){
    const t=$('#privacy-chip-text');if(!t)return;
    const lock=!!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const {outside}=outsideRequests();
    t.textContent=(lock?'Privacy lock on':'Privacy lock unavailable')+': '+outside+' outside connection'+(outside===1?'':'s');
  }
  function swMessage(msg,timeout=20000){
    return new Promise((resolve,reject)=>{
      const ctl=navigator.serviceWorker&&navigator.serviceWorker.controller;
      if(!ctl){reject(new Error('no-controller'));return}
      const ch=new MessageChannel();const t=setTimeout(()=>reject(new Error('timeout')),timeout);
      ch.port1.onmessage=e=>{if(e.data&&e.data.progress&&msg.onProgress){msg.onProgress(e.data);return}clearTimeout(t);resolve(e.data)};
      const {onProgress,...plain}=msg;ctl.postMessage(plain,[ch.port2]);
    });
  }
  async function refreshOffline(){
    const out=$('#offline-status'),save=$('#offline-save'),drop=$('#offline-remove');if(!out)return;
    save.hidden=drop.hidden=true;
    if(location.protocol==='file:'){out.textContent='You opened the atlas as files on this device, so every page already works offline on its own. (An installable offline copy needs a web address such as https:// or http://localhost.)';return}
    if(!('serviceWorker'in navigator)){out.textContent='This browser cannot keep an offline copy. Each page still works once loaded.';return}
    try{const r=await swMessage({type:'status'},4000);out.textContent=r.cached+' of '+r.total+' pages are saved for offline use on this device'+(r.cached>=r.total?'. You are all set.':'.');save.hidden=r.cached>=r.total;drop.hidden=r.cached===0}
    catch{out.textContent='The offline helper is still starting. Reload once while online, then check again.'}
  }
  function initPrivacy(){
    const dlg=$('#atlas-privacy'),chip=$('#open-privacy');if(!dlg)return;
    if(chip){chip.hidden=false;chip.addEventListener('click',openPrivacy)}
    refreshPrivacyChip();
    try{new PerformanceObserver(()=>refreshPrivacyChip()).observe({type:'resource',buffered:true})}catch{}
    $('#offline-save')?.addEventListener('click',async()=>{
      const out=$('#offline-status');out.textContent='Saving pages for offline use…';
      try{const r=await swMessage({type:'cache-all',onProgress:p=>{out.textContent='Saving pages for offline use: '+p.cached+' of '+p.total+'…'}},120000);out.textContent=r.cached+' of '+r.total+' pages saved for offline use.';toast('Offline copy ready.');refreshOffline()}
      catch{out.textContent='Could not finish saving. Check your connection and try again.'}
    });
    $('#offline-remove')?.addEventListener('click',async()=>{try{await swMessage({type:'clear'},8000);toast('Offline copy removed. Pages will be fetched again when online.')}catch{}refreshOffline()});
    const ask=$('#erase-confirm');
    $('#erase-all')?.addEventListener('click',()=>{ask.hidden=false;$('#erase-cancel').focus()});
    $('#erase-cancel')?.addEventListener('click',()=>{ask.hidden=true;$('#erase-all').focus()});
    $('#erase-yes')?.addEventListener('click',eraseEverything);
  }
  function openPrivacy(){
    const dlg=$('#atlas-privacy');if(!dlg)return;
    const lock=!!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const {outside,local}=outsideRequests();
    const facts=$('#privacy-facts');facts.replaceChildren();
    const row=(ok,text)=>{const li=document.createElement('li');const m=document.createElement('span');m.className='mark '+(ok?'ok':'warn');m.textContent=ok?'✓':'!';m.setAttribute('aria-hidden','true');const s=document.createElement('span');s.textContent=text;li.append(m,s);facts.append(li)};
    row(lock,lock?'Privacy lock is on. This page tells your browser to block connections to any other website, including trackers and analytics.':'This copy has no privacy lock. It still makes no outside connections by design.');
    row(outside===0,outside===0?'Since it opened, this page has contacted 0 outside websites (measured by your browser: '+local+' file'+(local===1?'':'s')+' loaded from the atlas itself).':outside+' requests went to other addresses. Please report this, because the atlas is designed to make none.');
    row(true,'There is no account, no cookie and no analytics. Your progress, notes, settings and tool records stay in this browser on this device.');
    row(true,'Links to outside reference sites (like MDN) only open if you click them, and send no referrer.');
    $('#erase-confirm').hidden=true;
    openDialog(dlg);refreshOffline();
  }
  async function eraseEverything(){
    const out=$('#erase-status');out.textContent='Erasing…';
    const pref=/^(atlas|foster_navi|foster-navi)/;
    try{Object.keys(localStorage).filter(k=>pref.test(k)).forEach(k=>localStorage.removeItem(k))}catch{}
    try{Object.keys(sessionStorage).filter(k=>pref.test(k)).forEach(k=>sessionStorage.removeItem(k))}catch{}
    const dbs=new Set(['foster_navi_atlas_db','foster_navi_records','atlas_lab_storage_v1','atlas_lab_storage_v2']);
    try{if(indexedDB.databases)(await indexedDB.databases()).forEach(d=>{if(d.name&&pref.test(d.name))dbs.add(d.name)})}catch{}
    _atlasDbPromise=null;
    try{const db=await openAtlasDB();db&&db.close()}catch{}
    _atlasDbPromise=null;
    await Promise.all([...dbs].map(n=>new Promise(r=>{try{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=()=>r()}catch{r()}})));
    try{if('caches'in window)for(const k of await caches.keys())if(k.startsWith('foster-navi-atlas'))await caches.delete(k)}catch{}
    try{if(navigator.serviceWorker)for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister()}catch{}
    out.textContent='Everything the atlas stored in this browser has been erased. Reloading…';
    setTimeout(()=>location.reload(),1400);
  }

  /* ---------- 7. Notes on this page -------------------------------------
     Saved as you type (in the same store as progress) and included when
     you export progress from the atlas home page. */
  async function initNotes(){
    const ta=$('#page-notes');if(!ta)return;
    const status=$('#page-notes-status');
    const s=await getState();
    ta.value=(s.pageNotes&&typeof s.pageNotes[page]==='string')?s.pageNotes[page]:'';
    const save=coalesceCalls(()=>withStateLock(async()=>{
      const st=await getState();st.pageNotes=st.pageNotes&&typeof st.pageNotes==='object'?st.pageNotes:{};
      const v=ta.value.slice(0,5000);if(v.trim())st.pageNotes[page]=v;else delete st.pageNotes[page];
      const ok=await saveState(st);
      status.textContent=ok?'Saved on this device at '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'.':'Could not save here. Copy your notes somewhere safe.';
    }),800);
    ta.addEventListener('input',save);
    $('#page-notes-download')?.addEventListener('click',()=>{
      const p=byId.get(page);download('notes-'+page.replace(/[^a-z0-9]+/gi,'-').replace(/-html$/,'')+'.txt',(p?p.t:document.title)+'\n\n'+ta.value,'text/plain;charset=utf-8');
    });
  }

  /* ---------- 8. A one-minute pause --------------------------------------
     Box breathing: in 4, hold 4, out 4, hold 4. The light grows and rests
     with the count; with Calm motion only the words change. */
  let breath={timer:0,end:0,phase:0};
  function openPause(){const dlg=$('#atlas-pause');if(!dlg)return;stopBreath(false);openDialog(dlg);$('#breath-start')?.focus()}
  function stopBreath(announce=true){
    clearTimeout(breath.timer);breath.timer=0;
    const orb=$('#breath-orb');orb?.classList.remove('in');
    const s=$('#breath-start'),x=$('#breath-stop');if(s)s.hidden=false;if(x)x.hidden=true;
    if(announce){$('#breath-cue').textContent='Welcome back.';$('#breath-time').textContent='Pause finished. Carry the calm with you.'}
    else{$('#breath-cue').textContent='Ready when you are.';$('#breath-time').textContent=''}
  }
  function initPause(){
    const dlg=$('#atlas-pause');if(!dlg)return;
    $('#open-pause')?.addEventListener('click',()=>{closeDialog($('#atlas-comfort'));setTimeout(openPause,30)});
    const cues=['Breathe in','Hold','Breathe out','Hold'];
    const step=()=>{
      const left=Math.max(0,Math.round((breath.end-Date.now())/1000));
      if(left<=0){stopBreath(true);$('#breath-start').focus();return}
      $('#breath-cue').textContent=cues[breath.phase];
      $('#breath-orb').classList.toggle('in',breath.phase===0||breath.phase===1);
      $('#breath-time').textContent=left>=60?Math.floor(left/60)+' min '+String(left%60).padStart(2,'0')+' s left':left+' seconds left';
      breath.phase=(breath.phase+1)%4;breath.timer=setTimeout(step,4000);
    };
    $('#breath-start')?.addEventListener('click',()=>{
      breath.end=Date.now()+Number($('#breath-length').value||60)*1000;breath.phase=0;
      $('#breath-start').hidden=true;$('#breath-stop').hidden=false;$('#breath-stop').focus();step();
    });
    $('#breath-stop')?.addEventListener('click',()=>{stopBreath(true);$('#breath-start').focus()});
    dlg.addEventListener('close',()=>{if(breath.timer)stopBreath(false)});
  }

  /* ---------- 9. Ambient light: fireflies & bokeh -----------------------
     PURPOSE: the living light behind the frosted glass. Purely decorative.
     HOW: a fixed <canvas> behind all content draws soft pre-rendered light
     sprites. Positions come from a seeded random generator plus the clock,
     so the field continues smoothly from page to page. Near particles are
     large, soft bokeh discs; far ones are tiny fireflies that pulse.
     CARE: about 30 frames per second, pauses when the tab is hidden, draws
     one still frame for Calm motion, turns itself down if the device
     struggles, and is off entirely for High contrast or Ambient: off.
     EXTEND: tune COUNT_DIVISOR (density), palettes, or SPEED. */
  const Ambient=(()=>{
    const COUNT_DIVISOR=26000,SPEED=1;
    let cv,ctx,w=0,h=0,dpr=1,parts=[],sprites=null,raf=0,last=0,slow=0,frames=0,mode='on',pointer={x:-9999,y:-9999},spriteTheme='';
    function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
    function palettes(){return isDay()?[[200,150,40],[90,160,130],[235,190,110]]:[[255,206,110],[127,227,191],[170,200,255]]}
    function makeSprite(rgb,kind){
      const s=document.createElement('canvas');s.width=s.height=128;const g=s.getContext('2d');if(!g)return s;
      const c=rgb.join(','),grd=g.createRadialGradient(64,64,0,64,64,64);
      if(kind==='bokeh'){grd.addColorStop(0,'rgba('+c+',.30)');grd.addColorStop(.6,'rgba('+c+',.22)');grd.addColorStop(.84,'rgba('+c+',.34)');grd.addColorStop(.93,'rgba('+c+',.10)');grd.addColorStop(1,'rgba('+c+',0)')}
      else{grd.addColorStop(0,'rgba(255,255,240,1)');grd.addColorStop(.07,'rgba('+c+',.95)');grd.addColorStop(.26,'rgba('+c+',.30)');grd.addColorStop(1,'rgba('+c+',0)')}
      g.fillStyle=grd;g.fillRect(0,0,128,128);return s;
    }
    function buildSprites(){const p=palettes();spriteTheme=isDay()?'day':'night';sprites={bokeh:p.map(c=>makeSprite(c,'bokeh')),fly:p.map(c=>makeSprite(c,'fly'))}}
    function build(){
      const R=rng(20260919);let n=Math.round(Math.min(72,Math.max(14,w*h/COUNT_DIVISOR)));
      if(mode==='calm')n=Math.round(n*.55);
      parts=[];for(let i=0;i<n;i++){const z=R(),near=z>.8;parts.push({bx:R(),by:R(),z,kind:near?'bokeh':'fly',col:Math.floor(R()*3),r:near?16+R()*30:1.4+R()*2.6,vx:(R()-.5)*.006,vy:-(.002+R()*.007),ph:R()*6.283,fl:.35+R()*.8,sw:8+R()*26})}
    }
    function size(){
      dpr=Math.min(1.5,window.devicePixelRatio||1);w=innerWidth;h=innerHeight;
      cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);build();
    }
    function draw(t){
      if(spriteTheme!==(isDay()?'day':'night'))buildSprites();
      ctx.clearRect(0,0,w,h);
      const day=isDay(),calm=mode==='calm'||motionReduced(),sp=(calm?.45:1)*SPEED,sy=scrollY||0,H=h+160;
      ctx.globalCompositeOperation=day?'source-over':'lighter';
      for(const p of parts){
        let x=(((p.bx+p.vx*t*sp)%1)+1)%1*(w+120)-60+Math.sin(t*.21*sp+p.ph)*p.sw;
        let y=(((p.by+p.vy*t*sp)%1)+1)%1*H-80-sy*(.03+p.z*.16);
        y=((y+80)%H+H)%H-80;
        let a=p.kind==='fly'?Math.pow(Math.max(0,Math.sin(t*p.fl*sp+p.ph)),3)*.9+.08:.45+.25*Math.sin(t*.3*sp+p.ph);
        const dx=x-pointer.x,dy=y-pointer.y,d2=dx*dx+dy*dy;if(d2<52000)a=Math.min(1,a+(1-d2/52000)*.35);
        const s=p.kind==='bokeh'?p.r*(.7+p.z*.5):p.r*4.2*(.55+p.z*.6);
        ctx.globalAlpha=Math.min(1,a*(day?.55:.85)*(calm?.75:1));
        ctx.drawImage(sprites[p.kind][p.col],x-s,y-s,s*2,s*2);
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    }
    function loop(now){
      raf=requestAnimationFrame(loop);
      if(now-last<32)return;
      const dt=now-last;last=now;frames++;
      if(frames>45&&dt>70){if(++slow>45){slow=0;if(mode==='on'){mode='calm';build()}else{stop();draw(Date.now()/1000);return}}}
      draw(Date.now()/1000);
    }
    function stop(){cancelAnimationFrame(raf);raf=0}
    function start(){
      const amb=root.dataset.ambient;
      if(!cv||amb==='off'||root.dataset.theme==='contrast'){stop();if(ctx)ctx.clearRect(0,0,w,h);return}
      mode=amb==='calm'?'calm':'on';build();
      if(motionReduced()||document.hidden){stop();draw(Date.now()/1000);return}
      if(!raf){last=0;raf=requestAnimationFrame(loop)}
    }
    function init(){
      cv=$('#atlas-ambient');if(!cv)return;ctx=cv.getContext('2d');if(!ctx)return;
      buildSprites();size();start();
      let rt=0;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{size();start()},180)});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start()});
      addEventListener('atlas:settings',()=>{buildSprites();start()});
      addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY},{passive:true});
      addEventListener('scroll',()=>{if(!raf&&!document.hidden&&root.dataset.ambient!=='off')draw(Date.now()/1000)},{passive:true});
    }
    return {init,start,stop};
  })();

  /* ---------- 10. Learning-path banner & boot ---------------------------- */
  async function initPathBanner(){
    const s=await getState();const pid=s.activePath;if(!pid)return;
    const path=D.paths.find(p=>p.id===pid);if(!path)return;
    const idx=path.steps.indexOf(page);if(idx<0)return;
    const done=new Set(s.done||[]);
    const next=path.steps.slice(idx+1).find(id=>!done.has(id))||path.steps.find(id=>!done.has(id)&&id!==page);
    const hero=$('#main .hero');if(!hero)return;
    const box=document.createElement('div');box.className='path-banner no-print';box.setAttribute('role','note');
    const p=document.createElement('p');p.style.margin='0';
    const strong=document.createElement('strong');strong.textContent=path.title;
    p.append('You are following the ',strong,' path: step '+(idx+1)+' of '+path.steps.length+'.');
    box.append(p);
    if(next&&byId.has(next)){const a=document.createElement('a');a.className='btn';a.href=href(next);a.textContent='Next on your path: '+byId.get(next).t;box.append(a)}
    else{const a=document.createElement('a');a.className='btn';a.href=href('index.html#paths');a.textContent='Path complete. Choose another';box.append(a)}
    hero.after(box);
  }
  function boot(){
    applySettings(readSettings());
    initComfort();initPalette();initPrivacy();initPause();
    initCompletion();initSidebar();initGuideToggle();initPrint();initPromptCopy();initSourceViewer();
    initNotes();initTransitions();initPointerLight();initPathBanner();
    updateSideProgress();initServiceWorker();Ambient.init();
    addEventListener('atlas:statechange',()=>updateSideProgress());
    touchStreak().catch(()=>{});
  }
  return {boot,toast,openDialog,closeDialog,openPalette,openPause,openPrivacy,readSettings,saveSettings,isDay,data:D,page,href,svg,Ambient,facts,checklist,highlight,motionReduced};
})();
/* Boot once the whole page (including its own scripts) has been parsed. */
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>Atlas.boot(),{once:true});else Atlas.boot();
