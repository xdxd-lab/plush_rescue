import * as THREE from './vendor/three.module.js';
import {Game,Stick,UPGRADES,LIMITS,healthLabel} from './core.js';
import {MAPS,buildMap} from './maps.js';
import {makePlush} from './characters.js';
import {CAMERA,cameraOffset,cameraFocus,createGameCamera,fitGameCamera,screenToWorldInput,screenToWorldAt} from './camera.js';
import {createEffects} from './effects.js';
import {isInteractiveTarget,routeKeyDown} from './keyboard.js';
import {createCrowd} from './crowd.js';
import {applyMapLighting,positionCameraFill} from './lighting.js';
import {WEAPONS} from './weapons.js';
import {createBossVisuals} from './boss-visuals.js';
import {createWeaponVisuals} from './weapon-visuals.js';
const $=s=>document.querySelector(s),canvas=$('#world'),overlay=$('#overlay'),dialog=$('#dialog');
let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){dialog.innerHTML='<h2>需要 3D 圖形支援</h2><p>請使用支援 WebGL 的瀏覽器，並開啟硬體加速後再試。</p>';throw e;}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#bdc2b1');scene.fog=new THREE.Fog('#bdc2b1',46,88);
const camera=createGameCamera(innerWidth,innerHeight,{orthographic:new URLSearchParams(location.search).get('camera')==='ortho'});const hemi=new THREE.HemisphereLight('#fff0d9','#637579',1.65);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe6bf',3.0);sun.position.set(-14,26,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:65});sun.shadow.normalBias=.018;sun.shadow.radius=2;sun.shadow.bias=-.0002;scene.add(sun);scene.add(sun.target);
const rim=new THREE.DirectionalLight('#d0e8f0',.85);rim.position.set(8,9,-15);scene.add(rim);
const fill=new THREE.DirectionalLight('#c7daf1',0);fill.name='Low camera-side moon bounce';fill.visible=false;fill.castShadow=false;scene.add(fill,fill.target);
let selectedHero='pudding';
const heroNames={pudding:'布丁狗',polar:'北極熊'};
let game,map,hero,quality='balanced',volume=.25,showStats=false,lastStatus='',frameTime=0,frames=0,fps=0,renderDirty=true;
// Storage can be unavailable in private mode or embedded previews. The default
// is always to ask; changing the setting still works for this session.
const autoEquipKey='plush-rescue:auto-equip';
let autoEquip=false;
try{autoEquip=localStorage.getItem(autoEquipKey)==='true';}catch{}
function setAutoEquip(value){autoEquip=Boolean(value);game.autoEquip=autoEquip;try{localStorage.setItem(autoEquipKey,String(autoEquip));}catch{}}
const crowd=createCrowd(THREE,scene,LIMITS);
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
function reset(){renderDirty=true;crowd.clear();weaponVisuals.clear();bossVisuals.clear();clearInput();if(map)map.dispose();if(hero)scene.remove(hero);releaseAll(enemies,o=>enemyPool[o.type].push(o.mesh));releaseAll(rescued,o=>freePool[o.type].push(o.mesh));releaseAll(bullets,o=>bulletPool.push(o.mesh));fx.clear();game=new Game({map:mapIndex(),autoEquip,heroId:selectedHero});map=buildMap(THREE,scene,game.map);game.obstacles=map.obstacles;game.bounds=map.bounds;Object.assign(game.player,map.spawn);hero=makePlush(THREE,{hero:true,heroId:game.heroId});hero.scale.setScalar(1.1);game.muzzleOffset=hero.userData.getMuzzleOffset();game.player.angle=Math.PI/3;scene.add(hero);$('#mapName').textContent=names[game.map];applyMapLighting(map.lighting,{scene,renderer,hemi,sun,rim,fill});lastStatus='';$('#notice').textContent='';syncHud();}
function resize(){let w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?2:quality==='balanced'?1.6:1));fitGameCamera(camera,w,h);}
function setQuality(v){quality=v;renderer.shadowMap.enabled=v!=='low';renderer.shadowMap.needsUpdate=true;resize();}
function updateStick(){const el=$('#stick');el.style.display=stick.id===null?'none':'block';el.style.left=stick.origin.x+'px';el.style.top=stick.origin.y+'px';$('#knob').style.transform=`translate(${stick.x*34}px,${stick.z*34}px)`;}
canvas.addEventListener('pointerdown',e=>{if(game.status!=='running')return;if(stick.begin(e.pointerId,e.clientX,e.clientY,innerWidth)){canvas.setPointerCapture(e.pointerId);updateStick();$('#moveHint').style.opacity='.15';}});
canvas.addEventListener('pointermove',e=>{if(stick.move(e.pointerId,e.clientX,e.clientY))updateStick();});for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{stick.end(e.pointerId);updateStick();});
function clearInput(){stick.reset();keys.clear();updateStick();}
function pause(){game.pause();clearInput();syncOverlay();}
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('resize',()=>{clearInput();resize();});
window.addEventListener('keydown',e=>{const action=routeKeyDown(e,game.status,keys);if(action==='pause')pause();else if(action==='resume'){game.resume();syncOverlay();}else if(action==='stats'){showStats=!showStats;$('#stats').hidden=!showStats;}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
// Keep keyboard navigation inside the active menu without changing native
// checkbox, slider, select, Space, or Escape behavior.
document.addEventListener('keydown',e=>{
 if(e.key!=='Tab'||game.status==='running')return;
 const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
 if(!controls.length)return;
 const first=controls[0],last=controls[controls.length-1];
 if(!dialog.contains(document.activeElement)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();first.focus();}
 else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
});
document.addEventListener('focusin',e=>{if(isInteractiveTarget(e.target))keys.clear();});$('#pause').onclick=pause;
$('#stowTwoHanded').onclick=()=>{if(game.status!=='running'||!game.twoHandedWeapon)return;clearInput();game.toggleTwoHanded();renderDirty=true;syncHud();canvas.focus({preventScroll:true});};
function input(){return screenToWorldAt({x:stick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),z:stick.z+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)},camera,game.player,innerWidth,innerHeight);}
function syncHud(){
 const p=game.player;
 $('#heroPortrait').setAttribute('src','assets/'+game.heroId+'-portrait.png');$('#heroPortrait').setAttribute('alt',heroNames[game.heroId]+'救援隊員');
 let boss=null;for(const e of game.enemies)if(e.boss&&(!boss||e.boss==='big'&&boss.boss!=='big'))boss=e;
 $('#bossPanel').hidden=!boss;if(boss){$('#bossName').textContent=(boss.boss==='big'?'大首領 · 星冠守護者':'小首領 · 補丁隊長');$('#bossHp').textContent=Math.ceil(boss.hp)+' / '+boss.maxHp;$('#bossFill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';}

 $('#hearts').textContent=healthLabel(p.hp,p.maxHp);$('#healthFill').style.width=p.hp/p.maxHp*100+'%';
 $('#timer').textContent=String(Math.floor(game.time/60)).padStart(2,'0')+':'+String(Math.floor(game.time%60)).padStart(2,'0');
 $('#saved').textContent=game.saved;$('#level').textContent='Lv. '+game.level;$('#xpFill').style.width=game.exp/game.nextExp*100+'%';$('#xpLabel').textContent=game.exp+' / '+game.nextExp;
 for(const slot of ['main','offhand']){
  const weapon=WEAPONS[game.loadout[slot]],card=$('#'+slot+'Weapon');
  $('#'+slot+'WeaponName').textContent=weapon.name+' Lv.'+game.weaponLevel(weapon.id);$('#'+slot+'WeaponIcon').textContent=weapon.icon;
  card.style.setProperty('--weapon-color',weapon.color);card.title=weapon.description;
 }
 const twoHanded=WEAPONS[game.twoHanded],storedTwoHanded=WEAPONS[game.twoHandedWeapon];
 $('#game').classList.toggle('has-twohand',Boolean(storedTwoHanded));
 $('#twoHandedBar').hidden=!storedTwoHanded;
 $('#twoHandedBar').classList.toggle('active',Boolean(twoHanded));
 if(storedTwoHanded)$('#twoHandedName').textContent=storedTwoHanded.name+' Lv.'+game.weaponLevel(storedTwoHanded.id);
 $('#twoHandedSlotLabel').textContent=twoHanded?'雙手 · 使用中':'雙手 · 背負';
 $('#stowTwoHanded').textContent=twoHanded?'收起雙手砲':'使用雙手砲';
 $('#stowTwoHanded').setAttribute('aria-pressed',String(Boolean(twoHanded)));
 $('#mainSlotLabel').textContent=twoHanded?'主手 · 背負':'主手';
 $('#offhandSlotLabel').textContent=twoHanded?'副手 · 暫停':'副手';
 $('.loadout').classList.toggle('stowed',Boolean(twoHanded));
 const magic=game.magic,charge=Math.min(magic.goal,Math.max(0,magic.charge));
 $('#magicFill').style.width=(magic.evolved?100:charge/magic.goal*100)+'%';
 $('#magicLabel').textContent=(magic.evolved?'法器已進化':'魔力 '+charge+' / '+magic.goal)+(twoHanded?' · 暫停':'');
 $('#magicMeter').classList.toggle('evolved',magic.evolved);
 $('#magicMeter').setAttribute('aria-label',(magic.evolved?'副手法器已進化，本局保留此法器的進化':'副手魔力 '+charge+' / '+magic.goal+'，救援朋友可充能')+(twoHanded?'。使用雙手砲時暫停，收起後恢復。':''));
 $('#magicMeter').setAttribute('aria-valuenow',magic.evolved?magic.goal:charge);$('#magicMeter').setAttribute('aria-valuemax',magic.goal);
 $('#offhandWeapon').classList.toggle('evolved',magic.evolved);
 $('#stowTwoHanded').disabled=game.status!=='running';
}
function restart(){debugMap=null;reset();game.start();syncOverlay();}
function resume(){clearInput();unlockAudio();game.resume();syncOverlay();}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function pickupCard(weapon,label,modifier=''){
 return `<article class="pickup-card ${modifier}" style="--weapon-color:${escapeHtml(weapon.color)}"><small>${label}</small><span class="pickup-icon" aria-hidden="true">${escapeHtml(weapon.icon)}</span><h3>${escapeHtml(weapon.name)}${weapon.id!=='none'?' · Lv.'+game.weaponLevel(weapon.id):''}</h3><p>${escapeHtml(weapon.description)}</p></article>`;
}
function syncOverlay(){
 // A second pickup can follow the first without leaving the pickup state.
 const statusKey=game.status+':'+(game.pendingPickup?.id??'');
 if(lastStatus===statusKey)return;
 lastStatus=statusKey;overlay.classList.toggle('shown',game.status!=='running');
 overlay.setAttribute('aria-hidden',game.status==='running'?'true':'false');dialog.dataset.state=game.status;
 if(game.status==='running'){if(dialog.contains(document.activeElement))canvas.focus({preventScroll:true});return;}
 clearInput();
 if(game.status==='paused'){
  dialog.innerHTML=`<div class="eyebrow">TAKE A LITTLE BREATHER</div><h2 id="dialogTitle">暫停與設定</h2><p class="lead">救援時間已暫停，朋友們會等你。</p><label class="setting">下局角色 <select id="nextHero"><option value="pudding">布丁狗</option><option value="polar">北極熊</option></select></label><label class="setting">音效音量 <input id="volume" type="range" min="0" max="1" step=".05" value="${volume}"></label><label class="setting">畫面品質 <select id="quality"><option value="low">省電</option><option value="balanced">均衡</option><option value="high">精緻</option></select></label><label class="setting auto-equip-setting"><span>拾取後強制自動換裝<small>預設關閉 · 關閉時先比較，再決定是否替換</small></span><input id="autoEquip" type="checkbox" ${autoEquip?'checked':''}></label><label class="setting">顯示效能數字 <input id="showStats" type="checkbox" ${showStats?'checked':''}></label><button id="resume" class="primary">繼續救援 →</button><button id="restart" class="secondary">重新開始 · 隨機世界</button>`;
  $('#nextHero').value=selectedHero;$('#nextHero').onchange=e=>{selectedHero=e.target.value==='polar'?'polar':'pudding';};
  $('#quality').value=quality;$('#quality').onchange=e=>setQuality(e.target.value);
  $('#volume').oninput=e=>{volume=Number(e.target.value);unlockAudio();};
  $('#autoEquip').onchange=e=>setAutoEquip(e.target.checked);
  $('#showStats').onchange=e=>{showStats=e.target.checked;$('#stats').hidden=!showStats;};
  $('#resume').onclick=resume;$('#restart').onclick=restart;
 }else if(game.status==='pickup'){
  const pickup=game.pendingPickup,incoming=WEAPONS[pickup?.weaponId],isTwoHanded=pickup?.slot==='twohand';
  const current=isTwoHanded?(WEAPONS[game.twoHandedWeapon]||{id:'none',name:'尚未裝備雙手砲',icon:'◇',color:'#b5b9b4',description:'主手武器與副手法器同時使用中。'}):WEAPONS[game.loadout[pickup?.slot]];
  if(!incoming||!current)return;
  const same=incoming.id===current.id,slotName=isTwoHanded?'雙手武器':pickup.slot==='main'?'主手武器':'副手法器';
  const change=pickup.levelChange;
  const note=(change?.before===0?`已解鎖 ${incoming.name} · Lv.1，之後每次拾取再升 1 級。`:`已強化 ${incoming.name}：Lv.${change?.before??1} → Lv.${change?.after??game.weaponLevel(incoming.id)}，傷害 ×${game.weaponPower(incoming.id).toFixed(2)}。`)+(isTwoHanded?'雙手砲使用時主副手暫停，三欄保留，可隨時切換。':pickup.slot==='offhand'?'每種法器的充能與進化分別保留；武器等級另行加成。':'只選擇手上武器，副手狀態保持。');
  const stowNote=game.twoHanded&&!isTwoHanded?' 換裝後會將雙手砲背負保留。':'';
  dialog.innerHTML=`<div class="eyebrow">A LITTLE DISCOVERY</div><h2 id="dialogTitle">拾獲${slotName}</h2><p class="lead">時間已暫停。無論保留或換裝，拾獲武器的強化都已保留。</p><div class="pickup-comparison">${pickupCard(current,'目前裝備','current')}${pickupCard(incoming,'剛剛拾獲','incoming')}</div><p class="pickup-note">${note}${stowNote}</p><div class="pickup-actions"><button id="keepWeapon" class="secondary">保留目前裝備</button><button id="replaceWeapon" class="primary">${same?'使用此武器':'換上新'+(pickup.slot==='offhand'?'法器':'武器')} →</button></div><p class="pickup-tip">自動換裝可在右上角「設定」中開啟。</p><button id="pickupRestart" class="text-button">重新開始 · 隨機世界</button>`;
  const pickupGame=game;
  const resolve=replace=>{if(game!==pickupGame||game.status!=='pickup'||game.pendingPickup?.id!==pickup.id)return;clearInput();game.resolvePickup(replace);renderDirty=true;lastStatus='';syncHud();syncOverlay();};
  $('#keepWeapon').onclick=()=>resolve(false);$('#replaceWeapon').onclick=()=>resolve(true);$('#pickupRestart').onclick=restart;
 }else if(game.status==='upgrade'){
  dialog.innerHTML=`<div class="eyebrow">A NEW LITTLE SUPERPOWER</div><h2 id="dialogTitle">成長了！ Lv. ${game.level}</h2><p class="lead">選一份溫柔的力量</p><div class="choices">${UPGRADES.map(u=>`<button class="choice" data-upgrade="${u.id}"><span>${u.icon}</span><b>${u.name}</b><small>${u.description}</small></button>`).join('')}</div>`;
  const upgradeGame=game,upgradeLevel=game.level;
  dialog.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>{if(game!==upgradeGame||game.status!=='upgrade'||game.level!==upgradeLevel)return;clearInput();game.upgrade(b.dataset.upgrade);renderDirty=true;lastStatus='';syncHud();syncOverlay();});
 }else if(game.status==='ended'){
  dialog.innerHTML=`<div class="eyebrow">EVERY FRIEND COUNTS</div><h2 id="dialogTitle">${game.reason==='survived'?'天亮了，救援成功！':'今天的光，已經很溫暖'}</h2><p class="lead">救回 ${game.saved} 位朋友 · 成長至 Lv. ${game.level}</p><div class="intro-icons">♡ ✦ ♡</div><p class="instructions">救援時間 ${$('#timer').textContent}<br>${game.reason==='survived'?'你守護了這個小世界 20 分鐘。':'本局已結束，下一段冒險會是全新的開始。'}</p><button id="again" class="primary">再出發 · 隨機世界 →</button>`;
  $('#again').onclick=restart;
 }
 dialog.querySelector('#keepWeapon,#resume,.choice,#again,#start')?.focus({preventScroll:true});
}
function syncCollection(entities,collection,kind){const ids=new Set(entities.map(e=>e.id));for(const[id,o]of collection){if(!ids.has(id)){scene.remove(o.mesh);if(kind==='bullet')bulletPool.push(o.mesh);else(kind==='enemy'?enemyPool:freePool)[o.type].push(o.mesh);collection.delete(id);}}for(const e of entities){let o=collection.get(e.id);if(!o){let mesh;if(kind==='bullet'){mesh=bulletPool.pop()||makeBullet();}else{mesh=(kind==='enemy'?enemyPool:freePool)[e.type].pop()||makePlush(THREE,{type:e.type,rescued:kind==='free'});if(kind==='free'){mesh.userData.setRescued?.();mesh.userData.startRescueAnimation?.();}}o={mesh,type:e.type};collection.set(e.id,o);if(kind==='bullet')scene.add(mesh);}if(kind==='bullet')weaponVisuals.styleBullet(o.mesh,e);o.mesh.position.set(e.x,kind==='bullet'?(e.y??game.muzzleOffset.y):0,e.z);o.mesh.rotation.y=kind==='bullet'?Math.atan2(e.vx,e.vz):e.angle;o.mesh.userData.animate?.(game.time+e.id,true);if(kind==='free')o.mesh.scale.setScalar(Math.min(1,e.life/.65));else if(kind!=='bullet')o.mesh.scale.setScalar(1);}}
function updateCamera(){
 const focus=cameraFocus(game.player,innerWidth,innerHeight);cameraTarget.set(focus.x,focus.y,focus.z);
 camera.position.set(cameraTarget.x+cameraDelta.x,cameraTarget.y+cameraDelta.y,cameraTarget.z+cameraDelta.z);
 camera.lookAt(cameraTarget);positionCameraFill(fill,cameraTarget,camera);sun.target.position.copy(cameraTarget);sun.position.set(cameraTarget.x-14,26,cameraTarget.z+8);
}
function syncModels(){
 ordinaryEnemies.length=0;for(const e of game.enemies)if(!e.boss)ordinaryEnemies.push(e);
 syncCollection(ordinaryEnemies,enemies,'enemy');bossVisuals.sync(game);syncCollection(game.rescued,rescued,'free');syncCollection(game.bullets,bullets,'bullet');
 crowd.sync([enemies,rescued],{dirty:true});
 hero.position.set(game.player.x,0,game.player.z);hero.rotation.y=game.player.angle;
 hero.visible=game.invuln===0||Math.floor(game.time*12)%2===0;
 weaponVisuals.sync(game,hero);
 fx.shadows(game.player,game.enemies,game.rescued);
}
function effects(dt){
 const heard=new Set();
 for(const event of game.events){
  // A large area rescue can free dozens of friends in the same frame.
  // Keep every visual burst, but never create dozens of audio voices at once.
  if(!heard.has(event.kind)&&heard.size<4){heard.add(event.kind);sound(event.kind);}
  if(event.kind==='rescue')fx.burst(event.x,event.z);
 }
 fx.update(dt,camera);weaponVisuals.update(dt,game.events,game,camera);
}
reset();resize();$('#heroSelect').onchange=e=>{selectedHero=e.target.value==='polar'?'polar':'pudding';reset();};$('#start').onclick=()=>{unlockAudio();game.start();syncOverlay();};let previous=performance.now();
function loop(now){
 requestAnimationFrame(loop);
 const realDt=(now-previous)/1000,dt=Math.min(.05,realDt);previous=now;
 const active=game.status==='running',movement=input();
 if(active){
  hero.userData.animate?.(Math.min(LIMITS.duration,game.time+dt),Math.hypot(movement.x,movement.z)>.1);
  hero.userData.getMuzzleOffset(game.muzzleOffset);
 }
 game.step(dt,movement);
 updateCamera();
 if(active)effects(dt);else{fx.update(0,camera);weaponVisuals.update(0,[],game,camera);}
 if(active||renderDirty){syncModels();syncHud();renderDirty=false;}
 else crowd.sync(null,{dirty:false});
 syncOverlay();renderer.render(scene,camera);
 frameTime+=realDt;frames++;
 if(frameTime>.5){fps=Math.round(frames/frameTime);frameTime=0;frames=0;}
 if(showStats)$('#stats').textContent=`${fps} FPS · ${game.enemies.length} 敵 / ${game.rescued.length} 自由 / ${game.bullets.length} 光束 · ${renderer.info.render.calls} calls · ${quality}`;
}
requestAnimationFrame(loop);
window.__PLUSH_QA__={revision:'v7-rescue-r1',get game(){return game;},get renderer(){return renderer;},get scene(){return scene;},get camera(){return camera;},setMap(index){debugMap=String(index);reset();game.start();syncOverlay();},pause,resume,restart,get weaponVisuals(){return weaponVisuals;},get bossVisuals(){return bossVisuals;},quality:setQuality,limits:LIMITS,cameraSpec:CAMERA,screenToWorldInput,screenToWorldAt,get effects(){return {halos:fx.haloCount,particles:fx.particleCount};},previewRescue(){fx.burst(game.player.x+1.6,game.player.z);},get crowd(){return crowd.stats;},renderOnce(){syncModels();updateCamera();fx.update(0,camera);weaponVisuals.update(0,[],game,camera);syncHud();syncOverlay();renderDirty=false;renderer.render(scene,camera);}};
