// Additional task view derived from the existing breadboard bounds.
// The Blender model and exported camera presets remain unchanged.
export function breadboardCloseView(bounds,aspect=16/9){
 const width=bounds.max[0]-bounds.min[0],depth=bounds.max[2]-bounds.min[2];
 const target=[(bounds.min[0]+bounds.max[0])/2,bounds.max[1]+.012,(bounds.min[2]+bounds.max[2])/2];
 const fov=38,tan=Math.tan(fov*Math.PI/360),ratio=Math.max(.35,Number.isFinite(aspect)?aspect:16/9);
 const distance=Math.max(.20,width*1.18/(2*tan*ratio),depth*1.8/(2*tan));
 return {position:[target[0],target[1]+distance*.88,target[2]+distance*.475],target,fov,near:.003,far:30,kind:'TASK_DETAIL',sourceCamera:'CAM_Breadboard_Closeup'};
}
