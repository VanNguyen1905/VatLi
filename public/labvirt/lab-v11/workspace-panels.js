// View preferences only. Measurement records and account storage are untouched.
const KEY='labvirt-floating-tools-v1',margin=10,panels=[];
let preferences={};try{preferences=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
const store=()=>{try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{}};
const size=()=>({width:window.innerWidth,height:window.innerHeight});
const clamp=(n,min,max)=>Math.max(min,Math.min(n,Math.max(min,max)));
function attach(panel,handle,id,{dock}={}){
 if(!panel||!handle)return;
 const saved=preferences[id]&&typeof preferences[id]==='object'?preferences[id]:{};
 const state={x:Number.isFinite(saved.x)?saved.x:18,y:Number.isFinite(saved.y)?saved.y:124,width:Number.isFinite(saved.width)?saved.width:322,height:Number.isFinite(saved.height)?saved.height:520,minimized:saved.minimized===true,translucent:saved.translucent===true};
 const sync=()=>{panel.classList.toggle('is-minimized',state.minimized);panel.classList.toggle('is-translucent',state.translucent);const min=panel.querySelector('.panel-minimize'),opacity=panel.querySelector('.panel-opacity');if(min){min.textContent=state.minimized?'+':'−';min.setAttribute('aria-expanded',String(!state.minimized));}opacity?.setAttribute('aria-pressed',String(state.translucent));};
 let drag=null,resize=null,moved=Number.isFinite(saved.x);
 const apply=()=>{
  if(!dock&&!moved)return;
  const viewport=size(),minWidth=Math.min(270,viewport.width-margin*2),minHeight=Math.min(155,viewport.height-margin*2);
  state.width=clamp(state.width,minWidth,viewport.width-margin*2);
  state.height=clamp(state.height,minHeight,Math.max(minHeight,viewport.height-(viewport.height<500?100:140)));
  const height=!dock?panel.getBoundingClientRect().height:panel.classList.contains('is-minimized')?65:state.height;
  state.x=clamp(state.x,margin,viewport.width-state.width-margin);
  state.y=clamp(state.y,margin,viewport.height-height-margin);
  for(const [name,value]of Object.entries({left:state.x,top:state.y,width:state.width,...(dock?{height}:{})}))panel.style[name]=value+'px';
  panel.style.right='auto';panel.style.bottom='auto';panel.style.transform='none';
 };
 const save=()=>{preferences[id]={...state};store();};
 handle.classList.add('floating-handle');handle.title='Kéo thanh tiêu đề để di chuyển bảng';
 handle.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button,a,input,select'))return;
  moved=true;const r=panel.getBoundingClientRect();state.x=r.left;state.y=r.top;state.width=r.width;
  if(!panel.classList.contains('is-minimized'))state.height=r.height;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:state.x,top:state.y};
  handle.setPointerCapture(event.pointerId);panel.classList.add('is-moving');event.preventDefault();event.stopPropagation();
 });
 handle.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;state.x=drag.left+event.clientX-drag.x;state.y=drag.top+event.clientY-drag.y;apply();});
 const endDrag=event=>{if(drag?.id!==event.pointerId)return;drag=null;panel.classList.remove('is-moving');save();};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,endDrag);
 if(dock){
  panel.classList.add('floating-tool');
  const body=document.createElement('div');body.className='floating-panel-body';
  for(const child of [...panel.childNodes])if(child!==handle)body.append(child);
  panel.append(body);
  const actions=document.createElement('div');actions.className='floating-panel-actions';
  const opacity=document.createElement('button');opacity.type='button';opacity.className='panel-opacity';opacity.textContent='◐';opacity.title='Làm bảng trong hơn';opacity.setAttribute('aria-label','Làm bảng trong hơn');opacity.setAttribute('aria-pressed','false');
  opacity.onclick=()=>{state.translucent=!state.translucent;sync();save();};
  const minimize=document.createElement('button');minimize.type='button';minimize.className='panel-minimize';minimize.textContent='−';minimize.title='Thu gọn bảng';minimize.setAttribute('aria-label','Thu gọn bảng điều khiển');minimize.setAttribute('aria-expanded','true');
  minimize.onclick=()=>{state.minimized=!state.minimized;sync();apply();save();};
  const close=handle.querySelector('.close-panel');actions.append(opacity,minimize);if(close)actions.append(close);handle.append(actions);
  const grip=document.createElement('button');grip.className='panel-resize';grip.type='button';grip.title='Kéo để đổi kích thước; dùng phím mũi tên khi chọn nút này';grip.setAttribute('aria-label','Đổi kích thước bảng điều khiển');grip.textContent='◢';panel.append(grip);
  // Lesson-specific controls are added after the renderer starts. Keep those
  // controls in the scrolling body without changing their IDs or handlers.
  new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)if(node.parentNode===panel&&![handle,body,grip].includes(node))body.append(node);}).observe(panel,{childList:true});
  grip.addEventListener('pointerdown',event=>{if(event.button!==0)return;resize={id:event.pointerId,x:event.clientX,y:event.clientY,width:state.width,height:state.height};grip.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();});
  grip.addEventListener('pointermove',event=>{if(resize?.id!==event.pointerId)return;state.width=resize.width+event.clientX-resize.x;state.height=resize.height+event.clientY-resize.y;apply();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(event,e=>{if(resize?.id!==e.pointerId)return;resize=null;save();});
  grip.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();state.width+=event.key==='ArrowRight'?16:event.key==='ArrowLeft'?-16:0;state.height+=event.key==='ArrowDown'?16:event.key==='ArrowUp'?-16:0;apply();save();});
  dock.addEventListener('toggle',()=>{if(dock.open)apply();});
  sync();apply();
 }else{const body=panel.querySelector('#reportBody');if(body)new MutationObserver(apply).observe(body,{attributes:true,attributeFilter:['class']});}
 panels.push({panel,apply,id,snapshot:()=>({state:{...state},moved,style:panel.getAttribute('style')}),restore:value=>{if(value){Object.assign(state,value.state);moved=value.moved;if(value.style===null)panel.removeAttribute('style');else panel.setAttribute('style',value.style);sync();apply();}},reset:()=>{Object.assign(state,{x:18,y:124,width:322,height:520,minimized:false,translucent:false});moved=false;sync();panel.removeAttribute('style');apply();}});
}
for(const dock of document.querySelectorAll('.dock-tool'))attach(dock.querySelector('.panel'),dock.querySelector('.panel-title'),dock.id,{dock});
attach(document.querySelector('.report'),document.querySelector('.report-head'),'report');
const fit=()=>{for(const {panel,apply}of panels)if(panel.getClientRects().length)apply();};
window.addEventListener('resize',fit,{passive:true});
window.visualViewport?.addEventListener('resize',fit,{passive:true});

window.labvirtPanelLayout={snapshot:()=>Object.fromEntries(panels.map(p=>[p.id,p.snapshot()])),restore:values=>{for(const p of panels)p.restore(values?.[p.id]);},reset:()=>{preferences={};store();for(const p of panels)p.reset();}};
