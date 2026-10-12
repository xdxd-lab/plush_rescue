// World-space plush parts share geometry/materials, but each batch owns only its
// instance buffer. Capacity follows actual demand instead of the global maximum.
export function createCrowd(THREE, scene, limits) {
  const maxInstances = (limits.enemies + limits.rescued) * 16;
  if (!Number.isSafeInteger(maxInstances) || maxInstances < 0) {
    throw new RangeError('Crowd limits must give a nonnegative integer capacity.');
  }

  const batches = new Map();
  // Object3D topology changes are rare; animate and visibility changes are not.
  // Keep preorder descriptors and invalidate them on Three's child events.
  // Removed roots are released each sync, so this does not retain discarded pools.
  const roots = new Map();
  let generation = 0;
  let disposed = false;
  let instances = 0, capacity = 0, visibleBatches = 0, uploadBytes = 0;

  function keyFor(part) {
    const material = Array.isArray(part.material)
      ? part.material.map(m => m.uuid).join(',') : part.material.uuid;
    return `${part.geometry.uuid}:${material}`;
  }

  function ensureCapacity(batch) {
    if (batch.mesh && batch.mesh.instanceMatrix.count >= batch.count) return;
    let next = batch.mesh ? batch.mesh.instanceMatrix.count : Math.min(8, maxInstances);
    while (next < batch.count) next = Math.min(maxInstances, next * 2);

    const previous = batch.mesh;
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, next);
    mesh.name = 'Plush crowd batch';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    // Three cannot resize an uploaded BufferAttribute. Replacing the mesh and
    // disposing it releases the old instance buffer and vertex bindings, while
    // preserving geometry/material assets shared with other batches and pools.
    if (previous) {
      capacity -= previous.instanceMatrix.count;
      scene.remove(previous);
      previous.dispose();
    }
    batch.mesh = mesh;
    capacity += next;
    scene.add(mesh);
  }

  function release(record) {
    for (const {part} of record.parts) {
      part.removeEventListener('childadded', record.invalidate);
      part.removeEventListener('childremoved', record.invalidate);
    }
  }

  function descriptors(root) {
    let record = roots.get(root);
    if (!record) {
      record = {parts: [], dirty: true, generation: 0};
      record.invalidate = () => { record.dirty = true; };
      roots.set(root, record);
    }
    record.generation = generation;
    if (!record.dirty) {
      // Also accept direct edits/reordering of Object3D.children, which do not
      // dispatch Three's child events. Reference checks need no UUID strings,
      // recursive traversal, or allocations on an unchanged frame.
      for (const descriptor of record.parts) {
        const children = descriptor.part.children, previous = descriptor.children;
        if (children.length !== previous.length) { record.dirty = true; break; }
        for (let i = 0; i < children.length; i++) {
          if (children[i] !== previous[i]) { record.dirty = true; break; }
        }
        if (record.dirty) break;
      }
      if (!record.dirty) return record.parts;
    }
    release(record);
    record.parts.length = 0;
    function visit(part) {
      const descriptor = {part, children: part.children.slice(), end: 0, geometry: null, geometryUUID: null,
        material: null, materialUUID: null, members: null, batch: null};
      record.parts.push(descriptor);
      part.addEventListener('childadded', record.invalidate);
      part.addEventListener('childremoved', record.invalidate);
      for (const child of part.children) visit(child);
      descriptor.end = record.parts.length;
    }
    visit(root);
    record.dirty = false;
    return record.parts;
  }

  function collect(descriptor) {
    const part = descriptor.part, geometry = part.geometry, material = part.material;
    let changed = descriptor.geometry !== geometry || descriptor.geometryUUID !== geometry.uuid ||
      descriptor.material !== material;
    if (Array.isArray(material)) {
      const members = descriptor.members;
      if (!members || members.length !== material.length * 2) changed = true;
      else for (let i = 0; i < material.length; i++) {
        if (members[i * 2] !== material[i] || members[i * 2 + 1] !== material[i].uuid) {
          changed = true;
          break;
        }
      }
    } else if (descriptor.materialUUID !== material.uuid) changed = true;
    let batch = descriptor.batch;
    if (changed || !batch) {
      const key = keyFor(part);
      batch = batches.get(key);
      if (!batch) {
        batch = {geometry, material, mesh: null, matrices: [], count: 0, castShadow: false};
        batches.set(key, batch);
      }
      descriptor.geometry = geometry;
      descriptor.geometryUUID = geometry.uuid;
      descriptor.material = material;
      descriptor.materialUUID = Array.isArray(material) ? null : material.uuid;
      descriptor.members = Array.isArray(material) ? material.flatMap(m => [m, m.uuid]) : null;
      descriptor.batch = batch;
    }
    if (batch.count >= maxInstances) {
      throw new RangeError(`Crowd batch exceeds its ${maxInstances}-instance limit.`);
    }
    // Retain references, not Matrix4 copies. Final capacity is known before
    // allocation, so a large first wave still allocates only once per batch.
    batch.matrices[batch.count++] = part.matrixWorld;
    batch.castShadow ||= part.castShadow;
  }

  // collections contain Map/Array values of {mesh}, matching the entity pools.
  // The caller marks resets/QA mutations dirty as well as simulation frames.
  function sync(collections, {dirty = true} = {}) {
    if (disposed) throw new Error('Cannot sync a disposed crowd renderer.');
    uploadBytes = 0;
    if (!dirty) return false;

    for (const batch of batches.values()) {
      batch.count = 0;
      batch.castShadow = false;
    }
    generation++;
    for (const collection of collections) {
      for (const {mesh} of collection.values()) {
        // Changed local transforms set matrixWorldNeedsUpdate themselves.
        // Never force the whole tree merely because simulation advanced.
        mesh.updateMatrixWorld();
        const parts = descriptors(mesh);
        for (let i = 0; i < parts.length;) {
          const descriptor = parts[i], part = descriptor.part;
          if (part.visible === false) { i = descriptor.end; continue; }
          if (part.isMesh) collect(descriptor);
          i++;
        }
      }
    }

    for (const [root, record] of roots) {
      if (record.generation === generation) continue;
      release(record);
      roots.delete(root);
    }

    instances = visibleBatches = 0;
    for (const batch of batches.values()) {
      batch.matrices.length = batch.count;
      if (batch.count) ensureCapacity(batch);
      const mesh = batch.mesh;
      if (!mesh) continue;
      mesh.count = batch.count;
      mesh.visible = batch.count > 0;
      mesh.castShadow = batch.castShadow;
      const attribute = mesh.instanceMatrix;
      // Clear ranges even when hidden: a previously queued larger prefix must
      // never cause an inactive tail to upload when the batch reappears.
      attribute.clearUpdateRanges();
      if (!batch.count) continue;
      for (let i = 0; i < batch.count; i++) mesh.setMatrixAt(i, batch.matrices[i]);
      attribute.addUpdateRange(0, batch.count * 16);
      attribute.needsUpdate = true;
      instances += batch.count;
      visibleBatches++;
      uploadBytes += batch.count * 16 * Float32Array.BYTES_PER_ELEMENT;
    }
    return true;
  }

  // Reset visibility without uploading zero matrices; keep bounded allocations
  // reusable across map changes and repeated games.
  function clear() {
    for (const record of roots.values()) release(record);
    roots.clear();
    for (const batch of batches.values()) {
      batch.count = batch.matrices.length = 0;
      if (!batch.mesh) continue;
      batch.mesh.count = 0;
      batch.mesh.visible = false;
      batch.mesh.instanceMatrix.clearUpdateRanges();
    }
    instances = visibleBatches = uploadBytes = 0;
  }

  function dispose() {
    if (disposed) return;
    clear();
    for (const batch of batches.values()) {
      if (!batch.mesh) continue;
      scene.remove(batch.mesh);
      batch.mesh.dispose();
    }
    batches.clear();
    capacity = 0;
    disposed = true;
  }

  return {
    sync, clear, dispose,
    get stats() {
      // uploadBytes measures queued active-prefix updates, not observed GPU
      // traffic. Three initially uploads the full (small/grown) buffer capacity.
      return {batches: batches.size, visibleBatches, instances, capacity,
        allocatedBytes: capacity * 16 * Float32Array.BYTES_PER_ELEMENT,
        uploadBytes, maxInstances};
    },
  };
}
