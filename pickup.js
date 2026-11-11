import * as THREE from './vendor/three.module.js';
import {dropHitShape,pickDropAt,pointCovered} from './ui.js';

export function createPickup({document,canvas,camera,getGame,getSize,weaponVisuals,hudOccluders,pendingTaps,hover,pickupState,overlay,setRenderDirty,getDropShapes}){
 const $=selector=>document.querySelector(selector);
const tapPoint=new THREE.Vector3(),tapAxes={right:new THREE.Vector3(),up:new THREE.Vector3()};
// The canvas box in CSS pixels; pointer coordinates use the same space.
function viewRect(){const r=canvas.getBoundingClientRect?.();return r&&r.width>0&&r.height>0?{left:r.left,top:r.top,width:r.width,height:r.height}:{left:0,top:0,width:getSize().width,height:getSize().height};}
function projectToScreen(x,y,z,view=viewRect()){
 tapPoint.set(x,y,z).project(camera);
 if(!Number.isFinite(tapPoint.x)||!Number.isFinite(tapPoint.y)||tapPoint.z>1||tapPoint.z<-1)return null;
 return {x:view.left+(tapPoint.x+1)/2*view.width,y:view.top+(1-tapPoint.y)/2*view.height,z:tapPoint.z};
}
// Resolve queued taps against what the player saw: the camera pose of the last
// render and the drops drawn at the last sync (inside the render pool, label
// shown or not). Any drop on screen can be tapped; there is no distance limit.
// The drawn drops as hit shapes, from the camera pose of the last render. With
// hiddenId, also the shape of that drop when it is still in the game but not drawn
// (the dark beat of its expiry blink), using hiddenLabel, how its label was last drawn
// (so a hover on the label is held too, at the size and place it was seen).
function dropShapes(hiddenId=null,hiddenLabel=null){
 const game=getGame();
 camera.updateMatrixWorld();
 tapAxes.right.setFromMatrixColumn(camera.matrixWorld,0).normalize();tapAxes.up.setFromMatrixColumn(camera.matrixWorld,1).normalize();
 const view=viewRect(),drawn=weaponVisuals.drawnDrops?.()??new Map(),project=(x,y,z)=>projectToScreen(x,y,z,view),shapes=[];let hidden=null;
 for(const drop of game.drops){
  const seen=drawn.get(drop.id);
  if(seen&&drop.life>0)shapes.push(dropHitShape(drop,project,tapAxes,view,seen));
  else if(!seen&&drop.id===hiddenId&&drop.life>0)hidden=dropHitShape(drop,project,tapAxes,view,hiddenLabel??{labelVisible:false});
 }
 return {shapes,hidden};
}
function resolveTaps(){
 const game=getGame();
 if(!pendingTaps.length)return;
 while(pendingTaps.length){
  const tap=pendingTaps.shift();if(game.status!=='running')continue;
  const drop=pickDropAt(tap,getDropShapes().shapes);
  if(drop&&game.tapPickup(drop.id))setRenderDirty();
 }
}
// V12.2.1: a resting mouse takes the drop under it after 0.5 s (see createHoverTracker).
// Exact hits only (no tap margin); HUD panels cover the world; any state other than a
// plain running game, or an open dialog, restarts the hover.
function resolveHover(realDt){
 const game=getGame();
 // Every early return also drops the pending move, so a HUD panel or dialog that goes away never lets an old move start a hover.
 if(!pickupState.hoverPoint||game.status!=='running'||overlay.classList.contains('shown')||pointCovered(pickupState.hoverPoint,hudOccluders)){hover.reset();pickupState.hoverMoved=false;pickupState.hoverLabel=null;showHoverRing(null);return;}
 // Nothing tracked and no mouse move since the last frame: a hover can only start from a move, so skip the projections.
 if(hover.id===null&&!pickupState.hoverMoved){showHoverRing(null);return;}
 const {shapes,hidden}=getDropShapes(hover.id,pickupState.hoverLabel),hit=pickDropAt(pickupState.hoverPoint,shapes,{margin:0}),held=!hit&&hidden&&pickDropAt(pickupState.hoverPoint,[hidden],{margin:0}),
  state=hover.update({hitId:hit?hit.id:null,hiddenId:held?held.id:null,dtMs:realDt*1000,moved:pickupState.hoverMoved});
 // Remember how the hovered drop's label was drawn, for its next dark beat (kept while held).
 if(hit)pickupState.hoverLabel=weaponVisuals.drawnDrops?.().get(hit.id)??null;else if(!held)pickupState.hoverLabel=null;
 pickupState.hoverMoved=false;
 if(state.fire!==null){
  // After a hover pickup the mouse has to move again before another one can start.
  pickupState.hoverPoint=null;showHoverRing(null);
  if(game.tapPickup(state.fire))setRenderDirty();
  return;
 }
 // The ring appears as soon as the hover is running, before any progress, so slow frames still show feedback.
 showHoverRing(state.armed?{x:pickupState.hoverPoint.x,y:pickupState.hoverPoint.y,progress:state.progress}:null);
}
const hoverRing=$('#hoverRing');
function showHoverRing(info){
 if(!hoverRing)return;
 if(!info){if(!hoverRing.hidden)hoverRing.hidden=true;return;}
 hoverRing.hidden=false;hoverRing.style.left=info.x+'px';hoverRing.style.top=info.y+'px';hoverRing.style.setProperty('--hover',String(Math.round(info.progress*360)));
}
function clearHover(){hover.reset();pickupState.hoverPoint=null;pickupState.hoverMoved=false;pickupState.hoverLabel=null;showHoverRing(null);}
return {clearHover,resolveTaps,resolveHover,dropShapes,projectToScreen,viewRect,tapAxes};
}
