// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement, StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backendSceneToLayout } from "../components/room-organizer/lib/backend-adapter";
import { BackendSession, getBackendConfig, useBackendSession, type Scene } from "./backend-session";

const projectId = "10000000-0000-4000-8000-000000000001";
const studioId = "20000000-0000-4000-8000-000000000001";
const base = "https://example.supabase.co";
const scene: Scene = { schemaVersion: 1, venue: { width: 12, depth: 10, height: 3, shape: "rectangle", entrances: [] }, objects: [], camera: "overview", lighting: "neutral" };
const project = { id: projectId, studio_id: studioId, name: "活动布置", revision: 4, scene };
const auth = { access_token: "access-test-only", refresh_token: "refresh-test-only", expires_in: 3600, user: { id: "user-a", email: "test@example.com" } };
const assetId = "60000000-0000-4000-8000-000000000001";
const assetScene: Scene = { ...scene, objects: [{ id: "50000000-0000-4000-8000-000000000001", materialId: "asset", assetId, position: { x: 2, z: 3 }, rotation: 0, size: { width: 1, depth: 1, height: 1 }, color: "#ffffff", locked: false, notes: "" }] };
const authorizedAsset = { id: assetId, name: "公共模型椅子", format: "glb", url: `${base}/storage/v1/object/sign/scene-assets/chair.glb?token=temporary-test`, expiresIn: 300, metadata: { sourceSize: { width: 1, depth: 1, height: 1 }, groundOffset: [0, 0, 0] } };
const mockFetch = vi.fn<typeof fetch>();
const sessions: BackendSession[] = [];

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function queue(body: unknown, status = 200) { mockFetch.mockResolvedValueOnce(response(body, status)); }
function session() {
  const controller = new BackendSession(getBackendConfig({ url: base, anonKey: "sb_publishable_test" }));
  sessions.push(controller);
  return controller;
}
function request(index: number) {
  const call = mockFetch.mock.calls[index]!;
  return { url: String(call[0]), options: call[1]!, body: call[1]?.body ? JSON.parse(String(call[1].body)) : null };
}
async function editing() {
  const controller = session();
  queue(auth);
  await controller.signIn("test@example.com", "password-test-only");
  queue(project);
  await controller.getProject(projectId);
  queue({ sessionId: controller.getSnapshot().sessionId, generation: 3, expiresAt: new Date(Date.now() + 90_000).toISOString(), revision: 4, scene });
  await controller.acquireLease(projectId);
  return controller;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T08:00:00Z"));
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});
afterEach(() => {
  cleanup();
  for (const controller of sessions.splice(0)) controller.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("backend session contract", () => {
  it("deletes the idle bound project while preserving its local draft", async () => {
    const controller = session(); queue(auth); await controller.signIn('test@example.com', 'test');
    queue(project); await controller.getProject(projectId);
    controller.setDraft(assetScene);
    const draft = controller.getSnapshot().draft;
    queue({ deleted: true }); await controller.deleteProject(projectId, 4);
    expect(request(2)).toMatchObject({ options: { method: 'DELETE' }, body: { expectedRevision: 4 } });
    expect(controller.getSnapshot()).toMatchObject({ project: null, revision: null, draft, writeBlocked: true, dirty: true });
  });

  it("does not remove the bound project on a failed deletion or bypass a held lease", async () => {
    const controller = await editing();
    await expect(controller.deleteProject(projectId, 4)).rejects.toMatchObject({ code: 'PROJECT_SWITCH_REQUIRES_RELEASE' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    queue({ released: true }); await controller.releaseLease();
    queue({ error: { code: 'PROJECT_BUSY' } }, 429);
    await expect(controller.deleteProject(projectId, 4)).rejects.toMatchObject({ code: 'PROJECT_BUSY' });
    expect(controller.getSnapshot().project?.id).toBe(projectId);
  });
  it("requires public configuration and rejects secrets before any request", async () => {
    expect(getBackendConfig({ url: "", anonKey: "" }).configured).toBe(false);
    expect(getBackendConfig({ url: base, anonKey: "sb_secret_do-not-use" }).configured).toBe(false);
    expect(getBackendConfig({ url: "http://outside.example", anonKey: "public" }).configured).toBe(false);
    expect(getBackendConfig({ url: "http://127.0.0.1:54321", anonKey: "public" }).configured).toBe(true);
    const jwt = `a.${btoa(JSON.stringify({ role: "service_role" }))}.b`;
    expect(getBackendConfig({ url: base, anonKey: jwt }).configured).toBe(false);
    const controller = new BackendSession(getBackendConfig({ url: "", anonKey: "" }));
    sessions.push(controller);
    await expect(controller.signIn("x", "y")).rejects.toMatchObject({ code: "CONFIGURATION_MISSING" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("signs in through Auth REST and uses only the access token for business requests", async () => {
    const controller = session();
    queue(auth);
    await controller.signIn(" test@example.com ", "password-test-only");
    expect(request(0)).toMatchObject({ url: `${base}/auth/v1/token?grant_type=password`, body: { email: "test@example.com", password: "password-test-only" }, options: { method: "POST", headers: { apikey: "sb_publishable_test" } } });
    queue([{ id: studioId, name: "工作室", role: "owner", displayName: "A" }]);
    await controller.listStudios();
    queue([project]);
    await controller.listProjects();
    expect(request(1)).toMatchObject({ url: `${base}/functions/v1/scene-api/studios`, options: { method: "GET", headers: { Authorization: `Bearer ${auth.access_token}` } } });
    expect(request(2).url).toBe(`${base}/functions/v1/scene-api/projects`);
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("test-only");
    expect(controller.getSnapshot().user?.email).toBe("test@example.com");
  });

  it("creates and loads projects with the exact v1 scene structure", async () => {
    const controller = session();
    queue(auth);
    await controller.signIn("test@example.com", "pass");
    queue(project, 201);
    await controller.createProject(studioId, project.name, scene);
    expect(request(1)).toMatchObject({ url: `${base}/functions/v1/scene-api/projects`, options: { method: "POST" }, body: { studioId, name: project.name, scene } });
    queue(project);
    await controller.getProject(projectId);
    expect(request(2)).toMatchObject({ url: `${base}/functions/v1/scene-api/projects/${projectId}`, options: { method: "GET" } });
    expect(controller.getSnapshot()).toMatchObject({ project, draft: scene, revision: 4, writeBlocked: true, dirty: false });
  });

  it("uses a distinct editor session per controller and sends lease/save/handoff fields", async () => {
    const controller = await editing();
    expect(controller.getSnapshot().sessionId).not.toBe(session().getSnapshot().sessionId);
    const sessionId = controller.getSnapshot().sessionId;
    expect(request(2)).toMatchObject({ url: `${base}/functions/v1/scene-api/projects/${projectId}/lease/acquire`, body: { sessionId }, options: { method: "POST" } });
    queue({ sessionId, generation: 3, expiresAt: new Date(Date.now() + 120_000).toISOString(), revision: 4 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request(3)).toMatchObject({ url: `${base}/functions/v1/scene-api/projects/${projectId}/lease/renew`, body: { sessionId, generation: 3 }, options: { method: "POST" } });
    const changed = { ...scene, lighting: "warm" as const };
    queue({ id: projectId, revision: 8, scene: changed, updatedAt: new Date().toISOString(), warnings: [] });
    await controller.saveScene(changed);
    expect(request(4)).toMatchObject({ url: `${base}/functions/v1/scene-api/projects/${projectId}/scene`, options: { method: "PUT" }, body: { sessionId, generation: 3, expectedRevision: 4, scene: changed } });
    expect(Object.keys(request(4).body).sort()).toEqual(["expectedRevision", "generation", "scene", "sessionId"]);
    expect(controller.getSnapshot()).toMatchObject({ revision: 8, dirty: false, draft: changed });
    queue({ sessionId, generation: 3, expiresAt: new Date().toISOString(), revision: 8 });
    await controller.releaseLease();
    expect(request(5)).toMatchObject({ url: `${base}/functions/v1/scene-api/projects/${projectId}/lease/release`, body: { sessionId, generation: 3 }, options: { method: "POST" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(controller.getSnapshot()).toMatchObject({ lease: null, writeBlocked: true, revision: 8, draft: changed });
  });

  it.each([[409, "REVISION_CONFLICT"], [409, "LEASE_LOST"], [401, "UNAUTHENTICATED"]])("preserves draft on %s %s and blocks further writes", async (status, code) => {
    const controller = await editing();
    const changed = { ...scene, lighting: "cool" as const };
    queue({ error: { code, details: {} } }, status);
    await expect(controller.saveScene(changed)).rejects.toMatchObject({ code, status });
    expect(controller.getSnapshot()).toMatchObject({ draft: changed, dirty: true, revision: 4, project, status: "blocked", writeBlocked: true, error: { code, status } });
    await expect(controller.saveScene(changed)).rejects.toMatchObject({ code: "CLOUD_WRITE_BLOCKED" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("preserves the draft and does not retry after an uncertain network save", async () => {
    const controller = await editing();
    const changed = { ...scene, camera: "top" as const };
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(controller.saveScene(changed)).rejects.toThrow("Failed to fetch");
    expect(controller.getSnapshot()).toMatchObject({ draft: changed, revision: 4, writeBlocked: true, error: { code: "NETWORK_ERROR" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("keeps edits made during a pending save as an unsaved local draft", async () => {
    const controller = await editing();
    const submitted = { ...scene, lighting: "warm" as const };
    const later = { ...submitted, camera: "top" as const };
    let finish!: (value: Response) => void;
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const saving = controller.saveScene(submitted);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    controller.setDraft(later);
    finish(response({ id: projectId, revision: 5, scene: submitted, updatedAt: new Date().toISOString(), warnings: [] }));
    await saving;
    expect(controller.getSnapshot()).toMatchObject({ draft: later, dirty: true, revision: 5, project: { scene: submitted } });
  });

  it("refreshes an expired access token in memory before business requests", async () => {
    const controller = session();
    queue({ ...auth, expires_in: 40 });
    await controller.signIn("test@example.com", "pass");
    await vi.advanceTimersByTimeAsync(20_000);
    queue({ ...auth, access_token: "refreshed-access", refresh_token: "refreshed-refresh" });
    queue([]);
    await controller.listProjects();
    expect(request(1)).toMatchObject({ url: `${base}/auth/v1/token?grant_type=refresh_token`, body: { refresh_token: auth.refresh_token }, options: { method: "POST" } });
    expect(request(2).options.headers).toMatchObject({ Authorization: "Bearer refreshed-access" });
  });

  it("rejects an expired lease locally without sending another save", async () => {
    const controller = await editing();
    vi.setSystemTime(new Date(Date.now() + 91_000));
    await expect(controller.saveScene(scene)).rejects.toMatchObject({ code: "LEASE_LOST" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, writeBlocked: true, error: { code: "LEASE_LOST" } });
  });

  it("survives the StrictMode effect cleanup/setup and disposes only on real unmount", async () => {
    const controller = await editing();
    function Probe() {
      const state = useBackendSession(controller);
      useEffect(() => controller.retain(), []);
      return createElement("output", { "data-testid": "session" }, `${state.user?.email ?? "signed out"}/${state.status}`);
    }
    let rendered!: ReturnType<typeof render>;
    await act(async () => { rendered = render(createElement(StrictMode, null, createElement(Probe))); });
    expect(screen.getByTestId("session").textContent).toBe("test@example.com/editing");
    const lease = controller.getSnapshot().lease!;
    queue({ sessionId: lease.sessionId, generation: lease.generation, revision: 4, expiresAt: new Date(Date.now() + 120_000).toISOString() });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mockFetch).toHaveBeenCalledTimes(4);
    await act(async () => { rendered.unmount(); });
    expect(controller.getSnapshot()).toMatchObject({ user: null, lease: null, writeBlocked: true, draft: scene });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("keeps the original project and canvas draft when the editor rejects another project", async () => {
    const controller = session();
    queue(auth);
    await controller.signIn("test@example.com", "pass");
    queue(project);
    await controller.getProject(projectId);
    const local = { ...scene, lighting: "warm" as const };
    controller.setDraft(local);
    const polygon: Scene = { ...scene, venue: { ...scene.venue, shape: "polygon", polygon: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }] } };
    const otherId = "10000000-0000-4000-8000-000000000002";
    queue({ ...project, id: otherId, scene: polygon });
    await expect(controller.getProject(otherId, incoming => { backendSceneToLayout(incoming.scene); })).rejects.toMatchObject({ code: "POLYGON_NOT_SUPPORTED" });
    expect(controller.getSnapshot()).toMatchObject({ project, draft: local, revision: 4, dirty: true, writeBlocked: true, error: { code: "POLYGON_NOT_SUPPORTED" } });
    await expect(controller.saveScene(local)).rejects.toMatchObject({ code: "CLOUD_WRITE_BLOCKED" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("releases a just-acquired unsupported cloud scene without replacing the original draft", async () => {
    const controller = session();
    queue(auth);
    await controller.signIn("test@example.com", "pass");
    queue(project);
    await controller.getProject(projectId);
    const local = { ...scene, camera: "top" as const };
    controller.setDraft(local);
    const unsupported: Scene = { ...scene, venue: { ...scene.venue, floorplanAssetId: "30000000-0000-4000-8000-000000000001" } };
    const sessionId = controller.getSnapshot().sessionId;
    queue({ sessionId, generation: 5, expiresAt: new Date(Date.now() + 90_000).toISOString(), revision: 9, scene: unsupported });
    queue({ sessionId, generation: 5, expiresAt: new Date().toISOString(), revision: 9 });
    await expect(controller.acquireLease(projectId, incoming => { backendSceneToLayout(incoming); })).rejects.toMatchObject({ code: "FLOORPLAN_NOT_SUPPORTED" });
    expect(request(3)).toMatchObject({ url: `${base}/functions/v1/scene-api/projects/${projectId}/lease/release`, body: { sessionId, generation: 5 }, options: { method: "POST" } });
    expect(controller.getSnapshot()).toMatchObject({ project, draft: local, revision: 4, dirty: true, writeBlocked: true, error: { code: "FLOORPLAN_NOT_SUPPORTED" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("does not clear a lost-lease warning when a concurrent save response arrives", async () => {
    const controller = await editing();
    let finishRenew!: (value: Response) => void;
    let finishSave!: (value: Response) => void;
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { finishRenew = resolve; }));
    const renewing = controller.renewLease().catch(error => error);
    await vi.waitFor(() => expect(finishRenew).toBeTypeOf("function"));
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    const saving = controller.saveScene(scene);
    await vi.waitFor(() => expect(finishSave).toBeTypeOf("function"));
    finishRenew(response({ error: { code: "LEASE_LOST" } }, 409));
    await renewing;
    finishSave(response({ id: projectId, revision: 5, scene, updatedAt: new Date().toISOString(), warnings: [] }));
    await saving;
    expect(controller.getSnapshot()).toMatchObject({ revision: 5, status: "blocked", writeBlocked: true, error: { code: "LEASE_LOST" } });
    await expect(controller.saveScene(scene)).rejects.toMatchObject({ code: "CLOUD_WRITE_BLOCKED" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("authorizes each referenced asset once without fetching floorplans or persisting signed URLs", async () => {
    const controller = session();
    queue(auth);
    await controller.signIn("test@example.com", "pass");
    const duplicate: Scene = { ...assetScene, venue: { ...scene.venue, floorplanAssetId: "70000000-0000-4000-8000-000000000001" }, objects: [...assetScene.objects, { ...assetScene.objects[0]!, id: "50000000-0000-4000-8000-000000000002" }] };
    controller.setDraft(duplicate);
    queue(authorizedAsset);
    await expect(controller.authorizeAssets(duplicate)).resolves.toEqual({ assetUrls: { [assetId]: authorizedAsset.url }, assetNames: { [assetId]: authorizedAsset.name } });
    expect(request(1)).toMatchObject({ url: `${base}/functions/v1/scene-api/assets/${assetId}/url`, options: { method: "POST", headers: { Authorization: `Bearer ${auth.access_token}` } }, body: null });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().draft).toEqual(duplicate);
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("temporary-test");
  });

  it("requires no asset request for an entirely builtin scene", async () => {
    await expect(session().authorizeAssets(scene)).resolves.toEqual({ assetUrls: {}, assetNames: {} });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts a local HTTP signed asset URL", async () => {
    const controller = session();
    queue(auth);
    await controller.signIn("test@example.com", "pass");
    const url = "http://127.0.0.1:54321/storage/v1/object/sign/assets/test.glb?token=test";
    queue({ ...authorizedAsset, url });
    await expect(controller.authorizeAssets(assetScene)).resolves.toMatchObject({ assetUrls: { [assetId]: url } });
  });

  it.each([
    { url: "javascript:alert(1)" },
    { url: "http://outside.example/model.glb" },
    { url: "https://user:password@example.com/model.glb" },
    { format: "png" },
    { id: "60000000-0000-4000-8000-000000000002" },
    { expiresIn: 0 },
  ])("rejects invalid asset authorization without replacing the draft: %j", async invalid => {
    const controller = await editing();
    controller.setDraft(assetScene);
    queue({ ...authorizedAsset, ...invalid });
    await expect(controller.authorizeAssets(assetScene)).rejects.toMatchObject({ code: "ASSET_AUTHORIZATION_INVALID" });
    expect(controller.getSnapshot()).toMatchObject({ draft: assetScene, dirty: true, project, revision: 4, writeBlocked: true, error: { code: "ASSET_AUTHORIZATION_INVALID" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("rejects the whole asset batch when any referenced asset is unavailable", async () => {
    const controller = await editing();
    const secondId = "60000000-0000-4000-8000-000000000002";
    const twoAssets: Scene = { ...assetScene, objects: [...assetScene.objects, { ...assetScene.objects[0]!, id: "50000000-0000-4000-8000-000000000002", assetId: secondId }] };
    controller.setDraft(twoAssets);
    queue(authorizedAsset);
    queue({ error: { code: "ASSET_NOT_FOUND" } }, 404);
    await expect(controller.authorizeAssets(twoAssets)).rejects.toMatchObject({ code: "ASSET_NOT_FOUND", status: 404 });
    expect(controller.getSnapshot()).toMatchObject({ draft: twoAssets, dirty: true, revision: 4, writeBlocked: true, error: { code: "ASSET_NOT_FOUND" } });
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});

describe('private reconstruction transport',()=>{
  const source={assetId,kind:'floorplan' as const,name:'图纸.png',width:1024,height:768};
  const jobId='70000000-0000-4000-8000-000000000001';
  it('uploads binary multipart source bytes with project-scoped authentication',async()=>{
    const controller=await editing();queue(source);
    const result=await controller.uploadSource(new Blob(['image'],{type:'image/png'}),'图纸.png','floorplan');
    const [url,options]=mockFetch.mock.calls[3]!;
    expect(String(url)).toBe(`${base}/functions/v1/scene-api/assets/sources`);
    expect(options?.headers).toEqual({Authorization:'Bearer access-test-only'});
    const form=options?.body as FormData;expect(form).toBeInstanceOf(FormData);expect(form.get('projectId')).toBe(projectId);expect(form.get('kind')).toBe('floorplan');expect(form.get('file')).toBeInstanceOf(Blob);expect(result).toEqual(source);
  });
  it('submits measured sources with stable lease/version context and preserves state on status reads',async()=>{
    const controller=await editing();queue({id:jobId,state:'queued',issues:[]});
    const input={scene,sources:[source],dimensions:[{id:crypto.randomUUID(),kind:'width' as const,label:'总宽',valueMeters:12,status:'confirmed' as const}],instruction:'还原场地',mode:'restore' as const,selectedIds:[],requestId:crypto.randomUUID()};
    expect((await controller.createReconstruction(input)).state).toBe('queued');
    const submitted=request(3);expect(submitted.body).toMatchObject({...input,expectedRevision:4,generation:3,sessionId:controller.getSnapshot().sessionId});
    const previous=controller.getSnapshot().draft;queue({id:jobId,state:'needs_review',issues:[{code:'UNSEEN',message:'确认不可见墙'}]});
    await controller.getReconstruction(jobId);expect(controller.getSnapshot().draft).toBe(previous);expect(request(4).options.method).toBe('GET');
  });
  it('rejects a late reconstruction response after the user edits the draft',async()=>{
    const controller=await editing();let finish!:(response:Response)=>void;mockFetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=controller.createReconstruction({scene,sources:[source],dimensions:[],instruction:'还原场地',mode:'restore',selectedIds:[],requestId:crypto.randomUUID()});
    await Promise.resolve();await Promise.resolve();controller.setDraft({...scene,lighting:'warm'});finish(response({id:jobId,state:'queued',issues:[]}));
    await expect(pending).rejects.toMatchObject({code:'STALE_PROPOSAL'});expect(controller.getSnapshot().draft?.lighting).toBe('warm');
  });
  it('unlinks a source without deleting scene snapshots',async()=>{
    const controller=await editing();queue({removed:true});await controller.removeSource(assetId);expect(request(3)).toMatchObject({url:`${base}/functions/v1/scene-api/projects/${projectId}/sources/${assetId}`,options:{method:'DELETE'}});expect(controller.getSnapshot().draft).toEqual(scene);
  });
});

describe("workspace business requests", () => {
  it("keeps the editing lease on a generation idempotency conflict", async () => {
    const controller = await editing();
    const lease = controller.getSnapshot().lease;
    queue({ error: { code: "IDEMPOTENCY_CONFLICT" } }, 409);
    await expect(controller.businessRequest('/jobs', 'POST', { requestId: crypto.randomUUID(), prompt: '灯' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(controller.getSnapshot()).toMatchObject({ writeBlocked: false, lease, revision: 4 });
    queue({ ...lease, expiresAt: new Date(Date.now() + 120_000).toISOString() });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request(4).url).toContain('/lease/renew');
  });

  it("renames with the current lease and revision while preserving unsaved draft", async () => {
    const controller = await editing();
    const draft = { ...scene, lighting: 'warm' as const };
    controller.setDraft(draft);
    queue({ ...project, name: '新名称', revision: 5 });
    await controller.renameProject('新名称');
    expect(request(3)).toMatchObject({ options: { method: 'PATCH' }, body: { name: '新名称', expectedRevision: 4, generation: 3, sessionId: controller.getSnapshot().sessionId } });
    expect(controller.getSnapshot()).toMatchObject({ draft, dirty: true, revision: 5, project: { name: '新名称' } });
  });

  it("still blocks cloud writes when a business request discovers expired authentication", async () => {
    const controller = await editing();
    controller.setDraft({ ...scene, lighting: 'warm' });
    queue({ error: { code: 'UNAUTHENTICATED' } }, 401);
    await expect(controller.businessRequest('/assets')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(controller.getSnapshot()).toMatchObject({ user: null, writeBlocked: true, dirty: true, draft: { lighting: 'warm' } });
  });
});

describe('Agent run client contract',()=>{
  const requestId='70000000-0000-4000-8000-000000000001',runId='70000000-0000-4000-8000-000000000002';
  const run={id:runId,projectId,requestId,state:'running',progress:'查找物料',callCount:1,candidates:[],evaluation:null,executionMode:'preview',jevEnabled:false,expiresAt:'2026-10-02T08:10:00Z'};
  it('sends current unsaved scene with real lease context and recovers solely through GET',async()=>{
    const controller=await editing();
    queue(run,202);
    await controller.startAgentRun({requestId,scene:assetScene,selectedIds:[assetScene.objects[0]!.id],instruction:'移动选中物料',context:{brief:'完整需求',acceptedDecisions:[],recentMessages:[]},jevEnabled:false,executionMode:'preview'});
    expect(request(3)).toMatchObject({url:`${base}/functions/v1/scene-api/projects/${projectId}/agent-runs`,options:{method:'POST'},body:{requestId,scene:assetScene,sessionId:controller.getSnapshot().sessionId,generation:3,expectedRevision:4,localRevision:controller.getSnapshot().localRevision}});
    queue(run);await controller.getAgentRunByRequest(requestId);
    queue(run);await controller.getAgentRun(runId);
    queue({...run,state:'cancelled'});await controller.cancelAgentRun(runId);
    expect(request(4)).toMatchObject({options:{method:'GET'},url:`${base}/functions/v1/scene-api/projects/${projectId}/agent-runs/by-request/${requestId}`});
    expect(request(5).options.method).toBe('GET');
    expect(request(6)).toMatchObject({options:{method:'POST'},url:`${base}/functions/v1/scene-api/projects/${projectId}/agent-runs/${runId}/cancel`});
    expect(controller.getSnapshot().draft).toEqual(assetScene);
  });
  it('rejects a run belonging to another request and never automatically retries a failed dispatch',async()=>{
    const controller=await editing();
    const input={requestId,scene,selectedIds:[],instruction:'摆放桌子',context:{brief:'',acceptedDecisions:[],recentMessages:[]},jevEnabled:false,executionMode:'preview' as const};
    queue({...run,requestId:runId},202);
    await expect(controller.startAgentRun(input)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(mockFetch).toHaveBeenCalledTimes(4);
    queue({...run,projectId:studioId});
    await expect(controller.getAgentRun(runId)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});
