import { VenueRenderer } from './source-renderer.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createGymExportScene, inspectExportedGLB } from './export-util.js';

const byId = id => document.getElementById(id);
const button = byId('save-gym');
const status = byId('build-status');
const exportStatus = byId('export-status');
let prepared = null, saving = false;
const report = { state: 'loading', saved: false, bytes: 0 };
const integer = number => number.toLocaleString('en-US');

function publish() {
  document.body.dataset.buildState = report.state;
  byId('build-report').textContent = JSON.stringify(report, null, 2);
  const stats = report.stats;
  if (stats) {
    byId('people-count').textContent = stats.people;
    byId('team-count').textContent = stats.teams;
    byId('mesh-count').textContent = integer(stats.meshCount);
    byId('triangle-count').textContent = integer(stats.triangles);
    Object.assign(byId('build-stats').dataset, { people: String(stats.people), teams: String(stats.teams), meshes: String(stats.meshCount), triangles: String(stats.triangles), textures: String(stats.textureCount), bytes: String(report.bytes) });
  }
  if (report.bytes) {
    byId('byte-count').textContent = `${(report.bytes / 1024 / 1024).toFixed(2)} MB`;
    byId('byte-count').dataset.bytes = String(report.bytes);
  }
}

function failure(error) {
  console.error(error);
  report.state = 'error'; report.error = error.message || String(error);
  status.dataset.kind = 'error'; status.textContent = `暂未保存：${report.error}`;
  button.disabled = !prepared || saving;
  publish();
}

async function saveScene() {
  if (!prepared || saving) return;
  saving = true; button.disabled = true;
  report.saved = false; report.state = 'exporting'; delete report.error;
  exportStatus.hidden = false; exportStatus.dataset.kind = '';
  exportStatus.textContent = '正在打包完整场景与内嵌贴图…'; publish();
  // Yield once so the visible status paints before GLTFExporter traverses meshes.
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    const buffer = await new GLTFExporter().parseAsync(prepared.scene, {
      binary: true, onlyVisible: true, trs: false, animations: [],
      maxTextureSize: Infinity, includeCustomExtensions: false
    });
    const glb = inspectExportedGLB(buffer);
    report.bytes = glb.bytes; report.glb = glb; report.state = 'saving'; publish();
    exportStatus.textContent = 'GLB 已完成，正在保存 gym.glb…';
    const response = await fetch('/__save-gym', {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buffer
    });
    const responseText = await response.text();
    let result;
    try { result = responseText ? JSON.parse(responseText) : {}; } catch { result = { message: responseText }; }
    if (!response.ok || result.ok === false || result.success === false) throw new Error(result.error || result.message || `保存接口 HTTP ${response.status}`);
    report.saved = true; report.state = 'saved'; report.savedFile = 'gym.glb'; report.saveResponse = result;
    exportStatus.dataset.kind = 'success'; exportStatus.textContent = `保存完成 · gym.glb · ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`;
    status.dataset.kind = 'success'; status.textContent = '完整体育馆场景已保存，包含 100 人、25 支团队和内嵌贴图。';
    button.textContent = '重新保存完整体育馆场景';
  } catch (error) {
    exportStatus.dataset.kind = 'error'; exportStatus.textContent = `保存失败：${error.message || error}`;
    failure(error);
  } finally {
    saving = false; button.disabled = !prepared; publish();
  }
}

try {
  const renderer = new VenueRenderer(byId('build-viewport'), {
    onStatus(assetState) {
      byId('asset-count').textContent = `${assetState.loaded} / ${assetState.total}`;
      status.textContent = assetState.message;
      report.assets = { loaded: assetState.loaded, total: assetState.total, state: assetState.state };
      publish();
    }
  });
  renderer.setPhase('build'); renderer.setTime(3); renderer.setPlaying(false); renderer.setFlows(false); renderer.setRoof(true);
  window.gymBuild = { renderer, report, getExportScene: () => prepared?.scene || null, saveScene };
  byId('view-overview').addEventListener('click', () => renderer.setView('perspective'));
  byId('view-top').addEventListener('click', () => renderer.setView('top'));
  byId('toggle-roof').addEventListener('click', event => {
    renderer.setRoof(!renderer.roof);
    event.currentTarget.setAttribute('aria-pressed', String(renderer.roof));
    event.currentTarget.textContent = `屋顶：${renderer.roof ? '显示' : '隐藏'}`;
  });
  button.addEventListener('click', saveScene);
  const ready = await renderer.ready;
  if (ready.state !== 'ready' || ready.loaded !== 5) throw new Error(ready.message || '真实素材没有全部加载成功。');
  await document.fonts.ready;
  // Refresh canvas sign content at the exact fixed phase/time before snapshotting.
  renderer.updateScreen(); renderer.updatePeople();
  prepared = createGymExportScene(renderer);
  report.stats = prepared.stats; report.state = 'ready';
  report.provenance = prepared.scene.children[0].userData;
  status.dataset.kind = 'success'; status.textContent = '5 款真实道具已加载。完整场景已就绪，可保存为单个 GLB 文件。';
  button.disabled = false; publish();
} catch (error) {
  failure(error);
}
