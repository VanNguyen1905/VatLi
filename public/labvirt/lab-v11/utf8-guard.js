/**
 * LABVIRT V13 — bảo vệ tiếng Việt ở tầng UI.
 * Nguồn HTML/JS/CSS phải được lưu và serve UTF-8; hàm này chỉ xử lý dữ liệu
 * đã bị giải mã nhầm Windows-1252 trong trình duyệt cũ/cache.
 * Không đụng nội dung input, mã nguồn, dữ liệu mô phỏng hay Canvas 3D.
 */
import {fixBrokenVietnamese} from './biscot-unicode.js';
export {fixBrokenVietnamese} from './biscot-unicode.js';
const skipTags=new Set(['SCRIPT','STYLE','TEXTAREA','CODE','PRE','NOSCRIPT']);
function walk(node){
  if(node.nodeType===3){const parent=node.parentElement;if(parent&&skipTags.has(parent.tagName))return;
    const fixed=fixBrokenVietnamese(node.nodeValue);if(fixed!==node.nodeValue)node.nodeValue=fixed;return;}
  if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;
  if(node.nodeType===1){
    if(skipTags.has(node.tagName))return;
    for(const attribute of ['title','aria-label','placeholder','alt'])if(node.hasAttribute(attribute)){
      const old=node.getAttribute(attribute),fixed=fixBrokenVietnamese(old);
      if(old!==fixed)node.setAttribute(attribute,fixed);
    }
  }
  for(let child=node.firstChild;child;child=child.nextSibling)walk(child);
}
if(typeof document!=='undefined'){
  const start=()=>{
    if(document.characterSet&&document.characterSet.toUpperCase()!=='UTF-8'){
      console.error('[LABVIRT] Document charset không phải UTF-8:',document.characterSet);
    }
    walk(document.body);
    let pending=new Set(),scheduled=false;
    const flush=()=>{scheduled=false;const list=[...pending];pending.clear();for(const n of list)if(n.isConnected)walk(n);};
    const observer=new MutationObserver(mutations=>{
      for(const m of mutations){if(m.type==='characterData')pending.add(m.target);
        else for(const n of m.addedNodes)pending.add(n);
      }
      if(pending.size&&!scheduled){scheduled=true;requestAnimationFrame(flush);}
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
