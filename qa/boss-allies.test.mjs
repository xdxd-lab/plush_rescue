// Boss allies: a rescued boss shrinks into a small helper that serves its full
// ALLY.duration of game time (frozen while paused or choosing), deals symbolic
// damage to ordinary enemies, then leaves. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,ALLY,LIMITS,enemyHealth} from '../core.js';

function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
// A running game with no spawns, drops, level-ups, boss schedule or player
// weapons in the way, so only the allies act.
function quiet(options={}){
 const g=new Game({random:seeded(7),map:0,autoEquip:true,...options});g.start();
 g.drops.length=0;g.spawn=1e9;g.dropTimer=1e9;g.nextBossMinute=1e9;g.nextExp=1e9;g.invuln=1e9;g.fire=1e9;g.magicFire=1e9;
 return g;
}
function rescueBoss(g,kind='mini'){
 assert.ok(g.spawnBoss(kind,1));const boss=g.enemies.at(-1);
 g.rescueEnemy(boss);return boss;
}
function run(g,seconds){for(let t=0;t<seconds-1e-9;t+=.05)g.step(.05,{x:0,z:0});}
function ordinary(g,dx,dz){const e={id:++g.serial,x:g.player.x+dx,z:g.player.z+dz,hp:1e9,type:0,speed:0,angle:0};g.enemies.push(e);return e;}

test('a rescued boss becomes an ally, not a 4-second rescued plush; ordinary rescues are unchanged',()=>{
 const g=quiet(),boss=rescueBoss(g,'big');
 assert.equal(g.allies.length,1);assert.equal(g.rescued.length,0);
 const a=g.allies[0];assert.equal(a.boss,'big');assert.equal(a.type,boss.type);assert.equal(a.life,ALLY.duration);
 assert.ok(g.events.some(e=>e.kind==='ally'&&e.id===a.id));
 assert.equal(g.saved,1,'a boss rescue still counts as a rescue');
 const e=ordinary(g,1,0);g.rescueEnemy(e);assert.equal(g.rescued.length,1);assert.equal(g.allies.length,1);
});

test('bossAllies:false keeps the V11 rescued-boss behaviour',()=>{
 const g=quiet({bossAllies:false});rescueBoss(g,'mini');
 assert.equal(g.allies.length,0);assert.equal(g.rescued.length,1);assert.equal(g.rescued[0].boss,'mini');
});

test('every ally serves the full duration of game time, then leaves happily and is removed',()=>{
 const g=quiet();rescueBoss(g);const a=g.allies[0];
 run(g,ALLY.duration-.1);assert.ok(a.life>0&&a.life<=.1+1e-9,'still helping just before the end');
 let left=null;for(let i=0;i<4&&!left;i++){g.step(.05,{x:0,z:0});left=g.events.find(e=>e.kind==='allyLeave');}
 assert.ok(left,'a leave event is emitted');assert.equal(left.id,a.id);assert.ok(Math.abs(g.time-ALLY.duration)<.06);
 assert.equal(g.allies.length,1,'kept during the leave animation');
 run(g,ALLY.leave+.1);assert.equal(g.allies.length,0);
});

test('ally time is frozen while paused, choosing an upgrade or comparing a pickup',()=>{
 const g=quiet();rescueBoss(g);const a=g.allies[0];run(g,2);const life=a.life;
 for(const status of ['paused','upgrade','pickup']){g.status=status;run(g,30);assert.equal(a.life,life,status);}
 g.status='running';run(g,1);assert.ok(Math.abs(a.life-(life-1))<1e-6);
});

test('no capacity eviction: many bosses and a full rescued list never shorten an ally',()=>{
 const g=quiet(),ids=[];
 for(let i=0;i<6;i++){g.enemies=g.enemies.filter(e=>!e.boss);rescueBoss(g,i%2?'big':'mini');ids.push(g.allies.at(-1).id);run(g,.5);}
 for(let i=0;i<LIMITS.rescued*3;i++){const e=ordinary(g,2,2);e.hp=0;g.rescueEnemy(e);}
 assert.deepEqual(g.allies.map(a=>a.id),ids,'all six allies are still present');
 // The first ally joined 2.5 s before the last; each leaves only after its own full duration.
 const leaves=[];for(let t=0;t<ALLY.duration+2;t+=.05){g.step(.05,{x:0,z:0});for(const e of g.events)if(e.kind==='allyLeave')leaves.push([e.id,+g.time.toFixed(2)]);}
 assert.deepEqual(leaves.map(([id])=>id),ids);
 for(let i=0;i<ids.length;i++)assert.ok(Math.abs(leaves[i][1]-(.5*(i+1)+ALLY.duration-.5))<.11,`ally ${ids[i]} served ${ALLY.duration} s`);
});

test('allies hit the nearest ordinary enemy in range for a small share of enemy health; never bosses',()=>{
 const g=quiet();rescueBoss(g,'mini');const a=g.allies[0];
 g.enemies=g.enemies.filter(e=>!e.boss);
 assert.ok(g.spawnBoss('big',2));const boss=g.enemies.find(e=>e.boss);boss.x=a.x+.5;boss.z=a.z;const bossHp=boss.hp;
 const near=ordinary(g,1.5,0),hp=near.hp;
 let shots=[];for(let t=0;t<3;t+=.05){g.step(.05,{x:0,z:0});shots.push(...g.events.filter(e=>e.kind==='allyShot'));boss.x=a.x+.5;boss.z=a.z;}
 assert.ok(shots.length>=3&&shots.length<=Math.ceil((3-ALLY.firstShot)/ALLY.interval)+1,`shot count ${shots.length}`);
 assert.equal(boss.hp,bossHp,'bosses are not targeted');
 assert.ok(shots.every(s=>s.tx===near.x&&s.tz===near.z),'every shot goes to the ordinary enemy');
 const each=enemyHealth(g.time)*ALLY.share.mini;assert.ok(Math.abs((hp-near.hp)-each*shots.length)<1e-6);
});

test('an ordinary enemy beyond range is ignored',()=>{
 const g=quiet();rescueBoss(g);g.enemies.length=0;const a=g.allies[0];
 // Keep one enemy just outside the ally's reach (allowing for one frame of ally
 // movement), on the side of the ally with more room inside the arena.
 const e=ordinary(g,0,0),reach=ALLY.range+ALLY.speed*.05+.2;
 for(let t=0;t<3;t+=.05){e.x=a.x+(a.x>0?-reach:reach);e.z=a.z;g.step(.05,{x:0,z:0});assert.ok(!g.events.some(x=>x.kind==='allyShot'));}
 assert.equal(e.hp,1e9);
});

test('an ally without targets waits and fires as soon as one is in range',()=>{
 const g=quiet();rescueBoss(g);g.enemies.length=0;run(g,2);
 const e=ordinary(g,1,0);g.step(.05,{x:0,z:0});assert.ok(g.events.some(x=>x.kind==='allyShot'),'fires on the first frame a target appears');assert.ok(e.hp<1e9);
});

test('ally rescues are counted and feed the normal rescue rewards',()=>{
 const g=quiet();rescueBoss(g);const saved=g.saved,e=ordinary(g,1,0);e.hp=enemyHealth(g.time)*ALLY.share.mini/2;
 run(g,1);assert.equal(g.saved,saved+1);assert.equal(g.allyRescues,1);assert.equal(g.allies[0].rescues,1);
});

test('allies stay near the player, inside the arena, and drift away while leaving',()=>{
 const g=quiet();rescueBoss(g);const a=g.allies[0];
 for(let t=0;t<ALLY.duration;t+=.05){g.step(.05,{x:Math.cos(t),z:Math.sin(t*.7)});if(t>1)assert.ok(Math.hypot(a.x-g.player.x,a.z-g.player.z)<ALLY.orbit+1.2,'keeps up with the player');assert.ok(Math.abs(a.x)<=g.bounds&&Math.abs(a.z)<=g.bounds);}
 const before=Math.hypot(a.x-g.player.x,a.z-g.player.z);run(g,.5);assert.ok(Math.hypot(a.x-g.player.x,a.z-g.player.z)>before);
});

test('helpers that join together circle apart instead of stacking',()=>{
 const g=quiet();rescueBoss(g,'mini');g.enemies=g.enemies.filter(e=>!e.boss);rescueBoss(g,'big');
 run(g,2);const [a,b]=g.allies;assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>1.5,`apart: ${Math.hypot(a.x-b.x,a.z-b.z).toFixed(2)}`);
});

test('ally behaviour never draws random numbers',()=>{
 let calls=0;const base=seeded(3),g=quiet({random:()=>{calls++;return base();}});
 rescueBoss(g);g.enemies.length=0;for(let i=0;i<5;i++)ordinary(g,1+i*.3,.5);for(const e of g.enemies)e.hp=1e9;
 const before=calls;run(g,ALLY.duration+ALLY.leave+.2);assert.equal(calls,before);
});

// Totals of a run with and without allies are not compared seed by seed: any
// extra rescue reshuffles every later random drop, which alone moves a run's
// total by about ±11% (one-draw reseed, 24 seeds). The ally's own share is the
// direct measure of its weight.
test('balance: over full 20-minute runs allies make well under 1% of rescues and every boss serves its time',()=>{
 for(const seed of [1,2,3]){
  const g=new Game({random:seeded(seed),map:seed%3,autoEquip:true});g.start();const joined=new Map(),served=new Map();
  for(let i=0;i<LIMITS.duration/.05+10&&g.status!=='ended';i++){
   g.invuln=1;const a=i*.013;g.step(.05,{x:Math.cos(a),z:Math.sin(a*1.3)});
   for(const e of g.events){if(e.kind==='ally')joined.set(e.id,g.time);if(e.kind==='allyLeave')served.set(e.id,g.time-joined.get(e.id));}
   if(g.status==='upgrade')g.upgrade(['power','rate','speed','heart'][g.level%4]);
  }
  assert.ok(g.allyRescues/g.saved<.01,`seed ${seed}: ally rescues ${g.allyRescues}/${g.saved}`);
  assert.ok(joined.size>=10,`seed ${seed}: ${joined.size} bosses rescued`);
  // Every ally that joined at least ALLY.duration before the end served all of it.
  for(const [id,at] of joined)if(at<=LIMITS.duration-ALLY.duration-.1)assert.ok(Math.abs(served.get(id)-ALLY.duration)<.06,`seed ${seed}: ally ${id} served ${served.get(id)}`);
 }
});
