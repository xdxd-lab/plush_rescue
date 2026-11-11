import test from 'node:test';
import assert from 'node:assert/strict';
import {createChromeTelemetry} from './chrome-q2-telemetry.mjs';

test('phase and CDP telemetry keep elapsed and active evidence within bounds',()=>{
 let tick=1000;const lines=[];
 const t=createChromeTelemetry({now:()=>tick,emit:line=>lines.push(line)});
 t.phase(1,'pause','begin');tick+=25;
 const finish=t.cdpStart(1,'Runtime.evaluate');tick+=40;
 let snapshot=t.snapshot();
 assert.deepEqual(snapshot.currentPhase,{round:1,stage:'pause',startedAtMs:1000,elapsedMs:65});
 assert.equal(snapshot.activeCdp[0].elapsedMs,40);
 finish('completed');tick+=10;t.phase(1,'pause','done');
 assert.equal(snapshot.activeCdp[0].state,'active','abort-time snapshot remains intact after cleanup');
 snapshot=t.snapshot();
 assert.equal(snapshot.currentPhase,null);
 assert.equal(snapshot.settingsPhases[1].elapsedMs,75);
 assert.equal(snapshot.recentCdp[0].state,'completed');
 assert.equal(snapshot.recentCdp[0].elapsedMs,40);
 assert.equal(lines.length,2);
 for(let i=0;i<70;i++){t.phase(2,'round','begin');const end=t.cdpStart(i+2,'Page.navigate');end('completed');}
 snapshot=t.snapshot();
 assert.equal(snapshot.settingsPhases.length,64);
 assert.equal(snapshot.recentCdp.length,20);
 assert.equal(snapshot.activeCdpCount,0);
});
