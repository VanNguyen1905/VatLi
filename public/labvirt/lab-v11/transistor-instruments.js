/** B2/B3 instance adapter. The SHA-locked instrument and B1 adapters stay intact. */
export function installTransistorInstrumentAdapter(lab){
 const original=Object.fromEntries(['action','addWire','position','network','refresh','isPowered','drawScreens','endpointIds'].map(name=>[name,lab[name].bind(lab)]));
 lab.refreshEndpoints=()=>{for(const id of ['wireFrom','wireTo']){const select=document.getElementById(id),value=select.value;select.replaceChildren();for(const name of lab.endpointIds()){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}if(lab.endpointIds().includes(value))select.value=value;}};
 lab.setExtension=extension=>{lab.extension=extension;lab.refreshEndpoints();lab.refresh();};
 lab.endpointIds=()=>lab.extension?[...lab.portPositions.keys(),...lab.extension.componentIds().flatMap(id=>lab.extension.partPinIds(id).map(pin=>id+':'+pin)),...lab.holes.keys()]:original.endpointIds();
 lab.position=id=>{const [key,pin]=id.split(':');return lab.extension&&/^PIN_[A-D]$/.test(pin||'')?lab.extension.physicalPin(pin,key):original.position(id);};
 for(const name of ['network','refresh','isPowered','drawScreens'])lab[name]=(...args)=>lab.extension?lab.extension[name](...args):original[name](...args);
 lab.addWire=(a,b)=>{if(lab.extension?.beforeWire(a,b)===false)return;return original.addWire(a,b);};
 for(const id of ['wireList','removeWires']){const element=document.getElementById(id),handler=element.onclick;element.onclick=event=>{const button=event.target.closest('[data-remove-wire]'),pairs=id==='removeWires'?lab.wires:button?[lab.wires[Number(button.dataset.removeWire)]]:[];if(pairs.some(pair=>lab.extension?.beforeRemoveWire(pair)===false))return;handler.call(element,event);};}
 lab.action=name=>{if(lab.extension?.beforeAction(name)===false)return;return original.action(name);};
}
