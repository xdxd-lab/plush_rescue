import {spawn,execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
if(!args.includes('--run')){process.stdout.write('Prepared only; no browser or server started.\n');process.exit(0);}
if(process.versions.node.split('.')[0]!=='24')throw Error('Node24 required');
const i=args.indexOf('--expected-sha'); const sha=args[i+1];
if(i<0||!/^[a-f0-9]{40}$/.test(sha)||args.length!==3)throw Error('Only --run --expected-sha FULL_SHA accepted');
const began=performance.now(),started=new Date().toISOString();
const remaining=budget=>Math.max(0,budget-(performance.now()-began));
const configuration=JSON.parse(execFileSync('/usr/bin/python3',[path.join(root,'configuration.py'),'--check'],{encoding:'utf8',timeout:3000}));
const version=execFileSync('/usr/bin/python3',['--version'],{encoding:'utf8',timeout:3000}).trim();
mkdirSync(configuration.report_root,{recursive:true,mode:0o700});
// Recheck existing/new private root and known child directories before writing a checkpoint.
execFileSync('/usr/bin/python3',[path.join(root,'configuration.py'),'--check'],{encoding:'utf8',timeout:3000});
const output=path.join(configuration.report_root,`q3-supervisor-${Date.now()}`);
mkdirSync(output,{recursive:false,mode:0o700});
let child,deadline=false,forced=false,bytes=0,log='';
const command=['/usr/bin/python3',path.join(root,'run_q3_n1.py'),'--run','--expected-sha',sha];
const save=extra=>writeFileSync(path.join(output,'supervisor.json'),JSON.stringify({started,node:process.version,python:version,command,pid:child?.pid,deadline,forced,bytes,...extra},null,2));
child=spawn(command[0],command.slice(1),{stdio:['ignore','pipe','pipe']});save({status:'running'});
function collect(data){bytes+=data.length;if(bytes>1048576){deadline=true;child.kill('SIGTERM');return;}log+=data.toString();}
child.stdout.on('data',collect);child.stderr.on('data',collect);
const work=setTimeout(()=>{deadline=true;child.kill('SIGTERM');save({status:'work-timeout'});},remaining(600000));
const total=setTimeout(()=>{forced=true;child.kill('SIGKILL');child.stdout.destroy();child.stderr.destroy();save({status:'total-timeout',cleanupVerified:false});process.exitCode=1;},remaining(660000));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{deadline=true;child.kill('SIGTERM');});
child.on('error',e=>{clearTimeout(work);clearTimeout(total);save({error:String(e),cleanupVerified:false});process.exitCode=1;});
child.on('close',(code,signal)=>{clearTimeout(work);clearTimeout(total);writeFileSync(path.join(output,'output.log'),log);save({finished:new Date().toISOString(),code,signal,status:'completed',cleanupVerified:false,note:'Read runner report ownership/ports/profile; supervisor exit is not cleanup proof'});process.exitCode=code===0&&!deadline&&!forced?0:1;});
