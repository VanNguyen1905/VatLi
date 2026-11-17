// A staged iframe avoids navigating a nested document during fullscreen handoff.
// All original modules retain their contents, quality and device behavior.
const parameters=new URLSearchParams(location.search);
const attempt=Number(parameters.get('attempt')||0);
let bootPromise;
function boot(){
  if(bootPromise)return bootPromise;
  bootPromise=import('./app.js?v=labvirt-v15-interaction').then(()=>Promise.all([
    import('./biscot-room.js?v=163'),import('./utf8-guard.js?v=15'),import('../live/canvas-stream.js'),
  ])).catch(error=>{
    const detail=String(error?.message||error).slice(0,400);
    const status=document.getElementById('sceneStatus');if(status)status.textContent='Không khởi tạo được phòng 3D: '+detail;
    if(parent!==window)parent.postMessage({type:'labvirt:scene-error',attempt,message:detail},location.origin);
    console.error('LABVIRT runtime loader:',detail);
  });
  return bootPromise;
}
if(parameters.get('deferBoot')==='1'&&parent!==window){
  window.addEventListener('message',event=>{
    if(event.origin===location.origin&&event.source===parent&&event.data?.type==='labvirt:boot-runtime'&&Number(event.data.attempt)===attempt)void boot();
  });
  parent.postMessage({type:'labvirt:runtime-staged',attempt},location.origin);
}else void boot();
