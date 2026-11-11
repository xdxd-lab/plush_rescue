import * as THREE from './vendor/three.module.js';
import {Game,Stick,UPGRADES,LIMITS,ALLY,healthLabel,bossKind} from './core.js';
import {MAPS,buildMap} from './maps.js';
import {makePlush} from './characters.js';
import {CAMERA,cameraOffset,cameraFocus,createGameCamera,fitGameCamera,screenToWorldInput,screenToWorldAt} from './camera.js';
import {createEffects} from './effects.js';
import {isInteractiveTarget,routeKeyDown} from './keyboard.js';
import {createCrowd} from './crowd.js';
import {createTouchVisuals} from './touch-visuals.js';
import {applyMapLighting,positionCameraFill} from './lighting.js';
import {WEAPONS} from './weapons.js';
import {createBossVisuals,bossVisualScale} from './boss-visuals.js';
import {createEnemyVisuals} from './enemy-visuals.js';
import {createWeaponVisuals} from './weapon-visuals.js';
import {createAllyVisuals,ALLY_VISUAL} from './ally-visuals.js';
import {createShotVisuals} from './shot-visuals.js';
import {createSettingsStore} from './settings-store.js';
import {createChoiceTimer} from './choice-timer.js';
import {createAudio} from './audio.js';
import {createHud} from './hud.js';
import {createDialogs} from './dialogs.js';
import {createPickup} from './pickup.js';
import {createInput} from './input-controller.js';
import {createWarmupGame,warmupCoverage,finishWarmup,shouldWarmup} from './shader-warmup.js';
import {createTapTracker,createHoverTracker,eventTime,pointCovered,HUD_OCCLUDERS,dropHitShape,pickDropAt,readSettings,recommendUpgrade,recommendPickup,iconSvg,weaponIcon,UPGRADE_ICONS,formatClock,nextBossCountdown,bossClockLabel,readRecords,mergeRecords,writeRecords,bestWeapon} from './ui.js';
const $=s=>document.querySelector(s),canvas=$('#world'),overlay=$('#overlay'),dialog=$('#dialog');
let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){dialog.innerHTML='<h2>需要 3D 圖形支援</h2><p>請使用支援 WebGL 的瀏覽器，並開啟硬體加速後再試。</p>';throw e;}
// three.js reads every shader's compile log synchronously while this is on, which stalls
// the first frame of each new material; production skips it, ?debug=1 keeps it.
renderer.debug.checkShaderErrors=new URLSearchParams(location.search).get('debug')==='1';
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#bdc2b1');scene.fog=new THREE.Fog('#bdc2b1',46,88);
const camera=createGameCamera(innerWidth,innerHeight,{orthographic:new URLSearchParams(location.search).get('camera')==='ortho'});const hemi=new THREE.HemisphereLight('#fff0d9','#637579',1.65);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe6bf',3.0);sun.position.set(-14,26,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:65});sun.shadow.normalBias=.018;sun.shadow.radius=2;sun.shadow.bias=-.0002;scene.add(sun);scene.add(sun.target);
const rim=new THREE.DirectionalLight('#d0e8f0',.85);rim.position.set(8,9,-15);scene.add(rim);
const fill=new THREE.DirectionalLight('#c7daf1',0);fill.name='Low camera-side moon bounce';fill.visible=false;fill.castShadow=false;scene.add(fill,fill.target);
// Remembered settings (settings-store.js); prefs holds the values used this session.
const settings=createSettingsStore({getStorage:()=>{try{return localStorage;}catch{return null;}}}),prefs=settings.prefs;
const heroNames={pudding:'布丁狗',polar:'北極熊'};
let game,map,hero,lastStatus='',frameTime=0,frames=0,fps=0,renderDirty=true;
// Auto-equip is stored on its own key; a failed write still applies for this session.
function setAutoEquip(value){game.autoEquip=settings.setAutoEquip(value);}
// V12 presentation state. It observes game events and state; it never changes gameplay.
const storage=settings.storage;
const motionQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduceMotion=()=>Boolean(motionQuery?.matches);
// Short taps on drops (V12.1): each pointer is judged at release; the loop resolves them.
const taps=createTapTracker(),pendingTaps=[],tapClock=()=>performance.now();
// V12.2.1 mouse hover pickup: the last mouse position (null until the mouse moves over the game) and whether it moved since the last frame.
const hover=createHoverTracker(),pickupState={hoverPoint:null,hoverMoved:false,hoverLabel:null};
function clearHover(){pickupController.clearHover();}
// Auto-choice countdown for level-up and pickup dialogs (choice-timer.js).
const choiceTimer=createChoiceTimer({doc:document,win:window,dialog,enabled:()=>prefs.autoChoose,getGame:()=>game,getKey:()=>lastStatus,onAutoChosen:label=>showNotice('已自動選擇：'+label,'good',2,1)});
const runTrack={bosses:0,evolved:new Set(),aliveBosses:new Map(),nextAlive:new Map()};
// Boss allies share the crowd's plush batches; reserve room for them.
const crowd=createCrowd(THREE,scene,{...LIMITS,rescued:LIMITS.rescued+ALLY_VISUAL.reserve});
const allyVisuals=createAllyVisuals(THREE,scene),shotVisuals=createShotVisuals(THREE,scene);
const weaponVisuals=createWeaponVisuals(THREE,scene);
const bossVisuals=createBossVisuals(THREE,scene),enemyVisuals=createEnemyVisuals(THREE,scene);
const ordinaryEnemies=[];
const stick=new Stick(),keys=new Set(),enemies=new Map(),rescued=new Map(),bullets=new Map(),enemyPool=[[],[],[],[]],freePool=[[],[],[],[]],bulletPool=[];
// V12.4: mtk-viewer style dots and press rings for fingers and pens (never the mouse).
const touchFx=createTouchVisuals($('#touchFx'),{doc:document});touchFx.setEnabled(prefs.touchFx);
const bulletGeometry=new THREE.SphereGeometry(1,12,8),bulletMaterial=new THREE.MeshBasicMaterial({color:'#d8fcff'}),bulletGlowMaterial=new THREE.MeshBasicMaterial({color:'#63e3ff',transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending});
const fx=createEffects(THREE,scene,LIMITS),cameraDelta=cameraOffset(),cameraTarget=new THREE.Vector3();
function makeBullet(){const group=new THREE.Group(),core=new THREE.Mesh(bulletGeometry,bulletMaterial),glow=new THREE.Mesh(bulletGeometry,bulletGlowMaterial);core.scale.set(.05,.05,.24);glow.scale.set(.12,.12,.35);group.add(glow,core);return group;}
const names=['鈕扣街坊庭院','荒廢溫室花園','月光遊樂場'];const params=new URLSearchParams(location.search);let debugMap=params.get('map');const mapIndex=()=>{if(debugMap===null)return null;const n=Number(debugMap);if(Number.isInteger(n)&&n>=0&&n<=2)return n;const i=MAPS.findIndex(x=>x.id===debugMap);return i>=0?i:null;};
// Sound effects (audio.js); unlocked from the first gesture that starts or resumes play.
const sfx=createAudio({getContextClass:()=>window.AudioContext||window.webkitAudioContext,volume:()=>prefs.volume});
function releaseAll(collection,pool){for(const obj of collection.values()){scene.remove(obj.mesh);pool(obj);}collection.clear();}
// Every world visual of the current game goes back to its pool (reset and shader warm-up).
function clearWorld(){crowd.clear();weaponVisuals.clear();bossVisuals.clear();enemyVisuals.clear();allyVisuals.clear();shotVisuals.clear();releaseAll(enemies,o=>enemyPool[o.type].push(o.mesh));releaseAll(rescued,o=>freePool[o.type].push(o.mesh));releaseAll(bullets,o=>bulletPool.push(o.mesh));fx.clear();}
function reset(){choiceTimer.clear();renderDirty=true;clearWorld();clearInput();if(map)map.dispose();if(hero)scene.remove(hero);game=new Game({map:mapIndex(),autoEquip:prefs.autoEquip,heroId:prefs.hero});map=buildMap(THREE,scene,game.map);game.obstacles=map.obstacles;game.bounds=map.bounds;Object.assign(game.player,map.spawn);hero=makePlush(THREE,{hero:true,heroId:game.heroId});hero.scale.setScalar(1.1);game.muzzleOffset=hero.userData.getMuzzleOffset();game.player.angle=Math.PI/3;scene.add(hero);$('#mapName').textContent=names[game.map];hud.game.dataset.map=MAPS[game.map]?.id||'courtyard';applyMapLighting(map.lighting,{scene,renderer,hemi,sun,rim,fill});lastStatus='';resetPresentation();hudView.sync(game);if(shouldWarmup(shaderWarmup,renderer.shadowMap.enabled))warmShaders();}
function resetPresentation(){
 hudView.resetFeedback();
 runTrack.bosses=0;runTrack.evolved.clear();runTrack.aliveBosses.clear();runTrack.nextAlive.clear();
}
// Bosses leave game.enemies only through rescue (or a reset, which clears this record).
function trackRun(){
 const magic=game.magic;
 if(magic.evolved&&!runTrack.evolved.has(magic)){runTrack.evolved.add(magic);showNotice(WEAPONS[game.loadout.offhand].name+' 進化了！','magic',2.6,2);}
 const next=runTrack.nextAlive;next.clear();
 for(const e of game.enemies)if(e.boss)next.set(e.id,e.boss);
 for(const [id,kind] of runTrack.aliveBosses)if(!next.has(id)){runTrack.bosses++;showNotice(game.bossAllies?(kind==='big'?'大首領':'首領')+`變成小夥伴，陪你戰鬥 ${ALLY.duration} 秒！`:(kind==='big'?'大首領被溫柔救回了！':'首領被溫柔救回了！'),'good',2.4,2);}
 runTrack.nextAlive=runTrack.aliveBosses;runTrack.aliveBosses=next;
}
function resize(){let w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio,prefs.quality==='high'?2:prefs.quality==='balanced'?1.6:1));fitGameCamera(camera,w,h);}
function setQuality(v){prefs.quality=v;renderer.shadowMap.enabled=v!=='low';renderer.shadowMap.needsUpdate=true;resize();}
function clearInput(){inputController.clearInput();}
function pause(){game.pause();clearInput();syncOverlay();}
// The HUD (hud.js): permanent nodes, change-only writes, notices and hit/rescue feedback.
const hudView=createHud({doc:document,heroNames}),hud=hudView.els,hudOccluders=hudView.occluders;
const showNotice=hudView.showNotice;
const inputController=createInput({document,window,canvas,overlay,dialog,stick,keys,taps,pendingTaps,touchFx,hover,pickupState,clearHover,getGame:()=>game,tapClock,reduceMotion,hudOccluders,pause,syncOverlay,resize,setStatsVisible,prefs,hudView,setRenderDirty:()=>{renderDirty=true;},getCamera:()=>camera,getSize:()=>({width:innerWidth,height:innerHeight}),getStyle:el=>getComputedStyle(el)});
function input(){return inputController.input();}
function syncStats(){hudView.syncStats({fps,game,calls:renderer.info.render.calls,quality:prefs.quality});}
function setStatsVisible(value,persist=true){prefs.stats=Boolean(value);hud.stats.hidden=!prefs.stats;if(prefs.stats)syncStats();if(persist)settings.save();}
function startGame(){shaderWarmup.startedBeforeReady=!shaderWarmup.ready;game.start();}
function restart(){debugMap=null;reset();startGame();syncOverlay();}
function resume(){clearInput();sfx.unlock();game.resume();syncOverlay();}
const dialogs=createDialogs({document,overlay,dialog,canvas,getGame:()=>game,getLastStatus:()=>lastStatus,setLastStatus:value=>{lastStatus=value;},setRenderDirty:()=>{renderDirty=true;},prefs,settings,choiceTimer,clearInput,hudView,runTrack,storage,heroNames,names,setQuality,sfx,setAutoEquip,touchFx,setStatsVisible,restart,resume});
function syncOverlay(){dialogs.syncOverlay();}
function renderBestLine(){dialogs.renderBestLine();}
function syncCollection(entities,collection,kind){const ids=new Set(entities.map(e=>e.id));for(const[id,o]of collection){if(!ids.has(id)){scene.remove(o.mesh);if(kind==='bullet')bulletPool.push(o.mesh);else(kind==='enemy'?enemyPool:freePool)[o.type].push(o.mesh);collection.delete(id);}}for(const e of entities){let o=collection.get(e.id);if(!o){let mesh;if(kind==='bullet'){mesh=bulletPool.pop()||makeBullet();}else{mesh=(kind==='enemy'?enemyPool:freePool)[e.type].pop()||makePlush(THREE,{type:e.type,rescued:kind==='free'});if(kind==='free'){mesh.userData.setRescued?.();mesh.userData.startRescueAnimation?.();}}o={mesh,type:e.type};collection.set(e.id,o);if(kind==='bullet')scene.add(mesh);}if(kind==='bullet')weaponVisuals.styleBullet(o.mesh,e);o.mesh.position.set(e.x,kind==='bullet'?(e.y??game.muzzleOffset.y):0,e.z);o.mesh.rotation.y=kind==='bullet'?Math.atan2(e.vx,e.vz):e.angle;o.mesh.userData.animate?.(game.time+e.id,true);if(kind==='free')o.mesh.scale.setScalar((e.boss?bossVisualScale(e,o.mesh.userData.radius):1)*Math.min(1,e.life/.65));else if(kind!=='bullet')o.mesh.scale.setScalar(1);}}
function updateCamera(){
 const focus=cameraFocus(game.player,innerWidth,innerHeight);cameraTarget.set(focus.x,focus.y,focus.z);
 camera.position.set(cameraTarget.x+cameraDelta.x,cameraTarget.y+cameraDelta.y,cameraTarget.z+cameraDelta.z);
 camera.lookAt(cameraTarget);positionCameraFill(fill,cameraTarget,camera);sun.target.position.copy(cameraTarget);sun.position.set(cameraTarget.x-14,26,cameraTarget.z+8);
}
// Shader warm-up (shader-warmup.js). A staged game with one of everything is put
// in the scene for a single compile call, then the real game is restored, so the
// first boss, ally, telegraph, mine or effect does not stall a frame. It runs at a
// reset whose game is still waiting to start, once per shadow setting (quality
// low turns shadows off, which needs other programs). Nothing is rendered.
const shaderWarmup={runs:0,shadows:null,programsBefore:0,programsAfter:0,ready:false,error:null,coverage:null,stageMs:0,readyMs:0,startedBeforeReady:false};
function stageEffects(events){
 for(const event of events){
  if(event.kind==='rescue')fx.burst(event.x,event.z);
  else if(event.kind==='allyShot')allyVisuals.shot(event);
  else if(event.kind==='hit')shotVisuals.hit(event,{reduceMotion:false,quality:'balanced'});
 }
 fx.update(0,camera);weaponVisuals.update(0,events,game,camera,innerHeight);allyVisuals.update(0);shotVisuals.update(0,camera);
}
function warmShaders(){
 if(typeof renderer.compile!=='function')return;
 const real=game,warmup=shaderWarmup,t0=performance.now();
 warmup.runs++;warmup.shadows=renderer.shadowMap.enabled;warmup.ready=false;warmup.error=null;warmup.startedBeforeReady=false;warmup.programsBefore=renderer.info.programs?.length??0;
 try{
  game=createWarmupGame({map:real.map,heroId:real.heroId,muzzleOffset:real.muzzleOffset});
  warmup.coverage=warmupCoverage(game);
  syncModels();stageEffects(game.events);
  // compileAsync collects the materials now and only waits for the driver afterwards.
  const done=typeof renderer.compileAsync==='function'?renderer.compileAsync(scene,camera):renderer.compile(scene,camera);
  const programs=[...(renderer.info.programs??[])];
  warmup.programsAfter=programs.length;warmup.stageMs=performance.now()-t0;
  finishWarmup(done,{warmup,renderer,programs,run:warmup.runs,shadows:warmup.shadows,t0});
 }catch(error){warmup.error=String(error?.message||error);}
 finally{game=real;clearWorld();syncModels();renderDirty=true;}
}
function syncModels(){
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
const pickupController=createPickup({document,canvas,camera,getGame:()=>game,getSize:()=>({width:innerWidth,height:innerHeight}),weaponVisuals,hudOccluders,pendingTaps,hover,pickupState,overlay,setRenderDirty:()=>{renderDirty=true;},getDropShapes:(...args)=>dropShapes(...args)});
function projectToScreen(...args){return pickupController.projectToScreen(...args);}
function viewRect(){return pickupController.viewRect();}
function dropShapes(...args){return pickupController.dropShapes(...args);}
const tapAxes=pickupController.tapAxes;
function resolveTaps(){pickupController.resolveTaps();}
function resolveHover(realDt){pickupController.resolveHover(realDt);}
function effects(dt){
 const heard=new Set();
 for(const event of game.events){
  // A large area rescue can free dozens of friends in the same frame.
  // Keep every visual burst, but never create dozens of audio voices at once.
  // Ally beams and bolt hits are frequent and quiet: they get no voice of their own.
  if(!event.kind.startsWith('ally')&&event.kind!=='hit'&&!heard.has(event.kind)&&heard.size<4){heard.add(event.kind);sfx.play(event.kind);}
  if(event.kind==='rescue'){fx.burst(event.x,event.z);hudView.bump();}
  else if(event.kind==='hurt')hudView.hurt();
  else if(event.kind==='boss')showNotice(event.boss==='big'?'大首領「星冠守護者」來襲！':'小首領「補丁隊長」出現了！',event.boss==='big'?'big':'boss',2.8,3);
  else if(event.kind==='allyShot')allyVisuals.shot(event);
  else if(event.kind==='hit')shotVisuals.hit(event,{reduceMotion:reduceMotion(),quality:prefs.quality});
  else if(event.kind==='allyLeave')fx.burst(event.x,event.z);
  else if(event.kind==='skill'){const u=UPGRADES.find(x=>x.id===event.upgradeId);if(u)showNotice('獲得技能 · '+u.name+'：'+u.description,'good',2.4,1);}
 }
 fx.update(dt,camera);weaponVisuals.update(dt,game.events,game,camera,innerHeight);allyVisuals.update(dt);shotVisuals.update(dt,camera);
}
setQuality(prefs.quality);reset();resize();renderBestLine();
// Visual hero cards drive the original #heroSelect value/change interface.
const heroCards=[$('#heroCardPudding'),$('#heroCardPolar')].filter(Boolean);
function syncHeroCards(){for(const card of heroCards)card.setAttribute('aria-pressed',String(card.dataset.hero===prefs.hero));}
// Restore the remembered hero and diagnostics switch without writing them back.
$('#heroSelect').value=prefs.hero;syncHeroCards();setStatsVisible(prefs.stats,false);
$('#heroSelect').onchange=e=>{prefs.hero=e.target.value==='polar'?'polar':'pudding';$('#heroSelect').value=prefs.hero;syncHeroCards();settings.save();reset();};
for(const card of heroCards)card.onclick=()=>{if(card.dataset.hero===prefs.hero)return;const select=$('#heroSelect');select.value=card.dataset.hero;select.onchange({target:select});};$('#start').onclick=()=>{sfx.unlock();startGame();syncOverlay();};let previous=performance.now();
function loop(now){
 requestAnimationFrame(loop);
 const realDt=(now-previous)/1000,dt=Math.min(.05,realDt);previous=now;
 const active=game.status==='running',movement=input();
 if(active){
  hero.userData.animate?.(Math.min(LIMITS.duration,game.time+dt),Math.hypot(movement.x,movement.z)>.1);
  hero.userData.getMuzzleOffset(game.muzzleOffset);
 }
 game.step(dt,movement);
 if(active){trackRun();hudView.tick(dt);}
 if(active)resolveTaps();
 resolveHover(realDt);
 updateCamera();
 if(active)effects(dt);else{fx.update(0,camera);weaponVisuals.update(0,[],game,camera,innerHeight);}
 if(active||renderDirty){syncModels();hudView.sync(game);renderDirty=false;}
 else crowd.sync(null,{dirty:false});
 syncOverlay();choiceTimer.advance(realDt);renderer.render(scene,camera);
 frameTime+=realDt;frames++;
 if(frameTime>.5){fps=Math.round(frames/frameTime);frameTime=0;frames=0;if(prefs.stats)syncStats();}
}
requestAnimationFrame(loop);
window.__PLUSH_QA__={revision:'v12.5.0-warmup-contrast-r1',get records(){return readRecords(storage());},get settings(){return readSettings(storage());},get autoChoice(){return choiceTimer.state;},get choiceTimer(){return choiceTimer;},get audio(){return sfx;},get hud(){return hudView;},get shaderWarmup(){return {...shaderWarmup,programs:renderer.info.programs?.length??0};},get presentation(){return {notice:hud.notice.textContent,noticeTimer:hudView.noticeTimer,bossesRescued:runTrack.bosses,bossClock:hud.bossClockText.textContent};},get game(){return game;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},setMap(index){debugMap=String(index);reset();startGame();syncOverlay();},pause,resume,restart,get weaponVisuals(){return weaponVisuals;},get bossVisuals(){return bossVisuals;},get enemyVisuals(){return enemyVisuals.stats;},get shotVisuals(){return shotVisuals;},get allyVisuals(){return allyVisuals.stats;},quality:setQuality,limits:LIMITS,cameraSpec:CAMERA,screenToWorldInput,screenToWorldAt,get effects(){return {halos:fx.haloCount,particles:fx.particleCount};},previewRescue(){fx.burst(game.player.x+1.6,game.player.z);},get crowd(){return crowd.stats;},get settingsStore(){return settings;},get input(){return {stick:{id:stick.id,x:stick.x,z:stick.z},hover:{id:hover.id,point:pickupState.hoverPoint,moved:pickupState.hoverMoved,label:pickupState.hoverLabel},taps:taps.size,keys:keys.size};},renderOnce(){syncModels();updateCamera();fx.update(0,camera);weaponVisuals.update(0,[],game,camera,innerHeight);hudView.sync(game);syncOverlay();renderDirty=false;renderer.render(scene,camera);}};
