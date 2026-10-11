// Each map owns its time-of-day profile; characters and scenery share it.
export function applyMapLighting(profile,{scene,renderer,hemi,sun,rim,fill}){
 if(!profile)return;
 scene.background.set(profile.background);scene.fog.color.set(profile.fogColor||profile.background);
 scene.fog.near=profile.fogNear;scene.fog.far=profile.fogFar;renderer.toneMappingExposure=profile.exposure;
 hemi.color.set(profile.hemi.sky);hemi.groundColor.set(profile.hemi.ground);hemi.intensity=profile.hemi.intensity;
 sun.color.set(profile.sun.color);sun.intensity=profile.sun.intensity;
 rim.color.set(profile.rim.color);rim.intensity=profile.rim.intensity;
 if(fill){fill.color.set(profile.fill?.color||'#c7daf1');fill.intensity=profile.fill?.intensity||0;fill.visible=fill.intensity>0;}
}

export const CAMERA_FILL=Object.freeze({distance:14,height:2.8});
export function positionCameraFill(fill,target,camera){
 const dx=camera.position.x-target.x,dz=camera.position.z-target.z,len=Math.hypot(dx,dz)||1;
 fill.position.set(target.x+dx/len*CAMERA_FILL.distance,target.y+CAMERA_FILL.height,target.z+dz/len*CAMERA_FILL.distance);
 fill.target.position.copy(target);
}
