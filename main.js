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
let recordedGame=null,recordResult=null;
// Short taps on drops (V12.1): each pointer is judged at release; the loop resolves them.
const taps=createTapTracker(),pendingTaps=[],tapClock=()=>performance.now();
// V12.2.1 mouse hover pickup: the last mouse position (null until the mouse moves over the game) and whether it moved since the last frame.
const hover=createHoverTracker();let hoverPoint=null,hoverMoved=false,hoverLabel=null;
function clearHover(){hover.reset();hoverPoint=null;hoverMoved=false;hoverLabel=null;showHoverRing(null);}
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
 touchFx.begin(e.pointerId,e.clientX,e.clientY,e.pointerType,{reduceMotion:reduceMotion()});
 // Tracked presses (never buttons or dialogs, which returned above) keep the browser
 // from adding its own handling to the extra finger.
 e.preventDefault();
},{passive:false});
// Safari ignores touch-action for pinch; stop its gesture only while the game is running
// so dialogs and the rest of the page keep their zoom.
document.addEventListener('pointerout',e=>{if(e.pointerType==='mouse'&&!e.relatedTarget)clearHover();});
document.addEventListener('gesturestart',e=>{if(game.status==='running'&&!overlay.classList.contains('shown')&&$('#game').contains(e.target))e.preventDefault();},{passive:false});
document.addEventListener('pointermove',e=>{
 taps.move(e.pointerId,e.clientX,e.clientY);touchFx.move(e.pointerId,e.clientX,e.clientY);
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
 touchFx.end(e.pointerId);
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
function clearInput(){touchFx.clear();clearHover();taps.clear();pendingTaps.length=0;endStick();keys.clear();}
function pause(){game.pause();clearInput();syncOverlay();}
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('resize',()=>{clearInput();resize();});
window.addEventListener('keydown',e=>{const action=routeKeyDown(e,game.status,keys);if(action==='pause')pause();else if(action==='resume'){game.resume();syncOverlay();}else if(action==='stats'){setStatsVisible(!prefs.stats);}else if(action?.startsWith('upgrade:')){dialog.querySelectorAll('[data-upgrade]')[Number(action.slice(8))-1]?.onclick?.();}});
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
$('#stowTwoHanded').onclick=()=>{if(game.status!=='running'||!game.twoHandedWeapon)return;keys.clear();game.toggleTwoHanded();renderDirty=true;hudView.sync(game);canvas.focus({preventScroll:true});};
function input(){return screenToWorldAt({x:stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z:stick.z+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)},camera,game.player,innerWidth,innerHeight);}
// The HUD (hud.js): permanent nodes, change-only writes, notices and hit/rescue feedback.
const hudView=createHud({doc:document,heroNames}),hud=hudView.els,hudOccluders=hudView.occluders;
const showNotice=hudView.showNotice;
function syncStats(){hudView.syncStats({fps,game,calls:renderer.info.render.calls,quality:prefs.quality});}
function setStatsVisible(value,persist=true){prefs.stats=Boolean(value);hud.stats.hidden=!prefs.stats;if(prefs.stats)syncStats();if(persist)settings.save();}
function startGame(){shaderWarmup.startedBeforeReady=!shaderWarmup.ready;game.start();}
function restart(){debugMap=null;reset();startGame();syncOverlay();}
function resume(){clearInput();sfx.unlock();game.resume();syncOverlay();}
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
const QUALITY_CHOICES=[['low','省電'],['balanced','均衡'],['high','精緻']],HERO_CHOICES=[['pudding','布丁狗'],['polar','北極熊']];
// Native radios keep arrow keys, Tab order and screen-reader state; CSS only draws them as one row.
function segmented(name,label,choices,current){
 return `<div class="setting setting-choice" role="radiogroup" aria-labelledby="${name}Label"><span id="${name}Label">${label}</span><span class="segments">`
  +choices.map(([value,text])=>`<label class="segment"><input id="${name}-${value}" type="radio" name="${name}" value="${value}" ${value===current?'checked':''}><span>${text}</span></label>`).join('')+`</span></div>`;
}
function syncOverlay(){
 // A second pickup can follow the first without leaving the pickup state.
 const statusKey=game.status+':'+(game.pendingPickup?.id??'');
 if(lastStatus===statusKey)return;
 choiceTimer.clear();
 lastStatus=statusKey;overlay.classList.toggle('shown',game.status!=='running');
 overlay.setAttribute('aria-hidden',game.status==='running'?'true':'false');dialog.dataset.state=game.status;
 if(game.status==='running'){if(dialog.contains(document.activeElement))canvas.focus({preventScroll:true});return;}
 clearInput();hudView.clearHurt();
 let autoTarget=null,autoLabel='',autoResolve=null;
 if(game.status==='paused'){
  dialog.innerHTML=`<div class="pause-head"><h2 id="dialogTitle">暫停中</h2><p class="run-line">${formatClock(game.time)} · 救回 ${game.saved} · Lv. ${game.level}</p></div>`
   +`<div class="settings-columns"><section class="settings-group" aria-label="畫面與聲音">`
   +`<label class="setting">音效音量 <input id="volume" type="range" min="0" max="1" step=".05" value="${prefs.volume}"></label>`
   +segmented('quality','畫面品質',QUALITY_CHOICES,prefs.quality)
   +`<label class="setting">觸控特效<input id="touchFxOn" type="checkbox" ${prefs.touchFx?'checked':''}></label>`
   +`<label class="setting" title="電腦也可以按 F3 切換">顯示效能數字<input id="showStats" type="checkbox" ${prefs.stats?'checked':''}></label></section>`
   +`<section class="settings-group" aria-label="遊戲">`
   +`<label class="setting">撿到武器自動換上<input id="autoEquip" type="checkbox" ${prefs.autoEquip?'checked':''}></label>`
   +`<label class="setting">10 秒自動選擇<input id="autoChoose" type="checkbox" ${prefs.autoChoose?'checked':''}></label>`
   +segmented('nextHero','下一局隊員',HERO_CHOICES,prefs.hero)+`</section></div>`
   +`<div class="pause-actions"><button id="resume" class="primary">繼續救援 ${iconSvg('i-play')}</button><button id="restart" class="secondary">重新開始 · 隨機世界</button></div>`;
  for(const [value] of HERO_CHOICES)$('#nextHero-'+value).onchange=e=>{prefs.hero=e.target.value==='polar'?'polar':'pudding';settings.save();};
  for(const [value] of QUALITY_CHOICES)$('#quality-'+value).onchange=e=>{setQuality(e.target.value);settings.save();};
  $('#volume').oninput=e=>{prefs.volume=Number(e.target.value);sfx.unlock();settings.save();};
  $('#volume').onchange=()=>settings.save();
  $('#autoEquip').onchange=e=>setAutoEquip(e.target.checked);
  $('#autoChoose').onchange=e=>{prefs.autoChoose=Boolean(e.target.checked);settings.save();};
  $('#touchFxOn').onchange=e=>{prefs.touchFx=Boolean(e.target.checked);touchFx.setEnabled(prefs.touchFx);settings.save();};
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
  dialog.innerHTML=`<div class="eyebrow">NEW GEAR</div><h2 id="dialogTitle">撿到${slotName}</h2><p class="lead">時間已暫停。無論保留或換裝，這次拾取的強化都會保留。</p><div class="pickup-comparison">${pickupCard(current,'目前裝備','current')}${pickupCard(incoming,'剛剛撿到','incoming')}</div><p class="pickup-note">${note}${stowNote}</p><div class="pickup-actions"><button id="keepWeapon" class="secondary">保留目前裝備</button><button id="replaceWeapon" class="primary">${same?'使用這把武器':'換上新'+(pickup.slot==='offhand'?'法器':'武器')}</button></div>${choiceTimer.markup()}<p class="pickup-tip">想要撿到就自動換上，可以到右上角「設定」開啟。</p><button id="pickupRestart" class="text-button">重新開始 · 隨機世界</button>`;
  const pickupGame=game;
  const resolve=replace=>{if(game!==pickupGame||game.status!=='pickup'||game.pendingPickup?.id!==pickup.id)return;clearInput();game.resolvePickup(replace);renderDirty=true;lastStatus='';hudView.sync(game);syncOverlay();};
  $('#keepWeapon').onclick=()=>resolve(false);$('#replaceWeapon').onclick=()=>resolve(true);$('#pickupRestart').onclick=restart;
  const replace=recommendPickup(game,pickup);
  autoTarget=replace?$('#replaceWeapon'):$('#keepWeapon');autoLabel=replace?'換上新'+(pickup.slot==='offhand'?'法器':'武器'):isTwoHanded?'保留目前裝備（雙手砲未換上）':'保留目前裝備';autoResolve=()=>resolve(replace);
 }else if(game.status==='upgrade'){
  dialog.innerHTML=`<div class="eyebrow">LEVEL UP</div><h2 id="dialogTitle">升級了！Lv. ${game.level}</h2><p class="lead">挑一份新的力量，時間會等你。</p><div class="choices">${game.upgradeChoices.map(id=>UPGRADES.find(u=>u.id===id)).filter(Boolean).map((u,i)=>`<button class="choice" data-upgrade="${u.id}"><kbd>${i+1}</kbd><span class="choice-icon">${iconSvg(UPGRADE_ICONS[u.id]||'i-pulse')}</span><b>${u.name}</b><small>${u.description}</small></button>`).join('')}</div>${choiceTimer.markup()}`;
  const upgradeGame=game,upgradeLevel=game.level;
  dialog.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>{if(game!==upgradeGame||game.status!=='upgrade'||game.level!==upgradeLevel)return;clearInput();game.upgrade(b.dataset.upgrade);renderDirty=true;lastStatus='';hudView.sync(game);syncOverlay();});
  const upgradeId=recommendUpgrade(game,UPGRADES.filter(u=>game.upgradeChoices.includes(u.id))),upgrade=UPGRADES.find(u=>u.id===upgradeId);
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
 choiceTimer.start(autoTarget,autoLabel,autoResolve);
 (prefs.autoChoose&&autoTarget?autoTarget:dialog.querySelector('#keepWeapon,#resume,.choice,#again,#start'))?.focus({preventScroll:true});
}
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
// (the dark beat of its expiry blink), using hiddenLabel, how its label was last drawn
// (so a hover on the label is held too, at the size and place it was seen).
function dropShapes(hiddenId=null,hiddenLabel=null){
 camera.updateMatrixWorld();
 tapAxes.right.setFromMatrixColumn(camera.matrixWorld,0).normalize();tapAxes.up.setFromMatrixColumn(camera.matrixWorld,1).normalize();
 const view=viewRect(),drawn=weaponVisuals.drawnDrops?.()??new Map(),project=(x,y,z)=>projectToScreen(x,y,z,view),shapes=[];let hidden=null;
 for(const drop of game.drops){
  const seen=drawn.get(drop.id);
  if(seen&&drop.life>0)shapes.push(dropHitShape(drop,project,tapAxes,view,seen));
  else if(!seen&&drop.id===hiddenId&&drop.life>0)hidden=dropHitShape(drop,project,tapAxes,view,hiddenLabel??{labelVisible:false});
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
 if(!hoverPoint||game.status!=='running'||overlay.classList.contains('shown')||pointCovered(hoverPoint,hudOccluders)){hover.reset();hoverMoved=false;hoverLabel=null;showHoverRing(null);return;}
 // Nothing tracked and no mouse move since the last frame: a hover can only start from a move, so skip the projections.
 if(hover.id===null&&!hoverMoved){showHoverRing(null);return;}
 const {shapes,hidden}=dropShapes(hover.id,hoverLabel),hit=pickDropAt(hoverPoint,shapes,{margin:0}),held=!hit&&hidden&&pickDropAt(hoverPoint,[hidden],{margin:0}),
  state=hover.update({hitId:hit?hit.id:null,hiddenId:held?held.id:null,dtMs:realDt*1000,moved:hoverMoved});
 // Remember how the hovered drop's label was drawn, for its next dark beat (kept while held).
 if(hit)hoverLabel=weaponVisuals.drawnDrops?.().get(hit.id)??null;else if(!held)hoverLabel=null;
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
window.__PLUSH_QA__={revision:'v12.5.0-warmup-contrast-r1',get records(){return readRecords(storage());},get settings(){return readSettings(storage());},get autoChoice(){return choiceTimer.state;},get choiceTimer(){return choiceTimer;},get audio(){return sfx;},get hud(){return hudView;},get shaderWarmup(){return {...shaderWarmup,programs:renderer.info.programs?.length??0};},get presentation(){return {notice:hud.notice.textContent,noticeTimer:hudView.noticeTimer,bossesRescued:runTrack.bosses,bossClock:hud.bossClockText.textContent};},get game(){return game;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},setMap(index){debugMap=String(index);reset();startGame();syncOverlay();},pause,resume,restart,get weaponVisuals(){return weaponVisuals;},get bossVisuals(){return bossVisuals;},get enemyVisuals(){return enemyVisuals.stats;},get shotVisuals(){return shotVisuals;},get allyVisuals(){return allyVisuals.stats;},quality:setQuality,limits:LIMITS,cameraSpec:CAMERA,screenToWorldInput,screenToWorldAt,get effects(){return {halos:fx.haloCount,particles:fx.particleCount};},previewRescue(){fx.burst(game.player.x+1.6,game.player.z);},get crowd(){return crowd.stats;},get settingsStore(){return settings;},get input(){return {stick:{id:stick.id,x:stick.x,z:stick.z},hover:{id:hover.id,point:hoverPoint,moved:hoverMoved,label:hoverLabel},taps:taps.size,keys:keys.size};},renderOnce(){syncModels();updateCamera();fx.update(0,camera);weaponVisuals.update(0,[],game,camera,innerHeight);hudView.sync(game);syncOverlay();renderDirty=false;renderer.render(scene,camera);}};
