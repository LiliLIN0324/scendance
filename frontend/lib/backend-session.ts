"use client";

import { useSyncExternalStore } from "react";
import { createSceneClient, SceneApiError } from "../../client/scene-client";
import { sceneSchema, type Scene } from "../../supabase/functions/_shared/domain";

export { SceneApiError };
export type { Scene };

export interface BackendConfig {
  configured: boolean;
  url: string;
  anonKey: string;
  apiUrl: string;
  error: string | null;
}

/** Only public configuration belongs in a browser bundle. Tokens stay in memory. */
export function getBackendConfig(input?: { url?: string; anonKey?: string }): BackendConfig {
  const url = (input?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (input?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  let error: string | null = null;
  if (!url || !anonKey) error = "请配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。";
  else {
    try {
      const parsed = new URL(url);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
      if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
        error = "Supabase URL 必须是 HTTPS 项目地址；本地服务可使用 HTTP。";
      }
    } catch { error = "Supabase URL 格式无效。"; }
    if (anonKey.startsWith("sb_secret_")) error = "前端只能使用公开的 anon / publishable key。";
    try {
      const payload = anonKey.split(".")[1];
      if (payload && JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role") {
        error = "前端不能配置 service_role key。";
      }
    } catch { /* Publishable keys are opaque, not JWTs. */ }
  }
  return { configured: error === null, url, anonKey, apiUrl: `${url}/functions/v1/scene-api`, error };
}

export interface BackendUser { id: string; email?: string }
export interface Studio { id: string; name: string; role: "owner" | "editor"; displayName: string }
export interface ProjectSummary {
  id: string; name: string; studio_id: string; revision: number;
  updated_at?: string; current_editor?: string | null; lease_expires?: string | null;
}
export interface BackendProject extends ProjectSummary { scene: Scene; materials?: unknown[] }
export interface Lease {
  projectId: string; sessionId: string; generation: number; expiresAt: string; revision: number;
}
export interface BackendFailure { code: string; status: number; message: string }
export interface BackendSnapshot {
  configured: boolean;
  sessionId: string;
  user: BackendUser | null;
  project: BackendProject | null;
  lease: Lease | null;
  revision: number | null;
  /** The latest locally submitted draft survives auth, network, and revision failures. */
  draft: Scene | null;
  localRevision: number;
  dirty: boolean;
  status: "unconfigured" | "signed_out" | "ready" | "editing" | "saving" | "blocked";
  writeBlocked: boolean;
  error: BackendFailure | null;
}
interface AuthResponse {
  access_token: string; refresh_token: string; expires_in: number; expires_at?: number; user: BackendUser;
}
interface Tokens { access: string; refresh: string; expiresAt: number }
export interface SaveResult { id: string; revision: number; scene: Scene; updatedAt: string; warnings: { code: string; ids: string[] }[] }
export interface AuthorizedAssets { assetUrls: Record<string, string>; assetNames: Record<string, string> }
type LeaseResponse = Omit<Lease, "projectId">;

function failure(error: unknown): BackendFailure {
  const localCode = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : null;
  const code = error instanceof SceneApiError ? error.code : localCode ?? (error instanceof Error && error.name === "ZodError" ? "INVALID_RESPONSE" : "NETWORK_ERROR");
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "登录已失效，草稿已保留，请重新登录并获取编辑权。",
    INVALID_CREDENTIALS: "邮箱或密码不正确。",
    REVISION_CONFLICT: "云端版本已变化，草稿已保留；请核对后重新获取编辑权。",
    LEASE_LOST: "编辑权已到期或交接，草稿已保留。",
    LEASE_BUSY: "另一编辑会话正在使用此项目。",
    NETWORK_ERROR: "连接失败，草稿已保留，云端写入已暂停。",
    CLOUD_WRITE_BLOCKED: "请先获取有效编辑权再保存。",
    CLOUD_OPERATION_BUSY: "上一个保存或交接仍在进行。",
    CONFIGURATION_MISSING: "云端连接尚未配置。",
    INVALID_RESPONSE: "云端返回的数据格式无效。",
    ASSET_AUTHORIZATION_INVALID: "云端模型的授权信息无效，未替换当前画布，草稿已保留。",
    SESSION_CHANGED: "会话已变化，请重新操作。",
    PROJECT_SWITCH_REQUIRES_RELEASE: "请先交接当前项目的编辑权。",
  };
  return { code, status: error instanceof SceneApiError ? error.status : 0, message: messages[code] ?? (localCode && error instanceof Error ? error.message : `云端操作失败（${code}），草稿已保留。`) };
}

export class BackendSession {
  readonly config: BackendConfig;
  private snapshot: BackendSnapshot;
  private readonly listeners = new Set<() => void>();
  private tokens: Tokens | null = null;
  private refresh: Promise<string> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private operationPending = false;
  private renewing = false;
  private epoch = 0;
  private owners = 0;
  private lifecycle = 0;
  private readonly client: ReturnType<typeof createSceneClient>;

  constructor(config: BackendConfig = getBackendConfig()) {
    this.config = config;
    // Never persist this in local/sessionStorage: duplicated tabs must not share a lease identity.
    const sessionId = crypto.randomUUID();
    this.snapshot = {
      configured: config.configured, sessionId, user: null, project: null, lease: null, revision: null,
      draft: null, localRevision: 0, dirty: false,
      status: config.configured ? "signed_out" : "unconfigured", writeBlocked: true, error: null,
    };
    this.client = createSceneClient(config.apiUrl, () => this.accessToken());
  }

  getSnapshot = (): BackendSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  /** Effect lifecycle: cleanup/setup in StrictMode must not destroy a live session. */
  retain = (): (() => void) => {
    this.owners += 1;
    this.lifecycle += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.owners -= 1;
      const lifecycle = ++this.lifecycle;
      void Promise.resolve().then(() => {
        if (this.owners === 0 && lifecycle === this.lifecycle) this.dispose();
      });
    };
  };
  private update(patch: Partial<BackendSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private stopRenewal() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
  private block(error: unknown) {
    this.stopRenewal();
    this.update({ writeBlocked: true, status: "blocked", error: failure(error) });
  }
  private requireConfig() {
    if (!this.config.configured) throw new SceneApiError("CONFIGURATION_MISSING", 0, null);
  }
  private async authRequest(grant: "password" | "refresh_token", body: unknown): Promise<AuthResponse> {
    this.requireConfig();
    // Supabase Auth REST: https://github.com/supabase/auth/blob/master/openapi.yaml
    const response = await fetch(`${this.config.url}/auth/v1/token?grant_type=${grant}`, {
      method: "POST", headers: { apikey: this.config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store",
    });
    if (!response.ok) throw new SceneApiError(grant === "password" && response.status === 400 ? "INVALID_CREDENTIALS" : "UNAUTHENTICATED", response.status, null);
    const result = await response.json() as AuthResponse;
    if (!result.access_token || !result.refresh_token || !result.user?.id || !Number.isFinite(result.expires_in)) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    return result;
  }
  private acceptAuth(result: AuthResponse) {
    this.tokens = { access: result.access_token, refresh: result.refresh_token, expiresAt: result.expires_at ? result.expires_at * 1000 : Date.now() + result.expires_in * 1000 };
    this.update({ user: result.user });
  }
  private async accessToken(): Promise<string | null> {
    if (!this.tokens) return null;
    if (this.tokens.expiresAt > Date.now() + 30_000) return this.tokens.access;
    if (!this.refresh) {
      const epoch = this.epoch;
      const refreshToken = this.tokens.refresh;
      this.refresh = this.authRequest("refresh_token", { refresh_token: refreshToken }).then(result => {
        if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
        this.acceptAuth(result);
        return result.access_token;
      }).finally(() => { this.refresh = null; });
    }
    return this.refresh;
  }
  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const epoch = this.epoch;
    try {
      this.requireConfig();
      const result = await this.client.request<T>(path, method, body);
      if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
      return result;
    } catch (error) {
      if (epoch === this.epoch) {
        if (error instanceof SceneApiError && (error.status === 401 || error.code === "UNAUTHENTICATED")) {
          this.tokens = null;
          this.update({ user: null });
        }
        // Any uncertain response stops cloud writes; never retry a save automatically.
        this.block(error);
      }
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<BackendUser> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    this.stopRenewal();
    const epoch = ++this.epoch;
    this.tokens = null;
    this.update({ user: null, lease: null, writeBlocked: true });
    try {
      const result = await this.authRequest("password", { email: email.trim(), password });
      if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
      this.acceptAuth(result);
      this.update({ status: "ready", error: null });
      return result.user;
    } catch (error) {
      if (epoch === this.epoch) this.block(error);
      throw error;
    }
  }
  async signOut(): Promise<void> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    try { if (this.snapshot.lease && !this.snapshot.writeBlocked) await this.releaseLease(); } catch { /* Lease expires within 90 seconds; draft remains. */ }
    const token = this.tokens?.access;
    ++this.epoch;
    this.tokens = null;
    this.stopRenewal();
    this.update({ user: null, lease: null, status: this.config.configured ? "signed_out" : "unconfigured", writeBlocked: true, error: null });
    if (token) {
      try {
        await fetch(`${this.config.url}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: this.config.anonKey, Authorization: `Bearer ${token}` } });
      } catch { /* Local credentials have already been discarded. */ }
    }
  }
  listStudios(): Promise<Studio[]> { return this.request("/studios"); }
  listProjects(): Promise<ProjectSummary[]> { return this.request("/projects"); }
  /** Resolve only referenced GLB IDs; signed URLs remain transient renderer inputs. */
  async authorizeAssets(scene: Scene): Promise<AuthorizedAssets> {
    const epoch = this.epoch;
    try {
      const parsed = sceneSchema.parse(scene);
      const ids = [...new Set(parsed.objects.flatMap(object => object.assetId ? [object.assetId] : []))];
      const assets = await Promise.all(ids.map(async assetId => {
        const result = await this.request<unknown>(`/assets/${encodeURIComponent(assetId)}/url`, "POST");
        if (!result || typeof result !== "object") throw new SceneApiError("ASSET_AUTHORIZATION_INVALID", 502, null);
        const asset = result as Record<string, unknown>;
        if (asset.id !== assetId || asset.format !== "glb" || typeof asset.name !== "string" || !asset.name.trim() ||
            typeof asset.url !== "string" || typeof asset.expiresIn !== "number" || !Number.isFinite(asset.expiresIn) || asset.expiresIn <= 0 || asset.expiresIn > 300) {
          throw new SceneApiError("ASSET_AUTHORIZATION_INVALID", 502, null);
        }
        let url: URL;
        try { url = new URL(asset.url); }
        catch { throw new SceneApiError("ASSET_AUTHORIZATION_INVALID", 502, null); }
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.hash) {
          throw new SceneApiError("ASSET_AUTHORIZATION_INVALID", 502, null);
        }
        return { id: assetId, url: url.href, name: asset.name };
      }));
      if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
      return {
        assetUrls: Object.fromEntries(assets.map(asset => [asset.id, asset.url])),
        assetNames: Object.fromEntries(assets.map(asset => [asset.id, asset.name])),
      };
    } catch (error) {
      if (epoch === this.epoch) this.block(error);
      throw error;
    }
  }
  private ensureCanSwitch() {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    if (this.snapshot.lease && !this.snapshot.writeBlocked) throw new SceneApiError("PROJECT_SWITCH_REQUIRES_RELEASE", 409, null);
  }
  private selectProject(project: BackendProject) {
    const scene = sceneSchema.parse(project.scene);
    this.update({ project: { ...project, scene }, revision: project.revision, draft: scene, dirty: false, localRevision: this.snapshot.localRevision + 1, lease: null, writeBlocked: true, status: "ready", error: null });
  }
  async createProject(studioId: string, name: string, scene: Scene): Promise<BackendProject> {
    this.ensureCanSwitch();
    this.operationPending = true;
    try {
      const project = await this.request<BackendProject>("/projects", "POST", { studioId, name, scene: sceneSchema.parse(scene) });
      this.selectProject(project);
      return project;
    } finally { this.operationPending = false; }
  }
  async getProject(projectId: string, validate?: (project: BackendProject) => void): Promise<BackendProject> {
    this.ensureCanSwitch();
    this.operationPending = true;
    try {
      const project = await this.request<BackendProject>(`/projects/${encodeURIComponent(projectId)}`);
      // The renderer can reject unsupported geometry before changing the active project.
      validate?.(project);
      this.selectProject(project);
      return project;
    } catch (error) {
      this.block(error);
      throw error;
    } finally { this.operationPending = false; }
  }
  async acquireLease(projectId: string, validate?: (scene: Scene, project: BackendProject) => void): Promise<LeaseResponse & { scene: Scene }> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    if (this.snapshot.lease && !this.snapshot.writeBlocked && this.snapshot.lease.projectId !== projectId) throw new SceneApiError("PROJECT_SWITCH_REQUIRES_RELEASE", 409, null);
    this.operationPending = true;
    let acquired: LeaseResponse | null = null;
    try {
      const project = this.snapshot.project?.id === projectId ? this.snapshot.project : await this.request<BackendProject>(`/projects/${encodeURIComponent(projectId)}`);
      const result = await this.request<LeaseResponse & { scene: Scene }>(`/projects/${encodeURIComponent(projectId)}/lease/acquire`, "POST", { sessionId: this.snapshot.sessionId });
      acquired = result;
      const scene = sceneSchema.parse(result.scene);
      if (result.sessionId !== this.snapshot.sessionId || !Number.isFinite(Date.parse(result.expiresAt))) throw new SceneApiError("INVALID_RESPONSE", 502, null);
      validate?.(scene, project);
      this.stopRenewal();
      this.update({ lease: { projectId, sessionId: result.sessionId, generation: result.generation, expiresAt: result.expiresAt, revision: result.revision }, revision: result.revision, draft: scene, project: { ...project, scene, revision: result.revision }, dirty: false, localRevision: this.snapshot.localRevision + 1, writeBlocked: false, status: "editing", error: null });
      this.timer = setInterval(() => { void this.renewLease().catch(() => { /* Exposed through snapshot.error. */ }); }, 30_000);
      return { ...result, scene };
    } catch (error) {
      // A supported JSON schema can still be unsupported by this editor. Release the
      // just-acquired lease without ever making its scene writable or replacing the draft.
      if (acquired?.sessionId === this.snapshot.sessionId) {
        try {
          await this.client.request(`/projects/${encodeURIComponent(projectId)}/lease/release`, "POST", { sessionId: acquired.sessionId, generation: acquired.generation });
        } catch { /* A failed release remains blocked locally and expires server-side. */ }
      }
      this.block(error);
      throw error;
    } finally { this.operationPending = false; }
  }
  private writableLease(): Lease {
    const lease = this.snapshot.lease;
    if (this.snapshot.writeBlocked || !lease) throw new SceneApiError("CLOUD_WRITE_BLOCKED", 409, null);
    if (Date.parse(lease.expiresAt) <= Date.now()) {
      const error = new SceneApiError("LEASE_LOST", 409, null);
      this.block(error);
      throw error;
    }
    return lease;
  }
  async renewLease(): Promise<void> {
    if (this.renewing || this.operationPending) return;
    const lease = this.writableLease();
    this.renewing = true;
    try {
      const result = await this.request<LeaseResponse>(`/projects/${lease.projectId}/lease/renew`, "POST", { sessionId: lease.sessionId, generation: lease.generation });
      if (this.snapshot.lease === lease && !this.snapshot.writeBlocked) this.update({ lease: { ...lease, expiresAt: result.expiresAt } });
    } finally { this.renewing = false; }
  }
  async releaseLease(): Promise<void> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    const lease = this.writableLease();
    this.operationPending = true;
    this.stopRenewal();
    try {
      await this.request(`/projects/${lease.projectId}/lease/release`, "POST", { sessionId: lease.sessionId, generation: lease.generation });
      this.update({ lease: null, writeBlocked: true, status: "ready", error: null });
    } finally { this.operationPending = false; }
  }
  /** UI may call after each local change; this never writes to the server. */
  setDraft(scene: Scene): void {
    this.update({ draft: sceneSchema.parse(scene), dirty: true, localRevision: this.snapshot.localRevision + 1 });
  }
  async saveScene(scene: Scene): Promise<SaveResult> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    this.setDraft(scene);
    const lease = this.writableLease();
    const draft = this.snapshot.draft!;
    const localRevision = this.snapshot.localRevision;
    this.operationPending = true;
    this.update({ status: "saving", error: null });
    try {
      const result = await this.request<SaveResult>(`/projects/${lease.projectId}/scene`, "PUT", { sessionId: lease.sessionId, generation: lease.generation, expectedRevision: this.snapshot.revision, scene: draft });
      const saved = sceneSchema.parse(result.scene);
      const unchanged = this.snapshot.localRevision === localRevision;
      this.update({ revision: result.revision, lease: { ...(this.snapshot.lease ?? lease), revision: result.revision }, project: { ...this.snapshot.project!, scene: saved, revision: result.revision }, ...(unchanged ? { draft: saved, dirty: false } : {}), ...(!this.snapshot.writeBlocked ? { status: "editing", error: null } : {}) });
      return { ...result, scene: saved };
    } catch (error) {
      this.block(error);
      throw error;
    } finally { this.operationPending = false; }
  }
  /** Stop timers and invalidate in-flight responses; never discard the caller's editor draft. */
  dispose(): void {
    ++this.epoch;
    ++this.lifecycle;
    this.stopRenewal();
    this.tokens = null;
    this.update({ user: null, lease: null, writeBlocked: true, status: this.config.configured ? "signed_out" : "unconfigured" });
    this.listeners.clear();
  }
}

export function createBackendSession(config?: BackendConfig): BackendSession { return new BackendSession(config); }
export function useBackendSession(controller: BackendSession): BackendSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
