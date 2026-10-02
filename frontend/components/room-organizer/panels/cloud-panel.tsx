'use client';

import { useEffect, useRef, useState } from 'react';
import { createBackendSession, useBackendSession, type ProjectSummary, type Studio } from '@/lib/backend-session';
import { backendSceneToLayout, layoutToBackendScene } from '../lib/backend-adapter';
import { ensureGlbAsset } from '../three/glb-assets';
import type { RoomLayout } from '../lib/types';

interface Props { layout: RoomLayout; onLoadLayout(layout: RoomLayout): void }

export function CloudPanel({ layout, onLoadLayout }: Props): JSX.Element {
  const [controller] = useState(() => createBackendSession());
  const cloud = useBackendSession(controller);
  const dialog = useRef<HTMLDialogElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [studioId, setStudioId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [boundLayout, setBoundLayout] = useState<string | undefined>();
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const lastObserved = useRef('');

  let fingerprint: string | null = null;
  let conversionError = '';
  try { fingerprint = JSON.stringify(layoutToBackendScene(layout)); }
  catch (error) { conversionError = error instanceof Error ? error.message : '当前场景暂不能保存到云端。'; }
  const dirty = fingerprint !== savedFingerprint;
  const bound = !!cloud.project && boundLayout === layout.id && boundLayout === cloud.project.id;

  useEffect(() => controller.retain(), [controller]);
  useEffect(() => {
    if (fingerprint && fingerprint !== lastObserved.current) {
      lastObserved.current = fingerprint;
      controller.setDraft(JSON.parse(fingerprint));
    }
  }, [controller, fingerprint]);

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await action(); }
    catch (error) {
      setNotice(controller.getSnapshot().error?.message ?? (error instanceof Error ? error.message : '操作失败，请重试。'));
    } finally { setBusy(false); }
  }
  async function refreshProjects(): Promise<void> {
    const [nextProjects, nextStudios] = await Promise.all([controller.listProjects(), controller.listStudios()]);
    setProjects(nextProjects); setStudios(nextStudios);
    setStudioId(current => nextStudios.some(studio => studio.id === current) ? current : nextStudios[0]?.id ?? '');
  }
  async function acceptScene(scene: unknown, projectId: string, name: string, openingFrom: RoomLayout): Promise<void> {
    // Include the initial project/lease request in the guard, not only GLB loading.
    if (layoutRef.current !== openingFrom) throw new Error('加载期间画布有新改动，当前草稿已保留。请核对后重新打开云端项目。');
    const candidate = backendSceneToLayout(scene, { projectId, name });
    const assets = await controller.authorizeAssets(layoutToBackendScene(candidate));
    await Promise.all(Object.entries(assets.assetUrls).map(([assetId, url]) => ensureGlbAsset(assetId, url)));
    if (layoutRef.current !== openingFrom) throw new Error('加载期间画布有新改动，当前草稿已保留。请核对后重新打开云端项目。');
    const next = backendSceneToLayout(scene, { projectId, name, ...assets });
    setBoundLayout(next.id);
    setSavedFingerprint(JSON.stringify(layoutToBackendScene(next)));
    lastObserved.current = JSON.stringify(layoutToBackendScene(next));
    onLoadLayout(next);
  }
  function confirmReplace(): boolean {
    return !dirty || window.confirm('打开云端版本会替换当前画布。当前草稿将保留为本地恢复点；重要方案也可以先导出备份。继续吗？');
  }
  function downloadContract(): void {
    try {
      const scene = layoutToBackendScene(layoutRef.current);
      const url = URL.createObjectURL(new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'scendance-scene-v1.json';
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('已导出通过后端 v1 校验的场景文件。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '场景校验失败。'); }
  }

  return <>
    <button className="sc-cloud-trigger" type="button" onClick={() => dialog.current?.showModal()}>
      <span aria-hidden="true">☁</span> {cloud.user ? (cloud.writeBlocked ? '云项目' : dirty ? '有改动待保存' : '云端已保存') : '连接云项目'}
    </button>
    <dialog ref={dialog} className="sc-cloud-dialog" aria-labelledby="cloud-title">
      <div className="sc-cloud-heading"><div><span className="sc-cloud-eyebrow">WORKSPACE / 项目协作</span><h2 id="cloud-title">让团队接着你的方案继续。</h2></div><button className="sc-cloud-close" type="button" aria-label="关闭云项目" onClick={() => dialog.current?.close()}>×</button></div>
      {!cloud.configured ? <div className="sc-cloud-offline">
        <span className="sc-cloud-badge">本地工作台</span>
        <h3>后端尚未连接</h3>
        <p>你可以继续布置场地，草稿自动保存在此浏览器。团队登录与云端交接将在后端部署后开放。</p>
        <p className="sc-cloud-muted">当前画布支持导出符合后端格式的场景文件，便于交接和检查。</p>
        <button type="button" onClick={downloadContract} disabled={!!conversionError}>导出场景数据</button>
      </div> : !cloud.user ? <form className="sc-cloud-form" onSubmit={event => {
        event.preventDefault(); void run(async () => { try { await controller.signIn(email, password); await refreshProjects(); } finally { setPassword(''); } });
      }}>
        <p>使用工作室预置账号登录。当前草稿会保留。</p>
        <label>邮箱<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <label>密码<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
        <button className="sc-cloud-primary" disabled={busy} type="submit">{busy ? '正在连接…' : '登录工作室'}</button>
      </form> : <div className="sc-cloud-content">
        <div className="sc-cloud-account"><span>{cloud.user.email ?? '已登录工作室'}</span><button type="button" disabled={busy} onClick={() => void run(async () => { await controller.signOut(); setProjects([]); setStudios([]); setBoundLayout(undefined); setSavedFingerprint(null); })}>退出登录</button></div>
        {cloud.project && <section className="sc-cloud-current">
          <span className="sc-cloud-eyebrow">当前云项目</span><h3>{cloud.project.name}</h3>
          <p>版本 {cloud.revision} · {cloud.writeBlocked ? '尚未持有有效编辑权，改动只保留在本地' : '你正在编辑，每 30 秒续期'}{dirty ? ' · 画布有未保存改动' : ''}</p>
          <div className="sc-cloud-actions">
            <button type="button" disabled={busy || !cloud.writeBlocked} onClick={() => {
              if (!confirmReplace()) return;
              void run(async () => {
                const openingFrom = layoutRef.current;
                setBoundLayout(undefined);
                const project = controller.getSnapshot().project!;
                const lease = await controller.acquireLease(project.id, scene => { backendSceneToLayout(scene, { projectId: project.id, name: project.name }); });
                try { await acceptScene(lease.scene, project.id, project.name, openingFrom); }
                catch (error) { await controller.releaseLease(); throw error; }
                setNotice('已载入最新版本并获得编辑权。');
              });
            }}>获取编辑权</button>
            <button className="sc-cloud-primary" type="button" disabled={busy || cloud.writeBlocked || !bound || !!conversionError} onClick={() => void run(async () => {
              const scene = layoutToBackendScene(layoutRef.current);
              const submitted = JSON.stringify(scene);
              const saved = await controller.saveScene(scene);
              setSavedFingerprint(submitted);
              setNotice(`已保存云端版本 ${saved.revision}${saved.warnings.length ? '，请留意场地重叠提示' : ''}。`);
            })}>保存到云端</button>
            <button type="button" disabled={busy || cloud.writeBlocked} onClick={() => {
              if (dirty && !window.confirm('画布还有未保存到云端的改动。释放编辑权不会保存这些改动，确认交接吗？')) return;
              void run(async () => { await controller.releaseLease(); setNotice('编辑权已释放，队友可以接手。'); });
            }}>释放编辑权</button>
          </div>
          {!bound && <p className="sc-cloud-muted">画布已切换到另一份本地草稿。请重新获取编辑权，或将当前草稿创建为新项目。</p>}
        </section>}
        <div className="sc-cloud-project-heading"><h3>工作室项目</h3><button type="button" disabled={busy} onClick={() => void run(refreshProjects)}>刷新列表</button></div>
        <ul className="sc-cloud-projects">{projects.map(project => <li key={project.id}><div><strong>{project.name}</strong><small>版本 {project.revision}{project.current_editor ? ' · 有成员持有编辑权' : ''}</small></div><button type="button" disabled={busy || !cloud.writeBlocked} onClick={() => {
          if (!confirmReplace()) return;
          void run(async () => {
            const openingFrom = layoutRef.current;
            setBoundLayout(undefined);
            const opened = await controller.getProject(project.id, candidate => { backendSceneToLayout(candidate.scene, { projectId: candidate.id, name: candidate.name }); });
            await acceptScene(opened.scene, opened.id, opened.name, openingFrom);
            setNotice('已打开云端方案；获取编辑权后可以保存修改。');
          });
        }}>打开</button></li>)}</ul>
        {!projects.length && <p className="sc-cloud-muted">还没有可访问的项目，可以把当前画布存为新项目。</p>}
        <div className="sc-cloud-new">
          <label>保存到工作室<select value={studioId} onChange={event => setStudioId(event.target.value)}>{studios.map(studio => <option key={studio.id} value={studio.id}>{studio.name}</option>)}</select></label>
          <button type="button" disabled={busy || !studioId || !cloud.writeBlocked || !!conversionError} onClick={() => void run(async () => {
            const current = layoutRef.current;
            setBoundLayout(undefined);
            const created = await controller.createProject(studioId, current.name, layoutToBackendScene(current));
            await acceptScene(created.scene, created.id, created.name, current); await refreshProjects(); setNotice('新项目已保存，获取编辑权后可继续云端编辑。');
          })}>把当前画布创建为新项目</button>
        </div>
      </div>}
      {conversionError && <p className="sc-cloud-message" role="status">{conversionError}</p>}
      {(notice || cloud.error) && <p className="sc-cloud-message" role="status">{notice || cloud.error?.message}</p>}
      <div className="sc-cloud-footer">本地草稿与云端版本分别保存。云端写入失败时，当前画布仍然保留。</div>
    </dialog>
  </>;
}
