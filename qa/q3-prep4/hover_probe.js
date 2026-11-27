// QA-only observer. Does not call renderOnce, dispatch input, or change game state.
return (async () => {
  window.__Q3_HOVER_PROBE?.stop();
  const {dropHitShape,pickDropAt,pointCovered}=await import('/ui.js');
  const events=[],frames=[],geometry=[],errors=[],listeners=[];
  const dropped={events:0,frames:0,geometry:0,errors:0}; let eventSequence=0;
  const names=new Map([[events,"events"],[frames,"frames"],[geometry,"geometry"],[errors,"errors"]]);
  let target=null,started=0,raf=null,stopped=false,last=0,lastGeometry=0,totalFrames=0,maxGap=0;
  const bounded=(list,item,cap)=>{if(list.length===cap){list.shift();dropped[names.get(list)]++;}list.push(item);};
  const rect=el=>{const r=el.getBoundingClientRect();return {id:el.id,left:r.left,top:r.top,width:r.width,height:r.height,noticeShown:el.classList.contains('show')};};
  function state(){
    const q=window.__PLUSH_QA__,g=q?.game,h=q?.input?.hover;
    return {t:performance.now(),status:g?.status,gameTime:g?.time,hover:h?{id:h.id,point:h.point?{...h.point}:null,moved:h.moved}:null,pending:g?.pendingPickup?{id:g.pendingPickup.id,weapon:g.pendingPickup.weaponId,slot:g.pendingPickup.slot}:null,overlay:document.querySelector('#overlay')?.classList.contains('shown'),visibility:document.visibilityState,focus:document.hasFocus()};
  }
  function shape(){
    const q=window.__PLUSH_QA__,g=q.game,V=q.camera.position.constructor,c=document.querySelector('#world'),r=c.getBoundingClientRect(),view={left:r.left,top:r.top,width:r.width,height:r.height};
    const project=(x,y,z)=>{const p=new V(x,y,z).project(q.camera);return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.z>=-1&&p.z<=1?{x:view.left+(p.x+1)*view.width/2,y:view.top+(1-p.y)*view.height/2,z:p.z}:null;};
    const axes={right:new V().setFromMatrixColumn(q.camera.matrixWorld,0).normalize(),up:new V().setFromMatrixColumn(q.camera.matrixWorld,1).normalize()};
    const drop=g.drops.find(d=>d.id===target.id),seen=q.weaponVisuals.drawnDrops().get(target.id),point=q.input.hover.point||{x:Math.trunc(target.x),y:Math.trunc(target.y)};
    const hitShape=drop&&seen?dropHitShape(drop,project,axes,view,seen):null;
    const frame=window.frameElement,fr=frame?.getBoundingClientRect(),topX=fr?fr.left+point.x:point.x,topY=fr?fr.top+point.y:point.y;
    return {parentHit:frame?{x:topX,y:topY,frameRect:{left:fr.left,top:fr.top,width:fr.width,height:fr.height},element:parent.document.elementFromPoint(topX,topY)?.id||null}:null,t:performance.now(),point:{x:point.x,y:point.y},target:{...target},viewport:view,drop:drop?{id:drop.id,weapon:drop.weaponId,x:drop.x,z:drop.z,life:drop.life}:null,drawn:seen?{...seen}:null,parts:hitShape?.parts||[],hitId:pickDropAt(point,[hitShape].filter(Boolean),{margin:0})?.id??null,covered:pointCovered(point,q.hud.occluders),hud:q.hud.occluders.map(rect),element:document.elementFromPoint(point.x,point.y)?.id||null,player:{x:g.player.x,z:g.player.z},pickupRange:g.pickupRange,autoEquip:g.autoEquip,loadout:{...g.loadout}};
  }
  const safeGeometry=()=>{try{bounded(geometry,shape(),128);}catch(e){bounded(errors,String(e),16);}};
  function frame(t){
    if(stopped)return;
    totalFrames++;if(last)maxGap=Math.max(maxGap,t-last);
    bounded(frames,{...state(),rafTime:t,gap:last?t-last:null},720);last=t;
    if(target&&t-lastGeometry>=100){safeGeometry();lastGeometry=t;}
    if(target&&t-started>=12000){stop();return;}
    raf=requestAnimationFrame(frame);
  }
  for(const type of ['pointermove','pointerout','pointerdown','pointerup','blur','focus','visibilitychange']){
    const fn=e=>{bounded(events,{sequence:++eventSequence,type,t:performance.now(),trusted:e.isTrusted,x:e.clientX??null,y:e.clientY??null,buttons:e.buttons??null,pointer:e.pointerType??null,target:e.target?.id||e.target?.tagName||null,related:e.relatedTarget?.id||null,...state()},256);};
    window.addEventListener(type,fn,true);listeners.push([type,fn]);
  }
  function stop(){stopped=true;if(raf!==null)cancelAnimationFrame(raf);for(const [n,f] of listeners)window.removeEventListener(n,f,true);}
  window.__Q3_HOVER_PROBE={
    target(value){target={...value,eventSequenceBefore:eventSequence,lastPointer:events.filter(e=>e.type==='pointermove').at(-1)||null};started=performance.now();safeGeometry();raf=requestAnimationFrame(frame);},
    read(){if(target)safeGeometry();const result={timeOrigin:performance.timeOrigin,dropped:{...dropped},lastEventSequence:eventSequence,instrumented:true,notRootCauseProof:true,target,events:[...events],frames:[...frames],geometry:[...geometry],errors:[...errors],totalFrames,maxGap,stopped};stop();return result;},
    stop
  };
  return {installed:true,frameCap:720,eventCap:256,geometryCap:128,activeMs:12000};
})();
