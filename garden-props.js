import { gardenPropData } from './garden-prop-data.js';

const specs = Object.freeze({
  stone: { roughness: .85 },
  candy: { roughness: .53, side: 'double' },
  wood: { roughness: .84, side: 'double' },
  balloon: { roughness: .72, side: 'double' },
});

const srgb = Array.from({ length: 256 }, (_, byte) => {
  const x = byte / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
});

function bytes(text) { return Uint8Array.from(atob(text), x => x.charCodeAt(0)); }
function int16(text, signed) {
  const buf = bytes(text);
  const view = new DataView(buf.buffer);
  return (signed ? Int16Array : Uint16Array).from({ length: buf.byteLength / 2 },
    (_, i) => signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true));
}

/**
 * Mount static instances only, separate from world physics. At most one
 * draw call per model part; no new requests, textures, decoders or animation.
 * buildMap owns disposal, including the shared batches built here.
 */
export function mountGardenProps(THREE, into, placements) {
  const counts = {};
  const dummy = new THREE.Object3D();
  for (const [id, parts] of Object.entries(gardenPropData)) {
    const chosen = placements.filter(entry => entry[0] === id);
    if (!chosen.length) continue;
    for (let part = 0; part < parts.length; part++) {
      const data = parts[part];
      const pos = Float32Array.from(int16(data.p, true), x => x * data.scale);
      const norm = Float32Array.from(new Int8Array(bytes(data.n).buffer), x => x / 127);
      const rgb = Float32Array.from(bytes(data.c), x => srgb[x]);
      const indices = int16(data.i, false);
      const geometry = new THREE.BufferGeometry()
        .setAttribute('position', new THREE.BufferAttribute(pos, 3))
        .setAttribute('normal', new THREE.BufferAttribute(norm, 3))
        .setAttribute('color', new THREE.BufferAttribute(rgb, 3))
        .setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      const spec = specs[data.mat];
      const material = new THREE.MeshStandardMaterial({ vertexColors: true,
        roughness: spec.roughness, metalness: 0,
        side: spec.side === 'double' ? THREE.DoubleSide : THREE.FrontSide });
      const asset = new THREE.InstancedMesh(geometry, material, chosen.length);
      asset.name = 'garden-prop:' + id + '/' + part;
      asset.userData.gardenProp = id;
      for (let i = 0; i < chosen.length; i++) {
        const [, x, y, z, s, yaw] = chosen[i];
        dummy.position.set(x, y, z); dummy.scale.setScalar(s);
        dummy.rotation.set(0, yaw, 0); dummy.updateMatrix();
        asset.setMatrixAt(i, dummy.matrix);
      }
      asset.instanceMatrix.needsUpdate = true;
      asset.castShadow = false; // scenery must not obscure game actors or drops
      asset.receiveShadow = id !== 'balloon';
      asset.computeBoundingSphere();
      into.add(asset);
    }
    counts[id] = chosen.length;
  }
  return counts;
}
