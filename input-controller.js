import {isInteractiveTarget,routeKeyDown} from './keyboard.js';
import {eventTime,pointCovered} from './ui.js';
import {screenToWorldAt} from './camera.js';

export function createInput({document,window,canvas,overlay,dialog,stick,keys,taps,pendingTaps,touchFx,hover,pickupState,clearHover,getGame,tapClock,reduceMotion,hudOccluders,pause,resume,syncOverlay,resize,setStatsVisible,prefs,hudView,setRenderDirty,getCamera,getSize,getStyle}){
 const $=selector=>document.querySelector(selector);
function updateStick(){const el=$('#stick');el.style.display=stick.id===null?'none':'block';el.style.left=stick.origin.x+'px';el.style.top=stick.origin.y+'px';$('#knob').style.transform=`translate(${stick.x*34}px,${stick.z*34}px)`;}
// A gesture can start on any non-interactive part of the game, including HUD
// readouts. Native buttons/inputs keep their own pointer and click behaviour.
document.addEventListener('pointerdown',e=>{const game=getGame();
 clearHover();
 if(game.status!=='running'||overlay.classList.contains('shown')||e.defaultPrevented||e.button!==0||!$('#game').contains(e.target)||isInteractiveTarget(e.target))return;
 if(stick.begin(e.pointerId,e.clientX,e.clientY)){
  // A browser may revoke a pointer before capture (for example on app switch).
  // Never retain movement ownership when capture could not be established.
  try{canvas.setPointerCapture(e.pointerId);}catch{stick.reset();updateStick();return;}
  e.preventDefault();updateStick();$('#moveHint').style.opacity='.15';
 }
 // Every accepted press may become a tap on a drop, including a second finger
 // while the first one holds the stick. It never takes over movement.
 taps.begin(e.pointerId,e.clientX,e.clientY,eventTime(e,tapClock),e.pointerType);
 touchFx.begin(e.pointerId,e.clientX,e.clientY,e.pointerType,{reduceMotion:reduceMotion()});
 // Tracked presses (never buttons or dialogs, which returned above) keep the browser
 // from adding its own handling to the extra finger.
 e.preventDefault();
},{passive:false});
// Safari ignores touch-action for pinch; stop its gesture only while the game is running
// so dialogs and the rest of the page keep their zoom.
document.addEventListener('pointerout',e=>{if(e.pointerType==='mouse'&&!e.relatedTarget)clearHover();});
document.addEventListener('gesturestart',e=>{const game=getGame();if(game.status==='running'&&!overlay.classList.contains('shown')&&$('#game').contains(e.target))e.preventDefault();},{passive:false});
document.addEventListener('pointermove',e=>{const game=getGame();
 taps.move(e.pointerId,e.clientX,e.clientY);touchFx.move(e.pointerId,e.clientX,e.clientY);
 // Only a mouse with no button down hovers; a drag, a finger or a pen never does.
 if(e.pointerType==='mouse'){
  if(e.buttons!==0||isInteractiveTarget(e.target)||!$('#game').contains(e.target))clearHover();
  else{if(!pickupState.hoverPoint||pickupState.hoverPoint.x!==e.clientX||pickupState.hoverPoint.y!==e.clientY)pickupState.hoverMoved=true;pickupState.hoverPoint={x:e.clientX,y:e.clientY,type:'mouse'};}
 }
 if(e.pointerId!==stick.id)return;
 if(game.status!=='running'){clearInput();return;}
 // A mouse button released outside the page ends only this drag; other fingers
 // and taps already waiting for the next frame are kept.
 if(e.pointerType==='mouse'&&(e.buttons&1)===0){taps.cancel(e.pointerId);endStick();return;}
 if(stick.move(e.pointerId,e.clientX,e.clientY)){e.preventDefault();updateStick();}
},{passive:false});
for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>{const game=getGame();
 // Ignore loss of the original target's implicit capture when it transfers
 // to the canvas; only losing our canvas capture cancels the drag.
 if(type==='lostpointercapture'&&e.target!==canvas)return;
 touchFx.end(e.pointerId);
 // A tap on an opaque HUD panel is a tap on the panel, not on the world below it.
 if(type==='pointerup'){const tap=taps.end(e.pointerId,e.clientX,e.clientY,eventTime(e,tapClock));if(tap&&game.status==='running'&&!overlay.classList.contains('shown')&&pendingTaps.length<4&&!pointCovered(tap,hudOccluders))pendingTaps.push(tap);}
 // A pointer whose capture was lost can no longer be trusted: its pointerup may arrive
 // without the matching moves, so it must not turn into a tap.
 else taps.cancel(e.pointerId);
 if(!stick.end(e.pointerId))return;
 if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 updateStick();
});
function endStick(){const id=stick.id;stick.reset();if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);updateStick();}
function clearInput(){touchFx.clear();clearHover();taps.clear();pendingTaps.length=0;endStick();keys.clear();}
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('resize',()=>{clearInput();resize();});
window.addEventListener('keydown',e=>{const game=getGame();const action=routeKeyDown(e,game.status,keys);if(action==='pause')pause();else if(action==='resume'){resume();}else if(action==='stats'){setStatsVisible(!prefs.stats);}else if(action?.startsWith('upgrade:')){dialog.querySelectorAll('[data-upgrade]')[Number(action.slice(8))-1]?.onclick?.();}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
// Keep keyboard navigation inside the active menu without changing native
// checkbox, slider, select, Space, or Escape behavior.
document.addEventListener('keydown',e=>{const game=getGame();
 if(e.key!=='Tab'||game.status==='running')return;
 const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled):not([tabindex="-1"]),[tabindex="0"]')];
 if(!controls.length)return;
 const first=controls[0],last=controls[controls.length-1];
 if(!dialog.contains(document.activeElement)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();first.focus();}
 else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
});
document.addEventListener('focusin',e=>{if(isInteractiveTarget(e.target))keys.clear();});
// V12.3.4: the start/resume button (or the pause button row) sticks to the dialog's visible
// bottom. A control focused underneath it is scrolled clear; browsers skip scroll-padding for
// a control that is already inside the scrollport.
dialog.addEventListener('focusin',e=>{
 const bar=[...dialog.querySelectorAll('.pause-actions,#start,#resume')].find(el=>getStyle(el).position==='sticky');
 if(!bar||bar.contains(e.target))return;
 const r=e.target.getBoundingClientRect(),b=bar.getBoundingClientRect(),over=r.bottom-(b.top-14);
 if(over>0&&r.top<b.bottom)dialog.scrollTop+=over;
});$('#pause').onclick=pause;
$('#stowTwoHanded').onclick=()=>{const game=getGame();if(game.status!=='running'||!game.twoHandedWeapon)return;keys.clear();game.toggleTwoHanded();setRenderDirty();hudView.sync(game);canvas.focus({preventScroll:true});};
function input(){const game=getGame();return screenToWorldAt({x:stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z:stick.z+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)},getCamera(),game.player,getSize().width,getSize().height);}
return {clearInput,input};
}
