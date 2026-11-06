// V12.4 touch feedback, modelled on MultiTouchKit's mtk-viewer: every finger or pen
// on the game shows a filled dot with its finger number, and each press sends out
// one expanding ring (0.35 s, fading). Hue follows the finger number (n*37 deg),
// as in mtk-viewer. Scaled down for a game: 56 px dot instead of 90 px, softer fill.
// Pure DOM with pointer-events:none, so hit testing, HUD cover and tap-to-pick
// never see it. Mouse pointers are ignored. Reduced motion keeps the dot only.
export const TOUCH_FX=Object.freeze({dot:56,ringFrom:26,ringTo:78,ringMs:350,maxDots:10,maxRings:12});
export function touchHue(slot){return (slot*37)%360;}
export function isTouchPointer(type){return type==='touch'||type==='pen';}
export function createTouchVisuals(root,{doc=root?.ownerDocument??globalThis.document}={}){
 const dots=new Map(),rings=new Set();
 let enabled=true;
 const place=(el,x,y)=>{el.style.transform=`translate(${x}px,${y}px)`;};
 // The lowest finger number not in use, starting at 1, like a fresh mtk-viewer id.
 const freeSlot=()=>{const used=new Set([...dots.values()].map(d=>d.slot));let s=1;while(used.has(s))s++;return s;};
 function ring(x,y,slot){
  if(rings.size>=TOUCH_FX.maxRings){const oldest=rings.values().next().value;oldest.remove();rings.delete(oldest);}
  const el=doc.createElement('i');el.className='touch-ring';el.style.setProperty('--hue',touchHue(slot));place(el,x,y);
  const done=()=>{if(rings.delete(el))el.remove();};
  el.addEventListener?.('animationend',done);
  // Fallback when animations do not run (hidden tab, test DOM): never leak rings.
  globalThis.setTimeout?.(done,TOUCH_FX.ringMs+150);
  rings.add(el);root.append(el);
 }
 return {
  get enabled(){return enabled;},
  get size(){return dots.size;},
  get ringCount(){return rings.size;},
  setEnabled(value){enabled=Boolean(value);if(!enabled)this.clear();},
  begin(id,x,y,type,{reduceMotion=false}={}){
   if(!enabled||!root||!isTouchPointer(type)||dots.has(id)||dots.size>=TOUCH_FX.maxDots)return false;
   const slot=freeSlot(),el=doc.createElement('b');
   el.className='touch-dot';el.style.setProperty('--hue',touchHue(slot));el.textContent=String(slot);place(el,x,y);
   root.append(el);dots.set(id,{el,slot});
   if(!reduceMotion)ring(x,y,slot);
   return true;
  },
  move(id,x,y){const d=dots.get(id);if(d)place(d.el,x,y);},
  end(id){const d=dots.get(id);if(!d)return false;d.el.remove();dots.delete(id);return true;},
  clear(){for(const d of dots.values())d.el.remove();dots.clear();for(const el of rings)el.remove();rings.clear();},
 };
}
