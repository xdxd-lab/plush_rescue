// Warm, weathered toy-town dioramas. Decorative dressing is batched, and only
// the six substantial interior features collide with the player and enemies.
export const MAPS = [
  { id: 'courtyard', name: 'Buttonwood Courtyard', subtitle: 'A little town. A very big problem.', color: '#daae84' },
  { id: 'greenhouse', name: 'The Glass Gardens', subtitle: 'Something strange is growing here.', color: '#87bda5' },
  { id: 'park', name: 'Moonbeam Midway', subtitle: 'The fun never quite left.', color: '#aa9bc9' }
];

export function buildMap(THREE, scene, index = 0) {
  index = ((index % 3) + 3) % 3;
  const group = new THREE.Group(); group.name = `map-${MAPS[index].id}`; scene.add(group);
  const obstacles = [], materials = new Map(), geometries = new Map(), textures = [], batches = new Map();
  let seed = 871923 + index * 12891;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const choose = a => a[Math.floor(rand() * a.length)];
  const palettes = [
    { floor: '#87938e', grout: '#5c6965', moss: '#697c45', leaf: '#7b8e48', darkLeaf: '#465b3a', stone: '#aaa995', wood: '#9e7952', accent: '#bc948a', metal: '#58676a', cloth: '#809898' },
    { floor: '#84958a', grout: '#536960', moss: '#6d8450', leaf: '#80a054', darkLeaf: '#415f45', stone: '#a5ad96', wood: '#9a805c', accent: '#c59b75', metal: '#47756b', cloth: '#9aada0' },
    { floor: '#92928f', grout: '#666c6b', moss: '#738254', leaf: '#879852', darkLeaf: '#4f6550', stone: '#b3aaa0', wood: '#a18468', accent: '#b78794', metal: '#667888', cloth: '#b39bad' }
  ];
  const p = palettes[index];
  const lighting = [
    { background: '#929b91', fogNear: 38, fogFar: 75, exposure: 1.04, hemi: { sky: '#fff1d9', ground: '#566c70', intensity: 1.38 }, sun: { color: '#ffe2b0', intensity: 3.15 }, rim: { color: '#cfebef', intensity: .66 } },
    { background: '#667f73', fogNear: 34, fogFar: 68, exposure: 1.00, hemi: { sky: '#dbefda', ground: '#43584b', intensity: 1.48 }, sun: { color: '#f5e8c6', intensity: 2.30 }, rim: { color: '#aee4d5', intensity: .74 } },
    { background: '#17273f', fogNear: 27, fogFar: 62, exposure: 1.08, hemi: { sky: '#839fd2', ground: '#222e49', intensity: .72 }, sun: { color: '#a2baf0', intensity: .92 }, rim: { color: '#8eaaff', intensity: 1.14 }, fill: { color: '#c7daf1', intensity: .82 } }
  ][index];
  // Canvas generation has a Node-safe fallback for headless construction tests.
  const canvasTexture = (size, draw) => {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    const layoutSeed = seed;
    try { draw(ctx, size); } finally { seed = layoutSeed; }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; textures.push(t); return t;
  };
  const grain = (ctx, s, n, warm = false) => {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = rand() < .54 ? `rgba(36,39,32,${.025 + rand() * .10})` : `rgba(${warm ? '244,219,175' : '238,238,215'},${.03 + rand() * .1})`;
      const x = rand() * s, y = rand() * s, r = .3 + rand() * 1.2;
      ctx.fillRect(x, y, r * (1 + rand()), r);
    }
  };
  const groundTexture = canvasTexture(2048, (c, s) => {
    c.fillStyle = p.grout; c.fillRect(0, 0, s, s); const n = 20, step = s / n;
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
      const x = col * step + 1.6, y = row * step + 1.6, w = step - 3.2;
      const light = (index === 2 ? 31 : index === 1 ? 43 : 49) + rand() * (index === 2 ? 5 : 11), hue = index === 1 ? 32 : index === 2 ? 213 : 156;
      c.fillStyle = `hsl(${hue + rand() * 10},${(index === 0 ? 7 : 15) + rand() * 7}%,${light}%)`; c.fillRect(x, y, w, w);
      c.strokeStyle = 'rgba(223,223,198,.32)'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(x, y + w); c.lineTo(x, y); c.lineTo(x + w, y); c.stroke();
      c.strokeStyle = 'rgba(49,61,56,.28)'; c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w, y + w); c.lineTo(x, y + w); c.stroke();
      for (let k = 0; k < 8; k++) {
        const px = x + rand() * w, py = y + rand() * w, r = 2 + rand() * 12;
        c.fillStyle = choose(['rgba(222,210,172,.12)', 'rgba(230,223,192,.2)', 'rgba(63,80,70,.08)']);
        c.beginPath(); for (let a = 0; a < 8; a++) { const r2 = r * (.4 + rand() * .6); const xx = px + Math.cos(a * Math.PI / 4) * r2, yy = py + Math.sin(a * Math.PI / 4) * r2; a ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.closePath(); c.fill();
      }
      if (rand() < .49) {
        let xx = x + rand() * w, yy = y; c.strokeStyle = 'rgba(40,52,47,.48)'; c.lineWidth = .7 + rand() * .7;
        c.beginPath(); c.moveTo(xx, yy); for (let k = 0; k < 4; k++) { xx += (rand() - .5) * 24; yy += 6 + rand() * 16; c.lineTo(xx, yy); } c.stroke();
        c.strokeStyle = 'rgba(223,220,190,.31)'; c.translate(1, 0); c.stroke(); c.translate(-1, 0);
      }
      for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(194,190,161,.54)'; c.fillRect(x + rand() * w, rand() < .5 ? y : y + w - 1, 1 + rand() * 5, 1 + rand() * 2); }
      if (rand() < .66) {
        for (let k = 0; k < 11; k++) { c.fillStyle = choose(['#65764b', '#6e7e50', '#899269']); const xx = x + rand() * w; c.fillRect(xx, y - 1 + rand() * 4, .5 + rand() * 4, .5 + rand() * 2); }
      }
    }
    // Faded, broken cream paint and tiny paw-shaped toy-town road markings.
    c.globalAlpha = .24; c.fillStyle = '#d5b777';
    for (let y = 420; y < 1780; y += 170) c.fillRect(1165, y, 6, 111);
    for (let k = 0; k < 9; k++) { const x = 290 + k * 165, y = 390 + (k % 3) * 330; c.save(); c.translate(x, y); c.rotate(-.3); c.beginPath(); c.ellipse(0, 7, 8, 6, 0, 0, Math.PI * 2); c.fill(); for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse(-9 + j * 8, -3 - (j === 1 ? 4 : 0), 3.4, 4.6, 0, 0, Math.PI * 2); c.fill(); } c.restore(); }
    c.globalAlpha = 1;
    if (index === 2) {
      // The midway uses patched moon-blue asphalt and old carnival paint, not slate.
      c.fillStyle = '#4e6076'; c.fillRect(0, 0, s, s);
      for (let j = 0; j < 650; j++) { c.fillStyle = choose(['rgba(19,33,58,.04)', 'rgba(148,162,172,.04)', 'rgba(163,143,162,.055)']); c.beginPath(); c.ellipse(rand() * s, rand() * s, 5 + rand() * 58, 4 + rand() * 28, rand() * 4, 0, Math.PI * 2); c.fill(); }
      const cx = (20 - 2.8) / 40 * s, cy = s / 2;
      c.globalAlpha = .35;
      for (const [r, color] of [[3.15, '#c9b879'], [3.45, '#9d7892'], [3.7, '#9aacc4']]) { c.strokeStyle = color; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, r / 40 * s, .18, 5.8); c.stroke(); }
      for (let j = 0; j < 42; j++) { const x = rand() * s, y = rand() * s, r = 8 + rand() * 6; c.fillStyle = j % 2 ? '#b99aaa' : '#cfbb86'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr = k % 2 ? r * .4 : r; k ? c.lineTo(x + Math.sin(a) * rr, y + Math.cos(a) * rr) : c.moveTo(x + Math.sin(a) * rr, y + Math.cos(a) * rr); } c.closePath(); c.fill(); }
      c.globalAlpha = 1;
    }
    grain(c, s, 155000);
  });
  const woodTexture = canvasTexture(512, (c, s) => {
    c.fillStyle = '#bdac8d'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 150; i++) { const x = rand() * s; c.strokeStyle = `rgba(66,49,32,${.03 + rand() * .13})`; c.lineWidth = .4 + rand() * 2; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + rand() * 10 - 5, 170, x - 7 + rand() * 14, 330, x + rand() * 5, s); c.stroke(); }
    for (let i = 0; i < 9; i++) { c.strokeStyle = 'rgba(80,59,35,.2)'; c.lineWidth = 2; const x = rand() * s, y = rand() * s; for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(x, y, 2 + k * 3, 8 + k * 8, -.05, 0, Math.PI * 2); c.stroke(); } }
    grain(c, s, 12000, true);
  });
  const clothTexture = canvasTexture(256, (c, s) => {
    c.fillStyle = '#e4ded0'; c.fillRect(0, 0, s, s); c.lineWidth = 1;
    for (let j = 0; j < s; j += 3) { c.strokeStyle = 'rgba(75,63,47,.13)'; c.beginPath(); c.moveTo(j, 0); c.lineTo(j, s); c.stroke(); c.strokeStyle = 'rgba(255,250,231,.30)'; c.beginPath(); c.moveTo(0, j); c.lineTo(s, j); c.stroke(); }
    grain(c, s, 18000, true);
  });
  const plasterTexture = canvasTexture(256, (c, s) => { c.fillStyle = '#d4d0b8'; c.fillRect(0, 0, s, s); grain(c, s, 27000); });
  const tex = { wood: woodTexture, cloth: clothTexture, stone: plasterTexture };
  const mat = (color, type = '', extra = {}) => {
    const key = color + '/' + type + JSON.stringify(extra); if (materials.has(key)) return materials.get(key);
    const t = tex[type]; const m = new THREE.MeshStandardMaterial({ color, roughness: .91, ...(t ? { map: t, bumpMap: t, bumpScale: type === 'cloth' ? .018 : .035 } : {}), ...extra });
    m.userData.artSurface = type; materials.set(key, m); return m;
  };
  const geo = (key, fn) => { if (!geometries.has(key)) geometries.set(key, fn()); return geometries.get(key); };
  const boxG = geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  const sphereG = geo('sphere', () => new THREE.SphereGeometry(1, 18, 12));
  const rockG = geo('rock', () => new THREE.IcosahedronGeometry(1, 1));
  const cylG = geo('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 20));
  const coneG = geo('cone', () => new THREE.ConeGeometry(1, 1, 20));
  const torusG = geo('torus', () => new THREE.TorusGeometry(1, .07, 6, 36));
  const leafG = geo('leaf', () => new THREE.SphereGeometry(1, 8, 4));
  const detailG = geo('small-sphere', () => new THREE.SphereGeometry(1, 10, 6));
  const rodG = geo('thin-rod', () => new THREE.CylinderGeometry(1, 1, 1, 8));
  const dummy = new THREE.Object3D();
  const put = (g, m, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, shadow = true) => {
    const key = g.uuid + '/' + m.uuid + '/' + shadow;
    if (!batches.has(key)) batches.set(key, { g, m, matrices: [], shadow });
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); batches.get(key).matrices.push(dummy.matrix.clone());
  };
  const box = (x, y, z, w, h, d, c, type = '', ry = 0) => put(boxG, mat(c, type), x, y, z, w, h, d, 0, ry);
  const ellipsoid = (x, y, z, sx, sy, sz, c, type = '', ry = 0, rz = 0) => put(Math.max(sx, sy, sz) < .19 ? detailG : sphereG, mat(c, type), x, y, z, sx, sy, sz, 0, ry, rz);
  const cyl = (x, y, z, r, h, c, type = '') => put(cylG, mat(c, type), x, y, z, r, h, r);
  const ring = (x, y, z, r, c, ry = 0, rx = Math.PI / 2, thick = 1) => put(torusG, mat(c), x, y, z, r, r, r * thick, rx, ry);
  const rod = (a, b, r, c, type = '') => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), v = B.clone().sub(A);
    dummy.position.copy(A.add(B).multiplyScalar(.5)); dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()); dummy.scale.set(r, v.length(), r); dummy.updateMatrix();
    const g = r < .1 ? rodG : cylG, m = mat(c, type), key = g.uuid + '/' + m.uuid + '/true'; if (!batches.has(key)) batches.set(key, { g, m, matrices: [], shadow: true }); batches.get(key).matrices.push(dummy.matrix.clone());
  };
  const collider = (x, z, r) => obstacles.push({ x, z, r });
  const flower = (x, y, z, size = 1, color = '#f2e2b8') => {
    rod([x, y - .16 * size, z], [x, y + .11 * size, z], .012 * size, p.darkLeaf);
    for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5; put(leafG, mat(color), x + Math.cos(a) * .078 * size, y + .105 * size, z + Math.sin(a) * .078 * size, .066 * size, .027 * size, .048 * size, 0, -a); }
    ellipsoid(x, y + .123 * size, z, .036 * size, .025 * size, .036 * size, '#d3ab59');
  };
  const foliage = (x, y, z, r = .45, count = 7, flowers = false) => {
    for (let j = 0; j < count; j++) {
      const a = j * 2.4 + rand() * .3, reach = r * (.25 + rand() * .52), yy = y + rand() * r * .25;
      put(leafG, mat(j % 3 ? p.leaf : p.darkLeaf), x + Math.cos(a) * reach, yy, z + Math.sin(a) * reach, r * (.24 + rand() * .12), r * .085, r * .13, rand() * .8 - .4, -a, rand() * .5 - .25);
      if (flowers && j % 3 === 0) flower(x + Math.cos(a) * reach, yy + .065, z + Math.sin(a) * reach, .85 + rand() * .45, j % 2 ? '#e4b1bc' : '#efdfb5');
    }
  };
  const moss = (x, z, r = .6) => { for (let j = 0; j < 5; j++) put(rockG, mat(j % 2 ? p.moss : '#82865b'), x + (rand() - .5) * r, .027, z + (rand() - .5) * r, r * (.2 + rand() * .2), .018, r * (.14 + rand() * .17), 0, rand() * 6, 0, false); };
  const planter = (x, z, r = 1.3, addCollider = true) => {
    if (addCollider) collider(x, z, r);
    cyl(x, .22, z, r, .44, p.stone, 'stone'); cyl(x, .46, z, r * .97, .12, '#c1bda5', 'stone'); cyl(x, .51, z, r * .86, .045, '#635d45');
    // Radial masonry seams and worn capstones make the circular border legible.
    const count = Math.round(r * 10);
    for (let j = 0; j < count; j++) { const a = j * Math.PI * 2 / count, xx = x + Math.sin(a) * r * .98, zz = z + Math.cos(a) * r * .98; box(xx, .28, zz, .025, .4, .025, '#716f60'); }
    for (let j = 0; j < 7; j++) { const a = j * 2.4; foliage(x + Math.sin(a) * r * .53, .57, z + Math.cos(a) * r * .53, r * .63, 8, true); }
    moss(x - r * .86, z + r * .42, .5);
  };
  const crate = (x, z, s = 1, y = 0, yaw = 0, tint = p.wood) => {
    // Planked faces, raised framing, iron corner straps and recessed nail heads.
    const P = (dx, dy, dz, w, h, d, c, type = 'wood', angle = 0) => box(x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, y + dy, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz, w, h, d, c, type, yaw + angle);
    P(0, .51 * s, 0, .93 * s, .93 * s, .93 * s, '#76583d');
    for (let j = -2; j <= 2; j++) {
      const pos = j * .183 * s; P(pos, .52 * s, .494 * s, .172 * s, .91 * s, .055 * s, tint); P(pos, .52 * s, -.494 * s, .172 * s, .91 * s, .055 * s, tint);
      P(.494 * s, .52 * s, pos, .055 * s, .91 * s, .172 * s, tint); P(-.494 * s, .52 * s, pos, .055 * s, .91 * s, .172 * s, tint);
      P(pos, 1.008 * s, 0, .172 * s, .05 * s, .93 * s, tint);
    }
    for (const side of [-1, 1]) for (const height of [.12, .90]) { P(0, height * s, side * .535 * s, 1.12 * s, .14 * s, .075 * s, '#b29972'); P(side * .535 * s, height * s, 0, .075 * s, .14 * s, 1.12 * s, '#b29972'); }
    for (const dx of [-.43, .43]) for (const h of [.13, .91]) { const xx = x + Math.cos(yaw) * dx * s + Math.sin(yaw) * .58 * s, zz = z - Math.sin(yaw) * dx * s + Math.cos(yaw) * .58 * s; ellipsoid(xx, y + h * s, zz, .027 * s, .025 * s, .017 * s, '#59594b', '', yaw); }
    // Printed shipping label, small paw seal, torn corner rather than a blank cube.
    P(.03 * s, .56 * s, .528 * s, .38 * s, .27 * s, .006 * s, '#c9b58a', 'cloth');
    const xx = x + Math.sin(yaw) * .541 * s, zz = z + Math.cos(yaw) * .541 * s;
    ellipsoid(xx, y + .54 * s, zz, .065 * s, .045 * s, .009 * s, '#756b51', '', yaw);
    for (let j = -1; j <= 1; j++) ellipsoid(xx + Math.cos(yaw) * j * .064 * s, y + (.62 + (j === 0 ? .018 : 0)) * s, zz - Math.sin(yaw) * j * .064 * s, .024 * s, .034 * s, .012 * s, '#756b51', '', yaw);
  };
  const yarn = (x, y, z, r = .44, color = '#8fa7ad') => {
    ellipsoid(x, y, z, r, r * .87, r, color, 'cloth');
    for (let j = 0; j < 8; j++) { const a = j * .39; put(torusG, mat(color, 'cloth'), x, y, z, r * .96, r * .91, r * .92, a + .3, .3 + j * .44, a * .2); }
  };
  const cloth = (x, y, z, w = 1, h = .7, color = p.cloth, yaw = 0) => {
    const g = geo(`cloth-${w}-${h}`, () => { const g = new THREE.PlaneGeometry(w, h, 12, 12), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const xx = pos.getX(i), yy = pos.getY(i); pos.setZ(i, Math.sin(xx * 18) * .034 + Math.sin(yy * 4 + xx * 2) * .06); } g.computeVertexNormals(); return g; });
    put(g, mat(color, 'cloth', { side: THREE.DoubleSide }), x, y, z, 1, 1, 1, -.08, yaw, .04);
    for (let j = 0; j < Math.floor(w / .12); j++) { const dx = -.5 * w + .04 + j * .12; box(x + Math.cos(yaw) * dx, y - h * .47, z - Math.sin(yaw) * dx + .019, .048, .01, .012, '#d7c6a4', '', yaw); }
  };
  const fence = (x, z, length = 3.5, yaw = 0) => {
    const P = (dx, y, dz, w, h, d, color) => box(x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, y, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz, w, h, d, color, 'wood', yaw);
    for (let j = 0; j <= Math.floor(length / .53); j++) { const dx = -length / 2 + j * .53, h = 1.08 + rand() * .18; P(dx, h / 2, 0, .34, h, .13, j % 2 ? '#8e775b' : '#a18b68'); }
    P(0, .25, .10, length + .25, .13, .12, '#755f47'); P(0, .87, .10, length + .25, .13, .12, '#ad9675');
    for (let side of [-1, 1]) { P(side * length / 2, .72, .03, .2, 1.45, .22, '#7f6a50'); }
  };
  const lamp = (x, z, s = 1, light = false) => {
    cyl(x, .10 * s, z, .29 * s, .2 * s, '#a5a594', 'stone'); cyl(x, .24 * s, z, .20 * s, .13 * s, '#6e756b'); cyl(x, 1.32 * s, z, .057 * s, 2.12 * s, p.metal);
    for (const y of [.42, 2.12]) cyl(x, y * s, z, .094 * s, .07 * s, '#9a926f');
    cyl(x, 2.26 * s, z, .24 * s, .12 * s, '#73776b');
    const glass = mat('#ffdb80', '', { emissive: '#ffb43d', emissiveIntensity: 1.8, roughness: .32 }); put(cylG, glass, x, 2.57 * s, z, .15 * s, .50 * s, .15 * s, 0, 0, 0, false);
    for (let j = 0; j < 4; j++) { const a = Math.PI / 4 + j * Math.PI / 2; rod([x + Math.cos(a) * .18 * s, 2.28 * s, z + Math.sin(a) * .18 * s], [x + Math.cos(a) * .18 * s, 2.83 * s, z + Math.sin(a) * .18 * s], .024 * s, '#7a7b69'); }
    cyl(x, 2.85 * s, z, .25 * s, .1 * s, '#83806a'); put(coneG, mat('#767869'), x, 2.96 * s, z, .29 * s, .2 * s, .29 * s); ellipsoid(x, 3.1 * s, z, .063 * s, .075 * s, .063 * s, '#a1946e');
    if (light) { const l = new THREE.PointLight('#ffcf72', index === 2 ? 8 : 4.2, index === 2 ? 7 : 5, 2); l.position.set(x, 2.5 * s, z); group.add(l); }
  };
  const tree = (x, z, size = 1, addCollider = true) => {
    if (addCollider) collider(x, z, .8 * size);
    cyl(x, .09, z, .75 * size, .18, p.stone, 'stone');
    rod([x, .1, z], [x - .15 * size, 2 * size, z], .14 * size, '#847454', 'wood');
    for (let j = 0; j < 3; j++) { const a = j * 2.1; rod([x - .08 * size, 1.1 * size, z], [x + Math.sin(a) * .54 * size, 2.24 * size, z + Math.cos(a) * .48 * size], .065 * size, '#8a7556', 'wood'); }
    for (let j = 0; j < 8; j++) { const a = j * 2.4; ellipsoid(x + Math.cos(a) * size * .45, (2.08 + rand() * .46) * size, z + Math.sin(a) * size * .46, size * .60, size * .58, size * .59, j % 3 ? p.leaf : p.darkLeaf); }
    for (let j = 0; j < 10; j++) { const a = j * 2.4; foliage(x + Math.cos(a) * .62 * size, .19, z + Math.sin(a) * .62 * size, .32, 5, j % 2 === 0); }
  };
  const dogGarden = (x, z, r = 2.3, variant = 0) => {
    collider(x, z, r); planter(x, z, r, false);
    const yaw = .5, P = (dx, y, dz) => [x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, y, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz];
    const E = (dx, y, dz, sx, sy, sz, color, rz = 0) => ellipsoid(...P(dx, y, dz), sx, sy, sz, color, 'cloth', yaw, rz);
    E(0, 1.31, 0, 1.20, .91, .91, variant === 1 ? '#cad3a2' : '#dbca8a');
    E(0, 1.91, .04, 1.29, 1.03, .92, variant === 1 ? '#d6dbaa' : '#e6d59a');
    E(-1.17, 1.86, .10, .36, .64, .41, '#d7c68c', -.37); E(1.17, 1.86, .1, .36, .64, .41, '#d7c68c', .37);
    E(-.65, .72, .71, .34, .25, .41, '#ddcd92'); E(.65, .72, .71, .34, .25, .41, '#ddcd92');
    // Weathered giant beret, a stitched band, button and simple inset face.
    E(0, 2.78, -.04, 1.05, .23, .82, '#87694c'); E(.1, 2.88, -.05, .84, .22, .69, '#997b59'); E(.22, 3.10, -.08, .13, .13, .13, '#a88a65');
    E(-.45, 1.98, .895, .071, .095, .03, '#5d5340'); E(.45, 1.98, .895, .071, .095, .03, '#5d5340');
    E(0, 1.79, .966, .092, .060, .034, '#7c6650');
    for (let side of [-1, 1]) { const a = P(side * .098, 1.655, .960), b = P(side * .185, 1.71, .952); rod(P(0, 1.71, .97), a, .020, '#7c6650'); rod(a, b, .018, '#7c6650'); E(side * .67, 1.72, .85, .14, .078, .018, '#c6a177'); }
    for (let j = 0; j < 19; j++) { const a = j * .31; const xx = Math.sin(a) * 1.04, zz = Math.cos(a) * .80; const A = P(xx, 2.72, zz), B = P(xx + Math.cos(a) * .037, 2.745, zz - Math.sin(a) * .028); rod(A, B, .012, '#c4ac7c'); }
    // Moss patches and daisies spill over the masonry without blocking paths.
    for (let j = 0; j < 11; j++) { const a = j * 2.4; foliage(x + Math.sin(a) * r * .75, .61, z + Math.cos(a) * r * .75, .57, 9, true); }
    const plaque = P(0, .31, r * .982); box(...plaque, .84, .25, .045, '#6c8480', 'stone', yaw);
    for (let j = 0; j < 5; j++) { const pt = P(-.27 + j * .13, .31, r * .996); box(...pt, .06, .025, .013, '#b4b696', '', yaw); }
  };
  const supplyIsland = (x, z, r = 1.3) => {
    collider(x, z, r); cyl(x, .05, z, r, .1, p.stone, 'stone'); crate(x - .38, z + .08, .99, .10, -.08); crate(x + .48, z -.23, .66, .10, .14); crate(x - .35, z + .07, .55, 1.11, .12);
    yarn(x + .48, 1.0, z - .14, .35, '#91a5aa'); yarn(x + .37, .33, z + .76, .26, '#b48d8f'); cloth(x - .30, .75, z + .62, .65, .59, p.cloth, -.08);
    foliage(x - .87, .14, z + .27, .52, 9, true); foliage(x + .75, .15, z + .53, .35, 6);
  };
  const benchIsland = (x, z, r = 1.3) => {
    collider(x, z, r); cyl(x, .04, z, r, .08, p.stone, 'stone');
    for (let j = 0; j < 4; j++) box(x, .61, z -.36 + j * .19, r * 1.48, .11, .16, '#a08b69', 'wood');
    for (let side of [-1, 1]) { box(x + side * r * .52, .3, z, .1, .6, .58, '#596968'); rod([x + side * r * .52, .32, z -.3], [x + side * r * .52, 1.19, z -.35], .037, '#586863'); }
    for (let j = 0; j < 3; j++) box(x, .83 + j * .16, z -.35, r * 1.5, .125, .075, '#aa9471', 'wood');
    cloth(x - .44, .75, z + .39, .46, .63, '#a7b0a0'); yarn(x + .47, .85, z + .02, .25, '#be9a89'); foliage(x + r * .74, .14, z + .37, .45, 8, true);
  };
  const shop = (x, z, w, d, h, tint = '#b8ad94') => {
    box(x, h * .5, z, w, h, d, tint, 'stone'); box(x, .19, z + d * .5, w + .13, .34, .2, '#87948b', 'stone');
    box(x, h + .12, z, w + .25, .26, d + .3, '#7c9590', 'wood');
    for (let row = 0; row < 2; row++) for (let col = 0; col < Math.floor(w / 1.8); col++) {
      const xx = x + (col - (Math.floor(w / 1.8) - 1) * .5) * 1.8, yy = 1.4 + row * 1.67;
      if (yy + .6 > h) continue;
      box(xx, yy, z + d * .5 + .08, 1.04, 1.24, .16, '#737c68', 'wood'); box(xx, yy, z + d * .5 + .175, .82, 1.0, .03, '#536d70');
      box(xx, yy, z + d * .5 + .2, .055, 1.02, .035, '#c6c3a6', 'wood'); box(xx, yy, z + d * .5 + .2, .83, .06, .035, '#c6c3a6', 'wood'); box(xx, yy -.64, z + d * .5 + .22, 1.17, .1, .32, '#a29679', 'wood');
      if (col % 2 === 0) { box(xx, yy -.82, z + d * .5 + .31, .99, .3, .37, '#8b7153', 'wood'); foliage(xx, yy -.57, z + d * .5 + .34, .56, 10, true); }
    }
    for (let j = 0; j < Math.floor(w / .5); j++) box(x - w * .5 + .25 + j * .5, h + .26, z + d * .5, .45, .11, .55, '#9aa499', 'stone');
  };

  // These interior islands put readable silhouettes inside the opening camera.
  // Their full solid footprints stay inside one explicit round collider each.
  const rackIsland = (x, z, r = 1.75) => {
    collider(x, z, r); cyl(x, .07, z, r, .14, p.stone, 'stone');
    for (const dx of [-1.22, 1.22]) for (const dz of [-.46, .46]) box(x + dx, 1.46, z + dz, .14, 2.88, .14, '#75654b', 'wood');
    for (const y of [.27, 1.34, 2.42]) { box(x, y, z, 2.61, .13, 1.13, '#a28c63', 'wood'); box(x, y -.15, z + .52, 2.61, .16, .11, '#756345', 'wood'); }
    rod([x - 1.2, .3, z -.43], [x + 1.2, 2.4, z -.43], .045, '#ab9366', 'wood');
    crate(x -.70, z, .78, .35, -.02); crate(x + .31, z -.02, .88, .35, .04);
    crate(x -.77, z -.09, .63, 1.42, .06); crate(x + .73, z -.09, .60, 1.42, -.09);
    yarn(x -.07, 1.76, z + .10, .35, '#8ca6b0'); yarn(x + .13, 2.76, z -.07, .34, '#baa18d'); yarn(x -.60, 2.73, z + .11, .31, '#95aaa1');
    cloth(x + .19, 2.26, z + .58, .77, .73, '#9caeb0'); cloth(x -.68, .81, z + .58, .44, .61, '#bca293');
    foliage(x - 1.10, .20, z + .70, .51, 10, true);
  };
  const cratePile = (x, z, r = 1.45) => {
    collider(x, z, r); cyl(x, .055, z, r, .11, p.stone, 'stone');
    crate(x -.43, z -.16, 1.20, .10, -.06); crate(x + .64, z + .08, .80, .10, .09); crate(x -.39, z -.17, .94, 1.33, .10);
    yarn(x + .55, 1.20, z + .08, .37, '#8ca2ad'); yarn(x -.84, .39, z + .82, .30, '#b58d91');
    cloth(x -.39, 1.71, z + .42, .71, .89, '#9eaaa2', .10); foliage(x + .70, .12, z + .72, .37, 8, true);
  };
  const pot = (x, y, z, r = .35, height = .5, color = '#b18463', plant = true) => {
    const g = geo('flowerpot', () => new THREE.CylinderGeometry(1, .72, 1, 16));
    put(g, mat(color, 'stone'), x, y + height / 2, z, r, height, r); cyl(x, y + height, z, r * 1.08, .075, '#c29a76', 'stone'); cyl(x, y + height + .042, z, r * .87, .025, '#554e38');
    if (plant) foliage(x, y + height + .10, z, r * 1.5, 12, true);
  };
  const pottingIsland = (x, z, r = 1.8, tall = false) => {
    collider(x, z, r); cyl(x, .06, z, r, .12, '#7e8c71', 'stone');
    const top = tall ? 1.04 : .83;
    for (const dx of [-1.05, 1.05]) for (const dz of [-.54, .54]) box(x + dx, top / 2, z + dz, .13, top, .13, '#6f7353', 'wood');
    box(x, top, z, 2.38, .15, 1.30, '#a08e62', 'wood'); box(x, .25, z, 2.29, .12, 1.22, '#857752', 'wood');
    for (let j = 0; j < 4; j++) pot(x -.88 + j * .58, top + .1, z + (j % 2 ? .25 : -.24), .21 + j % 2 * .05, .34, j % 2 ? '#a87e5e' : '#ad9872');
    pot(x + .36, .32, z + .16, .31, .48, '#a67556', false); pot(x -.62, .32, z + .1, .27, .42, '#988668', false);
    for (const dx of [-1.08, 1.08]) rod([x + dx, .2, z -.5], [x + dx, 2.86, z -.5], .055, '#598676');
    for (let y of [1.6, 2.20, 2.8]) rod([x - 1.1, y, z -.5], [x + 1.1, y, z -.5], .028, '#87a696');
    for (let xx of [-.56, 0, .56]) rod([x + xx, 1.20, z -.5], [x + xx, 2.8, z -.5], .025, '#759b86');
    for (let j = 0; j < 12; j++) { const a = j * 2.3, yy = .6 + j * .18; foliage(x -.83 + Math.sin(a) * .19, yy, z -.44 + Math.cos(a) * .12, .31, 5, j % 4 === 0); }
    if (tall) { pot(x + .62, 2.25, z -.47, .28, .35, '#96795b'); rod([x + .62, 2.84, z -.5], [x + .62, 2.6, z -.47], .016, '#b9ad86'); }
    cloth(x -.7, top -.24, z + .69, .46, .61, '#a4b3a0');
  };
  const giantLeafG = geo('curved-nursery-leaf', () => {
    const positions = [], uvs = [], ids = [], rows = 18, cols = 6;
    for (let i = 0; i <= rows; i++) { const t = i / rows, width = Math.pow(Math.sin(Math.PI * t), .74) * (.89 + .11 * Math.cos(t * 9 * Math.PI));
      for (let j = 0; j <= cols; j++) { const side = (j / cols -.5) * 2; positions.push(side * width * .5, t, .18 * Math.sin(Math.PI * t) - .10 * side * side * Math.sin(Math.PI * t)); uvs.push(j / cols, t); }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; ids.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(ids); g.computeVertexNormals(); return g;
  });
  const giantLeaf = (base, tip, width, color, twist = 0) => {
    const A = new THREE.Vector3(...base), B = new THREE.Vector3(...tip), dir = B.clone().sub(A), len = dir.length();
    dummy.position.copy(A); dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist)); dummy.scale.set(width, len, width); dummy.updateMatrix();
    const m = mat(color, 'cloth', { side: THREE.DoubleSide }), key = giantLeafG.uuid + '/' + m.uuid + '/true'; if (!batches.has(key)) batches.set(key, { g: giantLeafG, m, matrices: [], shadow: true }); batches.get(key).matrices.push(dummy.matrix.clone());
    const matrix = dummy.matrix.clone(), P = (s, t) => new THREE.Vector3(s * .5 * Math.pow(Math.sin(Math.PI * t), .74), t, .18 * Math.sin(Math.PI * t) - .1 * s * s * Math.sin(Math.PI * t) + .005).applyMatrix4(matrix).toArray();
    for (let j = 1; j <= 7; j++) rod(P(0, (j - 1) / 7), P(0, j / 7), .018, '#aac176');
    for (let j = 1; j < 7; j++) for (const side of [-1, 1]) rod(P(0, j / 8), P(side * .85, j / 8 + .09), .007, '#8fab66');
  };
  const nursery = (x, z, r = 2.45) => {
    collider(x, z, r); planter(x, z, r, false);
    // Giant, genuinely curved leaves replace the dog silhouette entirely.
    for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4, reach = 1.3 + (j % 2) * .30, high = j % 3 === 0 ? 3.15 : 2.50;
      const base = [x + Math.sin(a) * .18, .65, z + Math.cos(a) * .18], tip = [x + Math.sin(a) * reach, high, z + Math.cos(a) * reach]; rod(base, [base[0], 1.01, base[2]], .055, '#607c46'); giantLeaf(base, tip, 1.00 + j % 2 * .30, j % 3 ? '#729759' : '#4e7951', -a);
    }
    // Three close glasshouse ribs, a crown beam and several surviving glass panes.
    const glass = mat('#abd4c7', '', { transparent: true, opacity: .12, depthWrite: false, roughness: .17, side: THREE.DoubleSide });
    for (let row = 0; row < 3; row++) { const zz = z -.83 + row * .83;
      for (let j = 0; j < 18; j++) { const a = j / 18 * Math.PI, b = (j + 1) / 18 * Math.PI; rod([x + Math.cos(a) * 2.17, .64 + Math.sin(a) * 3.1, zz], [x + Math.cos(b) * 2.17, .64 + Math.sin(b) * 3.1, zz], .042, '#74988b'); }
      for (const side of [-1, 1]) cyl(x + side * 2.17, .57, zz, .085, .15, '#b2baa0', 'stone');
    }
    for (const a of [.34, .76, 1.57, 2.37, 2.80]) rod([x + Math.cos(a) * 2.17, .64 + Math.sin(a) * 3.1, z -.85], [x + Math.cos(a) * 2.17, .64 + Math.sin(a) * 3.1, z + .85], .034, '#759a8b');
    for (let j = 0; j < 6; j++) { const a = .35 + j * .43, b = a + .38; if (j === 2 || j === 4) continue;
      const points = [Math.cos(a)*2.17,.64+Math.sin(a)*3.1,-.82,Math.cos(b)*2.17,.64+Math.sin(b)*3.1,-.82,Math.cos(a)*2.17,.64+Math.sin(a)*3.1,.80,Math.cos(b)*2.17,.64+Math.sin(b)*3.1,.80];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); g.setIndex([0,1,2,2,1,3]); g.computeVertexNormals(); geometries.set('glass-near-' + j, g); put(g, glass, x, 0, z, 1, 1, 1, 0, 0, 0, false);
    }
    for (let j = 0; j < 8; j++) foliage(x - 1.94 + Math.sin(j * 1.7) * .14, .75 + j * .25, z + .88, .39, 6, j % 3 === 0);
  };
  const carousel = (x, z, r = 2.65) => {
    collider(x, z, r); cyl(x, .12, z, r, .24, '#62708a', 'stone'); cyl(x, .31, z, r * .95, .18, '#ae927b', 'wood'); ring(x, .43, z, r * .90, '#c1a66b');
    cyl(x, 1.56, z, .18, 2.40, '#a29a85');
    const canopy = geo('carousel-striped-roof', () => new THREE.CylinderGeometry(0, 1, 1, 3, 1, true, 0, Math.PI / 6));
    for (let j = 0; j < 12; j++) put(canopy, mat(j % 2 ? '#a17d91' : '#c6b9a0', 'cloth', { side: THREE.DoubleSide }), x, 2.94, z, r * .98, .85, r * .98, 0, j * Math.PI / 6);
    ring(x, 2.53, z, r * .97, '#8b7986'); ring(x, 2.60, z, r * .95, '#c4ad79');
    for (let j = 0; j < 28; j++) { const a = j / 28 * Math.PI * 2, xx = x + Math.sin(a) * r * .95, zz = z + Math.cos(a) * r * .95;
      put(detailG, mat('#ffe3a0', '', { emissive: '#ffb84c', emissiveIntensity: 2.0 }), xx, 2.51, zz, .056, .076, .056, 0, 0, 0, false);
      ellipsoid(xx, 2.42, zz, .15, .16, .065, j % 2 ? '#ae909c' : '#c5b79c', 'cloth', a);
    }
    for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5 + .4, xx = x + Math.sin(a) * 1.65, zz = z + Math.cos(a) * 1.65, yaw = a + Math.PI / 2;
      cyl(xx, 1.49, zz, .032, 2.13, '#c5aa6f');
      const E = (dx,y,dz,sx,sy,sz,c) => ellipsoid(xx + Math.cos(yaw)*dx+Math.sin(yaw)*dz,y,zz-Math.sin(yaw)*dx+Math.cos(yaw)*dz,sx,sy,sz,c,'cloth',yaw);
      const c = j % 2 ? '#9fb9b4' : '#d2bfa0'; E(0,1.09,0,.40,.24,.25,c); E(.28,1.39,.0,.16,.34,.18,c); E(.36,1.59,.06,.22,.16,.16,c); E(.50,1.55,.06,.13,.08,.12,'#c4ad97'); E(.27,1.79,.0,.046,.14,.062,c);
      for (const dx of [-.23,.23]) for (const dz of [-.15,.15]) E(dx,.80,dz,.056,.27,.066,c);
      E(-.40,1.02,0,.10,.25,.10,'#879995'); E(0,1.30,0,.23,.055,.25,j%2?'#a9859b':'#927f9d');
      E(.38,1.64,.153,.027,.032,.017,'#4f515b');
    }
    ellipsoid(x, 3.40, z, .13, .15, .13, '#d7bc7f');
    const light = new THREE.PointLight('#ffd498', 13, 8, 2); light.position.set(x, 1.65, z); group.add(light);
  };
  const moonSign = (x, y, z, r = .55) => {
    const s = new THREE.Shape(); s.absarc(0,0,1,.38,Math.PI*2-.38,false); s.absarc(.45,0,.70,Math.PI*2-.58,.58,true);
    const g = geo('moon-sign', () => new THREE.ExtrudeGeometry(s,{depth:.11,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.03,bevelThickness:.03,curveSegments:16}));
    put(g,mat('#cdd6e6','',{emissive:'#8ba6d8',emissiveIntensity:.25}),x,y,z,r,r,r,0,.45,-.18);
  };
  const candyCart = (x,z,r=1.6) => {
    collider(x,z,r); box(x,.67,z,2.05,1.08,1.05,'#9b7c8d','wood');
    for(const dx of [-.77,.77]) { put(torusG,mat('#736c7d'),x+dx,.37,z+.59,.35,.35,.35,0,0,0); cyl(x+dx,.37,z+.59,.065,.10,'#b6a37f'); }
    for(const dx of [-.95,.95]) rod([x+dx,1.1,z-.38],[x+dx,2.25,z-.38],.035,'#bcb399');
    for(let j=0;j<7;j++) box(x-1.02+j*.34,2.30,z,.33,.13,1.36,j%2?'#b88f9f':'#d1c0a0','cloth');
    for(let j=0;j<5;j++){const xx=x-.7+j*.34; rod([xx,1.21,z],[xx,1.62,z],.02,'#cabc9f');ellipsoid(xx,1.77,z,.14,.21,.14,j%2?'#c59fb7':'#bac1d5','cloth');}
    cloth(x+.54,.83,z+.57,.47,.65,'#a6a5b8');moonSign(x,2.76,z-.32,.29);
  };
  const rocketRide = (x,z,r=1.5) => {
    collider(x,z,r);cyl(x,.12,z,r,.24,'#596c85','stone');
    const yaw=.65;ellipsoid(x,1.00,z,.59,.44,1.02,'#8daaba','stone',yaw);ellipsoid(x+.42,1.01,z+.57,.39,.29,.49,'#b9afbc','stone',yaw);
    box(x,.45,z,.34,.58,.37,'#8f8795');for(let j=0;j<5;j++) ring(x,.30+j*.095,z,.22,'#bea986');
    for(let j=0;j<2;j++){const xx=x-.19+j*.38;ellipsoid(xx,1.29,z+.21,.14,.10,.13,'#40516d');}
    put(coneG,mat('#a3869c','cloth'),x-.58,.71,z-.41,.29,.55,.29,0,.4,.65);put(coneG,mat('#a3869c','cloth'),x+.55,.71,z-.37,.29,.55,.29,0,-.4,-.65);
    moonSign(x,1.08,z+.98,.16);
  };

  // One detailed atlas gives the ground irregular stone, wear, moss and faded paint
  // in a single draw call. Thin seam stones add visible physical depth at the edge.
  box(0, -.48, 0, 42, .82, 42, '#737d64', 'stone');
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: groundTexture ? '#dfdbcc' : p.floor, map: groundTexture, bumpMap: groundTexture, bumpScale: .06, roughness: .96 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.023; floor.receiveShadow = true; group.add(floor);
  for (let side of [-1, 1]) for (let i = -19; i <= 19; i++) { box(i, .06, side * 18.85, .95, .18, .47, i % 3 ? p.stone : '#929d8c', 'stone'); box(side * 18.85, .06, i, .47, .18, .95, i % 3 ? p.stone : '#929d8c', 'stone'); }
  // Moss, small chipped fragments and pressed leaves sit below ankle height.
  for (let j = 0; j < 190; j++) {
    const x = (rand() -.5) * 37, z = (rand() -.5) * 37;
    if (Math.hypot(x, z - 4) < 1.45) continue;
    if (j < 88) moss(x, z, .18 + rand() * .55);
    const c = choose(['#a6a68a', '#b9b096', '#727e60']); put(rockG, mat(c), x, .012 + rand() * .02, z, .025 + rand() * .067, .018 + rand() * .021, .025 + rand() * .10, 0, rand() * 6, 0, false);
  }
  // Authored ground gardens visible around the first encounter, kept very low.
  for (const [x, z, r] of [[-2.9, 1.4, .85], [3.3, 6.6, .58], [4.2, -.7, .6], [-4.6, 6.9, .7], [1.7, 9.0, .58], [-1.8, -3.3, .4]]) {
    moss(x, z, r * 2.2); foliage(x, .07, z, r, 13, true);
    for (let j = 0; j < 5; j++) { const a = rand() * 6; flower(x + Math.cos(a) * r * .7, .11, z + Math.sin(a) * r * .7, .7 + rand() * .5); }
  }

  if (index === 0) {
    dogGarden(-3, -.7, 2.3); planter(6, -4.5, 1.5); rackIsland(-6.3, 5.4, 1.8); rackIsland(6.4, 5.3, 1.8); tree(-11, -8, 1.6); cratePile(1.9, 9.9, 1.45);
    fence(-6.3, 6.5, 1.9); fence(6.4, 6.4, 1.9);
    group.userData.landmarks = [{ name: 'dog garden', x: -3, z: -.7, height: 3.23 }, { name: 'left wooden market rack', x: -6.3, z: 5.4, height: 3.10 }, { name: 'right wooden market rack', x: 6.4, z: 5.3, height: 3.10 }, { name: 'foreground crate pile', x: 1.9, z: 9.9, height: 2.34 }];
    shop(-12, -21.7, 9, 4.7, 4.7, '#baae94'); shop(-1, -22, 9, 5, 4.1, '#b0a28d'); shop(11, -22, 10, 5, 5.1, '#aab7a2');
    shop(-22, -9, 4, 10, 3.5, '#b7ae99');
    // Low perimeter market stalls are intentionally layered rather than solid walls.
    for (let side of [-1, 1]) for (let j = 0; j < 4; j++) {
      const x = side * 19.7, z = -10 + j * 7.3; crate(x, z, 1.65, 0, side * .08); crate(x + side * .23, z + .1, 1.1, 1.68, -.07); fence(x, z + 3.0, 3.4, Math.PI / 2);
      yarn(x - side * .65, 1.85, z + 1.2, .56, '#7c969e'); yarn(x - side * .4, .44, z + 2.1, .4, '#b68c89'); cloth(x - side * .79, 1.2, z + .4, .97, 1.1, p.cloth, Math.PI / 2);
      foliage(x - side * .7, .1, z + 2.6, .94, 10, true);
    }
    lamp(-4.65, -.1, 1.06, true); lamp(5.73, 5.99, .95, true); lamp(-19.35, 11, 1.03); lamp(19.35, -13, 1.1);
    // Pennants, patched canvas and tiny warm festoon bulbs mark the town entrance.
    rod([-15, 4.9, -17], [14, 4.5, -17], .022, '#827960');
    for (let j = 0; j < 18; j++) { const x = -14.5 + j * 1.62, yy = 4.75 - Math.sin(j / 17 * Math.PI) * .40; put(coneG, mat(j % 2 ? '#b19383' : '#849e94', 'cloth'), x, yy - .20, -17, .24, .46, .025, 0, 0, Math.PI); }
  } else if (index === 1) {
    // Close glass ribs, enormous leaves and working potting racks establish a nursery.
    nursery(-3, -.5, 2.45); pottingIsland(-6.5, 5.5, 1.8, true); pottingIsland(6, 3.7, 1.8, true); planter(7, -6, 1.9); pottingIsland(1.7, 9.8, 1.55); tree(-11, -9, 1.6);
    group.userData.landmarks = [{ name: 'giant-leaf glass nursery', x: -3, z: -.5, height: 3.8 }, { name: 'vine potting rack', x: -6.5, z: 5.5, height: 2.95 }, { name: 'hanging pot trellis', x: 6, z: 3.7, height: 2.95 }, { name: 'foreground terracotta bench', x: 1.7, z: 9.8, height: 2.9 }];
    box(0, .25, -21, 29, .5, 6, '#919c82', 'stone');
    for (let side of [-1, 1]) box(0, 1.0, -21 + side * 2.8, 29, 1.5, .22, '#9eaa90', 'stone');
    const glass = mat('#a1c9b9', '', { transparent: true, opacity: .19, depthWrite: false, roughness: .2, side: THREE.DoubleSide });
    for (let j = 0; j < 10; j++) {
      const x = -14.4 + j * 3.2; rod([x, .5, -18.2], [x, 5.3, -18.2], .065, p.metal); rod([x, .5, -23.8], [x, 5.3, -23.8], .065, p.metal); rod([x, 5.3, -18.2], [x, 7, -21], .065, p.metal); rod([x, 7, -21], [x, 5.3, -23.8], .065, p.metal);
      if (j < 9 && j !== 4 && j !== 7) { put(boxG, glass, x + 1.58, 3.25, -18.2, 3.07, 3.98, .015, 0, 0, 0, false); if (j % 2) put(boxG, glass, x + 1.58, 6.15, -19.6, 3.07, .015, 3.2, -.55, 0, 0, false); }
      foliage(x, 1.04, -18.1, 1.1, 14, true);
    }
    for (let y of [1.9, 3.6, 5.3]) rod([-14.4, y, -18.2], [14.4, y, -18.2], .05, p.metal); rod([-14.4, 7, -21], [14.4, 7, -21], .07, p.metal);
    // Potting tables, stacks of terracotta and a spilled watering can.
    for (let side of [-1, 1]) for (let j = 0; j < 4; j++) { const x = side * 19.9, z = -11 + j * 7;
      box(x, 1.10, z, 1.8, .13, 3.2, '#aa936c', 'wood'); for (let a of [-.65, .65]) for (let b of [-1.28, 1.28]) box(x + a, .56, z + b, .12, 1.08, .12, '#8e7a59', 'wood');
      for (let k = 0; k < 4; k++) { const zz = z -1 + k * .63; cyl(x, 1.43, zz, .28, .50, k % 2 ? '#b88865' : '#ac9274', 'stone'); ring(x, 1.69, zz, .28, '#c3a484'); foliage(x, 1.81, zz, .46, 7, k % 2 === 0); }
      crate(x + side * .17, z + 2.4, 1.1); foliage(x - side * .7, .16, z + 1.8, .86, 10, true);
    }
    lamp(-4.63, -.19, .95, true); lamp(6.78, 4.60, .9, true);
    cyl(19.6, 1.1, 4, 1.12, 1.6, '#82998b', 'stone'); rod([18.9, .6, 4], [18.3, 1.9, 4], .20, '#82998b'); ring(20.7, 1.43, 4, .77, '#82998b', Math.PI / 2, 0);
    for (let j = 0; j < 9; j++) { const x = -17 + j * 4; fence(x, 20, 3.6); foliage(x, .13, 19.6, 1.0, 12, true); }
  } else {
    carousel(-2.8, 0, 2.65);
    // The close moon-ticket kiosk is part of the first encounter, not a distant skyline.
    const kx = 5.8, kz = 1.8; collider(kx, kz, 1.8); cyl(kx, .14, kz, 1.8, .28, '#6a7486', 'stone');
    box(kx, 1.22, kz, 2.17, 2.2, 2.10, '#93899b', 'wood'); box(kx, 1.55, kz+1.07, 1.61, 1.1, .07, '#334965'); box(kx, .97, kz+1.26, 1.88, .13, .4, '#ad967e', 'wood');
    for (const dx of [-.77,.77]) box(kx+dx, 1.61, kz+1.14, .085, 1.18, .08, '#c4b89c', 'wood'); box(kx, 2.16, kz+1.15, 1.67, .09, .08, '#c4b89c', 'wood');
    for (let j = 0; j < 7; j++) box(kx-1 + j*.333, 2.47, kz, .32, .19, 2.63, j%2 ? '#a7819b' : '#c8b9a0', 'cloth');
    box(kx, 2.88, kz+.04, 1.94, .52, .16, '#546682', 'wood'); moonSign(kx, 3.39, kz+.14, .41);
    for (let j = 0; j < 5; j++) ellipsoid(kx-.62+j*.3, 2.89, kz+.14, .067, .12, .02, '#d4bd86'); cloth(kx+.53, .66, kz+1.36, .58, .45, '#a68d9b');
    candyCart(-6.5, 5.5, 1.65); rocketRide(1.8, 9.1, 1.55); tree(-11, -8, 1.3); planter(8, -7, 1.6);
    group.userData.landmarks = [{ name: 'striped illuminated carousel', x: -2.8, z: 0, height: 3.55 }, { name: 'moon ticket kiosk', x: kx, z: kz, height: 3.8 }, { name: 'cotton candy cart', x: -6.5, z: 5.5, height: 3.1 }, { name: 'foreground spring rocket', x: 1.8, z: 9.1, height: 1.45 }];
    // Low warm festoons connect two collidable kiosks above the walkable lane.
    for(let j=0;j<16;j++){const t=j/15,xx=-6.5+t*12.3,zz=5.5-t*3.7,yy=3.16-Math.sin(t*Math.PI)*.46;if(j){const pt=(j-1)/15;rod([-6.5+pt*12.3,3.16-Math.sin(pt*Math.PI)*.46,5.5-pt*3.7],[xx,yy,zz],.012,'#657088');}put(detailG,mat('#ffe0a0','',{emissive:'#ffb758',emissiveIntensity:2.2}),xx,yy-.08,zz,.045,.068,.045,0,0,0,false);}
    // The distant wheel and striped booths keep this unmistakably the toy park.
    const wx = 7, wz = -23, wy = 6; rod([wx - 3, 0, wz + .7], [wx, wy, wz], .13, '#7a8281'); rod([wx + 3, 0, wz + .7], [wx, wy, wz], .13, '#7a8281');
    put(torusG, mat('#a88d9b'), wx, wy, wz, 4.4, 4.4, 4.4);
    for (let j = 0; j < 10; j++) { const a = j * Math.PI * 2 / 10, x = wx + Math.cos(a) * 4.4, y = wy + Math.sin(a) * 4.4; rod([wx, wy, wz], [x, y, wz], .03, '#a69b9e'); box(x, y -.37, wz, .87, .65, .77, j % 2 ? '#b99687' : '#8ea397', 'wood'); box(x, y + .10, wz, .98, .10, .88, '#c5ae98', 'cloth'); }
    shop(-12, -22, 8, 4, 3.6, '#bda995');
    for (let side of [-1, 1]) for (let j = 0; j < 5; j++) { const x = side * 19.6, z = -13 + j * 6.7; fence(x, z, 4.6, Math.PI / 2); crate(x + side * .2, z + 2.0, 1.24); yarn(x - side * .55, .49, z + 1.2, .45, j % 2 ? '#bea18e' : '#96a6a3'); foliage(x - side * .7, .09, z - 1.8, .8, 12, true); }
    lamp(7.20, 2.35, .90, true);
    for (let side of [-1, 1]) cyl(side * 19.3, 2.6, -15.5, .1, 5.2, '#8c8174');
    for (let j = 0; j < 24; j++) { const x = -19.3 + j * 38.6 / 23, y = 4.95 - Math.sin(j / 23 * Math.PI) * 1.07; if (j) { const px = -19.3 + (j - 1) * 38.6 / 23, py = 4.95 - Math.sin((j - 1) / 23 * Math.PI) * 1.07; rod([px, py, -15.5], [x, y, -15.5], .018, '#736b60'); } put(sphereG, mat('#ffe2a1', '', { emissive: '#ffb84f', emissiveIntensity: 1.4 }), x, y -.1, -15.5, .073, .095, .073, 0, 0, 0, false); }
  }
  // Greenery outside the playable boundary provides a ragged, inhabited silhouette.
  for (let i = 0; i < 70; i++) { const edge = Math.floor(rand() * 4), a = (rand() -.5) * 42, b = 19.7 + rand() * 1.7, x = edge < 2 ? a : edge === 2 ? -b : b, z = edge >= 2 ? a : edge === 0 ? -b : b; foliage(x, .12, z, .55 + rand() * .6, 7, i % 6 === 0); }

  // Static instance colours consolidate materials without flattening the art palette.
  // The explicit surface tag also preserves exactly the same batches in Node and Canvas.
  const merged = new Map();
  for (const b of batches.values()) {
    const m = b.m, key = b.g.uuid + '/' + b.shadow + '/' + JSON.stringify([m.userData.artSurface,m.roughness,m.metalness,m.bumpScale,m.transparent,m.opacity,m.depthWrite,m.side,m.emissive.getHex(),m.emissiveIntensity]);
    if (!merged.has(key)) { const material = m.clone(); material.color.set('#ffffff'); merged.set(key, { g: b.g, m: material, shadow: b.shadow, matrices: [], colors: [] }); }
    const dst = merged.get(key); dst.matrices.push(...b.matrices); for (let j = 0; j < b.matrices.length; j++) dst.colors.push(m.color);
  }
  let instanceCount = 0;
  for (const b of merged.values()) {
    if (!b.matrices.length) continue;
    const inst = new THREE.InstancedMesh(b.g, b.m, b.matrices.length); b.matrices.forEach((m, i) => { inst.setMatrixAt(i, m); inst.setColorAt(i, b.colors[i]); });
    inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true;
    inst.castShadow = b.shadow; inst.receiveShadow = true; inst.computeBoundingSphere(); group.add(inst); instanceCount += b.matrices.length;
  }
  group.userData.artVersion = 'weathered-toy-courtyard-v2'; group.userData.artRevision = 'distinct-toy-worlds-r2'; group.userData.instanceCount = instanceCount; group.userData.staticBatches = merged.size;
  return {
    group, obstacles, lighting, bounds: 18, spawn: { x: 0, z: 4 },
    dispose() {
      scene.remove(group); const gs = new Set(), ms = new Set();
      group.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) gs.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ms.add(m)); });
      materials.forEach(m => ms.add(m)); geometries.forEach(g => gs.add(g)); gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    }
  };
}
