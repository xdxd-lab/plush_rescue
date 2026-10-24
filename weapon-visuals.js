import {WEAPONS} from './weapons.js';

// All new art lives here: the handmade V3 character and its muzzle remain intact.
// A manager owns bounded pools, shared geometry and immutable material palettes.
const MAX_DROPS = 16, MAX_BOMBS = 12, MAX_EFFECTS = 24, MAX_BURNING = 12;
const SKILLS = {
  power: {name:'暖心光束', icon:'✦', color:'#ffc967'},
  rate: {name:'星光連發', icon:'ϟ', color:'#fff19a'},
  speed: {name:'輕盈腳步', icon:'➜', color:'#a9f0c2'},
  heart: {name:'柔軟守護', icon:'♡', color:'#ff9abd'},
};
const FALLBACK = {name:'救援光束', icon:'✦', color:'#73e4f5', slot:'main'};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
// V12.1.1: the one source of truth for a drop's on-screen stack. Rendering below
// uses these values, and ui.js builds the tap hit area from the same numbers.
// float* bounds are measured from every catalog model (qa/pickup-tap.test.mjs
// re-measures them), relative to the bobbing float origin.
export const DROP_GEOMETRY = Object.freeze({
  ringY: .09, ringScale: .54, ringRadius: .58,
  floatY: .70, floatBob: .09, floatBottom: -.37, floatTop: .75, floatRadius: .66,
  labelY: 1.48, labelWidth: 2.5, labelHeight: .73, labelDistance: 8.5,
});

export function createWeaponVisuals(THREE, scene) {
  const root = new THREE.Group();
  root.name = 'V4 weapon pickups, bomb warnings and magic';
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geometry = value => (geometries.add(value), value);
  const material = value => (materials.add(value), value);
  const g = {
    ball: geometry(new THREE.SphereGeometry(1, 12, 8)),
    crystal: geometry(new THREE.OctahedronGeometry(1)),
    pellet: geometry(new THREE.IcosahedronGeometry(1, 0)),
    box: geometry(new THREE.BoxGeometry(1, 1, 1)),
    tube: geometry(new THREE.CylinderGeometry(1, 1, 1, 12)),
    cone: geometry(new THREE.ConeGeometry(1, 1, 12)),
    ring: geometry(new THREE.TorusGeometry(1, .045, 5, 40)),
    diamondRing: geometry(new THREE.TorusGeometry(1, .06, 5, 4)),
    disc: geometry(new THREE.CircleGeometry(1, 40)),
    plane: geometry(new THREE.PlaneGeometry(2, 2)),
  };
  const projectileCone = geometry(g.cone.clone());
  projectileCone.rotateX(Math.PI / 2);

  function shapeGeometry(points) {
    const shape = new THREE.Shape();
    points.forEach(([x,y], i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
    shape.closePath();
    return geometry(new THREE.ShapeGeometry(shape));
  }
  const starPoints = [];
  for (let i=0; i<10; i++) {
    const angle = i*Math.PI/5 + Math.PI/2, r = i%2 ? .43 : 1;
    starPoints.push([Math.cos(angle)*r, Math.sin(angle)*r]);
  }
  g.star = shapeGeometry(starPoints);
  g.bolt = shapeGeometry([[-.05,1],[-.65,-.12],[-.1,-.12],[-.35,-1],[.7,.27],[.1,.27]]);
  g.arrow = shapeGeometry([[-1,-.2],[.25,-.2],[.25,-.65],[1,0],[.25,.65],[.25,.2],[-1,.2]]);
  const heart = new THREE.Shape();
  heart.moveTo(0,-.9); heart.bezierCurveTo(-1.5,.1,-.8,1.25,0,.55);
  heart.bezierCurveTo(.8,1.25,1.5,.1,0,-.9);
  g.heart = geometry(new THREE.ShapeGeometry(heart));
  const fanPoints = [[0,-.05]];
  for (let i=0; i<=16; i++) {
    const a = -1.1+i/16*2.2;
    fanPoints.push([Math.sin(a), Math.cos(a)]);
  }
  g.fan = shapeGeometry(fanPoints);

  // The same indexed fan covers every angle and radius. Uniforms, not new
  // geometry, make a normal fan, evolved fan, full explosion or tiny ember.
  const fanPositions = [], fanAngles = [], fanRadii = [], fanIndices = [];
  for (let i=0; i<=64; i++) {
    for (const radius of [0, 1]) {
      fanPositions.push(0, 0, 0); fanAngles.push(-1+i/32); fanRadii.push(radius);
    }
    if (i<64) { const p=i*2; fanIndices.push(p,p+1,p+3,p,p+3,p+2); }
  }
  g.effect = geometry(new THREE.BufferGeometry());
  g.effect.setAttribute('position', new THREE.Float32BufferAttribute(fanPositions,3));
  g.effect.setAttribute('fanAngle', new THREE.Float32BufferAttribute(fanAngles,1));
  g.effect.setAttribute('fanRadius', new THREE.Float32BufferAttribute(fanRadii,1));
  g.effect.setIndex(fanIndices);
  // Shader vertices have a different bound from their zeroed position attribute.
  g.effect.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);

  const palette = new Map();
  function colors(id) {
    const key = WEAPONS[id] ? id : 'pulse';
    if (palette.has(key)) return palette.get(key);
    const color = new THREE.Color((WEAPONS[key] || FALLBACK).color);
    const result = {
      shell: material(new THREE.MeshStandardMaterial({color, roughness:.56, metalness:0})),
      light: material(new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide})),
      glow: material(new THREE.MeshBasicMaterial({color, transparent:true, opacity:.29, depthWrite:false, blending:THREE.AdditiveBlending})),
      color,
    };
    palette.set(key,result);
    return result;
  }
  const cream = material(new THREE.MeshStandardMaterial({color:'#fff1d7', roughness:.75}));
  const dark = material(new THREE.MeshStandardMaterial({color:'#25344c', roughness:.72}));
  const white = material(new THREE.MeshBasicMaterial({color:'#fffbdc',side:THREE.DoubleSide}));
  const gold = material(new THREE.MeshBasicMaterial({color:'#ffe6a4',side:THREE.DoubleSide}));
  const skillMaterials = new Map(Object.entries(SKILLS).map(([id,skill]) => [id, material(new THREE.MeshBasicMaterial({color:skill.color, side:THREE.DoubleSide}))]));
  const labelMaterials = new Map();
  let now = 0, currentHero = null, originalGun = null, originalGunVisible = true;
  let heldMain = null, heldOffhand = null, mainId = '', offhandId = '', evolved = false;
  const heldModels = new Map(), charmModels = new Map(), carriedModels = new Map();
  const carried = new THREE.Group(); carried.name='Retained main weapon and offhand on backpack';
  let carriedKey='';
  const dropPool = [], bombPool = [], effectPool = [];
  const drops = new Map(), bombs = new Map();
  const bulletStyles = new WeakMap();
  let effectCursor = 0;

  function part(parent, name, geom, mat, position, scale) {
    const mesh = new THREE.Mesh(geom,mat);
    mesh.name = name; mesh.position.set(...position); mesh.scale.set(...scale);
    parent.add(mesh); return mesh;
  }
  function barrel(parent, mat, x, y, z, radius, length) {
    const mesh = part(parent,'Soft toy barrel',g.tube,mat,[x,y,z],[radius,length,radius]);
    mesh.rotation.x = Math.PI/2;
    return mesh;
  }
  function gunModel(id) {
    const group = new THREE.Group(), p = colors(id);
    group.name = `${(WEAPONS[id] || FALLBACK).name} · held toy`;
    part(group,'Cream toy casing',g.box,cream,[0,.01,.095],[.29,.20,.29]);
    part(group,'Colored rescue receiver',g.box,p.shell,[0,-.012,.13],[.31,.14,.32]);
    part(group,'Soft handle',g.box,dark,[0,-.135,.005],[.11,.18,.12]).rotation.x = -.18;
    if (id === 'cannon') {
      // A broad mint-green coil cannon fills both paws; its muzzle stays on
      // the original firing axis instead of changing the V3 character rig.
      part(group,'Two-paw cannon housing',g.box,dark,[0,.015,.12],[.41,.29,.31]);
      barrel(group,p.shell,0,.035,.25,.19,.34);
      for(const z of [.14,.25,.36]) barrel(group,cream,0,.035,z,.206,.033);
      barrel(group,dark,0,.035,.426,.174,.075);
      barrel(group,p.light,0,.035,.469,.129,.013);
      part(group,'Green plasma muzzle',g.ball,p.light,[0,.035,.474],[.086,.086,.025]);
      for(const side of [-1,1]) {
        part(group,'Cannon shoulder fin',g.box,p.shell,[side*.225,.09,.04],[.06,.25,.21]).rotation.z=-side*.23;
        part(group,'Cannon charge cell',g.ball,p.light,[side*.207,-.044,.17],[.05,.07,.13]);
      }
      part(group,'Cannon top star',g.star,gold,[0,.212,.11],[.08,.08,.022]);
    } else if (id === 'shotgun') {
      for (const x of [-.095,.095]) {
        barrel(group,dark,x,.012,.30,.075,.28);
        barrel(group,cream,x,.012,.403,.085,.078);
        barrel(group,p.light,x,.012,.449,.054,.013);
      }
      part(group,'Double barrel top bridge',g.box,p.shell,[0,.105,.285],[.28,.064,.24]);
    } else if (id === 'burst') {
      barrel(group,p.shell,0,.006,.28,.133,.23);
      for (let i=0; i<3; i++) {
        const a=i/3*Math.PI*2;
        barrel(group,dark,Math.sin(a)*.068,.006+Math.cos(a)*.068,.39,.042,.12);
        barrel(group,p.light,Math.sin(a)*.068,.006+Math.cos(a)*.068,.457,.026,.012);
      }
      part(group,'Triple pulse star sight',g.star,gold,[0,.15,.12],[.07,.07,.025]);
    } else if (id === 'ember') {
      barrel(group,dark,0,.012,.29,.105,.27);
      barrel(group,p.shell,0,.012,.40,.13,.075);
      barrel(group,p.light,0,.012,.448,.07,.02);
      for (const s of [-1,1]) {
        const fin = part(group,'Ember flame fin',g.cone,p.shell,[s*.16,.10,.15],[.055,.20,.05]);
        fin.rotation.z = -s*.35;
      }
      part(group,'Warm energy bottle',g.ball,p.light,[0,.11,-.015],[.10,.12,.10]);
    } else if (id === 'bomber') {
      barrel(group,dark,0,.005,.28,.152,.27);
      barrel(group,p.shell,0,.005,.40,.168,.075);
      barrel(group,cream,0,.005,.449,.13,.026);
      barrel(group,p.light,0,.005,.466,.078,.009);
      part(group,'Round toy bomb magazine',g.ball,p.shell,[0,-.115,.12],[.16,.13,.15]);
      part(group,'Safety star badge',g.star,gold,[.169,.025,.10],[.058,.058,.023]).rotation.y=Math.PI/2;
    } else {
      barrel(group,dark,0,.01,.30,.083,.25);
      barrel(group,cream,0,.01,.41,.10,.07);
      barrel(group,p.light,0,.01,.453,.065,.014);
    }
    return group;
  }
  function charmModel(id) {
    const group = new THREE.Group(), p=colors(id);
    group.name = `${(WEAPONS[id] || FALLBACK).name} · offhand charm`;
    part(group,'Cream wand handle',g.tube,cream,[0,0,0],[.031,.35,.031]);
    part(group,'Gold handle button',g.ball,gold,[0,-.18,0],[.044,.044,.044]);
    if (id==='frostwand') {
      part(group,'Ice wand diamond',g.crystal,p.light,[0,.28,0],[.135,.23,.10]);
      for (const s of [-1,1]) {
        part(group,'Side ice crystal',g.crystal,cream,[s*.10,.20,0],[.055,.12,.05]).rotation.z=-s*.45;
      }
    } else {
      part(group,'Moonlight folded fan',g.fan,p.light,[0,.10,.025],[.265,.29,.025]);
      for (let i=0; i<5; i++) {
        const a=-1+i*.5;
        part(group,'Gold fan rib',g.box,cream,[Math.sin(a)*.125,.10+Math.cos(a)*.125,.038],[.013,.26,.013]).rotation.z=-a;
      }
      part(group,'Moon fan star',g.star,white,[0,.33,.049],[.063,.063,.015]);
    }
    const halo = part(group,'Evolved offhand halo',g.ring,gold,[0,.26,0],[.31,.31,.31]);
    halo.visible=false; group.userData.halo=halo;
    return group;
  }

  // A small, fixed label atlas is cached by catalog key. No canvas is redrawn
  // during a frame; tests without a DOM simply retain the descriptive names.
  function labelMaterial(key, title, subtitle, color='#a7e5ed') {
    if (labelMaterials.has(key)) return labelMaterials.get(key);
    let map = null;
    if (typeof document!=='undefined' && document.createElement) {
      try {
        const canvas=document.createElement('canvas'); canvas.width=384; canvas.height=112;
        const ctx=canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle='rgba(24,34,46,.88)'; ctx.fillRect(3,3,378,106);
          ctx.strokeStyle=new THREE.Color(color).getStyle(); ctx.lineWidth=4; ctx.strokeRect(3,3,378,106);
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillStyle='#fff7df'; ctx.font='bold 31px sans-serif';
          ctx.fillText(title,192,39,356);
          ctx.fillStyle=new THREE.Color(color).getStyle(); ctx.font='bold 21px sans-serif';
          ctx.fillText(subtitle,192,80,356);
          map=new THREE.CanvasTexture(canvas); map.colorSpace=THREE.SRGBColorSpace; textures.add(map);
        }
      } catch { /* Headless rendering and missing 2D canvas are supported. */ }
    }
    const result=material(new THREE.SpriteMaterial({map,color:map?0xffffff:color,transparent:true,depthWrite:false,opacity:map?1:.85}));
    labelMaterials.set(key,result); return result;
  }
  for (const [id,w] of Object.entries(WEAPONS)) labelMaterial(`weapon:${id}`,`${w.icon || '✦'} ${w.name}`,w.slot==='offhand'?'副手魔法 · 靠近拾取':w.slot==='twohand'?'雙手魔能砲 · 靠近拾取':'主武器 · 靠近拾取',w.color);
  for (const [id,s] of Object.entries(SKILLS)) labelMaterial(`skill:${id}`,`${s.icon} ${s.name}`,'技能強化 · 靠近拾取',s.color);
  labelMaterial('skill:unknown','✦ 技能強化','靠近拾取','#f9d593');
  for(let digit=0;digit<=9;digit++) labelMaterial(`timer:${digit}`,String(digit),'即將綻放','#ffc47a');

  function attachRoot() { if (!root.parent) scene.add(root); }
  function detachHero() {
    heldMain?.removeFromParent(); heldOffhand?.removeFromParent(); carried.removeFromParent();
    if (originalGun) originalGun.visible=originalGunVisible;
    currentHero=originalGun=heldMain=heldOffhand=null; mainId=offhandId='';
  }
  function syncHero(game, hero) {
    if (!hero) return;
    if (currentHero!==hero) {
      detachHero(); currentHero=hero;
      originalGun=hero.getObjectByName('Chunky cyan toy rescue blaster') || null;
      originalGunVisible=originalGun?.visible ?? true;
    }
    const twoHanded=game.twoHanded==='cannon';
    const retainedMain=WEAPONS[game.loadout?.main] ? game.loadout.main : 'pulse';
    const nextMain=twoHanded?'cannon':retainedMain;
    const nextOffhand=WEAPONS[game.loadout?.offhand] ? game.loadout.offhand : 'moonfan';
    const rig=originalGun?.parent || hero.children[0] || hero;
    if (mainId!==nextMain) {
      heldMain?.removeFromParent(); heldMain=null; mainId=nextMain;
      if (originalGun) originalGun.visible=nextMain==='pulse' && originalGunVisible;
      if (nextMain!=='pulse' || !originalGun) {
        if (!heldModels.has(nextMain)) heldModels.set(nextMain,gunModel(nextMain));
        heldMain=heldModels.get(nextMain);
        heldMain.position.set(.205,.492,.350); heldMain.scale.setScalar(1.24); rig.add(heldMain);
      }
    }
    if (offhandId!==nextOffhand) {
      heldOffhand?.removeFromParent(); offhandId=nextOffhand;
      if (!charmModels.has(nextOffhand)) charmModels.set(nextOffhand,charmModel(nextOffhand));
      heldOffhand=charmModels.get(nextOffhand);
      heldOffhand.position.set(-.48,.42,.25); heldOffhand.rotation.set(-.08,-.14,.25); rig.add(heldOffhand);
    }
    heldOffhand.visible=!twoHanded;
    if(twoHanded) {
      const key=`${retainedMain}/${nextOffhand}`;
      if(carriedKey!==key) {
        carried.clear();carriedKey=key;
        const entries=[['main',retainedMain],['offhand',nextOffhand]];
        for(const [slot,id] of entries) {
          const modelKey=`${slot}:${id}`;
          if(!carriedModels.has(modelKey)) carriedModels.set(modelKey,slot==='offhand'?charmModel(id):gunModel(id));
          const model=carriedModels.get(modelKey);model.name=`Retained ${slot} · ${(WEAPONS[id]||FALLBACK).name}`;
          if(slot==='main') {model.position.set(-.35,.02,0);model.rotation.set(-1.02,0,-.35);model.scale.setScalar(.93);}
          else {model.position.set(.40,.12,0);model.rotation.set(.15,.10,-.40);model.scale.setScalar(.97);}
          carried.add(model);
        }
      }
      carried.position.set(0,.50,-.40);rig.add(carried);
    } else carried.removeFromParent();
    evolved=!!game.magic?.evolved;
    if (heldOffhand) {
      heldOffhand.userData.halo.visible=evolved;
      heldOffhand.scale.setScalar(evolved?1.16:1);
    }
    hero.userData.weaponVisualLoadout={main:retainedMain,offhand:nextOffhand,twoHanded:twoHanded?'cannon':null,evolved};
  }

  function makeDrop() {
    const group=new THREE.Group(), float=new THREE.Group();
    group.name='Hovering weapon or skill pickup'; group.add(float);
    const D=DROP_GEOMETRY, ring=part(group,'Pickup ground marker',g.ring,white,[0,D.ringY,0],[D.ringScale,D.ringScale,D.ringScale]);
    ring.rotation.x=-Math.PI/2;
    const beacon=part(float,'Pickup glowing center',g.crystal,white,[0,0,0],[.24,.31,.24]);
    const glyph=part(float,'Skill symbol',g.star,white,[0,.05,.29],[.21,.21,.025]);
    const label=new THREE.Sprite(labelMaterials.get('skill:unknown'));
    label.name='Pickup label'; label.position.y=D.labelY; label.scale.set(D.labelWidth,D.labelHeight,1); group.add(label);
    group.visible=false;
    return {group,float,ring,beacon,glyph,label,model:null,kind:'',key:'',id:null,phase:dropPool.length*.77};
  }
  function dropSpec(drop) {
    if (drop.kind==='weapon' && WEAPONS[drop.weaponId]) {
      const w=WEAPONS[drop.weaponId];
      return {key:`weapon:${drop.weaponId}`,name:w.name,weaponId:drop.weaponId,slot:w.slot,color:w.color};
    }
    const id=SKILLS[drop.upgradeId] ? drop.upgradeId : 'unknown', skill=SKILLS[id];
    return {key:`skill:${id}`,name:skill?.name || '技能強化',upgradeId:id,color:skill?.color || '#f9d593'};
  }
  function configureDrop(view, drop) {
    const spec=dropSpec(drop);
    if (view.key===spec.key) return;
    view.key=spec.key; view.group.name=`${spec.name} · ${drop.kind==='weapon'?'weapon':'skill'} pickup`;
    view.group.userData={kind:drop.kind,weaponId:drop.weaponId,upgradeId:drop.upgradeId,label:spec.name};
    // Each pool slot keeps one model per catalog entry at most, avoiding
    // repeated allocations when a slot alternates between different drops.
    view.models ??= new Map();
    view.model?.removeFromParent(); view.model=null;
    const isWeapon=!!spec.weaponId;
    view.ring.geometry=isWeapon?g.ring:g.diamondRing;
    view.ring.material=isWeapon?colors(spec.weaponId).light:(skillMaterials.get(spec.upgradeId)||gold);
    view.beacon.visible=!isWeapon; view.glyph.visible=!isWeapon;
    if (isWeapon) {
      if (!view.models.has(spec.weaponId)) view.models.set(spec.weaponId,spec.slot==='offhand'?charmModel(spec.weaponId):gunModel(spec.weaponId));
      view.model=view.models.get(spec.weaponId); view.float.add(view.model);
      view.model.scale.setScalar(spec.slot==='offhand'?1.45:1.5); view.model.position.set(0,0,-.10);
    } else {
      view.beacon.material=skillMaterials.get(spec.upgradeId)||gold;
      view.glyph.material=white;
      view.glyph.geometry=g[{power:'star',rate:'bolt',speed:'arrow',heart:'heart'}[spec.upgradeId] || 'star'];
    }
    view.label.material=labelMaterials.get(spec.key)||labelMaterials.get('skill:unknown');
  }
  function syncDrops(game) {
    const entities=(game.drops || []).slice(0,MAX_DROPS), live=new Set(entities.map(drop=>drop.id));
    for (const [id,view] of drops) if (!live.has(id)) {
      view.group.removeFromParent(); view.group.visible=false; view.id=null; drops.delete(id);
    }
    for (const drop of entities) {
      let view=drops.get(drop.id);
      if (!view) {
        view=dropPool.find(item=>item.id===null);
        if (!view) { view=makeDrop(); dropPool.push(view); }
        view.id=drop.id; drops.set(drop.id,view); root.add(view.group); view.group.visible=true;
      }
      configureDrop(view,drop);
      view.group.position.set(drop.x,0,drop.z);
      view.group.visible=drop.life===undefined || drop.life>2 || Math.sin(now*13)>.0;
      const p=game.player || {x:0,z:0};
      view.label.visible=Math.hypot(drop.x-p.x,drop.z-p.z)<DROP_GEOMETRY.labelDistance;
    }
  }

  const timerVertex=`varying vec2 vUv;
    void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
  const timerFragment=`uniform float fraction;uniform float pulse;varying vec2 vUv;
    void main(){vec2 p=(vUv-.5)*2.0;float d=length(p);if(d>.99||d<.82)discard;
      float a=mod(atan(p.x,p.y)+6.2831853,6.2831853)/6.2831853;
      float bright=step(a,fraction);vec3 color=mix(vec3(.38,.12,.08),vec3(1.0,.68,.26),bright);
      gl_FragColor=vec4(color,(.18+.72*bright)*pulse);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  function makeBomb() {
    const group=new THREE.Group(); group.name='Toy bomb with countdown and safe-distance ring';
    const warning=part(group,'Explosion radius warning',g.ring,colors('bomber').light,[0,.075,0],[1,1,1]);
    warning.rotation.x=-Math.PI/2;
    const body=part(group,'Round planted toy bomb',g.ball,colors('bomber').shell,[0,.22,0],[.21,.21,.21]);
    part(group,'Cream toy bomb cap',g.tube,cream,[0,.445,0],[.062,.085,.062]);
    const fuse=part(group,'Glowing countdown fuse',g.star,gold,[.04,.53,.02],[.074,.074,.074]);
    const timerMat=material(new THREE.ShaderMaterial({uniforms:{fraction:{value:1},pulse:{value:1}},vertexShader:timerVertex,fragmentShader:timerFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    const timer=part(group,'Shrinking fuse timer',g.plane,timerMat,[0,.082,0],[.67,.67,.67]);
    timer.rotation.x=-Math.PI/2;
    const label=new THREE.Sprite(labelMaterials.get('timer:1')); label.position.y=.96; label.scale.set(.87,.42,1); group.add(label);
    return {group,warning,body,fuse,timer,label,id:null,maxLife:0};
  }
  function syncBombs(game) {
    const entities=(game.bombs || []).slice(0,MAX_BOMBS), live=new Set(entities.map(bomb=>bomb.id));
    for(const [id,view] of bombs) if(!live.has(id)) {view.group.removeFromParent();view.id=null;bombs.delete(id);}
    for(const bomb of entities) {
      let view=bombs.get(bomb.id);
      if(!view) {
        view=bombPool.find(item=>item.id===null);
        if(!view) {view=makeBomb();bombPool.push(view);}
        view.id=bomb.id;view.maxLife=Math.max(.01,bomb.totalLife || bomb.fuse || bomb.life || 1);
        bombs.set(bomb.id,view);root.add(view.group);
      }
      view.group.position.set(bomb.x,0,bomb.z);
      const radius=Math.max(.2,bomb.radius || 1.8); view.warning.scale.setScalar(radius);
      const fraction=clamp((bomb.life || 0)/view.maxLife,0,1);
      view.timer.material.uniforms.fraction.value=fraction;
      view.timer.material.uniforms.pulse.value=.72+Math.sin(now*(fraction<.3?25:10))*.28;
      const digit=clamp(Math.ceil(bomb.life || 0),0,9);
      view.label.material=labelMaterials.get(`timer:${digit}`);
      view.group.userData.remaining=bomb.life;view.group.userData.radius=radius;
    }
  }

  const effectVertex=`attribute float fanAngle;attribute float fanRadius;
    uniform float halfAngle;varying vec2 vFan;
    void main(){vFan=vec2(fanAngle,fanRadius);float a=fanAngle*halfAngle;
      vec3 p=vec3(sin(a)*fanRadius,0.0,cos(a)*fanRadius);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`;
  const effectFragment=`uniform vec3 tint;uniform float opacity;uniform float progress;
    uniform float evolved;uniform float kind;varying vec2 vFan;
    void main(){float r=vFan.y;float a=abs(vFan.x);
      float edge=smoothstep(.88,.97,r)*(1.0-smoothstep(.985,1.0,r));
      float side=smoothstep(.97,.995,a)*(1.0-smoothstep(.995,1.0,a));
      float wave=pow(max(0.0,1.0-abs(r-progress)*7.0),2.0);
      float rays=pow(max(0.0,cos(vFan.x*31.415926)),18.0)*r;
      float energy=(.11+.16*(1.0-r)+edge*.58+wave*.3+side*.32+rays*.14);
      if(kind>0.5)energy=edge*.8+wave*.42+(1.0-r)*.08;
      vec3 color=mix(tint,vec3(1.0,.98,.84),clamp(edge*.5+evolved*.42,0.0,.85));
      float fade=(1.0-smoothstep(.94,1.0,r));
      gl_FragColor=vec4(color,energy*opacity*(1.0+evolved*.5)*fade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  function makeEffect() {
    const group=new THREE.Group();group.name='Pooled rescue magic effect';
    const mat=material(new THREE.ShaderMaterial({
      uniforms:{tint:{value:new THREE.Color()},opacity:{value:0},progress:{value:0},halfAngle:{value:1},evolved:{value:0},kind:{value:0}},
      vertexShader:effectVertex,fragmentShader:effectFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    }));
    const fan=part(group,'Fan-shaped magic sweep',g.effect,mat,[0,.09,0],[1,1,1]);fan.frustumCulled=false;fan.renderOrder=3;
    const flashMat=material(new THREE.MeshBasicMaterial({color:'#ffe5a5',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
    const flash=part(group,'Soft rescue flash',g.ball,flashMat,[0,.25,0],[.3,.3,.3]);
    return {group,fan,flash,life:0,maxLife:1,radius:1,kind:'magic'};
  }
  function spawnEffect(event) {
    let effect=effectPool.find(item=>item.life<=0);
    if(!effect && effectPool.length<MAX_EFFECTS) {effect=makeEffect();effectPool.push(effect);}
    if(!effect) {effect=effectPool[effectCursor%MAX_EFFECTS];effectCursor++;}
    const isMagic=event.kind==='magic', isBurn=event.kind==='burn', upgrade=isMagic && !!event.evolved;
    effect.kind=event.kind;effect.maxLife=isMagic?(upgrade?.83:.60):isBurn?.38:.58;effect.life=effect.maxLife;
    effect.radius=Math.max(.2,event.radius || (isMagic?(upgrade?8:5.6):isBurn?.52:2));
    effect.group.position.set(event.x || 0,0,event.z || 0);effect.group.rotation.y=isMagic?(event.angle || 0):0;
    effect.group.name=upgrade?'Evolved radiant magic fan':isMagic?'Moonlight magic fan':isBurn?'Warm lingering ember':'Toy bomb rescue bloom';
    const uniforms=effect.fan.material.uniforms;
    uniforms.tint.value.copy(colors(isMagic?(event.weaponId || offhandId || 'moonfan'):(event.weaponId || (event.kind==='burn'?'ember':'bomber'))).color);
    uniforms.halfAngle.value=isMagic?clamp(event.halfAngle || (upgrade?1.82:1.13),.1,Math.PI):Math.PI;
    uniforms.evolved.value=upgrade?1:0;uniforms.kind.value=isMagic?0:1;
    effect.flash.material.color.copy(uniforms.tint.value);effect.flash.visible=!isMagic;
    root.add(effect.group);attachRoot();animateEffect(effect,0);
  }
  function animateEffect(effect, dt) {
    effect.life=Math.max(0,effect.life-dt);
    if(effect.life<=0) {effect.group.removeFromParent();return;}
    const progress=1-effect.life/effect.maxLife;
    // Almost the complete hit area appears immediately, then its rim blooms.
    const expansion=effect.kind==='magic'?.89+Math.min(1,progress*5)*.11:.40+progress*.60;
    effect.fan.scale.set(effect.radius*expansion,1,effect.radius*expansion);
    const uniforms=effect.fan.material.uniforms;
    uniforms.opacity.value=Math.pow(1-progress,.65);uniforms.progress.value=.15+progress*.85;
    effect.flash.scale.setScalar(effect.kind==='burn'?.13+progress*.20:.18+progress*effect.radius*.35);
    effect.flash.material.opacity=(1-progress)*.30;
  }

  const bulletLook = {
    pulse:{geometry:g.ball,core:[.048,.048,.25],glow:[.11,.11,.34]},
    shotgun:{geometry:g.pellet,core:[.085,.085,.10],glow:[.14,.14,.17]},
    burst:{geometry:g.box,core:[.065,.065,.49],glow:[.14,.14,.60]},
    ember:{geometry:projectileCone,core:[.10,.10,.36],glow:[.15,.15,.40]},
    bomber:{geometry:g.ball,core:[.135,.135,.135],glow:[.21,.21,.21]},
    cannon:{geometry:g.crystal,core:[.20,.20,.35],glow:[.32,.32,.49]},
    moonfan:{geometry:g.star,core:[.13,.13,.12],glow:[.20,.20,.20]},
    frostwand:{geometry:g.crystal,core:[.09,.09,.27],glow:[.15,.15,.35]},
  };
  function styleBullet(mesh, bullet) {
    if(!mesh) return;
    const id=bulletLook[bullet?.weaponId] ? bullet.weaponId : 'pulse';
    if(bulletStyles.get(mesh)===id) return;
    const look=bulletLook[id],p=colors(id),parts=[];
    if(mesh.isMesh) parts.push(mesh);
    else mesh.traverse(child=>{if(child.isMesh)parts.push(child);});
    parts.forEach((child,index)=>{
      const glow=parts.length>1 && index===0;
      child.geometry=glow?g.ball:look.geometry;
      // Do not recolor the V3 shared projectile materials: replace them with
      // immutable catalog materials so other live/pool bullets stay unchanged.
      child.material=glow?p.glow:p.light;
      child.scale.set(...(glow?look.glow:look.core));child.rotation.set(0,0,0);
    });
    bulletStyles.set(mesh,id);mesh.userData.weaponId=id;
  }
  // Persistent damage-over-time cues use two instanced batches, capped at
  // twelve nearby enemies. They do not add a particle object every tick.
  const burnDummy=new THREE.Object3D();
  const burnFlames=new THREE.InstancedMesh(g.cone,colors('ember').light,MAX_BURNING);
  const burnCores=new THREE.InstancedMesh(g.ball,gold,MAX_BURNING);
  burnFlames.name='Persistent warm flame status';burnCores.name='Persistent warm ember cores';
  for(const batch of [burnFlames,burnCores]) {batch.count=0;batch.frustumCulled=false;batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);}
  let lastBurnKey='';
  function syncBurn(game) {
    const player=game.player || {x:0,z:0}, active=[];
    for(const enemy of game.enemies || []) {
      if(enemy.burn>0 && Math.hypot(enemy.x-player.x,enemy.z-player.z)<=11) active.push(enemy);
      if(active.length>=MAX_BURNING)break;
    }
    const key=`${active.length?now:0}/${active.map(enemy=>`${enemy.id}:${enemy.x}:${enemy.z}`).join('|')}`;
    if(key===lastBurnKey)return;
    lastBurnKey=key;burnFlames.count=burnCores.count=0;
    for(const enemy of active) {
      const index=burnFlames.count;
      const flicker=Math.sin(now*17+index*2.3),angle=now*1.7+index;
      burnDummy.position.set(enemy.x+Math.sin(angle)*.27,.47+flicker*.035,enemy.z+Math.cos(angle)*.27);
      burnDummy.rotation.set(0,0,Math.sin(now*7+index)*.12);
      burnDummy.scale.set(.088,.26+flicker*.05,.088);burnDummy.updateMatrix();burnFlames.setMatrixAt(index,burnDummy.matrix);
      burnDummy.position.y-=.075;burnDummy.scale.set(.060,.095,.060);burnDummy.updateMatrix();burnCores.setMatrixAt(index,burnDummy.matrix);
      burnFlames.count++;burnCores.count++;
    }
    for(const batch of [burnFlames,burnCores]) {
      if(batch.count) {
        if(!batch.parent)root.add(batch);
        batch.instanceMatrix.clearUpdateRanges();batch.instanceMatrix.addUpdateRange(0,batch.count*16);batch.instanceMatrix.needsUpdate=true;
      } else batch.removeFromParent();
    }
  }
  function sync(game, hero) {
    if(!game) return;
    attachRoot();syncHero(game,hero);syncDrops(game);syncBombs(game);syncBurn(game);
  }
  function update(dt, events=[], game=null, camera=null) {
    const step=Number.isFinite(dt)?Math.max(0,dt):0;now+=step;
    // World state is reconciled once by sync(); update only advances visuals.
    for(const effect of effectPool) if(effect.life>0) animateEffect(effect,step);
    for(const event of events || []) if(event.kind==='magic'||event.kind==='explosion'||event.kind==='burn') spawnEffect(event);
    for(const view of drops.values()) {
      view.float.position.y=DROP_GEOMETRY.floatY+Math.sin(now*2.7+view.phase)*DROP_GEOMETRY.floatBob;
      view.float.rotation.y=now*.72+view.phase;
      view.ring.rotation.z=now*.22+view.phase;
      if(camera && view.glyph.visible) {
        // Compensate for the rotating display so a skill symbol faces camera.
        view.glyph.quaternion.copy(view.float.quaternion).invert().multiply(camera.quaternion);
      }
    }
    for(const view of bombs.values()) {view.fuse.rotation.z=now*3.5;view.body.scale.setScalar(.21+Math.sin(now*12)*.011);}
    if(heldOffhand) {
      heldOffhand.rotation.z=.25+Math.sin(now*3)*.045;
      heldOffhand.userData.halo.rotation.z=now*.55;
    }
  }
  function clear() {
    detachHero();drops.clear();bombs.clear();
    for(const view of dropPool) {view.id=null;view.group.removeFromParent();view.group.visible=false;}
    for(const view of bombPool) {view.id=null;view.group.removeFromParent();}
    for(const effect of effectPool) {effect.life=0;effect.group.removeFromParent();}
    root.removeFromParent();root.clear();burnFlames.count=burnCores.count=0;lastBurnKey='';now=0;effectCursor=0;
    // Reusable pools retain a bounded cache. Repeated game resets never grow
    // GPU resources, and no world object or former hero is retained in scene.
  }
  // Read-only view for tap hit-testing: the drops visible in the last drawn
  // frame and whether each label was shown. An expiring drop in the dark beat
  // of its blink is not on screen, so it is left out until it shows again.
  function drawnDrops() {
    const out=new Map();if(!root.parent) return out;
    for(const [id,view] of drops) if(view.group.visible) out.set(id,{labelVisible:view.label.visible});
    return out;
  }
  return {sync,update,styleBullet,clear,drawnDrops,
    get stats(){return {drops:drops.size,bombs:bombs.size,burning:burnFlames.count,effects:effectPool.filter(item=>item.life>0).length,dropPool:dropPool.length,bombPool:bombPool.length,effectPool:effectPool.length,geometries:geometries.size,materials:materials.size,textures:textures.size};},
  };
}
