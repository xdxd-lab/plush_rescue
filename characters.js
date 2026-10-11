// Handmade, ground-level plush models. Forward is +Z; all shared assets are
// cached per THREE namespace so the crowd renderer can instance every part.
const caches = new WeakMap();

function assets(THREE) {
  if (caches.has(THREE)) return caches.get(THREE);

  // Rounded, stuffed shapes rather than hard-edged cubes. This bevelled cube
  // is also used for the sewn-on fabric patches and the toy blaster casing.
  const roundBox = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5);
  const a = roundBox.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x=a.getX(i), y=a.getY(i), z=a.getZ(i), r=.16;
    const qx=Math.max(-.5+r,Math.min(.5-r,x));
    const qy=Math.max(-.5+r,Math.min(.5-r,y));
    const qz=Math.max(-.5+r,Math.min(.5-r,z));
    const dx=x-qx, dy=y-qy, dz=z-qz, length=Math.hypot(dx,dy,dz)||1;
    a.setXYZ(i,qx+dx*r/length,qy+dy*r/length,qz+dz*r/length);
  }
  roundBox.computeVertexNormals();
  const disc = new THREE.CylinderGeometry(1,1,1,24);
  disc.rotateX(Math.PI/2);
  const earShape = new THREE.Shape();
  earShape.moveTo(-.9,-.55); earShape.quadraticCurveTo(-1.04,-.40,-.8,.03);
  earShape.lineTo(-.14,1.02); earShape.quadraticCurveTo(0,1.22,.15,1.01);
  earShape.lineTo(.81,.04); earShape.quadraticCurveTo(1.05,-.39,.89,-.54);
  earShape.quadraticCurveTo(0,-.73,-.9,-.55);
  const catEar = new THREE.ExtrudeGeometry(earShape,{depth:.6,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.19,bevelThickness:.22,curveSegments:8});
  catEar.translate(0,0,-.3);
  catEar.computeVertexNormals();
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0,-.85);heartShape.bezierCurveTo(-.18,-.64,-1.04,-.06,-.88,.5);
  heartShape.bezierCurveTo(-.69,1.06,-.18,.97,0,.6);
  heartShape.bezierCurveTo(.18,.97,.69,1.06,.88,.5);
  heartShape.bezierCurveTo(1.04,-.06,.18,-.64,0,-.85);
  const heart = new THREE.ExtrudeGeometry(heartShape,{depth:.22,bevelEnabled:true,bevelSize:.06,bevelThickness:.06,bevelSegments:2,steps:1,curveSegments:8});
  heart.translate(0,0,-.11);
  const tearShape=new THREE.Shape();
  [[-.5,-.49],[-.22,-.26],[-.37,-.07],[-.12,.04],[-.16,.32],[.18,.5],[.29,.27],[.48,.02],[.26,-.11],[.32,-.29],[.09,-.47]].forEach(([x,y],i)=>i?tearShape.lineTo(x,y):tearShape.moveTo(x,y));
  tearShape.closePath();

  // A real domed cap profile gives the beret a readable crown above its rim.
  // The felt has a baked, restrained value gradient so it keeps its shape at
  // gameplay size instead of collapsing to a uniformly brown oval.
  const cap = new THREE.LatheGeometry([
    [0,0],[.89,0],[.98,.06],[1,.16],[.96,.33],[.85,.55],[.67,.77],[.40,.93],[0,1],
  ].map(([x,y])=>new THREE.Vector2(x,y)),28);
  const capColors=[];
  for(let i=0;i<cap.attributes.position.count;i++){
    const y=cap.attributes.position.getY(i),x=cap.attributes.position.getX(i);
    const value=.62+.41*y-.035*x;
    capColors.push(value,value,value);
  }
  cap.setAttribute('color',new THREE.Float32BufferAttribute(capColors,3));

  const g = {
    ball:new THREE.SphereGeometry(1,20,14),
    soft:new THREE.SphereGeometry(1,16,12),
    bead:new THREE.SphereGeometry(1,10,8),
    box:roundBox, disc, ear:catEar, heart, cap,
    tear:new THREE.ShapeGeometry(tearShape),
    tube:new THREE.CylinderGeometry(1,1,1,20),
    ring:new THREE.TorusGeometry(1,.085,7,28),
    smile:new THREE.TorusGeometry(1,.12,6,16,Math.PI),
    boldSmile:new THREE.TorusGeometry(1,.19,6,16,Math.PI),
    band:new THREE.TorusGeometry(1,.10,7,32,Math.PI*1.76),
    tail:new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,.22,-.22),new THREE.Vector3(.31,.27,-.28),
      new THREE.Vector3(.41,.47,-.27),new THREE.Vector3(.35,.62,-.22),
      new THREE.Vector3(.21,.60,-.19),new THREE.Vector3(.20,.51,-.18),
    ]),18,.071,7,false),
  };

  // Many tiny threads share one geometry, not dozens of draw calls. Geometry
  // is deliberately real (rather than sprites) so crowd instancing retains it.
  function threadGeometry(segments,width=.012) {
    const positions=[],normals=[];
    for(const [ax,ay,bx,by,z=0] of segments){
      const strand=new THREE.BoxGeometry(Math.hypot(bx-ax,by-ay),width,width*.7).toNonIndexed();
      strand.rotateZ(Math.atan2(by-ay,bx-ax));strand.translate((ax+bx)/2,(ay+by)/2,z);
      positions.push(...strand.attributes.position.array);normals.push(...strand.attributes.normal.array);strand.dispose();
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.computeBoundingSphere();return geometry;
  }
  g.cross=threadGeometry([[-.40,-.40,.40,.40],[-.40,.40,.40,-.40]],.14);
  g.buttonThread=threadGeometry([[-.29,-.18,.27,.18],[-.27,.18,.29,-.18]],.075);
  g.seam=threadGeometry([
    [-.08,-.46,.03,.46],[-.26,-.37,.15,-.32],[-.24,-.16,.17,-.10],
    [-.23,.06,.21,.12],[-.19,.29,.23,.34],
  ],.085);
  const border=[];
  for(let i=0;i<5;i++){
    const t=-.36+i*.18;
    border.push([t,-.43,t+.13,-.43],[t,.43,t+.13,.43],[-.43,t,-.43,t+.13],[.43,t,.43,t+.13]);
  }
  g.patchSeam=threadGeometry(border,.065);
  const oval=[];
  for(let i=0;i<20;i++){
    const t=i/20*Math.PI*2,dt=.13;
    oval.push([Math.sin(t),Math.cos(t),Math.sin(t+dt),Math.cos(t+dt)]);
  }
  g.ovalSeam=threadGeometry(oval,.040);
  g.fray=threadGeometry([
    [-.05,-.32,-.30,-.58],[-.21,-.01,-.54,-.16],[-.12,.25,-.35,.48],
    [.14,.25,.39,.43],[.20,.01,.53,-.04],[.10,-.24,.37,-.46],
  ],.048);
  g.whiskers=threadGeometry([[-.6,.18,.6,.35],[-.6,-.12,.56,-.25]],.035);

  // A subtle woven pile and a separate worn surface, generated locally. No
  // network images and no DOM requirement in Node geometry/gameplay tests.
  function fabricTexture(worn) {
    if(typeof document==='undefined'||!document.createElement||!THREE.CanvasTexture)return null;
    try{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
      const c=canvas.getContext('2d');if(!c)return null;
      c.fillStyle=worn?'#dedfda':'#f5f3ed';c.fillRect(0,0,128,128);
      let seed=83717;
      const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
      for(let y=0;y<128;y+=4)for(let x=0;x<128;x+=4){
        const v=Math.floor((worn?183:221)+random()*30);
        c.strokeStyle=`rgba(${v},${v},${v},${worn?.35:.28})`;c.lineWidth=.75;
        const offset=(y/4%2)*2;c.beginPath();c.moveTo(x+offset,y);c.lineTo(x+offset+1.7,y+2);c.lineTo(x+offset+3.4,y);c.stroke();
        c.fillStyle='rgba(255,255,255,.25)';c.fillRect(x+offset+1,y+2,1,1);
      }
      if(worn){
        for(let i=0;i<75;i++){
          const x=random()*128,y=random()*128,r=1+random()*5;
          const gradient=c.createRadialGradient(x,y,0,x,y,r);
          gradient.addColorStop(0,`rgba(80,75,79,${.035+random()*.06})`);gradient.addColorStop(1,'rgba(80,75,79,0)');
          c.fillStyle=gradient;c.fillRect(x-r,y-r,r*2,r*2);
        }
        c.fillStyle='rgba(75,70,78,.12)';for(let i=0;i<140;i++)c.fillRect(random()*128,random()*128,.65,.65);
      }
      const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;
      t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;t.repeat.set(2,1);return t;
    }catch{return null;}
  }
  const wornTexture=fabricTexture(true),cleanTexture=fabricTexture(false),materials=new Map();
  function material(color,surface='fabric') {
    const key=`${color}/${surface}`;
    if(materials.has(key))return materials.get(key);
    const fabric=surface==='fabric'||surface==='worn'||surface==='felt';
    const texture=surface==='worn'?wornTexture:cleanTexture;
    const mat=new THREE.MeshStandardMaterial({
      color,roughness:fabric?1:surface==='glass'?.19:surface==='plastic'?.46:.82,
      metalness:surface==='glass'?.12:0,
      vertexColors:surface==='felt',
      ...(fabric&&texture?{map:texture,bumpMap:texture,bumpScale:surface==='worn'?.008:.004}:{}),
      ...(surface==='glow'?{emissive:color,emissiveIntensity:.6}:{}),
    });
    mat.name=`plush-${surface}-${color.toString(16)}`;materials.set(key,mat);return mat;
  }
  const result={g,material};caches.set(THREE,result);return result;
}

const PALETTES=[
  {worn:0xaaa6ad,trim:0x736579,patch:0x736b85,happy:0xffd7e5,bright:0xf78cb8,belly:0xfff4ec,bow:0xf181b6},
  {worn:0xb1acae,trim:0x956f85,patch:0x896b83,happy:0xfff2df,bright:0xf6acc7,belly:0xfffcf2,bow:0xf989b0},
  {worn:0x9daaa6,trim:0x547f74,patch:0x637e79,happy:0xbde5d4,bright:0x6dbfae,belly:0xf6f2d6,bow:0xf5a15f},
  {worn:0xa4a9b4,trim:0x667490,patch:0x737087,happy:0xc6d4ff,bright:0x929feb,belly:0xfff4e8,bow:0xeb91c4},
];

export function makePlush(THREE,{hero=false,heroId='pudding',type=0,rescued=false}={}) {
  const polar=heroId==='polar';
  hero=hero||polar;
  type=((type|0)%4+4)%4;
  const {g,material:m}=assets(THREE),p=PALETTES[type];
  const root=new THREE.Group(),rig=new THREE.Group();root.add(rig);
  root.name=hero?(polar?'Snowball · polar rescue bear':'Pudding · golden rescue pup'):['Mochi · patchwork kitten','Mallow · patchwork bunny','Clover · patchwork bear','Cloud · patchwork puppy'][type];
  rig.name='Soft plush animation rig';
  const bodyParts=[],trimParts=[],bellyParts=[],patchParts=[],stitchParts=[],feet=[],arms=[],ears=[];
  const wornOnly=new THREE.Group(),happyOnly=new THREE.Group();
  wornOnly.name='Worn fabric, loose threads and broken control band';happyOnly.name='Restored smile, ribbons and heart';
  rig.add(wornOnly,happyOnly);happyOnly.visible=false;
  const bodyMat=m(hero?(polar?0xf0f6f3:0xffe3a0):p.worn,hero?'fabric':'worn');
  const trimMat=m(hero?(polar?0xd2e7e9:0xffdc90):p.trim,hero?'fabric':'worn');
  const bellyMat=m(hero?(polar?0xfffcf2:0xffe9af):0xc3c1b8,hero?'fabric':'worn');
  const threadMat=m(0x403947,'matte'),faceMat=m(0x473539,'matte'),creamMat=m(0xfff0d2,'fabric');

  function part(name,geom,mat,x,y,z,sx,sy,sz,parent=rig) {
    const o=new THREE.Mesh(g[geom],mat);o.name=name;o.position.set(x,y,z);o.scale.set(sx,sy,sz);
    o.castShadow=geom==='ball'||geom==='ear'||geom==='tail'||geom==='box';o.receiveShadow=true;parent.add(o);return o;
  }
  function plush(name,x,y,z,sx,sy,sz,category=bodyParts,parent=rig,geom='ball') {
    const mat=category===trimParts?trimMat:category===bellyParts?bellyMat:bodyMat;
    const o=part(name,geom,mat,x,y,z,sx,sy,sz,parent);category.push(o);return o;
  }
  function stitch(name,geometry,x,y,z,sx,sy,rotation=0,parent=rig){
    const o=part(name,geometry,threadMat,x,y,z,sx,sy,.65,parent);o.rotation.z=rotation;stitchParts.push(o);return o;
  }
  const body=plush('Broad bean-shaped stuffed body',0,.395,-.015,hero?(polar?.424:.37):.32,hero?.33:.30,hero?(polar?.337:.30):.265);
  const head=plush('Oversized soft cheeked head',0,hero?.885:.825,hero?.015:.01,hero?(polar?.476:.495):.425,hero?(polar?.397:.375):.35,hero?(polar?.382:.365):.32);
  // Short feet overlap the belly; there is deliberately no humanoid neck.
  for(const s of [-1,1]){
    const foot=plush(`${s<0?'Left':'Right'} little bean foot`,s*(hero?(polar?.225:.205):.17),.105,.11,hero?(polar?.182:.165):.142,.105,hero?.195:.17);feet.push(foot);
    const arm=plush(`${s<0?'Left':'Right'} round paw`,s*(hero?.36:.31),hero?.43:.415,hero?.125:.055,.125,hero?.18:.165,.125);
    arm.rotation.z=-s*.28;arms.push(arm);
    if(!hero){
      const paw=part('Faded paw pad','soft',m(p.patch,'worn'),s*.17,.098,.259,.073,.046,.012);patchParts.push(paw);
    }
  }
  plush('Soft oval tummy bib',0,hero?.365:.365,hero?.274:.247,hero?(polar?.283:.24):.205,hero?.235:.215,.036,bellyParts);
  if(!hero)stitch('Hand-stitched tummy border','ovalSeam',0,.365,.287,.184,.190);

  if(polar){
    // A bear is identified by its upright round ears, broad head and snout,
    // never by recoloring the pup's floppy ears or leaving its hat in place.
    for(const s of [-1,1]){
      const ear=plush(`${s<0?'Left':'Right'} round polar-bear ear`,s*.350,1.191,-.018,.136,.138,.110);
      ears.push({mesh:ear,z:0});
      part('Soft pink polar ear lining','soft',m(0xe5b4c4,'fabric'),s*.350,1.198,.079,.079,.078,.020);
    }
  }else if(hero||type===3){
    for(const s of [-1,1]){
      const ear=plush(`${s<0?'Left':'Right'} low floppy ear`,s*(hero?.512:.429),hero?.82:.785,-.005,hero?.205:.16,hero?.252:.233,hero?.125:.113,hero?bodyParts:trimParts);
      ear.rotation.z=s*.56;ear.rotation.y=-s*.12;ears.push({mesh:ear,z:ear.rotation.z});
      if(!hero){const inside=part('Threadbare inner floppy ear','soft',m(p.patch,'worn'),s*.486,.738,.094,.081,.136,.018);inside.rotation.z=s*.53;patchParts.push(inside);}
    }
  }else if(type===1){
    for(const s of [-1,1]){
      const ear=plush(`${s<0?'Left':'Right'} long velvet bunny ear`,s*.224,1.124,-.025,.117,s<0?.354:.307,.095);
      ear.rotation.z=s*.34;ear.rotation.x=s<0?-.08:.18;ears.push({mesh:ear,z:ear.rotation.z});
      const inner=part('Worn rose bunny-ear lining','soft',trimMat,0,.07,.82,.57,.76,.19,ear);trimParts.push(inner);
    }
  }else if(type===2){
    for(const s of [-1,1]){
      const ear=plush(`${s<0?'Left':'Right'} round teddy ear`,s*.315,s<0?1.061:1.084,-.018,.147,.153,.103);
      ears.push({mesh:ear,z:0});
      const inner=part('Contrasting teddy ear lining','soft',trimMat,s*.315,s<0?1.063:1.084,.079,.091,.09,.024);trimParts.push(inner);
    }
  }else{
    for(const s of [-1,1]){
      const ear=part(`${s<0?'Left':'Right'} softly rounded kitten ear`,'ear',bodyMat,s*.282,1.088,-.013,.139,.168,.156);
      ear.rotation.z=-s*.16;bodyParts.push(ear);ears.push({mesh:ear,z:ear.rotation.z});
      const inner=part('Velvet kitten ear triangle','ear',trimMat,s*.283,1.09,.103,.072,.091,.018);inner.rotation.z=-s*.16;trimParts.push(inner);
    }
  }
  if(!hero&&type===0){const tail=part('Curled kitten tail','tail',bodyMat,0,0,-.008,1,1,1);bodyParts.push(tail);}
  else{
    const tail=plush(polar?'Round cotton polar-bear tail':hero?'Tiny pudding puppy tail':'Round plush tail',polar?0:hero?-.33:.10,.29,polar?-.334:-.252,hero?(polar?.112:.155):.116,hero?(polar?.107:.14):.112,.137,bodyParts);
    tail.rotation.z=-.4;
  }

  // A raised muzzle keeps the face legible from the game's elevated camera.
  const faceY=hero?(polar?.805:.807):.762,faceZ=hero?(polar?.397:.361):.300;
  if(polar)plush('Broad cream polar-bear snout',0,faceY+.014,faceZ-.012,.204,.129,.073,bellyParts,rig,'soft');
  else plush('Cream left muzzle',-.066,faceY,faceZ,.115,.083,.038,bellyParts,rig,'soft');
  if(!polar)plush('Cream right muzzle',.066,faceY,faceZ,.115,.083,.038,bellyParts,rig,'soft');
  const nose=part('Tiny cocoa nose','soft',faceMat,0,faceY+.032,faceZ+(polar?.069:.048),hero?(polar?.062:.052):.037,hero?(polar?.038:.031):.027,.028);
  part('Embroidered nose stem','box',faceMat,0,faceY-.003,faceZ+(polar?.075:.052),hero?.017:.013,.044,.011);
  for(const s of [-1,1]){
    const smile=part('Friendly puppy-mouth embroidery','boldSmile',faceMat,s*(hero?.044:.035),faceY-.020,faceZ+(polar?.076:.053),hero?.047:.037,hero?.031:.026,.027);smile.rotation.z=Math.PI;
    const blush=part('Soft cheek blush','soft',m(hero?(polar?0xefc3c8:0xeaaa78):p.patch,hero?'fabric':'worn'),s*(hero?.304:.267),faceY-.016,hero?.291:.253,hero?.062:.057,.032,.012);
    if(!hero)patchParts.push(blush);
  }

  if(hero){
    if(!polar){
    // Broad, matching circular lenses and visible side arms keep the glasses
    // readable from three-quarter views without inventing a second rear face.
    const glass=m(0x111621,'glass'),rim=m(0x241f26,'plastic'),glint=m(0xb8caca,'glass');
    for(const s of [-1,1]){
      part('Round cocoa sunglasses rim','ring',rim,s*.184,.952,.388,.137,.137,.19);
      part('Round black sunglass lens','soft',glass,s*.184,.952,.392,.124,.124,.025);
      const reflection=part('Quiet sunglass reflection','soft',glint,s*.184-.033,.998,.412,.025,.036,.005);reflection.rotation.z=-.42;
      const temple=part('Sunglasses temple arm','box',rim,s*.356,.947,.278,.188,.037,.037);temple.rotation.y=s*.57;
    }
    part('Straight horizontal sunglasses bridge','box',rim,0,.961,.413,.112,.034,.025);
    const cocoa=m(0x9b6744,'felt'),cocoaDark=m(0x48291c,'fabric');
    const brim=part('Soft cocoa beret brim','ball',cocoaDark,-.025,1.185,-.006,.376,.047,.299);brim.rotation.z=-.05;
    const beret=part('Rounded cocoa beret crown','cap',cocoa,-.042,1.194,-.026,.357,.196,.278);beret.rotation.z=-.045;beret.castShadow=true;
    const stalk=part('Little beret stem','soft',m(0x654027,'fabric'),-.070,1.410,-.042,.034,.041,.033);stalk.rotation.z=.16;
    const hatSeam=part('Beret sewn rim','ring',m(0xb98451,'fabric'),-.025,1.219,-.006,.353,.278,.095);hatSeam.rotation.x=Math.PI/2;
    }else{
      const ink=m(0x263b4b,'matte'),sparkle=m(0xfffcf0,'plastic'),iceRim=m(0x439abd,'plastic'),iceLens=m(0x132235,'glass');
      for(const s of [-1,1]){
        part('Glossy polar-bear button eye','soft',ink,s*.181,.979,.358,.039,.047,.022);
        part('Polar-bear eye glint','bead',sparkle,s*.181-.011,.991,.379,.010,.013,.006);
        part('Icy-blue round polar glasses','ring',iceRim,s*.181,.979,.389,.102,.106,.12);
        part('Dark polar sunglass lens','soft',iceLens,s*.181,.979,.391,.094,.098,.009);
        part('Quiet icy-blue sunglass glint','soft',m(0x8ebacb,'glass'),s*.181-.027,1.010,.401,.019,.029,.004).rotation.z=-.34;
        const temple=part('Icy-blue polar glasses arm','box',iceRim,s*.315,.982,.302,.148,.020,.020);temple.rotation.y=s*.53;
        const brow=part('Gentle polar eyebrow','box',trimMat,s*.182,1.066,.328,.087,.019,.017);brow.rotation.z=-s*.10;
      }
      part('Small icy-blue glasses bridge','box',iceRim,0,.989,.393,.156,.020,.018);
      const scarf=m(0x48bcd2,'fabric'),scarfDark=m(0x28879c,'fabric'),scarfStitch=m(0xb7f2ee,'fabric');
      const collar=part('Cyan knitted winter scarf','ring',scarf,0,.602,.012,.363,.310,1.27);collar.rotation.x=Math.PI/2;
      const hem=part('Winter scarf lower knitted edge','ring',scarfDark,0,.579,.012,.354,.300,.43);hem.rotation.x=Math.PI/2;
      const knot=part('Soft winter scarf knot','soft',scarf,-.279,.577,.245,.108,.081,.079);
      const scarfTail=part('Long cyan winter scarf tail','box',scarf,-.327,.410,.287,.151,.295,.050);scarfTail.rotation.z=-.17;
      const shortTail=part('Short cyan scarf fold','box',scarfDark,-.200,.477,.317,.121,.195,.036);shortTail.rotation.z=.17;
      for(let i=0;i<3;i++){
        const stitch=part('Winter scarf embroidered stripe','box',scarfStitch,-.319+i*.018,.310+i*.043,.319,.136,.013,.008);stitch.rotation.z=-.17;
        part('Winter scarf soft fringe','box',scarfDark,-.378+i*.047,.255,.287,.019,.061,.039).rotation.z=-.17;
      }
      part('Snowflake scarf stitch','cross',scarfStitch,-.291,.577,.323,.059,.059,.30,knot.parent);
    }
    // An identifiable pack clasp still provides a visual landmark from behind.
    part('Little sky-blue rescue backpack','box',m(0x6698aa,'fabric'),0,.465,-.281,.38,.34,.16);
    part('Backpack cream flap','box',m(0xd3e2da,'fabric'),0,.57,-.359,.29,.13,.035);
    part('Backpack gold clasp','disc',m(0xe6b666,'plastic'),0,.512,-.385,.034,.034,.021);

    const gun=new THREE.Group();gun.name='Chunky cyan toy rescue blaster';gun.position.set(.205,.492,.350);gun.scale.setScalar(1.24);rig.add(gun);
    const cyan=m(0x39acd0,'plastic'),ivory=m(0xf5faed,'plastic'),navy=m(0x203348,'plastic'),light=m(0xa8f9ff,'glow');
    part('Dark toy receiver outline','box',navy,0,-.010,.103,.284,.214,.378,gun);
    part('Cyan rounded toy receiver','box',cyan,0,.011,.103,.256,.184,.352,gun);
    part('Cream top toy housing','box',ivory,0,.082,.101,.296,.095,.300,gun);
    for(const s of [-1,1]){
      part('Cream side inset','box',ivory,s*.142,.005,.080,.023,.115,.223,gun);
      for(let i=0;i<3;i++)part('Navy toy vent','box',navy,s*.157,.008,.023+i*.052,.010,.052,.016,gun);
    }
    part('Cyan grip handle','box',navy,0,-.119,.010,.108,.165,.114,gun).rotation.x=-.18;
    const barrel=part('Navy toy barrel','tube',navy,0,.009,.337,.083,.184,.083,gun);barrel.rotation.x=Math.PI/2;
    const collar=part('Cream barrel collar','tube',ivory,0,.009,.281,.105,.094,.105,gun);collar.rotation.x=Math.PI/2;
    const frontCollar=part('Cream flared toy muzzle','tube',ivory,0,.009,.406,.100,.067,.100,gun);frontCollar.rotation.x=Math.PI/2;
    part('Cyan muzzle rim','ring',cyan,0,.009,.444,.086,.086,.27,gun);
    part('Dark inset muzzle','disc',navy,0,.009,.446,.071,.071,.017,gun);
    const muzzleCore=part('Soft glowing rescue-light core','disc',light,0,.009,.456,.046,.046,.011,gun);
    part('Tiny cyan sight','box',cyan,0,.147,.13,.067,.055,.079,gun);
    part('Glowing sight bead','soft',light,0,.169,.159,.026,.018,.027,gun);
    // Both paws physically meet the grip/fore-end. Their warm fabric contrasts
    // with the dark underside, so the blaster reads as a held toy, not a block.
    const forearm=plush('Left supporting forearm',-.162,.399,.298,.193,.112,.139);forearm.rotation.y=.45;
    arms[0].position.set(.035,.393,.467);arms[0].scale.set(.130,.110,.145);arms[0].rotation.set(-.28,0,.22);
    arms[1].position.set(.383,.430,.378);arms[1].rotation.set(-.43,0,-.66);
    // The actual luminous core is the single source of truth. Include the gun,
    // animated rig and root scale while excluding the root yaw/world position,
    // which the game applies separately when creating its projectile.
    const muzzlePoint=new THREE.Vector3();
    const localMuzzle=(target={},animated=true)=>{
      muzzlePoint.set(0,0,0);
      for(let node=muzzleCore;node!==root;node=node.parent){
        node.updateMatrix();
        if(animated||node!==rig)muzzlePoint.applyMatrix4(node.matrix);
      }
      if(animated)muzzlePoint.multiply(root.scale);
      target.x=muzzlePoint.x;target.y=muzzlePoint.y;target.z=muzzlePoint.z;return target;
    };
    root.userData.muzzleOffset=localMuzzle({},false);
    root.userData.getMuzzleOffset=(target={})=>localMuzzle(target,true);
    root.userData.height=polar?1.39:1.46;root.userData.radius=polar?.51:.49;
    root.userData.heroId=polar?'polar':'pudding';
  }else{
    // Mismatched inset button eyes: different sizes, hues and stitching.
    for(const s of [-1,1]){
      const eyeY=.877+(s>0?.012:0),eyeX=s*.147,eyeZ=.318,r=s<0?.080:.068;
      const button=m(s<0?0x443d49:0x595343,'plastic');
      part('Mismatched button-eye edge','ring',m(s<0?0x786d82:0x9b9072,'matte'),eyeX,eyeY,eyeZ,r,r,.12,wornOnly);
      part('Mismatched button-eye center','disc',button,eyeX,eyeY,eyeZ+.006,r*.86,r*.86,.022,wornOnly);
      const eyeStitch=part('Crossed button-eye thread','buttonThread',m(0xc3b59b,'matte'),eyeX,eyeY,eyeZ+.023,r*.72,r*.72,.20,wornOnly);eyeStitch.rotation.z=s*.3;
      // Sad, gently sloping stitch brows reinforce that these are lost toys.
      const brow=part('Worried embroidered eyebrow','box',threadMat,s*.159,.980,.280,.072,.014,.012,wornOnly);brow.rotation.z=-s*.27;
      const happy=part('Happy closed crescent eye','boldSmile',faceMat,eyeX,.868,.329,.054,.049,.038,happyOnly);
      happy.rotation.z=0;
      part('Rosy restored cheek','soft',m(0xf598ae,'fabric'),s*.266,.766,.268,.060,.033,.016,happyOnly);
    }
    // The forehead has a tangible, edge-stitched fabric patch, not a painted
    // rectangle. Angling it to the head keeps it visible from above.
    const patch=part('Sewn forehead fabric patch','box',m(p.patch,'worn'),-.282,.999,.263,.213,.228,.032);patch.rotation.set(-.24,-.37,.21);patchParts.push(patch);
    const patchThread=part('Forehead patch perimeter stitches','patchSeam',threadMat,0,0,.59,.84,.85,.23,patch);stitchParts.push(patchThread);
    // Rear and three-quarter enemies still show handmade damage instead of
    // becoming plain gray spheres when they turn away from the camera.
    const backPatch=part('Large rear-head cloth patch','box',m(p.patch,'worn'),.147,.903,-.287,.195,.252,.029);backPatch.rotation.set(.18,Math.PI-.24,-.22);patchParts.push(backPatch);
    const backThread=part('Rear-head patch perimeter stitches','patchSeam',threadMat,0,0,.60,.84,.85,.30,backPatch);stitchParts.push(backThread);
    stitch('Repaired side-of-head ladder seam','seam',.294,.961,.237,.131,.201,-.45);
    stitch('Cross-stitch on left paw','cross',-.321,.40,.181,.061,.061,.12);
    // Real torn fabric, pale stuffing and little outward frays. These all
    // disappear when rescued, along with the damaged control band.
    const rip=part('Little open fabric rip','tear',m(0x403c4a,'matte'),.240,.385,.237,.131,.185,1,wornOnly);rip.rotation.z=-.31;
    const stuffing=part('Exposed cream cotton stuffing','soft',m(0xd6d5c6,'fabric'),.244,.386,.245,.034,.051,.015,wornOnly);stuffing.rotation.z=-.31;
    const fray=part('Frayed threads around rip','fray',m(0xbebbb0,'matte'),.240,.385,.251,.144,.190,.5,wornOnly);fray.rotation.z=-.31;
    // Two smaller scuffs break up the otherwise perfect symmetry.
    part('Threadbare forehead scuff','soft',m(0x8f8e98,'worn'),.146,1.09,.171,.074,.045,.015,wornOnly).rotation.x=-.5;
    const scuff=part('Loose ankle stitches','seam',threadMat,-.198,.164,.256,.065,.085,.5,wornOnly);scuff.rotation.z=.65;
    const band=part('Broken dark control band','band',m(0x5d6774,'matte'),0,.567,.018,.276,.247,.37,wornOnly);band.rotation.set(Math.PI/2,0,.38);
    const buckle=part('Crooked control-band buckle','box',m(0x474b60,'plastic'),.067,.558,.272,.12,.088,.033,wornOnly);buckle.rotation.z=-.16;
    part('Faded amber control light','disc',m(0xe4ac71,'glow'),.067,.560,.294,.028,.028,.010,wornOnly);
    const strap=part('Loose broken band end','box',m(0x616778,'matte'),-.198,.522,.182,.063,.149,.024,wornOnly);strap.rotation.z=-.56;
    stitch('Broken-band repair thread','cross',-.193,.563,.213,.041,.041,-.2,wornOnly);

    function bow(parent,mat,x,y,z,scale=1){
      const group=new THREE.Group();group.name='Soft satin friendship bow';group.position.set(x,y,z);group.scale.setScalar(scale);parent.add(group);
      for(const s of [-1,1]){const wing=part('Plump bow loop','soft',mat,s*.090,0,0,.104,.079,.044,group);wing.rotation.z=-s*.32;}
      for(const s of [-1,1]){const tail=part('Short cloth ribbon tail','box',mat,s*.053,-.087,-.002,.063,.119,.029,group);tail.rotation.z=s*.23;}
      part('Round bow knot','soft',mat,0,0,.030,.046,.051,.037,group);
      return group;
    }
    // A small crooked old ribbon is replaced by a larger clean bow.
    const bowPosition=type===0?[-.235,1.077,.233]:type===1?[.264,1.13,.11]:[0,.578,.280];
    const oldBow=bow(wornOnly,m(p.trim,'worn'),...bowPosition,.94);oldBow.rotation.z=-.24;
    const newBow=bow(happyOnly,m(p.bow,'fabric'),...bowPosition,type===2?1.03:1.10);newBow.rotation.z=.10;
    part('Stitched friendship heart','heart',m(type===2?0xf39990:p.bow,'fabric'),type===2?0:.092,.351,.298,.080,.080,.095,happyOnly);
    if(type===0){
      for(const s of [-1,1]){const whisker=part('Short kitten whisker stitches','whiskers',faceMat,s*.275,.805,.260,.067,.062,.4);whisker.rotation.z=-s*.08;}
    }
    let rescueAt=null;
    root.userData.rescued=false;
    root.userData.setRescued=()=>{
      if(root.userData.rescued)return;
      root.userData.rescued=true;rescueAt=null;
      for(const o of bodyParts)o.material=m(p.happy,'fabric');
      for(const o of trimParts)o.material=m(p.bright,'fabric');
      for(const o of bellyParts)o.material=m(p.belly,'fabric');
      for(const o of patchParts)o.material=m(p.bright,'fabric');
      for(const o of stitchParts)o.material=m(p.belly,'matte');
      wornOnly.visible=false;happyOnly.visible=true;
    };
    root.userData.rescuePulse=time=>{
      if(!root.userData.rescued)return 1;
      if(rescueAt===null)rescueAt=time;
      const t=time-rescueAt;return t<.55?1+Math.sin(Math.max(0,t)/.55*Math.PI)*.065:1;
    };
    // A rescued mesh can leave and re-enter the free pool many times. Palette
    // restoration stays idempotent; animation is explicitly restarted on each
    // checkout and anchors to the next simulation frame (including restarts).
    root.userData.startRescueAnimation=()=>{
      if(!root.userData.rescued)return;
      rescueAt=null;
      rig.scale.set(1,1,1);
    };
    root.userData.height=type===1?1.52:type===0?1.33:type===2?1.25:1.20;
    root.userData.radius=type===3?.46:.43;
    if(rescued)root.userData.setRescued();
  }
  root.userData.species=hero?(polar?'polar bear':'pudding dog'):['cat','rabbit','bear','dog'][type];
  root.userData.animate=(time,moving=0)=>{
    const speed=typeof moving==='number'?Math.min(1,Math.max(0,moving)):moving?1:0;
    const step=Math.sin(time*10.5),idle=Math.sin(time*2.2),pulse=root.userData.rescuePulse?.(time)||1;
    rig.position.y=Math.abs(step)*.030*speed+(idle+1)*.003*(1-speed);
    rig.rotation.z=step*.022*speed;rig.scale.set(pulse,2-pulse,pulse);
    feet[0].rotation.x=step*.24*speed;feet[1].rotation.x=-step*.24*speed;
    if(!hero){arms[0].rotation.x=-step*.12*speed;arms[1].rotation.x=step*.12*speed;}
    for(const {mesh,z} of ears){mesh.rotation.x=step*.04*speed;mesh.rotation.z=z+step*.028*speed;}
  };
  return root;
}
