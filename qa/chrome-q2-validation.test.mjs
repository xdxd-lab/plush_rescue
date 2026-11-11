import test from 'node:test';
import assert from 'node:assert/strict';
import {matrixNames,matrixComplete,matrixCaseValid,lifecycleValid,completeDiagnostic,expectedCaseNames,parseMatrixRuns} from './chrome-q2-validation.mjs';

const matrix=()=>({results:matrixNames.map((name)=>({name,ok:true})),passed:17,failed:0,notRun:0,
 aborted:null,fatal:null,consoleErrors:[],webglDiagnostics:[{version:'WebGL 2.0',renderer:'SwiftShader'}]});
const goodMatrix=report=>matrixCaseValid({exit:{code:0},outerTimedOut:false,cleanupSafe:true,shotsPresent:true,report});
test('matrix requires every result in its emitted order',()=>{
 assert.equal(matrixNames.length,18);
 assert.equal(goodMatrix(matrix()),true);
 const missing=matrix();missing.results.splice(7,1);assert.equal(matrixComplete(missing),false);
 const reversed=matrix();[reversed.results[6],reversed.results[7]]=[reversed.results[7],reversed.results[6]];
 assert.equal(matrixComplete(reversed),false);
 const skipped=matrix();skipped.results[16].notRun=true;assert.equal(matrixComplete(skipped),false);
 assert.equal(matrixCaseValid({exit:{code:0},outerTimedOut:true,cleanupSafe:true,shotsPresent:true,report:matrix()}),false);
});
const base=(mode,phase)=>({selfTest:{mode,phaseReached:phase},aborted:null,fatal:null,
 passed:0,failed:0,notRun:0,results:[]});
const valid=(mode,report,extra={})=>lifecycleValid(mode,{exit:{code:1},outerTimedOut:false,cleanupSafe:true,report,...extra});
test('CDP probe requires its request timer, never a check-name match',()=>{
 const report=base('cdp','blank-page-ready');
 report.aborted='CDP Runtime.evaluate timed out after 1500 ms';report.failed=2;report.notRun=1;
 report.results=[{name:'self-test: a CDP request that never completes',ok:false,error:'Runtime.evaluate timed out after 1500 ms'},
  {name:'self-test: later check (must not run)',ok:false,notRun:true}];
 assert.equal(valid('cdp',report),true);
 assert.equal(valid('cdp',{...report,aborted:'check "self-test: a CDP request that never completes" timed out after 1500 ms'}),false);
 assert.equal(valid('cdp',{...report,selfTest:{mode:'cdp',phaseReached:'setup-only'}}),false);
 assert.equal(valid('cdp',report,{outerTimedOut:true}),false);
});
test('timeout, assertion and setup probes require their intended phases and results',()=>{
 const timeout=base('timeout','game-page-ready');
 timeout.aborted='check "self-test: stuck check keeps using the page" timed out after 1500 ms';
 timeout.fatal='schedule ended after abort: refused: Runtime.evaluate refused';
 timeout.failed=2;timeout.notRun=1;timeout.selfTest.okAfterTimeout=0;
 timeout.results=[{name:'self-test: stuck check keeps using the page',ok:false,error:'timed out after 1500 ms'},
  {name:'self-test: later check (must not run)',ok:false,notRun:true}];
 assert.equal(valid('timeout',timeout),true);
 assert.equal(valid('timeout',{...timeout,results:timeout.results.slice(0,1)}),false);
 const assertion=base('assert','game-page-ready');
 assertion.failed=1;assertion.passed=1;assertion.selfTest.laterCheckRan=true;
 assertion.results=[{name:'self-test: failing assertion',ok:false,error:'Expected values to be strictly equal:'},
  {name:'self-test: next check still runs',ok:true}];
 assert.equal(valid('assert',assertion),true);
 assert.equal(valid('assert',{...assertion,results:[{...assertion.results[0],error:'CDP timeout'},assertion.results[1]]}),false);
 const setup=base('setup','devtools-ready');setup.fatal='self-test: setup failure after Chrome started';
 assert.equal(valid('setup',setup),true);
 assert.equal(valid('setup',setup,{outerTimedOut:true}),false);
});
test('a five-case run cannot pass',()=>{
 const two=expectedCaseNames(2).map(name=>({name,valid:true}));
 const one=expectedCaseNames(1).map(name=>({name,valid:true}));
 assert.equal(completeDiagnostic(two,2),true);
 assert.equal(completeDiagnostic(one,1),true);
 assert.equal(completeDiagnostic(one,2),false);
 assert.equal(completeDiagnostic(two,1),false);
 assert.equal(completeDiagnostic(two.slice(0,5),2),false);
 assert.equal(completeDiagnostic(two.map((entry,i)=>i===1?{...entry,valid:false}:entry),2),false);
 assert.throws(()=>expectedCaseNames(0));
 assert.throws(()=>expectedCaseNames(3));
 assert.equal(parseMatrixRuns([]),2);
 assert.equal(parseMatrixRuns(['--matrix-runs=1']),1);
 assert.equal(parseMatrixRuns(['--matrix-runs=2']),2);
 for(const value of ['0','3','01','1.0',''])assert.throws(()=>parseMatrixRuns([`--matrix-runs=${value}`]));
 assert.throws(()=>parseMatrixRuns(['--matrix-runs=1','--matrix-runs=2']));
});
