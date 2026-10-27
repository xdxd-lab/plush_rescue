import {makePlush} from './characters.js';
import {ALLY} from './core.js';
import {bossVisualScale} from './boss-visuals.js';

// Boss allies are drawn as the ordinary species' rescued plush, shrunk, with a
// small crown. The plush models are not added to the scene: like enemies and
// rescued friends they are rendered by the crowd instancer, so they share its
// existing batches. Only the crowns (one batch per kind), the foot timer rings
// and the helper beams add draw calls, and only while an ally is present.
// Models are pooled per species; nothing is allocated for a returning ally.
export const ALLY_VISUAL=Object.freeze({
  scale:Object.freeze({mini:.72,big:.82}),  // hero is 1.1; ordinary plush 1
  shrink:.45,          // seconds to shrink from boss size to helper size
  beamLife:.16,
  beams:24,
  rings:24,
  reserve:20,          // crowd capacity added for allies (at most one boss per minute)
  ringRadius:.5,
  warn:2,              // last seconds: the foot ring blinks (steady with reduced motion)
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const ease=t=>1-(1-t)*(1-t);

export function createAllyVisuals(THREE,scene){
  const root=new THREE.Group();root.name='Boss ally rings and helper beams';scene.add(root);
  const crownGeometry=new THREE.CylinderGeometry(.15,.18,.12,5,1,true);
  const gemGeometry=new THREE.OctahedronGeometry(.055);
  const crownMaterial={
    mini:new THREE.MeshStandardMaterial({color:'#f2b6c8',roughness:.45,metalness:.25,emissive:'#f2b6c8',emissiveIntensity:.25,side:THREE.DoubleSide}),
    big:new THREE.MeshStandardMaterial({color:'#f6d36b',roughness:.4,metalness:.35,emissive:'#f6d36b',emissiveIntensity:.3,side:THREE.DoubleSide}),
  };
  crownMaterial.mini.name='Ally little crown';crownMaterial.big.name='Ally star crown';
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide});
  const rings=new THREE.InstancedMesh(new THREE.RingGeometry(ALLY_VISUAL.ringRadius*.78,ALLY_VISUAL.ringRadius,40),ringMaterial,ALLY_VISUAL.rings);
  rings.name='Ally time rings';rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);rings.frustumCulled=false;rings.count=0;rings.visible=false;rings.renderOrder=2;root.add(rings);
  const beamMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
  const beamMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),beamMaterial,ALLY_VISUAL.beams);
  beamMesh.name='Ally helper beams';beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);beamMesh.frustumCulled=false;beamMesh.count=0;beamMesh.visible=false;beamMesh.renderOrder=4;root.add(beamMesh);
  const tint={mini:new THREE.Color('#ffb3cf'),big:new THREE.Color('#ffd978')};
  for(let i=0;i<ALLY_VISUAL.rings;i++)rings.setColorAt(i,tint.mini);
  for(let i=0;i<ALLY_VISUAL.beams;i++)beamMesh.setColorAt(i,tint.mini);

  const pools=new Map(),models=new Map(),beams=[],dummy=new THREE.Object3D();
  let beamCursor=0;
  function makeModel(type){
    const model=makePlush(THREE,{type,rescued:true});model.name='Boss ally helper';
    const crowns={};
    for(const kind of ['mini','big']){
      const crown=new THREE.Mesh(crownGeometry,crownMaterial[kind]);crown.name=`Ally ${kind} crown`;
      crown.position.y=model.userData.height+.04;crown.castShadow=false;
      if(kind==='big'){const gem=new THREE.Mesh(gemGeometry,crownMaterial.big);gem.position.y=.1;crown.add(gem);}
      model.add(crown);crowns[kind]=crown;
    }
    model.userData.allyCrowns=crowns;
    return model;
  }
  function checkout(ally){
    const pool=pools.get(ally.type);const mesh=pool?.pop()||makeModel(ally.type);
    mesh.userData.setRescued?.();mesh.userData.startRescueAnimation?.();
    mesh.userData.allyCrowns.mini.visible=ally.boss!=='big';mesh.userData.allyCrowns.big.visible=ally.boss==='big';
    mesh.position.set(ally.x,0,ally.z);mesh.rotation.set(0,0,0);
    const view={mesh,type:ally.type,bossScale:bossVisualScale({boss:ally.boss,radius:ally.bossRadius},mesh.userData.radius),lastX:ally.x,lastZ:ally.z};
    models.set(ally.id,view);return view;
  }
  function release(id,view){
    models.delete(id);
    if(!pools.has(view.type))pools.set(view.type,[]);
    pools.get(view.type).push(view.mesh);
  }

  // Place every ally model and its foot ring for this frame.
  function sync(game,{reduceMotion=false}={}){
    const alive=new Set();
    let ringCount=0;
    for(const ally of game.allies){
      alive.add(ally.id);
      const view=models.get(ally.id)||checkout(ally),mesh=view.mesh;
      const age=ALLY.duration-ally.life,small=ALLY_VISUAL.scale[ally.boss]||ALLY_VISUAL.scale.mini;
      let scale=small,lift=0,spin=0;
      if(ally.life>0&&age<ALLY_VISUAL.shrink){
        const t=ease(clamp(age/ALLY_VISUAL.shrink,0,1));
        scale=view.bossScale+(small-view.bossScale)*t;lift=Math.sin(t*Math.PI)*.35;
      }else if(!(ally.life>0)){
        const t=clamp(1-ally.leaving/ALLY.leave,0,1);
        lift=reduceMotion?0:Math.abs(Math.sin(t*Math.PI*2))*.45;spin=reduceMotion?0:t*Math.PI*2;
        scale=small*(t<.6?1:1-(t-.6)/.4);
      }
      const dx=ally.x-view.lastX,dz=ally.z-view.lastZ,moving=Math.hypot(dx,dz)>.004;
      if(moving)view.facing=Math.atan2(dx,dz);
      view.lastX=ally.x;view.lastZ=ally.z;
      mesh.position.set(ally.x,lift,ally.z);mesh.rotation.y=(view.facing??0)+spin;mesh.scale.setScalar(Math.max(.001,scale));
      mesh.userData.animate?.(game.time+ally.id*1.7,moving?1:0);
      if(ally.life>0&&ringCount<ALLY_VISUAL.rings){
        const left=ally.life/ALLY.duration,blinkOff=!reduceMotion&&ally.life<ALLY_VISUAL.warn&&Math.floor(ally.life*6)%2===1;
        if(!blinkOff){
          dummy.position.set(ally.x,.07,ally.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(.55+.45*left);dummy.updateMatrix();
          rings.setMatrixAt(ringCount,dummy.matrix);rings.setColorAt(ringCount,tint[ally.boss]||tint.mini);ringCount++;
        }
      }
    }
    for(const [id,view] of models)if(!alive.has(id))release(id,view);
    rings.count=ringCount;rings.visible=ringCount>0;
    if(ringCount){rings.instanceMatrix.needsUpdate=true;if(rings.instanceColor)rings.instanceColor.needsUpdate=true;}
  }
  function shot(event){
    const beam=beams.length<ALLY_VISUAL.beams?{}:beams[beamCursor++%ALLY_VISUAL.beams];
    if(beams.length<ALLY_VISUAL.beams)beams.push(beam);
    Object.assign(beam,{x:event.x,z:event.z,tx:event.tx,tz:event.tz,boss:event.boss,life:ALLY_VISUAL.beamLife});
  }
  function update(dt){
    let count=0;
    for(const beam of beams){
      if(!(beam.life>0))continue;
      beam.life=Math.max(0,beam.life-dt);if(beam.life===0)continue;
      const dx=beam.tx-beam.x,dz=beam.tz-beam.z,length=Math.hypot(dx,dz),fade=beam.life/ALLY_VISUAL.beamLife;
      dummy.position.set((beam.x+beam.tx)/2,.5,(beam.z+beam.tz)/2);dummy.rotation.set(0,Math.atan2(dx,dz),0);
      dummy.scale.set(.07*fade+.02,.07*fade+.02,Math.max(.01,length));dummy.updateMatrix();
      beamMesh.setMatrixAt(count,dummy.matrix);beamMesh.setColorAt(count,tint[beam.boss]||tint.mini);count++;
    }
    beamMesh.count=count;beamMesh.visible=count>0;
    if(count){beamMesh.instanceMatrix.needsUpdate=true;if(beamMesh.instanceColor)beamMesh.instanceColor.needsUpdate=true;}
  }
  function clear(){
    for(const [id,view] of [...models])release(id,view);
    for(const beam of beams)beam.life=0;
    rings.count=beamMesh.count=0;rings.visible=beamMesh.visible=false;
  }
  return {sync,shot,update,clear,models,
    get stats(){let pooled=0;for(const pool of pools.values())pooled+=pool.length;
      return {models:models.size,pooled,rings:rings.count,beams:beamMesh.count};}};
}
