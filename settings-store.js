import {readSettings,writeSettings} from './ui.js';

// Remembered player choices (V12.2): the current values in one object, read once
// at start and written through ui.js's sanitizer. Storage may be missing or throw
// (private mode, embedded previews): every access asks getStorage() again, and a
// failed write keeps the value for this session. The in-memory value is not
// sanitized on write, exactly as before the module was split out of main.js.
// Auto-equip keeps its own V12.0 key: the default is always to ask.
export const AUTO_EQUIP_KEY='plush-rescue:auto-equip';

export function createSettingsStore({getStorage}){
 const saved=readSettings(getStorage());
 const prefs={hero:saved.hero,quality:saved.quality,volume:saved.volume,stats:saved.stats,autoChoose:saved.autoChoose,touchFx:saved.touchFx,autoEquip:false};
 try{prefs.autoEquip=getStorage().getItem(AUTO_EQUIP_KEY)==='true';}catch{}
 function save(){writeSettings(getStorage(),{quality:prefs.quality,volume:prefs.volume,hero:prefs.hero,stats:prefs.stats,autoChoose:prefs.autoChoose,touchFx:prefs.touchFx});}
 function setAutoEquip(value){prefs.autoEquip=Boolean(value);try{getStorage().setItem(AUTO_EQUIP_KEY,String(prefs.autoEquip));}catch{}return prefs.autoEquip;}
 return {prefs,storage:getStorage,save,setAutoEquip};
}
