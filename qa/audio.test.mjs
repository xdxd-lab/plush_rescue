// Synthesized event audio with a fake Web Audio context. Run: node --test qa/audio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio,AUDIO_EVENTS} from '../audio.js';

function fakeAudio(log,{resume='resolve',cancelAndHold=true,createError=null,constructorError=null}={}){
 return class{
  constructor(){if(constructorError)throw new Error(constructorError);this.state='suspended';this.destination={};log.context=this;log.events.push('new');}
  get currentTime(){return log.clock.now;}
  resume(){log.events.push('resume');if(resume==='throw')throw new Error('resume threw');if(resume==='reject')return Promise.reject(new Error('resume denied'));this.state='running';return Promise.resolve();}
  createOscillator(){if(createError)throw new Error(createError);const o={type:'',frequency:param(log,'freq',cancelAndHold),connect(){},disconnect(){log.events.push('osc-disconnect');},start(){log.events.push('start');},stop:t=>log.events.push(['stop',t]),onended:null};log.oscillators.push(o);return o;}
  createGain(){const g={gain:param(log,'gain',cancelAndHold),connect(){},disconnect(){log.events.push('gain-disconnect');}};log.gains.push(g);return g;}
 };
}
function param(log,name,cancelAndHold){return {value:0,setValueAtTime(v,t){this.value=v;log.events.push([name,'set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;log.events.push([name,'linear',v,t]);},exponentialRampToValueAtTime(v,t){this.value=v;log.events.push([name,'exp',v,t]);},cancelScheduledValues(t){log.events.push([name,'cancel',t]);},...(cancelAndHold?{cancelAndHoldAtTime(t){log.events.push([name,'hold',t]);}}:{})};}
function setup({volume=.5,muted=false,...opts}={}){const log={events:[],oscillators:[],gains:[],clock:{now:2}};let currentVolume=volume,currentMuted=muted;const audio=createAudio({getContextClass:()=>fakeAudio(log,opts),volume:()=>currentVolume,muted:()=>currentMuted});return{audio,log,setVolume:v=>currentVolume=v,setMuted:v=>currentMuted=v};}
function endVoices(log){for(const o of [...log.oscillators])o.onended?.();}

test('does not construct a context while muted or volume is zero',async()=>{
 for(const setupArgs of [{volume:0},{volume:.5,muted:true}]){const{audio,log}=setup(setupArgs);assert.equal(await audio.unlock(),false);assert.deepEqual(log.events,[]);assert.equal(audio.unlocked,false);}
 const x=setup({volume:0});x.setVolume(.4);assert.equal(await x.audio.unlock(),true);assert.equal(x.audio.unlocked,true);
});

test('resume rejects silently without an unhandled rejection',async()=>{
 const{audio,log}=setup({resume:'reject'});const unhandled=[];const handler=e=>unhandled.push(e);process.on('unhandledRejection',handler);
 try{assert.equal(await audio.unlock(),false);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);assert.equal(audio.state.context,'suspended');assert.match(audio.state.lastError,/resume denied/);}
 finally{process.off('unhandledRejection',handler);}
 assert.equal(log.events.filter(e=>e==='new').length,1);
});

test('master gain initializes once, ramps only on change, and fades/stops voices at zero',async()=>{
 const{audio,log,setVolume}=setup();assert.equal(await audio.unlock(),true);
 const master=log.gains[0];assert.ok(log.events.some(e=>Array.isArray(e)&&e[0]==='gain'&&e[1]==='set'&&e[2]===.5));
 const count=log.events.length;audio.syncSettings();assert.equal(log.events.length,count,'same level does not reschedule gain');
 setVolume(.7);audio.syncSettings();assert.ok(log.events.some(e=>Array.isArray(e)&&e[0]==='gain'&&e[1]==='hold'));assert.ok(log.events.some(e=>Array.isArray(e)&&e[0]==='gain'&&e[1]==='linear'&&e[2]===.7));
 assert.equal(audio.play('rescue'),true);assert.equal(audio.state.voices,1);setVolume(0);audio.syncSettings();assert.equal(audio.state.voices,1,'fading voice remains counted until onended');assert.ok(log.events.some(e=>Array.isArray(e)&&e[0]==='stop'&&e[1]===2.01));assert.equal(master.gain.value,0);
 endVoices(log);assert.equal(audio.state.voices,0);setVolume(.4);audio.syncSettings();assert.equal(master.gain.value,.4);
});

test('event tones use a separate per-voice gain; zero-volume events stay silent',async()=>{
 const{audio,log,setVolume}=setup();await audio.unlock();log.events.length=0;
 assert.equal(audio.play('rescue'),true);const osc=log.oscillators.at(-1);assert.equal(osc.type,'sine');
 assert.ok(log.events.some(e=>Array.isArray(e)&&e[0]==='freq'&&e[1]==='set'&&e[2]===740));
 assert.ok(log.events.some(e=>Array.isArray(e)&&e[0]==='gain'&&e[1]==='linear'&&e[2]===AUDIO_EVENTS.rescue.level));
 assert.equal(audio.state.voices,1);osc.onended();assert.equal(audio.state.voices,0);setVolume(0);audio.syncSettings();const n=log.oscillators.length;assert.equal(audio.play('hurt'),false);assert.equal(log.oscillators.length,n);
});

test('event whitelist, deduplication, priority ordering, 4 total and 3 lower-priority voices',async()=>{
 const{audio,log}=setup();await audio.unlock();
 const original=[{kind:'shot'},{kind:'skill'},{kind:'hurt'},{kind:'boss'},{kind:'dash'},{kind:'rescue'},{kind:'hurt'},{kind:'hit'},{kind:'ally-save'},{kind:'toString'}],snapshot=structuredClone(original);
 assert.equal(audio.playEvents(original),4);assert.deepEqual(original,snapshot,'caller event contents and order stay untouched');assert.equal(audio.state.voices,4);assert.equal(audio.state.played,4);
 const frequencies=log.events.filter(e=>Array.isArray(e)&&e[0]==='freq'&&e[1]==='set').map(e=>e[2]);assert.deepEqual(frequencies,[220,300,120,740],'top three plus first middle priority selected');
 assert.equal(audio.play('boss'),false,'hard cap applies even to high priority');assert.equal(audio.state.voices,4);
 const second=setup();await second.audio.unlock();assert.equal(second.audio.playEvents([{kind:'shot'},{kind:'rescue'},{kind:'skill'},{kind:'explosion'},{kind:'shot'}]),3);assert.equal(second.audio.state.voices,3,'lower-priority cap is three');
 assert.deepEqual(second.log.events.filter(e=>Array.isArray(e)&&e[0]==='freq'&&e[1]==='set').map(e=>e[2]),[740,550,180]);
});

test('cooldowns use audio time and rejected events are dropped rather than queued',async()=>{
 const{audio,log}=setup();await audio.unlock();assert.equal(audio.play('shot'),true);assert.equal(audio.play('shot'),false);assert.equal(audio.state.dropped,1);
 log.clock.now+=.081;assert.equal(audio.play('shot'),true);assert.equal(audio.state.played,2);
 audio.setActive(false);assert.equal(audio.play('rescue'),false);const played=audio.state.played;audio.setActive(true);assert.equal(audio.state.played,played,'resume does not flush dropped events');
});

test('pause fade keeps slots until onended and rapid resume never exceeds four voices',async()=>{
 const{audio,log}=setup();await audio.unlock();
 for(const k of ['shot','explosion','rescue','hurt']){log.clock.now+=1;assert.equal(audio.play(k),true);}
 assert.equal(audio.state.voices,4);audio.setActive(false);assert.equal(audio.state.voices,4,'stopAll fades, but does not prematurely release voices');
 audio.setActive(true);assert.equal(audio.play('hurt'),false,'fading voices still occupy all four slots');assert.equal(audio.state.voices,4);
 endVoices(log);assert.equal(audio.state.voices,0);assert.equal(audio.play('hurt'),true);assert.equal(audio.state.voices,1);assert.ok(audio.state.voices<=4);
});

test('suspended context is silent; paused voices remain capped until resumed onended cleanup',async()=>{
 const{audio,log}=setup();await audio.unlock();assert.equal(audio.play('rescue'),true);assert.equal(audio.state.voices,1);
 log.context.state='suspended';assert.equal(audio.play('hurt'),false,'suspended context cannot accept a new voice');
 audio.setActive(false);assert.equal(audio.state.voices,1,'scheduled fade remains counted while context time is suspended');
 assert.ok(log.events.some(e=>Array.isArray(e)&&e[0]==='stop'&&e[1]===2.01));
 audio.setActive(true);assert.equal(await audio.unlock(),true);endVoices(log);assert.equal(audio.state.voices,0,'onended releases the suspended/fading voice after resume');
 assert.equal(audio.play('hurt'),true);assert.equal(audio.state.voices,1);
});

test('rapid mute and pause transitions schedule one fade and never free a slot early',async()=>{
 const{audio,log,setMuted}=setup();await audio.unlock();assert.equal(audio.play('dash'),true);audio.setActive(false);setMuted(true);audio.syncSettings();audio.setActive(true);setMuted(false);audio.syncSettings();
 assert.equal(audio.state.voices,1);assert.equal(log.events.filter(e=>Array.isArray(e)&&e[0]==='stop'&&e[1]===2.01).length,1,'repeated stopAll does not double-schedule its fade stop');
 assert.equal(audio.play('hurt'),true);assert.equal(audio.state.voices,2);endVoices(log);assert.equal(audio.state.voices,0);
});

test('failed construction and unknown/inherited event names are silent',async()=>{
 const{audio}=setup({createError:'closed'});await audio.unlock();assert.equal(audio.play('hurt'),false);assert.ok(audio.state.errors>0);
 const ctor=setup({volume:1,constructorError:'constructor failed'});assert.equal(await ctor.audio.unlock(),false);
 const syncResume=setup({volume:1,resume:'throw'});assert.equal(await syncResume.audio.unlock(),false);
 const missing=setup({volume:1});await missing.audio.unlock();assert.equal(missing.audio.play('constructor'),false);assert.equal(missing.audio.play('toString'),false);assert.equal(missing.audio.play('hit'),false);assert.equal(missing.audio.play('ally-rescue'),false);assert.equal(missing.audio.state.voices,0);
});
