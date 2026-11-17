/** Linear resistive DC engine, independent of renderer. Ideal sources/wires only. */
const finite = (v, name) => { if (!Number.isFinite(v)) throw Error('INVALID_'+name); return v; };
export function solveCircuit({resistors = [], wires = [], sources = [], currentSources = [], transconductances = []}) {
  const parent = new Map();
  function root(id) { if (typeof id !== 'string' || !id.length || id.length > 100) throw Error('INVALID_NODE'); if (!parent.has(id)) parent.set(id,id); if (parent.get(id)!==id) parent.set(id,root(parent.get(id))); return parent.get(id); }
  function union(a,b) { parent.set(root(a),root(b)); }
  for (const item of [...resistors,...sources,...currentSources]) {root(item.a);root(item.b);}
  for (const item of transconductances) {root(item.a);root(item.b);root(item.c);root(item.d);finite(item.siemens,'TRANSCONDUCTANCE');}
  for (const [a,b] of wires) union(a,b);
  for (const r of resistors) if (finite(r.ohms,'RESISTANCE') <= 0) throw Error('INVALID_RESISTANCE');
  sources.forEach(s=>finite(s.volts,'VOLTAGE'));
  const edges = new Map([...new Set([...parent.keys()].map(root))].map(k=>[k,new Set()]));
  for (const e of [...resistors,...sources,...currentSources]) {edges.get(root(e.a)).add(root(e.b));edges.get(root(e.b)).add(root(e.a));}
  // A dependent branch couples its output and control reference. Its control
  // draws no current; these graph edges only choose one numerical reference.
  for (const e of transconductances) for(const n of [e.b,e.c,e.d]){edges.get(root(e.a)).add(root(n));edges.get(root(n)).add(root(e.a));}
  const grounds=new Set(),seen=new Set();
  for (const id of edges.keys()) if(!seen.has(id)) { const group=[],todo=[id]; while(todo.length){const k=todo.pop();if(seen.has(k))continue;seen.add(k);group.push(k);todo.push(...edges.get(k));} grounds.add(root(sources.find(s=>group.includes(root(s.b)))?.b||id)); }
  const nodes=[...edges.keys()].filter(n=>!grounds.has(n)), index=new Map(nodes.map((n,i)=>[n,i]));
  const active=sources.filter(s=>{if(root(s.a)!==root(s.b))return true;if(Math.abs(s.volts)>1e-10)throw Error('SOURCE_SHORT_CIRCUIT');return false;});
  const size=nodes.length+active.length, matrix=Array.from({length:size},()=>Array(size+1).fill(0));
  const add=(a,b,v)=>{if(a!==undefined&&b!==undefined)matrix[a][b]+=v;};
  for (const r of resistors){const a=index.get(root(r.a)),b=index.get(root(r.b)),g=1/r.ohms;add(a,a,g);add(b,b,g);add(a,b,-g);add(b,a,-g);}
  for(const s of transconductances){const a=index.get(root(s.a)),b=index.get(root(s.b)),c=index.get(root(s.c)),d=index.get(root(s.d));add(a,c,s.siemens);add(a,d,-s.siemens);add(b,c,-s.siemens);add(b,d,s.siemens);}
  for(const s of currentSources){finite(s.amps,'CURRENT');const a=index.get(root(s.a)),b=index.get(root(s.b));if(a!==undefined)matrix[a][size]-=s.amps;if(b!==undefined)matrix[b][size]+=s.amps;}
  active.forEach((s,k)=>{const a=index.get(root(s.a)),b=index.get(root(s.b)),i=nodes.length+k;add(a,i,1);add(b,i,-1);add(i,a,1);add(i,b,-1);matrix[i][size]=s.volts;});
  for(let col=0;col<size;col++){
    let pivot=col;for(let row=col+1;row<size;row++)if(Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col]))pivot=row;
    if(Math.abs(matrix[pivot][col])<1e-12)throw Error('SINGULAR_OR_CONFLICTING_SOURCES');
    [matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];const d=matrix[col][col];for(let c=col;c<=size;c++)matrix[col][c]/=d;
    for(let row=0;row<size;row++)if(row!==col){const f=matrix[row][col];for(let c=col;c<=size;c++)matrix[row][c]-=f*matrix[col][c];}
  }
  const potentials=Object.fromEntries([...parent.keys()].map(n=>[n,index.has(root(n))?matrix[index.get(root(n))][size]:0]));
  const currents=Object.fromEntries(active.map((s,k)=>[s.id??String(k),-matrix[nodes.length+k][size]]));
  return {potentials,currents,voltage:(a,b)=>(potentials[a]??0)-(potentials[b]??0)};
}

/** Piecewise-linear semiconductor extension of the SAME MNA engine.
 * Finite off resistance stabilizes disconnected branches; active-set validation
 * verifies each computed junction voltage instead of selecting a canned result.
 */
export function solveSemiconductorCircuit(network,preferred=[]){
 const diodes=network.diodes||[];if(diodes.length>8)throw Error('DIODE_LIMIT');
 const choices=diodes.map(d=>d.defect==='SHORT'?['SHORT']:d.defect==='OPEN'?['OFF']:d.vz?['OFF','FWD','ZENER']:['OFF','FWD']);
 let configurations=[[]];for(const choice of choices)configurations=configurations.flatMap(list=>choice.map(value=>[...list,value]));
 if(preferred.length===diodes.length)configurations.unshift(preferred);
 for(const modes of configurations){
  const resistors=[...(network.resistors||[])],currentSources=[...(network.currentSources||[])];
  diodes.forEach((d,i)=>{const mode=modes[i],ohms=mode==='OFF'?1e10:mode==='SHORT'?.1:(mode==='ZENER'?d.rz:d.ron)||2;resistors.push({a:d.a,b:d.b,ohms});
   const offset=mode==='FWD'?(d.vf??.65):mode==='ZENER'?-d.vz:0;if(offset)currentSources.push({a:d.b,b:d.a,amps:offset/ohms});});
  let solution;try{solution=solveCircuit({...network,resistors,currentSources});}catch(error){if(error.message==='SINGULAR_OR_CONFLICTING_SOURCES')continue;throw error;}
  const consistent=diodes.every((d,i)=>{if(d.defect==='OPEN'||d.defect==='SHORT')return true;const voltage=solution.voltage(d.a,d.b),mode=modes[i];return mode==='FWD'?voltage>=(d.vf??.65)-1e-7:mode==='ZENER'?voltage<=-d.vz+1e-7:voltage<=(d.vf??.65)+1e-7&&(!d.vz||voltage>=-d.vz-1e-7);});
  if(consistent)return {...solution,diodeModes:modes,diodeCurrents:diodes.map((d,i)=>{const voltage=solution.voltage(d.a,d.b);return modes[i]==='SHORT'?voltage/.1:modes[i]==='FWD'?(voltage-(d.vf??.65))/(d.ron||2):modes[i]==='ZENER'?(voltage+d.vz)/(d.rz||2):voltage/1e10;})};
 }
 throw Error('SEMICONDUCTOR_NO_CONVERGENCE');
}
/** Passive PWL network: monotone PSU load line, bisected under current limit. */
export function solveLimitedSemiconductorCircuit(network,limit){
 finite(limit,'CURRENT_LIMIT');if(limit<=0)throw Error('INVALID_CURRENT_LIMIT');
 const supply=network.sources.find(s=>s.id==='PSU');if(!supply)throw Error('PSU_REQUIRED');
 const initial=solveSemiconductorCircuit(network);if(initial.currents.PSU<=limit+1e-10)return {...initial,mode:'CV',outputVoltage:supply.volts};
 let low=0,high=supply.volts,result=initial;
 for(let i=0;i<36;i++){const volts=(low+high)/2;result=solveSemiconductorCircuit({...network,sources:network.sources.map(s=>s.id==='PSU'?{...s,volts}:s)});if(result.currents.PSU>limit)high=volts;else low=volts;}
 return {...result,mode:'CC',outputVoltage:(low+high)/2};
}

export function waveform({shape='SINE',frequency=1000,amplitude=1,offset=0},time){
  if(!['SINE','SQUARE','RAMP','PULSE'].includes(shape))throw Error('INVALID_WAVEFORM');
  if(finite(frequency,'FREQUENCY')<=0||finite(amplitude,'AMPLITUDE')<0)throw Error('INVALID_SIGNAL');
  finite(offset,'OFFSET');finite(time,'TIME');const phase=((time*frequency)%1+1)%1;
  const unit=shape==='SINE'?Math.sin(phase*2*Math.PI):shape==='SQUARE'?(phase<.5?1:-1):shape==='RAMP'?2*phase-1:(phase<.2?1:-1);
  return offset+amplitude*unit;
}

/** Current limit for a single PSU and passive resistors, recomputed by MNA. */
export function solveLimitedCircuit(circuit,limit){
  finite(limit,'CURRENT_LIMIT');if(limit<=0)throw Error('INVALID_CURRENT_LIMIT');
  let result;
  try{result=solveCircuit(circuit);}catch(error){if(error.message==='SOURCE_SHORT_CIRCUIT'&&circuit.sources.length===1&&circuit.sources[0].id==='PSU')return {potentials:{},currents:{PSU:limit},voltage:()=>0,mode:'CC_SHORT',outputVoltage:0};throw error;}
  const supply=circuit.sources.find(s=>s.id==='PSU'),draw=result.currents.PSU??0;
  if(!supply)return {...result,mode:'OFF',outputVoltage:0};
  if(draw < -1e-8)throw Error('PSU_REVERSE_CURRENT');
  if(draw>limit+1e-10){
    if(circuit.sources.length>1)throw Error('CC_WITH_MULTIPLE_SOURCES_UNSUPPORTED');
    const volts=supply.volts*limit/draw;const limited=solveCircuit({...circuit,sources:circuit.sources.map(s=>({...s,volts}))});
    return {...limited,mode:'CC',outputVoltage:volts};
  }
  return {...result,mode:'CV',outputVoltage:supply.volts};
}
