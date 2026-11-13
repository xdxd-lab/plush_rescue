import {spawn} from 'node:child_process';

// No retries. Hooks persist evidence synchronously; an overflowing stream is a failure.
export async function supervise(command,args,{cwd,env,workMs=720000,graceMs=10000,maxBytes=16000000,onData=()=>{},onStop=()=>{},onSpawn=()=>{}}={}){
 let timedOut=false,interrupted=false,overflow=false,forced=false,spawnError=null,closed=false;
 const bytes={stdout:0,stderr:0};
 const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});
 const alive=()=>!closed&&child.exitCode===null&&child.signalCode===null;
 const signal=()=>{if(alive())try{child.kill('SIGTERM');}catch{}};
 let escalation,drainTimer;
 const stop=reason=>{
  if(closed)return;
  if(reason==='timeout')timedOut=true;if(reason==='signal')interrupted=true;if(reason==='overflow')overflow=true;
  signal();onStop(reason);
  escalation??=setTimeout(()=>{if(!closed){forced=true;if(alive())try{child.kill('SIGKILL');}catch{}onStop('hard-kill');}},graceMs);
 };
 const handlers=new Map(['SIGTERM','SIGINT','SIGHUP'].map(sig=>[sig,()=>stop('signal')]));
 for(const [sig,handler] of handlers)process.on(sig,handler);
 const timer=setTimeout(()=>stop('timeout'),workMs);
 child.once('spawn',()=>onSpawn(child.pid));
 for(const key of ['stdout','stderr'])child[key].on('data',chunk=>{
  const remaining=Math.max(0,maxBytes-bytes[key]);bytes[key]+=chunk.length;
  if(remaining)onData(key,chunk.subarray(0,remaining));
  if(bytes[key]>maxBytes)stop('overflow');
 });
 child.once('error',error=>{spawnError=String(error.message);});
 // A descendant retaining stdio must not defeat the cleanup deadline after parent exit.
 const exit=await new Promise(resolve=>{
  child.once('exit',()=>{drainTimer=setTimeout(()=>{if(!closed){forced=true;onStop('pipe-drain');child.stdout.destroy();child.stderr.destroy();}},graceMs);});
  child.once('close',(code,signal)=>resolve({code,signal}));
 });
 closed=true;clearTimeout(timer);clearTimeout(escalation);clearTimeout(drainTimer);
 for(const [sig,handler] of handlers)process.off(sig,handler);
 return {exit,timedOut,interrupted,overflow,forced,spawnError,bytes,runnerPid:child.pid??null};
}
