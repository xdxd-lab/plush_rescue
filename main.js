import * as THREE from './vendor/three.module.js';
import {Game,Stick,UPGRADES,LIMITS,ALLY,healthLabel,bossKind} from './core.js';
import {MAPS,buildMap} from './maps.js';
import {makePlush} from './characters.js';
import {CAMERA,cameraOffset,cameraFocus,createGameCamera,fitGameCamera,screenToWorldInput,screenToWorldAt} from './camera.js';
import {createEffects} from './effects.js';
import {isInteractiveTarget,routeKeyDown} from './keyboard.js';
import {createCrowd} from './crowd.js';
import {applyMapLighting,positionCameraFill} from './lighting.js';
import {WEAPONS} from './weapons.js';
import {createBossVisuals,bossVisualScale} from './boss-visuals.js';
import {createWeaponVisuals} from './weapon-visuals.js';
import {createAllyVisuals,ALLY_VISUAL} from './ally-visuals.js';
import {createShotVisuals} from './shot-visuals.js';
import {createTapTracker,createHoverTracker,eventTime,pointCovered,HUD_OCCLUDERS,dropHitShape,pickDropAt,readSettings,writeSettings,recommendUpgrade,recommendPickup,iconSvg,weaponIcon,UPGRADE_ICONS,formatClock,nextBossCountdown,bossClockLabel,readRecords,mergeRecords,writeRecords,bestWeapon} from './ui.js';
const $=s=>document.querySelector(s),canvas=$('#world'),overlay=$('#overlay'),dialog=$('#dialog');
let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){dialog.innerHTML='<h2>需要 3D 圖形支援</h2><p>請使用支援 WebGL 的瀏覽器，並開啟硬體加速後再試。</p>';throw e;}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#bdc2b1');scene.fog=new THREE.Fog('#bdc2b1',46,88);
const camera=createGameCamera(innerWidth,innerHeight,{orthographic:new URLSearchParams(location.search).get('camera')==='ortho'});const hemi=new THREE.HemisphereLight('#fff0d9','#637579',1.65);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe6bf',3.0);sun.position.set(-14,26,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:65});sun.shadow.normalBias=.018;sun.shadow.radius=2;sun.shadow.bias=-.0002;scene.add(sun);scene.add(sun.target);
const rim=new THREE.DirectionalLight('#d0e8f0',.85);rim.position.set(8,9,-15);scene.add(rim);
const fill=new THREE.DirectionalLight('#c7daf1',0);fill.name='Low camera-side moon bounce';fill.visible=false;fill.castShadow=false;scene.add(fill,fill.target);
const savedSettings=readSettings((()=>{try{return localStorage;}catch{return null;}})());
let selectedHero=savedSettings.hero;
const heroNames={pudding:'布丁狗',polar:'北極熊'};
let game,map,hero,quality=savedSettings.quality,volume=savedSettings.volume,showStats=savedSettings.stats,autoChoose=savedSettings.autoChoose,lastStatus='',frameTime=0,frames=0,fps=0,renderDirty=true;
// Storage can be unavailable in private mode or embedded previews. The default
// is always to ask; changing the setting still works for this session.
const autoEquipKey='plush-rescue:auto-equip';
let autoEquip=false;
try{autoEquip=localStorage.getItem(autoEquipKey)==='true';}catch{}
function setAutoEquip(value){autoEquip=Boolean(value);game.autoEquip=autoEquip;try{localStorage.setItem(autoEquipKey,String(autoEquip));}catch{}}
// V12 presentation state. It observes game events and state; it never changes gameplay.
function storage(){try{return localStorage;}catch{return null;}}
const motionQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduceMotion=()=>Boolean(motionQuery?.matches);
let noticeTimer=0,noticePriority=0,hurtTimer=0,bumpTimer=0,recordedGame=null,recordResult=null;
// Short taps on drops (V12.1): each pointer is judged at release; the loop resolves them.
const taps=createTapTracker(),pendingTaps=[],tapClock=()=>performance.now();
// V12.2.1 mouse hover pickup: the last mouse position (null until the mouse moves over the game) and whether it moved since the last frame.
const hover=createHoverTracker();let hoverPoint=null,hoverMoved=false,hoverLabel=false;
function clearHover(){hover.reset();hoverPoint=null;hoverMoved=false;hoverLabel=false;showHoverRing(null);}
function saveSettings(){writeSettings(storage(),{quality,volume,hero:selectedHero,stats:showStats,autoChoose});}
let choiceTimer=null;
function clearChoiceTimer(){choiceTimer?.target?.classList.toggle('auto-choice-target',false);choiceTimer=null;}
function choiceUnfocused(){return document.hidden||document.hasFocus?.()===false;}
function renderChoiceTimer(){
 const timer=choiceTimer;if(!timer)return;
 const label=$('#choiceCountdownText'),announce=$('#choiceCountdownAnnounce'),bar=$('#choiceCountdownBar');
 if(!label)return;
 if(timer.cancelled){label.textContent='已取消自動選擇，請自行決定';if(announce)announce.textContent='已取消自動選擇';return;}
 const seconds=Math.ceil(Math.max(0,timer.remaining));
 label.textContent=`${seconds} 秒後自動選擇：${timer.label}`;
 bar?.style.setProperty('--choice-width',`${Math.max(0,timer.remaining*10)}%`);
 if(seconds!==timer.shown){timer.shown=seconds;if(announce&&(seconds===10||seconds===3))announce.textContent=label.textContent;}
}
function startChoiceTimer(target,label,resolve){
 if(!autoChoose||!target)return;
 choiceTimer={game,key:lastStatus,target,label,resolve,remaining:10,shown:-1,cancelled:false,away:choiceUnfocused()};
 target.classList.toggle('auto-choice-target',true);renderChoiceTimer();
}
function cancelChoiceTimer(){if(!choiceTimer||choiceTimer.cancelled)return;choiceTimer.cancelled=true;choiceTimer.target.classList.toggle('auto-choice-target',false);renderChoiceTimer();}
function advanceChoiceTimer(realDt){
 const timer=choiceTimer;
 if(!timer||timer.cancelled||timer.game!==game||timer.key!==lastStatus)return;
 const away=choiceUnfocused();
 if(away){timer.away=true;return;}
 if(timer.away){timer.away=false;timer.remaining=Math.max(3,timer.remaining);renderChoiceTimer();return;}
 if(!(realDt>0))return;
 // Count slow visible frames, but cap a single long stall so it cannot decide
 // immediately after the device wakes without firing a blur event.
 timer.remaining=Math.max(0,timer.remaining-Math.min(realDt,2));renderChoiceTimer();
 if(timer.remaining===0){const resolve=timer.resolve,label=timer.label;clearChoiceTimer();resolve();showNotice('已自動選擇：'+label,'good',2,1);}
}
dialog.addEventListener('pointerdown',cancelChoiceTimer);
dialog.addEventListener('wheel',cancelChoiceTimer,{passive:true});
dialog.addEventListener('touchmove',cancelChoiceTimer,{passive:true});
window.addEventListener('keydown',e=>{if(e.key!=='Shift'&&e.key!=='Control'&&e.key!=='Alt'&&e.key!=='Meta')cancelChoiceTimer();});
window.addEventListener('blur',()=>{if(choiceTimer)choiceTimer.away=true;});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&choiceTimer)choiceTimer.away=true;});
const runTrack={bosses:0,evolved:new Set(),aliveBosses:new Map(),nextAlive:new Map()};
// Boss allies share the crowd's plush batches; reserve room for them.
const crowd=createCrowd(THREE,scene,{...LIMITS,rescued:LIMITS.rescued+ALLY_VISUAL.reserve});
const allyVisuals=createAllyVisuals(THREE,scene),shotVisuals=createShotVisuals(THREE,scene);
const weaponVisuals=createWeaponVisuals(THREE,scene);
const bossVisuals=createBossVisuals(THREE,scene);
const ordinaryEnemies=[];
const stick=new Stick(),keys=new Set(),enemies=new Map(),rescued=new Map(),bullets=new Map(),enemyPool=[[],[],[],[]],freePool=[[],[],[],[]],bulletPool=[];
const bulletGeometry=new THREE.SphereGeometry(1,12,8),bulletMaterial=new THREE.MeshBasicMaterial({color:'#d8fcff'}),bulletGlowMaterial=new THREE.MeshBasicMaterial({color:'#63e3ff',transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending});
const fx=createEffects(THREE,scene,LIMITS),cameraDelta=cameraOffset(),cameraTarget=new THREE.Vector3();
function makeBullet(){const group=new THREE.Group(),core=new THREE.Mesh(bulletGeometry,bulletMaterial),glow=new THREE.Mesh(bulletGeometry,bulletGlowMaterial);core.scale.set(.05,.05,.24);glow.scale.set(.12,.12,.35);group.add(glow,core);return group;}
const names=['鈕扣街坊庭院','荒廢溫室花園','月光遊樂場'];const params=new URLSearchParams(location.search);let debugMap=params.get('map');const mapIndex=()=>{if(debugMap===null)return null;const n=Number(debugMap);if(Number.isInteger(n)&&n>=0&&n<=2)return n;const i=MAPS.findIndex(x=>x.id===debugMap);return i>=0?i:null;};
let audio;function sound(kind){if(!audio||volume===0)return;try{const o=audio.createOscillator(),g=audio.createGain();o.type=kind==='hurt'?'triangle':'sine';o.frequency.setValueAtTime(kind==='rescue'?740:kind==='hurt'?120:420,audio.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='rescue'?1100:kind==='hurt'?65:180,audio.currentTime+.08);g.gain.setValueAtTime(volume*(kind==='shot'?.025:.12),audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.1);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.11);}catch{}}
function unlockAudio(){try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();}catch{}}
function releaseAll(collection,pool){for(const obj of collection.values()){scene.remove(obj.mesh);pool(obj);}collection.clear();}
function reset(){clearChoiceTimer();renderDirty=true;crowd.clear();weaponVisuals.clear();bossVisuals.clear();allyVisuals.clear();shotVisuals.clear();clearInput();if(map)map.dispose();if(hero)scene.remove(hero);releaseAll(enemies,o=>enemyPool[o.type].push(o.mesh));releaseAll(rescued,o=>freePool[o.type].push(o.mesh));releaseAll(bullets,o=>bulletPool.push(o.mesh));fx.clear();game=new Game({map:mapIndex(),autoEquip,heroId:selectedHero});map=buildMap(THREE,scene,game.map);game.obstacles=map.obstacles;game.bounds=map.bounds;Object.assign(game.player,map.spawn);hero=makePlush(THREE,{hero:true,heroId:game.heroId});hero.scale.setScalar(1.1);game.muzzleOffset=hero.userData.getMuzzleOffset();game.player.angle=Math.PI/3;scene.add(hero);$('#mapName').textContent=names[game.map];hud.game.dataset.map=MAPS[game.map]?.id||'courtyard';applyMapLighting(map.lighting,{scene,renderer,hemi,sun,rim,fill});lastStatus='';resetPresentation();syncHud();}
function resetPresentation(){
 noticeTimer=noticePriority=hurtTimer=bumpTimer=0;hudText(hud.notice,'');hudProp(hud.notice,'className','');
 runTrack.bosses=0;runTrack.evolved.clear();runTrack.aliveBosses.clear();runTrack.nextAlive.clear();
}
function showNotice(text,tone,seconds,priority){
 // A big-boss warning is not replaced by a smaller event while it is still showing.
 if(noticeTimer>0&&priority<noticePriority)return;
 noticeTimer=seconds;noticePriority=priority;hudText(hud.notice,text);hudProp(hud.notice,'className','show '+tone);
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
function tickPresentation(dt){
 if(noticeTimer>0){noticeTimer=Math.max(0,noticeTimer-dt);if(noticeTimer===0){noticePriority=0;hudProp(hud.notice,'className','');}}
 hurtTimer=Math.max(0,hurtTimer-dt);bumpTimer=Math.max(0,bumpTimer-dt);
 hudClass(hud.vignette,'hurt',hurtTimer>0);hudClass(hud.rescues,'bump',bumpTimer>0);
}
function resize(){let w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?2:quality==='balanced'?1.6:1));fitGameCamera(camera,w,h);}
function setQuality(v){quality=v;renderer.shadowMap.enabled=v!=='low';renderer.shadowMap.needsUpdate=true;resize();}
function updateStick(){const el=$('#stick');el.style.display=stick.id===null?'none':'block';el.style.left=stick.origin.x+'px';el.style.top=stick.origin.y+'px';$('#knob').style.transform=`translate(${stick.x*34}px,${stick.z*34}px)`;}
// A gesture can start on any non-interactive part of the game, including HUD
// readouts. Native buttons/inputs keep their own pointer and click behaviour.
document.addEventListener('pointerdown',e=>{
 clearHover();
 if(game.status!=='running'||overlay.classList.contains('shown')||e.defaultPrevented||e.button!==0||!$('#game').contains(e.target)||isInteractiveTarget(e.target))return;
 if(stick.begin(e.pointerId,e.clientX,e.clientY)){
  // A browser may revoke a pointer before capture (for example on app switch).
  // Never retain movement ownership when capture could not be established.
  try{canvas.setPointerCapture(e.pointerId);}catch{stick.reset();updateStick();return;}
  e.preventDefault();updateStick();$('#moveHint').style.opacity='.15';
 }
 // Every accepted press may become a tap on a drop, including a second finger
 // while the first one holds the stick. It never takes over movement.
 taps.begin(e.pointerId,e.clientX,e.clientY,eventTime(e,tapClock),e.pointerType);
 // Tracked presses (never buttons or dialogs, which returned above) keep the browser
 // from adding its own handling to the extra finger.
 e.preventDefault();
},{passive:false});
// Safari ignores touch-action for pinch; stop its gesture only while the game is running
// so dialogs and the rest of the page keep their zoom.
document.addEventListener('pointerout',e=>{if(e.pointerType==='mouse'&&!e.relatedTarget)clearHover();});
document.addEventListener('gesturestart',e=>{if(game.status==='running'&&!overlay.classList.contains('shown')&&$('#game').contains(e.target))e.preventDefault();},{passive:false});
document.addEventListener('pointermove',e=>{
 taps.move(e.pointerId,e.clientX,e.clientY);
 // Only a mouse with no button down hovers; a drag, a finger or a pen never does.
 if(e.pointerType==='mouse'){
  if(e.buttons!==0||isInteractiveTarget(e.target)||!$('#game').contains(e.target))clearHover();
  else{if(!hoverPoint||hoverPoint.x!==e.clientX||hoverPoint.y!==e.clientY)hoverMoved=true;hoverPoint={x:e.clientX,y:e.clientY,type:'mouse'};}
 }
 if(e.pointerId!==stick.id)return;
 if(game.status!=='running'){clearInput();return;}
 // A mouse button released outside the page ends only this drag; other fingers
 // and taps already waiting for the next frame are kept.
 if(e.pointerType==='mouse'&&(e.buttons&1)===0){taps.cancel(e.pointerId);endStick();return;}
 if(stick.move(e.pointerId,e.clientX,e.clientY)){e.preventDefault();updateStick();}
},{passive:false});
for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>{
 // Ignore loss of the original target's implicit capture when it transfers
 // to the canvas; only losing our canvas capture cancels the drag.
 if(type==='lostpointercapture'&&e.target!==canvas)return;
 // A tap on an opaque HUD panel is a tap on the panel, not on the world below it.
 if(type==='pointerup'){const tap=taps.end(e.pointerId,e.clientX,e.clientY,eventTime(e,tapClock));if(tap&&game.status==='running'&&!overlay.classList.contains('shown')&&pendingTaps.length<4&&!pointCovered(tap,hudOccluders))pendingTaps.push(tap);}
 // A pointer whose capture was lost can no longer be trusted: its pointerup may arrive
 // without the matching moves, so it must not turn into a tap.
 else taps.cancel(e.pointerId);
 if(!stick.end(e.pointerId))return;
 if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 updateStick();
});
function endStick(){const id=stick.id;stick.reset();if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);updateStick();}
function clearInput(){clearHover();taps.clear();pendingTaps.length=0;endStick();keys.clear();}
function pause(){game.pause();clearInput();syncOverlay();}
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('resize',()=>{clearInput();resize();});
window.addEventListener('keydown',e=>{const action=routeKeyDown(e,game.status,keys);if(action==='pause')pause();else if(action==='resume'){game.resume();syncOverlay();}else if(action==='stats'){setStatsVisible(!showStats);}else if(action?.startsWith('upgrade:')){dialog.querySelectorAll('[data-upgrade]')[Number(action.slice(8))-1]?.onclick?.();}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
// Keep keyboard navigation inside the active menu without changing native
// checkbox, slider, select, Space, or Escape behavior.
document.addEventListener('keydown',e=>{
 if(e.key!=='Tab'||game.status==='running')return;
 const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled):not([tabindex="-1"]),[tabindex="0"]')];
 if(!controls.length)return;
 const first=controls[0],last=controls[controls.length-1];
 if(!dialog.contains(document.activeElement)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();first.focus();}
 else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
});
document.addEventListener('focusin',e=>{if(isInteractiveTarget(e.target))keys.clear();});
// V12.3.4: the start/resume button (or the pause button row) sticks to the dialog's visible
// bottom. A control focused underneath it is scrolled clear; browsers skip scroll-padding for
// a control that is already inside the scrollport.
dialog.addEventListener('focusin',e=>{
 const bar=[...dialog.querySelectorAll('.pause-actions,#start,#resume')].find(el=>getComputedStyle(el).position==='sticky');
 if(!bar||bar.contains(e.target))return;
 const r=e.target.getBoundingClientRect(),b=bar.getBoundingClientRect(),over=r.bottom-(b.top-14);
 if(over>0&&r.top<b.bottom)dialog.scrollTop+=over;
});$('#pause').onclick=pause;
$('#stowTwoHanded').onclick=()=>{if(game.status!=='running'||!game.twoHandedWeapon)return;keys.clear();game.toggleTwoHanded();renderDirty=true;syncHud();canvas.focus({preventScroll:true});};
function input(){return screenToWorldAt({x:stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z:stick.z+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)},camera,game.player,innerWidth,innerHeight);}
// Permanent HUD nodes survive reset; modal controls are intentionally not cached.
const hud=Object.fromEntries(["heroPortrait", "bossPanel", "bossName", "bossHp", "bossFill", "hearts", "healthFill", "timer", "saved", "level", "xpFill", "xpLabel", "mainWeapon", "offhandWeapon", "mainWeaponName", "offhandWeaponName", "mainWeaponIcon", "offhandWeaponIcon", "game", "twoHandedBar", "twoHandedName", "twoHandedSlotLabel", "stowTwoHanded", "mainSlotLabel", "offhandSlotLabel", "magicFill", "magicLabel", "magicMeter", "stats", "vignette", "notice", "bossClock", "bossClockText"].map(id=>[id,$('#'+id)]));
hud.loadout=$('.loadout');hud.rescues=$('.rescues');hud.root=$('#hud');
// Opaque HUD panels that hide the world under them (see pointCovered in ui.js).
const hudOccluders=[...document.querySelectorAll(HUD_OCCLUDERS)];
const hudValues=new WeakMap();
function hudWrite(el,key,value,apply){
 let values=hudValues.get(el);if(!values){values=new Map();hudValues.set(el,values);}
 if(values.has(key)&&values.get(key)===value)return;
 apply();values.set(key,value);
}
function hudText(el,value){value=String(value);hudWrite(el,'text',value,()=>{el.textContent=value;});}
function hudProp(el,key,value){hudWrite(el,'prop:'+key,value,()=>{el[key]=value;});}
function hudAttr(el,key,value){value=String(value);hudWrite(el,'attr:'+key,value,()=>{el.setAttribute(key,value);});}
function hudStyle(el,key,value){hudWrite(el,'style:'+key,value,()=>{el.style.setProperty(key,value);});}
function hudClass(el,key,value){value=Boolean(value);hudWrite(el,'class:'+key,value,()=>{el.classList.toggle(key,value);});}
function syncStats(){
 // Enemy count includes bosses; ground bombs (mines) have their own count.
 hudText(hud.stats,`${fps} FPS · ${game.enemies.length} 敵 / ${game.rescued.length} 自由 / ${game.bullets.length} 光束 / ${game.bombs.length} 地雷 · ${renderer.info.render.calls} calls · ${quality}`);
}
function setStatsVisible(value,persist=true){showStats=Boolean(value);hud.stats.hidden=!showStats;if(showStats)syncStats();if(persist)saveSettings();}
function syncHud(){
 const p=game.player;
 hudAttr(hud.heroPortrait,'src','assets/'+game.heroId+'-portrait.png');hudAttr(hud.heroPortrait,'alt',heroNames[game.heroId]+'救援隊員');
 let active=null;for(const e of game.enemies)if(e.boss&&(!active||e.boss==='big'&&active.boss!=='big'))active=e;
 hudProp(hud.bossPanel,'hidden',!active);if(active){const boss=active;hudText(hud.bossName,(boss.boss==='big'?'大首領 · 星冠守護者':'小首領 · 補丁隊長'));hudText(hud.bossHp,Math.ceil(boss.hp)+' / '+boss.maxHp);hudStyle(hud.bossFill,'width',Math.max(0,boss.hp/boss.maxHp*100)+'%');}

 hudText(hud.hearts,healthLabel(p.hp,p.maxHp));hudStyle(hud.healthFill,'width',p.hp/p.maxHp*100+'%');
 hudAttr(hud.hearts,'role','img');hudAttr(hud.hearts,'aria-label','生命 '+Math.max(0,p.hp)+' / '+p.maxHp);
 const critical=game.status==='running'&&p.hp>0&&p.hp<=1;hudClass(hud.vignette,'critical',critical);hudClass(hud.root,'critical',critical);
 hudClass(hud.game,'hero-polar',game.heroId==='polar');
 // The movement hint frees its footer row once the opening seconds have passed.
 hudClass(hud.game,'hint-done',game.time>12);
 const nextBoss=nextBossCountdown(game,bossKind,LIMITS.duration);hudText(hud.bossClockText,bossClockLabel(nextBoss));
 hudClass(hud.bossClock,'big',nextBoss.kind==='big'&&nextBoss.state!=='none');hudClass(hud.bossClock,'calm',nextBoss.state==='none');
 hudClass(hud.bossClock,'imminent',nextBoss.state==='soon'&&nextBoss.seconds<=10&&game.status==='running');
 hudText(hud.timer,formatClock(game.time));
 hudText(hud.saved,game.saved);hudText(hud.level,'Lv. '+game.level);hudStyle(hud.xpFill,'width',game.exp/game.nextExp*100+'%');hudText(hud.xpLabel,game.exp+' / '+game.nextExp);
 for(const slot of ['main','offhand']){
  const weapon=WEAPONS[game.loadout[slot]],card=hud[slot+'Weapon'];
  hudText(hud[slot+'WeaponName'],weapon.name+' Lv.'+game.weaponLevel(weapon.id));const icon=hud[slot+'WeaponIcon'];hudWrite(icon,'icon',weapon.id,()=>{icon.innerHTML=weaponIcon(weapon.id);});
  hudStyle(card,'--weapon-color',weapon.color);hudProp(card,'title',weapon.description);
 }
 const twoHanded=WEAPONS[game.twoHanded],storedTwoHanded=WEAPONS[game.twoHandedWeapon];
 hudClass(hud.game,'has-twohand',Boolean(storedTwoHanded));
 hudProp(hud.twoHandedBar,'hidden',!storedTwoHanded);
 hudClass(hud.twoHandedBar,'active',Boolean(twoHanded));
 if(storedTwoHanded)hudText(hud.twoHandedName,storedTwoHanded.name+' Lv.'+game.weaponLevel(storedTwoHanded.id));
 hudText(hud.twoHandedSlotLabel,twoHanded?'雙手 · 使用中':'雙手 · 背負');
 hudText(hud.stowTwoHanded,twoHanded?'收起雙手砲':'使用雙手砲');
 hudAttr(hud.stowTwoHanded,'aria-pressed',String(Boolean(twoHanded)));
 hudText(hud.mainSlotLabel,twoHanded?'主手 · 背負':'主手');
 hudText(hud.offhandSlotLabel,twoHanded?'副手 · 暫停':'副手');
 hudClass(hud.loadout,'stowed',Boolean(twoHanded));
 const magic=game.magic,charge=Math.min(magic.goal,Math.max(0,magic.charge));
 hudStyle(hud.magicFill,'width',(magic.evolved?100:charge/magic.goal*100)+'%');hudStyle(hud.offhandWeapon,'--charge',String(magic.evolved?100:Math.round(charge/magic.goal*100)));
 hudText(hud.magicLabel,(magic.evolved?'法器已進化':'魔力 '+charge+' / '+magic.goal)+(twoHanded?' · 暫停':''));
 hudClass(hud.magicMeter,'evolved',magic.evolved);
 hudAttr(hud.magicMeter,'aria-label',(magic.evolved?'副手法器已進化，本局保留此法器的進化':'副手魔力 '+charge+' / '+magic.goal+'，救援朋友可充能')+(twoHanded?'。使用雙手砲時暫停，收起後恢復。':''));
 hudAttr(hud.magicMeter,'aria-valuenow',magic.evolved?magic.goal:charge);hudAttr(hud.magicMeter,'aria-valuemax',magic.goal);
 hudClass(hud.offhandWeapon,'evolved',magic.evolved);
 hudProp(hud.stowTwoHanded,'disabled',game.status!=='running');
}
function restart(){debugMap=null;reset();game.start();syncOverlay();}
function resume(){clearInput();unlockAudio();game.resume();syncOverlay();}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function pickupCard(weapon,label,modifier=''){
 return `<article class="pickup-card ${modifier}" style="--weapon-color:${escapeHtml(weapon.color)}"><small>${label}</small><span class="pickup-icon" aria-hidden="true">${weaponIcon(weapon.id)}</span><h3>${escapeHtml(weapon.name)}${weapon.id!=='none'?' · Lv.'+game.weaponLevel(weapon.id):''}</h3><p>${escapeHtml(weapon.description)}</p></article>`;
}
function statTile(value,label,record=false){
 return `<div class="stat${record?' record':''}"><b>${escapeHtml(value)}</b><small>${label}</small>${record?'<span class="badge">新紀錄</span>':''}</div>`;
}
function renderBestLine(){
 const el=$('#bestLine');if(!el)return;const r=readRecords(storage());
 el.hidden=!r.runs;if(r.runs)el.innerHTML=`${iconSvg('i-trophy')}<span>最佳紀錄 ${formatClock(r.time)} · 救回 ${r.saved} 位 · Lv. ${r.level}</span>`;
}
function recordRun(){
 if(recordedGame===game)return recordResult;
 const run={time:Math.floor(game.time),saved:game.saved,level:game.level,bosses:runTrack.bosses};
 const merged=mergeRecords(readRecords(storage()),run);writeRecords(storage(),merged.records);
 recordedGame=game;recordResult=merged;return merged;
}
function choiceCountdownMarkup(){return autoChoose?'<div class="choice-countdown" id="choiceCountdown"><span id="choiceCountdownText" role="timer" aria-live="off"></span><span id="choiceCountdownAnnounce" class="visually-hidden" aria-live="polite"></span><span class="choice-countdown-track"><span id="choiceCountdownBar" class="choice-countdown-bar"></span></span></div>':'';}
function syncOverlay(){
 // A second pickup can follow the first without leaving the pickup state.
 const statusKey=game.status+':'+(game.pendingPickup?.id??'');
 if(lastStatus===statusKey)return;
 clearChoiceTimer();
 lastStatus=statusKey;overlay.classList.toggle('shown',game.status!=='running');
 overlay.setAttribute('aria-hidden',game.status==='running'?'true':'false');dialog.dataset.state=game.status;
 if(game.status==='running'){if(dialog.contains(document.activeElement))canvas.focus({preventScroll:true});return;}
 clearInput();hurtTimer=0;hudClass(hud.vignette,'hurt',false);
 let autoTarget=null,autoLabel='',autoResolve=null;
 if(game.status==='paused'){
  dialog.innerHTML=`<div class="eyebrow"><img class="brand-mark" src="assets/brand/brand-mark.png" alt="" width="20" height="20" decoding="async">PAUSED</div><h2 id="dialogTitle">暫停中</h2><p class="lead">時間已經停下，朋友們會等你回來。</p>`
   +`<div class="run-summary">${statTile(formatClock(game.time),'救援時間')}${statTile(game.saved,'救回朋友')}${statTile('Lv. '+game.level,'目前等級')}</div>`
   +`<div class="settings-columns"><section class="settings-group"><h3>畫面與聲音</h3>`
   +`<label class="setting">音效音量 <input id="volume" type="range" min="0" max="1" step=".05" value="${volume}"></label>`
   +`<label class="setting">畫面品質 <select id="quality"><option value="low">省電</option><option value="balanced">均衡</option><option value="high">精緻</option></select></label>`
   +`<label class="setting auto-equip-setting"><span>顯示效能數字<small>電腦也可以按 F3 切換</small></span><input id="showStats" type="checkbox" ${showStats?'checked':''}></label></section>`
   +`<section class="settings-group"><h3>遊戲</h3>`
   +`<label class="setting auto-equip-setting"><span>撿到武器自動換上<small>預設關閉：先比較，再決定要不要換</small></span><input id="autoEquip" type="checkbox" ${autoEquip?'checked':''}></label>`
   +`<label class="setting auto-equip-setting"><span>選擇時倒數 10 秒自動決定<small>預設關閉；升級或比較武器時才會倒數</small></span><input id="autoChoose" type="checkbox" ${autoChoose?'checked':''}></label>`
   +`<label class="setting">下一局隊員 <select id="nextHero"><option value="pudding">布丁狗</option><option value="polar">北極熊</option></select></label></section></div>`
   +`<div class="pause-actions"><button id="resume" class="primary">繼續救援 ${iconSvg('i-play')}</button><button id="restart" class="secondary">重新開始 · 隨機世界</button></div>`;
  $('#nextHero').value=selectedHero;$('#nextHero').onchange=e=>{selectedHero=e.target.value==='polar'?'polar':'pudding';saveSettings();};
  $('#quality').value=quality;$('#quality').onchange=e=>{setQuality(e.target.value);saveSettings();};
  $('#volume').oninput=e=>{volume=Number(e.target.value);unlockAudio();saveSettings();};
  $('#volume').onchange=()=>saveSettings();
  $('#autoEquip').onchange=e=>setAutoEquip(e.target.checked);
  $('#autoChoose').onchange=e=>{autoChoose=Boolean(e.target.checked);saveSettings();};
  $('#showStats').onchange=e=>{setStatsVisible(e.target.checked);};
  $('#resume').onclick=resume;$('#restart').onclick=restart;
 }else if(game.status==='pickup'){
  const pickup=game.pendingPickup,incoming=WEAPONS[pickup?.weaponId],isTwoHanded=pickup?.slot==='twohand';
  const current=isTwoHanded?(WEAPONS[game.twoHandedWeapon]||{id:'none',name:'尚未裝備雙手砲',icon:'◇',color:'#b5b9b4',description:'主手武器與副手法器同時使用中。'}):WEAPONS[game.loadout[pickup?.slot]];
  if(!incoming||!current)return;
  const same=incoming.id===current.id,slotName=isTwoHanded?'雙手武器':pickup.slot==='main'?'主手武器':'副手法器';
  const change=pickup.levelChange;
  const note=(change?.before===0?`解鎖 ${incoming.name} · Lv.1！之後每撿到一次就再升 1 級。`:`${incoming.name} 強化了：Lv.${change?.before??1} → Lv.${change?.after??game.weaponLevel(incoming.id)}，傷害 ×${game.weaponPower(incoming.id).toFixed(2)}。`)+(isTwoHanded?'使用雙手砲時主手與副手會暫停，三個欄位都會保留，隨時可以切換。':pickup.slot==='offhand'?'每種法器的充能與進化分別保留；武器等級另外加成。':'只會替換主手武器，副手不受影響。');
  const stowNote=game.twoHanded&&!isTwoHanded?' 換裝後，雙手砲會背在身上保留。':'';
  dialog.innerHTML=`<div class="eyebrow">NEW GEAR</div><h2 id="dialogTitle">撿到${slotName}</h2><p class="lead">時間已暫停。無論保留或換裝，這次拾取的強化都會保留。</p><div class="pickup-comparison">${pickupCard(current,'目前裝備','current')}${pickupCard(incoming,'剛剛撿到','incoming')}</div><p class="pickup-note">${note}${stowNote}</p><div class="pickup-actions"><button id="keepWeapon" class="secondary">保留目前裝備</button><button id="replaceWeapon" class="primary">${same?'使用這把武器':'換上新'+(pickup.slot==='offhand'?'法器':'武器')}</button></div>${choiceCountdownMarkup()}<p class="pickup-tip">想要撿到就自動換上，可以到右上角「設定」開啟。</p><button id="pickupRestart" class="text-button">重新開始 · 隨機世界</button>`;
  const pickupGame=game;
  const resolve=replace=>{if(game!==pickupGame||game.status!=='pickup'||game.pendingPickup?.id!==pickup.id)return;clearInput();game.resolvePickup(replace);renderDirty=true;lastStatus='';syncHud();syncOverlay();};
  $('#keepWeapon').onclick=()=>resolve(false);$('#replaceWeapon').onclick=()=>resolve(true);$('#pickupRestart').onclick=restart;
  const replace=recommendPickup(game,pickup);
  autoTarget=replace?$('#replaceWeapon'):$('#keepWeapon');autoLabel=replace?'換上新'+(pickup.slot==='offhand'?'法器':'武器'):isTwoHanded?'保留目前裝備（雙手砲未換上）':'保留目前裝備';autoResolve=()=>resolve(replace);
 }else if(game.status==='upgrade'){
  dialog.innerHTML=`<div class="eyebrow">LEVEL UP</div><h2 id="dialogTitle">升級了！Lv. ${game.level}</h2><p class="lead">挑一份新的力量，時間會等你。</p><div class="choices">${UPGRADES.map((u,i)=>`<button class="choice" data-upgrade="${u.id}"><kbd>${i+1}</kbd><span class="choice-icon">${iconSvg(UPGRADE_ICONS[u.id]||'i-pulse')}</span><b>${u.name}</b><small>${u.description}</small></button>`).join('')}</div>${choiceCountdownMarkup()}`;
  const upgradeGame=game,upgradeLevel=game.level;
  dialog.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>{if(game!==upgradeGame||game.status!=='upgrade'||game.level!==upgradeLevel)return;clearInput();game.upgrade(b.dataset.upgrade);renderDirty=true;lastStatus='';syncHud();syncOverlay();});
  const upgradeId=recommendUpgrade(game,UPGRADES),upgrade=UPGRADES.find(u=>u.id===upgradeId);
  autoTarget=[...dialog.querySelectorAll('[data-upgrade]')].find(b=>b.dataset.upgrade===upgradeId);autoLabel=upgrade?.name||'';autoResolve=()=>autoTarget?.onclick?.();
 }else if(game.status==='ended'){
  const survived=game.reason==='survived',{records,beaten}=recordRun(),best=bestWeapon(game.weaponLevels,WEAPONS);
  dialog.innerHTML=`<div class="eyebrow">${survived?'MISSION COMPLETE':'RESCUE REPORT'}</div><h2 id="dialogTitle">${survived?'天亮了，救援成功！':'今天的光，已經很溫暖'}</h2><p class="lead">${survived?'你守護這個小世界整整 20 分鐘。':'休息一下，下一趟冒險會是全新的開始。'}</p>`
   +`<div class="result-hero ${game.heroId}"><img src="assets/${game.heroId}-portrait.png" alt="" width="256" height="256"><span><b>${heroNames[game.heroId]}</b><br>${escapeHtml(names[game.map])}</span></div>`
   +`<div class="results">${statTile(formatClock(game.time),'救援時間',beaten.time)}${statTile(game.saved,'救回朋友',beaten.saved)}${statTile('Lv. '+game.level,'最終等級',beaten.level)}${statTile(runTrack.bosses,'救回首領',beaten.bosses)}${statTile(best?WEAPONS[best.id].name:'—','最強武器')}${statTile(best?'Lv. '+best.level:'—','武器等級')}</div>`
   +`<p class="records-line">${iconSvg('i-trophy')}<span>個人最佳 ${formatClock(records.time)} · 救回 ${records.saved} 位 · Lv. ${records.level} · 首領 ${records.bosses}</span></p>`
   +`<button id="again" class="primary">再出發 · 隨機世界 ${iconSvg('i-play')}</button>`;
  $('#again').onclick=restart;
 }
 startChoiceTimer(autoTarget,autoLabel,autoResolve);
 (autoChoose&&autoTarget?autoTarget:dialog.querySelector('#keepWeapon,#resume,.choice,#again,#start'))?.focus({preventScroll:true});
}
function syncCollection(entities,collection,kind){const ids=new Set(entities.map(e=>e.id));for(const[id,o]of collection){if(!ids.has(id)){scene.remove(o.mesh);if(kind==='bullet')bulletPool.push(o.mesh);else(kind==='enemy'?enemyPool:freePool)[o.type].push(o.mesh);collection.delete(id);}}for(const e of entities){let o=collection.get(e.id);if(!o){let mesh;if(kind==='bullet'){mesh=bulletPool.pop()||makeBullet();}else{mesh=(kind==='enemy'?enemyPool:freePool)[e.type].pop()||makePlush(THREE,{type:e.type,rescued:kind==='free'});if(kind==='free'){mesh.userData.setRescued?.();mesh.userData.startRescueAnimation?.();}}o={mesh,type:e.type};collection.set(e.id,o);if(kind==='bullet')scene.add(mesh);}if(kind==='bullet')weaponVisuals.styleBullet(o.mesh,e);o.mesh.position.set(e.x,kind==='bullet'?(e.y??game.muzzleOffset.y):0,e.z);o.mesh.rotation.y=kind==='bullet'?Math.atan2(e.vx,e.vz):e.angle;o.mesh.userData.animate?.(game.time+e.id,true);if(kind==='free')o.mesh.scale.setScalar((e.boss?bossVisualScale(e,o.mesh.userData.radius):1)*Math.min(1,e.life/.65));else if(kind!=='bullet')o.mesh.scale.setScalar(1);}}
function updateCamera(){
 const focus=cameraFocus(game.player,innerWidth,innerHeight);cameraTarget.set(focus.x,focus.y,focus.z);
 camera.position.set(cameraTarget.x+cameraDelta.x,cameraTarget.y+cameraDelta.y,cameraTarget.z+cameraDelta.z);
 camera.lookAt(cameraTarget);positionCameraFill(fill,cameraTarget,camera);sun.target.position.copy(cameraTarget);sun.position.set(cameraTarget.x-14,26,cameraTarget.z+8);
}
function syncModels(){
 ordinaryEnemies.length=0;for(const e of game.enemies)if(!e.boss)ordinaryEnemies.push(e);
 syncCollection(ordinaryEnemies,enemies,'enemy');bossVisuals.sync(game);syncCollection(game.rescued,rescued,'free');syncCollection(game.bullets,bullets,'bullet');
 allyVisuals.sync(game,{reduceMotion:reduceMotion()});shotVisuals.sync(game.bullets,game.muzzleOffset.y);
 crowd.sync([enemies,rescued,allyVisuals.models],{dirty:true});
 hero.position.set(game.player.x,0,game.player.z);hero.rotation.y=game.player.angle;
 // Reduced motion replaces the 12 Hz hurt blink with the steady vignette flash.
 hero.visible=game.invuln===0||reduceMotion()||Math.floor(game.time*12)%2===0;
 weaponVisuals.sync(game,hero);
 fx.shadows(game.player,game.enemies,game.rescued);
}
const tapPoint=new THREE.Vector3(),tapAxes={right:new THREE.Vector3(),up:new THREE.Vector3()};
// The canvas box in CSS pixels; pointer coordinates use the same space.
function viewRect(){const r=canvas.getBoundingClientRect?.();return r&&r.width>0&&r.height>0?{left:r.left,top:r.top,width:r.width,height:r.height}:{left:0,top:0,width:innerWidth,height:innerHeight};}
function projectToScreen(x,y,z,view=viewRect()){
 tapPoint.set(x,y,z).project(camera);
 if(!Number.isFinite(tapPoint.x)||!Number.isFinite(tapPoint.y)||tapPoint.z>1||tapPoint.z<-1)return null;
 return {x:view.left+(tapPoint.x+1)/2*view.width,y:view.top+(1-tapPoint.y)/2*view.height,z:tapPoint.z};
}
// Resolve queued taps against what the player saw: the camera pose of the last
// render and the drops drawn at the last sync (inside the render pool, label
// shown or not). Any drop on screen can be tapped; there is no distance limit.
// The drawn drops as hit shapes, from the camera pose of the last render. With
// hiddenId, also the shape of that drop when it is still in the game but not drawn
// (the dark beat of its expiry blink), with its label only if hiddenLabel (the label
// was shown when the drop was last drawn, so a hover on the label is held too).
function dropShapes(hiddenId=null,hiddenLabel=false){
 camera.updateMatrixWorld();
 tapAxes.right.setFromMatrixColumn(camera.matrixWorld,0).normalize();tapAxes.up.setFromMatrixColumn(camera.matrixWorld,1).normalize();
 const view=viewRect(),drawn=weaponVisuals.drawnDrops?.()??new Map(),project=(x,y,z)=>projectToScreen(x,y,z,view),shapes=[];let hidden=null;
 for(const drop of game.drops){
  const seen=drawn.get(drop.id);
  if(seen&&drop.life>0)shapes.push(dropHitShape(drop,project,tapAxes,view,seen));
  else if(!seen&&drop.id===hiddenId&&drop.life>0)hidden=dropHitShape(drop,project,tapAxes,view,{labelVisible:hiddenLabel});
 }
 return {shapes,hidden};
}
function resolveTaps(){
 if(!pendingTaps.length)return;
 while(pendingTaps.length){
  const tap=pendingTaps.shift();if(game.status!=='running')continue;
  const drop=pickDropAt(tap,dropShapes().shapes);
  if(drop&&game.tapPickup(drop.id))renderDirty=true;
 }
}
// V12.2.1: a resting mouse takes the drop under it after 0.5 s (see createHoverTracker).
// Exact hits only (no tap margin); HUD panels cover the world; any state other than a
// plain running game, or an open dialog, restarts the hover.
function resolveHover(realDt){
 // Every early return also drops the pending move, so a HUD panel or dialog that goes away never lets an old move start a hover.
 if(!hoverPoint||game.status!=='running'||overlay.classList.contains('shown')||pointCovered(hoverPoint,hudOccluders)){hover.reset();hoverMoved=false;hoverLabel=false;showHoverRing(null);return;}
 // Nothing tracked and no mouse move since the last frame: a hover can only start from a move, so skip the projections.
 if(hover.id===null&&!hoverMoved){showHoverRing(null);return;}
 const {shapes,hidden}=dropShapes(hover.id,hoverLabel),hit=pickDropAt(hoverPoint,shapes,{margin:0}),held=!hit&&hidden&&pickDropAt(hoverPoint,[hidden],{margin:0}),
  state=hover.update({hitId:hit?hit.id:null,hiddenId:held?held.id:null,dtMs:realDt*1000,moved:hoverMoved});
 // Remember whether the hovered drop's label was drawn, for its next dark beat (kept while held).
 if(hit)hoverLabel=Boolean(weaponVisuals.drawnDrops?.().get(hit.id)?.labelVisible);else if(!held)hoverLabel=false;
 hoverMoved=false;
 if(state.fire!==null){
  // After a hover pickup the mouse has to move again before another one can start.
  hoverPoint=null;showHoverRing(null);
  if(game.tapPickup(state.fire))renderDirty=true;
  return;
 }
 // The ring appears as soon as the hover is running, before any progress, so slow frames still show feedback.
 showHoverRing(state.armed?{x:hoverPoint.x,y:hoverPoint.y,progress:state.progress}:null);
}
const hoverRing=$('#hoverRing');
function showHoverRing(info){
 if(!hoverRing)return;
 if(!info){if(!hoverRing.hidden)hoverRing.hidden=true;return;}
 hoverRing.hidden=false;hoverRing.style.left=info.x+'px';hoverRing.style.top=info.y+'px';hoverRing.style.setProperty('--hover',String(Math.round(info.progress*360)));
}
function effects(dt){
 const heard=new Set();
 for(const event of game.events){
  // A large area rescue can free dozens of friends in the same frame.
  // Keep every visual burst, but never create dozens of audio voices at once.
  // Ally beams and bolt hits are frequent and quiet: they get no voice of their own.
  if(!event.kind.startsWith('ally')&&event.kind!=='hit'&&!heard.has(event.kind)&&heard.size<4){heard.add(event.kind);sound(event.kind);}
  if(event.kind==='rescue'){fx.burst(event.x,event.z);bumpTimer=.32;}
  else if(event.kind==='hurt')hurtTimer=.5;
  else if(event.kind==='boss')showNotice(event.boss==='big'?'大首領「星冠守護者」來襲！':'小首領「補丁隊長」出現了！',event.boss==='big'?'big':'boss',2.8,3);
  else if(event.kind==='allyShot')allyVisuals.shot(event);
  else if(event.kind==='hit')shotVisuals.hit(event,{reduceMotion:reduceMotion(),quality});
  else if(event.kind==='allyLeave')fx.burst(event.x,event.z);
  else if(event.kind==='skill'){const u=UPGRADES.find(x=>x.id===event.upgradeId);if(u)showNotice('獲得技能 · '+u.name+'：'+u.description,'good',2.4,1);}
 }
 fx.update(dt,camera);weaponVisuals.update(dt,game.events,game,camera);allyVisuals.update(dt);shotVisuals.update(dt,camera);
}
setQuality(quality);reset();resize();renderBestLine();
// Visual hero cards drive the original #heroSelect value/change interface.
const heroCards=[$('#heroCardPudding'),$('#heroCardPolar')].filter(Boolean);
function syncHeroCards(){for(const card of heroCards)card.setAttribute('aria-pressed',String(card.dataset.hero===selectedHero));}
// Restore the remembered hero and diagnostics switch without writing them back.
$('#heroSelect').value=selectedHero;syncHeroCards();setStatsVisible(showStats,false);
$('#heroSelect').onchange=e=>{selectedHero=e.target.value==='polar'?'polar':'pudding';$('#heroSelect').value=selectedHero;syncHeroCards();saveSettings();reset();};
for(const card of heroCards)card.onclick=()=>{if(card.dataset.hero===selectedHero)return;const select=$('#heroSelect');select.value=card.dataset.hero;select.onchange({target:select});};$('#start').onclick=()=>{unlockAudio();game.start();syncOverlay();};let previous=performance.now();
function loop(now){
 requestAnimationFrame(loop);
 const realDt=(now-previous)/1000,dt=Math.min(.05,realDt);previous=now;
 const active=game.status==='running',movement=input();
 if(active){
  hero.userData.animate?.(Math.min(LIMITS.duration,game.time+dt),Math.hypot(movement.x,movement.z)>.1);
  hero.userData.getMuzzleOffset(game.muzzleOffset);
 }
 game.step(dt,movement);
 if(active){trackRun();tickPresentation(dt);}
 if(active)resolveTaps();
 resolveHover(realDt);
 updateCamera();
 if(active)effects(dt);else{fx.update(0,camera);weaponVisuals.update(0,[],game,camera);}
 if(active||renderDirty){syncModels();syncHud();renderDirty=false;}
 else crowd.sync(null,{dirty:false});
 syncOverlay();advanceChoiceTimer(realDt);renderer.render(scene,camera);
 frameTime+=realDt;frames++;
 if(frameTime>.5){fps=Math.round(frames/frameTime);frameTime=0;frames=0;if(showStats)syncStats();}
}
requestAnimationFrame(loop);
window.__PLUSH_QA__={revision:'v12.3.3-brand-r1',get records(){return readRecords(storage());},get settings(){return readSettings(storage());},get autoChoice(){return choiceTimer&&{remaining:choiceTimer.remaining,target:choiceTimer.label,cancelled:choiceTimer.cancelled};},get presentation(){return {notice:hud.notice.textContent,noticeTimer,bossesRescued:runTrack.bosses,bossClock:hud.bossClockText.textContent};},get game(){return game;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},setMap(index){debugMap=String(index);reset();game.start();syncOverlay();},pause,resume,restart,get weaponVisuals(){return weaponVisuals;},get bossVisuals(){return bossVisuals;},get shotVisuals(){return shotVisuals;},get allyVisuals(){return allyVisuals.stats;},quality:setQuality,limits:LIMITS,cameraSpec:CAMERA,screenToWorldInput,screenToWorldAt,get effects(){return {halos:fx.haloCount,particles:fx.particleCount};},previewRescue(){fx.burst(game.player.x+1.6,game.player.z);},get crowd(){return crowd.stats;},renderOnce(){syncModels();updateCamera();fx.update(0,camera);weaponVisuals.update(0,[],game,camera);syncHud();syncOverlay();renderDirty=false;renderer.render(scene,camera);}};
