/** Snap only inside a real hole and to its connected electrical node. */
export function resolveBoardContact({point,holes,same,positive,negative,maxDistance=.002}){
 if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))return null;
 let nearest=null,distance=Infinity;for(const hole of holes){const d=Math.hypot(point[0]-hole.position[0],point[2]-hole.position[2]);if(d<distance){distance=d;nearest=hole;}}
 if(!nearest||distance>maxDistance||Math.abs(point[1]-nearest.position[1])>.022)return null;
 const node='BB:'+nearest.node,a=same(node,positive),b=same(node,negative);return a===b?null:a?'PIN_A':'PIN_B';
}
