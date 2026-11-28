// Eight original craft-toy patterns for ground pickups, not the held toy rig.
// Cut parts are temporary; weapon-visuals bakes each once into two shared
// surface/trim buffers. +Z points forward; the two charms are displayed upright.
const TAU=2*Math.PI;
const C=Object.freeze({ivory:0xffedd4,navy:0x26394d,cocoa:0x64473f,thread:0xffe0a4,
  gold:0xdf9b55,rose:0xf3b6c3,sky:0x75bfda,ribbon:0x569aad,silver:0xe7f6f4});
const workshops=new WeakMap();

function pattern(T,profile,depth=.05,bevel=.014){
  const s=new T.Shape();
  profile.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();
  // Geometry is centred: the sewing pattern uses the same coordinates as
  // its decorative inlays. Mirroring is done by rotation, not negative scales.
  return new T.ExtrudeGeometry(s,{depth,steps:1,curveSegments:10,
    bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2}).translate(0,0,-depth/2);
}
function radial(T,n,radii,depth=.055,angle=Math.PI/2){
  return pattern(T,Array.from({length:n},(_,i)=>{
    const a=angle+i*TAU/n,r=radii[i%radii.length];return [Math.cos(a)*r,Math.sin(a)*r];
  }),depth,.02);
}
function crescent(T){
  const s=new T.Shape();s.moveTo(.43,.86);
  s.bezierCurveTo(-.76,1.15,-1.23,-.9,-.04,-.95);
  s.bezierCurveTo(.28,-1.05,.69,-.77,.91,-.40);
  s.bezierCurveTo(.16,-.60,-.32,.21,.43,.86);
  return new T.ExtrudeGeometry(s,{depth:.12,curveSegments:8,bevelEnabled:true,
    bevelThickness:.018,bevelSize:.018,bevelSegments:1}).translate(0,0,-.06);
}
function beveledRing(T,n){
  // Indexed packed lathe profile with no caps at its bore. Light can actually
  // reach the piped rim; the dark centre isn't just a painted dot.
  return new T.LatheGeometry([[.71,-.5],[.92,-.5],[1,-.30],[1,.28],[.9,.5],[.73,.5],[.69,.29],[.69,-.30],[.71,-.5]]
    .map(([r,y])=>new T.Vector2(r,y)),n);
}
function fanLeaf(T){
  // Rounded patchwork panel with parallel cut edges; horizontal panel stitch
  // and ivory ribs are independent layers and remain readable when it spins.
  const p=[[-.035,0],[-.18,.39],[-.19,.70],[-.17,.87],[-.10,.98],[.10,.98],[.17,.87],[.19,.70],[.18,.39],[.035,0]];
  return pattern(T,p,.075,.022);
}
function cleanCapsule(T){
  const g=new T.CapsuleGeometry(.14,.68,3,10),p=g.attributes.position,idx=g.index.array,faces=[];
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  // The built-in seam emits duplicate pole vertices. Keep the good half of
  // each cap quad, not the zero-area triangle, before copying to every rib.
  for(let i=0;i<idx.length;i+=3){
    a.fromBufferAttribute(p,idx[i]);b.fromBufferAttribute(p,idx[i+1]);c.fromBufferAttribute(p,idx[i+2]);
    if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-18)faces.push(idx[i],idx[i+1],idx[i+2]);
  }
  g.setIndex(faces);return g;
}
function workshop(T){
  if(workshops.has(T))return workshops.get(T);
  const rounded=new T.BoxGeometry(1,1,1,3,3,3),p=rounded.attributes.position,n=rounded.attributes.normal;
  const v=new T.Vector3(),q=new T.Vector3(),normal=new T.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);q.copy(v).clampScalar(-.34,.34);
    normal.subVectors(v,q).normalize();v.copy(q).addScaledVector(normal,.16);
    p.setXYZ(i,v.x,v.y,v.z);n.setXYZ(i,normal.x,normal.y,normal.z);
  }
  const g={
    box:rounded,button:new T.SphereGeometry(1,16,10),
    pip:new T.SphereGeometry(1,10,7),tooth:new T.BoxGeometry(1,1,1,1,1,1),
    bobbin:new T.LatheGeometry([[.0001,-.5],[.71,-.5],[1,-.38],[1,-.24],[.70,-.14],[.66,.05],[.69,.17],[1,.28],[1,.4],[.79,.5],[.0001,.5]]
      .map(([r,y])=>new T.Vector2(r,y)),20),
    bottle:new T.LatheGeometry([[.0001,-.5],[.72,-.5],[1,-.28],[.98,.11],[.81,.32],[.45,.42],[.40,.5],[.0001,.5]]
      .map(([r,y])=>new T.Vector2(r,y)),24),
    disc:new T.CylinderGeometry(1,1,1,24),shortDisc:new T.CylinderGeometry(1,1,1,16),
    ring:beveledRing(T,24),microRing:beveledRing(T,14),
    seam:new T.TorusGeometry(1,.12,5,16),
    spoke:cleanCapsule(T),
    fabricStar:radial(T,10,[1,.48]),meteor:radial(T,10,[1,.68]),crescent:crescent(T),leaf:fanLeaf(T),
    arrow:pattern(T,[[-.28,-.54],[.28,-.54],[.28,.24],[.61,.24],[0,1],[-.61,.24],[-.28,.24]],.06),
    flare:pattern(T,[[0,-.83],[-.70,-.30],[-.61,.04],[-.26,.38],[-.146,.9],[.14,.64],[.48,.28],[.62,.03],[.66,-.31],[.40,-.65]],.14),
    lens:pattern(T,[[0,-1],[-.46,-.57],[-.54,.24],[-.31,.65],[0,1],[.31,.65],[.54,.24],[.46,-.57]],.33,.105),
    jaw:pattern(T,[[-.48,-.52],[.42,-.52],[.64,-.25],[.48,.27],[.11,.53],[-.46,.41]],.28,.09),
    bow:pattern(T,[[-.53,-.38],[0,-.22],[.54,-.37],[.65,.32],[.10,.22],[-.54,.41]],.14,.05),
    petal:pattern(T,[[0,-.09],[-.31,.25],[-.39,.56],[-.29,.82],[0,1],[.29,.82],[.39,.56],[.31,.25]],.07,.055)
  };
  const mats=new Map();
  const mat=(color,trim)=>{
    const key=`${color}/${+trim}`;
    if(!mats.has(key))mats.set(key,trim?new T.MeshBasicMaterial({color}):new T.MeshStandardMaterial({color}));
    return mats.get(key);
  };
  const out={g,mat};workshops.set(T,out);return out;
}

export const LOOT_WEAPON_MOTIFS=Object.freeze({
  cannon:'落星芯、三道能量箍、雙掌握把',
  pulse:'星形光芯、織布包邊、救援隊扣章',
  shotgun:'雙棉線軸、兔耳隔片、棉團紋',
  burst:'弓臂、繃線、三枚琺瑯星矢',
  ember:'雙層布風箱、儲熱瓶、火瓣噴嘴',
  bomber:'四孔縫扣、手縫交叉線、備用鈕扣盤',
  moonfan:'交拼扇布、扇骨、刺繡彎月',
  frostwand:'冰晶主杖、六支霜花、圍巾色握柄'
});

/** Parts used only for the first-time ground model bake. */
export function groundWeaponParts(T,id){
  const {g,mat}=workshop(T),root=new T.Group();
  root.name=LOOT_WEAPON_MOTIFS[id];
  const set=(kind,color,xyz,s,rotation=[0,0,0],trim=false)=>{
    const mesh=new T.Mesh(g[kind],mat(color,trim));mesh.name=kind;
    mesh.position.set(...xyz);mesh.scale.set(...s);mesh.rotation.set(...rotation);root.add(mesh);return mesh;
  };
  const {ivory,navy,cocoa,thread,gold,rose,sky,ribbon,silver}=C;
  const shell=(k,c,x,y,z,a,b,d,rot)=>set(k,c,[x,y,z],[a,b,d],rot);
  const pin=(k,c,x,y,z,a,b,d,rot)=>set(k,c,[x,y,z],[a,b,d],rot,true);
  const flat=(kind,color,x,y,z,sx,sy,sz,turn=0)=>pin(kind,color,x,y,z,sx,sy,sz,[-Math.PI/2,0,turn]);
  const barrel=(kind,color,x,y,z,r,len,trim=false)=>set(kind,color,[x,y,z],[r,len,r],[Math.PI/2,0,0],trim);
  const stick=(kind,color,a,b,width,depth=width,trim=false)=>{
    const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2];
    const o=set(kind,color,a.map((v,i)=>(v+b[i])/2),[width,Math.hypot(ax,ay,az),depth],undefined,trim);
    o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(ax,ay,az).normalize());
  };
  const grip=(x,y,z,s,tilt)=>shell('box',navy,x,y,z,.106*s,.173,.116,[tilt,0,-x*.9]);
  const stitch=(x,y,z,l,turn=0,color=thread)=>flat('tooth',color,x,y,z,l,.011,.012,turn);
  switch(id){
    case 'cannon': {
      // Twin soft handles read as a two-paw heavy toy. Three bright coils,
      // not six duplicate bands, leave the saddle and star chamber visible.
      const mint=0x9fe166,deep=0x416b55,pear=0xe1fbb3;
      shell('jaw',deep,0,.013,-.013,.42,.31,.70,[0,Math.PI/2,0]);
      barrel('bottle',mint,0,.045,.138,.195,.276);
      for(const z of [.021,.143,.265])barrel('microRing',z===.143?gold:ivory,0,.045,z,.202,.042,true);
      barrel('ring',mint,0,.045,.323,.192,.071);
      barrel('shortDisc',navy,0,.045,.342,.138,.024);
      pin('meteor',pear,0,.045,.367,.105,.105,.09);
      pin('fabricStar',silver,0,.045,.378,.052,.052,.055);
      for(const s of [-1,1]){
        shell('button',deep,s*.308,.023,-.075,.068,.102,.07);
        shell('seam',mint,s*.322,.028,-.106,.057,.063,.09,[Math.PI*.35,0,s*.17]);
        grip(s*.157,-.153,.006,1.13,-.18);
        shell('box',mint,s*.207,.032,.013,.09,.235,.205,[0,0,-s*.28]);
        shell('box',deep,s*.195,.001,.113,.066,.10,.18);
        pin('button',gold,s*.209,.093,-.071,.040,.048,.026);
        flat('meteor',ivory,s*.117,.197,-.095,.067,.067,.085,s*.25);
        for(const dz of [-.061,.014,.089])stitch(s*.14,.169,dz,.027,-s*.13);
      }
      shell('box',deep,0,.149,-.142,.12,.097,.116);
      const fire=barrel('microRing',pear,0,.04,-.183,.075,.045,true);
      fire.rotation.z=.04;
      break;
    }
    case 'pulse': {
      const blue=0x47b4d0,light=0xa5f7ee,trace=0x64d8e0;
      shell('jaw',blue,0,.029,.032,.29,.242,.52,[0,Math.PI/2,0]);
      shell('box',ivory,0,.144,-.025,.282,.051,.27);
      barrel('bottle',ivory,0,.036,.223,.105,.236);
      barrel('microRing',trace,0,.036,.344,.092,.047,true);
      barrel('shortDisc',navy,0,.036,.359,.063,.016);
      pin('fabricStar',light,0,.036,.370,.047,.047,.1);
      grip(0,-.137,-.084,.9,-.29);
      flat('fabricStar',gold,0,.178,-.037,.074,.074,.10);
      for(const s of [-1,1]){
        pin('box',navy,s*.142,.057,-.035,.015,.059,.156);
        pin('arrow',trace,s*.153,.060,-.032,.044,.064,.09,[0,s*Math.PI/2,s*.2]);
        for(const dz of [-.122,-.086,-.048,.021])stitch(s*.094,.173,dz,.026,s*.18);
      }
      break;
    }
    case 'shotgun': {
      const butter=0xffd288,wood=0x926757,honey=0xe8a65e;
      shell('box',wood,0,.024,-.084,.313,.207,.226);
      shell('box',butter,0,.131,-.067,.287,.047,.226);
      grip(0,-.144,-.117,1.05,-.35);
      for(const s of [-1,1]){
        barrel('bobbin',butter,s*.106,.034,.184,.091,.276);
        // Cream thread wrapped between the bobbin's lips; dark front well and
        // raised cotton wad make two round pores clear from an oblique view.
        barrel('microRing',ivory,s*.106,.034,.195,.078,.152,true);
        for(const z of [.151,.187,.224])barrel('shortDisc',honey,s*.106,.034,z,.081,.013,true);
        barrel('shortDisc',cocoa,s*.106,.034,.325,.060,.018);
        pin('button',ivory,s*.106,.034,.337,.048,.048,.016);
        shell('petal',ivory,s*.042,.119,.103,.071,.121,.15,[0,0,-s*.28]);
        for(const z of [-.117,-.078,-.037])stitch(s*.091,.158,z,.026,s*.2,ivory);
      }
      pin('bow',rose,0,.10,.005,.08,.065,.095);
      flat('meteor',thread,0,.166,-.089,.046,.046,.13);
      break;
    }
    case 'burst': {
      const mint=0x63c49c,velvet=0x448b83,lime=0xcafcaa;
      shell('jaw',velvet,0,.019,.02,.184,.211,.605,[0,Math.PI/2,0]);grip(0,-.138,-.112,.9,-.24);
      shell('box',mint,0,.139,.025,.203,.045,.355);
      // Four rounded joined pieces form actual recurved bow arms; its dark
      // tension string and three arrows sit above, not stamped onto a gun.
      for(const s of [-1,1]){
        stick('spoke',mint,[s*.035,.08,.189],[s*.194,.080,.276],.184,.252);
        stick('spoke',velvet,[s*.178,.08,.276],[s*.303,.080,.156],.161,.223);
        shell('button',gold,s*.302,.080,.157,.033,.036,.040);
        stick('spoke',ivory,[0,.090,-.049],[s*.299,.090,.156],.050,.065,true);
        flat('meteor',ivory,s*.170,.114,.247,.035,.041,.08);
      }
      for(const [x,c] of [[-.060,0x95e3b5],[0,lime],[.060,0x95e3b5]]){
        stick('spoke',navy,[x,.145,-.077],[x,.145,.259],.075,.085);
        flat('arrow',c,x,.163,.245,.044,.075,.175);
        flat('fabricStar',gold,x,.174,-.063,.040,.04,.11);
      }
      for(const z of [-.130,-.105,-.082])stitch(0,.162,z,.06,0,ivory);
      break;
    }
    case 'ember': {
      const russet=0xd45f45,bellows=0xec8055,lit=0xffbc68;
      shell('jaw',cocoa,0,.014,.022,.284,.234,.502,[0,Math.PI/2,0]);
      grip(0,-.152,-.032,1.02,-.2);
      shell('bottle',russet,0,.170,-.119,.121,.258,.118,[0,0,-.13]);
      shell('shortDisc',gold,.008,.292,-.119,.065,.048,.067,[0,0,-.13]);
      pin('flare',thread,.010,.170,-.002,.055,.071,.115);
      // Layered red felt folds and seam-bound plate imitate a tiny fireplace
      // bellows; separate petals curl out around a single glowing centre.
      for(const z of [-.045,.033,.106])shell('jaw',bellows,0,.037,z,.296,.193,.112,[0,Math.PI/2,0]);
      barrel('ring',russet,0,.048,.255,.151,.135);
      barrel('microRing',gold,0,.048,.320,.110,.057,true);
      barrel('shortDisc',cocoa,0,.048,.348,.080,.012);
      for(let i=0;i<5;i++){
        const a=i*TAU/5;
        pin('petal',i%2?thread:lit,.086*Math.sin(a),.048+.086*Math.cos(a),.329,.064,.073,.128,[0,0,-a]);
      }
      pin('flare',lit,0,.052,.368,.045,.058,.117);
      for(const s of [-1,1])for(const dz of [-.054,.02,.087])stitch(s*.106,.128,dz,.029,s*.23,thread);
      break;
    }
    case 'bomber': {
      const amber=0xd09658,wood=0xa5664d,light=0xffc277;
      shell('bottle',wood,0,.009,.065,.190,.332,.19,[Math.PI/2,0,0]);
      shell('box',amber,0,.082,-.078,.261,.147,.167);
      grip(0,-.152,-.060,1.1,-.32);
      barrel('ring',gold,0,.014,.273,.177,.090);
      barrel('shortDisc',light,0,.014,.321,.138,.047,true);
      // Physical raised safety button, four recessed-looking dark knots
      // connected with two rounded cord segments. The rear magazine looks
      // like three spare sew-through buttons, not a grenade.
      for(const x of [-1,1])for(const y of [-1,1]){
        pin('pip',cocoa,x*.049,.014+y*.046,.348,.028,.028,.012);
      }
      stick('spoke',ivory,[-.049,-.029,.359],[.049,.060,.359],.058,.08,true);
      stick('spoke',ivory,[-.049,.060,.361],[.049,-.029,.361],.059,.08,true);
      for(const s of [-1,1]){
        shell('button',amber,s*.116,-.071,.08,.095,.104,.106);
        pin('microRing',ivory,s*.194,-.072,.085,.060,.024,.060,[0,0,Math.PI/2]);
        pin('fabricStar',gold,s*.205,-.072,.085,.039,.039,.12,[0,s*Math.PI/2,0]);
      }
      flat('bow',rose,0,.174,-.060,.099,.062,.11);
      for(const z of [-.134,-.104,-.074])stitch(0,.186,z,.075,0,thread);
      break;
    }
    case 'moonfan': {
      const plum=0x7563a0,lilac=0xaf9adf,pearl=0xe2d2fa,pink=0xe3b7d3;
      shell('spoke',plum,0,-.031,0,.22,.315,.23);
      shell('button',gold,0,-.190,0,.045,.039,.045);
      for(let i=-2;i<=2;i++){
        const a=i*.332;const r=.206;
        shell('leaf',i%2?lilac:plum,-Math.sin(a)*.037,.071,Math.abs(i)*-.002,.557,.403,.32,[0,0,a]);
        // One piece of sewn fabric per panel. Double-sided raised ribs and
        // a sparse dotted border carry the imagery front and back.
        for(const z of [-1,1]){
          stick('tooth',ivory,[Math.sin(-a)*.022,.058,z*.019],[Math.sin(-a)*r,.060+Math.cos(a)*r,z*.024],.011,.010,true);
          if(i)for(let k=0;k<2;k++){
            const dist=.334+k*.030;
            pin('pip',pink,Math.sin(-a)*dist,.071+Math.cos(a)*dist,z*.025,.014,.011,.010);
          }
        }
      }
      for(const z of [-1,1]){
        pin('crescent',thread,.008,.334,z*.038,.102,.106,.18,[0,z<0?Math.PI:0,z*.26]);
        for(const [x,y] of [[-.115,.312],[.112,.341],[.093,.396]]){
          pin('fabricStar',pearl,x,y,z*.032,.024,.024,.10,[0,z<0?Math.PI:0,0]);
        }
      }
      pin('button',gold,0,.066,0,.053,.045,.048);
      shell('bow',pink,-.025,-.062,0,.122,.065,.192,[0,0,-.24]);
      break;
    }
    case 'frostwand': {
      const ice=0x67b9df,deep=0x4d79a9,powder=0xafecf0,cloth=0x429bb4;
      shell('spoke',cloth,0,-.018,0,.22,.381,.22);
      shell('shortDisc',silver,0,.139,0,.045,.048,.045);
      pin('button',ice,0,-.202,0,.037,.035,.035);
      for(const y of [-.156,-.116,-.076,-.036])shell('shortDisc',silver,0,y,0,.039,.017,.039,[0,0,.10]);
      shell('lens',deep,0,.303,0,.257,.175,.294);
      pin('lens',ice,0,.306,0,.200,.157,.331);
      for(const z of [-1,1]){
        pin('lens',powder,0,.307,z*.065,.126,.119,.126,[0,z<0?Math.PI:0,.02]);
        for(let i=0;i<6;i++){
          const a=i*TAU/6;
          const p=[Math.sin(a)*.025,.313+Math.cos(a)*.025,z*.114];
          const q=[Math.sin(a)*.120,.313+Math.cos(a)*.125,z*.117];
          stick('tooth',deep,p,q,.016,.008,true);
          pin('meteor',silver,q[0],q[1],z*.120,.016,.019,.1,[0,z<0?Math.PI:0,a]);
        }
      }
      for(const s of [-1,1])pin('lens',ice,s*.113,.227,0,.088,.073,.206,[0,0,-s*.51]);
      break;
    }
  }
  return root;
}
