import * as THREE from 'three';

const REQUIRED_ROLES = ['table', 'chair', 'laptop', 'plant', 'speaker'];
const assert = (test, message) => { if (!test) throw new Error(message); };

/** Freeze the loaded baseline as ordinary meshes with exact source world matrices.
 * Source geometry/materials/textures remain intact; only export copies are changed.
 */
export function createGymExportScene(renderer) {
  assert(renderer.assetState?.state === 'ready' && renderer.loadedAssets.length === 5, '5 款真实 GLB 尚未全部加载，不能导出占位场景。');
  for (const role of REQUIRED_ROLES) assert(renderer.loadedAssets.some(asset => asset.role === role && asset.ok), `缺少真实素材：${role}`);
  assert(renderer.people.length === 100 && renderer.tables.length === 25, '原场景人数或团队数与 100 人 / 25 团队不一致。');
  assert(renderer.phase === 'build' && renderer.hours === 3, '导出快照必须位于 build 阶段、第 3 小时。');
  renderer.scene.updateMatrixWorld(true);

  const output = new THREE.Scene();
  output.name = 'Gym_100People_25Teams';
  const root = new THREE.Group(); root.name = 'Gym_Template'; output.add(root);
  const structure = new THREE.Group(); structure.name = 'Gym_Structure_Stage_Signs'; root.add(structure);
  const roof = new THREE.Group(); roof.name = 'Gym_Roof'; root.add(roof);
  const props = new THREE.Group(); props.name = 'Gym_Furniture'; root.add(props);
  const people = new THREE.Group(); people.name = 'Gym_People'; root.add(people);
  const geometryCache = new Map(), materialCache = new Map();
  let sequence = 0, instanceMeshesExpanded = 0;
  const excluded = { flowGroup: 0, backgroundGround: 0, invisibleHelpers: 0, lights: 0, cameras: 0 };

  function geometryFor(geometry) {
    if (geometryCache.has(geometry)) return geometryCache.get(geometry);
    // Decode normalized quantized GLB attributes once so the complete scene does
    // not need KHR_mesh_quantization. The original node transforms are preserved.
    const needsDecode = Object.values(geometry.attributes).some(attribute => !(attribute.array instanceof Float32Array) && !(attribute.array instanceof Float64Array));
    let copy = geometry;
    if (needsDecode) {
      copy = geometry.clone();
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        if (attribute.array instanceof Float32Array || attribute.array instanceof Float64Array) continue;
        assert(!name.startsWith('skin'), '本场景不应包含蒙皮属性。');
        const values = new Float32Array(attribute.count * attribute.itemSize);
        for (let i = 0; i < attribute.count; i++) for (let component = 0; component < attribute.itemSize; component++) {
          const value = attribute[['getX', 'getY', 'getZ', 'getW'][component]](i);
          assert(Number.isFinite(value), '模型顶点属性包含无效数值。');
          values[i * attribute.itemSize + component] = value;
        }
        copy.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
      }
      copy.computeBoundingBox(); copy.computeBoundingSphere();
    }
    geometryCache.set(geometry, copy);
    return copy;
  }

  function materialFor(source, tint = null) {
    if (Array.isArray(source)) return source.map(material => materialFor(material, tint));
    const key = `${source.uuid}:${tint ? tint.toArray().join(',') : 'plain'}`;
    if (!materialCache.has(key)) {
      const copy = source.clone();
      // Archive the roof as a physical surface, not the overview's translucent overlay.
      if (source === renderer.roofMaterial) copy.opacity = .94;
      if (tint && copy.color) copy.color.multiply(tint);
      // Explicit maps retain their CanvasTexture source. Environment maps and
      // lighting belong to the viewer and are not part of the template file.
      copy.envMap = null;
      copy.name = source.name || `Gym_Material_${materialCache.size + 1}`;
      materialCache.set(key, copy);
    }
    return materialCache.get(key);
  }

  function primitive(source, matrix, name, tint = null) {
    const geometry = geometryFor(source.geometry), material = materialFor(source.material, tint);
    const copy = source.isLineLoop ? new THREE.LineLoop(geometry, material)
      : source.isLineSegments ? new THREE.LineSegments(geometry, material)
      : source.isLine ? new THREE.Line(geometry, material)
      : new THREE.Mesh(geometry, material);
    copy.name = name || source.name || `Gym_Mesh_${String(++sequence).padStart(4, '0')}`;
    copy.matrixAutoUpdate = false; copy.matrix.copy(matrix);
    copy.castShadow = source.castShadow; copy.receiveShadow = source.receiveShadow;
    // The baseline's zone userData contains an Object3D outline reference. Keep
    // only its label rather than serializing a circular renderer object graph.
    if (typeof source.userData.zone === 'string') copy.userData.zone = source.userData.zone;
    return copy;
  }

  function visibleMaterial(object) {
    return !object.material || (Array.isArray(object.material) ? object.material.some(material => material.visible) : object.material.visible);
  }
  function isBackgroundGround(object) {
    return object.isMesh && object.geometry?.type === 'PlaneGeometry'
      && object.geometry.parameters.width === 300 && object.geometry.parameters.height === 300;
  }
  function collect(node, target, forceVisible = false) {
    if (node === renderer.flowGroup) { excluded.flowGroup++; return; }
    if (node.isLight) { excluded.lights++; return; }
    if (node.isCamera) { excluded.cameras++; return; }
    if (isBackgroundGround(node)) { excluded.backgroundGround++; return; }
    if ((!forceVisible && !node.visible) || !visibleMaterial(node)) { excluded.invisibleHelpers++; return; }
    if (node.isMesh || node.isLine) {
      assert(!node.isInstancedMesh, '遗漏了一个未展开的 InstancedMesh。');
      target.add(primitive(node, node.matrixWorld));
    }
    for (const child of node.children) collect(child, target, forceVisible);
  }

  for (const child of renderer.scene.children) {
    if (child === renderer.roofGroup) collect(child, roof, true);
    else if (child !== renderer.peopleGroup && child !== renderer.propGroup) collect(child, structure);
  }

  const placementCounts = {};
  for (const role of REQUIRED_ROLES) {
    const placements = renderer.propPlacements.get(role), batch = renderer.propBatches.get(role);
    assert(batch && !batch.name.startsWith('Temporary'), `不能导出 ${role} 临时占位物。`);
    const groups = placements.map((_, index) => {
      const group = new THREE.Group(); group.name = `Gym_${role}_${String(index + 1).padStart(3, '0')}`;
      group.userData = { role, placementIndex: index }; props.add(group); return group;
    });
    placementCounts[role] = groups.length;
    batch.traverse(source => {
      if (!source.isInstancedMesh) return;
      assert(source.count === groups.length, `素材 ${role} 的实例数与布置记录不符。`);
      for (let i = 0; i < source.count; i++) {
        const local = new THREE.Matrix4(); source.getMatrixAt(i, local);
        const world = source.matrixWorld.clone().multiply(local);
        let tint = null;
        if (source.instanceColor) { tint = new THREE.Color(); source.getColorAt(i, tint); }
        groups[i].add(primitive(source, world, `${role}_${i + 1}_${source.name}`, tint));
        instanceMeshesExpanded++;
      }
    });
  }

  const participants = renderer.people.map((_, index) => {
    const person = new THREE.Group(); person.name = `Participant_${String(index + 1).padStart(3, '0')}`;
    person.userData = { participantNumber: index + 1, teamNumber: Math.floor(index / 4) + 1 };
    people.add(person); return person;
  });
  for (const [partName, source] of Object.entries(renderer.personParts)) {
    assert(source.isInstancedMesh && source.count === 100, `人物部件 ${partName} 的数量不正确。`);
    for (let i = 0; i < source.count; i++) {
      const local = new THREE.Matrix4(); source.getMatrixAt(i, local);
      const world = source.matrixWorld.clone().multiply(local);
      let tint = null;
      if (source.instanceColor) { tint = new THREE.Color(); source.getColorAt(i, tint); }
      participants[i].add(primitive(source, world, `Participant_${String(i + 1).padStart(3, '0')}_${partName}`, tint));
      instanceMeshesExpanded++;
    }
  }
  assert(participants.every(person => person.children.length === 7), '每位参与者必须保留全部 7 个身体部件。');

  output.updateMatrixWorld(true);
  const uniqueGeometries = new Set(), uniqueMaterials = new Set(), textures = new Set();
  let meshCount = 0, lineCount = 0, triangles = 0, remainingInstances = 0;
  output.traverse(node => {
    if (node.isInstancedMesh) remainingInstances++;
    if (node.isMesh) { meshCount++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3; }
    if (node.isLine) lineCount++;
    if (node.geometry) uniqueGeometries.add(node.geometry);
    if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      uniqueMaterials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  assert(remainingInstances === 0, '导出场景仍包含 InstancedMesh。');
  assert(textures.size > 0 && [...textures].some(texture => texture.isCanvasTexture), '导出场景缺少地面、屏幕或标识贴图。');
  assert(excluded.backgroundGround === 1 && excluded.flowGroup === 1, '场景背景或额外动线人物没有正确排除。');
  const bounds = new THREE.Box3().setFromObject(output, true);
  const stats = { people: participants.length, teams: renderer.tables.length, loadedAssetTypes: renderer.loadedAssets.length, phase: renderer.phase, hours: renderer.hours, meshCount, lineCount, triangles, uniqueGeometries: uniqueGeometries.size, materialCount: uniqueMaterials.size, textureCount: textures.size, canvasTextureCount: [...textures].filter(texture => texture.isCanvasTexture).length, instanceMeshesExpanded, remainingInstancedMeshes: remainingInstances, furniturePlacements: placementCounts, roofNode: roof.name, roofMeshCount: roof.children.filter(node => node.isMesh).length, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, excluded };
  root.userData = {
    template: 'Complete gym hackathon scene', people: 100, teams: 25, phase: 'build', hours: 3,
    units: 'meters', upAxis: '+Y', roofNode: 'Gym_Roof',
    dimensionStatus: 'Photo-based concept coordinates; no on-site measurements or capacity verification.',
    provenance: 'Existing authored gym baseline with public 3DAssets.dev GLB props; this export does not call a model generation API.',
    assets: renderer.loadedAssets.map(asset => ({ role: asset.role, title: asset.title, sourceUrl: asset.sourceUrl, cdnUrl: asset.cdnUrl, sha256: asset.sha256, license: asset.license, providerReportedAiGenerated: asset.aiGenerated })),
    exportNotes: ['Ordinary meshes expanded from existing instances; geometries shared.', '100 original participants; the 8 flow-layer walkers are excluded.', 'Canvas floor/screen/sign textures embedded.', 'Lights, cameras, environment and the 300-unit background plane are excluded.']
  };
  return { scene: output, stats };
}

/** Inspect the exported container before handing it to the local save endpoint. */
export function inspectExportedGLB(arrayBuffer) {
  assert(arrayBuffer instanceof ArrayBuffer, 'GLTFExporter 未返回二进制 GLB。');
  const data = new DataView(arrayBuffer);
  assert(data.getUint32(0, true) === 0x46546c67 && data.getUint32(4, true) === 2, 'GLB 文件头不正确。');
  assert(data.getUint32(8, true) === arrayBuffer.byteLength, 'GLB 文件长度不正确。');
  assert(data.getUint32(16, true) === 0x4e4f534a, 'GLB 缺少 JSON 数据块。');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, 20, data.getUint32(12, true))));
  const external = [...(json.buffers || []), ...(json.images || [])].filter(resource => resource.uri && !resource.uri.startsWith('data:'));
  assert(external.length === 0, 'GLB 包含外部资源，不能作为独立文件保存。');
  assert(json.images?.length > 0 && json.images.every(image => Number.isInteger(image.bufferView)), '场景贴图没有内嵌到 GLB。');
  const roofs = (json.nodes || []).filter(node => node.name === 'Gym_Roof');
  const people = (json.nodes || []).filter(node => /^Participant_\d{3}$/.test(node.name || ''));
  assert(roofs.length === 1 && people.length === 100, '导出文件的屋顶或人物节点数量不正确。');
  assert(!(json.extensionsUsed || []).includes('EXT_mesh_gpu_instancing'), '导出文件仍依赖 GPU 实例扩展。');
  assert(!json.cameras?.length && !json.extensions?.KHR_lights_punctual, '导出文件不应包含相机或灯光。');
  return { bytes: arrayBuffer.byteLength, gltfMeshDefinitions: json.meshes?.length || 0, gltfNodeCount: json.nodes?.length || 0, embeddedImageCount: json.images.length, embeddedTextureCount: json.textures?.length || 0, people: people.length, roofNodes: roofs.length, externalResources: external.length, extensionsUsed: json.extensionsUsed || [], extensionsRequired: json.extensionsRequired || [] };
}
