import {Game,UPGRADES,ALLY} from './core.js';
import {WEAPONS,MAIN_WEAPONS} from './weapons.js';

// Shader warm-up (V12.5). three.js compiles a shader program the first time a
// material variant is drawn, and that frame waits for it: a late game measured
// 11 programs at the start and 30 a few minutes in, so the first boss, ally,
// telegraph, mine or magic sweep each stalled a frame. createWarmupGame() builds
// a throwaway game holding one of everything the presentation draws, using only
// the Game API and one ordinary step. main.js puts it in the scene for a single
// compile call while the start screen is up, then restores the real game.
// The staged game is never rendered, never stepped again and draws its own
// seeded random numbers, so the real run's random stream is untouched.

// Game events the presentation turns into effects that need their own materials.
export const WARMUP_EVENTS=Object.freeze(['magic','explosion','hit','rescue','allyShot']);

function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

export function createWarmupGame({map=0,heroId='pudding',muzzleOffset=null}={}){
 const g=new Game({random:seeded(1107),map,autoEquip:true,heroId});
 if(muzzleOffset)g.muzzleOffset={...muzzleOffset};
 g.start(); // the opening ring of weapon drops
 // Nothing spawns, levels up or hurts while staging.
 g.spawn=g.dropTimer=g.nextBossMinute=g.nextExp=g.invuln=1e9;
 const p=g.player;
 const plush=(type,dx,dz,extra={})=>{const e={id:++g.serial,x:p.x+dx,z:p.z+dz,hp:1e9,type,speed:0,angle:0,...extra};g.enemies.push(e);return e;};
 // Every weapon and one skill as a world drop.
 Object.keys(WEAPONS).forEach((id,i)=>{if(!g.drops.some(d=>d.weaponId===id))g.addDrop({kind:'weapon',weaponId:id,x:p.x-4+i*.8,z:p.z+5});});
 g.addDrop({kind:'upgrade',upgradeId:UPGRADES[0].id,x:p.x+4,z:p.z+5});
 // A helper from a rescued boss, then one boss of each kind with a warning that
 // is still winding up and one that is striking.
 g.spawnBoss('mini',1);g.rescueEnemy(g.enemies.find(e=>e.boss));
 g.spawnBoss('mini',2);g.spawnBoss('big',3);
 for(const boss of g.enemies.filter(e=>e.boss)){g.addHazard(boss,p.x+3,p.z-3);const h=g.addHazard(boss,p.x-3,p.z-3)&&g.hazards.at(-1);if(h)h.age=h.windup+.1;}
 // One ordinary step produces the frame effects: a mine explodes, the pulse bolt
 // and the moonlight sweep hit the plush in front, and the helper fires.
 plush(0,0,1.2);
 g.equipWeapon('bomber');g.fireMain();g.bombs[0].life=.01;
 g.equipWeapon('pulse');g.fire=0;g.magicFire=0;for(const a of g.allies){a.x=p.x+1;a.z=p.z;a.cooldown=0;}
 g.step(.05,{x:0,z:0});
 // Rescued plush of every species (rescue halos and the restored outfits).
 for(let type=0;type<4;type++)g.rescueEnemy(plush(type,1.5+type*.4,-1));
 // Enemy variety: a spitter aiming and its ground warning, a dasher locking its lane.
 const spitter=plush(1,6.5,0,{role:'spitter',roleTimer:9,aim:.3});g.addSpit(spitter);
 plush(2,0,-4,{role:'dasher',dash:{phase:'windup',t:.4,cooldown:0,dx:0,dz:1,x:p.x,z:p.z-4}});
 // A burning, slowed plush near the player and a mine about to go off.
 plush(3,2,1,{burn:3,burnPower:1,slow:2});
 g.equipWeapon('bomber');g.fireMain();if(g.bombs.length)g.bombs.at(-1).life=.2;
 // A bolt of every main-hand look, and the two-handed cannon held last.
 for(const id of MAIN_WEAPONS)if(id!=='bomber'){g.equipWeapon(id);g.fireMain();}
 g.equipWeapon('cannon');g.fireMain();
 return g;
}

// What a staged game contains, for tests and the QA hook.
export function warmupCoverage(g){
 const kinds=new Set(g.events.map(e=>e.kind));
 return {
  events:WARMUP_EVENTS.filter(k=>kinds.has(k)),
  bosses:[...new Set(g.enemies.filter(e=>e.boss).map(e=>e.boss))].sort(),
  allies:g.allies.length,
  rescuedTypes:[...new Set(g.rescued.map(e=>e.type))].sort(),
  roles:[...new Set(g.enemies.filter(e=>e.role).map(e=>e.role))].sort(),
  hazards:{warning:g.hazards.some(h=>h.age<h.windup),active:g.hazards.some(h=>h.age>=h.windup),spit:g.hazards.some(h=>h.kind==='spit')},
  drops:[...new Set(g.drops.map(d=>d.weaponId||'skill:'+d.upgradeId))].sort(),
  bolts:[...new Set(g.bullets.map(b=>b.weaponId))].sort(),
  bombs:g.bombs.length,burning:g.enemies.some(e=>e.burn>0),allyDuration:ALLY.duration,
 };
}

// Retry only on a later reset after an error, or when the shadow mode changes.
export function shouldWarmup(warmup,shadows){return warmup.shadows!==shadows||warmup.error!==null;}

// Ignore completions from an older compile or a different shadow configuration.
// Catch errors from both the compile promise and first-use uniform queries.
export function finishWarmup(done,{warmup,renderer,programs,run,shadows,t0}){
 const current=()=>run===warmup.runs&&shadows===renderer.shadowMap.enabled;
 return Promise.resolve(done).then(()=>{
  if(!current())return;
  for(const program of programs)if(!program.isReady||program.isReady())program.getUniforms?.();
  if(current()){warmup.ready=true;warmup.readyMs=performance.now()-t0;}
 }).catch(error=>{if(current())warmup.error=String(error?.message||error);});
}
