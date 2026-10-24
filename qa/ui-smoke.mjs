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
function setup(storageDenied=false){
 const document=new Document(),html=fs.readFileSync(root+'index.html','utf8');document.parse(html);
 const dialog=document.querySelector('#dialog');dialog.children=document.all.slice(document.all.indexOf(dialog)+1).filter(e=>e.tagName!=='SCRIPT');
 // #game contains every parsed node; the stub has no real tree.
 document.querySelector('#game').contains=el=>document.all.includes(el);
 const store=new Map(),localStorage={getItem(k){if(storageDenied)throw new Error('denied');return store.get(k)||null},setItem(k,v){if(storageDenied)throw new Error('denied');store.set(k,v)}};
 class Renderer{constructor(){this.shadowMap={};this.info={render:{calls:0}}}setSize(){}setPixelRatio(){}render(){}}
 const counters={clear:0,sync:0,update:[]};const visual={clear(){counters.clear++},sync(){counters.sync++},update(dt){counters.update.push(dt)},styleBullet(){}};
 const windowEvents={};
 const context=vm.createContext({console,THREE:{...actualTHREE,WebGLRenderer:Renderer},...core,...cameraModule,...keyboard,...ui,WEAPONS,document,localStorage,URLSearchParams,location:{search:''},innerWidth:390,innerHeight:844,devicePixelRatio:1,performance:{now:()=>0},requestAnimationFrame:()=>{},MAPS:[{id:'courtyard'},{id:'greenhouse'},{id:'park'}],buildMap:()=>({dispose(){},obstacles:[],bounds:18,spawn:{x:0,z:4},lighting:{}}),makePlush(){const g=new actualTHREE.Group();g.userData={radius:.5,getMuzzleOffset(target){return Object.assign(target||{},{x:.3,y:.6,z:.8})},animate(){}};return g},createCrowd:()=>({clear(){},sync(){},stats:{}}),createEffects:()=>({clear(){},burst(){},update(){},shadows(){}}),createWeaponVisuals:()=>visual,createBossVisuals,bossVisualScale,applyMapLighting(){},positionCameraFill(){}});
 context.window=context;context.addEventListener=(t,f)=>{(windowEvents[t]??=[]).push(f)};
 vm.runInContext(fs.readFileSync(root+'main.js','utf8').replace(/^import .*;\n/gm,''),context);
 const qa=context.__PLUSH_QA__,el=id=>document.querySelector('#'+id),run=s=>vm.runInContext(s,context);
 const fire=(target,type,event)=>{for(const fn of target[type]??[])fn(event)};
 return {qa,el,run,document,store,counters,windowEvents,fire};
}
function pointer(target,extra={}){return {pointerId:7,clientX:120,clientY:300,button:0,buttons:1,pointerType:'touch',defaultPrevented:false,preventDefault(){this.defaultPrevented=true},target,...extra};}
function key(keyName,target,extra={}){return {key:keyName,target,isComposing:false,defaultPrevented:false,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){this.defaultPrevented=true},...extra};}
const checks=[];function check(name,fn){fn();checks.push(name)}
const h=setup();const {qa,el,run}=h;

check('V12 revision and build label',()=>{assert.equal(qa.revision,'v12-commercial-ui-r1');assert.equal(el('game').attrs['data-build'],'v12-commercial-ui-r1')});
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

console.log(JSON.stringify({method:'Node DOM/renderer stub only; not browser/WebGL verification',passed:checks.length,checks},null,2));
