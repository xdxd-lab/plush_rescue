// Version 1: a read-only, deterministic projection of gameplay state. Keep this
// separate from sim-signature.mjs so its historical digest format stays fixed.
import {createHash} from 'node:crypto';

const number=value=>value===undefined?null:Number.isFinite(value)?Number(value.toFixed(5)):String(value);
const field=(object,key)=>object?.[key]===undefined?null:object[key];
const coord=(object,key)=>number(object?.[key]);

export function stateV1(game){
 const p=game.player;
 return {
  status:game.status,time:coord(game,'time'),reason:game.reason,
  flags:[game.bossAllies,game.upgradeVariety,game.enemyVariety],autoEquip:game.autoEquip,
  map:game.map,serial:game.serial,allySerial:game.allySerial,
  saved:game.saved,level:game.level,exp:game.exp,nextExp:game.nextExp,
  player:[coord(p,'x'),coord(p,'z'),p.hp,p.maxHp,coord(p,'speed'),coord(p,'angle')],
  timers:[coord(game,'invuln'),coord(game,'fire'),coord(game,'spawn'),coord(game,'magicFire'),coord(game,'dropTimer'),coord(game,'burstTimer'),game.burstLeft,game.nextBossMinute],
  combat:[coord(game,'power'),coord(game,'fireInterval'),coord(game,'pickupRange'),coord(game,'critChance'),coord(game,'critMeter'),game.crits,coord(game,'magicReach'),coord(game,'invulnTime')],
  loadout:[game.loadout.main,game.loadout.offhand,game.twoHanded,game.twoHandedWeapon,game.weaponLevels],
  magic:Object.entries(game.magicByWeapon).map(([id,m])=>[id,coord(m,'charge'),m.goal,m.evolved]),
  upgrades:[game.upgradePool,game.upgradeChoices],
  counters:[game.spits,game.dashes,game.allyRescues],
  pendingBoss:game.pendingBoss?[game.pendingBoss.kind,game.pendingBoss.minute]:null,
  pendingPickup:game.pendingPickup?[game.pendingPickup.id,game.pendingPickup.kind,game.pendingPickup.weaponId,game.pendingPickup.slot]:null,
  enemies:game.enemies.map(e=>[
   e.id,e.type,field(e,'boss'),field(e,'role'),coord(e,'x'),coord(e,'z'),coord(e,'hp'),coord(e,'maxHp'),coord(e,'speed'),coord(e,'angle'),coord(e,'radius'),
   coord(e,'skillTimer'),coord(e,'roleTimer'),coord(e,'aim'),
   e.dash?[e.dash.phase,coord(e.dash,'t'),coord(e.dash,'cooldown'),coord(e.dash,'dx'),coord(e.dash,'dz'),coord(e.dash,'x'),coord(e.dash,'z')]:null,
   coord(e,'burn'),coord(e,'burnPower'),coord(e,'slow'),e.detour?[e.detour.index,e.detour.side]:null
  ]),
  hazards:game.hazards.map(h=>[
   h.id,h.ownerId,field(h,'kind'),coord(h,'x'),coord(h,'z'),coord(h,'fromX'),coord(h,'fromZ'),coord(h,'radius'),coord(h,'age'),coord(h,'windup'),coord(h,'duration'),h.damage,h.hit
  ]),
  allies:game.allies.map(a=>[
   a.id,a.boss,a.type,coord(a,'bossRadius'),coord(a,'x'),coord(a,'z'),coord(a,'life'),coord(a,'leaving'),coord(a,'cooldown'),coord(a,'orbit'),a.rescues
  ]),
  rescued:game.rescued.map(e=>[e.id,e.type,field(e,'boss'),field(e,'role'),coord(e,'x'),coord(e,'z'),coord(e,'life'),coord(e,'angle')]),
  bullets:game.bullets.map(b=>[b.id,b.weaponId,coord(b,'x'),coord(b,'z'),coord(b,'vx'),coord(b,'vz'),coord(b,'life'),coord(b,'damage'),field(b,'crit'),coord(b,'burn'),coord(b,'splash')]),
  bombs:game.bombs.map(b=>[b.id,coord(b,'x'),coord(b,'z'),coord(b,'life'),coord(b,'radius'),coord(b,'damage'),field(b,'crit')]),
  drops:game.drops.map(d=>[d.id,d.kind,field(d,'weaponId'),field(d,'upgradeId'),coord(d,'x'),coord(d,'z'),coord(d,'life')])
 };
}

function seeded(seed){let state=seed>>>0;return()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};}
export function signatureV1(Game,seed,{autoEquip=false,bossAllies=false,upgradeVariety=false,enemyVariety=false,steps=7200}={}){
 const game=new Game({random:seeded(seed),map:seed%3,autoEquip,bossAllies,upgradeVariety,enemyVariety});
 game.start();
 const hash=createHash('sha256');
 const seen={boss:0,ally:0,spitter:0,dasher:0,spitHazard:0,bossHazard:0,hazardHit:0,allyShot:0,allyRescue:0,upgrade:0,varietyChoice:0,pickup:0};
 let replace=false;
 for(let i=0;i<steps;i++){
  game.invuln=1;
  const angle=i*.013;
  game.step(.05,{x:Math.cos(angle),z:Math.sin(angle*1.3)});
  if(game.status==='ended')break;
  for(const enemy of game.enemies){
   if(enemy.boss)seen.boss++;
   if(enemy.role==='spitter')seen.spitter++;
   if(enemy.role==='dasher')seen.dasher++;
  }
  for(const hazard of game.hazards){
   if(hazard.kind==='spit')seen.spitHazard++;else seen.bossHazard++;
   if(hazard.hit)seen.hazardHit++;
  }
  if(game.allies.length)seen.ally++;
  for(const event of game.events)if(event.kind==='allyShot')seen.allyShot++;
  if(game.allyRescues)seen.allyRescue=game.allyRescues;
  if(game.status==='upgrade'){
   seen.upgrade++;
   if(game.upgradeChoices.some(id=>!['power','rate','speed','heart'].includes(id)))seen.varietyChoice++;
   game.upgrade(game.upgradeChoices[game.level%game.upgradeChoices.length]);
  }
  if(game.status==='pickup'){
   seen.pickup++;
   replace=!replace;
   game.resolvePickup(replace);
  }
  if(i%20===0)hash.update(JSON.stringify([i,stateV1(game)]));
 }
 return {digest:hash.digest('hex'),seen};
}

// Forced branches complement the long script: each setup is explicit so a
// digest cannot pass merely because a rare branch never appeared.
export function targetedV1(Game){
 const game=new Game({random:seeded(19),map:0,autoEquip:true,bossAllies:true,upgradeVariety:true,enemyVariety:true});
 game.start();
 game.drops.length=0;game.spawn=1e9;game.dropTimer=1e9;game.nextBossMinute=1e9;
 game.nextExp=1e9;game.fire=1e9;game.magicFire=1e9;game.invuln=1e9;
 const hash=createHash('sha256');
 const seen={spitterAim:false,spitHazard:false,spitHit:false,dashWindup:false,dashActive:false,dashRecover:false,bossHazard:false,bossHit:false,allyShot:false,allyLife:false,allyCooldown:false};
 const tick=()=>{
  game.step(.05,{x:0,z:0});
  for(const enemy of game.enemies){
   if(enemy.aim>0)seen.spitterAim=true;
   if(enemy.dash?.phase==='windup')seen.dashWindup=true;
   if(enemy.dash?.phase==='dash')seen.dashActive=true;
   if(enemy.dash?.phase==='recover')seen.dashRecover=true;
  }
  for(const hazard of game.hazards){
   if(hazard.kind==='spit'){seen.spitHazard=true;if(hazard.hit)seen.spitHit=true;}
   else {seen.bossHazard=true;if(hazard.hit)seen.bossHit=true;}
  }
  if(game.events.some(e=>e.kind==='allyShot'))seen.allyShot=true;
  if(game.allies.some(a=>a.life<30))seen.allyLife=true;
  if(game.allies.some(a=>a.cooldown<.5))seen.allyCooldown=true;
  hash.update(JSON.stringify(stateV1(game)));
 };
 const spitter={id:++game.serial,x:game.player.x+5,z:game.player.z,hp:1e9,type:0,speed:0,angle:0,role:'spitter',roleTimer:.05,aim:0};
 game.enemies.push(spitter);
 for(let i=0;i<40;i++)tick();
 game.enemies.length=0;game.hazards.length=0;
 const dasher={id:++game.serial,x:game.player.x+3,z:game.player.z,hp:1e9,type:0,speed:0,angle:0,role:'dasher',dash:{phase:'chase',t:0,cooldown:0,dx:0,dz:0}};
 game.enemies.push(dasher);
 for(let i=0;i<55;i++)tick();
 game.enemies.length=0;game.hazards.length=0;
 game.spawnBoss('mini',1);
 const boss=game.enemies.at(-1);boss.x=game.player.x+2;boss.z=game.player.z;boss.speed=0;boss.skillTimer=.05;
 for(let i=0;i<40;i++)tick();
 game.rescueEnemy(boss);
 game.hazards.length=0;
 const target={id:++game.serial,x:game.player.x+1,z:game.player.z,hp:1e9,type:0,speed:0,angle:0};
 game.enemies.push(target);
 for(let i=0;i<30;i++)tick();
 return {digest:hash.digest('hex'),seen};
}
