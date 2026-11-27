// Event-only synthesized audio. No files, background music or game-state writes.
// Values are prototype choices: audible balance still requires independent listening.
export const AUDIO_EVENTS=Object.freeze({
 hurt:{priority:0,cooldown:.12,type:'triangle',from:120,to:65,level:.12},
 boss:{priority:0,cooldown:.8,type:'triangle',from:220,to:330,level:.10},
 dash:{priority:0,cooldown:.3,type:'sine',from:300,to:150,level:.09},
 rescue:{priority:1,cooldown:.25,type:'sine',from:740,to:1100,level:.12},
 skill:{priority:1,cooldown:.4,type:'sine',from:550,to:880,level:.10},
 shot:{priority:2,cooldown:.08,type:'sine',from:420,to:180,level:.025},
 explosion:{priority:2,cooldown:.25,type:'triangle',from:180,to:75,level:.06}
});
const MAX_VOICES=4,LOWER_VOICES=3;
export function createAudio({getContextClass,volume,muted=()=>false}){
 let context,master,masterLevel=null,active=true,lastError=null;
 const voices=new Set(),lastPlayed=new Map();
 const counts={played:0,dropped:0,errors:0};
 function fail(error){lastError=String(error?.message||error);counts.errors++;}
 function level(){const v=volume();return muted()||!Number.isFinite(v)?0:Math.min(1,Math.max(0,v));}
 function release(voice){voices.delete(voice);try{voice.oscillator.disconnect();}catch{}try{voice.gain.disconnect();}catch{}}
 function stopAll(){
  for(const voice of voices){
   if(voice.stopping)continue;voice.stopping=true;
   try{
    const t=context.currentTime;voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(Math.max(.0001,voice.gain.gain.value),t);
    voice.gain.gain.linearRampToValueAtTime(.0001,t+.01);
    voice.oscillator.stop(t+.01);
   }catch(error){fail(error);try{voice.oscillator.stop();}catch{}release(voice);}
  }
  // Fading voices still count toward the cap until onended; no delayed event queue.
  lastPlayed.clear();
 }
 function syncSettings(){
  try{
   const value=level();
   if(master&&value!==masterLevel){
    const t=context.currentTime;
    if(masterLevel===null)master.gain.setValueAtTime(value,t);
    else{
     if(typeof master.gain.cancelAndHoldAtTime==='function')master.gain.cancelAndHoldAtTime(t);
     else{master.gain.cancelScheduledValues(t);master.gain.setValueAtTime(master.gain.value,t);}
     master.gain.linearRampToValueAtTime(value,t+.01);
    }
    masterLevel=value;
   }
   if(value===0)stopAll();
  }catch(error){fail(error);stopAll();}
 }
 function unlock(){
  try{
   if(level()===0){syncSettings();return Promise.resolve(false);}
   if(!context){const Context=getContextClass();if(typeof Context!=='function')return Promise.resolve(false);context=new Context();}
   if(!master){master=context.createGain();master.connect(context.destination);}
   syncSettings();
   return Promise.resolve(context.resume()).then(()=>context.state==='running',error=>{fail(error);return false;});
  }catch(error){fail(error);return Promise.resolve(false);}
 }
 function setActive(value){const next=Boolean(value);if(active&&!next)stopAll();active=next;}
 function play(kind){
  const spec=Object.hasOwn(AUDIO_EVENTS,kind)?AUDIO_EVENTS[kind]:null;
  try{
   if(!spec||!active||!context||!master||context.state!=='running'||level()===0){counts.dropped++;return false;}
   const now=context.currentTime;
   if(now-(lastPlayed.get(kind)??-Infinity)<spec.cooldown||voices.size>=MAX_VOICES||
      (spec.priority>0&&[...voices].filter(v=>v.priority>0).length>=LOWER_VOICES)){counts.dropped++;return false;}
   syncSettings();
   let oscillator,gain,voice;
   try{
    oscillator=context.createOscillator();gain=context.createGain();
    voice={oscillator,gain,priority:spec.priority,stopping:false};voices.add(voice);
    oscillator.onended=()=>release(voice);
    oscillator.type=spec.type;oscillator.frequency.setValueAtTime(spec.from,now);
    oscillator.frequency.exponentialRampToValueAtTime(spec.to,now+.08);
    gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(spec.level,now+.005);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.1);
    oscillator.connect(gain);gain.connect(master);oscillator.start();oscillator.stop(now+.11);
    lastPlayed.set(kind,now);counts.played++;return true;
   }catch(error){
    try{oscillator?.stop();}catch{}
    if(voice)release(voice);else{try{oscillator?.disconnect();}catch{}try{gain?.disconnect();}catch{}}
    throw error;
   }
  }catch(error){fail(error);return false;}
 }
 function playEvents(events){
  // Sort a fresh list: callers retain every original event in its original order.
  const kinds=[...new Set(events.map(e=>e.kind).filter(k=>Object.hasOwn(AUDIO_EVENTS,k)))];
  kinds.sort((a,b)=>AUDIO_EVENTS[a].priority-AUDIO_EVENTS[b].priority||a.localeCompare(b));
  let started=0;for(const kind of kinds){if(started===MAX_VOICES)break;if(play(kind))started++;}return started;
 }
 return {play,playEvents,unlock,setActive,syncSettings,stopAll,
  get unlocked(){return Boolean(context);},
  get state(){return {context:context?.state??'unavailable',active,voices:voices.size,muted:Boolean(muted()),volume:volume(),...counts,lastError};}
 };
}
