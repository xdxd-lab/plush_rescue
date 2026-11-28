// The rescue team's pocket-sized keepsakes, authored in the XY plane; +Z is
// the presentation face. These are rigid objects (seams, pockets and hardware
// are real geometry). Bake once per design into the two existing ground finishes.
export function buildRewardDetail(T, id, keep) {
  const tau=Math.PI*2, v=(a)=>new T.Vector3(...a);
  const parts=[[],[]], palette=new Map();
  const ink='#30344b', thread='#ffebc8', gold='#e9aa57', brass='#a26641', brassLight='#ffe0a0';
  function place(g,clr,bucket=0,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0]) {
    g.applyMatrix4(new T.Matrix4().compose(v(pos),new T.Quaternion().setFromEuler(new T.Euler(...rot)),v(scale)));
    parts[bucket].push([g,clr]);
  }
  const disk=(x,y,z,rx,ry,thick,clr,b=1,n=20)=>
    place(new T.CylinderGeometry(1,1,thick,n),clr,b,[x,y,z],[rx,1,ry],[Math.PI/2,0,0]);
  // Use a proper rounded rim instead of coincident flat colour layers.
  const ring=(x,y,z,rx,ry,r,clr,b=1,n=28)=>{
    const g=new T.TorusGeometry(1,r,6,n);place(g,clr,b,[x,y,z],[rx,ry,Math.min(rx,ry)]);
  };
  const puff=(x,y,z,rx,ry,rz,clr,b=0,n=12)=>
    place(new T.SphereGeometry(1,n,8),clr,b,[x,y,z],[rx,ry,rz]);
  function stroke(points,r,clr,b=0,segs=0) {
    if(points.length<2)return;
    const line=points.length===2?new T.LineCurve3(v(points[0]),v(points[1])):new T.CatmullRomCurve3(points.map(v),false,'centripetal');
    place(new T.TubeGeometry(line,segs||Math.max(1,(points.length-1)*2),r,5,false),clr,b);
  }
  function cut(points,z,depth,clr,b=0,bevel=.025) {
    const sh=new T.Shape();points.forEach(([x,y],i)=>i?sh.lineTo(x,y):sh.moveTo(x,y));sh.closePath();
    const g=new T.ExtrudeGeometry(sh,{depth,steps:1,bevelEnabled:bevel>0,
      bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:6});
    place(g,clr,b,[0,0,z]);
  }
  const scaled=(ps,sx,sy,ox=0,oy=0)=>ps.map(([x,y])=>[x*sx+ox,y*sy+oy]);
  function star(cx,cy,r,inner,count=5,offset=Math.PI/2) {
    return Array.from({length:count*2},(_,i)=>[cx+(i%2?inner:r)*Math.cos(offset+i*Math.PI/count),cy+(i%2?inner:r)*Math.sin(offset+i*Math.PI/count)]);
  }
  function stitches(points, width=.019,colour=thread,spacing=.17) {
    const path=new T.CatmullRomCurve3(points.map(v),false,'centripetal'), n=Math.max(1,Math.round(path.getLength()/spacing));
    for(let i=0;i<n;i++)stroke([path.getPointAt((i+.14)/n).toArray(),path.getPointAt((i+.68)/n).toArray()],width,colour);
  }
  const arc=(x,y,z,rx,ry,a0,a1,n=15)=>Array.from({length:n+1},(_,i)=>{
    const a=a0+(a1-a0)*i/n;return [x+rx*Math.cos(a),y+ry*Math.sin(a),z];});
  // Four recessed looking eyes crossed by cream thread make a recognisable
  // sewing button even when it is used as a hinge, wheel cap or buckle.
  function button(x,y,z,r,c,eyes=true){
    disk(x,y,z,r,r,.08,c);ring(x,y,z+.05,r*.81,r*.81,.075,brassLight);
    if(!eyes)return;
    for(const dx of [-1,1])for(const dy of [-1,1])disk(x+dx*r*.27,y+dy*r*.27,z+.047,r*.12,r*.12,.018,ink,0,8);
    for(const s of [-1,1])stroke([[x-r*.27,y+s*r*.27,z+.065],[x+r*.27,y-s*r*.27,z+.065]],r*.075,thread);
  }
  const heart=Array.from({length:32},(_,i)=>{
    const a=i*tau/32;return [Math.pow(Math.sin(a),3),(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/16];});
  switch(id){
    case 'power': { // Warm light: a real heart lantern with rolled cage and bail.
      const dark='#653a4d',apricot='#ef8b58';
      stroke([[-.30,.47,0],[-.35,.78,0],[-.18,.97,0],[.14,.99,0],[.34,.78,0],[.28,.53,0]],.055,brass,1);
      const shade=[[-.48,.51],[-.34,.68],[.34,.68],[.48,.51],[.60,.37],[-.60,.37]];
      cut(shade,-.20,.38,dark,0,.045);
      cut([[-.44,.30],[-.54,.12],[-.39,-.56],[.36,-.56],[.54,.12],[.43,.30]],-.245,.44,'#efb259',1,.045);
      cut(scaled(heart,.32,.33,0,-.07),.235,.072,'#ffefad',1,.035);
      for(const s of [-1,1]){stroke([[s*.46,.35,.19],[s*.47,.06,.22],[s*.34,-.54,.21]],.055,dark);
        puff(s*.45,.33,.21,.075,.075,.053,gold,1);}
      cut([[-.48,-.49],[-.51,-.61],[-.32,-.75],[.31,-.75],[.51,-.61],[.47,-.49]],-.22,.43,dark,0,.045);
      stroke([[-.44,-.56,.24],[.44,-.56,.24]],.033,gold,1);
      stitches([[-.41,.47,.215],[0,.52,.215],[.41,.47,.215]],.019,thread);
      break;
    }
    case 'rate': { // Star-stamped winding escapement; stepped radial teeth and a key.
      const teeth=[]; for(let i=0;i<12;i++)for(const [d,r] of [[0,.73],[.18,.81],[.58,.81],[.76,.73]]){
        const a=tau*(i+d)/12;teeth.push([r*Math.cos(a),r*Math.sin(a)-.07]);}
      cut(teeth,-.21,.31,brass,1,.013);
      disk(0,-.07,.10,.675,.675,.13,ink,0);ring(0,-.07,.18,.61,.61,.085,gold);
      disk(0,-.07,.175,.55,.55,.06,'#328287',0);
      for(let i=0;i<12;i++){const a=i*tau/12,r0=i%3?.45:.39;
        stroke([[r0*Math.sin(a),-.07+r0*Math.cos(a),.23],[.50*Math.sin(a),-.07+.50*Math.cos(a),.23]],i%3?.016:.025,thread,1);}
      cut([[-.09,.38],[-.31,-.10],[-.05,-.10],[-.17,-.45],[.32,.04],[.07,.04],[.20,.38]],.239,.056,'#ffdb61',1,.013);
      for(const x of [-.31,.03,.37])cut(star(x,-.02+Math.sqrt(Math.max(0,.68*.68-x*x)),.074,.030),.18,.042,brassLight,1,.003);
      stroke([[.38,.54,0],[.64,.84,0]],.068,brass,1);
      for(const [x,y] of [[.52,.91],[.75,.72]])ring(x,y,0,.16,.105,.27,gold);
      break;
    }
    case 'speed': { // Courier boot: real sole, cuff, tied laces and feather vanes.
      const boot=[[-.74,-.20],[-.62,-.16],[-.55,.44],[-.22,.52],[.12,.41],[.12,.08],[.39,-.13],[.70,-.18],[.84,-.33],[.78,-.46],[-.68,-.48]];
      cut(boot,-.23,.40,'#498b72',0,.055);
      cut([[-.76,-.42],[.78,-.42],[.86,-.34],[.83,-.53],[.61,-.62],[-.65,-.62],[-.80,-.55]],-.245,.43,'#563f49',0,.043);
      stroke([[-.70,-.46,.245],[-.33,-.49,.245],[.45,-.49,.245],[.77,-.41,.245]],.044,'#f3c78b');
      cut([[-.59,.56],[.12,.54],[.14,.34],[-.58,.33]],-.24,.42,'#a9dfab',0,.028);
      cut([[-.05,-.22],[-.35,-.14],[-.88,.28],[-.57,.22],[-.91,.55],[-.61,.48],[-.76,.74],[-.40,.60],[-.15,.25]],.247,.05,'#e8efcc',0,.024);
      stroke([[-.11,-.13,.315],[-.36,.16,.324],[-.73,.56,.319]],.024,'#8fba91');
      for(let i=0;i<3;i++){const x=.04+i*.13,y=.20-i*.095;disk(x,y,.22,.045,.045,.05,gold);
        stroke([[x-.06,y+.04,.28],[x+.12,y-.02,.28]],.026,thread);}
      stitches([[-.57,-.34,.22],[-.19,-.32,.22],[.39,-.32,.22],[.62,-.25,.22]],.018);
      break;
    }
    case 'heart': { // Stuffed heart with a cross-stitched repair and cotton showing.
      cut(scaled(heart,.77,.72),-.19,.36,'#cb5b78',0,.072);
      const seam=scaled(heart,.699,.644).map(p=>[...p,.227]);seam.push(seam[0]);
      stitches(seam,.021,'#ffcdba',.19);
      cut([[-.03,.06],[.38,.23],[.52,-.15],[.08,-.32]],.225,.037,'#f7c4a1',0,.02);
      for(let j=0;j<3;j++){const x=.067+.105*j,y=-.03+.049*j;
        stroke([[x-.05,y-.07,.29],[x+.05,y+.07,.29]],.017,'#9f5164');stroke([[x-.05,y+.045,.29],[x+.05,y-.065,.29]],.017,'#9f5164');}
      const rip=[[-.51,.22,.25],[-.37,.09,.27],[-.39,-.05,.27],[-.22,-.19,.25]];stroke(rip,.030,'#9c405f');
      for(let j=0;j<3;j++)stroke([[-.51+j*.08,.12-j*.115,.29],[-.33+j*.08,.20-j*.115,.29]],.028,thread);
      // Brass eyelet pins the applied patch; actual batting peeks through the upper seam.
      ring(.39,.137,.277,.043,.043,.32,brassLight,1,12);
      for(const [x,y,r] of [[.44,.43,.12],[.54,.40,.10],[.47,.49,.082]])puff(x,y,.225,r,r,r*.72,'#fff0db');
      break;
    }
    case 'magnet': { // Padded U, separate enamel pole shoes and cotton attracted across the gap.
      const outer=arc(0,-.05,0,.73,.66,Math.PI,2*Math.PI,18).map(p=>p.slice(0,2)),
        inner=arc(0,-.03,0,.30,.30,2*Math.PI,Math.PI,16).map(p=>p.slice(0,2));
      cut([[-.73,.60],...outer,[.73,.60],[.30,.60],...inner,[-.30,.60]],-.17,.32,'#cc5062',0,.033);
      for(const side of [-1,1]){const x=side*.515;
        cut([[x-.23,.38],[x+.23,.38],[x+.23,.63],[x-.23,.63]],-.2,.38,side<0?'#a8d9dc':'#fbd5b5',1,.026);
        stroke([[x-.105,.51,.212],[x+.105,.51,.212]],.023,ink,1);
        if(side<0)stroke([[x,.41,.214],[x,.61,.214]],.023,ink,1);}
      stitches(arc(0,-.06,.202,.56,.50,Math.PI,2*Math.PI,14),.018,thread,.14);
      for(const [x,y,r,c] of [[-.12,.69,.15,'#fff1d9'],[.04,.76,.17,'#fbe3ce'],[.16,.65,.12,'#fff5e8'],[.05,.59,.13,'#f5d6cd'],[-.25,.27,.07,'#fff0e1']])puff(x,y,.005,r,r,r,c);
      break;
    }
    case 'crit': { // A lucky shooting star rosette, with split tails and a sewn button.
      const ribbon=[[-.55,-.24],[-.12,-.37],[-.32,-.91],[-.43,-.72],[-.63,-.79]];
      cut(ribbon,-.14,.13,'#639bb1',0,.021);cut(ribbon.map(([x,y])=>[-x,y+.09]),-.16,.13,'#d47473',0,.021);
      for(const s of [-1,1])stitches([[s*.46,-.41,.015],[s*.41,-.57,.015],[s*.37,-.71,.015]],.018);
      const starBody=star(0,.10,.81,.39);cut(starBody,-.17,.27,'#c28347',1,.048);
      cut(scaled(starBody,.87,.87,0,.013),.13,.072,'#f4ca64',0,.032);
      const stitchesLoop=scaled(starBody,.77,.77,0,.025).map(p=>[...p,.24]);stitchesLoop.push(stitchesLoop[0]);
      stitches(stitchesLoop,.016,'#a8754e',.14);
      button(0,.09,.25,.21,'#4e8592');
      break;
    }
    case 'reach': { // Two embracing padded arms leave an actual open circle.
      const arms=[[-1,'#9b82c3','#685889'],[1,'#d795b5','#b4678d']];
      for(const [s,col,shade] of arms){
        const path=[[s*.15,.64,-.04],[s*.52,.52,0],[s*.70,.18,0],[s*.67,-.24,0],[s*.44,-.50,.035],[s*.14,-.58,.075]];
        stroke(path,.175,col,0,22);
        stitches(path.map(([x,y,z])=>[x,y,z+.164]),.017,thread,.18);
        // Paw palms and individual raised toe pads, not a painted flower.
        const x=s*.19,y=-.50;
        puff(x,y,.14,.24,.22,.12,'#f4dac2');
        puff(x,y-.05,.262,.101,.073,.024,shade);
        for(const d of [-1,0,1])puff(x+d*.078,y+.074-(d?0.024:0),.246,.041,.05,.024,shade);
      }
      cut(star(0,.62,.19,.09,6),-.035,.17,'#f3cf81',1,.022);
      ring(0,.86,0,.11,.14,.23,brass);break;
    }
    case 'guard': { // A folded quilt with a rolled binding, distinct squares and fringe.
      const base=[[-.72,.47],[.62,.47],[.75,.31],[.64,-.57],[-.68,-.57],[-.79,-.40]];
      cut(base,-.26,.32,'#397c89',0,.035);
      for(let j=0;j<2;j++)for(let i=0;i<3;i++){
        const x=-.69+i*.44,y=-.47+j*.39,c=['#85c8c6','#edce99','#548d9e','#b1d8c2','#749fa8','#e7b8a0'][j*3+i];
        cut([[x,y],[x+.412,y],[x+.426,y+.36],[x+.017,y+.36]],.076,.053,c,0,.016);
      }
      for(let i=0;i<4;i++){const x=-.63+i*.39;
        stitches([[x,-.44,.165],[x+.035,-.03,.166],[x+.047,.26,.166]],.015,thread,.14);}
      for(let i=0;i<8;i++){const x=-.62+i*.169;stroke([[x,-.54,.035],[x+.018,-.64,.048],[x-.007,-.74+.045*(i%3),.046]],.023,i%2?'#e9c78d':'#a4d0bc');}
      // A transverse fabric roll gives the silhouette a cylindrical top edge.
      const roll=new T.CylinderGeometry(.155,.155,1.48,16);roll.rotateZ(Math.PI/2);place(roll,'#82bbb3',0,[0,.48,-.012]);
      for(const x of [-.53,.44]){const band=new T.CylinderGeometry(.167,.167,.13,16);band.rotateZ(Math.PI/2);place(band,'#b77b52',0,[x,.48,-.012]);}
      for(const side of [-1,1]){
        const path=[];for(let i=0;i<=27;i++){const a=i*.30,r=.012+i*.004;path.push([side*.747,.48+r*Math.sin(a),-.012+r*Math.cos(a)]);}
        stroke(path,.012,'#416e75',0,30);
      }
      cut(star(-.442,.10,.149,.07,4),.149,.023,'#fff4cd',1,.006);break;
    }
    default: throw new Error('Unknown skill reward: '+id);
  }
  // Preserve indexed buffers, normal seams and the shared relief texture. Throw
  // away zero-area cap/bevel triangles and dispose temporary modelling pieces.
  return parts.map(bucket=>{
    const xyz=[],norm=[],colors=[],uv=[],idx=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
    for(const [g,col] of bucket){
      const pos=g.attributes.position,ns=g.attributes.normal,tex=g.attributes.uv,first=xyz.length/3;
      let colour=palette.get(col);if(!colour){colour=new T.Color(col);palette.set(col,colour);}
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        xyz.push(x*.383,y*.383+.045,z*.383);norm.push(ns.getX(i),ns.getY(i),ns.getZ(i));
        uv.push(tex?.getX(i)??x,tex?.getY(i)??y);colors.push(Math.round(255*colour.r),Math.round(255*colour.g),Math.round(255*colour.b));
      }
      const inds=g.index?.array,total=inds?.length??pos.count;
      for(let j=0;j<total;j+=3){const k=inds?inds[j]:j,l=inds?inds[j+1]:j+1,m=inds?inds[j+2]:j+2;
        a.fromBufferAttribute(pos,k);b.fromBufferAttribute(pos,l);c.fromBufferAttribute(pos,m);
        if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-14)idx.push(first+k,first+l,first+m);}
      g.dispose();
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));
    g.setAttribute('color',new T.Uint8BufferAttribute(colors,3,true));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);
    g.computeBoundingSphere();return keep(g);
  });
}
