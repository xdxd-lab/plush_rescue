import * as THREE from './vendor/three.module.js';
import {cameraFocus} from './camera.js';
import {bossVisualScale} from './boss-visuals.js';

export function createRenderSync({scene,getGame,getHero,crowd,weaponVisuals,bossVisuals,enemyVisuals,allyVisuals,shotVisuals,fx,enemies,rescued,bullets,enemyPool,freePool,bulletPool,bulletGeometry,bulletMaterial,bulletGlowMaterial,ordinaryEnemies,camera,cameraTarget,cameraDelta,fill,sun,reduceMotion,getSize,makePlush,positionCameraFill}){
function makeBullet(){const group=new THREE.Group(),core=new THREE.Mesh(bulletGeometry,bulletMaterial),glow=new THREE.Mesh(bulletGeometry,bulletGlowMaterial);core.scale.set(.05,.05,.24);glow.scale.set(.12,.12,.35);group.add(glow,core);return group;}
function releaseAll(collection,pool){for(const obj of collection.values()){scene.remove(obj.mesh);pool(obj);}collection.clear();}
// Every world visual of the current game goes back to its pool (reset and shader warm-up).
function clearWorld(){crowd.clear();weaponVisuals.clear();bossVisuals.clear();enemyVisuals.clear();allyVisuals.clear();shotVisuals.clear();releaseAll(enemies,o=>enemyPool[o.type].push(o.mesh));releaseAll(rescued,o=>freePool[o.type].push(o.mesh));releaseAll(bullets,o=>bulletPool.push(o.mesh));fx.clear();}
function syncCollection(entities,collection,kind){const game=getGame();const ids=new Set(entities.map(e=>e.id));for(const[id,o]of collection){if(!ids.has(id)){scene.remove(o.mesh);if(kind==='bullet')bulletPool.push(o.mesh);else(kind==='enemy'?enemyPool:freePool)[o.type].push(o.mesh);collection.delete(id);}}for(const e of entities){let o=collection.get(e.id);if(!o){let mesh;if(kind==='bullet'){mesh=bulletPool.pop()||makeBullet();}else{mesh=(kind==='enemy'?enemyPool:freePool)[e.type].pop()||makePlush(THREE,{type:e.type,rescued:kind==='free'});if(kind==='free'){mesh.userData.setRescued?.();mesh.userData.startRescueAnimation?.();}}o={mesh,type:e.type};collection.set(e.id,o);if(kind==='bullet')scene.add(mesh);}if(kind==='bullet')weaponVisuals.styleBullet(o.mesh,e);o.mesh.position.set(e.x,kind==='bullet'?(e.y??game.muzzleOffset.y):0,e.z);o.mesh.rotation.y=kind==='bullet'?Math.atan2(e.vx,e.vz):e.angle;o.mesh.userData.animate?.(game.time+e.id,true);if(kind==='free')o.mesh.scale.setScalar((e.boss?bossVisualScale(e,o.mesh.userData.radius):1)*Math.min(1,e.life/.65));else if(kind!=='bullet')o.mesh.scale.setScalar(1);}}
function updateCamera(){const game=getGame();
 const focus=cameraFocus(game.player,getSize().width,getSize().height);cameraTarget.set(focus.x,focus.y,focus.z);
 camera.position.set(cameraTarget.x+cameraDelta.x,cameraTarget.y+cameraDelta.y,cameraTarget.z+cameraDelta.z);
 camera.lookAt(cameraTarget);positionCameraFill(fill,cameraTarget,camera);sun.target.position.copy(cameraTarget);sun.position.set(cameraTarget.x-14,26,cameraTarget.z+8);
}
function syncModels(){const game=getGame(),hero=getHero();
 ordinaryEnemies.length=0;for(const e of game.enemies)if(!e.boss)ordinaryEnemies.push(e);
 syncCollection(ordinaryEnemies,enemies,'enemy');bossVisuals.sync(game);enemyVisuals.sync(game,{reduceMotion:reduceMotion()});syncCollection(game.rescued,rescued,'free');syncCollection(game.bullets,bullets,'bullet');
 allyVisuals.sync(game,{reduceMotion:reduceMotion()});shotVisuals.sync(game.bullets,game.muzzleOffset.y);
 crowd.sync([enemies,rescued,allyVisuals.models],{dirty:true});
 hero.position.set(game.player.x,0,game.player.z);hero.rotation.y=game.player.angle;
 // Reduced motion replaces the 12 Hz hurt blink with the steady vignette flash.
 hero.visible=game.invuln===0||reduceMotion()||Math.floor(game.time*12)%2===0;
 weaponVisuals.sync(game,hero);
 fx.shadows(game.player,game.enemies,game.rescued);
}
return {clearWorld,updateCamera,syncModels};
}
