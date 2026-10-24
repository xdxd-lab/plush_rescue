// ui.js formatting, boss countdown, local records and icon mapping, plus the
// keyboard upgrade shortcut. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Game,LIMITS,UPGRADES,bossKind} from '../core.js';
import {WEAPONS} from '../weapons.js';
import {routeKeyDown} from '../keyboard.js';
import * as ui from '../ui.js';

test('clock formatting matches the existing HUD timer',()=>{
 assert.equal(ui.formatClock(0),'00:00');assert.equal(ui.formatClock(59.9),'00:59');assert.equal(ui.formatClock(1200),'20:00');assert.equal(ui.formatClock(-3),'00:00');
});

test('boss countdown reads the real schedule without changing it',()=>{
 const game=new Game({random:()=>.5});const snapshot=JSON.stringify({n:game.nextBossMinute,p:game.pendingBoss});
 assert.deepEqual(ui.nextBossCountdown(game,bossKind,LIMITS.duration),{state:'soon',kind:'mini',seconds:60});
 assert.equal(JSON.stringify({n:game.nextBossMinute,p:game.pendingBoss}),snapshot);
 game.time=170;game.nextBossMinute=3;const big=ui.nextBossCountdown(game,bossKind,LIMITS.duration);
 assert.deepEqual(big,{state:'soon',kind:'big',seconds:10});assert.equal(ui.bossClockLabel(big),'大首領 0:10');
 game.pendingBoss={kind:'big',minute:6};assert.equal(ui.bossClockLabel(ui.nextBossCountdown(game,bossKind,LIMITS.duration)),'大首領待命中');
 game.pendingBoss=null;game.nextBossMinute=20;assert.equal(ui.bossClockLabel(ui.nextBossCountdown(game,bossKind,LIMITS.duration)),'撐到天亮');
 // Matches the live schedule through a real 3-minute run.
 const run=new Game({random:()=>.5});run.start();const seen=[];
 for(let t=0;t<185;t+=.05){const before=ui.nextBossCountdown(run,bossKind,LIMITS.duration);run.step(.05,{x:0,z:0});run.invuln=1;run.player.hp=run.player.maxHp;if(run.status==='upgrade')run.upgrade('heart');if(run.status==='pickup')run.resolvePickup(false);for(const e of run.events)if(e.kind==='boss')seen.push([e.boss,before.kind]);}
 // A big boss can stay pending while two bosses are alive, so only require the
 // first two arrivals; every arrival must match what the clock announced.
 assert.ok(seen.length>=2,'at least two boss arrivals in three minutes');assert.deepEqual(seen.slice(0,2).map(([actual])=>actual),['mini','mini']);
 for(const [actual,announced] of seen)assert.equal(actual,announced);
});

test('local records: baseline, improvement flags, corrupt and blocked storage',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.deepEqual(ui.readRecords(storage),ui.emptyRecords());
 let {records,beaten}=ui.mergeRecords(ui.readRecords(storage),{time:100,saved:10,level:3,bosses:1});
 assert.ok(Object.values(beaten).every(v=>v===false),'first run is a baseline');assert.ok(ui.writeRecords(storage,records));
 ({records,beaten}=ui.mergeRecords(ui.readRecords(storage),{time:90,saved:25,level:3,bosses:2}));
 assert.deepEqual(beaten,{time:false,saved:true,level:false,bosses:true});assert.equal(records.time,100);assert.equal(records.saved,25);assert.equal(records.runs,2);
 store.set(ui.RECORDS_KEY,'{not json');assert.deepEqual(ui.readRecords(storage),ui.emptyRecords());
 store.set(ui.RECORDS_KEY,JSON.stringify({time:-5,saved:'7',level:null,runs:2}));assert.deepEqual(ui.readRecords(storage),{time:0,saved:7,level:0,bosses:0,runs:2});
 const blocked={getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}};
 assert.deepEqual(ui.readRecords(blocked),ui.emptyRecords());assert.equal(ui.writeRecords(blocked,records),false);assert.deepEqual(ui.readRecords(null),ui.emptyRecords());
});

test('every weapon and upgrade has an SVG symbol in the page sprite',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const id of Object.keys(WEAPONS))assert.match(html,new RegExp(`<symbol id="${ui.WEAPON_ICONS[id]}"`),id);
 for(const u of UPGRADES)assert.match(html,new RegExp(`<symbol id="${ui.UPGRADE_ICONS[u.id]}"`),u.id);
 assert.match(ui.weaponIcon('frostwand'),/<use href="#i-frostwand">/);assert.match(ui.weaponIcon('unknown'),/#i-empty/);
});

test('best weapon of the run prefers the highest level, then catalog order',()=>{
 assert.deepEqual(ui.bestWeapon({pulse:1,moonfan:1},WEAPONS),{id:'pulse',level:1});
 assert.deepEqual(ui.bestWeapon({pulse:1,moonfan:1,shotgun:4,cannon:4},WEAPONS),{id:'cannon',level:4});
 assert.equal(ui.bestWeapon({},WEAPONS),null);
});

test('keyboard: 1–4 choose upgrades only during level-up and never inside text fields',()=>{
 const button={closest:s=>s.startsWith('input,select,textarea,[contenteditable]')?null:{}},field={closest:()=>({})},canvas={closest:()=>null};
 const ev=(key,target)=>({key,target,isComposing:false,defaultPrevented:false,ctrlKey:false,metaKey:false,altKey:false,prevented:false,preventDefault(){this.prevented=true}});
 const keys=new Set(['w']);
 const e=ev('3',button);assert.equal(routeKeyDown(e,'upgrade',keys),'upgrade:3');assert.ok(e.prevented);assert.equal(keys.size,0);
 assert.equal(routeKeyDown(ev('5',button),'upgrade',keys),null);
 assert.equal(routeKeyDown(ev('2',field),'upgrade',keys),null);
 assert.equal(routeKeyDown(ev('2',canvas),'running',keys),null);
 assert.equal(routeKeyDown(ev('2',canvas),'paused',keys),null);
 // Existing routes are unchanged.
 assert.equal(routeKeyDown(ev('Escape',canvas),'running',keys),'pause');
 assert.equal(routeKeyDown(ev('Escape',canvas),'paused',keys),'resume');
 assert.equal(routeKeyDown(ev('F3',canvas),'running',keys),'stats');
 routeKeyDown(ev('w',canvas),'running',keys);assert.ok(keys.has('w'));
});
