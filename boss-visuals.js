import {makePlush} from './characters.js';

// Two world slots and eight telegraphs are allocated once. Each boss slot
// retains both species so a second mini/big can appear without constructing
// meshes in sync. The four model trees share every geometry and material.
export const BOSS_VISUAL_LIMITS=Object.freeze({bosses:2,hazards:8});
// Keep the world size when a boss becomes the ordinary species' cute rescued model.
export function bossVisualRadius(entity){
  return Number.isFinite(entity.radius)&&entity.radius>0?entity.radius:entity.boss==='big'?1.5:1;
}
export function bossVisualScale(entity,modelRadius){
  return bossVisualRadius(entity)/modelRadius;
}
const EMPTY=Object.freeze([]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function createBossVisuals(THREE,scene){
  const root=new THREE.Group();root.name='V5 plush bosses and grounded warnings';
  const geometries=new Set(),materials=new Set();
  const ownGeometry=value=>(geometries.add(value),value);
  const ownMaterial=value=>(materials.add(value),value);
  const g={
    ball:ownGeometry(new THREE.SphereGeometry(1,16,12)),
    ring:ownGeometry(new THREE.TorusGeometry(1,.085,7,36)),
    disc:ownGeometry(new THREE.CircleGeometry(1,48)),
    edge:ownGeometry(new THREE.RingGeometry(.952,1,64)),
    outline:ownGeometry(new THREE.RingGeometry(.925,1.023,64)),
    box:ownGeometry(new THREE.BoxGeometry(1,1,1)),
  };
  const crownShape=new THREE.Shape();
  crownShape.moveTo(-.25,0);crownShape.lineTo(-.28,.18);
  crownShape.quadraticCurveTo(-.285,.22,-.25,.20);
  crownShape.lineTo(-.135,.115);crownShape.lineTo(-.018,.26);
  crownShape.quadraticCurveTo(0,.283,.018,.26);
  crownShape.lineTo(.135,.115);crownShape.lineTo(.25,.20);
  crownShape.quadraticCurveTo(.285,.22,.28,.18);
  crownShape.lineTo(.25,0);crownShape.closePath();
  g.crown=ownGeometry(new THREE.ExtrudeGeometry(crownShape,{depth:.045,bevelEnabled:true,bevelThickness:.015,bevelSize:.015,bevelSegments:2,steps:1,curveSegments:8}));
  const starShape=new THREE.Shape();
  for(let i=0;i<10;i++){
    const angle=Math.PI/2+i*Math.PI/5,r=i%2?.43:1;
    const x=Math.cos(angle)*r,y=Math.sin(angle)*r;
    if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);
  }
  starShape.closePath();g.star=ownGeometry(new THREE.ShapeGeometry(starShape));
  const fabric=color=>ownMaterial(new THREE.MeshStandardMaterial({color,roughness:1,emissive:color,emissiveIntensity:.035}));
  const gold=ownMaterial(new THREE.MeshStandardMaterial({color:0xf8d487,roughness:.72,emissive:0xf5bf60,emissiveIntensity:.16}));
  const cream=fabric(0xffead5),purple=fabric(0x9d88bc),rose=fabric(0xc48da9),cyan=fabric(0x79c4cc);
  // Unlit, non-tone-mapped colors remain readable in the sunlit courtyard,
  // green glass garden and moonlit midway. Dark keylines define the exact edge.
  const basic=(color,opacity=1)=>ownMaterial(new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false}));
  const dark=basic(0x352c48,.90),warning=basic(0xffdb8f),active=basic(0xff817a);
  const warningFill=basic(0xffcc77,.25),activeFill=basic(0xff796f,.30),backing=basic(0x40314f,.23);
  const bossPool=[],hazardPool=[],clothPalettes=[new Map(),new Map()];
  let bossCount=0,hazardCount=0,disposed=false;

  function mesh(parent,name,geometry,material,x,y,z,sx=1,sy=1,sz=1){
    const value=new THREE.Mesh(geometry,material);value.name=name;
    value.position.set(x,y,z);value.scale.set(sx,sy,sz);parent.add(value);return value;
  }
  function plushBoss(kind){
    const big=kind==='big',index=big?1:0,type=big?3:1;
    const model=makePlush(THREE,{type});model.name=big?'Royal patchwork puppy boss':'Little-crown patchwork bunny boss';
    model.userData.bossKind=kind;model.userData.type=type;
    // A small cool lift keeps the large worn fabric from becoming a dark mass.
    // Clones are cached across slots and never change the ordinary crowd art.
    const originalBody=model.getObjectByName('Broad bean-shaped stuffed body').material;
    let bodyMaterial=clothPalettes[index].get(originalBody);
    if(!bodyMaterial){
      bodyMaterial=ownMaterial(originalBody.clone());bodyMaterial.color.setHex(big?0xb6b6cc:0xc2bbce);
      bodyMaterial.emissive.setHex(big?0x625975:0x725968);bodyMaterial.emissiveIntensity=.045;
      bodyMaterial.name=big?'Soft moon-lilac boss cloth':'Soft rose-lilac boss cloth';
      clothPalettes[index].set(originalBody,bodyMaterial);
    }
    model.traverse(node=>{if(node.isMesh&&node.material===originalBody)node.material=bodyMaterial;});
    const rig=model.getObjectByName('Soft plush animation rig');
    const outfit=new THREE.Group();outfit.name=big?'Royal velvet cape and crown':'Little-crown friendship outfit';rig.add(outfit);
    const cape=mesh(outfit,'Soft trailing royal cape',g.ball,big?purple:rose,0,.42,-.266,.336,big?.327:.269,.060);
    cape.rotation.x=-.12;cape.castShadow=true;
    const collar=mesh(outfit,'Cream fluffy royal collar',g.ring,cream,0,.551,.003,.286,.245,.50);collar.rotation.x=Math.PI/2;
    mesh(outfit,'Friendship crown front',g.crown,gold,0,1.166,.041,big?1.11:.87,big?1.07:.91,1);
    const band=mesh(outfit,'Soft golden crown band',g.ring,gold,0,1.187,-.034,big?.233:.194,big?.171:.149,.37);band.rotation.x=Math.PI/2;
    mesh(outfit,'Bright crown friendship gem',g.ball,big?cyan:rose,0,1.285,.109,big?.050:.041,.052,.019);
    // Large boss has a scalloped cream cape hem and two soft gold medallions;
    // mini keeps a simple cape and single gem so their silhouettes differ.
    if(big){
      for(let i=0;i<5;i++)mesh(outfit,'Royal cape scalloped hem',g.ball,cream,-.242+i*.121,.17,-.289,.085,.066,.031);
      for(const side of [-1,1]){
        mesh(outfit,'Golden shoulder friendship star',g.star,gold,side*.297,.581,.146,.071,.071,.05).rotation.y=side*.35;
      }
    }else{
      mesh(outfit,'Little-crown friendship medal',g.star,gold,-.203,.509,.230,.059,.059,.03).rotation.z=-.15;
    }
    return model;
  }
  for(let i=0;i<BOSS_VISUAL_LIMITS.bosses;i++){
    const group=new THREE.Group();group.name='Reusable plush boss slot';group.visible=false;root.add(group);
    const mini=plushBoss('mini'),big=plushBoss('big');group.add(mini,big);mini.visible=big.visible=false;
    bossPool.push({group,mini,big,entityId:null,entity:null,seen:false});
  }
  for(let i=0;i<BOSS_VISUAL_LIMITS.hazards;i++){
    const group=new THREE.Group();group.name='Grounded boss attack warning';group.visible=false;root.add(group);
    function ground(name,geometry,material,height){
      const value=mesh(group,name,geometry,material,0,height,0);value.rotation.x=-Math.PI/2;value.renderOrder=12;return value;
    }
    ground('Warning footprint shadow',g.disc,backing,.037);
    ground('High-contrast warning boundary',g.outline,dark,.043);
    const fill=ground('Expanding windup fill',g.disc,warningFill,.046);
    const edge=ground('Exact attack-radius boundary',g.edge,warning,.051);
    const pulse=ground('Active attack inner pulse',g.edge,active,.055);
    const emblem=ground('Stitched warning star',g.star,warning,.060);emblem.scale.setScalar(.19);
    hazardPool.push({group,fill,edge,pulse,emblem});
  }

  function sync(game){
    if(disposed)throw new Error('Cannot sync disposed boss visuals.');
    const enemies=game.enemies||EMPTY,time=Number.isFinite(game.time)?game.time:0;
    bossCount=0;
    for(let i=0;i<bossPool.length;i++)bossPool[i].seen=false;
    for(let i=0;i<enemies.length&&bossCount<BOSS_VISUAL_LIMITS.bosses;i++){
      const enemy=enemies[i];
      if((enemy.boss!=='mini'&&enemy.boss!=='big')||enemy.hp<=0||enemy.rescued)continue;
      let slot=null;
      // Preserve the slot for an unchanged id, even when the enemy array moves.
      for(let j=0;j<bossPool.length;j++)if(!bossPool[j].seen&&bossPool[j].entityId===enemy.id){slot=bossPool[j];break;}
      if(!slot)for(let j=0;j<bossPool.length;j++)if(!bossPool[j].seen){slot=bossPool[j];break;}
      if(!slot)break;
      slot.seen=true;slot.entityId=enemy.id;slot.entity=enemy;slot.group.visible=true;
      const big=enemy.boss==='big',model=big?slot.big:slot.mini;
      slot.mini.visible=!big;slot.big.visible=big;
      slot.group.position.set(enemy.x,0,enemy.z);slot.group.rotation.y=enemy.angle||0;
      const radius=bossVisualRadius(enemy);
      const scale=bossVisualScale(enemy,model.userData.radius);slot.group.scale.setScalar(scale);
      model.userData.animate(time+(Number.isFinite(enemy.id)?enemy.id:0),.65);
      slot.group.userData.boss=enemy.boss;slot.group.userData.entityId=enemy.id;
      slot.group.userData.radius=radius;slot.group.userData.hp=enemy.hp;slot.group.userData.maxHp=enemy.maxHp;
      bossCount++;
    }
    for(let i=0;i<bossPool.length;i++){
      const slot=bossPool[i];if(slot.seen)continue;
      slot.group.visible=false;slot.entityId=null;slot.entity=null;
    }
    const hazards=game.hazards||EMPTY;
    hazardCount=0;
    for(let i=0;i<hazards.length&&hazardCount<BOSS_VISUAL_LIMITS.hazards;i++){
      const hazard=hazards[i],age=Math.max(0,hazard.age||0),windup=Math.max(0,hazard.windup||0),duration=Math.max(0,hazard.duration||0);
      if(age>=windup+duration||!Number.isFinite(hazard.radius)||hazard.radius<=0)continue;
      const slot=hazardPool[hazardCount++],isActive=age>=windup;
      const progress=isActive?1:clamp(age/Math.max(windup,.001),0,1);
      slot.group.visible=true;slot.group.position.set(hazard.x,0,hazard.z);slot.group.scale.set(hazard.radius,1,hazard.radius);
      slot.group.userData.hazardId=hazard.id;slot.group.userData.active=isActive;slot.group.userData.progress=progress;
      slot.fill.material=isActive?activeFill:warningFill;
      slot.fill.scale.setScalar(isActive?1:Math.max(.025,Math.sqrt(progress)));
      slot.edge.material=isActive?active:warning;
      slot.emblem.material=isActive?active:warning;
      slot.emblem.rotation.z=time*.75;
      slot.pulse.visible=isActive;
      if(isActive){
        const cycle=((age-windup)*3.5)%1;
        slot.pulse.scale.setScalar(.24+cycle*.70);
      }
    }
    for(let i=hazardCount;i<hazardPool.length;i++)hazardPool[i].group.visible=false;
    if(bossCount||hazardCount){if(root.parent!==scene)scene.add(root);}else if(root.parent)root.removeFromParent();
  }
  function clear(){
    for(let i=0;i<bossPool.length;i++){
      const slot=bossPool[i];slot.group.visible=false;slot.entityId=null;slot.entity=null;slot.seen=false;
      slot.mini.visible=slot.big.visible=false;
    }
    for(let i=0;i<hazardPool.length;i++)hazardPool[i].group.visible=false;
    bossCount=hazardCount=0;root.removeFromParent();
  }
  function dispose(){
    if(disposed)return;clear();
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    disposed=true;
  }
  return {sync,clear,dispose,get stats(){return {
    bosses:bossCount,hazards:hazardCount,bossPool:bossPool.length,hazardPool:hazardPool.length,
    modelVariants:bossPool.length*2,geometries:geometries.size,materials:materials.size,
  };}};
}
