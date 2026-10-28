import {WEAPONS} from './weapons.js';
import {PROJECTILE} from './core.js';

// Main-weapon shot feedback, drawn on top of the existing bolts (which keep
// their V3 look): a short tapered light trail behind each bolt, and on a hit a
// small flash with a few cotton puffs. Everything is three instanced batches
// with fixed capacity, shown only while something is alive, so a screen full of
// bolts costs at most three extra draw calls. Trails fade towards the tail
// through vertex colours under additive blending; flashes and puffs fade by
// colour and size, so no per-instance material is needed.
// Reduced motion: a hit shows a short steady flash and no flying puffs.
// Low quality: no puffs.
export const SHOT_VISUAL=Object.freeze({
  trails:100,           // LIMITS.bullets
  flashes:32,
  puffs:96,
  puffsPerHit:4,
  flashLife:.16,
  puffLife:.3,
  // Trail width and full length (world units) per weapon; a young bolt's trail
  // reaches exactly back to its muzzle, including the path flown before it was
  // first drawn.
  trail:Object.freeze({
    pulse:Object.freeze({width:.085,length:1.1}),
    burst:Object.freeze({width:.08,length:1.2}),
    shotgun:Object.freeze({width:.07,length:.55}),
    ember:Object.freeze({width:.1,length:.8}),
    cannon:Object.freeze({width:.16,length:1}),
  }),
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function createShotVisuals(THREE,scene){
  const root=new THREE.Group();root.name='Main weapon trails and hits';scene.add(root);
  // A cone along -Z: full width at the bolt (z=0), a point at the tail (z=-1),
  // bright at the bolt and black (invisible when added) at the tail.
  const trailGeometry=new THREE.CylinderGeometry(1,0,1,8,1,true);
  trailGeometry.rotateX(Math.PI/2);trailGeometry.translate(0,0,-.5);
  {const pos=trailGeometry.attributes.position,colors=[];
    for(let i=0;i<pos.count;i++){const k=clamp(1+pos.getZ(i),0,1);colors.push(k,k,k);}
    trailGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));}
  const additive={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
  const trails=new THREE.InstancedMesh(trailGeometry,new THREE.MeshBasicMaterial({vertexColors:true,...additive,opacity:.7}),SHOT_VISUAL.trails);
  trails.name='Main weapon bolt trails';
  const flashCanvas=typeof document!=='undefined'&&document.createElement?.('canvas');
  let flashTexture=null;
  if(flashCanvas?.getContext){
    flashCanvas.width=flashCanvas.height=64;const c=flashCanvas.getContext('2d');
    if(c?.createRadialGradient){const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);flashTexture=new THREE.CanvasTexture(flashCanvas);}
  }
  const flashes=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:flashTexture,...additive}),SHOT_VISUAL.flashes);
  flashes.name='Main weapon hit flashes';
  const puffMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:'#fff6ea',transparent:true,opacity:.9,depthWrite:false}),SHOT_VISUAL.puffs);
  puffMesh.name='Main weapon hit cotton puffs';
  const white=new THREE.Color(1,1,1);
  for(const batch of [trails,flashes,puffMesh]){
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.frustumCulled=false;batch.count=0;batch.visible=false;batch.renderOrder=4;
    batch.setColorAt(0,white);root.add(batch);
  }
  const tint=new Map(),color=new THREE.Color(),dummy=new THREE.Object3D(),starts=new Map(),seen=new Set();
  const weaponColor=id=>{if(!tint.has(id))tint.set(id,new THREE.Color(WEAPONS[id]?.color||'#63e3ff'));return tint.get(id);};
  const flashPool=[],puffPool=[];let flashCursor=0,puffCursor=0;
  const take=(pool,cap,cursor)=>pool.length<cap?(pool.push({}),pool.at(-1)):pool[cursor%cap];

  // Trails follow the live bolts every frame.
  function sync(bullets=[],muzzleY=.65){
    let count=0;seen.clear();
    for(const b of bullets){
      if(count>=SHOT_VISUAL.trails)break;
      const spec=SHOT_VISUAL.trail[b.weaponId]||SHOT_VISUAL.trail.pulse;seen.add(b.id);
      // Every bolt leaves the muzzle with PROJECTILE.life and flies straight at a
      // constant speed, so its age gives the distance flown since the muzzle.
      // Bolts without a life fall back to where they were first drawn.
      let flown;
      if(Number.isFinite(b.life))flown=Math.hypot(b.vx,b.vz)*Math.max(0,PROJECTILE.life-b.life);
      else{if(!starts.has(b.id))starts.set(b.id,{x:b.x,z:b.z});const start=starts.get(b.id);flown=Math.hypot(b.x-start.x,b.z-start.z);}
      const length=Math.min(spec.length,flown);
      if(length<.02)continue;
      dummy.position.set(b.x,b.y??muzzleY,b.z);dummy.rotation.set(0,Math.atan2(b.vx,b.vz),0);dummy.scale.set(spec.width,spec.width,length);dummy.updateMatrix();
      trails.setMatrixAt(count,dummy.matrix);trails.setColorAt(count,weaponColor(b.weaponId));count++;
    }
    for(const id of starts.keys())if(!seen.has(id))starts.delete(id);
    trails.count=count;trails.visible=count>0;
    if(count){trails.instanceMatrix.needsUpdate=true;trails.instanceColor.needsUpdate=true;}
  }
  function hit(event,{reduceMotion=false,quality='balanced'}={}){
    const flash=take(flashPool,SHOT_VISUAL.flashes,flashCursor++);
    Object.assign(flash,{x:event.x,z:event.z,weaponId:event.weaponId,life:SHOT_VISUAL.flashLife,still:reduceMotion});
    if(reduceMotion||quality==='low')return;
    const back=Math.atan2(-(event.vx||0),-(event.vz||1));
    for(let i=0;i<SHOT_VISUAL.puffsPerHit;i++){
      const puff=take(puffPool,SHOT_VISUAL.puffs,puffCursor++),a=back+(i-(SHOT_VISUAL.puffsPerHit-1)/2)*.55,speed=1.6+(i%2)*.5;
      Object.assign(puff,{x:event.x,y:.6,z:event.z,vx:Math.sin(a)*speed,vy:1.2+(i%3)*.35,vz:Math.cos(a)*speed,size:.07+(i%2)*.025,life:SHOT_VISUAL.puffLife});
    }
  }
  function update(dt,camera){
    const step=Number.isFinite(dt)?Math.max(0,dt):0;
    let count=0;
    for(const f of flashPool){
      if(!(f.life>0))continue;f.life=Math.max(0,f.life-step);if(f.life===0)continue;
      const t=1-f.life/SHOT_VISUAL.flashLife,size=f.still?.6:.42+t*.5;
      dummy.position.set(f.x,.62,f.z);if(camera)dummy.quaternion.copy(camera.quaternion);else dummy.rotation.set(0,0,0);dummy.scale.set(size,size,1);dummy.updateMatrix();
      flashes.setMatrixAt(count,dummy.matrix);color.copy(weaponColor(f.weaponId)).lerp(white,.45).multiplyScalar(1-t);flashes.setColorAt(count,color);count++;
    }
    flashes.count=count;flashes.visible=count>0;if(count){flashes.instanceMatrix.needsUpdate=true;flashes.instanceColor.needsUpdate=true;}
    count=0;
    for(const p of puffPool){
      if(!(p.life>0))continue;p.life=Math.max(0,p.life-step);if(p.life===0)continue;
      p.x+=p.vx*step;p.y=Math.max(.05,p.y+p.vy*step);p.z+=p.vz*step;p.vy-=6*step;p.vx*=1-3*step;p.vz*=1-3*step;
      const k=p.life/SHOT_VISUAL.puffLife;
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(p.size*(.35+.65*k));dummy.updateMatrix();
      puffMesh.setMatrixAt(count,dummy.matrix);count++;
    }
    puffMesh.count=count;puffMesh.visible=count>0;if(count)puffMesh.instanceMatrix.needsUpdate=true;
  }
  function clear(){
    starts.clear();for(const f of flashPool)f.life=0;for(const p of puffPool)p.life=0;
    for(const batch of [trails,flashes,puffMesh]){batch.count=0;batch.visible=false;}
  }
  return {sync,hit,update,clear,
    get stats(){return {trails:trails.count,flashes:flashes.count,puffs:puffMesh.count};}};
}
