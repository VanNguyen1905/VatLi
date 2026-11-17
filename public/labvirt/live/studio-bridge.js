// No media or Firebase in this intermediary: only the two exact iframe windows.
const commands=new Set(['configure','request','cancel','start','answer','ice','stop','notice','watching']);
const events=new Set(['availability','publisher-ready','decline','offer','ice','connection','stopped','metrics']);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.data?.type!=='labvirt:canvas-live'||event.data?.version!==1)return;
 const frame=document.getElementById('labRuntime');if(!frame?.contentWindow)return;
 if(event.source===parent&&parent!==window&&commands.has(event.data.operation)){frame.contentWindow.postMessage(event.data,location.origin);return;}
 if(event.source!==frame.contentWindow||!events.has(event.data.event)||parent===window)return;
 const surface=document.getElementById('labFullscreenSurface'),phase=document.getElementById('runtimePhase');
 if(event.data.event==='availability'&&event.data.available&&(!surface||surface.classList.contains('hidden')||!phase||phase.classList.contains('hidden')||phase.style.visibility==='hidden'))return;
 parent.postMessage(event.data,location.origin);
});
