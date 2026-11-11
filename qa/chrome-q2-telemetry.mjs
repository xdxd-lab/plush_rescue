// Bounded QA diagnostics only. Timestamps are wall-clock milliseconds so an
// interrupted run can be compared with runner stderr and the GitHub timeline.
export function createChromeTelemetry({now=Date.now,emit=()=>{}}={}){
 const phases=[],recentCdp=[],activeCdp=new Map(),starts=new Map();
 let currentPhase=null;
 const keep=(items,limit)=>{if(items.length>limit)items.splice(0,items.length-limit);};
 function phase(round,stage,event){
  const atMs=now(),key=`${round}:${stage}`;
  if(event==='begin')starts.set(key,atMs);
  const entry={round,stage,event,atMs};
  if(event==='done'){
   entry.elapsedMs=starts.has(key)?atMs-starts.get(key):null;
   starts.delete(key);
  }
  if(stage!=='round'){
   if(event==='begin')currentPhase={round,stage,startedAtMs:atMs};
   if(event==='done'&&currentPhase?.round===round&&currentPhase.stage===stage)currentPhase=null;
  }
  phases.push(entry);keep(phases,64);
  emit(`QA_PHASE ${JSON.stringify(entry)}`);
 }
 function cdpStart(id,method){
  const startedAtMs=now(),entry={id,method,startedAtMs,state:'active'};
  recentCdp.push(entry);keep(recentCdp,20);activeCdp.set(id,entry);
  return state=>{
   if(entry.state!=='active')return;
   entry.state=state;entry.elapsedMs=now()-startedAtMs;activeCdp.delete(id);
  };
 }
 function snapshot(){
  const atMs=now();
  return {atMs,settingsPhases:phases.map(entry=>({...entry})),
   currentPhase:currentPhase?{...currentPhase,elapsedMs:atMs-currentPhase.startedAtMs}:null,
   recentCdp:recentCdp.map(entry=>({...entry,elapsedMs:entry.state==='active'?atMs-entry.startedAtMs:entry.elapsedMs})),
   activeCdpCount:activeCdp.size,
   activeCdp:[...activeCdp.values()].slice(-8).map(entry=>({...entry,elapsedMs:atMs-entry.startedAtMs}))};
 }
 return {phase,cdpStart,snapshot};
}
