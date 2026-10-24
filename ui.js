// V12 presentation helpers. Pure functions only: no DOM, no game mutation.
// Gameplay values stay in core.js/weapons.js; this module only formats them.

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

// ---- V12.1 tap-to-pick -------------------------------------------------------
// Short-tap detector. Every pointer is judged on its own at release: a tap is
// small movement and short duration. It never touches movement ownership.
export function createTapTracker({touchMove=12,mouseMove=6,maxMs=350,maxPointers=6}={}){
 const active=new Map();
 return {
  begin(id,x,y,time,type='touch'){
   if(!active.has(id)&&active.size>=maxPointers)active.delete(active.keys().next().value);
   active.set(id,{x,y,time,limit:type==='mouse'?mouseMove:touchMove,type,moved:false});
  },
  move(id,x,y){const t=active.get(id);if(t&&!t.moved&&Math.hypot(x-t.x,y-t.y)>t.limit)t.moved=true;},
  end(id,x,y,time){
   const t=active.get(id);if(!t)return null;active.delete(id);
   if(t.moved||Math.hypot(x-t.x,y-t.y)>t.limit||time-t.time>maxMs)return null;
   return {x,y,type:t.type};
  },
  cancel(id){active.delete(id);},
  clear(){active.clear();},
  get size(){return active.size;},
 };
}

// Choose the drop under a tap. `project(x,y,z)` maps a world point to CSS-pixel
// screen coordinates (or null when behind the camera). A drop is visible as a
// stack: ground ring, floating crystal and label, so the hit area is the whole
// segment from ring to label, padded by a finger-sized radius.
export const DROP_VISUAL={ringY:.09,labelY:1.48};
export function pickDropAt(point,drops,project,{touchRadius=36,mouseRadius=24,worldRadius=.8}={}){
 const base=point.type==='mouse'?mouseRadius:touchRadius;
 let best=null;
 for(const drop of drops){
  const ground=project(drop.x,DROP_VISUAL.ringY,drop.z),top=project(drop.x,DROP_VISUAL.labelY,drop.z);
  if(!ground||!top)continue;
  // Keep the target finger-sized even where perspective or portrait framing shrinks it.
  const east=project(drop.x+1,DROP_VISUAL.ringY,drop.z),north=project(drop.x,DROP_VISUAL.ringY,drop.z+1);
  const unit=east&&north?(Math.hypot(east.x-ground.x,east.y-ground.y)+Math.hypot(north.x-ground.x,north.y-ground.y))/2:0;
  const radius=Math.max(base,unit*worldRadius);
  const sx=top.x-ground.x,sy=top.y-ground.y,len2=sx*sx+sy*sy;
  const t=len2?Math.max(0,Math.min(1,((point.x-ground.x)*sx+(point.y-ground.y)*sy)/len2)):0;
  const distance=Math.hypot(point.x-(ground.x+sx*t),point.y-(ground.y+sy*t));
  if(distance>radius)continue;
  const score=distance/radius;
  if(!best||score<best.score)best={drop,score};
 }
 return best?best.drop:null;
}

// ---- V12.1 remembered settings -------------------------------------------------
export const SETTINGS_KEY='plush-rescue:settings';
export const QUALITIES=Object.freeze(['low','balanced','high']);
export const HEROES=Object.freeze(['pudding','polar']);
export function defaultSettings(){return {quality:'balanced',volume:.25,hero:'pudding',stats:false};}
// One validator for both directions: whatever is read or about to be written is
// reduced to valid values, one field at a time, so bad data is never persisted.
export function sanitizeSettings(raw){
 const settings=defaultSettings();
 if(raw&&typeof raw==='object'){
  if(QUALITIES.includes(raw.quality))settings.quality=raw.quality;
  if(typeof raw.volume==='number'&&Number.isFinite(raw.volume))settings.volume=Math.min(1,Math.max(0,raw.volume));
  if(HEROES.includes(raw.hero))settings.hero=raw.hero;
  if(typeof raw.stats==='boolean')settings.stats=raw.stats;
 }
 return settings;
}
export function readSettings(storage){
 try{return sanitizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY)||'null'));}catch{return defaultSettings();}
}
export function writeSettings(storage,settings){
 try{storage.setItem(SETTINGS_KEY,JSON.stringify(sanitizeSettings(settings)));return true;}catch{return false;}
}
