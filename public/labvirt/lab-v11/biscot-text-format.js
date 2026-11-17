/**
 * LABVIRT V15 — Chuyển câu trả lời Biscot sang chữ Việt và công thức Unicode.
 * Không dùng innerHTML. Không tin HTML/Markdown từ model.
 * Ký hiệu toán quan trọng được bảo toàn ở dạng văn bản dễ đọc.
 */
import {fixBrokenVietnamese} from './biscot-unicode.js';
const SYMBOLS = Object.freeze({
  Omega:'Ω',omega:'ω',times:'×',cdot:'·',Delta:'Δ',delta:'δ',mu:'µ',
  pi:'π',alpha:'α',beta:'β',theta:'θ',lambda:'λ',ge:'≥',le:'≤',
  neq:'≠',approx:'≈',pm:'±',infty:'∞',rightarrow:'→',degree:'°',
});
// Parse balanced groups instead of flattening fractions with string replacement.
function plainMath(source){
  let i=0;
  const group=()=>{while(source[i]===' ')i++;if(source[i]!=='{')return null;i++;let depth=1,start=i;while(i<source.length&&depth){if(source[i]==='{')depth++;if(source[i]==='}')depth--;i++;}return depth?null:plainMath(source.slice(start,i-1));};
  let out='';
  while(i<source.length){
    if(source[i]!=='\\'){out+=source[i++];continue;}
    const start=i++;const command=/^[a-zA-Z]+/.exec(source.slice(i))?.[0];
    if(!command){out+=source[i++]||'';continue;}i+=command.length;
    if(['frac','dfrac','tfrac'].includes(command)){
      const a=group(),b=group();
      if(a!==null&&b!==null){const atom=x=>/^[\p{L}\p{N}]+$/u.test(x)?x:`(${x})`;out+=`${atom(a)}/${atom(b)}`;}
      else{out+='[công thức chưa đầy đủ]';i=Math.max(i,start+1);}
    }else if(['text','mathrm','mathbf','mathit','operatorname'].includes(command)){out+=group()??'';}
    else if(command==='sqrt'){out+=`√(${group()??'?'})`;}
    else if(['left','right','displaystyle'].includes(command)){/* Delimiter formatting only. */}
    else out+=SYMBOLS[command]??`[ký hiệu ${command}]`;
  }
  return out;
}
export function readableBiscotText(source) {
  let text=fixBrokenVietnamese(String(source??'')).normalize('NFC');
  text=text.replace(/\$\$|(?<!\\)\$|\\\(|\\\)|\\\[|\\\]/g,'');
  text=plainMath(text);
  const scripts={'L':'ₗ','l':'ₗ','C':'꜀','c':'꜀','0':'₀','1':'₁','2':'₂'};
  text=text.replace(/_(?:\{([LCcl012])\}|([LCcl012]))/g,(_,a,b)=>scripts[a??b]);
  text=text.replace(/\\([{}$])/g,'$1');
  text=text.replace(/^\s{0,3}#{1,6}\s+/gm,'');
  text=text.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,(_,a,b)=>a??b);
  text=text.replace(/^\s*\*\s+/gm,'• ');
  text=text.replace(/`([^`\n]+)`/g,'$1');
  text=text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'$1 ($2)');
  return text.normalize('NFC').trim();
}
