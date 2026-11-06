import {LIMITS,bossKind,healthLabel} from './core.js';
import {WEAPONS} from './weapons.js';
import {HUD_OCCLUDERS,nextBossCountdown,bossClockLabel,formatClock,weaponIcon} from './ui.js';

// The in-game HUD (V10): permanent nodes looked up once, written only when a
// value changes (hudWrite keeps the last value per node and key), plus the short
// notice banner and the hurt/rescue feedback timers. It reads the game and never
// changes it. Split out of main.js without behaviour changes.
export const HUD_IDS=Object.freeze(["heroPortrait", "bossPanel", "bossName", "bossHp", "bossFill", "hearts", "healthFill", "timer", "saved", "level", "xpFill", "xpLabel", "mainWeapon", "offhandWeapon", "mainWeaponName", "offhandWeaponName", "mainWeaponIcon", "offhandWeaponIcon", "game", "twoHandedBar", "twoHandedName", "twoHandedSlotLabel", "stowTwoHanded", "mainSlotLabel", "offhandSlotLabel", "magicFill", "magicLabel", "magicMeter", "stats", "vignette", "notice", "bossClock", "bossClockText"]);

// doc: the page; heroNames: display names by hero id.
export function createHud({doc,heroNames}){
 const $=selector=>doc.querySelector(selector);
 // Permanent HUD nodes survive reset; modal controls are intentionally not cached.
 const hud=Object.fromEntries(HUD_IDS.map(id=>[id,$('#'+id)]));
 hud.loadout=$('.loadout');hud.rescues=$('.rescues');hud.root=$('#hud');
 // Opaque HUD panels that hide the world under them (see pointCovered in ui.js).
 const occluders=[...doc.querySelectorAll(HUD_OCCLUDERS)];
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
 let noticeTimer=0,noticePriority=0,hurtTimer=0,bumpTimer=0;
 function showNotice(text,tone,seconds,priority){
  // A big-boss warning is not replaced by a smaller event while it is still showing.
  if(noticeTimer>0&&priority<noticePriority)return;
  noticeTimer=seconds;noticePriority=priority;hudText(hud.notice,text);hudProp(hud.notice,'className','show '+tone);
 }
 function tick(dt){
  if(noticeTimer>0){noticeTimer=Math.max(0,noticeTimer-dt);if(noticeTimer===0){noticePriority=0;hudProp(hud.notice,'className','');}}
  hurtTimer=Math.max(0,hurtTimer-dt);bumpTimer=Math.max(0,bumpTimer-dt);
  hudClass(hud.vignette,'hurt',hurtTimer>0);hudClass(hud.rescues,'bump',bumpTimer>0);
 }
 function resetFeedback(){noticeTimer=noticePriority=hurtTimer=bumpTimer=0;hudText(hud.notice,'');hudProp(hud.notice,'className','');}
 function syncStats({fps,game,calls,quality}){
  // Enemy count includes bosses; ground bombs (mines) have their own count.
  hudText(hud.stats,`${fps} FPS · ${game.enemies.length} 敵 / ${game.rescued.length} 自由 / ${game.bullets.length} 光束 / ${game.bombs.length} 地雷 · ${calls} calls · ${quality}`);
 }
 function sync(game){
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
 return {els:hud,occluders,write:hudWrite,text:hudText,prop:hudProp,attr:hudAttr,style:hudStyle,cls:hudClass,sync,syncStats,showNotice,tick,resetFeedback,
  hurt(){hurtTimer=.5;},bump(){bumpTimer=.32;},
  // A dialog opening ends the hurt flash at once.
  clearHurt(){hurtTimer=0;hudClass(hud.vignette,'hurt',false);},
  // The current notice no longer blocks a lower-priority one (test interface).
  expireNotice(){noticeTimer=0;},
  get noticeTimer(){return noticeTimer;}};
}
