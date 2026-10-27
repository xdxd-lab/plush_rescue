// V12 presentation helpers. Pure functions only: no DOM, no game mutation.
// Gameplay values stay in core.js/weapons.js; this module only formats them.
import {DROP_GEOMETRY} from './weapon-visuals.js';

export const WEAPON_ICONS=Object.freeze({pulse:'i-pulse',shotgun:'i-shotgun',burst:'i-burst',ember:'i-ember',bomber:'i-bomber',moonfan:'i-moonfan',frostwand:'i-frostwand',cannon:'i-cannon',none:'i-empty'});
export const UPGRADE_ICONS=Object.freeze({power:'i-pulse',rate:'i-bolt',speed:'i-feather',heart:'i-heart'});

export function iconSvg(symbol,className='icon'){
 return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#${symbol}"></use></svg>`;
}
export function weaponIcon(id,className){return iconSvg(WEAPON_ICONS[id]||WEAPON_ICONS.none,className);}

export function formatClock(seconds){
 const s=Math.max(0,Math.floor(seconds));
 return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}

// Read-only view of the existing boss schedule (nextBossMinute / pendingBoss).
export function nextBossCountdown(game,bossKind,duration){
 if(game.pendingBoss)return {state:'waiting',kind:game.pendingBoss.kind,seconds:0};
 const at=game.nextBossMinute*60;
 if(!Number.isFinite(at)||at>=duration)return {state:'none',kind:null,seconds:0};
 return {state:'soon',kind:bossKind(game.nextBossMinute),seconds:Math.max(0,Math.ceil(at-game.time))};
}
export function bossClockLabel(info){
 if(info.state==='waiting')return (info.kind==='big'?'大首領':'首領')+'待命中';
 if(info.state==='none')return '撐到天亮';
 return (info.kind==='big'?'大首領 ':'首領 ')+formatClock(info.seconds).replace(/^0/,'');
}

// Local best records. Storage may be missing or throw (private mode, embeds).
export const RECORDS_KEY='plush-rescue:records';
const RECORD_FIELDS=['time','saved','level','bosses'];
export function emptyRecords(){return {time:0,saved:0,level:0,bosses:0,runs:0};}
export function readRecords(storage){
 const records=emptyRecords();
 try{
  const raw=JSON.parse(storage?.getItem(RECORDS_KEY)||'null');
  if(raw&&typeof raw==='object')for(const key of [...RECORD_FIELDS,'runs']){const v=Number(raw[key]);if(Number.isFinite(v)&&v>=0)records[key]=Math.floor(v);}
 }catch{}
 return records;
}
export function mergeRecords(previous,run){
 const records={...previous,runs:(previous.runs||0)+1},beaten={};
 for(const key of RECORD_FIELDS){
  const value=Math.max(0,Math.floor(Number(run[key])||0));
  // A first run sets the baseline; it is not presented as beating a record.
  beaten[key]=previous.runs>0&&value>previous[key];
  if(value>previous[key])records[key]=value;
 }
 return {records,beaten};
}
export function writeRecords(storage,records){
 try{storage.setItem(RECORDS_KEY,JSON.stringify(records));return true;}catch{return false;}
}

// The strongest weapon of this run, ties broken by catalog order.
export function bestWeapon(weaponLevels,weapons){
 let best=null;
 for(const id of Object.keys(weapons)){const level=weaponLevels[id]||0;if(level>0&&(!best||level>best.level))best={id,level};}
 return best;
}

// ---- V12.1 tap-to-pick (V12.1.1 hit area) ------------------------------------
// Short-tap detector. Every pointer is judged on its own at release: a tap is
// small movement and short duration. It never touches movement ownership.
// Mouse clicks get more time and slack than fingers (a deliberate click on a
// trackpad often lasts 400–600 ms); a pointer that really travelled is a drag.
export const TAP_LIMITS=Object.freeze({touchMove:12,touchMs:350,mouseMove:10,mouseMs:700});
export function createTapTracker({touchMove=TAP_LIMITS.touchMove,mouseMove=TAP_LIMITS.mouseMove,touchMs=TAP_LIMITS.touchMs,mouseMs=TAP_LIMITS.mouseMs,maxPointers=6}={}){
 const active=new Map();
 return {
  begin(id,x,y,time,type='touch'){
   if(!active.has(id)&&active.size>=maxPointers)active.delete(active.keys().next().value);
   const mouse=type==='mouse';
   active.set(id,{x,y,time,limit:mouse?mouseMove:touchMove,maxMs:mouse?mouseMs:touchMs,type,moved:false});
  },
  move(id,x,y){const t=active.get(id);if(t&&!t.moved&&Math.hypot(x-t.x,y-t.y)>t.limit)t.moved=true;},
  end(id,x,y,time){
   const t=active.get(id);if(!t)return null;active.delete(id);
   if(t.moved||Math.hypot(x-t.x,y-t.y)>t.limit||time-t.time>t.maxMs)return null;
   return {x,y,type:t.type};
  },
  cancel(id){active.delete(id);},
  clear(){active.clear();},
  get size(){return active.size;},
 };
}
// V12.2.1: mouse hover pickup. A mouse that rests on the same drop for HOLD ms
// takes it through the normal tap flow. Timing is driven by frame deltas, so a
// stalled frame (tab switch, device sleep) is never counted. The pointer must have
// moved while over the drop: a drop that slides under a resting cursor (camera
// motion) never starts a hover. Sliding off the drop resets at once (no edge grace).
// A slow frame counts in full, so a slow device still reaches 0.5 s; only a stall of
// stallMs or more (1 fps, which is what a throttled background tab gives, or sleep, or
// a frozen page) resets the hover: nothing is counted and nothing stays pending. Only a drop that is still in the game but in
// the dark beat of its expiry blink is "held": progress is kept, no time is added and
// it can not be taken until it shows; a hold longer than maxHoldMs resets too.
export const HOVER_LIMITS=Object.freeze({holdMs:500,stallMs:1000,maxHoldMs:600});
export function createHoverTracker({holdMs=HOVER_LIMITS.holdMs,stallMs=HOVER_LIMITS.stallMs,maxHoldMs=HOVER_LIMITS.maxHoldMs}={}){
 let id=null,armed=false,elapsed=0,blocked=null,held=0;
 const progress=()=>armed?Math.min(1,elapsed/holdMs):0;
 // armed: the hover is running (the pointer moved over the drop), even before any time is counted.
 const out=(fire,shown)=>({fire,id:shown,progress:shown===null?0:progress(),armed:shown!==null&&armed});
 const reset=()=>{id=null;armed=false;elapsed=0;blocked=null;held=0;};
 return {
  // hitId: the drawn drop under the pointer this frame (or null); hiddenId: the
  // tracked drop when it is under the pointer but only hidden by its blink;
  // dtMs: frame delta; moved: the pointer moved since the previous frame.
  update({hitId=null,hiddenId=null,dtMs=0,moved=false}={}){
   if(Number.isFinite(dtMs)&&dtMs>=stallMs){reset();return out(null,null);}
   const dt=Number.isFinite(dtMs)&&dtMs>0?dtMs:0;
   if(hitId===null||hitId===undefined){
    if(id!==null&&hiddenId===id&&(held+=dt)<=maxHoldMs)return out(null,id);
    reset();return out(null,null);
   }
   held=0;
   if(hitId===blocked)return out(null,null);
   if(hitId!==id){id=hitId;armed=Boolean(moved);elapsed=0;blocked=null;return out(null,id);}
   // The frame that arms the hover (the pointer moved over the drop) adds no time.
   if(!armed&&moved){armed=true;elapsed=0;}
   else if(armed)elapsed+=dt;
   if(armed&&elapsed>=holdMs){const fire=id;reset();blocked=fire;return out(fire,null);}
   return out(null,id);
  },
  reset,
  get id(){return id;},
 };
}
// Event time for tap duration. timeStamp is when the input happened, so a busy
// frame between press and release does not make a quick click look slow.
export function eventTime(event,now){
 const t=event?.timeStamp;
 return typeof t==='number'&&Number.isFinite(t)&&t>0?t:now();
}

// Opaque HUD panels. They are pointer-events:none (so a drag can start on them),
// which means a tap on them reaches the canvas: it must not pick what is hidden
// underneath. The notice only covers the world while it is shown.
export const HUD_OCCLUDERS='.portrait,.health,.timer,.rescues,#bossPanel,#notice,.experience,.weapon-card,#twoHandedBar,#stats';
export function pointCovered(point,elements){
 for(const el of elements){
  if(el.id==='notice'&&!el.classList?.contains('show'))continue;
  const r=el.getBoundingClientRect?.();
  if(r&&r.width>0&&r.height>0&&point.x>=r.left&&point.x<=r.right&&point.y>=r.top&&point.y<=r.bottom)return true;
 }
 return false;
}

// ---- screen-space hit area of one drop ----------------------------------------
// `project(x,y,z)` returns {x,y,z}: CSS pixels plus NDC depth, or null behind the
// camera. `axes` holds the camera's world right/up vectors (labels are sprites
// that always face the camera). `viewport` is {left,top,width,height}.
// Parts: the ground ring (an ellipse on screen), the bobbing item (the cylinder
// it sweeps over its whole bob range) and, when shown, the full label rectangle.
const RING_STEPS=12;
export function dropHitShape(drop,project,axes,viewport,{labelVisible=true}={}){
 const G=DROP_GEOMETRY,parts=[];
 // A point outside the camera's depth range is not drawn (project gives null).
 // A part keeps its other points, so one cut by the far plane stays tappable.
 // Depth is the part's nearest point: what is drawn in front.
 const add=(kind,points)=>{const poly=points.filter(Boolean);if(poly.length>=3)parts.push({kind,poly:convexHull(poly),z:Math.min(...poly.map(p=>p.z))});};
 const circle=(radius,y)=>Array.from({length:RING_STEPS},(_,i)=>{const a=i/RING_STEPS*Math.PI*2;return project(drop.x+Math.cos(a)*radius,y,drop.z+Math.sin(a)*radius);});
 add('ring',circle(G.ringRadius,G.ringY));
 // The item spins and bobs: cover the upright cylinder it sweeps.
 add('item',[...circle(G.floatRadius,G.floatY-G.floatBob+G.floatBottom),...circle(G.floatRadius,G.floatY+G.floatBob+G.floatTop)]);
 if(labelVisible){
  const w=G.labelWidth/2,h=G.labelHeight/2,R=axes.right,U=axes.up;
  add('label',[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>project(drop.x+R.x*w*sx+U.x*h*sy,G.labelY+R.y*w*sx+U.y*h*sy,drop.z+R.z*w*sx+U.z*h*sy)));
 }
 // Visible when any drawn part overlaps the viewport, even by one corner.
 return parts.some(part=>polygonMeetsRect(part.poly,viewport))?{drop,parts}:null;
}
// Convex polygon vs axis-aligned rectangle: a vertex inside the rectangle, a
// rectangle corner inside the polygon, or two crossing edges.
export function polygonMeetsRect(poly,r){
 const right=r.left+r.width,bottom=r.top+r.height;
 if(poly.some(p=>p.x>=r.left&&p.x<=right&&p.y>=r.top&&p.y<=bottom))return true;
 const corners=[{x:r.left,y:r.top},{x:right,y:r.top},{x:right,y:bottom},{x:r.left,y:bottom}];
 if(poly.length>=3&&corners.some(c=>polygonDistance(c,poly)===0))return true;
 for(let i=0;i<poly.length;i++)for(let j=0;j<4;j++)if(segmentsCross(poly[i],poly[(i+1)%poly.length],corners[j],corners[(j+1)%4]))return true;
 return false;
}
function segmentsCross(a,b,c,d){
 const o=(p,q,r)=>Math.sign((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x));
 return o(a,b,c)!==o(a,b,d)&&o(c,d,a)!==o(c,d,b);
}
function convexHull(points){
 const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
 const lower=[],upper=[];
 for(const q of p){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],q)<=0)lower.pop();lower.push(q);}
 for(const q of p.reverse()){while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],q)<=0)upper.pop();upper.push(q);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function segmentDistance(p,a,b){
 const sx=b.x-a.x,sy=b.y-a.y,len2=sx*sx+sy*sy,t=len2?Math.max(0,Math.min(1,((p.x-a.x)*sx+(p.y-a.y)*sy)/len2)):0;
 return Math.hypot(p.x-(a.x+sx*t),p.y-(a.y+sy*t));
}
// 0 inside a convex polygon, otherwise the distance to its outline.
function polygonDistance(p,poly){
 if(poly.length<3)return poly.length?Math.min(...poly.map((q,i)=>segmentDistance(p,q,poly[(i+1)%poly.length]))):Infinity;
 let pos=false,neg=false,best=Infinity;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],side=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  if(side>0)pos=true;else if(side<0)neg=true;
  best=Math.min(best,segmentDistance(p,a,b));
 }
 return pos&&neg?best:0;
}


// Choose the drop under a tap. Taps on the drawn shapes are exact hits; a tap
// just outside still counts within a pointer-sized margin (finger > mouse).
// Exact hits are ranked by what is drawn in front (smallest depth), near misses
// by how close the tap came; ties fall back to the stable drop id, so the same
// tap always gives the same answer and an overlap never ends with no pick.
export const TAP_MARGIN=Object.freeze({touch:16,mouse:8});
export function pickDropAt(point,shapes,{margin=point.type==='mouse'?TAP_MARGIN.mouse:TAP_MARGIN.touch}={}){
 let best=null;
 for(const shape of shapes){
  if(!shape)continue;
  let distance=Infinity,z=Infinity;
  for(const part of shape.parts){
   const d=polygonDistance(point,part.poly);
   if(d<distance-1e-9||(Math.abs(d-distance)<=1e-9&&part.z<z)){distance=d;z=part.z;}
  }
  if(distance>margin)continue;
  const exact=distance===0,c={drop:shape.drop,exact,z,distance};
  if(!best||better(c,best))best=c;
 }
 return best?best.drop:null;
}
function better(a,b){
 if(a.exact!==b.exact)return a.exact;
 if(a.exact){if(a.z!==b.z)return a.z<b.z;}
 else{if(a.distance!==b.distance)return a.distance<b.distance;if(a.z!==b.z)return a.z<b.z;}
 return a.drop.id<b.drop.id;
}

// ---- V12.1 remembered settings -------------------------------------------------
export const SETTINGS_KEY='plush-rescue:settings';
export const QUALITIES=Object.freeze(['low','balanced','high']);
export const HEROES=Object.freeze(['pudding','polar']);
export function defaultSettings(){return {quality:'balanced',volume:.25,hero:'pudding',stats:false,autoChoose:false};}
// One validator for both directions: whatever is read or about to be written is
// reduced to valid values, one field at a time, so bad data is never persisted.
export function sanitizeSettings(raw){
 const settings=defaultSettings();
 if(raw&&typeof raw==='object'){
  if(QUALITIES.includes(raw.quality))settings.quality=raw.quality;
  if(typeof raw.volume==='number'&&Number.isFinite(raw.volume))settings.volume=Math.min(1,Math.max(0,raw.volume));
  if(HEROES.includes(raw.hero))settings.hero=raw.hero;
  if(typeof raw.stats==='boolean')settings.stats=raw.stats;
  if(typeof raw.autoChoose==='boolean')settings.autoChoose=raw.autoChoose;
 }
 return settings;
}
export function readSettings(storage){
 try{return sanitizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY)||'null'));}catch{return defaultSettings();}
}
export function writeSettings(storage,settings){
 try{storage.setItem(SETTINGS_KEY,JSON.stringify(sanitizeSettings(settings)));return true;}catch{return false;}
}

// A recommendation is predictable and does not consume the game's random stream.
export function recommendUpgrade(game,upgrades){
 const available=upgrades.filter(u=>u.id==='power'||u.id==='rate'&&game.fireInterval>.075+1e-6||u.id==='speed'&&(game.player.speed<8-1e-6||game.player.hp<game.player.maxHp)||u.id==='heart'&&(game.player.maxHp<12||game.player.hp<game.player.maxHp));
 if(!available.length)return upgrades[0]?.id??null;
 if(game.player.hp<=game.player.maxHp*.4&&available.some(u=>u.id==='heart'))return 'heart';
 return available.find(u=>u.id==='power')?.id??available[0].id;
}
export function recommendPickup(game,pickup){
 if(!pickup||pickup.slot==='twohand')return false;
 const currentId=game.loadout[pickup.slot];
 if(!currentId||currentId===pickup.weaponId)return false;
 if(pickup.slot==='offhand'&&game.magicByWeapon[currentId]?.evolved&&!game.magicByWeapon[pickup.weaponId]?.evolved)return false;
 return (game.weaponLevels[pickup.weaponId]??0)>(game.weaponLevels[currentId]??0);
}
