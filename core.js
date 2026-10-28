import {WEAPONS,MAIN_WEAPONS,OFFHAND_WEAPONS,weaponMultiplier} from './weapons.js';
export const LIMITS={enemies:90,bullets:100,rescued:24,particles:100,drops:16,bombs:12,bosses:2,hazards:8,duration:1200};
export const PROJECTILE=Object.freeze({speed:16,life:1.2});
export const SPAWN_MULTIPLIER=4;
export const ENEMY_HP_MULTIPLIER=4;
export function enemyHealth(time){return ENEMY_HP_MULTIPLIER*(2+Math.floor(time/90));}
export function bossHealth(kind,time){return enemyHealth(time)*(kind==='big'?40:12);}
export function bossKind(minute){return minute%3===0?'big':'mini';}
// A rescued boss shrinks into a small helper for ALLY.duration seconds of game
// time (frozen while paused or choosing), then leaves happily over ALLY.leave.
// Damage is a small share of the current enemy health: symbolic, not a weapon.
// No capacity cap: at most one boss per minute exists, so at most a few helpers
// overlap and every helper serves its full time. Allies never call this.random().
export const ALLY=Object.freeze({duration:30,leave:.8,orbit:1.7,speed:6.5,range:6,interval:.7,firstShot:.5,share:Object.freeze({mini:.1,big:.15})});
export function spawnInterval(time){return Math.max(.18,1.05-time/500)/SPAWN_MULTIPLIER;}
// Solve the interception from the rotating, off-centre muzzle, not the body.
// Bolts have world-space velocity: the shooter's motion is NOT inherited.
export function interceptTarget(player,target,velocity,muzzle={x:0,z:.6}){
 const rx=target.x-player.x,rz=target.z-player.z,vx=velocity.x,vz=velocity.z;
 const mx=muzzle.x,mz=muzzle.z,s=PROJECTILE.speed;
 if(Math.hypot(rx,rz)<=Math.hypot(mx,mz)+.6)return {angle:Math.atan2(rx,rz),time:0};
 const a=vx*vx+vz*vz-s*s,b=2*(rx*vx+rz*vz-mz*s),c=rx*rx+rz*rz-mx*mx-mz*mz;
 let roots=[];
 if(Math.abs(a)<1e-10){if(Math.abs(b)>1e-10)roots=[-c/b];}
 else{const disc=b*b-4*a*c;if(disc>=0){const q=Math.sqrt(disc);roots=[(-b-q)/(2*a),(-b+q)/(2*a)];}}
 const time=roots.filter(t=>Number.isFinite(t)&&t>=0&&t<=PROJECTILE.life).sort((a,b)=>a-b)[0];
 if(time===undefined)return null;
 return {time,angle:Math.atan2(rx+vx*time,rz+vz*time)-Math.atan2(mx,mz+s*time)};
}
export const UPGRADES=[{id:'power',icon:'✦',name:'暖心光束',description:'光束力量 +35%'},{id:'rate',icon:'ϟ',name:'星光連發',description:'發射速度 +20%'},{id:'speed',icon:'➜',name:'輕盈腳步',description:'移動速度 +15%，恢復 1 顆心'},{id:'heart',icon:'♡',name:'柔軟守護',description:'最大生命 +1，恢復 2 顆心'}];
export function healthLabel(hp,maxHp){return maxHp>6?`♥ ${Math.max(0,hp)} / ${maxHp}`:'♥'.repeat(Math.max(0,hp))+'♡'.repeat(maxHp-Math.max(0,hp));}
// Return the first intersection along a finite segment, including a start point
// already inside the target. This avoids tunnelling at low frame rates.
export function segmentCircleHit(ax,az,bx,bz,cx,cz,r){
 const dx=bx-ax,dz=bz-az,fx=ax-cx,fz=az-cz,c=fx*fx+fz*fz-r*r;
 if(c<=0)return 0;
 const a=dx*dx+dz*dz;if(a<1e-14)return null;
 const b=2*(fx*dx+fz*dz),disc=b*b-4*a*c;if(disc<0)return null;
 const t=(-b-Math.sqrt(disc))/(2*a);return t>=-1e-10&&t<=1+1e-10?Math.max(0,Math.min(1,t)):null;
}
function nearestSegmentHit(enemies,ax,az,bx,bz,motions=null,fraction=1){
 let hit=null;
 for(let index=0;index<enemies.length;index++){
  const enemy=enemies[index],motion=motions?.get(enemy),t=segmentCircleHit(ax,az,bx-(motion?.dx||0)*fraction,bz-(motion?.dz||0)*fraction,enemy.x,enemy.z,(enemy.radius??.38)+.22);
  if(t===null)continue;const distance=(enemy.x-ax)**2+(enemy.z-az)**2;
  if(!hit||t<hit.t-1e-10||(Math.abs(t-hit.t)<1e-10&&distance<hit.distance))hit={index,enemy,t,distance};
 }
 return hit;
}
export class Game{
 constructor({random=Math.random,map=null,obstacles=[],muzzleOffset={x:0,y:.65,z:.6},autoEquip=false,heroId='pudding',bossAllies=true}={}){this.bossAllies=Boolean(bossAllies);this.allies=[];this.allySerial=0;this.allyRescues=0;this.heroId=heroId==='polar'?'polar':'pudding';this.muzzleOffset={...muzzleOffset};this.random=random;this.map=map??Math.min(2,Math.floor(random()*3));this.obstacles=obstacles;this.bounds=18;this.status='ready';this.time=0;this.player={x:0,z:4,hp:5,maxHp:5,speed:4.6,angle:Math.PI};this.enemies=[];this.bullets=[];this.rescued=[];this.events=[];this.level=1;this.exp=0;this.nextExp=8;this.saved=0;this.power=1;this.fireInterval=.28;this.fire=0;this.spawn=.2/SPAWN_MULTIPLIER;this.targetId=null;this.invuln=0;this.serial=0;this.reason='';this.loadout={main:'pulse',offhand:'moonfan'};this.twoHanded=null;this.twoHandedWeapon=null;this.weaponLevels=Object.fromEntries(Object.keys(WEAPONS).map(id=>[id,id==='pulse'||id==='moonfan'?1:0]));this.magicByWeapon=Object.fromEntries(OFFHAND_WEAPONS.map(id=>[id,{charge:0,goal:12,evolved:false}]));this.magic=this.magicByWeapon.moonfan;this.magicFire=3;this.nextBossMinute=1;this.pendingBoss=null;this.hazards=[];this.drops=[];this.bombs=[];this.pendingPickup=null;this.autoEquip=Boolean(autoEquip);this.dropTimer=18;this.burstLeft=0;this.burstTimer=0;}
 start(){if(this.status==='ready'){this.status='running';for(const [weaponId,dx,dz] of [['shotgun',-2.7,0],['burst',2.7,0],['frostwand',0,-3.2],['ember',-3.4,-3.4],['bomber',3.4,-3.4],['cannon',0,4]])this.addDrop({kind:'weapon',weaponId,x:this.player.x+dx,z:this.player.z+dz});}}
 pause(){if(this.status==='running')this.status='paused';}
 resume(){if(this.status==='paused')this.status='running';}
 end(reason){this.reason=reason;this.status='ended';this.pendingPickup=null;this.burstLeft=0;}
 applyUpgrade(id){if(id==='power')this.power*=1.35;else if(id==='rate')this.fireInterval=Math.max(.075,this.fireInterval*.8);else if(id==='speed'){this.player.speed=Math.min(8,this.player.speed*1.15);this.player.hp=Math.min(this.player.maxHp,this.player.hp+1);}else if(id==='heart'){this.player.maxHp=Math.min(12,this.player.maxHp+1);this.player.hp=Math.min(this.player.maxHp,this.player.hp+2);}else return false;return true;}
 upgrade(id){if(this.status!=='upgrade'||!this.applyUpgrade(id))return;this.continueChoices();}
 continueChoices(){this.status='running';if(this.exp>=this.nextExp)this.levelUp();else this.collectDrops();}
 addDrop(data){
  if(this.drops.length>=LIMITS.drops)return null;
  if(data.kind==='weapon'&&!WEAPONS[data.weaponId]||data.kind==='upgrade'&&!UPGRADES.some(u=>u.id===data.upgradeId))return null;
  if(data.kind!=='weapon'&&data.kind!=='upgrade')return null;
  const d={...data,id:++this.serial,life:35};this.move(d,0,0,.5);this.drops.push(d);return d;
 }
 chargeMagic(amount){if(this.twoHanded)return;this.magic.charge=Math.min(this.magic.goal,this.magic.charge+amount);if(this.magic.charge>=this.magic.goal)this.magic.evolved=true;}
 weaponLevel(id){return Math.max(1,this.weaponLevels[id]??0);}
 weaponPower(id){return weaponMultiplier(this.weaponLevel(id));}
 strengthenWeapon(id){if(!WEAPONS[id])return null;const before=this.weaponLevels[id]??0;this.weaponLevels[id]=before+1;return {before,after:this.weaponLevels[id]};}
 equipWeapon(id){
  const weapon=WEAPONS[id];if(!weapon)return false;
  if(weapon.slot==='twohand'){this.twoHandedWeapon=id;this.twoHanded=id;this.burstLeft=0;return true;}
  this.twoHanded=null;this.loadout[weapon.slot]=id;
  if(weapon.slot==='main')this.burstLeft=0;
  else {this.magic=this.magicByWeapon[id];this.magicFire=Math.max(this.magicFire,.6);}
  return true;
 }
 stowTwoHanded(){if(this.status!=='running'&&this.status!=='paused')return false;if(!this.twoHanded)return false;this.twoHanded=null;this.burstLeft=0;return true;}
 toggleTwoHanded(){if((this.status!=='running'&&this.status!=='paused')||!this.twoHandedWeapon)return false;this.twoHanded=this.twoHanded?null:this.twoHandedWeapon;this.burstLeft=0;return true;}
 // Applies one drop already removed from this.drops. Returns true when it opened
 // the pickup comparison, so serialized pickups stop until the player decides.
 takeDrop(drop){
  if(drop.kind==='upgrade'){this.applyUpgrade(drop.upgradeId);this.events.push({kind:'skill',x:drop.x,z:drop.z,upgradeId:drop.upgradeId});return false;}
  const levelChange=this.strengthenWeapon(drop.weaponId);
  if(this.autoEquip){this.equipWeapon(drop.weaponId);return false;}
  this.pendingPickup={...drop,levelChange,slot:WEAPONS[drop.weaponId].slot};this.status='pickup';return true;
 }
 collectDrops(){
  if(this.status!=='running')return;
  for(let i=0;i<this.drops.length;){const drop=this.drops[i];if(Math.hypot(drop.x-this.player.x,drop.z-this.player.z)>.95){i++;continue;}
   this.drops.splice(i,1);
   if(this.takeDrop(drop))return;
  }
 }
 // A deliberate tap on a drop. V12.1.1: there is no distance limit; the
 // presentation layer only offers drops that are actually on screen. An expired
 // drop is never taken. Proximity pickup (collectDrops) stays as is.
 tapPickup(id){
  if(this.status!=='running')return false;
  const index=this.drops.findIndex(drop=>drop.id===id);if(index<0)return false;
  const drop=this.drops[index];
  if(!(drop.life>0))return false;
  this.drops.splice(index,1);this.takeDrop(drop);return true;
 }
 resolvePickup(replace){if(this.status!=='pickup'||!this.pendingPickup)return false;const pickup=this.pendingPickup;this.pendingPickup=null;if(replace===true)this.equipWeapon(pickup.weaponId);this.continueChoices();return true;}
 rescueEnemy(enemy){
  const index=this.enemies.indexOf(enemy);if(index<0)return;
  this.enemies.splice(index,1);if(enemy.boss){for(let i=this.hazards.length-1;i>=0;i--)if(this.hazards[i].ownerId===enemy.id)this.hazards.splice(i,1);}this.saved++;this.exp++;this.chargeMagic(1);this.events.push({kind:'rescue',x:enemy.x,z:enemy.z});
  const angle=this.random()*Math.PI*2;
  if(enemy.boss&&this.bossAllies)this.addAlly(enemy,angle);
  else{if(this.rescued.length>=LIMITS.rescued)this.rescued.shift();this.rescued.push({...enemy,life:4,angle});}
  const roll=this.random();if(roll<.02)this.addDrop({kind:'upgrade',upgradeId:UPGRADES[Math.min(UPGRADES.length-1,Math.floor(this.random()*UPGRADES.length))].id,x:enemy.x,z:enemy.z});
  else if(roll<.09){const ids=[...MAIN_WEAPONS,...OFFHAND_WEAPONS,'cannon'];this.addDrop({kind:'weapon',weaponId:ids[Math.min(ids.length-1,Math.floor(this.random()*ids.length))],x:enemy.x,z:enemy.z});}
 }
 addAlly(boss,angle){
  // Allies circle at the same rate; a golden-angle offset from the first keeps
  // helpers that join together apart.
  const first=this.allies[0],orbit=first?first.orbit+this.allies.length*2.399963:angle;
  const ally={id:++this.allySerial,boss:boss.boss,type:boss.type,bossRadius:boss.radius,x:boss.x,z:boss.z,life:ALLY.duration,leaving:0,cooldown:ALLY.firstShot,orbit,rescues:0};this.allies.push(ally);this.events.push({kind:'ally',id:ally.id,boss:ally.boss,x:ally.x,z:ally.z});return ally;}
 stepAllies(dt){
  for(let i=this.allies.length-1;i>=0;i--){
   const a=this.allies[i];
   if(a.life>0){a.life=Math.max(0,a.life-dt);if(a.life===0){a.leaving=ALLY.leave;this.events.push({kind:'allyLeave',id:a.id,boss:a.boss,x:a.x,z:a.z});}}
   else{a.leaving-=dt;if(a.leaving<=0){this.allies.splice(i,1);continue;}}
   a.orbit+=dt*.9;
   let dx,dz;
   if(a.life>0){dx=this.player.x+Math.sin(a.orbit)*ALLY.orbit-a.x;dz=this.player.z+Math.cos(a.orbit)*ALLY.orbit-a.z;}
   else{dx=a.x-this.player.x;dz=a.z-this.player.z;}
   const d=Math.hypot(dx,dz),step=Math.min(d,(a.life>0?ALLY.speed:1.2)*dt);
   if(d>1e-6)this.move(a,dx/d*step,dz/d*step,.3);
   if(!(a.life>0))continue;
   a.cooldown-=dt;if(a.cooldown>0)continue;
   let target=null,best=ALLY.range*ALLY.range;
   for(const e of this.enemies){if(e.boss)continue;const q=(e.x-a.x)**2+(e.z-a.z)**2;if(q<=best){best=q;target=e;}}
   if(!target){a.cooldown=0;continue;}
   a.cooldown=ALLY.interval;this.events.push({kind:'allyShot',id:a.id,boss:a.boss,x:a.x,z:a.z,tx:target.x,tz:target.z});
   const before=this.saved;this.damageEnemy(target,enemyHealth(this.time)*(ALLY.share[a.boss]??ALLY.share.mini));
   if(this.saved>before){a.rescues++;this.allyRescues++;}
  }
 }
 damageEnemy(enemy,damage){enemy.hp-=damage;if(enemy.hp<=0)this.rescueEnemy(enemy);}
 fireMain(){
  const w=WEAPONS[this.twoHanded||this.loadout.main],angle=this.player.angle;
  if(w.id==='bomber'){
   if(this.bombs.length<LIMITS.bombs){const bomb={id:++this.serial,x:this.player.x+Math.sin(angle)*2.2,z:this.player.z+Math.cos(angle)*2.2,life:1.2,radius:2.5,damage:w.damage*this.power*this.weaponPower(w.id)};this.move(bomb,0,0,.2);this.bombs.push(bomb);this.events.push({kind:'shot'});}return;
  }
  const offsets=w.id==='shotgun'?[-.26,-.13,0,.13,.26]:[0];
  for(const offset of offsets){if(this.bullets.length>=LIMITS.bullets)break;const a=angle+offset;this.bullets.push({id:++this.serial,weaponId:w.id,damage:w.damage*this.power*this.weaponPower(w.id),burn:w.id==='ember'?this.power*this.weaponPower(w.id):0,splash:w.id==='cannon'?3:0,x:this.player.x+Math.cos(angle)*this.muzzleOffset.x+Math.sin(angle)*this.muzzleOffset.z,y:this.muzzleOffset.y,z:this.player.z-Math.sin(angle)*this.muzzleOffset.x+Math.cos(angle)*this.muzzleOffset.z,birthX:this.player.x,birthZ:this.player.z,vx:Math.sin(a)*PROJECTILE.speed,vz:Math.cos(a)*PROJECTILE.speed,life:PROJECTILE.life});}
  this.events.push({kind:'shot'});
 }
 castMagic(){
  const id=this.loadout.offhand,evolved=this.magic.evolved,frost=id==='frostwand',radius=evolved?8:5.5,halfAngle=evolved?Math.PI*.58:Math.PI*.36,damage=(frost?2.5:4)*(evolved?2:1)*this.power*this.weaponPower(id);
  this.events.push({kind:'magic',weaponId:id,x:this.player.x,z:this.player.z,angle:this.player.angle,radius,halfAngle,evolved});
  for(const e of [...this.enemies]){const dx=e.x-this.player.x,dz=e.z-this.player.z,d=Math.hypot(dx,dz),dot=(dx*Math.sin(this.player.angle)+dz*Math.cos(this.player.angle))/Math.max(d,1e-8);if(d<=radius+(e.radius??.38)&&(d<.8||dot>=Math.cos(halfAngle))){if(frost)e.slow=Math.max(e.slow||0,evolved?3:1.8);this.damageEnemy(e,damage);}}
 }
 levelUp(){this.exp-=this.nextExp;this.level++;this.nextExp=Math.round(this.nextExp*1.35);this.status='upgrade';}
 move(entity,dx,dz,r=.4){entity.x=Math.max(-this.bounds+r,Math.min(this.bounds-r,entity.x+dx));entity.z=Math.max(-this.bounds+r,Math.min(this.bounds-r,entity.z+dz));for(const o of this.obstacles){let x=entity.x-o.x,z=entity.z-o.z,d=Math.hypot(x,z),min=o.r+r;if(d<min){if(d<.001){x=1;z=0;d=1;}entity.x=o.x+x/d*min;entity.z=o.z+z/d*min;}}entity.x=Math.max(-this.bounds+r,Math.min(this.bounds-r,entity.x));entity.z=Math.max(-this.bounds+r,Math.min(this.bounds-r,entity.z));}
 steerEnemy(e){
  const dx=this.player.x-e.x,dz=this.player.z-e.z,d=Math.hypot(dx,dz);
  if(d<.001)return{x:0,z:0};
  // Follow one side of a blocking round prop until there is clear line of sight.
  // Persisting the side avoids the symmetric fountain deadlock and frame-to-frame flips.
  const blocked=this.obstacles.map((o,index)=>{const t=Math.max(0,Math.min(1,((o.x-e.x)*dx+(o.z-e.z)*dz)/(d*d)));return{index,o,t,hit:t>0&&t<1&&Math.hypot(e.x+dx*t-o.x,e.z+dz*t-o.z)<o.r+.45};}).filter(v=>v.hit).sort((a,b)=>a.t-b.t);
  if(!blocked.length){delete e.detour;return{x:dx/d,z:dz/d};}
  let route=e.detour;
  if(!route||!blocked.some(b=>b.index===route.index)){
   const b=blocked[0],ox=e.x-b.o.x,oz=e.z-b.o.z,od=Math.hypot(ox,oz);
   if(od>b.o.r+1.2)return{x:dx/d,z:dz/d};
   const preference=-oz*dx+ox*dz;
   route=e.detour={index:b.index,side:Math.abs(preference)<1e-6?(e.id%2?1:-1):Math.sign(preference)};
  }
  const o=this.obstacles[route.index];let ox=e.x-o.x,oz=e.z-o.z,od=Math.hypot(ox,oz);
  if(od<.001){ox=1;oz=0;od=1;}
  const nx=ox/od,nz=oz/od,radial=(o.r+.70-od)*2;
  let x=-nz*route.side+nx*radial,z=nx*route.side+nz*radial,len=Math.hypot(x,z);
  return{x:x/len,z:z/len};
 }
 spawnEnemy(){let ordinary=0;for(const e of this.enemies)if(!e.boss)ordinary++;if(ordinary>=LIMITS.enemies)return;const a=this.random()*Math.PI*2;let e={id:++this.serial,x:this.player.x+Math.sin(a)*13,z:this.player.z+Math.cos(a)*13,hp:enemyHealth(this.time),type:Math.floor(this.random()*4),speed:.65+Math.min(1.15,this.time/380)+this.random()*.25,angle:0};this.move(e,0,0);this.enemies.push(e);}
 spawnBoss(kind,minute){
  let count=0;for(const e of this.enemies)if(e.boss)count++;
  if(count>=LIMITS.bosses)return false;
  const a=this.random()*Math.PI*2,radius=kind==='big'?1.5:1;
  const hp=bossHealth(kind,minute*60),e={id:++this.serial,boss:kind,minute,radius,maxHp:hp,hp,type:kind==='big'?3:1,x:this.player.x+Math.sin(a)*12,z:this.player.z+Math.cos(a)*12,speed:kind==='big'?.58:.8,angle:0,skillTimer:3};
  this.move(e,0,0,radius);this.enemies.push(e);this.events.push({kind:'boss',boss:kind});return true;
 }
 scheduleBosses(){
  while(this.time+1e-9>=this.nextBossMinute*60){
   const minute=this.nextBossMinute++,kind=bossKind(minute);
   if(!this.pendingBoss||kind==='big'||this.pendingBoss.kind!=='big')this.pendingBoss={kind,minute};
  }
  if(this.pendingBoss&&this.spawnBoss(this.pendingBoss.kind,this.pendingBoss.minute))this.pendingBoss=null;
 }
 addHazard(owner,x,z){
  if(this.hazards.length>=LIMITS.hazards)return false;
  this.hazards.push({id:++this.serial,ownerId:owner.id,x,z,radius:owner.boss==='big'?2.3:1.7,age:0,windup:owner.boss==='big'?1.4:1.2,duration:.55,damage:2,hit:false});return true;
 }
 stepBossSkills(dt){
  for(const e of this.enemies)if(e.boss){e.skillTimer-=dt;if(e.skillTimer<=0&&Math.hypot(e.x-this.player.x,e.z-this.player.z)<=12){e.skillTimer=e.boss==='big'?4.5:5.5;this.addHazard(e,this.player.x,this.player.z);if(e.boss==='big'){this.addHazard(e,this.player.x+3.8,this.player.z);this.addHazard(e,this.player.x-3.8,this.player.z);}}}
  for(let i=this.hazards.length-1;i>=0;i--){const h=this.hazards[i];h.age+=dt;if(h.age>=h.windup+h.duration)this.hazards.splice(i,1);}
 }
 hurtPlayer(damage){if(this.invuln>0||this.status!=='running')return false;this.player.hp=Math.max(0,this.player.hp-damage);this.invuln=1.25;this.events.push({kind:'hurt'});if(this.player.hp<=0)this.end('fallen');return true;}
 step(dt,input={x:0,z:0}){this.events.length=0;if(this.status!=='running')return;dt=Math.min(.05,Math.max(0,dt));this.time=Math.min(LIMITS.duration,this.time+dt);if(this.time>=LIMITS.duration){this.end('survived');return;}this.invuln=Math.max(0,this.invuln-dt);let mag=Math.hypot(input.x||0,input.z||0);if(mag>0)this.move(this.player,(input.x||0)/Math.max(1,mag)*this.player.speed*dt,(input.z||0)/Math.max(1,mag)*this.player.speed*dt);
 // Consume every scheduled attempt, including capped attempts; never bank a burst.
 this.spawn-=dt;while(this.spawn<=1e-10){this.spawnEnemy();this.spawn+=spawnInterval(this.time+this.spawn);}
 this.scheduleBosses();this.stepBossSkills(dt);
 // World pickups and periodic caches share the same hard cap and lifetime.
 this.dropTimer-=dt;if(this.dropTimer<=0){this.dropTimer+=18;const ids=[...MAIN_WEAPONS,...OFFHAND_WEAPONS,'cannon'],a=this.random()*Math.PI*2;this.addDrop({kind:'weapon',weaponId:ids[Math.min(ids.length-1,Math.floor(this.random()*ids.length))],x:this.player.x+Math.sin(a)*4,z:this.player.z+Math.cos(a)*4});}
 for(let i=this.drops.length-1;i>=0;i--){this.drops[i].life-=dt;if(this.drops[i].life<=0)this.drops.splice(i,1);}
 for(const e of [...this.enemies]){if(e.burn>0){const burnDt=Math.min(dt,e.burn);e.burn-=burnDt;this.damageEnemy(e,(e.burnPower||1)*2*burnDt);}e.slow=Math.max(0,(e.slow||0)-dt);}
 for(let i=this.bombs.length-1;i>=0;i--){const b=this.bombs[i];b.life-=dt;if(b.life<=0){this.bombs.splice(i,1);this.events.push({kind:'explosion',x:b.x,z:b.z,radius:b.radius});for(const e of [...this.enemies])if(Math.hypot(e.x-b.x,e.z-b.z)<=b.radius+(e.radius??.38))this.damageEnemy(e,b.damage);}}
 const motions=new Map();
 for(const e of this.enemies){
  const steering=this.steerEnemy(e),next={x:e.x,z:e.z};
  this.move(next,steering.x*e.speed*(e.slow>0?.45:1)*dt,steering.z*e.speed*(e.slow>0?.45:1)*dt,e.radius??.38);
  motions.set(e,{dx:next.x-e.x,dz:next.z-e.z,x:dt>0?(next.x-e.x)/dt:steering.x*e.speed,z:dt>0?(next.z-e.z)/dt:steering.z*e.speed});
 }
 // No sticky lock: re-evaluate current distances and reachable intercepts each tick.
 let nearest=null,aim=null,nd=Infinity;for(const e of this.enemies){
  const d=Math.hypot(e.x-this.player.x,e.z-this.player.z);if(d>=nd)continue;
  const solution=interceptTarget(this.player,e,motions.get(e),this.muzzleOffset);
  if(solution){nearest=e;nd=d;aim=solution;}
 }
 this.targetId=nearest?.id??null;
 if(aim)this.player.angle=aim.angle;else if(mag)this.player.angle=Math.atan2(input.x,input.z);
 if(!this.twoHanded)this.magicFire-=dt;if(!this.twoHanded&&this.magicFire<=0&&nearest){this.magicFire=this.magic.evolved?1.8:3;this.castMagic();}
 this.fire-=dt;this.burstTimer-=dt;
 if(this.burstLeft>0&&this.burstTimer<=0){this.fireMain();this.burstLeft--;this.burstTimer+=.085;}
 if(this.fire<=0){this.fire+=Math.max(!this.twoHanded&&this.loadout.main==='burst'?.26:0,this.fireInterval*WEAPONS[this.twoHanded||this.loadout.main].cadence);this.fireMain();if(!this.twoHanded&&this.loadout.main==='burst'){this.burstLeft=2;this.burstTimer=.085;}}
 for(let i=this.bullets.length-1;i>=0;i--){
  const b=this.bullets[i],ax=b.x,az=b.z,travelDt=Math.min(dt,Math.max(0,b.life)),bx=ax+b.vx*travelDt,bz=az+b.vz*travelDt;
  // The visible bolt begins at the real muzzle. On its first tick only, also
  // sweep the short body-to-muzzle reach so hugging enemies cannot hide inside
  // the barrel. This still selects exactly one nearest target, never an area hit.
  let hit=Number.isFinite(b.birthX)?nearestSegmentHit(this.enemies,b.birthX,b.birthZ,ax,az):null;
  delete b.birthX;delete b.birthZ;
  if(!hit)hit=nearestSegmentHit(this.enemies,ax,az,bx,bz,motions,dt>0?travelDt/dt:0);
  b.x=bx;b.z=bz;b.life-=dt;
  if(hit){
   const e=hit.enemy;{const dx=ax-e.x,dz=az-e.z,d=Math.hypot(dx,dz)||1,r=Math.min(d,e.radius??.38);this.events.push({kind:'hit',weaponId:b.weaponId,x:e.x+dx/d*r,z:e.z+dz/d*r,vx:b.vx,vz:b.vz});}
   if(b.burn){e.burn=3;e.burnPower=Math.max(e.burnPower||0,b.burn);}if(b.splash){this.events.push({kind:'explosion',weaponId:b.weaponId,x:e.x,z:e.z,radius:b.splash});for(const target of [...this.enemies])if(Math.hypot(target.x-e.x,target.z-e.z)<=b.splash+(target.radius??.38))this.damageEnemy(target,b.damage??this.power);}else this.damageEnemy(e,b.damage??this.power);b.life=0;
  }
  if(b.life<=0||Math.abs(b.x)>19||Math.abs(b.z)>19)this.bullets.splice(i,1);
 }
 if(this.allies.length)this.stepAllies(dt);
 let contactDamage=0;
 for(const e of this.enemies){const motion=motions.get(e);e.x+=motion.dx;e.z+=motion.dz;const dx=this.player.x-e.x,dz=this.player.z-e.z,d=Math.hypot(dx,dz);e.angle=Math.atan2(dx,dz);if(d<(e.radius??.38)+.42)contactDamage=Math.max(contactDamage,e.boss?2:1);}
 for(const h of this.hazards)if(!h.hit&&h.age>=h.windup&&Math.hypot(h.x-this.player.x,h.z-this.player.z)<=h.radius+.35){h.hit=true;contactDamage=Math.max(contactDamage,h.damage);}
 if(contactDamage)this.hurtPlayer(contactDamage);if(this.status==='ended')return;
 for(let i=this.rescued.length-1;i>=0;i--){const e=this.rescued[i];e.life-=dt;this.move(e,Math.sin(e.angle)*dt*.65,Math.cos(e.angle)*dt*.65);if(e.life<=0)this.rescued.splice(i,1);}
 if(this.exp>=this.nextExp)this.levelUp();else this.collectDrops();
 }
}
export class Stick{
 constructor(){this.id=null;this.x=0;this.z=0;this.origin={x:0,y:0};}
 begin(id,x,y){if(this.id!==null)return false;this.id=id;this.origin={x,y};this.x=this.z=0;return true;}
 move(id,x,y){if(this.id===null||id!==this.id)return false;let dx=x-this.origin.x,dy=y-this.origin.y,len=Math.hypot(dx,dy),scale=Math.max(48,len);this.x=dx/scale;this.z=dy/scale;return true;}
 end(id){if(this.id===null||id!==this.id)return false;this.reset();return true;}
 reset(){this.id=null;this.x=this.z=0;}
}
