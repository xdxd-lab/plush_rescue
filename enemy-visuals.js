import {ENEMY_ROLES,dashLength} from './core.js';

// Enemy variety telegraphs. Role enemies keep the ordinary plush models (drawn
// by the crowd instancer); this module only adds flat ground marks, all in
// fixed instanced batches allocated once:
// - a foot mark per role enemy: a teal ring for spitters, an orange arrow for
//   dashers, so the role reads without relying on colour alone;
// - spit warnings: a teal disc that fills over the windup, whose edge is the
//   exact hit radius, turning coral for the last 20% and while active;
// - dash lanes: an orange corridor along the locked direction, as wide as the
//   contact reach and as long as the dash, filling from the dasher outwards.
// Spitters flash their ring while aiming; reduced motion keeps it steady.
export const ENEMY_VISUAL_LIMITS=Object.freeze({marks:90,spits:8,lanes:16});
const COLORS=Object.freeze({spitter:'#5fd6e8',dasher:'#ff9f4a',imminent:'#ff6f6a',dark:'#352c48'});
const EMPTY=Object.freeze([]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// Contact reach of a dasher: enemy radius plus the player's .42 (core.js step).
export const LANE_WIDTH=(.38+.42)*2;

export function createEnemyVisuals(THREE,scene){
  const root=new THREE.Group();root.name='Enemy variety telegraphs';
  const flat=geometry=>(geometry.rotateX(-Math.PI/2),geometry);
  const basic=(color,opacity)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false});
  const geometries=[],materials=[],batches=[];
  function batch(name,geometry,material,count,order){
    geometries.push(geometry);materials.push(material);
    const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=name;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=order;root.add(mesh);batches.push(mesh);return mesh;
  }
  const L=ENEMY_VISUAL_LIMITS;
  const ringMarks=batch('Spitter foot rings',flat(new THREE.RingGeometry(.42,.56,32)),basic(COLORS.spitter,.9),L.marks,11);
  // Arrow pointing along +z (the model's facing).
  const arrowShape=new THREE.Shape();arrowShape.moveTo(0,.62);arrowShape.lineTo(.36,.08);arrowShape.lineTo(.14,.14);arrowShape.lineTo(.14,-.4);arrowShape.lineTo(-.14,-.4);arrowShape.lineTo(-.14,.14);arrowShape.lineTo(-.36,.08);arrowShape.closePath();
  const arrowGeometry=new THREE.ShapeGeometry(arrowShape);arrowGeometry.rotateX(Math.PI/2);
  const arrowMarks=batch('Dasher foot arrows',arrowGeometry,basic(COLORS.dasher,.9),L.marks,11);
  const spitBacking=batch('Spit warning backing',flat(new THREE.CircleGeometry(1,40)),basic(COLORS.dark,.22),L.spits,12);
  const spitFill=batch('Spit warning fill',flat(new THREE.CircleGeometry(1,40)),basic('#ffffff',.32),L.spits,13);
  const spitEdge=batch('Spit exact hit edge',flat(new THREE.RingGeometry(.9,1,48)),basic('#ffffff',.95),L.spits,14);
  const laneGeometry=new THREE.PlaneGeometry(1,1);laneGeometry.rotateX(-Math.PI/2);laneGeometry.translate(0,0,.5);
  // The frame is inset: its outer edge shares the corridor's exact footprint.
  // A dark, steady backing keeps the orange progress legible on light and dark floors.
  const laneBacking=batch('Dash lane corridor',laneGeometry,basic('#211a30',.88),L.lanes,12);
  const laneFill=batch('Dash lane fill',laneGeometry.clone(),basic(COLORS.dasher,.72),L.lanes,13);
  const frameGeometry=new THREE.BufferGeometry();
  const vertices=[];
  function frameRect(x0,z0,x1,z1){vertices.push(x0,0,z0,x1,0,z0,x1,0,z1,x0,0,z0,x1,0,z1,x0,0,z1);}
  frameRect(-.5,0,-.43,1);frameRect(.43,0,.5,1);
  frameRect(-.43,0,.43,.025);frameRect(-.43,.975,.43,1);
  frameGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const laneEdge=batch('Dash lane inset edge',frameGeometry,basic('#fff0bc',1),L.lanes,14);
  const tint={spitter:new THREE.Color(COLORS.spitter),imminent:new THREE.Color(COLORS.imminent),dasher:new THREE.Color(COLORS.dasher)};
  const dummy=new THREE.Object3D();
  let stats={marks:0,spits:0,lanes:0,aiming:0},disposed=false;

  function place(mesh,index,x,y,z,angle,sx,sz){dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(sx,1,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
  function sync(game,{reduceMotion=false}={}){
    if(disposed)throw new Error('Cannot sync disposed enemy visuals.');
    const enemies=game.enemies||EMPTY,hazards=game.hazards||EMPTY,time=Number.isFinite(game.time)?game.time:0;
    let rings=0,arrows=0,lanes=0,spits=0,aiming=0;
    for(const e of enemies){
      if(!e.role||e.boss)continue;
      if(e.role==='spitter'&&rings<L.marks){
        const aim=e.aim>0;if(aim)aiming++;
        const flash=aim&&!reduceMotion?(Math.floor(time*14)%2?1.35:1):aim?1.25:1;
        place(ringMarks,rings++,e.x,.05,e.z,0,flash,flash);
      }else if(e.role==='dasher'&&arrows<L.marks){
        const s=e.dash,locked=s&&(s.phase==='windup'||s.phase==='dash');
        const angle=locked?Math.atan2(s.dx,s.dz):e.angle||0;
        place(arrowMarks,arrows++,e.x,.05,e.z,angle,locked?1.2:1,locked?1.2:1);
        if(s?.phase==='windup'&&lanes<L.lanes){
          const progress=clamp(1-s.t/ENEMY_ROLES.dasher.windup,0,1),length=dashLength()+.42;
          place(laneBacking,lanes,s.x??e.x,.04,s.z??e.z,angle,LANE_WIDTH,length);
          place(laneFill,lanes,s.x??e.x,.045,s.z??e.z,angle,LANE_WIDTH,Math.max(.02,length*progress));
          place(laneEdge,lanes,s.x??e.x,.05,s.z??e.z,angle,LANE_WIDTH,length);lanes++;
        }
      }
    }
    for(const h of hazards){
      if(h.kind!=='spit'||spits>=L.spits)continue;
      const age=Math.max(0,h.age||0),windup=Math.max(.001,h.windup||0);if(age>=windup+(h.duration||0))continue;
      const active=age>=windup,progress=active?1:clamp(age/windup,0,1),color=active||progress>=.8?tint.imminent:tint.spitter;
      place(spitBacking,spits,h.x,.036,h.z,0,h.radius,h.radius);
      place(spitFill,spits,h.x,.041,h.z,0,h.radius*Math.max(.03,Math.sqrt(progress)),h.radius*Math.max(.03,Math.sqrt(progress)));
      place(spitEdge,spits,h.x,.049,h.z,0,h.radius,h.radius);
      spitFill.setColorAt(spits,color);spitEdge.setColorAt(spits,color);spits++;
    }
    ringMarks.count=rings;arrowMarks.count=arrows;laneBacking.count=laneFill.count=laneEdge.count=lanes;spitBacking.count=spitFill.count=spitEdge.count=spits;
    for(const mesh of batches){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    stats={marks:rings+arrows,spits,lanes,aiming};
    if(rings||arrows||spits||lanes){if(root.parent!==scene)scene.add(root);}else if(root.parent)root.removeFromParent();
  }
  function clear(){for(const mesh of batches){mesh.count=0;mesh.visible=false;}stats={marks:0,spits:0,lanes:0,aiming:0};root.removeFromParent();}
  function dispose(){if(disposed)return;clear();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const b of batches)b.dispose?.();disposed=true;}
  return {root,sync,clear,dispose,get stats(){return {...stats};}};
}
