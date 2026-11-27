import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { buildMap } from '../maps.js';

test('all four props place only on their authored maps, share draws, and dispose', () => {
  const cases = [
    [{ lamp: 4 }, 1, 640],
    [{ lamp: 2, plant: 2 }, 2, 3648],
    [{ lamp: 1, spiral: 1, balloon: 1 }, 4, 8226],
  ];
  for (let i=0;i<cases.length;i++) {
    const scene=new THREE.Scene();
    const map=buildMap(THREE,scene,i);
    const props=map.group.children.filter(x=>x.userData.gardenProp);
    const [counts, draws, tri]=cases[i];
    assert.deepEqual(map.group.userData.gardenProps,counts);
    assert.equal(props.length,draws);
    assert.equal(props.reduce((n,p)=>n+p.geometry.index.count/3*p.count,0),tri);
    assert.ok(props.every(p=>p.isInstancedMesh && !p.castShadow));
    assert.deepEqual(map.spawn,{ x:0, z:4 });
    assert.equal(map.bounds,18);
    assert.equal(map.obstacles.length,6);
    let disposals=0;
    for(const p of props) { p.geometry.addEventListener('dispose',()=>disposals++); p.material.addEventListener('dispose',()=>disposals++); }
    map.dispose();
    assert.equal(scene.children.length,0);
    assert.equal(disposals,2*draws);
  }
});
