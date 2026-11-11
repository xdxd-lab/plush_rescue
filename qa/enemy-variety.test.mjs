// Enemy variety: spitters (aimed, telegraphed ground warnings) and dashers
// (locked, telegraphed straight dashes) on the existing four plush species.
// enemyVariety:false draws no extra random numbers. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {Game,LIMITS,ENEMY_ROLES,roleChance,dashLength} from '../core.js';
import {createEnemyVisuals,ENEMY_VISUAL_LIMITS,LANE_WIDTH} from '../enemy-visuals.js';

function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function quiet(options={}){
 const g=new Game({random:seeded(3),map:0,autoEquip:true,...options});g.start();g.obstacles=[];
 g.drops.length=0;g.spawn=1e9;g.dropTimer=1e9;g.nextBossMinute=1e9;g.nextExp=1e9;g.fire=1e9;g.magicFire=1e9;
 return g;
}
function role(g,kind,dx,dz){
 const e={id:++g.serial,x:g.player.x+dx,z:g.player.z+dz,hp:1e9,type:2,speed:1,angle:0,role:kind};
 if(kind==='spitter'){e.roleTimer=0;e.aim=0;}else e.dash={phase:'chase',t:0,cooldown:0,dx:0,dz:0};
 g.enemies.push(e);return e;
}
function run(g,seconds,input={x:0,z:0}){for(let t=0;t<seconds-1e-9;t+=.05)g.step(.05,input);}

test('no roles before 30 s, then a growing, capped share; types stay 0–3',()=>{
 assert.equal(roleChance(0),0);assert.equal(roleChance(29.9),0);assert.equal(roleChance(30),ENEMY_ROLES.chance.base);
 assert.ok(roleChance(300)>roleChance(60));assert.equal(roleChance(1200),ENEMY_ROLES.chance.max);
 const g=new Game({random:seeded(8),map:0});g.start();g.time=900;for(let i=0;i<400;i++){g.spawnEnemy();if(g.enemies.length>=80)g.enemies.splice(0,40);}
 const counts={spitter:0,dasher:0};for(const e of g.enemies){assert.ok(e.type>=0&&e.type<=3);if(e.role)counts[e.role]++;}
 assert.ok(counts.spitter>0&&counts.dasher>0,JSON.stringify(counts));
 assert.ok(counts.spitter<=ENEMY_ROLES.maxAlive&&counts.dasher<=ENEMY_ROLES.maxAlive,'at most maxAlive of each role');
});

test('enemyVariety:false spawns no roles and draws exactly the V11 three numbers per spawn',()=>{
 let calls=0;const base=seeded(2),g=new Game({random:()=>{calls++;return base();},map:0,enemyVariety:false});g.start();g.time=900;
 const before=calls;for(let i=0;i<50;i++)g.spawnEnemy();assert.equal(calls-before,150);assert.ok(g.enemies.every(e=>!e.role));
 const on=new Game({random:()=>{calls++;return base();},map:0});on.start();on.time=900;const mid=calls;on.spawnEnemy();assert.equal(calls-mid,4,'one extra roll when on');
});

test('spitter: keeps its distance, flashes (aims) still, then lobs a warning at the player position',()=>{
 const g=quiet(),c=ENEMY_ROLES.spitter,e=role(g,'spitter',3,0);g.invuln=1e9;e.roleTimer=1e9;
 run(g,1);assert.ok(Math.hypot(e.x-g.player.x,e.z-g.player.z)>3.5,'backs away when too close');
 e.x=g.player.x+c.keep;e.z=g.player.z;e.roleTimer=0;e.aim=0;g.step(.05,{x:0,z:0});assert.ok(e.aim>0,'starts aiming');
 const x=e.x;let spit=null;for(let t=0;t<c.aim+.1&&!spit;t+=.05){g.step(.05,{x:0,z:0});spit=g.events.find(v=>v.kind==='spit');if(!spit)assert.equal(e.x,x,'stands still while aiming');}
 assert.ok(spit,'fires after the aim');const h=g.hazards.find(v=>v.kind==='spit');
 assert.equal(h.ownerId,e.id);assert.equal(h.radius,c.radius);assert.equal(h.windup,c.windup);assert.equal(h.damage,c.damage);
 assert.ok(Math.abs(h.x-g.player.x)<1e-9&&Math.abs(h.z-g.player.z)<1e-9);assert.ok(Math.abs(e.roleTimer-c.cooldown)<1e-9);
});

test('spit warning is honest: no damage during windup, full damage on the ring, none just outside',()=>{
 for(const [offset,expected] of [[0,true],[ENEMY_ROLES.spitter.radius+.3,true],[ENEMY_ROLES.spitter.radius+.45,false]]){
  const g=quiet(),e=role(g,'spitter',9,0);e.roleTimer=1e9;g.invuln=0;
  assert.ok(g.addSpit(e));const h=g.hazards[0];h.x=g.player.x+offset;h.z=g.player.z;const hp=g.player.hp;
  let hurtAt=null;for(let t=0;t<1.5;t+=.05){g.step(.05,{x:0,z:0});if(g.events.some(v=>v.kind==='hurt')&&hurtAt===null)hurtAt=h.age;}
  if(expected){assert.ok(hurtAt>=h.windup-1e-9,`no damage before the windup ends (${hurtAt})`);assert.equal(g.player.hp,hp-1);}
  else assert.equal(g.player.hp,hp,`offset ${offset} is outside`);
 }
});

test('spitters never take the last hazard slots: bosses keep their reserve',()=>{
 const g=quiet(),e=role(g,'spitter',9,0);
 let n=0;while(g.addSpit(e))n++;assert.equal(n,LIMITS.hazards-ENEMY_ROLES.spitter.reserve);
 assert.ok(g.spawnBoss('big',3));const boss=g.enemies.at(-1);
 assert.ok(g.addHazard(boss,0,0)&&g.addHazard(boss,1,0)&&g.addHazard(boss,2,0),'a big boss still lands all three');
});

test('rescuing a spitter removes its warnings',()=>{
 const g=quiet(),e=role(g,'spitter',9,0),other=role(g,'spitter',-9,0);g.addSpit(e);g.addSpit(other);
 g.rescueEnemy(e);assert.deepEqual(g.hazards.map(h=>h.ownerId),[other.id]);
});

test('dasher: stops and locks a direction, dashes straight for the lane length, then rests',()=>{
 const g=quiet(),c=ENEMY_ROLES.dasher,e=role(g,'dasher',0,-4);g.invuln=1e9;
 g.step(.05,{x:0,z:0});assert.equal(e.dash.phase,'windup');const {dx,dz}=e.dash,start={x:e.x,z:e.z};
 assert.ok(Math.abs(dx)<1e-9&&Math.abs(dz-1)<1e-9,'locked towards the player');
 // The player sidesteps during the windup: the direction does not follow.
 run(g,c.windup-.1,{x:1,z:0});assert.equal(e.dash.phase,'windup');assert.equal(e.x,start.x);assert.equal(e.dash.dx,dx);
 let steps=0;while(e.dash.phase!=='recover'&&steps<60){g.step(.05,{x:0,z:0});steps++;}
 const travelled=Math.hypot(e.x-start.x,e.z-start.z);assert.ok(Math.abs(travelled-dashLength())<.6,`travelled ${travelled.toFixed(2)}`);
 assert.ok(Math.abs(e.x-start.x)<1e-9,'a straight line along the locked direction');
 const rest={x:e.x,z:e.z};run(g,c.recover-.1);assert.equal(e.dash.phase,'recover');assert.equal(e.x,rest.x);assert.equal(e.z,rest.z);
 run(g,.2);assert.equal(e.dash.phase,'chase');assert.ok(e.dash.cooldown>0,'cooldown before the next dash');
});

test('a dash hurts on contact and a sidestep out of the lane avoids it',()=>{
 for(const dodge of [false,true]){
  const g=quiet(),e=role(g,'dasher',0,-4);g.invuln=0;const hp=g.player.hp;
  g.step(.05,{x:0,z:0});if(dodge){run(g,.6,{x:1,z:0});}
  run(g,2.5);
  if(dodge)assert.equal(g.player.hp,hp,'out of the lane');else assert.ok(g.player.hp<hp,'hit by the dash');
 }
});

test('a frozen game freezes role timers',()=>{
 const g=quiet(),s=role(g,'spitter',6.5,0),d=role(g,'dasher',0,-4);s.roleTimer=2;g.step(.05,{x:0,z:0});
 const snap=JSON.stringify([s.roleTimer,s.aim,d.dash]);
 for(const status of ['paused','upgrade','pickup']){g.status=status;run(g,5);assert.equal(JSON.stringify([s.roleTimer,s.aim,d.dash]),snap,status);}
});

test('visuals: one foot mark per role, lane matches the dash, spit ring matches the hit radius',()=>{
 const scene=new THREE.Scene(),v=createEnemyVisuals(THREE,scene),g=quiet();
 v.sync(g);assert.equal(v.root.parent,null,'nothing drawn without roles');
 const s=role(g,'spitter',6.5,0),d=role(g,'dasher',0,-4);g.step(.05,{x:0,z:0});g.addSpit(s);
 v.sync(g);assert.equal(v.root.parent,scene);assert.deepEqual(v.stats,{marks:2,spits:1,lanes:1,aiming:1},'the spitter is aiming');
 const lane=v.root.getObjectByName('Dash lane corridor'),m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
 lane.getMatrixAt(0,m);m.decompose(p,q,sc);assert.ok(Math.abs(sc.x-LANE_WIDTH)<1e-6);assert.ok(Math.abs(sc.z-(dashLength()+.42))<1e-6);
 const edge=v.root.getObjectByName('Spit exact hit edge');edge.getMatrixAt(0,m);m.decompose(p,q,sc);assert.ok(Math.abs(sc.x-ENEMY_ROLES.spitter.radius)<1e-6);
 const many=quiet();for(let i=0;i<ENEMY_VISUAL_LIMITS.lanes+4;i++){const e=role(many,'dasher',0,-2);e.dash={phase:'windup',t:.5,cooldown:0,dx:0,dz:1,x:e.x,z:e.z};}
 v.sync(many);assert.equal(v.stats.lanes,ENEMY_VISUAL_LIMITS.lanes,'lanes are capped');
 v.clear();assert.equal(v.root.parent,null);v.dispose();
});

test('boss visuals leave role warnings to enemy visuals',async()=>{
 const {createBossVisuals}=await import('../boss-visuals.js');const b=createBossVisuals(THREE,new THREE.Scene()),g=quiet(),e=role(g,'spitter',9,0);
 g.addSpit(e);b.sync(g);assert.equal(b.stats.hazards,0);
});

test('dash lane has a bounded, high-contrast frame and steady progress with pooled cleanup',()=>{
 const scene=new THREE.Scene(),v=createEnemyVisuals(THREE,scene),g=quiet();
 const e=role(g,'dasher',3,-2);e.dash={phase:'windup',t:ENEMY_ROLES.dasher.windup/2,dx:1,dz:0,x:3,z:-2};
 v.sync(g,{reduceMotion:true});
 const backing=v.root.getObjectByName('Dash lane corridor'),fill=v.root.getObjectByName('Dash lane fill'),edge=v.root.getObjectByName('Dash lane inset edge');
 const luminance=c=>.2126*c.r+.7152*c.g+.0722*c.b;
 assert.ok((luminance(edge.material.color)+.05)/(luminance(backing.material.color)+.05)>=10,'light frame contrasts with dark backing');
 assert.equal(edge.material.opacity,1);assert.ok(backing.material.opacity>=.85);assert.ok(fill.material.opacity>0);
 assert.equal(edge.material.depthWrite,false);assert.equal(edge.material.fog,false);assert.equal(edge.material.toneMapped,false);
 edge.geometry.computeBoundingBox();const box=edge.geometry.boundingBox;
 assert.ok(Math.abs(box.min.x+.5)<1e-6&&Math.abs(box.max.x-.5)<1e-6);
 assert.ok(Math.abs(box.min.z)<1e-6&&Math.abs(box.max.z-1)<1e-6,'frame stays inside corridor');
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
 edge.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
 assert.ok(Math.abs(scale.x-LANE_WIDTH)<1e-6&&Math.abs(scale.z-(dashLength()+.42))<1e-6);
 assert.ok(Math.abs(position.x-3)<1e-6&&Math.abs(position.z+2)<1e-6);
 const direction=new THREE.Vector3(0,0,1).applyQuaternion(rotation);assert.ok(direction.x>.999&&Math.abs(direction.z)<1e-6);
 fill.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert.ok(Math.abs(scale.z-(dashLength()+.42)/2)<1e-6);
 const before=edge.instanceMatrix.array.slice();g.time=100;v.sync(g,{reduceMotion:true});assert.deepEqual(edge.instanceMatrix.array,before,'no time-driven flashing or movement');
 const many=quiet();for(let i=0;i<ENEMY_VISUAL_LIMITS.lanes+4;i++){const d=role(many,'dasher',0,-2);d.dash={phase:'windup',t:.5,dx:0,dz:1,x:0,z:-2};}
 v.sync(many);assert.equal(edge.count,ENEMY_VISUAL_LIMITS.lanes);assert.equal(fill.count,edge.count);assert.equal(backing.count,edge.count);
 let geometryDisposed=0,materialDisposed=0;edge.geometry.addEventListener('dispose',()=>geometryDisposed++);edge.material.addEventListener('dispose',()=>materialDisposed++);
 v.clear();assert.equal(edge.count,0);assert.equal(edge.visible,false);assert.equal(v.root.parent,null);
 v.dispose();v.dispose();assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);
});
