/* BISCOT TELEMETRY V8: chỉ đọc diagnostics, không sửa WebGL / Blender / kết quả đo. */
(() => {
  'use strict';
  if (window.__biscotTelemetryV8) return;
  window.__biscotTelemetryV8 = true;
  let previous='',lastSent=0,disposed=false;
  function emit() {
    if(disposed || typeof window.labvirtDiagnostics!=='function')return;
    let diagnostic;try{diagnostic=window.labvirtDiagnostics();}catch{return;}
    if(!diagnostic || !diagnostic.modelsLoaded)return;
    const step = diagnostic.blackJack==='NONE'?'JACK_BLACK':
      diagnostic.redJack==='NONE'?'JACK_RED':diagnostic.mode==='OFF'?'SELECT_MODE':
      !diagnostic.blackPin?'CONTACT_BLACK':!diagnostic.redPin?'CONTACT_RED':
      diagnostic.validMeasure?'RECORD_MEASUREMENT':'CHECK_CONNECTION';
    const state={
      lessonId:'B1_P1',screen:'practice',stepId:step,
      selectedComponent:diagnostic.component,componentDefect:diagnostic.defect,
      mode:diagnostic.mode,redJack:diagnostic.redJack,blackJack:diagnostic.blackJack,
      redPin:diagnostic.redPin,blackPin:diagnostic.blackPin,
      lcd:diagnostic.lcd,measurementValid:diagnostic.validMeasure===true,
      measurementReason:diagnostic.reason,completed:diagnostic.completed,total:18,
      sceneReady:diagnostic.modelsLoaded===true,
    };
    const serialized=JSON.stringify(state),now=Date.now();
    if(serialized===previous && now-lastSent<5000)return;
    previous=serialized;lastSent=now;
    if(window.top!==window)window.top.postMessage({type:'biscot:lab-context',source:'labvirt-v8',state},location.origin);
  }
  const timer=window.setInterval(emit,400);
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='biscot:request-context')emit();});
  window.addEventListener('pagehide',()=>{disposed=true;window.clearInterval(timer);},{once:true});
  emit();
})();
