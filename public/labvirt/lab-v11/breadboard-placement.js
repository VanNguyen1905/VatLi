/** LABVIRT V14 — chỉ sử dụng lỗ của manifest Blender để đặt mẫu. */
export const LAB_BREADBOARD_SLOT=Object.freeze({
  R1:{column:10,row:'F'},R2:{column:40,row:'F'},R3:{column:50,row:'F'},
  C1:{column:10,row:'J'},C2:{column:40,row:'J'},L:{column:55,row:'J'},
});
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const vec=(p,label)=>{
  if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error('INVALID_BOARD_VECTOR:'+label);
};
export function boardSlot(manifest,component,overrideHoleId=null){
  const slot=LAB_BREADBOARD_SLOT[component];if(!slot)throw Error('UNKNOWN_BOARD_COMPONENT:'+component);
  const holes=manifest?.boardTopology?.holes,bounds=manifest?.breadboard?.bounds,sample=manifest?.parts?.[component];
  if(!Array.isArray(holes)||!bounds||!sample?.pins)throw Error('BOARD_MANIFEST_MISSING');
  const id=overrideHoleId||slot.row+slot.column;
  const anchor=holes.find(h=>h.id===id);if(!anchor)throw Error('BOARD_HOLE_MISSING:'+id);
  if(anchor.id[0]!==slot.row)throw Error('WRONG_BOARD_ROW:'+id);
  vec(anchor.position,id);const a=sample.pins.PIN_A,b=sample.pins.PIN_B;vec(a,component+':A');vec(b,component+':B');
  const midpoint=a.map((v,i)=>(v+b[i])/2);
  const target=[anchor.position[0],anchor.position[1]+.0007,anchor.position[2]];
  const offset=target.map((v,i)=>v-midpoint[i]);
  const pins={PIN_A:a.map((v,i)=>v+offset[i]),PIN_B:b.map((v,i)=>v+offset[i])};
  const holeIds={},pinNodes={};let contactError=0;
  for(const [name,p] of Object.entries(pins)){
    if(p[0]<bounds.min[0]+.001||p[0]>bounds.max[0]-.001||p[2]<bounds.min[2]+.001||p[2]>bounds.max[2]-.001||p[1]<bounds.max[1]-.002||p[1]>bounds.max[1]+.007)throw Error('BOARD_PIN_OUTSIDE:'+component+':'+name);
    const sameRow=holes.filter(h=>h.id[0]===slot.row);
    let nearest=null,d=Infinity;
    for(const h of sameRow){const n=dist(h.position,p);if(n<d){nearest=h;d=n;}}
    if(!nearest||d>.0025)throw Error('BOARD_CONTACT_TOO_FAR:'+component+':'+name);
    holeIds[name]=nearest.id;pinNodes[name]=nearest.node;contactError=Math.max(contactError,d);
  }
  if(pinNodes.PIN_A===pinNodes.PIN_B)throw Error('BOARD_PINS_SHORTED:'+component);
  return {component,anchorId:anchor.id,anchor:target,offset,pins,holeIds,pinNodes,contactError};
}
export function placementClear(candidate,others,minDistance=.009){
  if(!candidate||!Array.isArray(others))return false;
  for(const other of others){
    if(!other)continue;
    if(candidate.anchorId===other.anchorId)return false;
    const d=dist(candidate.anchor,other.anchor);
    if(d<minDistance)return false;
    if(candidate.pinNodes?.PIN_A===other.pinNodes?.PIN_A||candidate.pinNodes?.PIN_A===other.pinNodes?.PIN_B||candidate.pinNodes?.PIN_B===other.pinNodes?.PIN_A||candidate.pinNodes?.PIN_B===other.pinNodes?.PIN_B)return false;
  }
  return true;
}
export function isOnBoard(bounds,position,margin=.004){
  if(!bounds||!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))return false;
  return position[0]>=bounds.min[0]+margin&&position[0]<=bounds.max[0]-margin&&position[2]>=bounds.min[2]+margin&&position[2]<=bounds.max[2]-margin&&position[1]>=bounds.max[1]-.004&&position[1]<=bounds.max[1]+.05;
}
