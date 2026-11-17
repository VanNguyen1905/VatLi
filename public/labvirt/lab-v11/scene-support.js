import * as THREE from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';

export function displaySurface(scene,data,width=1024,height=620){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(data.screenWidth*.94,data.screenHeight*.9),new THREE.MeshBasicMaterial({map:texture,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}));
 mesh.name='TECHNICAL_DISPLAY_'+data.name;
 mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...['right','up','forward'].map(k=>new THREE.Vector3(...data.basis[k]))));
 mesh.position.copy(new THREE.Vector3(...data.surfacePosition)).addScaledVector(new THREE.Vector3(...data.basis.forward),.0006);scene.add(mesh);
 return {canvas,context:canvas.getContext('2d'),texture,mesh,dispose(){mesh.geometry.dispose();mesh.material.dispose();texture.dispose();scene.remove(mesh);}};
}

export function configureLighting(scene,model,renderer,lighting){
 RectAreaLightUniformsLib.init();
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=2**-.8;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 model.traverse(o=>{
  if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])if(m[k])m[k].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}}
  if(o.isLight){o.intensity/=683;o.castShadow=true;if(o.shadow){o.shadow.mapSize.set(1024,1024);o.shadow.bias=-.0001;o.shadow.normalBias=.002;o.shadow.camera.near=.02;o.shadow.camera.far=15;}}
 });
 // glTF has no AREA-light extension. These are lights only; no source mesh changes.
 const area=[];
 for(const record of lighting.lights){if(record.light.type!=='AREA')continue;const d=record.light;
  const light=new THREE.RectAreaLight(new THREE.Color(...d.color),d.energy/(Math.PI*d.size*(d.sizeY||d.size))*.2,d.size,d.sizeY||d.size);
  light.name='SOURCE_AREA_'+record.name;light.position.set(...record.position);light.lookAt(light.position.clone().add(new THREE.Vector3(...d.direction)));scene.add(light);area.push(light);
 }
 // Neutral sky radiance for missing Cycles indirect bounce, kept separate from geometry.
 const pixels=new Uint8Array(64*32*4);for(let y=0;y<32;y++)for(let x=0;x<64;x++){const v=Math.round(170-70*y/31),i=(y*64+x)*4;pixels.set([v,v+3,Math.min(255,v+9),255],i);}
 const dome=new THREE.DataTexture(pixels,64,32);dome.colorSpace=THREE.SRGBColorSpace;dome.mapping=THREE.EquirectangularReflectionMapping;dome.needsUpdate=true;
 const generator=new THREE.PMREMGenerator(renderer),env=generator.fromEquirectangular(dome);scene.environment=env.texture;scene.environmentIntensity=1.6;dome.dispose();generator.dispose();
 return {policy:'AgX exposure -0.8; source SPOT radiometric /683; six source AREA rectangles ×0.2; neutral indirect environment 1.6. AREA shadows unsupported in WebGL.',areaCount:area.length,dispose(){env.dispose();}};
}

/** Validate all declared bindings before enabling instruments. */
export function validateBindings(objects,manifest){
 const required=new Set([manifest.dmm.body,manifest.dmm.screen.name,manifest.dmm.knob.name,manifest.boardTopology.sourceNode]);
 for(const d of Object.values(manifest.devices)){required.add(d.body);required.add(d.screen);for(const c of [...d.controls,...Object.values(d.ports)])required.add(c.node);}
 const missing=[...required].filter(n=>!objects.has(n));if(missing.length)throw Error('Thiếu node thiết bị: '+missing.join(', '));return {checked:required.size,missing};
}
