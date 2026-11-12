import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {showWebGLStartError} from '../webgl-recovery.js';

test('failed first renderer shows a branded, keyboard-ready reload without error details',()=>{
 let reloads=0,focused=null,hidden='true',shown=false;
 const retry={focus(options){focused=options},onclick:null};
 const dialog={dataset:{},innerHTML:'',querySelector(s){assert.equal(s,'#retryWebGL');return retry}};
 const overlay={classList:{add(s){assert.equal(s,'shown');shown=true}},setAttribute(k,v){assert.equal(k,'aria-hidden');hidden=v}};
 showWebGLStartError({dialog,overlay,location:{reload(){reloads++}}});
 assert.equal(dialog.dataset.state,'webgl-error');
 assert.match(dialog.innerHTML,/brand-mark\.png/);
 assert.match(dialog.innerHTML,/id="dialogTitle"/);
 assert.match(dialog.innerHTML,/id="retryWebGL" class="primary"/);
 assert.match(dialog.innerHTML,/不會清除已儲存的設定與紀錄/);
 assert.match(dialog.innerHTML,/仍可能需要調整瀏覽器/);
 assert.equal(shown,true);assert.equal(hidden,'false');
 assert.deepEqual(focused,{preventScroll:true});
 assert.doesNotMatch(dialog.innerHTML,/\/Users\/|[A-Z]:\\/);
 assert.equal(reloads,0);retry.onclick();assert.equal(reloads,1);
});

test('renderer construction failure stops boot before RAF or game listeners',()=>{
 const main=fs.readFileSync(new URL('../main.js',import.meta.url),'utf8');
 const prefix=main.replace(/^import .*;\n/gm,'').split('// three.js reads every shader')[0];
 const error=new Error('private /Users/example/driver path');let raf=0,buttons=0;
 const retry={focus(){},onclick:null};
 const dialog={dataset:{},innerHTML:'',querySelector(){return retry}};
 const overlay={classList:{add(){}},setAttribute(){}};
 const canvas={addEventListener(){buttons++}};
 const document={querySelector(s){return {'#world':canvas,'#overlay':overlay,'#dialog':dialog}[s]}};
 const context=vm.createContext({THREE:{WebGLRenderer:class{constructor(){throw error}}},document,location:{reload(){}},showWebGLStartError,requestAnimationFrame(){raf++}});
 assert.throws(()=>vm.runInContext(prefix,context),e=>e===error);
 assert.equal(dialog.dataset.state,'webgl-error');
 assert.doesNotMatch(dialog.innerHTML,/private|\/Users\/example/);
 assert.equal(raf,0);assert.equal(buttons,0);
});
