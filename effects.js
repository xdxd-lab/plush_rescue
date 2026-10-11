// Shared, bounded GPU batches: soft contact shadows, rescue sparkles and little hearts.
export function createEffects(THREE,scene,limits){
 const dummy=new THREE.Object3D(),sparkles=[],halos=[];let effectsDirty=false;
 function radialTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d'),g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(30,29,24,0.52)');g.addColorStop(.35,'rgba(30,29,24,0.27)');g.addColorStop(.7,'rgba(30,29,24,0.08)');g.addColorStop(1,'rgba(30,29,24,0)');c.fillStyle=g;c.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(canvas);return t;}
 const contactGeo=new THREE.PlaneGeometry(1,1);contactGeo.rotateX(-Math.PI/2);
 const contactMat=new THREE.MeshBasicMaterial({map:radialTexture(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 const contacts=new THREE.InstancedMesh(contactGeo,contactMat,limits.enemies+(limits.bosses||0)+limits.rescued+1);contacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);contacts.frustumCulled=false;contacts.renderOrder=1;scene.add(contacts);
 const star=new THREE.Shape();star.moveTo(0,.17);star.lineTo(.035,.035);star.lineTo(.12,0);star.lineTo(.035,-.035);star.lineTo(0,-.17);star.lineTo(-.035,-.035);star.lineTo(-.12,0);star.lineTo(-.035,.035);star.closePath();
 const heart=new THREE.Shape();heart.moveTo(0,-.13);heart.bezierCurveTo(-.25,.03,-.14,.22,0,.1);heart.bezierCurveTo(.14,.22,.25,.03,0,-.13);
 const goldMat=new THREE.MeshBasicMaterial({color:'#fff5c1',transparent:true,depthWrite:false,side:THREE.DoubleSide});
 const roseMat=new THREE.MeshBasicMaterial({color:'#ffc1dc',transparent:true,depthWrite:false,side:THREE.DoubleSide});
 const starMesh=new THREE.InstancedMesh(new THREE.ShapeGeometry(star),goldMat,limits.particles),heartMesh=new THREE.InstancedMesh(new THREE.ShapeGeometry(heart),roseMat,limits.particles);
 for(const b of [starMesh,heartMesh]){b.instanceMatrix.setUsage(THREE.DynamicDrawUsage);b.frustumCulled=false;b.count=0;b.renderOrder=5;scene.add(b);}
 const ringGeo=new THREE.TorusGeometry(.67,.017,5,56),ringMat=new THREE.MeshBasicMaterial({color:'#ffe7a3',transparent:true,opacity:.92,depthWrite:false});
 const ringGlowGeo=new THREE.TorusGeometry(.67,.065,5,48),ringGlowMat=new THREE.MeshBasicMaterial({color:'#ffd167',transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending});
 const floorGeo=new THREE.RingGeometry(.48,.7,48),floorMat=new THREE.MeshBasicMaterial({color:'#ffe2a0',transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false});
 function burst(x,z){
  effectsDirty=true;
  const group=new THREE.Group(),ring=new THREE.Mesh(ringGeo,ringMat),glow=new THREE.Mesh(ringGlowGeo,ringGlowMat),floor=new THREE.Mesh(floorGeo,floorMat);
  const upright=new THREE.Group();upright.add(ring,glow);upright.position.y=.64;group.add(upright);floor.rotation.x=-Math.PI/2;floor.position.y=.09;group.add(floor);group.position.set(x,0,z);scene.add(group);halos.push({group,upright,floor,life:1.15});
  if(halos.length>12)scene.remove(halos.shift().group);
  for(let i=0;i<14&&sparkles.length<limits.particles;i++){const a=i/14*Math.PI*2; sparkles.push({x:x+Math.sin(a)*.55,y:.5+Math.cos(a)*.45,z:z+Math.cos(a)*.18,vx:Math.sin(a)*.44,vz:Math.cos(a)*.24,life:1.1+i%3*.12,max:1.4,seed:i*1.31,heart:i%6===0});}
 }
 function update(dt,camera){
  if(!effectsDirty&&(dt===0||(!halos.length&&!sparkles.length)))return false;
  effectsDirty=false;
  for(let i=halos.length-1;i>=0;i--){const h=halos[i];h.life-=dt;h.upright.quaternion.copy(camera.quaternion);h.group.scale.setScalar(1+Math.sin((1-h.life/1.15)*Math.PI)*.14);h.group.visible=h.life>.12;h.floor.rotation.z+=dt*.5;if(h.life<=0){scene.remove(h.group);halos.splice(i,1);}}
  starMesh.count=heartMesh.count=0;
  for(let i=sparkles.length-1;i>=0;i--){const p=sparkles[i];p.life-=dt;if(p.life<=0){sparkles.splice(i,1);continue;}p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=dt*(p.heart?.8:.23);dummy.position.set(p.x,p.y,p.z);dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(p.heart?Math.sin(p.seed+p.life)*.17:p.life*.4);dummy.scale.setScalar(Math.min(1,p.life/.25)*(p.heart?.9:.6+Math.abs(Math.sin(p.life*11+p.seed))*.6));dummy.updateMatrix();const b=p.heart?heartMesh:starMesh;b.setMatrixAt(b.count++,dummy.matrix);}
  for(const batch of [starMesh,heartMesh]){batch.instanceMatrix.clearUpdateRanges();if(batch.count){batch.instanceMatrix.addUpdateRange(0,batch.count*16);batch.instanceMatrix.needsUpdate=true;}}
  return true;
 }
 function shadows(player,enemies,rescued){
  contacts.count=0;dummy.rotation.set(0,0,0);
  for(const [items,scale] of [[[player],1.2],[enemies,.92],[rescued,.92]])for(const e of items){dummy.position.set(e.x,.061,e.z);const size=e.boss?(e.radius||1)*2.4:scale;dummy.scale.set(size,1,size*.83);dummy.updateMatrix();contacts.setMatrixAt(contacts.count++,dummy.matrix);}
  contacts.instanceMatrix.clearUpdateRanges();if(contacts.count){contacts.instanceMatrix.addUpdateRange(0,contacts.count*16);contacts.instanceMatrix.needsUpdate=true;}
 }
 function clear(){for(const h of halos)scene.remove(h.group);halos.length=sparkles.length=0;contacts.count=starMesh.count=heartMesh.count=0;effectsDirty=false;}
 return{burst,update,shadows,clear,get haloCount(){return halos.length;},get particleCount(){return sparkles.length;}};
}
