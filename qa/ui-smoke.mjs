// V12 UI smoke: real Game/core, real ui.js and boss visuals, with a minimal
// DOM/renderer stub. Ported from the V5 smoke and extended for the V8
// fullscreen drag and the V12 presentation layer.
// This is NOT browser, CSS layout, WebGL or visual-quality verification.
// Run from the repository root: node qa/ui-smoke.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const actualTHREE=await import(root+'vendor/three.module.js');
const core=await import(root+'core.js');
const {createBossVisuals,bossVisualScale}=await import(root+'boss-visuals.js');
const cameraModule=await import(root+'camera.js');
const keyboard=await import(root+'keyboard.js');
const ui=await import(root+'ui.js');
const {WEAPONS}=await import(root+'weapons.js');
class Element{
 constructor(tag,attrs={},doc){this.tagName=tag.toUpperCase();this.doc=doc;this.attrs=attrs;this.id=attrs.id;this.dataset={};for(const [k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;this.value=attrs.value||'';this.checked='checked'in attrs;this.hidden='hidden'in attrs;this.disabled=false;this.textContent='';this.className=attrs.class||'';this.children=[];this.style={setProperty(k,v){this[k]=v}};this.events={};this.classes=new Set((attrs.class||'').split(' ').filter(Boolean));this.classList={toggle:(c,v)=>{if(v===undefined)v=!this.classes.has(c);if(v)this.classes.add(c);else this.classes.delete(c);},contains:c=>this.classes.has(c)};this.captured=new Set();}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
 setAttribute(k,v){this.attrs[k]=String(v)}
 focus(){this.doc.activeElement=this}
 contains(el){return el===this||this.children.includes(el)}
 matches(selector){selector=selector.trim();if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.classes.has(selector.slice(1));if(selector==='[data-upgrade]')return 'upgrade'in this.dataset;if(selector==='[tabindex="0"]')return this.attrs.tabindex==='0';if(selector.startsWith('button'))return this.tagName==='BUTTON'&&(!selector.includes(':disabled')||!this.disabled);if(selector.startsWith('input'))return this.tagName==='INPUT'&&!this.disabled;if(selector.startsWith('select'))return this.tagName==='SELECT'&&!this.disabled;if(selector==='textarea')return this.tagName==='TEXTAREA';return false}
 closest(selector){return selector.split(',').some(s=>this.matches(s))?this:null}
 querySelectorAll(selectors){return this.children.filter(el=>selectors.split(',').some(s=>el.matches(s)))}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 set innerHTML(text){for(const child of this.children){if(child.id&&this.doc.ids.get(child.id)===child)this.doc.ids.delete(child.id);this.doc.all=this.doc.all.filter(e=>e!==child)}this._html=text;this.children=this.doc.parse(text)}
 get innerHTML(){return this._html||''}
 setPointerCapture(id){if(this.denyCapture)throw new Error('capture denied');this.captured.add(id)}
 hasPointerCapture(id){return this.captured.has(id)}
 releasePointerCapture(id){this.captured.delete(id)}
}
class Document{
 constructor(){this.ids=new Map();this.all=[];this.events={};this.activeElement=null;this.hidden=false;}
 parse(text){const elements=[];for(const match of text.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)){const attrs={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';const el=new Element(match[1],attrs,this);elements.push(el);this.all.push(el);if(el.id)this.ids.set(el.id,el)}return elements}
 querySelector(s){if(s.startsWith('#'))return this.ids.get(s.slice(1))||null;return this.all.find(e=>e.matches(s))||null}
 addEventListener(t,f){(this.events[t]??=[]).push(f)}
}
function setup(storageDenied=false,{seed={}}={}){
 const document=new Document(),html=fs.readFileSync(root+'index.html','utf8');document.parse(html);
 const dialog=document.querySelector('#dialog');dialog.children=document.all.slice(document.all.indexOf(dialog)+1).filter(e=>e.tagName!=='SCRIPT');
 // #game contains every parsed node; the stub has no real tree.
 document.querySelector('#game').contains=el=>document.all.includes(el);
 const store=new Map(Object.entries(seed)),clock={t:0},localStorage={getItem(k){if(storageDenied)throw new Error('denied');return store.get(k)||null},setItem(k,v){if(storageDenied)throw new Error('denied');store.set(k,v)}};
 class Renderer{constructor(){this.shadowMap={};this.info={render:{calls:0}}}setSize(){}setPixelRatio(){}render(){}}
 const counters={clear:0,sync:0,update:[]};const visual={clear(){counters.clear++},sync(){counters.sync++},update(dt){counters.update.push(dt)},styleBullet(){}};
 const windowEvents={};
 const context=vm.createContext({console,THREE:{...actualTHREE,WebGLRenderer:Renderer},...core,...cameraModule,...keyboard,...ui,WEAPONS,document,localStorage,URLSearchParams,location:{search:''},innerWidth:390,innerHeight:844,devicePixelRatio:1,performance:{now:()=>clock.t},requestAnimationFrame:()=>{},MAPS:[{id:'courtyard'},{id:'greenhouse'},{id:'park'}],buildMap:()=>({dispose(){},obstacles:[],bounds:18,spawn:{x:0,z:4},lighting:{}}),makePlush(){const g=new actualTHREE.Group();g.userData={radius:.5,getMuzzleOffset(target){return Object.assign(target||{},{x:.3,y:.6,z:.8})},animate(){}};return g},createCrowd:()=>({clear(){},sync(){},stats:{}}),createEffects:()=>({clear(){},burst(){},update(){},shadows(){}}),createWeaponVisuals:()=>visual,createBossVisuals,bossVisualScale,applyMapLighting(){},positionCameraFill(){}});
 context.window=context;context.addEventListener=(t,f)=>{(windowEvents[t]??=[]).push(f)};
 vm.runInContext(fs.readFileSync(root+'main.js','utf8').replace(/^import .*;\n/gm,''),context);
 const qa=context.__PLUSH_QA__,el=id=>document.querySelector('#'+id),run=s=>vm.runInContext(s,context);
 const fire=(target,type,event)=>{for(const fn of target[type]??[])fn(event)};
 return {qa,el,run,document,store,counters,windowEvents,fire,clock};
}
function pointer(target,extra={}){return {pointerId:7,clientX:120,clientY:300,button:0,buttons:1,pointerType:'touch',defaultPrevented:false,preventDefault(){this.defaultPrevented=true},target,...extra};}
function key(keyName,target,extra={}){return {key:keyName,target,isComposing:false,defaultPrevented:false,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){this.defaultPrevented=true},...extra};}
const checks=[];function check(name,fn){fn();checks.push(name)}
const h=setup();const {qa,el,run}=h;

check('V12.1 revision and build label',()=>{assert.equal(qa.revision,'v12.1-tap-pickup-r1');assert.equal(el('game').attrs['data-build'],'v12.1-tap-pickup-r1')});
check('legacy #heroSelect value/change still switches hero, portrait and card state',()=>{el('heroSelect').value='polar';el('heroSelect').onchange({target:el('heroSelect')});assert.equal(qa.game.heroId,'polar');assert.equal(el('heroPortrait').attrs.src,'assets/polar-portrait.png');assert.equal(el('heroCardPolar').attrs['aria-pressed'],'true');assert.equal(el('heroCardPudding').attrs['aria-pressed'],'false');assert.equal(qa.game.weaponLevels.pulse,1)});
check('hero cards drive the same select interface',()=>{el('heroCardPudding').onclick();assert.equal(qa.game.heroId,'pudding');assert.equal(el('heroSelect').value,'pudding');assert.equal(el('heroCardPudding').attrs['aria-pressed'],'true');const game=qa.game;el('heroCardPudding').onclick();assert.equal(qa.game,game,'re-selecting the same hero does not reset')});
check('first run defaults to confirmation and renders both equipped names and icons',()=>{assert.equal(qa.game.autoEquip,false);assert.equal(el('mainWeaponName').textContent,WEAPONS.pulse.name+' Lv.1');assert.equal(el('offhandWeaponName').textContent,WEAPONS.moonfan.name+' Lv.1');assert.equal(el('magicLabel').textContent,'魔力 0 / 12');assert.match(el('mainWeaponIcon').innerHTML,/#i-pulse/);assert.match(el('offhandWeaponIcon').innerHTML,/#i-moonfan/)});
check('next boss countdown is shown before the run starts',()=>{assert.equal(el('bossClockText').textContent,'首領 1:00')});
el('start').onclick();qa.pause();
check('pause dialog shows run summary and grouped settings',()=>{const html=el('dialog').innerHTML;for(const id of ['volume','quality','showStats','autoEquip','nextHero','resume','restart'])assert.ok(el(id),id);assert.match(html,/救援時間/);assert.match(html,/畫面與聲音/)});
check('settings toggle updates live game and local storage',()=>{const box=el('autoEquip');assert.equal(box.checked,false);box.checked=true;box.onchange({target:box});assert.equal(qa.game.autoEquip,true);assert.equal(h.store.get('plush-rescue:auto-equip'),'true')});
check('restart clears modal and all movement input, preserving setting',()=>{run("keys.add('w');stick.begin(4,20,20);stick.move(4,40,90)");qa.game.pendingPickup={id:999,weaponId:'shotgun',slot:'main'};el('restart').onclick();assert.equal(qa.game.pendingPickup,null);assert.equal(qa.game.autoEquip,true);assert.equal(run('keys.size'),0);assert.equal(run('stick.id'),null);assert.equal(el('overlay').classList.contains('shown'),false)});
qa.pause();el('autoEquip').checked=false;el('autoEquip').onchange({target:el('autoEquip')});el('resume').onclick();
function pickup(id){qa.game.addDrop({kind:'weapon',weaponId:id,x:qa.game.player.x,z:qa.game.player.z});qa.game.collectDrops();qa.renderOnce()}
check('keep retains weapon level; second pickup and replace uses improved weapon and icon',()=>{pickup('shotgun');assert.equal(qa.game.weaponLevels.shotgun,1);assert.match(el('dialog').innerHTML,/無論保留或換裝/);assert.equal(qa.game.status,'pickup');assert.match(el('dialog').innerHTML,/星光脈衝槍/);assert.match(el('dialog').innerHTML,/棉花散彈槍/);assert.match(el('dialog').innerHTML,/#i-shotgun/);el('keepWeapon').onclick();assert.equal(qa.game.loadout.main,'pulse');pickup('shotgun');el('replaceWeapon').onclick();assert.equal(qa.game.loadout.main,'shotgun');assert.equal(qa.game.weaponLevels.shotgun,2);assert.equal(qa.game.status,'running');assert.match(el('mainWeaponIcon').innerHTML,/#i-shotgun/)});
check('offhand comparison explains separate retained magic ledgers',()=>{qa.game.magic.charge=10;pickup('frostwand');assert.match(el('dialog').innerHTML,/充能與進化分別保留/);el('replaceWeapon').onclick();assert.equal(qa.game.loadout.offhand,'frostwand');assert.equal(qa.game.magic.charge,0)});
check('consecutive pickup callbacks cannot consume later pickup',()=>{pickup('burst');const old=el('replaceWeapon').onclick;qa.game.addDrop({kind:'weapon',weaponId:'ember',x:qa.game.player.x,z:qa.game.player.z});old();assert.equal(qa.game.status,'pickup');const pending=qa.game.pendingPickup;old();assert.equal(qa.game.pendingPickup,pending);assert.equal(qa.game.loadout.main,'burst');el('keepWeapon').onclick()});
check('stale levelup callback cannot consume a later level',()=>{qa.game.exp=qa.game.nextExp+40;qa.game.levelUp();qa.renderOnce();const old=el('dialog').querySelectorAll('[data-upgrade]')[0].onclick;old();assert.equal(qa.game.status,'upgrade');const level=qa.game.level,power=qa.game.power;old();assert.equal(qa.game.level,level);assert.equal(qa.game.power,power);qa.game.exp=0;el('dialog').querySelectorAll('[data-upgrade]')[0].onclick()});
check('number keys 1–4 choose a level-up card; other states ignore them',()=>{qa.game.exp=qa.game.nextExp;qa.game.levelUp();qa.renderOnce();const interval=qa.game.fireInterval,choice=el('dialog').querySelectorAll('[data-upgrade]')[1];assert.equal(choice.dataset.upgrade,'rate');h.fire(h.windowEvents,'keydown',key('2',choice));assert.equal(qa.game.status,'running');assert.ok(qa.game.fireInterval<interval);const level=qa.game.level;h.fire(h.windowEvents,'keydown',key('2',el('world')));assert.equal(qa.game.level,level);assert.equal(qa.game.status,'running')});
check('cannon is retained and UI button toggles with magic state unchanged',()=>{pickup('cannon');el('replaceWeapon').onclick();qa.renderOnce();assert.equal(qa.game.twoHanded,'cannon');assert.equal(el('twoHandedBar').hidden,false);assert.equal(el('stowTwoHanded').textContent,'收起雙手砲');const magic=qa.game.magic;el('stowTwoHanded').onclick();qa.renderOnce();assert.equal(qa.game.twoHanded,null);assert.equal(qa.game.twoHandedWeapon,'cannon');assert.equal(el('twoHandedBar').hidden,false);assert.equal(el('stowTwoHanded').textContent,'使用雙手砲');assert.equal(qa.game.magic,magic);el('stowTwoHanded').onclick();assert.equal(qa.game.twoHanded,'cannon')});
check('pickup restart resets retained cannon and rejects stale pickup callbacks',()=>{pickup('bomber');const stale=el('replaceWeapon').onclick;el('pickupRestart').onclick();stale();assert.equal(qa.game.status,'running');assert.equal(qa.game.pendingPickup,null);assert.equal(qa.game.loadout.main,'pulse');assert.equal(qa.game.twoHandedWeapon,null);assert.equal(el('twoHandedBar').hidden,true)});
check('pause freezes weapon animation updates and input',()=>{qa.pause();run('loop(16)');assert.equal(h.counters.update.at(-1),0);assert.equal(run('keys.size'),0);qa.resume()});
check('large rescue batches create at most four sound voices per frame',()=>{run("globalThis.soundCalls=0;sound=()=>globalThis.soundCalls++;game.events=Array.from({length:90},()=>({kind:'rescue',x:0,z:0}));game.events.push(...['shot','hurt','magic','explosion'].map(kind=>({kind})));effects(.016)");assert.equal(run('soundCalls'),4)});
check('hurt event flashes the vignette, then clears; rescue bumps the counter',()=>{run("game.events=[{kind:'hurt'},{kind:'rescue',x:0,z:0}];effects(.016);tickPresentation(.016)");assert.ok(el('vignette').classes.has('hurt'));assert.ok(document_q('.rescues').classes.has('bump'));run('tickPresentation(1)');assert.ok(!el('vignette').classes.has('hurt'));assert.ok(!document_q('.rescues').classes.has('bump'))});
function document_q(s){return h.document.querySelector(s)}
check('critical health shows the warning vignette only while running',()=>{qa.game.player.hp=1;qa.renderOnce();assert.ok(el('vignette').classes.has('critical'));qa.game.player.hp=qa.game.player.maxHp;qa.renderOnce();assert.ok(!el('vignette').classes.has('critical'))});
check('boss arrival shows a banner; boss HUD prioritizes big boss and hides on rescue',()=>{run('noticeTimer=0');qa.game.events.length=0;qa.game.spawnBoss('big',3);run('effects(.016);trackRun()');assert.match(qa.presentation.notice,/大首領/);assert.equal(el('notice').className,'show big');qa.renderOnce();assert.equal(el('bossPanel').hidden,false);assert.match(el('bossName').textContent,/大首領/);qa.game.rescueEnemy(qa.game.enemies.find(e=>e.boss));run('trackRun()');qa.renderOnce();assert.equal(el('bossPanel').hidden,true);assert.equal(qa.presentation.bossesRescued,1)});
check('a lower-priority banner cannot replace a showing boss warning; it expires on time',()=>{assert.match(qa.presentation.notice,/大首領/,'boss warning still visible over the rescue message');run('tickPresentation(5)');assert.equal(el('notice').className,'');run("showNotice('x','good',1,1)");assert.equal(qa.presentation.notice,'x')});
check('offhand evolution is announced once per offhand',()=>{run('noticeTimer=0');qa.game.magic.evolved=true;run('trackRun()');assert.match(qa.presentation.notice,/進化了/);run("noticeTimer=0;hudText(hud.notice,'');trackRun()");assert.equal(qa.presentation.notice,'')});
check('boss clock follows the schedule read-only',()=>{const g=qa.game,save={time:g.time,next:g.nextBossMinute,pending:g.pendingBoss};g.pendingBoss=null;g.time=170;g.nextBossMinute=3;qa.renderOnce();assert.equal(el('bossClockText').textContent,'大首領 0:10');assert.ok(el('bossClock').classes.has('imminent'));assert.ok(el('bossClock').classes.has('big'));g.pendingBoss={kind:'mini',minute:4};qa.renderOnce();assert.equal(el('bossClockText').textContent,'首領待命中');g.pendingBoss=null;g.time=1150;g.nextBossMinute=20;qa.renderOnce();assert.equal(el('bossClockText').textContent,'撐到天亮');assert.ok(el('bossClock').classes.has('calm'));Object.assign(g,{time:save.time,nextBossMinute:save.next,pendingBoss:save.pending});qa.renderOnce()});

// V8 fullscreen drag: any non-interactive target inside #game, never buttons or modals.
check('drag can start on a HUD readout and ends on pointerup',()=>{h.fire(h.document.events,'pointerdown',pointer(el('saved')));assert.equal(run('stick.id'),7);h.fire(h.document.events,'pointermove',pointer(el('world'),{clientX:180}));assert.ok(run('stick.x')>0);h.fire(h.document.events,'pointerup',pointer(el('world')));assert.equal(run('stick.id'),null)});
check('drag never starts on buttons or while a dialog is shown',()=>{h.fire(h.document.events,'pointerdown',pointer(el('pause')));assert.equal(run('stick.id'),null);h.fire(h.document.events,'pointerdown',pointer(el('stowTwoHanded')));assert.equal(run('stick.id'),null);qa.pause();h.fire(h.document.events,'pointerdown',pointer(el('world')));assert.equal(run('stick.id'),null);qa.resume()});
check('failed pointer capture never keeps movement ownership',()=>{el('world').denyCapture=true;h.fire(h.document.events,'pointerdown',pointer(el('world')));assert.equal(run('stick.id'),null);el('world').denyCapture=false});
check('mouse drag ends when the button is released outside; foreign capture loss is ignored',()=>{h.fire(h.document.events,'pointerdown',pointer(el('world'),{pointerType:'mouse'}));h.fire(h.document.events,'lostpointercapture',pointer(el('saved'),{pointerType:'mouse'}));assert.equal(run('stick.id'),7);h.fire(h.document.events,'pointermove',pointer(el('world'),{pointerType:'mouse',buttons:0}));assert.equal(run('stick.id'),null)});

check('ending a run records local bests; a better run is marked as a new record',()=>{qa.game.saved=12;qa.game.time=90;qa.game.end('fallen');qa.renderOnce();let records=JSON.parse(h.store.get('plush-rescue:records'));assert.equal(records.runs,1);assert.equal(records.saved,12);assert.doesNotMatch(el('dialog').innerHTML,/新紀錄/,'first run sets a baseline');assert.match(el('dialog').innerHTML,/救回首領/);assert.ok(el('again'));el('again').onclick();qa.game.saved=30;qa.game.time=95;qa.game.end('fallen');qa.renderOnce();records=JSON.parse(h.store.get('plush-rescue:records'));assert.equal(records.runs,2);assert.equal(records.saved,30);assert.match(el('dialog').innerHTML,/新紀錄/);el('again').onclick()});
check('blocked localStorage is safe for settings and records',()=>{const b=setup(true);b.el('start').onclick();b.qa.pause();b.el('autoEquip').checked=true;b.el('autoEquip').onchange({target:b.el('autoEquip')});b.el('restart').onclick();assert.equal(b.qa.game.autoEquip,true);b.qa.game.end('survived');b.qa.renderOnce();assert.match(b.el('dialog').innerHTML,/天亮了/);assert.equal(b.qa.records.runs,0)});
check('start screen shows the best record once one exists',()=>{const c=setup();assert.equal(c.el('bestLine').hidden,true);const d=setup();d.store.set('plush-rescue:records',JSON.stringify({time:300,saved:40,level:6,bosses:2,runs:3}));d.run('renderBestLine()');assert.equal(d.el('bestLine').hidden,false);assert.match(d.el('bestLine').innerHTML,/05:00/)});


// ---- V12.1: tap-to-pick on top of the V8 fullscreen drag ---------------------------
const down=(h,id,x,y,extra={})=>h.fire(h.document.events,'pointerdown',pointer(h.el('world'),{pointerId:id,clientX:x,clientY:y,...extra}));
const move=(h,id,x,y,extra={})=>h.fire(h.document.events,'pointermove',pointer(h.el('world'),{pointerId:id,clientX:x,clientY:y,...extra}));
const up=(h,id,x,y,extra={})=>h.fire(h.document.events,'pointerup',pointer(h.el('world'),{pointerId:id,clientX:x,clientY:y,...extra}));
function tapGame(opts={}){
 const t=setup(false,opts);t.el('start').onclick();const g=t.qa.game;
 g.drops.length=0;g.enemies.length=0;g.spawn=1e9;g.dropTimer=1e9;g.invuln=999;
 return t;
}
function spot(t,drop){t.qa.renderOnce();t.run('camera.updateMatrixWorld()');return t.run(`projectToScreen(${drop.x},.5,${drop.z})`);}
const frame=t=>t.run('loop(16)');
function addNear(t,id='shotgun',dx=3,dz=0){const g=t.qa.game;return g.addDrop({kind:'weapon',weaponId:id,x:g.player.x+dx,z:g.player.z+dz});}

check('second finger tap picks a drop on release, not on press; the first finger keeps the stick',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d);
 down(t,1,60,500);move(t,1,100,540);const before={x:t.run('stick.x'),z:t.run('stick.z')};
 down(t,2,p.x,p.y);frame(t);
 assert.equal(t.qa.game.drops.length,1,'nothing is picked on pointerdown');assert.equal(t.run('stick.id'),1);
 assert.deepEqual({x:t.run('stick.x'),z:t.run('stick.z')},before);
 t.clock.t=120;up(t,2,p.x+2,p.y+1);frame(t);
 assert.equal(t.qa.game.status,'pickup');assert.equal(t.qa.game.pendingPickup.weaponId,'shotgun');assert.equal(t.qa.game.drops.length,0);
});
check('with auto-equip the tap never interrupts the first finger: stick id and value survive',()=>{
 const t=tapGame({}),g=t.qa.game;g.autoEquip=true;const d=addNear(t,'ember',2,-1),p=spot(t,d);
 down(t,1,60,500);move(t,1,100,540);const before={x:t.run('stick.x'),z:t.run('stick.z')};
 down(t,2,p.x,p.y);t.clock.t=90;up(t,2,p.x,p.y);frame(t);
 assert.equal(g.status,'running');assert.equal(g.loadout.main,'ember');assert.equal(g.weaponLevels.ember,1);assert.equal(g.drops.length,0);
 assert.equal(t.run('stick.id'),1);assert.deepEqual({x:t.run('stick.x'),z:t.run('stick.z')},before);
 move(t,1,120,560);assert.ok(t.run('stick.x')>0,'first finger still steers');
 up(t,1,120,560);assert.equal(t.run('stick.id'),null);
});
check('skill drop tapped with the second finger applies once and announces itself',()=>{
 const t=tapGame(),g=t.qa.game,d=g.addDrop({kind:'upgrade',upgradeId:'power',x:g.player.x-2,z:g.player.z-2}),p=spot(t,d),power=g.power;
 down(t,1,60,500);move(t,1,90,520);down(t,2,p.x,p.y);t.clock.t=80;up(t,2,p.x,p.y);frame(t);
 assert.ok(g.power>power);assert.equal(g.status,'running');assert.match(t.qa.presentation.notice,/獲得技能/);
 frame(t);assert.equal(g.power,power*1.35,'applied exactly once');
});
check('a held or dragged second finger never picks; neither does a cancelled one',()=>{
 for(const mode of ['hold','drag','cancel']){
  const t=tapGame(),d=addNear(t),p=spot(t,d);down(t,1,60,500);move(t,1,90,520);down(t,2,p.x,p.y);
  if(mode==='hold'){t.clock.t=600;up(t,2,p.x,p.y);}
  else if(mode==='drag'){move(t,2,p.x+40,p.y);up(t,2,p.x,p.y);}
  else t.fire(t.document.events,'pointercancel',pointer(t.el('world'),{pointerId:2,clientX:p.x,clientY:p.y}));
  frame(t);assert.equal(t.qa.game.drops.length,1,mode);assert.equal(t.qa.game.status,'running',mode);assert.equal(t.run('stick.id'),1,mode);
 }
});
check('losing canvas capture cancels the tap candidate, so a later pointerup cannot pick',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d);
 down(t,3,p.x,p.y);assert.equal(t.run('taps.size'),1);
 t.fire(t.document.events,'lostpointercapture',pointer(t.el('world'),{pointerId:3,clientX:p.x,clientY:p.y}));
 assert.equal(t.run('taps.size'),0,'candidate removed');
 up(t,3,p.x,p.y);frame(t);assert.equal(t.qa.game.drops.length,1);assert.equal(t.qa.game.status,'running');
 // A capture transfer that targets another element is ignored, like before.
 const u=tapGame(),e=addNear(u),q=spot(u,e);down(u,3,q.x,q.y);
 u.fire(u.document.events,'lostpointercapture',pointer(u.el('saved'),{pointerId:3,clientX:q.x,clientY:q.y}));
 assert.equal(u.run('taps.size'),1);u.clock.t=80;up(u,3,q.x,q.y);frame(u);assert.equal(u.qa.game.status,'pickup');
});
check('second-finger presses are claimed from the browser, buttons and dialogs are not',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d);
 down(t,1,60,500);
 const second=pointer(t.el('world'),{pointerId:2,clientX:p.x,clientY:p.y});t.fire(t.document.events,'pointerdown',second);
 assert.equal(second.defaultPrevented,true,'tracked second finger is claimed');
 const button=pointer(t.el('pause'),{pointerId:5,clientX:10,clientY:10});t.fire(t.document.events,'pointerdown',button);
 assert.equal(button.defaultPrevented,false,'the settings button keeps its default behaviour');
 const stow=pointer(t.el('stowTwoHanded'),{pointerId:6,clientX:10,clientY:10});t.fire(t.document.events,'pointerdown',stow);assert.equal(stow.defaultPrevented,false);
 t.qa.pause();const inDialog=pointer(t.el('world'),{pointerId:7,clientX:p.x,clientY:p.y});t.fire(t.document.events,'pointerdown',inDialog);
 assert.equal(inDialog.defaultPrevented,false,'nothing is claimed while a dialog is open');
});
check('Safari pinch gestures are blocked only while the game runs',()=>{
 const t=tapGame(),ev=()=>({target:t.el('world'),defaultPrevented:false,preventDefault(){this.defaultPrevented=true}});
 const running=ev();t.fire(t.document.events,'gesturestart',running);assert.equal(running.defaultPrevented,true);
 t.qa.pause();const paused=ev();t.fire(t.document.events,'gesturestart',paused);assert.equal(paused.defaultPrevented,false,'dialogs keep page zoom');
});
check('a single finger or the mouse can tap a drop; dragging from a drop does not pick it',()=>{
 for(const type of ['touch','mouse']){
  const t=tapGame(),d=addNear(t),p=spot(t,d);
  down(t,3,p.x,p.y,{pointerType:type});assert.equal(t.run('stick.id'),3,'single press still starts the drag');t.clock.t=100;up(t,3,p.x,p.y,{pointerType:type});frame(t);
  assert.equal(t.qa.game.status,'pickup',type);assert.equal(t.qa.game.pendingPickup.weaponId,'shotgun',type);
 }
 const t=tapGame(),d=addNear(t),p=spot(t,d);down(t,3,p.x,p.y);move(t,3,p.x+60,p.y+20);up(t,3,p.x+60,p.y+20);frame(t);
 assert.equal(t.qa.game.drops.length,1,'a drag that started on the drop');assert.equal(t.qa.game.status,'running');
});
check('mouse taps use the tighter radius; touch gets the finger-sized one',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d);
 down(t,3,p.x+30,p.y,{pointerType:'mouse'});up(t,3,p.x+30,p.y,{pointerType:'mouse'});frame(t);assert.equal(t.qa.game.drops.length,1,'30px away misses for mouse');
 down(t,4,p.x+30,p.y,{pointerType:'touch'});up(t,4,p.x+30,p.y,{pointerType:'touch'});frame(t);assert.equal(t.qa.game.drops.length,0,'30px away hits for touch');
});
check('drops beyond 6 units are not tappable but proximity pickup still works',()=>{
 const t=tapGame(),far=addNear(t,'burst',7,0),pf=spot(t,far);
 down(t,3,pf.x,pf.y);up(t,3,pf.x,pf.y);frame(t);assert.equal(t.qa.game.drops.length,1);assert.equal(t.qa.game.status,'running');
 const near=addNear(t,'ember',.5,0);frame(t);assert.equal(t.qa.game.status,'pickup');assert.equal(t.qa.game.pendingPickup.weaponId,'ember','walking onto a drop still collects it');
});
check('taps are ignored while paused or in a dialog, and queued taps are dropped on pause',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d);
 down(t,3,p.x,p.y);t.qa.pause();up(t,3,p.x,p.y);t.qa.resume();frame(t);assert.equal(t.qa.game.drops.length,1,'released while paused');
 down(t,4,p.x,p.y);up(t,4,p.x,p.y);t.qa.pause();t.qa.resume();frame(t);assert.equal(t.qa.game.drops.length,1,'queued tap cleared by pause');
});
check('two drops on screen: only the tapped one is taken, and the pickup flow is serialized',()=>{
 const t=tapGame(),a=addNear(t,'shotgun',3,0),b=addNear(t,'burst',-3,2),pa=spot(t,a);
 down(t,3,pa.x,pa.y);t.clock.t=100;up(t,3,pa.x,pa.y);frame(t);
 assert.deepEqual(t.qa.game.drops.map(x=>x.id),[b.id]);assert.equal(t.qa.game.pendingPickup.id,a.id);
});

// ---- V12.1: remembered settings -------------------------------------------------------
check('quality, volume, next hero and diagnostics are saved when changed in the menu',()=>{
 const t=setup();t.el('start').onclick();t.qa.pause();
 t.el('quality').value='high';t.el('quality').onchange({target:t.el('quality')});
 t.el('volume').value='0.6';t.el('volume').oninput({target:t.el('volume')});t.el('volume').onchange({target:t.el('volume')});
 t.el('nextHero').value='polar';t.el('nextHero').onchange({target:t.el('nextHero')});
 t.el('showStats').checked=true;t.el('showStats').onchange({target:t.el('showStats')});
 assert.deepEqual(JSON.parse(t.store.get('plush-rescue:settings')),{quality:'high',volume:.6,hero:'polar',stats:true});
});
check('only validated settings are ever written, even if internal state is odd',()=>{
 const t=setup();t.run("quality='ultra';volume=NaN;selectedHero='dragon';showStats='yes';saveSettings()");
 assert.deepEqual(JSON.parse(t.store.get('plush-rescue:settings')),{quality:'balanced',volume:.25,hero:'pudding',stats:false});
 t.run("quality='low';volume=7;selectedHero='polar';showStats=true;saveSettings()");
 assert.deepEqual(JSON.parse(t.store.get('plush-rescue:settings')),{quality:'low',volume:1,hero:'polar',stats:true});
});
check('the hero cards and F3 are remembered too',()=>{
 const t=setup();t.el('heroCardPolar').onclick();assert.equal(JSON.parse(t.store.get('plush-rescue:settings')).hero,'polar');
 t.el('start').onclick();t.fire(t.windowEvents,'keydown',key('F3',t.el('world')));assert.equal(JSON.parse(t.store.get('plush-rescue:settings')).stats,true);
});
check('a new visit restores the saved settings without any user action',()=>{
 const seed={'plush-rescue:settings':JSON.stringify({quality:'low',volume:.4,hero:'polar',stats:true})};
 const t=setup(false,{seed});
 assert.equal(t.run('quality'),'low');assert.equal(t.run('volume'),.4);assert.equal(t.qa.game.heroId,'polar');
 assert.equal(t.el('heroSelect').value,'polar');assert.equal(t.el('heroCardPolar').attrs['aria-pressed'],'true');assert.equal(t.el('heroCardPudding').attrs['aria-pressed'],'false');
 assert.equal(t.el('stats').hidden,false);assert.equal(t.el('heroPortrait').attrs.src,'assets/polar-portrait.png');
 t.el('start').onclick();t.qa.pause();assert.equal(t.el('quality').value,'low');assert.equal(t.el('nextHero').value,'polar');
});
check('restoring settings does not overwrite them, and corrupt or invalid values fall back safely',()=>{
 const raw=JSON.stringify({quality:'low',volume:.4,hero:'polar',stats:false}),t=setup(false,{seed:{'plush-rescue:settings':raw}});
 assert.equal(t.store.get('plush-rescue:settings'),raw);
 for(const bad of ['{nope',JSON.stringify({quality:'ultra',volume:'loud',hero:'x',stats:1})]){
  const u=setup(false,{seed:{'plush-rescue:settings':bad}});
  assert.equal(u.run('quality'),'balanced');assert.equal(u.run('volume'),.25);assert.equal(u.qa.game.heroId,'pudding');assert.equal(u.el('stats').hidden,true);
 }
});
check('blocked storage: settings and taps still work for the session',()=>{
 const t=setup(true);assert.equal(t.run('quality'),'balanced');t.el('start').onclick();t.qa.pause();
 t.el('quality').value='high';t.el('quality').onchange({target:t.el('quality')});assert.equal(t.run('quality'),'high');t.el('resume').onclick();
 const g=t.qa.game;g.drops.length=0;g.enemies.length=0;g.spawn=1e9;g.dropTimer=1e9;g.invuln=999;
 const d=addNear(t),p=spot(t,d);down(t,3,p.x,p.y);t.clock.t=60;up(t,3,p.x,p.y);frame(t);assert.equal(g.status,'pickup');
});

console.log(JSON.stringify({method:'Node DOM/renderer stub only; not browser/WebGL verification',passed:checks.length,checks},null,2));
