import * as THREE from './vendor/three.module.js';
// V6 rotates the view to 60 degrees azimuth and 40 degrees elevation.
// V3 framing spans and camera distance remain unchanged.
// Orthographic comparison is available with ?camera=ortho.
export const CAMERA=Object.freeze({azimuth:60*Math.PI/180,elevation:40*Math.PI/180,distance:29,landscapeSpan:25.6,portraitSpan:28});
export function screenToWorldInput({x=0,z=0},azimuth=CAMERA.azimuth,elevation=CAMERA.elevation){
 const c=Math.cos(azimuth),s=Math.sin(azimuth),strength=Math.hypot(x,z);
 if(strength===0)return {x:0,z:0};
 const depth=z/Math.sin(elevation),length=Math.hypot(x,depth),scale=strength/length;
 return {x:(c*x+s*depth)*scale,z:(-s*x+c*depth)*scale};
}
const viewProjection=new THREE.Matrix4();
export function screenToWorldAt({x=0,z=0},camera,point,width,height){
 const strength=Math.hypot(x,z);if(strength===0)return {x:0,z:0};
 camera.updateMatrixWorld();viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 const m=viewProjection.elements,px=point.x,py=point.y||0,pz=point.z;
 const cx=m[0]*px+m[4]*py+m[8]*pz+m[12],cy=m[1]*px+m[5]*py+m[9]*pz+m[13],cw=m[3]*px+m[7]*py+m[11]*pz+m[15];
 // Invert the exact ground-plane projection Jacobian at the player. This
 // handles off-centre perspective as well as orthographic views, in pixels.
 const a=(m[0]*cw-cx*m[3])*width/(2*cw*cw),b=(m[8]*cw-cx*m[11])*width/(2*cw*cw);
 const c=-(m[1]*cw-cy*m[3])*height/(2*cw*cw),d=-(m[9]*cw-cy*m[11])*height/(2*cw*cw),det=a*d-b*c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)return {x:0,z:0};
 const wx=(d*x-b*z)/det,wz=(a*z-c*x)/det,scale=strength/Math.hypot(wx,wz);
 return {x:wx*scale,z:wz*scale};
}
export function cameraOffset(){const radius=CAMERA.distance*Math.cos(CAMERA.elevation);return{x:Math.sin(CAMERA.azimuth)*radius,y:Math.sin(CAMERA.elevation)*CAMERA.distance,z:Math.cos(CAMERA.azimuth)*radius};}
export function cameraFocus(point,width,height){
 // A narrow portrait frame follows fully, retaining the opening 0.48m look-ahead
 // without accumulating horizontal edge drift as the player crosses the arena.
 return height>width?{x:point.x,y:.2,z:point.z-.48}:{x:point.x*.88,y:.2,z:point.z*.88};
}
export function cameraSpan(width,height){return height>width?CAMERA.portraitSpan:CAMERA.landscapeSpan;}
export function fitGameCamera(camera,width,height){
 const span=cameraSpan(width,height),aspect=width/height;
 if(camera.isPerspectiveCamera){camera.aspect=aspect;camera.fov=2*Math.atan(span/(2*CAMERA.distance))*180/Math.PI;}
 else{camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;}
 camera.updateProjectionMatrix();return camera;
}
export function createGameCamera(width,height,{orthographic=false}={}){
 return fitGameCamera(orthographic?new THREE.OrthographicCamera(-1,1,1,-1,.1,120):new THREE.PerspectiveCamera(25,width/height,.1,120),width,height);
}
