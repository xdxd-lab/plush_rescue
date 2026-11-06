// V12.2.1 auto-choice countdown. With the setting on, a level-up or pickup dialog
// takes its recommended choice after 10 seconds the player could see. Any pointer
// press, wheel or touch scroll on the dialog, or any key except a bare modifier,
// cancels it for that dialog. Hidden or unfocused time does not count, coming
// back leaves at least 3 seconds, and one long frame counts at most 2 seconds.
// A countdown belongs to one game and one dialog state, so a stale one never
// resolves a later dialog. Split out of main.js without behaviour changes.
const MARKUP='<div class="choice-countdown" id="choiceCountdown"><span id="choiceCountdownText" role="timer" aria-live="off"></span><span id="choiceCountdownAnnounce" class="visually-hidden" aria-live="polite"></span><span class="choice-countdown-track"><span id="choiceCountdownBar" class="choice-countdown-bar"></span></span></div>';

// doc/win/dialog: the page; enabled(): the auto-choice setting; getGame()/getKey():
// the current game and dialog state; onAutoChosen(label): after a choice was made.
export function createChoiceTimer({doc,win,dialog,enabled,getGame,getKey,onAutoChosen}){
 let timer=null;
 const $=selector=>doc.querySelector(selector);
 const unfocused=()=>doc.hidden||doc.hasFocus?.()===false;
 function render(){
  if(!timer)return;
  const label=$('#choiceCountdownText'),announce=$('#choiceCountdownAnnounce'),bar=$('#choiceCountdownBar');
  if(!label)return;
  if(timer.cancelled){label.textContent='已取消自動選擇，請自行決定';if(announce)announce.textContent='已取消自動選擇';return;}
  const seconds=Math.ceil(Math.max(0,timer.remaining));
  label.textContent=`${seconds} 秒後自動選擇：${timer.label}`;
  bar?.style.setProperty('--choice-width',`${Math.max(0,timer.remaining*10)}%`);
  if(seconds!==timer.shown){timer.shown=seconds;if(announce&&(seconds===10||seconds===3))announce.textContent=label.textContent;}
 }
 function clear(){timer?.target?.classList.toggle('auto-choice-target',false);timer=null;}
 function start(target,label,resolve){
  if(!enabled()||!target)return;
  timer={game:getGame(),key:getKey(),target,label,resolve,remaining:10,shown:-1,cancelled:false,away:unfocused()};
  target.classList.toggle('auto-choice-target',true);render();
 }
 function cancel(){if(!timer||timer.cancelled)return;timer.cancelled=true;timer.target.classList.toggle('auto-choice-target',false);render();}
 function advance(realDt){
  const current=timer;
  if(!current||current.cancelled||current.game!==getGame()||current.key!==getKey())return;
  if(unfocused()){current.away=true;return;}
  if(current.away){current.away=false;current.remaining=Math.max(3,current.remaining);render();return;}
  if(!(realDt>0))return;
  // Count slow visible frames, but cap a single long stall so it cannot decide
  // immediately after the device wakes without firing a blur event.
  current.remaining=Math.max(0,current.remaining-Math.min(realDt,2));render();
  if(current.remaining===0){const resolve=current.resolve,label=current.label;clear();resolve();onAutoChosen(label);}
 }
 dialog.addEventListener('pointerdown',cancel);
 dialog.addEventListener('wheel',cancel,{passive:true});
 dialog.addEventListener('touchmove',cancel,{passive:true});
 win.addEventListener('keydown',e=>{if(e.key!=='Shift'&&e.key!=='Control'&&e.key!=='Alt'&&e.key!=='Meta')cancel();});
 win.addEventListener('blur',()=>{if(timer)timer.away=true;});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&timer)timer.away=true;});
 return {start,clear,cancel,advance,
  // The countdown row for a dialog, empty while the setting is off.
  markup(){return enabled()?MARKUP:'';},
  get state(){return timer&&{remaining:timer.remaining,target:timer.label,cancelled:timer.cancelled};}};
}
