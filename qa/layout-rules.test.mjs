// V12 layout rules. Evaluates the stylesheet's media-query cascade for real
// viewport sizes and asserts layout *behaviour* (flow stacking, touch targets,
// minimum type size, drag pass-through, contrast), not copied pixel values.
// It is not a browser layout pass; screenshots remain a separate check.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

const VIEWPORTS=[
 {name:'small phone portrait',w:360,h:640,touch:true},
 {name:'phone portrait',w:390,h:844,touch:true},
 {name:'narrow phone',w:320,h:568,touch:true},
 {name:'phone landscape',w:844,h:390,touch:true},
 {name:'small phone landscape',w:568,h:320,touch:true},
 {name:'mid phone landscape',w:667,h:375,touch:true},
 {name:'tablet portrait',w:768,h:1024,touch:true},
 {name:'laptop',w:1280,h:720,touch:false},
 {name:'desktop',w:1440,h:900,touch:false},
];
function conditionMatches(condition,vp){
 const [key,raw='']=condition.split(':').map(x=>x.trim()),value=parseFloat(raw);
 switch(key){
  case 'max-width':return vp.w<=value;case 'min-width':return vp.w>=value;
  case 'max-height':return vp.h<=value;case 'min-height':return vp.h>=value;
  case 'orientation':return raw===(vp.w>vp.h?'landscape':'portrait');
  case 'hover':return raw===(vp.touch?'none':'hover');
  case 'pointer':return raw===(vp.touch?'coarse':'fine');
  case 'prefers-reduced-motion':return Boolean(vp.reduce)&&raw==='reduce';
  default:throw new Error('Unrecognized media condition: '+condition);
 }
}
function mediaMatches(prelude,vp){
 const query=prelude.replace(/^@media/,'');
 return query.split(',').some(part=>[...part.matchAll(/\(([^)]+)\)/g)].every(([,c])=>conditionMatches(c,vp)));
}
// Collect [selector, declarations] for every rule active at this viewport, in order.
function activeRules(vp){
 const rules=[];
 (function walk(source,active){let i=0;while(i<source.length){const start=source.indexOf('{',i);if(start<0)break;let depth=1,end=start+1;while(depth&&end<source.length){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;end++;}
  const prelude=source.slice(i,start).trim(),body=source.slice(start+1,end-1);i=end;
  if(prelude.startsWith('@media'))walk(body,active&&mediaMatches(prelude,vp));
  else if(prelude.startsWith('@keyframes'))continue;
  else if(active){const decl={};for(const pair of body.split(';')){const k=pair.indexOf(':');if(k>0)decl[pair.slice(0,k).trim()]=pair.slice(k+1).trim().replace(/!important$/,'').trim();}rules.push({selectors:prelude.split(',').map(s=>s.trim()),decl});}
 }})(css,true);
 return rules;
}
function declarationsAt(selector,vp){const out={};for(const r of activeRules(vp))if(r.selectors.includes(selector))Object.assign(out,r.decl);return out;}
function rootVars(vp){const vars={};for(const r of activeRules(vp))if(r.selectors.includes(':root'))for(const [k,v] of Object.entries(r.decl))if(k.startsWith('--'))vars[k]=v;return vars;}
const px=(value,vars={})=>{if(value===undefined)return undefined;const v=value.replace(/var\((--[\w-]+)\)/g,(_,n)=>vars[n]??'');const m=/^(-?[\d.]+)px$/.exec(v.trim());return m?Number(m[1]):undefined;};

test('HUD stacks are flow layouts: no element is placed by a hard-coded offset from another row',()=>{
 for(const vp of VIEWPORTS){
  const top=declarationsAt('#topbar',vp),foot=declarationsAt('footer',vp);
  assert.equal(top.display,'flex',vp.name);assert.equal(top['flex-direction'],'column',vp.name);
  assert.equal(foot.display,'grid',vp.name);
  for(const sel of ['#hud','.timer','#bossPanel','#mapBadge','#moveHint','.experience','#twoHandedBar','.equipment','#stats']){
   const d=declarationsAt(sel,vp);
   assert.ok(!('top' in d)&&!('bottom' in d),`${vp.name}: ${sel} must sit in flow, found top/bottom`);
  }
 }
});

test('fullscreen drag (V8): readouts pass pointer input through; only real buttons opt in',()=>{
 for(const vp of VIEWPORTS){
  for(const sel of ['#topbar','footer','#notice','#stick','#vignette','#moveHint'])assert.equal(declarationsAt(sel,vp)['pointer-events'],'none',`${vp.name}: ${sel}`);
  for(const sel of ['#pause','#stowTwoHanded'])assert.equal(declarationsAt(sel,vp)['pointer-events'],'auto',`${vp.name}: ${sel}`);
 }
 // No other HUD selector re-enables pointer input.
 for(const vp of VIEWPORTS)for(const r of activeRules(vp))if(r.decl['pointer-events']==='auto')for(const s of r.selectors)assert.ok(['#pause','#stowTwoHanded'].includes(s),`${vp.name}: unexpected pointer-events:auto on ${s}`);
});

test('touch targets stay at least 44px (36px buttons carry a 4px hit-area extension)',()=>{
 for(const vp of VIEWPORTS){
  const vars=rootVars(vp),pause=declarationsAt('#pause',vp);
  assert.ok(px(pause.width,vars)>=44&&px(pause.height,vars)>=44,`${vp.name}: pause ${pause.width}×${pause.height}`);
  const stow=declarationsAt('#stowTwoHanded',vp),after=declarationsAt('#stowTwoHanded::after',vp);
  const extension=after.inset?-px(after.inset)*2:0;
  assert.ok(px(stow['min-height'])+extension>=44,`${vp.name}: two-handed toggle ${stow['min-height']} + ${extension}`);
  for(const sel of ['.primary','.text-button','.setting'])assert.ok(px(declarationsAt(sel,vp)['min-height'])>=44,`${vp.name}: ${sel}`);
 }
});

test('no active rule sets text smaller than 11px at any viewport',()=>{
 for(const vp of VIEWPORTS)for(const r of activeRules(vp)){
  const size=px(r.decl['font-size']);if(size!==undefined)assert.ok(size>=11,`${vp.name}: ${r.selectors.join(',')} font-size ${size}px`);
  const font=/(\d+(?:\.\d+)?)px/.exec(r.decl.font||'');if(font)assert.ok(Number(font[1])>=11,`${vp.name}: ${r.selectors.join(',')} font ${font[1]}px`);
 }
});

test('portrait phones give the two-handed bar its own row; landscape keeps it beside the loadout',()=>{
 const rows=vp=>[...(declarationsAt('footer',vp)['grid-template-areas']||'').matchAll(/"([^"]+)"/g)].map(m=>m[1].trim().split(/\s+/));
 for(const vp of VIEWPORTS.filter(v=>v.w<=600&&v.h>v.w)){const r=rows(vp);assert.ok(r.some(row=>row.length===1&&row[0]==='two'),vp.name);assert.ok(r.some(row=>row[0]==='equip'),vp.name);}
 for(const vp of VIEWPORTS.filter(v=>v.h<=500&&v.w>v.h)){const r=rows(vp);assert.ok(r.some(row=>row.includes('equip')&&row.includes('two')),vp.name);}
 for(const vp of VIEWPORTS)assert.deepEqual(rows(vp).at(-1),rows(vp).at(-1).map(()=>'stats'),`${vp.name}: diagnostics stay the final footer row (V10)`);
});

test('narrow portrait HUD moves the timer to its own row instead of squeezing three columns',()=>{
 for(const vp of VIEWPORTS){
  const areas=declarationsAt('#hud',vp)['grid-template-areas'];
  if(vp.w<=600&&vp.h>vp.w)assert.match(areas,/"timer timer"/,vp.name);
  else assert.match(areas,/"hero timer right"/,vp.name);
 }
});

test('two-column start/pause dialogs only apply to wide landscape, never to short portrait windows',()=>{
 for(const vp of [...VIEWPORTS,{name:'short portrait',w:360,h:480,touch:true},{name:'tiny portrait',w:320,h:480,touch:true}]){
  const ready=declarationsAt('.dialog[data-state="ready"]',vp);
  const wideLandscape=vp.h<=500&&vp.w>vp.h&&vp.w>=560;
  assert.equal(ready.display==='grid',wideLandscape,vp.name);
 }
});

test('V10 diagnostics rule is preserved: the footer reserves the stats row only when shown',()=>{
 assert.match(css,/footer:has\(> #stats:not\(\[hidden\]\)\)\{bottom:/);
 for(const vp of VIEWPORTS){const s=declarationsAt('#stats',vp);assert.equal(s.position,'relative');assert.equal(s['grid-area'],'stats');assert.equal(s['white-space'],'normal');}
});

test('reduced motion disables animations and transitions',()=>{
 const vp={w:390,h:844,touch:true,reduce:true},all=declarationsAt('*',vp);
 assert.match(all['animation-iteration-count']||'',/1/);assert.match(all['transition-duration']||'',/\.001ms/);
});

test('core colour pairs meet WCAG AA contrast',()=>{
 const vars=rootVars({w:1440,h:900,touch:false});
 const hex=v=>{v=v.trim();if(v.startsWith('#')){const s=v.length===4?v.slice(1).split('').map(c=>c+c).join(''):v.slice(1,7);return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16));}const m=/rgba?\(([^)]+)\)/.exec(v);return m[1].split(',').slice(0,3).map(Number);};
 const alpha=v=>{const m=/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(v);return m?Number(m[1]):1;};
 const over=(fg,bg)=>{const a=alpha(fg),f=hex(fg),b=hex(bg);return f.map((c,i)=>c*a+b[i]*(1-a));};
 const lum=rgb=>{const [r,g,b]=rgb.map(c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
 const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
 const pairs=[['--d-text','--d-bg'],['--d-dim','--d-bg'],['--d-dim','--d-bg2'],['--d-secondary-text','--d-secondary']];
 for(const [f,b] of pairs)assert.ok(ratio(hex(vars[f]),hex(vars[b]))>=4.5,`${f} on ${b}`);
 assert.ok(ratio([255,255,255],hex(vars['--d-primary']))>=4.5,'white on primary button');
 // HUD panels are translucent: check over the brightest scene background in use.
 for(const scene of ['#e8ead8','#bdc2b1','#17273f']){const panel=over(vars['--panel'],scene);for(const f of ['--text','--text-dim'])assert.ok(ratio(hex(vars[f]),panel)>=4.5,`${f} on panel over ${scene}`);}
});

test('viewport allows user zoom; legacy ids and icon symbols are present',()=>{
 const meta=/<meta name="viewport" content="([^"]+)"/.exec(html)[1];
 assert.doesNotMatch(meta,/user-scalable=no|maximum-scale/);assert.match(meta,/viewport-fit=cover/);
 for(const id of ['world','vignette','hud','heroPortrait','hearts','healthFill','timer','saved','pause','mapBadge','mapName','notice','bossPanel','bossName','bossHp','bossFill','stick','knob','moveHint','level','xpFill','xpLabel','twoHandedBar','twoHandedSlotLabel','twoHandedName','stowTwoHanded','mainWeapon','mainWeaponIcon','mainSlotLabel','mainWeaponName','offhandWeapon','offhandWeaponIcon','offhandSlotLabel','offhandWeaponName','magicMeter','magicLabel','magicFill','stats','overlay','dialog','dialogTitle','heroSelect','start'])assert.match(html,new RegExp(`id="${id}"`),id);
 assert.match(html,/<select id="heroSelect"[^>]*><option value="pudding">[^<]+<\/option><option value="polar">/);
});

test('touch gestures: the game surface takes no browser pan/zoom, dialogs may scroll vertically',()=>{
 for(const vp of VIEWPORTS){
  assert.equal(declarationsAt('#game',vp)['touch-action'],'none',`${vp.name}: #game`);
  assert.equal(declarationsAt('.dialog',vp)['touch-action'],'pan-y',`${vp.name}: .dialog`);
 }
});
