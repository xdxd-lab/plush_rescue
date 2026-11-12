// Offline mute control and keyboard resume wiring; no browser/audio output.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../audio.js';
import {createDialogs} from '../dialogs.js';
import {createInput} from '../input-controller.js';
import {createSettingsStore} from '../settings-store.js';
import {SETTINGS_KEY} from '../ui.js';

function element(){
 const attrs=new Map();return {attrs,style:{},dataset:{},classList:{shown:false,toggle(_name,value){this.shown=value;},contains(){return this.shown;}},
  setAttribute(k,v){attrs.set(k,String(v));},focus(){},contains(){return false;},querySelectorAll(){return[];},addEventListener(){},getBoundingClientRect(){return{top:0,bottom:0};}};
}
function audioContextCounter(){
 let constructed=0;class Context{constructor(){constructed++;this.state='suspended';this.currentTime=0;this.destination={};}
  createGain(){const gain={value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){},cancelAndHoldAtTime(){},connect(){},disconnect(){}};return{gain,connect(){},disconnect(){}};}
  resume(){this.state='running';return Promise.resolve();}}
 return{Context,count:()=>constructed};
}

test('mute control is a semantic button, persists mute, and slider changes do not unmute or overwrite volume on toggle',async()=>{
 const map=new Map([[SETTINGS_KEY,JSON.stringify({volume:.4,muted:false})]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))};
 const settings=createSettingsStore({getStorage:()=>storage}),prefs=settings.prefs;
 const nodes=new Map(['#overlay','#dialog','#volume','#muteAudio','#nextHero-pudding','#nextHero-polar','#quality-low','#quality-balanced','#quality-high','#touchFxOn','#showStats','#autoEquip','#autoChoose','#resume','#restart','#pause','#stowTwoHanded'].map(k=>[k,element()]));
 const dialog=nodes.get('#dialog');dialog.querySelector=()=>nodes.get('#resume');dialog.innerHTML='';
 const overlay=nodes.get('#overlay');overlay.classList.toggle=(_name,value)=>{overlay.classList.shown=value;};
 const doc={hidden:false,activeElement:null,querySelector:s=>nodes.get(s)??element()};
 let lastStatus='';const calls=[];const counter=audioContextCounter();const sfx=createAudio({getContextClass:()=>counter.Context,volume:()=>prefs.volume,muted:()=>prefs.muted});
 const game={status:'paused',pendingPickup:null,time:8,saved:3,level:2};
 const controller=createDialogs({document:doc,overlay,dialog,canvas:element(),getGame:()=>game,getLastStatus:()=>lastStatus,setLastStatus:v=>lastStatus=v,setRenderDirty(){},prefs,settings,choiceTimer:{clear(){},start(){}},clearInput(){},hudView:{clearHurt(){}},runTrack:{bosses:0},storage:()=>storage,heroNames:{pudding:'布丁狗',polar:'北極熊'},names:['庭院'],setQuality(){},sfx,setAutoEquip(){},touchFx:{setEnabled(){}},setStatsVisible(){},restart(){},resume(){}});
 controller.syncOverlay();
 assert.match(dialog.innerHTML,/<button id="muteAudio" type="button" aria-pressed="false" aria-label="全部靜音">未靜音<\/button>/);
 const mute=nodes.get('#muteAudio');mute.onclick({currentTarget:mute});
 assert.equal(prefs.muted,true);assert.equal(prefs.volume,.4);assert.equal(mute.attrs.get('aria-pressed'),'true');assert.equal(mute.textContent,'已靜音');assert.equal(counter.count(),0);
 nodes.get('#volume').oninput({target:{value:'0.7'}});
 assert.equal(prefs.muted,true,'slider does not toggle mute');assert.equal(prefs.volume,.7);assert.equal(counter.count(),0,'muted slider change does not create a context');
 assert.deepEqual(JSON.parse(map.get(SETTINGS_KEY)),{quality:'balanced',volume:.7,muted:true,hero:'pudding',stats:false,autoChoose:false,touchFx:true});
 mute.onclick({currentTarget:mute});await Promise.resolve();
 assert.equal(prefs.muted,false);assert.equal(prefs.volume,.7,'unmute preserves the chosen volume');assert.equal(mute.attrs.get('aria-pressed'),'false');assert.equal(mute.textContent,'未靜音');assert.equal(counter.count(),1,'unmute gesture can create context');
});

test('keyboard Escape resume uses the supplied common callback, not game.resume directly',()=>{
 const win=new Map(),docListeners=new Map(),nodes=new Map(['#pause','#stowTwoHanded','#stick','#knob','#moveHint','#game'].map(k=>[k,element()]));
 const doc={hidden:false,querySelector:s=>nodes.get(s)??element(),addEventListener:(t,f)=>docListeners.set(t,f)};
 const window={addEventListener:(t,f)=>win.set(t,f)};const dialog=nodes.get('#dialog')??element();dialog.querySelectorAll=()=>[];
 const canvas={...element(),hasPointerCapture:()=>false};const game={status:'paused',resumeCalls:0,resume(){this.resumeCalls++;},player:{x:0,z:0}};
 let commonResumeCalls=0,pauses=0;const keys=new Set();
 const noops={clear(){},begin(){},move(){},end(){},cancel(){}};
 createInput({document:doc,window,canvas,overlay:{classList:{contains:()=>true}},dialog,stick:{id:null,origin:{x:0,y:0},x:0,z:0,reset(){},end(){return false;}},keys,taps:noops,pendingTaps:[],touchFx:{...noops,setEnabled(){}},hover:{},pickupState:{},clearHover(){},getGame:()=>game,tapClock:()=>0,reduceMotion:()=>false,hudOccluders:[],pause(){pauses++;},resume(){commonResumeCalls++;game.status='running';},syncOverlay(){},resize(){},setStatsVisible(){},prefs:{stats:false},hudView:{sync(){}},setRenderDirty(){},getCamera(){},getSize:()=>({width:1280,height:720}),getStyle:()=>({position:'static'})});
 const e={key:'Escape',target:{closest:()=>null},isComposing:false,defaultPrevented:false,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){this.defaultPrevented=true;}};
 win.get('keydown')(e);assert.equal(commonResumeCalls,1);assert.equal(game.resumeCalls,0);assert.equal(pauses,0);assert.equal(e.defaultPrevented,true);
 game.status='running';win.get('keydown')({...e,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});assert.equal(pauses,1,'pause keyboard route remains intact');
});

