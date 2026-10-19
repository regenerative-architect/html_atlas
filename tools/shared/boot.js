/* Atlas boot: applies your saved comfort settings before the page paints,
   so there is no flash of the wrong theme. Runs in <head>, reads one
   localStorage key on this device, sends nothing anywhere. */
(function(){
  var d=document.documentElement,s={};
  try{s=JSON.parse(localStorage.getItem('atlas_settings_v3')||'{}')||{}}catch(e){s={}}
  var mq=function(q){try{return window.matchMedia&&window.matchMedia(q).matches}catch(e){return false}};
  d.classList.add('js');
  d.setAttribute('data-theme',s.theme||'auto');
  d.setAttribute('data-motion',s.motion==='reduced'||(s.motion!=='full'&&mq('(prefers-reduced-motion: reduce)'))?'reduced':'full');
  d.setAttribute('data-ambient',s.ambient||'on');
  d.setAttribute('data-text',s.text||'normal');
  d.setAttribute('data-reading',s.reading||'normal');
  d.setAttribute('data-game',s.game||'on');
  if(s.glass==='solid')d.setAttribute('data-glass','lite');
})();
