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
const {createWeaponVisuals,DROP_GEOMETRY}=await import(root+'weapon-visuals.js');
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
 // Layout is not simulated: a test gives an element a box by setting .rect.
 getBoundingClientRect(){return this.rect||{left:0,top:0,right:0,bottom:0,width:0,height:0}}
}
class Document{
 constructor(){this.ids=new Map();this.all=[];this.events={};this.activeElement=null;this.hidden=false;this.focused=true;}
 parse(text){const elements=[];for(const match of text.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)){const attrs={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';const el=new Element(match[1],attrs,this);elements.push(el);this.all.push(el);if(el.id)this.ids.set(el.id,el)}return elements}
 querySelector(s){if(s.startsWith('#'))return this.ids.get(s.slice(1))||null;return this.all.find(e=>e.matches(s))||null}
 querySelectorAll(selectors){return this.all.filter(el=>selectors.split(',').some(s=>el.matches(s)))}
 addEventListener(t,f){(this.events[t]??=[]).push(f)}
 hasFocus(){return this.focused}
}
// realVisuals: use the real weapon-visuals.js so taps see what is actually drawn.
function setup(storageDenied=false,{seed={},realVisuals=false,width=390,height=844}={}){
 const document=new Document(),html=fs.readFileSync(root+'index.html','utf8');document.parse(html);
 const dialog=document.querySelector('#dialog');dialog.children=document.all.slice(document.all.indexOf(dialog)+1).filter(e=>e.tagName!=='SCRIPT');
 // #game contains every parsed node; the stub has no real tree.
 document.querySelector('#game').contains=el=>document.all.includes(el);
 const store=new Map(Object.entries(seed)),clock={t:0},localStorage={getItem(k){if(storageDenied)throw new Error('denied');return store.get(k)||null},setItem(k,v){if(storageDenied)throw new Error('denied');store.set(k,v)}};
 class Renderer{constructor(){this.shadowMap={};this.info={render:{calls:0}}}setSize(){}setPixelRatio(){}render(){}}
 const counters={clear:0,sync:0,update:[]};const visual={clear(){counters.clear++},sync(){counters.sync++},update(dt){counters.update.push(dt)},styleBullet(){}};
 const windowEvents={};
 const context=vm.createContext({console,THREE:{...actualTHREE,WebGLRenderer:Renderer},...core,...cameraModule,...keyboard,...ui,WEAPONS,document,localStorage,URLSearchParams,location:{search:''},innerWidth:width,innerHeight:height,devicePixelRatio:1,performance:{now:()=>clock.t},requestAnimationFrame:()=>{},MAPS:[{id:'courtyard'},{id:'greenhouse'},{id:'park'}],buildMap:()=>({dispose(){},obstacles:[],bounds:18,spawn:{x:0,z:4},lighting:{}}),makePlush(){const g=new actualTHREE.Group();g.userData={radius:.5,getMuzzleOffset(target){return Object.assign(target||{},{x:.3,y:.6,z:.8})},animate(){}};return g},createCrowd:()=>({clear(){},sync(){},stats:{}}),createEffects:()=>({clear(){},burst(){},update(){},shadows(){}}),createWeaponVisuals:realVisuals?createWeaponVisuals:()=>visual,createBossVisuals,bossVisualScale,applyMapLighting(){},positionCameraFill(){}});
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

check('revision and build label match build-info.json',()=>{const {revision}=JSON.parse(fs.readFileSync(root+'build-info.json','utf8'));assert.equal(qa.revision,revision);assert.equal(el('game').attrs['data-build'],revision)});
check('legacy #heroSelect value/change still switches hero, portrait and card state',()=>{el('heroSelect').value='polar';el('heroSelect').onchange({target:el('heroSelect')});assert.equal(qa.game.heroId,'polar');assert.equal(el('heroPortrait').attrs.src,'assets/polar-portrait.png');assert.equal(el('heroCardPolar').attrs['aria-pressed'],'true');assert.equal(el('heroCardPudding').attrs['aria-pressed'],'false');assert.equal(qa.game.weaponLevels.pulse,1)});
check('hero cards drive the same select interface',()=>{el('heroCardPudding').onclick();assert.equal(qa.game.heroId,'pudding');assert.equal(el('heroSelect').value,'pudding');assert.equal(el('heroCardPudding').attrs['aria-pressed'],'true');const game=qa.game;el('heroCardPudding').onclick();assert.equal(qa.game,game,'re-selecting the same hero does not reset')});
check('first run defaults to confirmation and renders both equipped names and icons',()=>{assert.equal(qa.game.autoEquip,false);assert.equal(el('mainWeaponName').textContent,WEAPONS.pulse.name+' Lv.1');assert.equal(el('offhandWeaponName').textContent,WEAPONS.moonfan.name+' Lv.1');assert.equal(el('magicLabel').textContent,'魔力 0 / 12');assert.match(el('mainWeaponIcon').innerHTML,/#i-pulse/);assert.match(el('offhandWeaponIcon').innerHTML,/#i-moonfan/)});
check('next boss countdown is shown before the run starts',()=>{assert.equal(el('bossClockText').textContent,'首領 1:00')});
el('start').onclick();qa.pause();
check('pause dialog shows run summary and grouped settings',()=>{const html=el('dialog').innerHTML;for(const id of ['volume','quality','showStats','autoEquip','autoChoose','nextHero','resume','restart'])assert.ok(el(id),id);assert.equal(el('autoChoose').checked,false);assert.match(html,/救援時間/);assert.match(html,/畫面與聲音/)});
check('settings toggle updates live game and local storage',()=>{const box=el('autoEquip');assert.equal(box.checked,false);box.checked=true;box.onchange({target:box});assert.equal(qa.game.autoEquip,true);assert.equal(h.store.get('plush-rescue:auto-equip'),'true')});
check('auto-choice setting saves, reloads, and defaults off',()=>{const box=el('autoChoose');box.checked=true;box.onchange({target:box});assert.equal(JSON.parse(h.store.get('plush-rescue:settings')).autoChoose,true);assert.equal(qa.settings.autoChoose,true);box.checked=false;box.onchange({target:box});assert.equal(JSON.parse(h.store.get('plush-rescue:settings')).autoChoose,false)});
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

check('auto-choice countdown resolves an upgrade once, and cancellation/restart invalidate it',()=>{
 const t=setup(false,{seed:{'plush-rescue:settings':JSON.stringify({autoChoose:true})}});
 t.el('start').onclick();t.run("game.status='upgrade';game.level=2;syncOverlay()");
 assert.equal(t.qa.autoChoice.remaining,10);assert.match(t.el('choiceCountdownText').textContent,/10 秒後自動選擇/);
 t.run('cancelChoiceTimer()');for(let i=0;i<44;i++)t.run('advanceChoiceTimer(.25)');
 assert.equal(t.qa.game.status,'upgrade','cancelled countdown does not resolve');assert.equal(t.qa.autoChoice.cancelled,true);
 t.run('syncOverlay()');assert.equal(t.qa.autoChoice.remaining,10,'new choice starts a fresh countdown');
 t.qa.restart();assert.equal(t.qa.autoChoice,null,'restart clears stale pending choice');const power=t.qa.game.power;
 for(let i=0;i<44;i++)t.run('advanceChoiceTimer(.25)');assert.equal(t.qa.game.status,'running','stale callback cannot change the restarted run');assert.equal(t.qa.game.power,power);
 t.run("game.status='upgrade';game.level=3;syncOverlay()");for(let i=0;i<40;i++)t.run('advanceChoiceTimer(.25)');
 assert.equal(t.qa.game.status,'running','countdown resolves the selected upgrade');assert.ok(t.qa.game.power>power,'recommended power upgrade is applied exactly once');
});
check('low frame rate advances the countdown; a very long single frame cannot decide immediately',()=>{
 const t=setup(false,{seed:{'plush-rescue:settings':JSON.stringify({autoChoose:true})}});
 t.el('start').onclick();t.run("game.status='upgrade';game.level=2;syncOverlay()");
 t.run('advanceChoiceTimer(30)');assert.equal(t.qa.autoChoice.remaining,8,'a 30-second stall counts at most two seconds');
 assert.equal(t.qa.game.status,'upgrade','one long frame cannot resolve the choice');
 for(let i=0;i<15;i++)t.run('advanceChoiceTimer(.5)');
 assert.equal(t.qa.autoChoice.remaining,.5,'0.5-second visible frames continue to advance the timer');
 assert.equal(t.qa.game.status,'upgrade');t.run('advanceChoiceTimer(.5)');
 assert.equal(t.qa.game.status,'running','steady low-FPS frames eventually resolve the choice');
});
check('weapon comparison auto-resolves; background and blur freeze the countdown and resume with three seconds',()=>{
 const startPickup=t=>{t.el('start').onclick();t.qa.game.weaponLevels.shotgun=2;t.qa.game.addDrop({kind:'weapon',weaponId:'shotgun',x:t.qa.game.player.x,z:t.qa.game.player.z});t.qa.game.collectDrops();t.qa.renderOnce();assert.equal(t.qa.game.status,'pickup');assert.equal(t.qa.autoChoice.target,'換上新武器')};
 const t=setup(false,{seed:{'plush-rescue:settings':JSON.stringify({autoChoose:true})}});startPickup(t);
 for(let i=0;i<36;i++)t.run('advanceChoiceTimer(.25)');assert.equal(t.qa.autoChoice.remaining,1);
 t.document.hidden=true;t.fire(t.document.events,'visibilitychange',{});for(let i=0;i<12;i++)t.run('advanceChoiceTimer(.25)');
 assert.equal(t.qa.autoChoice.remaining,1,'hidden page freezes the countdown');
 t.document.hidden=false;t.fire(t.document.events,'visibilitychange',{});t.run('advanceChoiceTimer(.25)');
 assert.equal(t.qa.autoChoice.remaining,3,'return from background grants at least three seconds');
 for(let i=0;i<8;i++)t.run('advanceChoiceTimer(.25)');assert.equal(t.qa.game.status,'pickup','choice remains available during the grace period');
 for(let i=0;i<4;i++)t.run('advanceChoiceTimer(.25)');assert.equal(t.qa.game.status,'running');assert.equal(t.qa.game.loadout.main,'shotgun','recommended replacement is applied once');

 const b=setup(false,{seed:{'plush-rescue:settings':JSON.stringify({autoChoose:true})}});startPickup(b);for(let i=0;i<36;i++)b.run('advanceChoiceTimer(.25)');
 b.document.focused=false;b.fire(b.windowEvents,'blur',{});for(let i=0;i<12;i++)b.run('advanceChoiceTimer(.25)');
 assert.equal(b.qa.autoChoice.remaining,1,'unfocused window freezes the countdown');
 b.document.focused=true;b.fire(b.windowEvents,'focus',{});b.run('advanceChoiceTimer(.25)');assert.equal(b.qa.autoChoice.remaining,3,'regaining focus grants at least three seconds');
});


// ---- V12.1: tap-to-pick on top of the V8 fullscreen drag ---------------------------
const down=(h,id,x,y,extra={})=>h.fire(h.document.events,'pointerdown',pointer(h.el('world'),{pointerId:id,clientX:x,clientY:y,...extra}));
const move=(h,id,x,y,extra={})=>h.fire(h.document.events,'pointermove',pointer(h.el('world'),{pointerId:id,clientX:x,clientY:y,...extra}));
const up=(h,id,x,y,extra={})=>h.fire(h.document.events,'pointerup',pointer(h.el('world'),{pointerId:id,clientX:x,clientY:y,...extra}));
function tapGame(opts={}){
 const t=setup(false,{realVisuals:true,...opts});t.el('start').onclick();const g=t.qa.game;
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
check('a far drop that is on screen can be tapped (no 6-unit limit); proximity pickup still works',()=>{
 const t=tapGame(),far=addNear(t,'burst',7,0),pf=spot(t,far);
 down(t,3,pf.x,pf.y);up(t,3,pf.x,pf.y);frame(t);assert.equal(t.qa.game.status,'pickup');assert.equal(t.qa.game.pendingPickup.weaponId,'burst');t.el('keepWeapon').onclick();
 const farther=addNear(t,'frostwand',-4,-10),pt=spot(t,farther);assert.ok(Math.hypot(farther.x-t.qa.game.player.x,farther.z-t.qa.game.player.z)>8.5,'label hidden');
 down(t,4,pt.x,pt.y);up(t,4,pt.x,pt.y);frame(t);assert.equal(t.qa.game.pendingPickup?.weaponId,'frostwand','ring/item of a far drop');t.el('keepWeapon').onclick();
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
 assert.deepEqual(JSON.parse(t.store.get('plush-rescue:settings')),{quality:'high',volume:.6,hero:'polar',stats:true,autoChoose:false});
});
check('only validated settings are ever written, even if internal state is odd',()=>{
 const t=setup();t.run("quality='ultra';volume=NaN;selectedHero='dragon';showStats='yes';saveSettings()");
 assert.deepEqual(JSON.parse(t.store.get('plush-rescue:settings')),{quality:'balanced',volume:.25,hero:'pudding',stats:false,autoChoose:false});
 t.run("quality='low';volume=7;selectedHero='polar';showStats=true;saveSettings()");
 assert.deepEqual(JSON.parse(t.store.get('plush-rescue:settings')),{quality:'low',volume:1,hero:'polar',stats:true,autoChoose:false});
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
 const t=setup(true,{realVisuals:true});assert.equal(t.run('quality'),'balanced');t.el('start').onclick();t.qa.pause();
 t.el('quality').value='high';t.el('quality').onchange({target:t.el('quality')});assert.equal(t.run('quality'),'high');t.el('resume').onclick();
 const g=t.qa.game;g.drops.length=0;g.enemies.length=0;g.spawn=1e9;g.dropTimer=1e9;g.invuln=999;
 const d=addNear(t),p=spot(t,d);down(t,3,p.x,p.y);t.clock.t=60;up(t,3,p.x,p.y);frame(t);assert.equal(g.status,'pickup');
 const again=setup(true);assert.equal(again.run('quality'),'balanced','nothing survives a reload when storage is blocked');assert.equal(again.qa.game.autoEquip,false);
});
// ---- V12.1.1: on-screen hit area, HUD cover, slow mouse, settings rounds ---------------
const G=DROP_GEOMETRY;
// A point on a drop's label, fx/fy in -1..1 across its width/height (camera-facing).
function labelSpot(t,drop,fx,fy=0){
 t.qa.renderOnce();const sx=fx*G.labelWidth/2,sy=fy*G.labelHeight/2;
 return t.run(`(()=>{camera.updateMatrixWorld();const r=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),u=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
  return projectToScreen(${drop.x}+r.x*${sx}+u.x*${sy},${G.labelY}+r.y*${sx}+u.y*${sy},${drop.z}+r.z*${sx}+u.z*${sy});})()`);
}
const worldSpot=(t,x,y,z)=>{t.qa.renderOnce();t.run('camera.updateMatrixWorld()');return t.run(`projectToScreen(${x},${y},${z})`);};
const mouseTap=(t,id,p,ms=120)=>{down(t,id,p.x,p.y,{pointerType:'mouse'});t.clock.t+=ms;up(t,id,p.x,p.y,{pointerType:'mouse',buttons:0});frame(t);};
const settle=t=>{if(t.qa.game.status==='pickup')t.el('keepWeapon').onclick();};

check('label ends, ring and item are tappable with the mouse in portrait, small portrait, landscape and desktop',()=>{
 for(const [width,height] of [[390,844],[360,640],[844,390],[1280,720]]){
  const at={'label left end':(t,d)=>labelSpot(t,d,-.96),'label right end':(t,d)=>labelSpot(t,d,.96),
   ring:(t,d)=>worldSpot(t,d.x+G.ringRadius*.7,G.ringY,d.z),item:(t,d)=>worldSpot(t,d.x,G.floatY+G.floatBob,d.z)};
  for(const [where,spotOf] of Object.entries(at)){
   const t=tapGame({width,height}),d=addNear(t,'shotgun',2,1.5),p=spotOf(t,d);
   mouseTap(t,3,p);assert.equal(t.qa.game.pendingPickup?.weaponId,'shotgun',`${width}x${height} ${where}`);
  }
 }
});
check('a slow mouse click (600 ms) and a click judged by timeStamp during a long frame both pick',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d);mouseTap(t,3,p,600);assert.equal(t.qa.game.status,'pickup','600 ms click');
 const u=tapGame(),e=addNear(u),q=spot(u,e);
 down(u,4,q.x,q.y,{pointerType:'mouse',timeStamp:100});u.clock.t=2000;up(u,4,q.x,q.y,{pointerType:'mouse',timeStamp:310});frame(u);
 assert.equal(u.qa.game.status,'pickup','handlers ran late, the input itself was quick');
 const v=tapGame(),f=addNear(v),r=spot(v,f);mouseTap(v,5,r,900);assert.equal(v.qa.game.drops.length,1,'a 900 ms hold is not a click');
});
check('a mouse drag never picks, and a mouse released outside ends only its own drag',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d);
 down(t,3,p.x,p.y,{pointerType:'mouse'});move(t,3,p.x+15,p.y,{pointerType:'mouse'});up(t,3,p.x,p.y,{pointerType:'mouse'});frame(t);
 assert.equal(t.qa.game.drops.length,1,'15 px travel is a drag');
 // Finger 5 tapped (queued for the next frame) while a mouse drag lost its button outside the page.
 const u=tapGame(),e=addNear(u),q=spot(u,e);
 down(u,1,40,600,{pointerType:'mouse'});move(u,1,60,620,{pointerType:'mouse'});
 down(u,5,q.x,q.y);u.clock.t=60;up(u,5,q.x,q.y);
 move(u,1,70,630,{pointerType:'mouse',buttons:0});assert.equal(u.run('stick.id'),null,'mouse drag ended');
 frame(u);assert.equal(u.qa.game.status,'pickup','the queued finger tap is kept');
});
check('opaque HUD panels block taps on drops drawn underneath; uncovered spots still work',()=>{
 const t=tapGame(),d=addNear(t),p=spot(t,d),card=t.document.all.find(e=>e.classes.has('weapon-card'));
 card.rect={left:p.x-30,top:p.y-20,right:p.x+30,bottom:p.y+20,width:60,height:40};
 down(t,3,p.x,p.y);t.clock.t=60;up(t,3,p.x,p.y);frame(t);assert.equal(t.qa.game.drops.length,1,'tap landed on the weapon card');
 const notice=t.el('notice');notice.rect={left:0,top:0,right:390,bottom:844,width:390,height:844};card.rect=null;
 down(t,4,p.x,p.y);t.clock.t+=60;up(t,4,p.x,p.y);frame(t);assert.equal(t.qa.game.status,'pickup','an idle notice does not cover anything');
 settle(t);const e=addNear(t,'burst',-2,1),q=spot(t,e);notice.classList.toggle('show',true);
 down(t,5,q.x,q.y);t.clock.t+=60;up(t,5,q.x,q.y);frame(t);assert.equal(t.qa.game.drops.length,1,'a shown notice covers the world');
});
check('expired, blinking and undrawn drops: only what is on screen can be taken',()=>{
 // Expires in the same frame the tap is resolved: never taken, no error.
 const t=tapGame(),d=addNear(t),p=spot(t,d);d.life=.001;down(t,3,p.x,p.y);t.clock.t=60;up(t,3,p.x,p.y);frame(t);
 assert.equal(t.qa.game.drops.length,0);assert.equal(t.qa.game.status,'running');assert.equal(t.qa.game.weaponLevels.shotgun,0);
 // Blinking (last 2 s): in its dark beat it is not on screen and cannot be taken;
 // once it shows again, the same tap takes it.
 const u=tapGame(),e=addNear(u),q=spot(u,e);e.life=1.5;
 const group=()=>{let found=null;u.qa.scene.traverse(o=>{if(o.isGroup&&/pickup$/.test(o.name)&&o.parent)found=o;});return found;};
 const beat=visible=>{for(let i=0;i<200&&group().visible!==visible;i++){u.qa.weaponVisuals.update(.01);u.qa.renderOnce();}assert.equal(group().visible,visible);};
 const tapNow=id=>{u.run(`pendingTaps.push({x:${q.x},y:${q.y},type:'touch'})`);u.run('resolveTaps()');};
 beat(false);assert.equal(u.qa.weaponVisuals.drawnDrops().has(e.id),false,'dark beat is not drawn');
 tapNow();assert.equal(u.qa.game.status,'running');assert.equal(u.qa.game.drops.length,1,'dark beat: not taken');
 beat(true);assert.equal(u.qa.weaponVisuals.drawnDrops().has(e.id),true);
 tapNow();assert.equal(u.qa.game.status,'pickup','bright beat: taken');
 // The renderer draws at most 16 drops (core also caps at 16). A drop outside the drawn
 // set, forced in here past the cap, is not on screen and cannot be taken.
 const v=tapGame(),g=v.qa.game;for(let i=0;i<16;i++)g.addDrop({kind:'upgrade',upgradeId:'power',x:g.player.x-8+i*.3,z:g.player.z+9});
 assert.equal(g.addDrop({kind:'weapon',weaponId:'cannon',x:0,z:0}),null,'core cap');
 const hidden={kind:'weapon',weaponId:'cannon',x:g.player.x+2,z:g.player.z-2,id:999,life:30};g.drops.push(hidden);const r=spot(v,hidden);
 assert.equal(v.qa.weaponVisuals.drawnDrops().size,16);assert.equal(v.qa.weaponVisuals.drawnDrops().has(hidden.id),false);
 down(v,3,r.x,r.y);v.clock.t=60;up(v,3,r.x,r.y);frame(v);assert.ok(g.drops.some(x=>x.id===hidden.id),'undrawn drop stays');
 // A drop added after the last frame was drawn is not on screen yet either.
 const w=tapGame();w.qa.renderOnce();const fresh=addNear(w,'burst',-2,-1);w.run('camera.updateMatrixWorld()');const fp=w.run(`projectToScreen(${fresh.x},.5,${fresh.z})`);
 assert.equal(w.qa.weaponVisuals.drawnDrops().has(fresh.id),false);
 down(w,3,fp.x,fp.y);w.clock.t=60;up(w,3,fp.x,fp.y);frame(w);assert.equal(w.qa.game.drops.length,1,'not drawn yet when tapped');
 down(w,4,fp.x,fp.y);w.clock.t+=60;up(w,4,fp.x,fp.y);frame(w);assert.equal(w.qa.game.status,'pickup','drawn by the next frame, then tappable');
});
check('portrait edge: a drop with every centre off screen but a corner still drawn can be tapped',()=>{
 for(const side of [1,-1]){
  const t=tapGame({width:360,height:640}),g=t.qa.game;t.qa.renderOnce();
  // Walk a drop toward the screen edge along the camera's right axis until only part of it is on screen.
  const found=t.run(`(()=>{camera.updateMatrixWorld();const r=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),u=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize();
   const view=viewRect(),axes={right:r,up:u},project=(x,y,z)=>projectToScreen(x,y,z,view),inside=p=>p&&p.x>=0&&p.x<=view.width&&p.y>=0&&p.y<=view.height;
   for(let k=0;k<3000;k++){const d={id:-1,x:game.player.x+${side}*r.x*k*.01,z:game.player.z+${side}*r.z*k*.01};
    const shape=dropHitShape(d,project,axes,view,{labelVisible:true});if(!shape)return null;
    const centres=[project(d.x,${G.ringY},d.z),project(d.x,${G.floatY},d.z),project(d.x,${G.labelY},d.z)];
    if(!centres.some(inside)){for(let y=0;y<=view.height;y+=1)for(let x=0;x<=view.width;x+=1){const q={x,y,type:'touch'};if(pickDropAt(q,[shape],{margin:0}))return {dx:d.x-game.player.x,dz:d.z-game.player.z,q};}}}
   return null;})()`);
  assert.ok(found,`side ${side}: partly visible position exists`);
  const d=g.addDrop({kind:'weapon',weaponId:'shotgun',x:g.player.x+found.dx,z:g.player.z+found.dz});t.qa.renderOnce();
  assert.ok(t.qa.weaponVisuals.drawnDrops().has(d.id));
  down(t,3,found.q.x,found.q.y);t.clock.t+=60;up(t,3,found.q.x,found.q.y);frame(t);
  assert.equal(g.pendingPickup?.id,d.id,`side ${side}: the visible corner was tapped`);
 }
});
check('five rounds of pause, settings changes and resume keep mouse and touch taps working',()=>{
 const t=tapGame({width:360,height:640}),qualities=['high','low','balanced','high','low'];
 for(let round=0;round<5;round++){
  if(round%2)t.fire(t.windowEvents,'blur',{});else t.qa.pause();
  assert.equal(t.qa.game.status,'paused');
  t.el('quality').value=qualities[round];t.el('quality').onchange({target:t.el('quality')});
  t.el('nextHero').value=round%2?'pudding':'polar';t.el('nextHero').onchange({target:t.el('nextHero')});
  t.el('showStats').checked=round%2===0;t.el('showStats').onchange({target:t.el('showStats')});
  if(round===3){t.qa.resume();t.qa.pause();}
  t.el('resume').onclick();assert.equal(t.qa.game.status,'running');
  // Every drop stays beyond LABEL_POLICY.heroClear, so label rounds have a label to tap.
  const g=t.qa.game,d=addNear(t,round%2?'burst':'shotgun',1.5-round,2.5-round*.5);
  const p=round%2?spot(t,d):labelSpot(t,d,round%4?-.95:.95);
  if(round%2){down(t,9,p.x,p.y);t.clock.t+=80;up(t,9,p.x,p.y);frame(t);}else mouseTap(t,1,p,round===4?650:150);
  assert.equal(g.pendingPickup?.id,d.id,`round ${round}`);settle(t);
 }
 assert.deepEqual(JSON.parse(t.store.get('plush-rescue:settings')),{quality:'low',volume:.25,hero:'polar',stats:true,autoChoose:false});
 assert.equal(t.document.events.pointerdown.length,1,'no listener is added by pausing');assert.equal(t.document.events.pointerup.length,1);
});
check('volume is saved while dragging; quality, volume, next hero, stats and auto-equip survive a reload; the run does not',()=>{
 const t=setup();t.el('start').onclick();t.qa.game.time=95;t.qa.game.saved=7;t.qa.pause();
 t.el('volume').value='0.7';t.el('volume').oninput({target:t.el('volume')});
 assert.equal(JSON.parse(t.store.get('plush-rescue:settings')).volume,.7,'saved on input, before any change event');
 t.el('volume').value='0.45';t.el('volume').oninput({target:t.el('volume')});
 t.el('quality').value='low';t.el('quality').onchange({target:t.el('quality')});
 t.el('nextHero').value='polar';t.el('nextHero').onchange({target:t.el('nextHero')});
 t.el('showStats').checked=true;t.el('showStats').onchange({target:t.el('showStats')});
 t.el('autoEquip').checked=true;t.el('autoEquip').onchange({target:t.el('autoEquip')});
 t.el('autoChoose').checked=true;t.el('autoChoose').onchange({target:t.el('autoChoose')});
 const reload=setup(false,{seed:Object.fromEntries(t.store)});
 assert.equal(reload.run('quality'),'low');assert.equal(reload.run('volume'),.45);assert.equal(reload.qa.game.heroId,'polar');
 assert.equal(reload.el('stats').hidden,false);assert.equal(reload.qa.game.autoEquip,true);
 assert.equal(reload.qa.settings.autoChoose,true,'auto-choice preference survives a reload');
 assert.equal(reload.qa.game.status,'ready','a reload starts from the title screen');assert.equal(reload.qa.game.time,0);assert.equal(reload.qa.game.saved,0);
});

// ---- V12.2.1: mouse hover pickup -------------------------------------------------------
const hoverMove=(t,p,extra={})=>move(t,9,p.x,p.y,{pointerType:'mouse',buttons:0,...extra});
// A real-time frame of `ms` (loop takes the absolute time); the first call only syncs the clock.
const hframe=(t,ms)=>{t.hnow=(t.hnow||5000)+ms;t.run(`loop(${t.hnow})`);};
const hoverGame=(opts={})=>{const t=tapGame(opts);hframe(t,0);hframe(t,16);return t;};
check('a mouse resting on a drop takes it after 0.5 s through the normal pickup flow; 0.4 s does not',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p);hframe(t,16);
 for(let i=0;i<4;i++)hframe(t,100);assert.equal(t.qa.game.status,'running','about 0.4 s');assert.equal(t.el('hoverRing').hidden,false,'progress ring is shown');
 for(let i=0;i<3;i++)hframe(t,100);assert.equal(t.qa.game.status,'pickup');assert.equal(t.qa.game.pendingPickup.weaponId,'shotgun');assert.equal(t.qa.game.weaponLevels.shotgun,1);
 assert.equal(t.el('hoverRing').hidden,true);assert.equal(t.run('hoverPoint'),null,'the mouse has to move again');
});
check('the progress ring shows on the very first frame after the move, even with slow (200 ms) frames; a drop under a resting cursor shows none',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p);hframe(t,200);
 assert.equal(t.el('hoverRing').hidden,false,'ring is up right after the entering frame');assert.equal(t.qa.game.status,'running');
 hframe(t,200);hframe(t,200);assert.equal(t.qa.game.status,'running','400 ms counted');hframe(t,200);assert.equal(t.qa.game.status,'pickup','a 200 ms frame is counted in full');
 const u=hoverGame(),probe=addNear(u),q=spot(u,probe);u.qa.game.drops.length=0;hoverMove(u,q);hframe(u,16);addNear(u);hframe(u,100);hframe(u,100);
 assert.equal(u.el('hoverRing').hidden,true,'unarmed: no ring');
});
check('hover pickup honours auto-equip like a click, and an upgrade drop is taken too',()=>{
 const t=hoverGame(),g=t.qa.game;g.autoEquip=true;const d=addNear(t,'burst'),p=spot(t,d);hoverMove(t,p);hframe(t,16);
 for(let i=0;i<7;i++)hframe(t,100);assert.equal(g.status,'running');assert.equal(g.loadout.main,'burst');assert.equal(g.drops.length,0);
 const u=g.addDrop({kind:'upgrade',upgradeId:'power',x:g.player.x+3,z:g.player.z}),q=spot(t,u),power=g.power;hoverMove(t,q);hframe(t,16);
 for(let i=0;i<7;i++)hframe(t,100);assert.ok(g.power>power);
});
check('touch and pen never hover-pick; a pressed mouse button (drag) never does either',()=>{
 for(const extra of [{pointerType:'touch'},{pointerType:'pen'},{pointerType:'mouse',buttons:1}]){
  const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p,extra);hframe(t,16);
  for(let i=0;i<12;i++)hframe(t,100);assert.equal(t.qa.game.status,'running',JSON.stringify(extra));assert.equal(t.qa.game.drops.length,1);
 }
});
check('a drop sliding under a resting cursor is not picked; a mouse move over it starts the 0.5 s',()=>{
 const t=hoverGame(),probe=addNear(t),p=spot(t,probe);t.qa.game.drops.length=0;
 hoverMove(t,p);hframe(t,16);
 const d=addNear(t);hframe(t,16);for(let i=0;i<12;i++)hframe(t,100);assert.equal(t.qa.game.status,'running','resting cursor');assert.equal(t.qa.game.drops.length,1);
 hoverMove(t,{x:p.x+1,y:p.y});hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);assert.equal(t.qa.game.status,'running');
 for(let i=0;i<3;i++)hframe(t,100);assert.equal(t.qa.game.status,'pickup');
});
check('hover only takes exact hits: a spot just outside the shape is not picked',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d),far={x:p.x+120,y:p.y};
 hoverMove(t,far);hframe(t,16);for(let i=0;i<12;i++)hframe(t,100);assert.equal(t.qa.game.status,'running');
});
check('pointerdown, leaving the window, pause, blur, hidden and resize restart the hover',()=>{
 const resets={
  pointerdown:t=>down(t,9,5,5,{pointerType:'mouse'}),
  'leave window':t=>t.fire(t.document.events,'pointerout',{pointerType:'mouse',relatedTarget:null}),
  blur:t=>t.fire(t.windowEvents,'blur',{}),
  resize:t=>t.fire(t.windowEvents,'resize',{}),
  pause:t=>t.qa.pause(),
 };
 for(const [name,act] of Object.entries(resets)){
  const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p);hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);
  act(t);if(t.qa.game.status==='paused')t.qa.resume();
  for(let i=0;i<4;i++)hframe(t,100);assert.equal(t.qa.game.status,'running',name+': 0.4 s before + 0.4 s after must not add up');
  assert.equal(t.run('hoverPoint'),null,name);
 }
 const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p);hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);
 t.document.hidden=true;t.fire(t.document.events,'visibilitychange',{});t.document.hidden=false;t.qa.resume();
 for(let i=0;i<4;i++)hframe(t,100);assert.equal(t.qa.game.status,'running','hidden');
});
check('moving to another drop or off the drop restarts; a HUD panel over the drop blocks the hover',()=>{
 const t=hoverGame(),d=addNear(t,'shotgun',3,0),e=addNear(t,'burst',-3,0),p=spot(t,d),q=spot(t,e);
 hoverMove(t,p);hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);hoverMove(t,q);hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);
 assert.equal(t.qa.game.status,'running','time on the first drop is not carried to the second');
 for(let i=0;i<3;i++)hframe(t,100);assert.equal(t.qa.game.pendingPickup?.weaponId,'burst');
 const u=hoverGame(),f=addNear(u),r=spot(u,f),card=u.document.all.find(x=>x.classes.has('weapon-card'));
 card.rect={left:r.x-30,top:r.y-20,right:r.x+30,bottom:r.y+20,width:60,height:40};
 hoverMove(u,r);hframe(u,16);for(let i=0;i<12;i++)hframe(u,100);assert.equal(u.qa.game.status,'running','weapon card covers the drop');assert.equal(u.el('hoverRing').hidden,true);
});
check('slow frames (267, 400 ms) count in full; a stall of 1000 ms resets the hover (a move and a full 0.5 s are needed); a dialog or non-running state never hover-picks',()=>{
 for(const ms of [267,400]){const u=hoverGame(),e=addNear(u),q=spot(u,e);hoverMove(u,q);hframe(u,ms);assert.equal(u.el('hoverRing').hidden,false,ms+' ms: ring on the entering frame');assert.equal(u.qa.game.status,'running');
  hframe(u,ms);assert.equal(u.qa.game.status,'running',ms+' ms: one counted frame is under 0.5 s');hframe(u,ms);assert.equal(u.qa.game.status,'pickup',ms+' ms: two counted frames reach 0.5 s');}
 const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p);hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);
 hframe(t,999);assert.equal(t.qa.game.status,'pickup','999 ms is a slow frame, not a stall');
 const w=hoverGame(),f=addNear(w),r=spot(w,f);hoverMove(w,r);hframe(w,16);for(let i=0;i<4;i++)hframe(w,100);
 hframe(w,1000);assert.equal(w.run('hover.id'),null,'a 1000 ms stall resets');for(let i=0;i<12;i++)hframe(w,100);assert.equal(w.qa.game.status,'running','no move since the stall: not restarted');
 hoverMove(w,{x:r.x+1,y:r.y});hframe(w,16);for(let i=0;i<4;i++)hframe(w,100);assert.equal(w.qa.game.status,'running','0.4 s');for(let i=0;i<3;i++)hframe(w,100);assert.equal(w.qa.game.status,'pickup');
 const u=hoverGame(),e=addNear(u),q=spot(u,e);hoverMove(u,q);hframe(u,16);u.qa.pause();for(let i=0;i<12;i++)hframe(u,100);assert.equal(u.qa.game.status,'paused');assert.equal(u.qa.game.drops.length,1);
});
const countShapes=t=>{t.run('globalThis.__shapeCalls=0;{const original=dropShapes;dropShapes=function(...args){globalThis.__shapeCalls++;return original(...args);};}');return ()=>t.run('globalThis.__shapeCalls');};
check('an idle cursor with nothing tracked costs no hit tests; a move or a tracked hover (even in a dark beat) does',()=>{
 const t=hoverGame(),probe=addNear(t),p=spot(t,probe);t.qa.game.drops.length=0;const calls=countShapes(t);
 hoverMove(t,p);hframe(t,16);assert.equal(calls(),1,'the move frame is tested once');
 for(let i=0;i<30;i++)hframe(t,16);assert.equal(calls(),1,'30 idle frames: no projection at all');
 const d=addNear(t);for(let i=0;i<10;i++)hframe(t,16);assert.equal(calls(),1,'a drop sliding under the idle cursor is not even tested');assert.equal(t.run('hover.id'),null);
 hoverMove(t,{x:p.x+1,y:p.y});hframe(t,16);assert.equal(calls(),2,'a new move is tested');assert.equal(t.run('hover.id'),d.id);
 const before=calls();for(let i=0;i<3;i++)hframe(t,100);assert.equal(calls(),before+3,'once tracked, every frame is tested without further moves');
 for(let i=0;i<3;i++)hframe(t,100);assert.equal(t.qa.game.status,'pickup','and the hover still completes');
 const u=hoverGame(),e=addNear(u),q=spot(u,e);e.life=1.9;hoverMove(u,q);hframe(u,16);hframe(u,100);const ucalls=countShapes(u);
 const group=()=>{let found=null;u.qa.scene.traverse(o=>{if(o.isGroup&&/pickup$/.test(o.name)&&o.parent)found=o;});return found;};
 for(let i=0;i<30&&group().visible;i++)hframe(u,10);assert.equal(group().visible,false);
 const start=ucalls();for(let i=0;i<3;i++)hframe(u,10);assert.equal(ucalls(),start+3,'a tracked drop in its dark beat is still tested every frame');assert.equal(u.run('hover.id'),e.id);
});
check('a HUD panel that goes away does not let an old mouse move start a hover',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d),card=t.document.all.find(x=>x.classes.has('weapon-card'));
 card.rect={left:p.x-30,top:p.y-20,right:p.x+30,bottom:p.y+20,width:60,height:40};
 hoverMove(t,p);hframe(t,16);assert.equal(t.run('hoverMoved'),false,'the covered frame consumed the move');
 card.rect=null;for(let i=0;i<12;i++)hframe(t,100);assert.equal(t.qa.game.status,'running','no new mouse move: no hover');assert.equal(t.run('hover.id'),null);
 hoverMove(t,{x:p.x+1,y:p.y});hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);assert.equal(t.qa.game.status,'running');for(let i=0;i<3;i++)hframe(t,100);assert.equal(t.qa.game.status,'pickup','a real move starts it');
 const u=hoverGame(),e=addNear(u),q=spot(u,e);u.qa.pause();hoverMove(u,q);hframe(u,16);u.qa.resume();for(let i=0;i<12;i++)hframe(u,100);assert.equal(u.qa.game.status,'running','a move made while paused does not carry over');
});
check('499 ms on a drop, slide off for one frame and back: a full 0.5 s is needed again',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p);hframe(t,16);
 for(let i=0;i<49;i++)hframe(t,10);hframe(t,9);assert.equal(t.qa.game.status,'running','499 ms');
 hoverMove(t,{x:p.x+150,y:p.y});hframe(t,16);hoverMove(t,p);hframe(t,16);
 for(let i=0;i<48;i++)hframe(t,10);assert.equal(t.qa.game.status,'running','about 480 ms after re-entry');
 for(let i=0;i<4;i++)hframe(t,10);assert.equal(t.qa.game.status,'pickup','about 520 ms after re-entry');
});
check('sliding off the drop restarts the hover, even for one frame; sliding back needs a new move and a full 0.5 s',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d);hoverMove(t,p);hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);
 hoverMove(t,{x:p.x+150,y:p.y});hframe(t,16);assert.equal(t.run('hover.id'),null,'reset on the very next frame');assert.equal(t.el('hoverRing').hidden,true);
 hoverMove(t,p);hframe(t,16);for(let i=0;i<4;i++)hframe(t,100);assert.equal(t.qa.game.status,'running','0.4 s before + 0.4 s after do not add up');
 for(let i=0;i<3;i++)hframe(t,100);assert.equal(t.qa.game.status,'pickup');
});
check('in the dark beat of an expiry blink the tracked drop is held (progress kept, nothing taken); a real slide-off in the dark resets',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d);d.life=1.9;hoverMove(t,p);hframe(t,16);hframe(t,100);
 const group=()=>{let found=null;t.qa.scene.traverse(o=>{if(o.isGroup&&/pickup$/.test(o.name)&&o.parent)found=o;});return found;};
 for(let i=0;i<30&&group().visible;i++)hframe(t,10);assert.equal(group().visible,false,'reached a dark beat');
 assert.equal(t.run('hover.id'),d.id,'held through the dark beat');assert.equal(t.qa.game.status,'running');
 hoverMove(t,{x:p.x+150,y:p.y});hframe(t,10);assert.equal(t.run('hover.id'),null,'cursor really left while dark: reset');
});
check('an expiring drop in its blink keeps the hover (dark beats do not reset it) and is picked before it expires',()=>{
 const t=hoverGame(),d=addNear(t),p=spot(t,d);d.life=1.9;hoverMove(t,p);hframe(t,16);
 for(let i=0;i<36&&t.qa.game.status==='running';i++)hframe(t,50);assert.equal(t.qa.game.status,'pickup','picked despite dark beats');assert.ok(d.life>0,'taken before expiring');
});

console.log(JSON.stringify({method:'Node DOM/renderer stub only; not browser/WebGL verification',passed:checks.length,checks},null,2));
