// hud.js on its own: change-only writes, notice priority and feedback timers.
// The DOM smoke checks the full HUD against a real game. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHud,HUD_IDS} from '../hud.js';

function page(){
 const writes=[],nodes=new Map();
 const node=name=>{
  const el={name,_text:'',_class:'',attrs:{},style:{setProperty(k,v){writes.push([name,'style',k,v]);}},classList:{set:new Set(),toggle(c,on){writes.push([name,'class',c,on]);on?this.set.add(c):this.set.delete(c);}},
   setAttribute(k,v){writes.push([name,'attr',k,v]);this.attrs[k]=v;}};
  Object.defineProperty(el,'textContent',{get(){return this._text;},set(v){writes.push([name,'text',v]);this._text=v;}});
  Object.defineProperty(el,'className',{get(){return this._class;},set(v){writes.push([name,'className',v]);this._class=v;}});
  return el;
 };
 const doc={querySelector:s=>{if(!nodes.has(s))nodes.set(s,node(s));return nodes.get(s);},querySelectorAll:()=>[]};
 return {doc,writes,nodes};
}

test('looks up every permanent HUD node once and writes a value only when it changes',()=>{
 const p=page(),h=createHud({doc:p.doc,heroNames:{}});
 for(const id of HUD_IDS)assert.ok(h.els[id],id);for(const key of ['loadout','rescues','root'])assert.ok(h.els[key],key);
 h.text(h.els.timer,'0:01');h.text(h.els.timer,'0:01');h.cls(h.els.game,'hint-done',1);h.cls(h.els.game,'hint-done',true);h.attr(h.els.hearts,'role','img');h.attr(h.els.hearts,'role','img');
 assert.deepEqual(p.writes,[['#timer','text','0:01'],['#game','class','hint-done',true],['#hearts','attr','role','img']]);
 h.text(h.els.timer,'0:02');assert.deepEqual(p.writes.at(-1),['#timer','text','0:02']);
});

test('a notice is not replaced by a lower-priority one while it shows; it clears when its time is up',()=>{
 const p=page(),h=createHud({doc:p.doc,heroNames:{}}),notice=h.els.notice;
 h.showNotice('大首領來襲！','warn',3,3);h.showNotice('獲得技能','good',2,1);
 assert.equal(notice.textContent,'大首領來襲！');assert.equal(notice.className,'show warn');assert.equal(h.noticeTimer,3);
 h.tick(3);assert.equal(h.noticeTimer,0);assert.equal(notice.className,'');
 h.showNotice('獲得技能','good',2,1);assert.equal(notice.textContent,'獲得技能','shown once the banner expired');
 h.expireNotice();h.showNotice('x','good',1,0);assert.equal(notice.textContent,'x');
 h.resetFeedback();assert.equal(notice.textContent,'');assert.equal(h.noticeTimer,0);
});

test('hurt and rescue feedback last .5 s and .32 s; a dialog clears the hurt flash at once',()=>{
 const p=page(),h=createHud({doc:p.doc,heroNames:{}}),{vignette,rescues}=h.els;
 h.hurt();h.bump();h.tick(.1);assert.ok(vignette.classList.set.has('hurt'));assert.ok(rescues.classList.set.has('bump'));
 h.tick(.25);assert.ok(vignette.classList.set.has('hurt'));assert.ok(!rescues.classList.set.has('bump'));
 h.clearHurt();assert.ok(!vignette.classList.set.has('hurt'));
});
