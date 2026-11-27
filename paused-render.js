// Only gate WebGL submissions; game timing, RAF and DOM updates stay in main.
export function createPausedRenderGate(){
 let invalid=true,lastStatus=null,lastKey=null;
 return {
  invalidate(){invalid=true;},
  shouldRender({status,dirty=false,key=''}){
   const draw=status!=='paused'||invalid||dirty||status!==lastStatus||key!==lastKey;
   lastStatus=status;lastKey=key;
   if(draw)invalid=false;
   return draw;
  }
 };
}

export function bindPausedRenderInvalidation({gate,win,doc,canvas,overlay,dialog}){
 const invalidate=()=>gate.invalidate(),removers=[];
 const listen=(target,type)=>{
  target?.addEventListener?.(type,invalidate,true);
  removers.push(()=>target?.removeEventListener?.(type,invalidate,true));
 };
 // DOM/CSS animations continue independently. Input/focus can change previews.
 for(const type of ['resize','focus','blur','pageshow'])listen(win,type);
 for(const type of ['visibilitychange','fullscreenchange','input','change','click','keydown','focusin'])listen(doc,type);
 for(const type of ['webglcontextlost','webglcontextrestored'])listen(canvas,type);
 const query=win?.matchMedia?.('(prefers-reduced-motion: reduce)');
 query?.addEventListener?.('change',invalidate);
 const Observer=win?.MutationObserver;
 const observer=Observer?new Observer(records=>{
  if(records.some(r=>r.type!=='attributes'||r.oldValue!==r.target.getAttribute(r.attributeName)))invalidate();
 }):null;
 for(const target of [overlay,dialog])if(target)observer?.observe(target,{subtree:true,childList:true,attributes:true,attributeOldValue:true,characterData:true});
 return ()=>{for(const remove of removers)remove();observer?.disconnect();query?.removeEventListener?.('change',invalidate);};
}
