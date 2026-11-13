import test from 'node:test';
import assert from 'node:assert/strict';
import {validateV3Options,assertV3State,v3Sizes,v3ShotNames} from './v3-ui-contracts.mjs';
const options={enabled:true,shots:'artifacts',views:v3Sizes,noPickup:true,dialogs:false};
test('V3 requires its exact bounded scope and screenshot destination',()=>{
 assert.doesNotThrow(()=>validateV3Options(options));
 for(const delta of [{shots:''},{views:['1280x720']},{views:[...v3Sizes].reverse()},{noPickup:false},{dialogs:true},{selfTest:'timeout'}]){
  assert.throws(()=>validateV3Options({...options,...delta}));
 }
 assert.doesNotThrow(()=>validateV3Options({enabled:false}));
 assert.equal(new Set(v3ShotNames).size,6);
});
test('V3 checks persisted state, volume zero, UI text, aria and occlusion independently',()=>{
 for(const muted of [false,true]){
  const state={status:'paused',muted,volume:0,pressed:String(muted),text:muted?'已靜音':'未靜音',visible:true};
  assert.doesNotThrow(()=>assertV3State(state,muted));
  for(const delta of [{status:'running'},{muted:!muted},{volume:.25},{pressed:String(!muted)},{text:'wrong'},{visible:false}]){
   assert.throws(()=>assertV3State({...state,...delta},muted));
  }
 }
});
