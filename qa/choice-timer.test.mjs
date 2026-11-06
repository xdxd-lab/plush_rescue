// choice-timer.js on its own, with a minimal page stub. The DOM smoke checks the
// same countdown through the real dialogs. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChoiceTimer} from '../choice-timer.js';

function page(){
 const listeners=t=>({events:{},addEventListener(type,fn){(this.events[type]??=[]).push(fn);}});
 const el=()=>({textContent:'',style:{props:{},setProperty(k,v){this.props[k]=v;}},classList:{set:new Set(),toggle(c,on){on?this.set.add(c):this.set.delete(c);}}});
 const nodes={'#choiceCountdownText':el(),'#choiceCountdownAnnounce':el(),'#choiceCountdownBar':el()};
 const doc={...listeners(),hidden:false,focused:true,hasFocus(){return this.focused;},querySelector:s=>nodes[s]??null};
 const win=listeners(),dialog=listeners();
 const fire=(target,type,event={})=>{for(const fn of target.events[type]??[])fn(event);};
 return {doc,win,dialog,nodes,fire};
}
function timer(options={}){
 const p=page(),state={enabled:true,game:{},key:'upgrade:',chosen:[]};
 const t=createChoiceTimer({doc:p.doc,win:p.win,dialog:p.dialog,enabled:()=>state.enabled,getGame:()=>state.game,getKey:()=>state.key,onAutoChosen:label=>state.chosen.push(label),...options});
 return {t,p,state};
}

test('disabled or without a target: no countdown and no markup',()=>{
 const {t,state}=timer();state.enabled=false;
 t.start({classList:{toggle(){}}},'x',()=>{});assert.equal(t.state,null);assert.equal(t.markup(),'');
 state.enabled=true;t.start(null,'x',()=>{});assert.equal(t.state,null);assert.match(t.markup(),/id="choiceCountdownText"/);
});

test('counts visible time, caps one long frame at 2 s and resolves exactly once',()=>{
 const {t,p,state}=timer(),target=p.nodes['#choiceCountdownBar'];let resolved=0;
 t.start(target,'暖心光束',()=>resolved++);assert.ok(target.classList.set.has('auto-choice-target'));
 assert.equal(p.nodes['#choiceCountdownText'].textContent,'10 秒後自動選擇：暖心光束');
 t.advance(30);assert.equal(t.state.remaining,8,'a 30 s stall counts 2 s');
 for(let i=0;i<40;i++)t.advance(.25);
 assert.equal(resolved,1);assert.deepEqual(state.chosen,['暖心光束']);assert.equal(t.state,null);
 assert.ok(!target.classList.set.has('auto-choice-target'));
});

test('hidden or unfocused time is not counted; coming back leaves at least 3 s',()=>{
 const {t,p}=timer();t.start(p.nodes['#choiceCountdownBar'],'x',()=>{});
 for(let i=0;i<36;i++)t.advance(.25);assert.equal(t.state.remaining,1);
 p.doc.focused=false;t.advance(.25);t.advance(5);assert.equal(t.state.remaining,1,'unfocused');
 p.doc.focused=true;t.advance(.25);assert.equal(t.state.remaining,3,'back with 3 s');
 p.doc.hidden=true;p.fire(p.doc,'visibilitychange');p.doc.hidden=false;t.advance(.25);assert.equal(t.state.remaining,3);
 p.fire(p.win,'blur');t.advance(.25);assert.equal(t.state.remaining,3,'a blur also marks the time away');
});

test('cancelled by a press, wheel, touch scroll or a non-modifier key; never resolves after',()=>{
 for(const [target,type,event] of [['dialog','pointerdown'],['dialog','wheel'],['dialog','touchmove'],['win','keydown',{key:'a'}]]){
  const {t,p}=timer();let resolved=0;t.start(p.nodes['#choiceCountdownBar'],'x',()=>resolved++);
  p.fire(p.win,'keydown',{key:'Shift'});assert.equal(t.state.cancelled,false,'a bare modifier does not cancel');
  p.fire(p[target],type,event);assert.equal(t.state.cancelled,true,`${target} ${type}`);
  assert.equal(p.nodes['#choiceCountdownText'].textContent,'已取消自動選擇，請自行決定');
  t.advance(30);t.advance(30);assert.equal(resolved,0);
 }
});

test('a countdown from another game or dialog state is ignored',()=>{
 const {t,p,state}=timer();let resolved=0;t.start(p.nodes['#choiceCountdownBar'],'x',()=>resolved++);
 state.key='pickup:7';for(let i=0;i<10;i++)t.advance(2);assert.equal(resolved,0);assert.equal(t.state.remaining,10);
 state.key='upgrade:';state.game={};for(let i=0;i<10;i++)t.advance(2);assert.equal(resolved,0);
});
