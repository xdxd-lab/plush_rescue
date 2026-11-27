// Geometry and label art for ground pickups only. The held toys, projectiles and
// hit envelopes intentionally keep their original meshes and measurements.
export const LABEL_MASTER = Object.freeze({width:1536, height:448, title:180, subtitle:144});
const TAU = Math.PI * 2;

// The original toy surfaces were untextured. A single native 512×512 R8
// relief tile gives their panels a fine woven grain and inset running stitch,
// without network assets or per-item texture copies (~341 KiB with mipmaps).
export function lootRelief(T) {
  const size=512, bytes=new Uint8Array(size*size), thread=new Int8Array(16);
  for(let i=0;i<16;i++)thread[i]=Math.round(11*Math.cos(i*TAU/16));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const vertical=((x>>4)^(y>>4))&1,dist=Math.min(x,y,size-1-x,size-1-y);
    const seam=dist>=28&&dist<34&&(((dist===x||dist===size-1-x)?y:x)%36)<24;
    bytes[y*size+x]=128+thread[(vertical?x:y)&15]+(seam?68:0);
  }
  const map=new T.DataTexture(bytes,size,size,T.RedFormat);
  map.wrapS=map.wrapT=T.RepeatWrapping;map.minFilter=T.LinearMipmapLinearFilter;
  map.magFilter=T.LinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
}

function projectUv(T,g){
  const a=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(a.count*2);
  g.computeBoundingBox();const lo=g.boundingBox.min,hi=g.boundingBox.max;
  for(let i=0;i<a.count;i++){
    const x=(a.getX(i)-lo.x)/(hi.x-lo.x||1),y=(a.getY(i)-lo.y)/(hi.y-lo.y||1),z=(a.getZ(i)-lo.z)/(hi.z-lo.z||1);
    const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    uv[2*i]=nx>ny&&nx>nz?z:x;uv[2*i+1]=ny>nx&&ny>nz?z:y;
  }
  g.setAttribute('uv',new T.BufferAttribute(uv,2));return g;
}
function roundedBox(T) {
  const box = new T.BoxGeometry(1, 1, 1, 2, 2, 5);
  const p=box.attributes.position, n=box.attributes.normal;
  const v=new T.Vector3(), inset=new T.Vector3(), delta=new T.Vector3();
  for (let i=0;i<p.count;i++) {
    v.fromBufferAttribute(p,i);
    inset.copy(v).clampScalar(-.34,.34);
    delta.subVectors(v,inset).normalize();
    v.copy(inset).addScaledVector(delta,.16);
    p.setXYZ(i,v.x,v.y,v.z); n.setXYZ(i,delta.x,delta.y,delta.z);
  }
  return box;
}

// A single pole vertex and a single index seam avoid coincident pole triangles.
// Each profile entry describes radius, height and optional angular stagger.
function turned(T, sides, profile, faceted=false) {
  const xyz=[], indices=[], rows=[];
  for(const [r,y,offset=0] of profile){
    const row=[];
    for(let i=0;i<(r?sides:1);i++){
      const angle=(i+offset)*TAU/sides;
      row.push(xyz.length/3);xyz.push(r*Math.cos(angle),y,r*Math.sin(angle));
    }
    rows.push(row);
  }
  for(let j=1;j<rows.length;j++){
    const lo=rows[j-1],hi=rows[j];
    for(let i=0;i<sides;i++){
      const k=(i+1)%sides;
      if(lo.length===1)indices.push(lo[0],hi[i],hi[k]);
      else if(hi.length===1)indices.push(lo[i],hi[0],lo[k]);
      else indices.push(lo[i],hi[i],lo[k],lo[k],hi[i],hi[k]);
    }
  }
  let g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setIndex(indices);
  if(faceted)g=g.toNonIndexed();
  g.computeVertexNormals();return projectUv(T,g);
}

function enamel(T, shape, curves=8) {
  // Shallow domed faces and bevels make even a mostly-flat reward glyph catch light
  // at an oblique camera angle. Centring the emboss keeps the tap envelope intact.
  return new T.ExtrudeGeometry(shape,{depth:.07,steps:1,curveSegments:curves,
    bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:1}).translate(0,0,-.035);
}
function polygon(T, points) {
  const s=new T.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;
}
function pointsAround(count,radii,angle=Math.PI/2) {
  return Array.from({length:count},(_,i)=>{
    const a=angle+i*TAU/count,r=radii[i%radii.length];return [Math.cos(a)*r,Math.sin(a)*r];
  });
}
function foldedFan(T){
  // Eight creases cross four concentric tiers. The outer edge is scalloped.
  const p=[0,-.05,0],ind=[],radii=[.17,.47,.72,1],segments=18;
  for(let row=0;row<radii.length;row++)for(let i=0;i<=segments;i++){
    const a=-1.1+2.2*i/segments,r=radii[row]*(row===3&&i%2?.955:1);
    p.push(Math.sin(a)*r,Math.cos(a)*r,(i%2?-.45:.45)*r);
    if(i===segments)continue;
    const k=1+row*(segments+1)+i;
    if(!row)ind.push(0,k+1,k);
    else{const prev=k-(segments+1);ind.push(prev,prev+1,k,k,prev+1,k+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ind);
  const flat=g.toNonIndexed();flat.computeVertexNormals();return projectUv(T,flat);
}
function diamondMarker(T){
  const path=new T.CurvePath(), corners=Array.from({length:4},(_,i)=>new T.Vector3(Math.cos(i*Math.PI/2),Math.sin(i*Math.PI/2),0));
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4],c=corners[(i+2)%4];
    const start=a.clone().lerp(b,.08),end=b.clone().lerp(a,.08),next=b.clone().lerp(c,.08);
    path.add(new T.LineCurve3(start,end));path.add(new T.QuadraticBezierCurve3(end,b,next));
  }
  return new T.TubeGeometry(path,32,.06,5,true);
}

export function lootGeometry(T, keep) {
  const heart=new T.Shape();heart.moveTo(0,-.9);heart.bezierCurveTo(-1.5,.1,-.8,1.25,0,.55);heart.bezierCurveTo(.8,1.25,1.5,.1,0,-.9);
  const shapes={
    star:polygon(T,pointsAround(10,[1,.43])), bolt:polygon(T,[[-.05,1],[-.65,-.12],[-.1,-.12],[-.35,-1],[.7,.27],[.1,.27]]),
    arrow:polygon(T,[[-1,-.2],[.25,-.2],[.25,-.65],[1,0],[.25,.65],[.25,.2],[-1,.2]]),heart,
    // Open horseshoe, compass sparkle, flower and folded quilt: four rewards
    // which the earlier renderer inadvertently displayed with one generic star.
    magnet:polygon(T,[[-.86,.78],[-.39,.78],[-.39,-.18],[-.24,-.43],[.24,-.43],[.39,-.18],[.39,.78],[.86,.78],[.86,-.20],[.62,-.66],[.27,-.88],[-.27,-.88],[-.62,-.66],[-.86,-.20]]),
    crit:polygon(T,pointsAround(8,[1,.28])),
    reach:polygon(T,pointsAround(20,[.47,.89,.98,.71])),
    guard:polygon(T,[[-.83,.77],[.50,.77],[.82,.48],[.82,-.65],[.55,-.80],[.28,-.62],[0,-.80],[-.28,-.62],[-.56,-.80],[-.83,-.65]])
  };
  const d={
    box:keep(roundedBox(T)),ball:keep(new T.SphereGeometry(1,32,22)),
    tube:keep(turned(T,48,[[0,-.5],[.88,-.5],[1,-.32],[1,.32],[.88,.5],[0,.5]])),
    cone:keep(turned(T,32,[[0,-.5],[.88,-.5],[1,-.43],[.18,.37],[0,.5]])),
    crystal:keep(turned(T,8,[[0,-1],[.53,-.48,0],[1,-.09,.5],[.96,.16,.5],[.57,.55,0],[0,1]],true)),
    fan:keep(foldedFan(T)),ring:keep(new T.TorusGeometry(1,.045,10,160)),diamondRing:keep(diamondMarker(T))
  };
  for(const [id,shape] of Object.entries(shapes))d[id]=keep(enamel(T,shape));
  return d;
}

// A ground weapon is rigid: the pieces can be transformed once into two
// indexed buffers (soft shell and lit enamel), instead of a draw per screw.
export function bakeToy(T,group,detail,base,shared,keep){
  const buckets=[{p:[],n:[],c:[],uv:[],i:[]},{p:[],n:[],c:[],uv:[],i:[]}];
  const substitute=new Map(Object.entries(detail).map(([key,g])=>[base[key],g]));
  const p=new T.Vector3(),n=new T.Vector3(),normalMatrix=new T.Matrix3();
  group.updateMatrixWorld(true);
  group.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    const g=substitute.get(mesh.geometry)??mesh.geometry, mat=mesh.material, b=buckets[mat.isMeshBasicMaterial?1:0], first=b.p.length/3;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for(let i=0;i<g.attributes.position.count;i++){
      p.fromBufferAttribute(g.attributes.position,i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(g.attributes.normal,i).applyNormalMatrix(normalMatrix);
      b.p.push(p.x,p.y,p.z);b.n.push(n.x,n.y,n.z);b.uv.push(g.attributes.uv.getX(i),g.attributes.uv.getY(i));
      b.c.push(Math.round(255*mat.color.r),Math.round(255*mat.color.g),Math.round(255*mat.color.b));
    }
    if(g.index){for(const idx of g.index.array)b.i.push(first+idx);}
    else for(let i=0;i<g.attributes.position.count;i++)b.i.push(first+i);
  });
  const toy=new T.Group();
  for(let index=0;index<2;index++){
    const b=buckets[index];if(!b.i.length)continue;
    const g=keep(new T.BufferGeometry());
    g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));
    g.setAttribute('color',new T.Uint8BufferAttribute(b.c,3,true));g.setIndex(b.i);g.computeBoundingSphere();
    const mesh=new T.Mesh(g,shared[index]);mesh.name=index?'Enamel inlays':'Soft toy shell';toy.add(mesh);
  }
  return toy;
}

// The sampler contains only glyph coverage. Panel, border and type colours
// are reconstructed in the sprite shader, so a genuine 4x-by-4x master needs
// one byte per texel rather than RGBA. The mip chain filters at phone sizes.
function installPanelShader(mat) {
  mat.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 uv=vMapUv;
      float ink=texture2D(map,uv).r;
      vec2 p=(uv-.5)*vec2(384.,112.);
      vec2 q=abs(p)-vec2(182.,46.);
      float edge=length(max(q,0.))+min(max(q.x,q.y),0.)-7.;
      float aa=max(.55,fwidth(edge));
      float inside=1.-smoothstep(-aa,aa,edge);
      float rim=smoothstep(-4.-aa,-4.+aa,edge);
      vec3 paper=mix(vec3(.012,.021,.035),vec3(.025,.041,.055),uv.y);
      vec3 hue=diffuseColor.rgb;
      vec3 type=mix(hue,vec3(.99,.94,.80),step(.46,uv.y));
      diffuseColor.rgb=mix(mix(paper,hue*.72,rim),type,ink);
      diffuseColor.a*=inside*.98;
    `);
  };
  return mat;
}

export function drawLabelMask(ctx,title,subtitle){
  const {width,height,title:headline,subtitle:small}=LABEL_MASTER;
  ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
  ctx.font=`bold ${headline}px sans-serif`;ctx.fillText(title,width/2,subtitle?148:224,1424);
  if(subtitle){ctx.font=`bold ${small}px sans-serif`;ctx.fillText(subtitle,width/2,332,1424);}
}

// Reuse one staging canvas, retain compact R8 data so WebGL context restore
// can reupload it, and keep at most the currently visible keys plus a small
// reuse window. Any evicted key is reconstructed from the original vectors.
export function lootLabels(T,makeMaterial){
  const cache=new Map(), max=8;
  let canvas=null,ctx=null,failed=false,privateCanvas=false,serial=0;
  const placeholder=new T.DataTexture(new Uint8Array([0]),1,1,T.RedFormat);
  placeholder.needsUpdate=true;
  const fallback=makeMaterial(installPanelShader(new T.SpriteMaterial({map:placeholder,color:0xe9d5a5,transparent:true,depthWrite:false,fog:false})));
  function raster(title,subtitle){
    const {width:w,height:h}=LABEL_MASTER;
    if(!privateCanvas){
      if(!canvas){
        canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        ctx=canvas.getContext('2d',{willReadFrequently:true});
      }
      if(!ctx)return null;
      drawLabelMask(ctx,title,subtitle);
      let rgba;
      try{rgba=ctx.getImageData(0,0,w,h).data;}catch{
        // Privacy settings can forbid reading pixels without forbidding text
        // drawing. Keep the original readable density instead of a blank tag.
        privateCanvas=true;canvas.width=canvas.height=1;canvas=ctx=null;
      }
      if(rgba){
        const red=new Uint8Array(w*h);
        for(let y=0;y<h;y++){
          // DataTexture rows start at bottom left, unlike the source canvas.
          let src=(h-1-y)*w*4,dst=y*w;
          for(let x=0;x<w;x++,src+=4)red[dst+x]=rgba[src];
        }
        return new T.DataTexture(red,w,h,T.RedFormat);
      }
    }
    const small=document.createElement('canvas');small.width=w/4;small.height=h/4;
    const brush=small.getContext('2d');if(!brush)return null;
    brush.scale(.25,.25);drawLabelMask(brush,title,subtitle);return new T.CanvasTexture(small);
  }
  function get(key,title,subtitle,color){
    const existing=cache.get(key);
    if(existing){existing.seen=++serial;return existing.material;}
    if(failed||typeof document==='undefined')return fallback;
    try{
      const texture=raster(title,subtitle);if(!texture){failed=true;return fallback;}
      if(cache.size===max){
        // Scan at most eight entries on a rare miss, rather than mutating a
        // Map (and allocating tombstones) on every rendered label every frame.
        let oldestKey=null,age=Infinity;
        for(const [id,item] of cache)if(item.seen<age){oldestKey=id;age=item.seen;}
        const old=cache.get(oldestKey);old.texture.dispose();old.material.dispose();cache.delete(oldestKey);
      }
      texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
      texture.generateMipmaps=true;texture.needsUpdate=true;
      const material=installPanelShader(new T.SpriteMaterial({map:texture,color,transparent:true,depthWrite:false,fog:false}));
      cache.set(key,{texture,material,seen:++serial});return material;
    }catch{failed=true;return fallback;}
  }
  return {get,fallback,get size(){return cache.size;}};
}
