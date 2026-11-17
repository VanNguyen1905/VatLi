/**
 * Kết nối điện có thể kiểm tra độc lập khỏi WebGL.
 * Liên kết PIN_A/B với lỗ breadboard mà chân thực sự nằm gần (theo manifest Blender).
 * Không tạo dây trong scene và không tự cắm DMM thay người học.
 */
const componentIds=new Set(['R1','R2','R3','C1','C2','L']);

export function mountedContactWires(mounts, boardHoles) {
  const holes=new Map(boardHoles.map(h=>[h.id,h.node]));
  const wires=[];
  for(const [key,slot] of Object.entries(mounts||{})) {
    if(!componentIds.has(key)||!slot?.holeIds||!slot?.pinNodes)continue;
    for(const pin of ['PIN_A','PIN_B']) {
      const hole=slot.holeIds[pin],node=slot.pinNodes[pin];
      if(typeof hole!=='string'||typeof node!=='string'||holes.get(hole)!==node)continue;
      wires.push([key+':'+pin,'BB:'+node]);
    }
  }
  return wires;
}

export function contactsLiveSource(network, component) {
  if(!componentIds.has(component)||!Array.isArray(network?.sources)||!network.sources.length)return false;
  const adjacency=new Map();
  const join=(a,b)=>{
    if(typeof a!=='string'||typeof b!=='string')return;
    if(!adjacency.has(a))adjacency.set(a,new Set());
    if(!adjacency.has(b))adjacency.set(b,new Set());
    adjacency.get(a).add(b);adjacency.get(b).add(a);
  };
  for(const pair of network.wires||[])if(Array.isArray(pair)&&pair.length===2)join(pair[0],pair[1]);
  for(const r of network.resistors||[])join(r.a,r.b);
  for(const source of network.sources)join(source.a,source.b);
  const visited=new Set(),todo=[component+':PIN_A',component+':PIN_B'];
  for(let index=0;index<todo.length;index++){
    const current=todo[index];if(visited.has(current))continue;
    visited.add(current);
    for(const neighbor of adjacency.get(current)||[])if(!visited.has(neighbor))todo.push(neighbor);
  }
  return network.sources.some(source=>visited.has(source.a)||visited.has(source.b));
}
