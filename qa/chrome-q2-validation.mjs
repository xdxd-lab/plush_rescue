// Pure checks for the branch-only Chrome diagnostic report. Keep the expected
// result order independent of the browser harness so a skipped case is visible.
const desktop='desktop 1280x720';
export const matrixNames=[
 `${desktop}: boots with WebGL, revision and no errors`,
 `${desktop}: start, then ring, item and both label ends are tappable`,
 `${desktop}: far drop on screen (label hidden) is tappable`,
 `${desktop}: opaque weapon card blocks the drop under it, the uncovered part still works`,
 `${desktop}: five rounds of pause, settings and resume through the real menu`,
 `${desktop}: a slow 600 ms mouse click picks; a 900 ms hold does not`,
 '  timing evidence',
 `${desktop}: a quick click is still a click while the main thread is blocked for 900 ms`,
 `${desktop}: a 15 px mouse drag from a drop does not pick it`,
 `${desktop}: settings and auto-equip survive a reload; the run does not`,
 'a separate browser profile context starts from defaults (storage is per profile and origin)',
 'blocked localStorage: the game runs, settings work for the session, a reload falls back to defaults',
 '1280x720: start and resume are fully visible on open; every other control stays reachable',
 'pause settings: Tab reaches a segmented choice and arrow keys change it',
 ...['ready','paused'].flatMap(state=>{
  const primary=state==='ready'?'#start':'#resume';
  return [`dialog 1280x720 ${state}: wheel reaches the end and ${primary} works`,
   `dialog 1280x720 ${state}: every control tabbed to comes into view, Enter on ${primary} works`];
 })
];
export function matrixComplete(report){
 const results=report?.results;
 return Array.isArray(results)&&results.length===matrixNames.length&&
  results.every((result,i)=>result.name===matrixNames[i]&&result.ok===true&&result.notRun!==true)&&
  report.passed===17&&report.failed===0&&report.notRun===0;
}
export function matrixCaseValid({exit,outerTimedOut,cleanupSafe,report,shotsPresent}){
 return exit?.code===0&&!outerTimedOut&&cleanupSafe&&shotsPresent&&matrixComplete(report)&&
  !report.aborted&&!report.fatal&&Array.isArray(report.consoleErrors)&&report.consoleErrors.length===0&&
  Array.isArray(report.webglDiagnostics)&&report.webglDiagnostics.length===1&&
  /WebGL/i.test(report.webglDiagnostics[0].version??'')&&Boolean(report.webglDiagnostics[0].renderer);
}
function exactResults(report,expected){
 return Array.isArray(report?.results)&&report.results.length===expected.length&&
  report.results.every((result,i)=>result.name===expected[i].name&&result.ok===expected[i].ok&&
   Boolean(result.notRun)===Boolean(expected[i].notRun));
}
export function lifecycleValid(mode,{exit,outerTimedOut,cleanupSafe,report}){
 if(exit?.code!==1||outerTimedOut||!cleanupSafe||report?.selfTest?.mode!==mode)return false;
 if(mode==='timeout')return report.selfTest.phaseReached==='game-page-ready'&&
  report.aborted==='check "self-test: stuck check keeps using the page" timed out after 1500 ms'&&
  report.fatal?.startsWith('schedule ended after abort:')&&report.passed===0&&report.failed===2&&report.notRun===1&&
  report.selfTest.okAfterTimeout===0&&report.selfTest.laterCheckRan!==true&&
  exactResults(report,[{name:'self-test: stuck check keeps using the page',ok:false},
   {name:'self-test: later check (must not run)',ok:false,notRun:true}])&&
  report.results[0].error==='timed out after 1500 ms';
 if(mode==='cdp')return report.selfTest.phaseReached==='blank-page-ready'&&
  report.aborted==='CDP Runtime.evaluate timed out after 1500 ms'&&report.fatal===null&&
  report.passed===0&&report.failed===2&&report.notRun===1&&report.selfTest.laterCheckRan!==true&&
  exactResults(report,[{name:'self-test: a CDP request that never completes',ok:false},
   {name:'self-test: later check (must not run)',ok:false,notRun:true}])&&
  report.results[0].error==='Runtime.evaluate timed out after 1500 ms';
 if(mode==='assert')return report.selfTest.phaseReached==='game-page-ready'&&
  report.aborted===null&&report.fatal===null&&report.passed===1&&report.failed===1&&report.notRun===0&&
  report.selfTest.laterCheckRan===true&&
  exactResults(report,[{name:'self-test: failing assertion',ok:false},
   {name:'self-test: next check still runs',ok:true}])&&
  report.results[0].error?.includes('Expected values to be strictly equal');
 if(mode==='setup')return report.selfTest.phaseReached==='devtools-ready'&&
  report.aborted===null&&report.fatal==='self-test: setup failure after Chrome started'&&
  report.passed===0&&report.failed===0&&report.notRun===0&&exactResults(report,[]);
 return false;
}
export function expectedCaseNames(matrixRuns){
 if(matrixRuns!==1&&matrixRuns!==2)throw new Error('matrix runs must be 1 or 2');
 return [...Array.from({length:matrixRuns},(_,i)=>`matrix-${i+1}`),
  'lifecycle-timeout','lifecycle-cdp','lifecycle-assert','lifecycle-setup'];
}
export function parseMatrixRuns(args){
 const values=args.filter(arg=>arg.startsWith('--matrix-runs='));
 if(values.length>1)throw new Error('pass --matrix-runs once');
 const value=values[0]?.slice(14)??'2';
 if(!/^[12]$/.test(value))throw new Error('matrix runs must be 1 or 2');
 return Number(value);
}
export function completeDiagnostic(cases,matrixRuns){
 const names=expectedCaseNames(matrixRuns);
 return Array.isArray(cases)&&cases.length===names.length&&
  cases.every((entry,i)=>entry.name===names[i]&&entry.valid===true);
}
