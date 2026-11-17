import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {X,GripHorizontal} from 'lucide-react';

type Drag={id:number;x:number;y:number;offset:number;lastX:number;lastAt:number;velocity:number;intent:boolean};
const openPanels=new WeakMap<HTMLElement,Set<HTMLElement>>();
export function GestureDrawer({open,onOpenChange,side,title,children,edge=false,disabled=false}:{open:boolean;onOpenChange:(value:boolean)=>void;side:'left'|'right';title:string;children:ReactNode;edge?:boolean;disabled?:boolean}){
 const panel=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),restore=useRef<HTMLElement|null>(null),ignoreClick=useRef(false),restoreFocus=useRef(true);
 const [offset,setOffset]=useState<number|null>(null),[preview,setPreview]=useState(false);
 const direction=side==='right'?1:-1;
 const width=()=>Math.min(window.innerWidth-28,side==='right'?390:300);
 useEffect(()=>{
  if(!open||disabled)return;
  const previous=document.activeElement as HTMLElement|null,root=document.querySelector<HTMLElement>('.vt-app-shell'),currentPanel=panel.current;restore.current=previous;
  if(root&&currentPanel){const panels=openPanels.get(root)??new Set<HTMLElement>();panels.add(currentPanel);openPanels.set(root,panels);root.inert=true;}
  panel.current?.querySelector<HTMLElement>('button,a,input,select,[tabindex="0"]')?.focus({preventScroll:true});
  return()=>{if(root&&currentPanel){const panels=openPanels.get(root);panels?.delete(currentPanel);root.inert=!!panels?.size;}if(!root?.inert&&restoreFocus.current&&restore.current?.isConnected)restore.current.focus({preventScroll:true});};
 },[open,disabled]);
 function down(event:PointerEvent<HTMLElement>,opening=false){
  if(disabled||event.button!==0)return;
  ignoreClick.current=false;
  restoreFocus.current=event.pointerType!=='touch';
  event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,offset:opening?width():0,lastX:event.clientX,lastAt:event.timeStamp,velocity:0,intent:false};
 }
 function move(event:PointerEvent<HTMLElement>){
  const value=drag.current;if(!value||event.pointerId!==value.id)return;
  const dx=(event.clientX-value.x)*direction,dy=event.clientY-value.y;
  if(!value.intent&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){ignoreClick.current=true;cancel();return;}
  if(!value.intent&&Math.abs(dx)<7)return;
  value.intent=true;setPreview(true);value.velocity=(event.clientX-value.lastX)*direction/Math.max(1,event.timeStamp-value.lastAt);value.lastX=event.clientX;value.lastAt=event.timeStamp;
  setOffset(Math.max(0,Math.min(width(),value.offset+dx)));
 }
 function up(event:PointerEvent<HTMLElement>){
  const value=drag.current;if(!value)return;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(value.intent){ignoreClick.current=true;const final=Math.max(0,Math.min(width(),value.offset+(event.clientX-value.x)*direction));onOpenChange(value.velocity<-.45||(value.velocity<.45&&final<width()*.5));}
  drag.current=null;setOffset(null);setPreview(false);
 }
 function cancel(){drag.current=null;setOffset(null);setPreview(false);}
 function keyboard(event:React.KeyboardEvent){
  if(event.key==='Escape'){restoreFocus.current=true;event.preventDefault();onOpenChange(false);return;}
  if(event.key!=='Tab')return;
  const nodes=[...panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input,select,textarea,[tabindex="0"]')??[]].filter(node=>node.getClientRects().length);
  const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }
 const shown=(open||preview)&&!disabled;
 const distance=offset??(open?0:390);
 return <>
  {edge&&!disabled&&!open&&<button className="premium-edge-handle" aria-label="Mở tiến độ bài học" onClick={()=>{if(ignoreClick.current){ignoreClick.current=false;return;}onOpenChange(true);}} onPointerDown={event=>down(event,true)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>‹</button>}
  {createPortal(<div className={`premium-drawer-layer ${shown?'is-visible':''} ${preview?'is-dragging':''}`} aria-hidden={!shown} onKeyDown={keyboard} onPointerDownCapture={()=>{ignoreClick.current=false;}} onClickCapture={event=>{if(ignoreClick.current){ignoreClick.current=false;event.preventDefault();event.stopPropagation();}}}>
   <button tabIndex={-1} className="premium-drawer-backdrop" aria-label={`Đóng ${title}`} onPointerDown={event=>{restoreFocus.current=event.pointerType!=='touch';onOpenChange(false);}} onClick={event=>{if(event.detail===0)onOpenChange(false);}} style={{opacity:shown?Math.max(0,1-distance/width()):0}}/>
   <div ref={panel} inert={!shown} role="dialog" aria-modal="true" aria-label={title} className={`premium-drawer-panel from-${side}`} style={{transform:`translateX(${direction*(shown?distance:410)}px)`}}>
    <header className="premium-drawer-grip" onPointerDown={event=>down(event)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}><GripHorizontal aria-hidden="true"/><strong>{title}</strong><button aria-label={`Đóng ${title}`} onPointerDown={event=>event.stopPropagation()} onClick={()=>onOpenChange(false)}><X size={20}/></button></header>
    <div className="premium-drawer-body">{children}</div>
   </div>
  </div>,document.body)}
 </>;
}
