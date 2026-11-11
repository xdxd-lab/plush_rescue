import {UPGRADES} from './core.js';
import {WEAPONS} from './weapons.js';
import {recommendPickup,recommendUpgrade,iconSvg,weaponIcon,UPGRADE_ICONS,formatClock,readRecords,mergeRecords,writeRecords,bestWeapon} from './ui.js';

export function createDialogs({document,overlay,dialog,canvas,getGame,getLastStatus,setLastStatus,setRenderDirty,prefs,settings,choiceTimer,clearInput,hudView,runTrack,storage,heroNames,names,setQuality,sfx,setAutoEquip,touchFx,setStatsVisible,restart,resume}){
 const $=selector=>document.querySelector(selector);
 let recordedGame=null,recordResult=null;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function pickupCard(weapon,label,modifier=''){
 const game=getGame();
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
 const game=getGame();
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
 const game=getGame();
 // A second pickup can follow the first without leaving the pickup state.
 const statusKey=game.status+':'+(game.pendingPickup?.id??'');
 if(getLastStatus()===statusKey)return;
 choiceTimer.clear();
 setLastStatus(statusKey);overlay.classList.toggle('shown',game.status!=='running');
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
  const resolve=replace=>{if(getGame()!==pickupGame||game.status!=='pickup'||game.pendingPickup?.id!==pickup.id)return;clearInput();game.resolvePickup(replace);setRenderDirty();setLastStatus('');hudView.sync(game);syncOverlay();};
  $('#keepWeapon').onclick=()=>resolve(false);$('#replaceWeapon').onclick=()=>resolve(true);$('#pickupRestart').onclick=restart;
  const replace=recommendPickup(game,pickup);
  autoTarget=replace?$('#replaceWeapon'):$('#keepWeapon');autoLabel=replace?'換上新'+(pickup.slot==='offhand'?'法器':'武器'):isTwoHanded?'保留目前裝備（雙手砲未換上）':'保留目前裝備';autoResolve=()=>resolve(replace);
 }else if(game.status==='upgrade'){
  dialog.innerHTML=`<div class="eyebrow">LEVEL UP</div><h2 id="dialogTitle">升級了！Lv. ${game.level}</h2><p class="lead">挑一份新的力量，時間會等你。</p><div class="choices">${game.upgradeChoices.map(id=>UPGRADES.find(u=>u.id===id)).filter(Boolean).map((u,i)=>`<button class="choice" data-upgrade="${u.id}"><kbd>${i+1}</kbd><span class="choice-icon">${iconSvg(UPGRADE_ICONS[u.id]||'i-pulse')}</span><b>${u.name}</b><small>${u.description}</small></button>`).join('')}</div>${choiceTimer.markup()}`;
  const upgradeGame=game,upgradeLevel=game.level;
  dialog.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>{if(getGame()!==upgradeGame||game.status!=='upgrade'||game.level!==upgradeLevel)return;clearInput();game.upgrade(b.dataset.upgrade);setRenderDirty();setLastStatus('');hudView.sync(game);syncOverlay();});
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
 return {syncOverlay,renderBestLine};
}
