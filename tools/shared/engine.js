'use strict';
/* =====================================================================
   INTEGRATION ENGINE v3 — the record-keeping core shared by every
   working tool (copied in by tools/atlas_build.py; edit
   tools/shared/engine.js). Each tool page supplies INTEGRATION_CONFIG
   (its fields and samples) and its own purpose-built workbench script.

   What the engine gives every tool:
   - add, edit, search and delete records (with Undo)
   - saves on this device twice: localStorage (instant) plus an
     IndexedDB copy (larger, sturdier); the newer copy always wins
   - plain-language insights, an accessible chart with a data table
   - JSON backup and restore with strict checks, plus CSV export
   - a storage health panel and an optional "keep my data" request
   Names kept from version 2 (items, render, persist, config, …) let
   older workbench scripts run unchanged.
   ===================================================================== */
const config=INTEGRATION_CONFIG;
const dbKey='atlas_integration_v1_'+config.slug;          /* same key as v2: your records carry over */
const metaKey=dbKey+'__meta';
const numeric=config.fields.filter(f=>f.type==='number');
let items=[],editing=null;
try{const saved=JSON.parse(localStorage.getItem(dbKey)||'[]');items=Array.isArray(saved)?saved:[]}catch{items=[]}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0}

/* ---------- Saving: localStorage now, IndexedDB copy right after ------- */
const RecordStore=(()=>{
  const DB='foster_navi_records',STORE='projects';
  let dbp=null,meta={rev:0,savedAt:null,lastExport:null},extras={};
  try{meta={...meta,...(JSON.parse(localStorage.getItem(metaKey)||'{}')||{})}}catch{}
  function open(){
    if(dbp)return dbp;
    dbp=new Promise(resolve=>{try{if(!('indexedDB'in window)){resolve(null);return}
      const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{try{r.result.createObjectStore(STORE)}catch{}};
      r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();dbp=null};resolve(db)};r.onerror=()=>resolve(null);r.onblocked=()=>resolve(null)}catch{resolve(null)}});
    return dbp;
  }
  async function idbPut(value){const db=await open();if(!db)return false;return new Promise(res=>{try{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,config.slug);tx.oncomplete=()=>res(true);tx.onerror=tx.onabort=()=>res(false)}catch{res(false)}})}
  async function idbGet(){const db=await open();if(!db)return null;return new Promise(res=>{try{const q=db.transaction(STORE,'readonly').objectStore(STORE).get(config.slug);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)}catch{res(null)}})}
  const state={local:null,idb:null};
  function writeMeta(){try{localStorage.setItem(metaKey,JSON.stringify(meta));return true}catch{return false}}
  /* Synchronous on purpose: older workbench code checks persist()'s result. */
  function persistNow(){
    meta.rev=(meta.rev||0)+1;meta.savedAt=new Date().toISOString();
    let local=false;
    try{localStorage.setItem(dbKey,JSON.stringify(items));local=writeMeta()}catch{}
    state.local=local;
    const snapshot={rev:meta.rev,savedAt:meta.savedAt,records:items.slice(),extras:collectExtras()};
    const pending=idbPut(snapshot).then(ok=>{state.idb=ok;if(!ok&&!local)say('Could not save on this device. Export a JSON backup now so nothing is lost.');Health.render();return ok});
    if(!local&&!('indexedDB'in window)){say('Local save failed. Export your data and check your browser storage settings.');return false}
    if(!local)pending.then(ok=>{if(ok)Atlas.toast('Saved to the larger browser store; the quick store was full or unavailable.')});
    return true;
  }
  /* After load: if the IndexedDB copy is newer (for example the quick store
     was cleared or full), restore it and say so. */
  async function reconcile(){
    const db=await open(),copy=await idbGet();
    let localMissing=false;try{localMissing=localStorage.getItem(dbKey)===null}catch{localMissing=true}
    state.idb=db?(copy?true:'ready'):false;
    if(copy&&Array.isArray(copy.records)&&((copy.rev||0)>(meta.rev||0)||(localMissing&&copy.records.length&&!items.length))){
      items=copy.records;meta.rev=copy.rev;meta.savedAt=copy.savedAt;
      if(copy.extras)applyExtras(copy.extras);
      try{localStorage.setItem(dbKey,JSON.stringify(items));writeMeta()}catch{}
      render();Atlas.toast('Restored '+items.length+' record'+(items.length===1?'':'s')+' from this device\'s backup store.');
    }else if(!copy&&items.length){idbPut({rev:meta.rev||0,savedAt:meta.savedAt,records:items.slice(),extras:collectExtras()}).then(ok=>{state.idb=ok;Health.render()})}
    Health.render();
  }
  function registerExtra(name,api){extras[name]=api}
  function collectExtras(){const o={};for(const [k,api] of Object.entries(extras)){try{o[k]=api.get()}catch{}}return o}
  function applyExtras(o){if(!o||typeof o!=='object')return;for(const [k,api] of Object.entries(extras)){if(k in o){try{api.set(o[k])}catch{}}}}
  function markExported(){meta.lastExport=new Date().toISOString();writeMeta();Health.render()}
  return {persistNow,reconcile,registerExtra,collectExtras,applyExtras,markExported,meta:()=>meta,state};
})();
function persist(){return RecordStore.persistNow()}
/* Workbenches with extra state (for example quest completions) register it
   here so it travels inside JSON backups. */
function registerExtraState(name,api){RecordStore.registerExtra(name,api)}

/* ---------- Plain-language summary of the records ------------------- */
function aggregate(){
  const n=items.length,sum=k=>items.reduce((s,r)=>s+number(r[k]),0),groups=k=>items.reduce((a,r)=>(a[safe(r[k]||'Unknown')]=(a[safe(r[k]||'Unknown')]||0)+1,a),{});
  const m=config.mode,f=config.fields;
  const firstNum=numeric[0]?.id;
  switch(m){
    case 'product':{const [a,b]=numeric.map(x=>x.id);return {records:n,estimatedTotal:items.reduce((s,r)=>s+number(r[a])*number(r[b]),0),unit:config.productUnit||'derived units',method:'Sum of each record\'s product; user-supplied estimates, not validated predictions.'}}
    case 'effort':return {records:n,totalHoursOrMinutes:firstNum?sum(firstNum):0,note:'Units follow the form label; they are not interchangeable.'};
    case 'measure':return {records:n,mean:n&&firstNum?sum(firstNum)/n:null,warning:'Only compare observations with matching units and calibration.'};
    case 'delta':return {records:n,aggregateChange:items.reduce((s,r)=>s+number(r.current)-number(r.baseline),0),note:'Only meaningful when indicators and units match.'};
    case 'inventory':return {records:n,totalQuantity:firstNum?sum(firstNum):0,note:'Totals do not establish preparedness or safety.'};
    case 'map':return {records:n,validCoordinates:items.filter(r=>Number.isFinite(+r.lat)&&Number.isFinite(+r.lon)&&Math.abs(+r.lat)<=90&&Math.abs(+r.lon)<=180).length};
    default:{const cat=f.find(x=>x.type.startsWith('select:'));return cat?{records:n,[cat.id+'Counts']:groups(cat.id)}:{records:n}}
  }
}
function insightTiles(){
  const out=$('#insight');if(!out)return;
  out.replaceChildren();
  const dl=document.createElement('dl');dl.className='facts';
  const tile=(label,value,note)=>{const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;if(note){const s=document.createElement('small');s.className='muted';s.textContent=note;dd.append(s)}d.append(dt,dd);dl.append(d)};
  tile('Records saved',String(items.length),items.length?'':'Add one with the form or a sample.');
  const cat=config.fields.find(x=>x.type.startsWith('select:'));
  if(cat&&items.length){
    const counts={};items.forEach(r=>{const k=safe(r[cat.id]||'Not set');counts[k]=(counts[k]||0)+1});
    const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    tile('Most common '+cat.label.toLowerCase(),top[0],top[1]+' of '+items.length);
  }
  numeric.slice(0,2).forEach(f=>{
    const vals=items.map(r=>Number(r[f.id])).filter(Number.isFinite);
    if(vals.length)tile('Total '+f.label.toLowerCase(),fmt(vals.reduce((a,b)=>a+b,0)),'Average '+fmt(vals.reduce((a,b)=>a+b,0)/vals.length));
  });
  if(config.mode==='product'&&items.length){const a=aggregate();tile(config.productLabel||'Estimated total',fmt(a.estimatedTotal)+' '+(config.productUnit||''),'From your own assumptions')}
  const latest=items.map(r=>r.updated||r.created).filter(Boolean).sort().pop();
  if(latest)tile('Last change',new Date(latest).toLocaleDateString(undefined,{dateStyle:'medium'}));
  out.append(dl);
  const tech=$('#insight-json');if(tech)tech.textContent=JSON.stringify(aggregate(),null,2);
}

/* ---------- Chart: your real values, drawn crisply, with a table ------- */
function chartSeries(){
  const numericField=numeric[0],categoryField=config.fields.find(f=>f.type.startsWith('select:'));
  if(numericField){
    return {label:numericField.label+' (last '+Math.min(12,items.length)+' records)',unit:numericField.label,values:items.slice(-12).map((r,i)=>({name:String(r[config.fields[0].id]||'Record '+(i+1)),value:Number(r[numericField.id])})).filter(r=>Number.isFinite(r.value))};
  }
  if(categoryField){
    const g={};categoryField.type.slice(7).split('|').forEach(k=>g[k]=0);
    items.forEach(r=>{const k=String(r[categoryField.id]||'Missing');g[k]=(g[k]||0)+1});
    return {label:'Records by '+categoryField.label.toLowerCase(),unit:'Records',values:Object.entries(g).map(([name,value])=>({name,value}))};
  }
  const g={};items.forEach(r=>{const d=String(r.created||'Unknown').slice(0,10);g[d]=(g[d]||0)+1});
  return {label:'Records added per day',unit:'Records',values:Object.entries(g).sort().slice(-12).map(([name,value])=>({name,value}))};
}
function drawGraph(){
  const canvas=$('#integration-chart');if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const css=getComputedStyle(document.documentElement);
  const col=n=>css.getPropertyValue(n).trim()||'#7fe3bf';
  const dpr=Math.min(2,window.devicePixelRatio||1),W=Math.max(280,canvas.clientWidth||560),H=Math.max(200,canvas.clientHeight||240);
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const s=chartSeries(),font='13px '+(css.getPropertyValue('--font-sans')||'sans-serif');
  ctx.font='600 '+font;ctx.fillStyle=col('--text');ctx.fillText(s.label.slice(0,70),14,22);
  const table=$('#chart-table-body');if(table){table.replaceChildren();s.values.forEach(v=>{const tr=table.insertRow();tr.insertCell().textContent=v.name;tr.insertCell().textContent=fmt(v.value)})}
  const cap=$('#chart-caption');if(cap)cap.textContent=s.label+'. Values also listed in the table below the chart.';
  canvas.setAttribute('aria-label',s.label+(s.values.length?': '+s.values.map(v=>v.name+' '+fmt(v.value)).slice(0,8).join(', '):': no data yet'));
  if(!s.values.length){ctx.font=font;ctx.fillStyle=col('--muted');ctx.fillText('Add records to see your own values here.',14,H/2);return}
  const left=14,right=W-14,top=40,bottom=H-38;
  let min=Math.min(0,...s.values.map(v=>v.value)),max=Math.max(0,...s.values.map(v=>v.value));if(max===min)max=min+1;
  const y=v=>bottom-(v-min)/(max-min)*(bottom-top),zero=y(0);
  ctx.strokeStyle=col('--edge-strong');ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,zero+.5);ctx.lineTo(right,zero+.5);ctx.stroke();
  const n=s.values.length,slot=(right-left)/n,bw=Math.min(54,slot*.62);
  const accent=col('--accent');
  s.values.forEach((v,i)=>{
    const x=left+slot*i+(slot-bw)/2,yy=y(v.value),h=Math.max(2,Math.abs(zero-yy)),t=Math.min(yy,zero);
    const g=ctx.createLinearGradient(0,t,0,t+h);g.addColorStop(0,accent);g.addColorStop(1,accent+'66');
    ctx.fillStyle=g;const r=Math.min(6,bw/2,h/2);ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x,t,bw,h,v.value>=0?[r,r,0,0]:[0,0,r,r]);else ctx.rect(x,t,bw,h);ctx.fill();
    ctx.fillStyle=col('--text');ctx.font='600 12px sans-serif';ctx.textAlign='center';
    ctx.fillText(fmt(v.value),x+bw/2,Math.max(top-4,t-6));
    ctx.fillStyle=col('--muted');ctx.font='12px sans-serif';
    const label=v.name.length>12?v.name.slice(0,11)+'…':v.name;ctx.fillText(label,x+bw/2,H-16);ctx.textAlign='left';
  });
}
let _chartRO=null;
function watchChart(){const c=$('#integration-chart');if(!c||_chartRO||!('ResizeObserver'in window))return;let t=0;_chartRO=new ResizeObserver(()=>{clearTimeout(t);t=setTimeout(drawGraph,120)});_chartRO.observe(c)}
addEventListener('atlas:settings',()=>drawGraph());

/* ---------- Table of records -------------------------------------------- */
function recordName(rec){return safe(rec[config.fields[0].id]).slice(0,60)||'this record'}
function safeCell(tr,t){const td=tr.insertCell(),s=safe(t);td.textContent=s.length>140?s.slice(0,140)+'…':s;if(s.length>140)td.title=s}
function render(){
  const q=($('#integration-search')?.value||'').trim().toLowerCase();
  const visible=items.filter(r=>!q||config.fields.some(f=>safe(r[f.id]).toLowerCase().includes(q)));
  const table=$('#records');table.replaceChildren();
  visible.forEach(rec=>{
    const tr=table.insertRow();config.fields.forEach(f=>safeCell(tr,rec[f.id]));
    const actions=tr.insertCell(),edit=document.createElement('button'),remove=document.createElement('button');
    edit.type=remove.type='button';edit.textContent='Edit';remove.textContent='Delete';remove.className='btn-danger';
    edit.setAttribute('aria-label','Edit '+recordName(rec));remove.setAttribute('aria-label','Delete '+recordName(rec));
    edit.addEventListener('click',()=>startEdit(rec));
    remove.addEventListener('click',()=>deleteRecord(rec));
    actions.append(edit,' ',remove);
  });
  const empty=$('#records-empty');
  if(empty){empty.hidden=visible.length>0;empty.textContent=items.length?'No records match “'+q+'”. Clear the search to see all '+items.length+'.':'No records yet. Use the form above, or add a sample to explore.'}
  $('#record-count').textContent=items.length+' saved, '+visible.length+' shown';
  insightTiles();drawGraph();if(config.mode==='map')renderMap();Health.render();
}
function startEdit(rec){
  editing=rec.id;
  config.fields.forEach(f=>{const el=$('#field-'+f.id);if(el)el.value=rec[f.id]??''});
  $('#record-save').textContent='Save changes';
  const b=$('#editing-banner');if(b){b.hidden=false;$('#editing-name').textContent=recordName(rec)}
  $('#record-form').scrollIntoView({block:'start'});
  $('#field-'+config.fields[0].id).focus({preventScroll:true});
}
function deleteRecord(rec){
  const before=items.slice();
  items=items.filter(x=>x.id!==rec.id);
  if(!persist()){items=before;render();return}
  if(editing===rec.id)resetForm();
  render();say('Deleted “'+recordName(rec)+'”.');
  Atlas.toast('Deleted “'+recordName(rec)+'”.',{action:{label:'Undo',run:()=>{items=before;if(persist()){render();say('Restored “'+recordName(rec)+'”.')}}},focus:true,returnFocus:$('#integration-search')});
}
function renderMap(){
  const g=$('#integration-map');if(!g)return;g.replaceChildren();const NS='http://www.w3.org/2000/svg';
  for(const r of items){
    const lat=Number(r.lat),lon=Number(r.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
    const c=document.createElementNS(NS,'circle');c.setAttribute('cx',String(lon+180));c.setAttribute('cy',String(90-lat));c.setAttribute('r','3.2');c.setAttribute('class','map-point');
    const t=document.createElementNS(NS,'title');t.textContent=safe(r.place)+' ('+lat+', '+lon+')';c.append(t);g.append(c);
  }
}
function resetForm(){
  $('#record-form').reset();editing=null;$('#record-save').textContent='Save new record';
  const b=$('#editing-banner');if(b)b.hidden=true;
}

/* ---------- Form, search, import and export ---------------------------- */
$('#record-form').addEventListener('submit',e=>{
  e.preventDefault();
  if(!e.currentTarget.reportValidity()){say('Please fix the highlighted field, then save again.');return}
  const old=editing?items.find(x=>x.id===editing):null;
  const rec={id:editing||('r_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)),created:old?.created||new Date().toISOString(),updated:new Date().toISOString()};
  config.fields.forEach(f=>rec[f.id]=$('#field-'+f.id).value);
  if(config.mode==='map'&&(Math.abs(number(rec.lat))>90||Math.abs(number(rec.lon))>180)){say('Coordinates must be within ±90 latitude and ±180 longitude.');return}
  if(!editing&&items.length>=1000){say('This tool holds up to 1,000 records. Export a backup and start a new set.');return}
  const before=items.slice();
  if(editing){const at=items.findIndex(x=>x.id===editing);if(at<0){say('That record no longer exists.');resetForm();return}items[at]={...items[at],...rec}}
  else items.push(rec);
  const wasEditing=!!editing;
  if(persist()){resetForm();render();say(wasEditing?'Changes saved on this device.':'Saved on this device. Export a backup now and then.');Atlas.toast(wasEditing?'Changes saved.':'Record saved.')}
  else{items=before;render()}
});
$('#record-reset').addEventListener('click',()=>{resetForm();say('Form cleared.')});
$('#editing-cancel')?.addEventListener('click',()=>{resetForm();say('Editing cancelled. Nothing was changed.')});
$('#integration-search').addEventListener('input',coalesceCalls(()=>render(),120)); /* call by name: workbenches extend render() */
$('#integration-export').addEventListener('click',()=>{
  download(config.slug+'.json',JSON.stringify({format:'atlas-integration/1',project:config.slug,exported:new Date().toISOString(),records:items,extras:RecordStore.collectExtras()},null,2));
  RecordStore.markExported();say('Backup downloaded. Keep a copy somewhere other than this browser.');
});
$('#integration-csv')?.addEventListener('click',()=>{
  outputCSV(config.slug+'.csv',config.fields.map(f=>f.label),items.map(r=>config.fields.map(f=>r[f.id])));
  say('Spreadsheet (CSV) downloaded with '+items.length+' record'+(items.length===1?'':'s')+'.');
});
$('#integration-import').addEventListener('change',async e=>{
  try{
    const file=e.target.files[0];if(!file)return;
    if(file.size>2000000)throw Error('the file is larger than 2 MB');
    const x=JSON.parse(await file.text());
    if(x.format!=='atlas-integration/1'||x.project!==config.slug||!Array.isArray(x.records))throw Error('this file belongs to a different tool or is not an atlas backup');
    if(x.records.length>1000)throw Error('more than 1,000 records');
    const valid=x.records.map(r=>{
      if(!r||typeof r!=='object'||typeof r.id!=='string')throw Error('a record is missing its id');
      const n={id:r.id.slice(0,80),created:safe(r.created).slice(0,40),updated:safe(r.updated).slice(0,40)};
      for(const field of config.fields){
        const v=r[field.id],el=document.getElementById('field-'+field.id);
        if(typeof v!=='string'&&typeof v!=='number')throw Error('“'+field.label+'” is missing in a record');
        const sv=safe(v);
        if(el?.required&&sv.trim()==='')throw Error('“'+field.label+'” is empty in a record');
        if(sv.length>5000)throw Error('“'+field.label+'” is longer than 5,000 characters');
        if(field.type==='number'){
          if(sv.trim()!==''&&!Number.isFinite(Number(v)))throw Error('“'+field.label+'” is not a number');
          if(el&&el.min!==''&&Number(v)<Number(el.min))throw Error('“'+field.label+'” is below '+el.min);
          if(el&&el.max!==''&&Number(v)>Number(el.max))throw Error('“'+field.label+'” is above '+el.max);
        }
        if(field.type==='date'&&sv&&(!/^\d{4}-\d{2}-\d{2}$/.test(sv)||new Date(sv+'T00:00:00Z').toISOString().slice(0,10)!==sv))throw Error('“'+field.label+'” is not a valid date');
        if(field.type.startsWith('select:')&&!field.type.slice(7).split('|').includes(sv))throw Error('“'+field.label+'” has an unexpected value');
        n[field.id]=sv;
      }
      return n;
    });
    const map=new Map(items.map(r=>[r.id,r]));valid.forEach(r=>map.set(r.id,r));
    if(map.size>1000)throw Error('merging would exceed 1,000 records');
    const before=items;items=[...map.values()];
    if(x.extras)RecordStore.applyExtras(x.extras);
    if(!persist()){items=before;render();throw Error('saving failed, so your existing records were kept')}
    render();say('Validated and merged '+valid.length+' records. Records with the same id were updated.');
    Atlas.toast('Backup restored: '+valid.length+' record'+(valid.length===1?'':'s')+'.');
  }catch(err){say('Import stopped: '+err.message+'. Nothing was changed.')}
  finally{e.target.value=''}
});
$('#integration-clear').addEventListener('click',()=>{
  if(!items.length){say('There are no records to delete.');return}
  if(!confirm('Delete all '+items.length+' records in this tool on this device? You can undo for a few seconds afterwards.'))return;
  const before=items.slice();items=[];
  if(!persist()){items=before;render();return}
  resetForm();render();say('All records deleted from this device.');
  Atlas.toast('Deleted '+before.length+' records.',{action:{label:'Undo',run:()=>{items=before;if(persist()){render();say('All records restored.')}}},focus:true,returnFocus:$('#integration-search')});
});
/* Samples: each click adds the next realistic example from this tool's
   config. They are illustrations only; replace them with your own data.
   A date sample may be written "today", "today+14" or "today-3", so
   examples about deadlines stay meaningful whenever they are loaded. */
let _sampleIndex=0;
function sampleValue(f,v){const s=safe(v??''),m=f.type==='date'&&/^today([+-]\d{1,4})?$/.exec(s);if(!m)return s;const d=new Date();d.setDate(d.getDate()+Number(m[1]||0));return localYMD(d)}
$('#sample-load').addEventListener('click',()=>{
  if(items.length>=1000){say('Record limit reached. Export a backup first.');return}
  const pool=Array.isArray(config.samples)&&config.samples.length?config.samples:null;
  const r={id:'example_'+Date.now().toString(36)+'_'+_sampleIndex,created:new Date().toISOString(),updated:new Date().toISOString()};
  if(pool){const s=pool[_sampleIndex%pool.length];config.fields.forEach(f=>r[f.id]=sampleValue(f,s[f.id]))}
  else config.fields.forEach(f=>{r[f.id]=f.type==='number'?'2':f.type==='date'?localYMD():f.type.startsWith('select:')?f.type.slice(7).split('|')[0]:f.type==='url'?'https://example.org':f.label+' sample'});
  _sampleIndex++;items.push(r);
  if(!persist()){items.pop();render();return}
  render();say('Sample added: “'+recordName(r)+'”. Samples are illustrations; replace them with your own data.');
});

/* ---------- Storage health ----------------------------------------------
   Shows where your records live, how big they are, when you last made a
   backup, and lets you ask the browser to keep them (it may say no). */
const Health=(()=>{
  let persisted=null;
  function render(){
    const box=$('#storage-health');if(!box)return;
    const meta=RecordStore.meta(),st=RecordStore.state;
    const bytes=new Blob([JSON.stringify(items)]).size;
    const rows=[
      ['Records',String(items.length),'Up to 1,000 per tool'],
      ['Size on this device',!items.length?'Empty':bytes<1024?bytes+' bytes':(bytes/1024).toFixed(1)+' KB','Plain text, readable in any editor once exported'],
      ['Quick store',st.local===false?'Not available':items.length?'Saved':'Ready','localStorage'],
      ['Backup store',st.idb===true?'Saved':st.idb==='ready'?'Ready':st.idb===false?'Not available':'Checking…','IndexedDB copy'],
      ['Last exported backup',meta.lastExport?new Date(meta.lastExport).toLocaleDateString(undefined,{dateStyle:'medium'}):'Never','Export after important changes'],
      ['Kept by the browser',persisted===true?'Yes':persisted===false?'Not yet':'Unknown','Browsers may clear unprotected data when space runs low']
    ];
    const dl=document.createElement('dl');dl.className='facts';
    rows.forEach(([k,v,n])=>{const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),s=document.createElement('small');dt.textContent=k;dd.textContent=v;s.className='muted';s.textContent=n;dd.append(s);d.append(dt,dd);dl.append(d)});
    box.replaceChildren(dl);
  }
  async function check(){try{if(navigator.storage?.persisted)persisted=await navigator.storage.persisted()}catch{}render()}
  $('#storage-persist')?.addEventListener('click',async()=>{
    const out=$('#storage-persist-status');
    if(!navigator.storage?.persist){out.textContent='This browser does not offer that option. Regular JSON backups are the safest choice.';return}
    try{persisted=await navigator.storage.persist();out.textContent=persisted?'Done: the browser will keep this atlas\'s data unless you clear it yourself.':'The browser declined for now (this is common for sites you have not installed or bookmarked). Keep exporting backups.'}
    catch{out.textContent='The request could not be made here. Keep exporting backups.'}
    render();
  });
  return {render,check};
})();

/* ---------- Toolkit used by the purpose-built workbenches --------------- */
const purposeRoot=document.getElementById('purpose-output');
function node(tag,text='',parent=purposeRoot){const x=document.createElement(tag);x.textContent=String(text);parent.append(x);return x}
function wipe(){purposeRoot.replaceChildren()}
function line(label,value){const p=node('p');p.className='stat-line';node('strong',label+': ',p);node('span',value,p);return p}
function rows(headers,data){const wrap=node('div');wrap.className='table-scroll';const t=node('table','',wrap),h=node('thead','',t),tr=node('tr','',h);headers.forEach(x=>{const th=node('th',x,tr);th.scope='col'});const body=node('tbody','',t);data.forEach(row=>{const r=node('tr','',body);row.forEach(v=>node('td',v,r))});if(!data.length){const r=node('tr','',body),td=node('td','Nothing to show yet.',r);td.colSpan=headers.length;td.className='muted'}return t}
/* CSV cells are quoted, and anything a spreadsheet could run as a formula
   is neutralised with a leading apostrophe. */
function csv(v){let t=String(v??'');if(/^\s*[=+@\t\r]/.test(t)||/^\s*-(?!\d+(?:\.\d+)?\s*$)/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'}
function outputCSV(name,heads,data){download(name,'﻿'+[heads,...data].map(r=>r.map(csv).join(',')).join('\r\n'),'text/csv;charset=utf-8')}
function num(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
function fmt(n){return Number.isFinite(n)?new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(n):'not available'}
function groupBy(key){const m=new Map();items.forEach(r=>{const k=String(r[key]??'').trim()||'Not supplied';if(!m.has(k))m.set(k,[]);m.get(k).push(r)});return m}
function eventButton(id,action){const el=document.getElementById(id);if(el)el.addEventListener('click',action)}

/* First paint, then reconcile with the IndexedDB copy in the background. */
render();watchChart();Health.check();
/* Wait until every script on the page (including the workbench) has run. */
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>RecordStore.reconcile().catch(()=>{}),{once:true});
else setTimeout(()=>RecordStore.reconcile().catch(()=>{}),0);
