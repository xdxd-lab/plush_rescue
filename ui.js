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
