/* Bridge chỉ đọc màn điều khiển bài 1; tuyệt đối không can thiệp số đo hay đồ họa 3D. */
(() => {
  'use strict';
  if (window.__biscotDmmObserver) return;
  window.__biscotDmmObserver = true;
  const id = name => document.getElementById(name);
  let previous = '', lastPublished = 0;
  const read = () => ({
    lessonId: 'B1_P1',
    screen: 'practice',
    selectedComponent: (id('compPicker')?.value || '').slice(0,50),
    componentDefect: (id('defectPicker')?.value || '').slice(0,30),
    mode: (id('lcd-mode-txt')?.textContent || '').trim(),
    redPin: (id('lblProbeRed')?.textContent || '').includes('Chưa cắm') ? null : (id('lblProbeRed')?.textContent || '').trim(),
    blackPin: (id('lblProbeBlack')?.textContent || '').includes('Chưa cắm') ? null : (id('lblProbeBlack')?.textContent || '').trim(),
    lcd: (id('lcd-val')?.textContent || '').trim().slice(0,40),
    lcdState: (id('lcd-state-txt')?.textContent || '').trim().slice(0,60),
    measurementValid: null, // Không tự xác nhận kết quả chỉ từ một dòng chữ trên LCD.
    sceneReady: !!id('webgl-canvas'),
  });
  function emit() {
    if (!id('lcd-val')) return;
    const snapshot = read(), serialized = JSON.stringify(snapshot), now=Date.now();
    if (serialized === previous && now-lastPublished < 5000) return;
    previous=serialized;lastPublished=now;
    if (window.top && window.top !== window) window.top.postMessage({type:'biscot:lab-context',source:'utt-dmm',state:snapshot},location.origin);
  }
  document.addEventListener('click',()=>window.setTimeout(emit,0),{passive:true});
  document.addEventListener('change',()=>window.setTimeout(emit,0),{passive:true});
  const start = () => {
    const targets = ['lcd-val','lcd-state-txt','lcd-mode-txt','lblProbeRed','lblProbeBlack'];
    const observer = new MutationObserver(emit);
    for(const name of targets){const node=id(name);if(node)observer.observe(node,{childList:true,characterData:true,subtree:true});}
    emit();const timer=window.setInterval(emit,1200);
    window.addEventListener('pagehide',()=>{observer.disconnect();window.clearInterval(timer);},{once:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
