/* Đồng bộ học phần UI với Biscot ở React. Không sử dụng dữ liệu này để ghi điểm. */
(() => {
  'use strict';
  if(window.__biscotModuleBridge) return;
  window.__biscotModuleBridge=true;
  try { if(window.top!==window && window.top.document.querySelector('.vt-app-shell')) document.documentElement.classList.add('biscot-hosted'); } catch {}
  const get = () => window.uttBiscotContext?.();
  let prior='',last=0;
  function send() {
    const raw=get(); if(!raw||typeof raw!=='object')return;
    const snapshot={
      lessonId:'B1_P1',screen:raw.screen,task:raw.task,selectedCount:raw.selectedCount,
      completed:raw.completed,total:18,selectedComponent:raw.selectedComponent,
      lastAction:raw.lastAction,
    };
    const current=JSON.stringify(snapshot),now=Date.now();
    if(current===prior&&now-last<6000)return;
    prior=current;last=now;
    if(window.top!==window)window.top.postMessage({type:'biscot:lab-context',source:'utt-module',state:snapshot},location.origin);
  }
  window.addEventListener('utt:biscot-context',send);
  document.addEventListener('click',()=>window.setTimeout(send,0),{passive:true});
  const timer=window.setInterval(send,1500);
  window.addEventListener('pagehide',()=>window.clearInterval(timer),{once:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',send,{once:true});else send();
})();
