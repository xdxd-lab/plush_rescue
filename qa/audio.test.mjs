// audio.js with a fake Web Audio context. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../audio.js';

function fakeAudio(log){
 return class{
  constructor(){log.push('new');this.currentTime=2;this.destination={};}
  resume(){log.push('resume');}
  createOscillator(){const o={type:'',frequency:{setValueAtTime:(v,t)=>log.push(['freq',v,t]),exponentialRampToValueAtTime:(v,t)=>log.push(['ramp',v,+t.toFixed(3)])},connect(){},start:()=>log.push('start'),stop:t=>log.push(['stop',+t.toFixed(3)])};log.push(o);return o;}
  createGain(){return {gain:{setValueAtTime:(v,t)=>log.push(['gain',+v.toFixed(4),t]),exponentialRampToValueAtTime(){}},connect(){}};}
 };
}

test('silent until unlocked; one context, resumed on every unlock',()=>{
 const log=[],a=createAudio({getContextClass:()=>fakeAudio(log),volume:()=>.5});
 a.play('rescue');assert.deepEqual(log,[]);assert.equal(a.unlocked,false);
 a.unlock();a.unlock();assert.deepEqual(log,['new','resume','resume']);assert.equal(a.unlocked,true);
});

test('each kind keeps its tone, pitch sweep and level; volume 0 plays nothing',()=>{
 let volume=.5;const log=[],a=createAudio({getContextClass:()=>fakeAudio(log),volume:()=>volume});a.unlock();log.length=0;
 a.play('rescue');assert.deepEqual(log.slice(1),[['freq',740,2],['ramp',1100,2.08],['gain',.06,2],'start',['stop',2.11]]);assert.equal(log[0].type,'sine');
 log.length=0;a.play('hurt');assert.equal(log[0].type,'triangle');assert.deepEqual(log.slice(1,4),[['freq',120,2],['ramp',65,2.08],['gain',.06,2]]);
 log.length=0;a.play('shot');assert.deepEqual(log.slice(1,4),[['freq',420,2],['ramp',180,2.08],['gain',.0125,2]]);
 log.length=0;volume=0;a.play('rescue');assert.deepEqual(log,[]);
});

test('missing or failing Web Audio never throws',()=>{
 const none=createAudio({getContextClass:()=>undefined,volume:()=>1});
 assert.doesNotThrow(()=>{none.unlock();none.play('rescue');});assert.equal(none.unlocked,false);
 const broken=createAudio({getContextClass:()=>class{resume(){}createOscillator(){throw new Error('closed');}},volume:()=>1});
 broken.unlock();assert.doesNotThrow(()=>broken.play('hurt'));
});
