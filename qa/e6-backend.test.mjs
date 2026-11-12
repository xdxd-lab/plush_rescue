import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBackend} from './e6-backend.mjs';

test('missing or masked renderer never becomes hardware',()=>{
 for(const input of [
  {unmaskedAvailable:false,renderer:'WebKit WebGL'},
  {unmaskedAvailable:true,unmaskedVendor:'Google Inc.',unmaskedRenderer:'WebKit WebGL'},
  {unmaskedAvailable:true,unmaskedVendor:'Apple',unmaskedRenderer:'Generic Renderer'},
  {unmaskedAvailable:true,unmaskedVendor:'Apple',unmaskedRenderer:null,renderer:'Apple GPU'},
 ])assert.equal(classifyBackend(input),'unknown');
});
test('software and an actual unmasked ANGLE Metal hardware report stay distinct',()=>{
 assert.equal(classifyBackend({unmaskedAvailable:true,unmaskedVendor:'Google Inc.',unmaskedRenderer:'ANGLE (Google, Vulkan SwiftShader Device)'}),'software-or-emulated');
 assert.equal(classifyBackend({unmaskedAvailable:true,unmaskedVendor:'Apple',unmaskedRenderer:'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)'}),'hardware-reported');
});
