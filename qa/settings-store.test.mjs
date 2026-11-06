// settings-store.js: remembered settings and the separate auto-equip key, with
// missing, throwing and working storage. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsStore,AUTO_EQUIP_KEY} from '../settings-store.js';
import {SETTINGS_KEY,defaultSettings} from '../ui.js';

function memory(seed={},{deny=false}={}){
 const map=new Map(Object.entries(seed));
 return {map,getItem(k){if(deny)throw new Error('denied');return map.get(k)??null;},setItem(k,v){if(deny)throw new Error('denied');map.set(k,String(v));}};
}

test('no storage, or storage that throws: defaults, auto-equip off, saving does not throw',()=>{
 for(const getStorage of [()=>null,()=>memory({},{deny:true})]){
  const s=createSettingsStore({getStorage}),d=defaultSettings();
  assert.deepEqual({...s.prefs},{hero:d.hero,quality:d.quality,volume:d.volume,stats:d.stats,autoChoose:d.autoChoose,touchFx:d.touchFx,autoEquip:false});
  s.prefs.quality='low';assert.doesNotThrow(()=>s.save());assert.equal(s.prefs.quality,'low','kept for this session');
  assert.equal(s.setAutoEquip(1),true);assert.equal(s.prefs.autoEquip,true);
 }
});

test('reads the remembered settings and the auto-equip key; writes sanitized values only',()=>{
 const store=memory({[SETTINGS_KEY]:JSON.stringify({quality:'high',volume:.5,hero:'polar',stats:true,autoChoose:true,touchFx:false}),[AUTO_EQUIP_KEY]:'true'});
 const s=createSettingsStore({getStorage:()=>store});
 assert.deepEqual({...s.prefs},{hero:'polar',quality:'high',volume:.5,stats:true,autoChoose:true,touchFx:false,autoEquip:true});
 Object.assign(s.prefs,{quality:'ultra',volume:7});s.save();
 assert.deepEqual(JSON.parse(store.map.get(SETTINGS_KEY)),{quality:'balanced',volume:1,hero:'polar',stats:true,autoChoose:true,touchFx:false});
 assert.equal(s.prefs.quality,'ultra','the in-memory value is not rewritten');
 assert.equal(s.setAutoEquip(false),false);assert.equal(store.map.get(AUTO_EQUIP_KEY),'false');
 assert.ok(!JSON.parse(store.map.get(SETTINGS_KEY)).hasOwnProperty('autoEquip'),'auto-equip stays on its own key');
});

test('every access asks for storage again, so a later block is honoured',()=>{
 let current=memory();const s=createSettingsStore({getStorage:()=>current});
 current=memory({},{deny:true});assert.doesNotThrow(()=>s.save());
 current=memory();s.save();assert.ok(current.map.has(SETTINGS_KEY));assert.equal(s.storage(),current);
});
