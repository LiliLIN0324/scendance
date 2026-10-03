"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { assertFreshProposal, createSceneClient, SceneApiError, type EditorState, type Proposal } from "../../client/scene-client";
import { agentRunRequestSchema, agentRunSchema, type AgentRun, type AgentRunRequest } from "../../supabase/functions/_shared/agent-contract";
import { resolvedMaterialSuggestionSchema, type MaterialSuggestion } from "../../supabase/functions/_shared/agent-material-contract";
import { materialVariantProposalRequestSchema } from "../../supabase/functions/_shared/asset-customization-contract";
import { canonical, proposalRequestSchema, sceneSchema, uuid, type Scene } from "../../supabase/functions/_shared/domain";
import { generationRequestSchema, type GenerationRequest } from "../../supabase/functions/_shared/generation-contract";
import { reconstructionRequestSchema, reconstructionJobSchema, sourceImageSchema, type ReconstructionRequest, type SourceImage } from "../../supabase/functions/_shared/reconstruction-contract";
export { SceneApiError };
export type { AgentRun };
export type AgentRunInput = Pick<AgentRunRequest, "requestId" | "scene" | "selectedIds" | "instruction" | "context" | "jevEnabled" | "executionMode">;
export type { SourceImage, DimensionConstraint, SceneV2 } from "../../supabase/functions/_shared/reconstruction-contract";
export type ReconstructionJob = Pick<z.infer<typeof reconstructionJobSchema>, 'id' | 'state' | 'candidate' | 'issues' | 'error_code'> & { proposal?: SceneProposal | null | undefined };
export type ReconstructionInput = Pick<ReconstructionRequest, 'scene' | 'sources' | 'dimensions' | 'mode' | 'instruction' | 'selectedIds' | 'reviewedScene' | 'reviewedJobId'> & { requestId: string };
function parseReconstructionJob(input: unknown): ReconstructionJob {
  const parsed = reconstructionJobSchema.parse(input);
  return {...parsed, proposal: parsed.proposal ? proposalResponseSchema.parse(parsed.proposal) : parsed.proposal};
}
export type { Scene };

export interface BackendConfig {
  configured: boolean;
  url: string;
  anonKey: string;
  apiUrl: string;
  error: string | null;
}

/** Only public configuration belongs in a browser bundle. Auth tokens are stored per tab; lease identities are never persisted. */
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
  recoveryReady: boolean;
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
/** Actual /proposals response from scene_private.proposals. */
export interface SceneProposal extends Proposal {
  user_id: string;
  base_scene: Scene;
  explanation: string;
  warnings: { code: string; ids: string[] }[];
  modelSuggestions?: { name: string; reason: string; prompt: string }[] | undefined;
  materialSuggestions?: MaterialSuggestion[] | undefined;
}
export interface SceneProposalInput {
  mode: "layout" | "modify";
  prompt: string;
  scene: Scene;
  selectedIds?: string[];
  requestId?: string;
}
/** Applying a proposal saves it on the server; do not issue a second save. */
export interface ApplySceneProposalResult {
  id: string; revision: number; scene: Scene; updatedAt: string;
  previousScene: Scene; undoGroup: string;
  /** False when the user edited locally while the apply request was in flight. */
  acceptedLocally: boolean;
}
const dateString = z.string().refine(value => Number.isFinite(Date.parse(value)));
const proposalResponseSchema = z.object({
  id: uuid, project_id: uuid, user_id: z.string().min(1), session_id: uuid,
  generation: z.number().int().positive(), base_revision: z.number().int().nonnegative(),
  local_revision: z.number().int().nonnegative(), base_hash: z.string().regex(/^[a-f0-9]{64}$/),
  base_scene: sceneSchema, candidate: sceneSchema, explanation: z.string(),
  warnings: z.array(z.object({ code: z.string(), ids: z.array(uuid) })),
  modelSuggestions: z.array(z.object({ name: z.string().min(1).max(120), reason: z.string().min(1).max(500), prompt: z.string().min(1).max(1024) })).max(3).optional(),
  materialSuggestions: z.array(resolvedMaterialSuggestionSchema).max(3).optional(),
  expires_at: dateString, applied_at: dateString.nullable(),
});
const applyProposalResponseSchema = z.object({
  id: uuid, revision: z.number().int().nonnegative(), scene: sceneSchema,
  updatedAt: dateString, previousScene: sceneSchema, undoGroup: uuid,
});
const generationJobSchema = z.object({
  id: uuid, owner_id: z.string().min(1), prompt: z.string(),
  kind: z.enum(['text','image','texture']).optional(), source_asset_id: uuid.nullable().optional(),
  reference_image_asset_id: uuid.nullable().optional(), provider_model: z.string().nullable().optional(),
  provider_mode: z.enum(['tokenhub','legacy']).nullable().optional(),
  state: z.enum(["queued", "submitting", "submitted", "processing", "archiving", "ready", "added", "failed", "rejected", "submit_unknown"]),
  provider_job_id: z.string().nullable(), asset_id: uuid.nullable(),
  next_poll_at: dateString, attempts: z.number().int().nonnegative(), error_code: z.string().nullable(),
  provider_usage: z.unknown(), created_at: dateString, updated_at: dateString, reused: z.boolean().optional(),
}).refine(job => !["ready", "added"].includes(job.state) || job.asset_id !== null);
export type GenerationJob = z.infer<typeof generationJobSchema>;
const generationCapabilitiesSchema = z.object({ model: z.string(), textToModel: z.boolean(), imageToModel: z.boolean(), texture: z.boolean(), textureRequiresImage: z.literal(true) });
export type GenerationCapabilities = z.infer<typeof generationCapabilitiesSchema>;
interface PaidRequest<T> { fingerprint: string; promise?: Promise<T>; result?: T }
interface RequestScope {
  projectId: string | null;
  lease: Pick<Lease, "projectId" | "sessionId" | "generation"> | null;
}
type LeaseResponse = Omit<Lease, "projectId">;

function failure(error: unknown): BackendFailure {
  const localCode = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : null;
  const code = error instanceof SceneApiError ? error.code : localCode ?? (error instanceof Error && error.name === "ZodError" ? "INVALID_RESPONSE" : "NETWORK_ERROR");
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "登录已失效，草稿已保留，请重新登录并获取编辑权。",
    STUDIO_NOT_EMPTY: "工作室中仍有项目，请先处理其中的项目后再删除。",
    STUDIO_NOT_FOUND: "工作室已不存在，或你已没有访问权限，请刷新列表。",
    FORBIDDEN: "你没有执行此操作的权限，请联系工作室负责人。",
    OWNER_PROTECTED: "不能移除工作室负责人。",
    USER_NOT_FOUND: "未找到该账号，请核对成员提供的账号 ID。",
    INVALID_CREDENTIALS: "邮箱或密码不正确。",
    REVISION_CONFLICT: "云端版本已变化，草稿已保留；请核对后重新获取编辑权。",
    LEASE_LOST: "编辑权已到期或交接，草稿已保留。",
    LEASE_BUSY: "另一编辑会话正在使用此项目。",
    PROJECT_BUSY: "项目仍有人持有编辑权，请先释放或等待到期后再删除。",
    RECONSTRUCTION_BUSY: "项目正在生成方案，请等待任务完成后再删除。",
    NETWORK_ERROR: "连接失败，草稿已保留，云端写入已暂停。",
    CLOUD_WRITE_BLOCKED: "请先获取有效编辑权再保存。",
    CLOUD_OPERATION_BUSY: "上一个保存或交接仍在进行。",
    CONFIGURATION_MISSING: "云端连接尚未配置。",
    INVALID_RESPONSE: "云端返回的数据格式无效。",
    ASSET_AUTHORIZATION_INVALID: "云端模型的授权信息无效，未替换当前画布，草稿已保留。",
    SESSION_CHANGED: "会话已变化，请重新操作。",
    DAILY_BUDGET_EXCEEDED: "今天的 AI 额度已用完，请明天再试。",
    BUDGET_EXCEEDED: "工作室 AI 总额度已用完，请联系管理员。",
    SERVICE_NOT_CONFIGURED: "AI 服务尚未配置，请联系工作室管理员。",
    BILLING_NOT_CONFIGURED: "AI 费用限制尚未配置，请联系工作室管理员。",
    AI_INVALID_PROPOSAL: "AI 未能生成可用方案，请调整要求后重试。",
    AI_INPUT_TOO_LARGE: "场景内容过长，请缩短物件备注或需求后重试。",
    PROVIDER_HTTP_ERROR: "AI 服务暂时不可用，请稍后手动重试。",
    PROVIDER_INVALID_JSON: "AI 服务返回异常，请稍后手动重试。",
    PROVIDER_TIMEOUT: "AI 响应超时，请稍后手动重试。",
    PROJECT_SWITCH_REQUIRES_RELEASE: "请先交接当前项目的编辑权。",
    STALE_PROPOSAL: "方案生成期间场景或编辑权已变化，请根据当前场景重新生成。",
    LAYOUT_REQUIRES_EMPTY_SCENE: "生成初稿需要空白场景；已有物料请使用修改方案。",
    AI_BUSY: "已有方案正在生成，请等待本次请求完成。",
    GENERATION_BUSY: "已有模型生成任务正在处理，请先查看任务状态。",
    IDEMPOTENCY_CONFLICT: "同一请求编号不能用于不同需求，请创建新的请求。",
  };
  return { code, status: error instanceof SceneApiError ? error.status : 0, message: messages[code] ?? (localCode && error instanceof Error ? error.message : `云端操作失败（${code}），草稿已保留。`) };
}

export class BackendSession {
  readonly config: BackendConfig;
  private snapshot: BackendSnapshot;
  private readonly listeners = new Set<() => void>();
  private tokens: Tokens | null = null;
  private recoveryTokens: Tokens | null = null;
  private refresh: Promise<string> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private operationPending = false;
  private renewing = false;
  private epoch = 0;
  private owners = 0;
  private lifecycle = 0;
  private readonly proposalRequestIds = new Map<string, string>();
  private lastAppliedReconstruction: { proposal: SceneProposal; epoch: number } | null = null;
  private readonly proposalRequests = new Map<string, PaidRequest<SceneProposal>>();
  private readonly generationRequests = new Map<string, PaidRequest<GenerationJob>>();
  private proposalPending = false;
  private generationPending = false;
  private readonly client: ReturnType<typeof createSceneClient>;

  constructor(config: BackendConfig = getBackendConfig(), private readonly storage?: Storage) {
    this.config = config;
    // Never persist this in local/sessionStorage: duplicated tabs must not share a lease identity.
    const sessionId = crypto.randomUUID();
    this.snapshot = {
      configured: config.configured, sessionId, user: null, recoveryReady: false, project: null, lease: null, revision: null,
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
    if (!result.access_token || !result.refresh_token || !result.user?.id || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    this.tokens = { access: result.access_token, refresh: result.refresh_token, expiresAt: result.expires_at ? result.expires_at * 1000 : Date.now() + result.expires_in * 1000 };
    this.persistTokens();
    this.update({ user: result.user });
  }
  private persistTokens() {
    try {
      const key = `scendance:auth:${this.config.url}`;
      if (this.tokens) this.storage?.setItem(key, JSON.stringify(this.tokens));
      else this.storage?.removeItem(key);
    } catch { /* Storage restrictions should not prevent the current sign-in. */ }
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
  private captureRequestScope(projectId = this.snapshot.project?.id ?? null): RequestScope {
    const lease = this.snapshot.lease;
    return { projectId, lease: lease?.projectId === projectId
      ? { projectId: lease.projectId, sessionId: lease.sessionId, generation: lease.generation } : null };
  }
  private isCurrentRequestScope(scope: RequestScope): boolean {
    const current = this.captureRequestScope();
    return current.projectId === scope.projectId && current.lease?.projectId === scope.lease?.projectId &&
      current.lease?.sessionId === scope.lease?.sessionId && current.lease?.generation === scope.lease?.generation;
  }
  private async request<T>(path: string, method = "GET", body?: unknown, scope = this.captureRequestScope(), blocksWrites: boolean | "business" = true): Promise<T> {
    const epoch = this.epoch;
    try {
      this.requireConfig();
      const result = await this.client.request<T>(path, method, body);
      if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
      return result;
    } catch (error) {
      if (epoch === this.epoch && this.isCurrentRequestScope(scope)) {
        if (error instanceof SceneApiError && (error.status === 401 || error.code === "UNAUTHENTICATED")) {
          this.tokens = null;
          this.persistTokens();
          this.update({ user: null });
        }
        // Uncertainty blocks only the project/lease that made this request. A
        // late response from a handed-off editor must not stop the new lease.
        const permissionLost = error instanceof SceneApiError && (error.status === 401 || ["LEASE_LOST", "REVISION_CONFLICT"].includes(error.code));
        const materialPreviewFailure = path.endsWith('/material-variants') && error instanceof SceneApiError && ['VALIDATION_ERROR','MATERIAL_VARIANT_SELECTION_INVALID','OBJECT_LOCKED','MATERIAL_VARIANT_MISMATCH','ASSET_NOT_GLB','DIMENSION_CONFLICT','STRUCTURAL_COLLISION','IDEMPOTENCY_CONFLICT'].includes(error.code);
        const serviceFailure = materialPreviewFailure || error instanceof SceneApiError && ["SERVICE_NOT_CONFIGURED", "BILLING_NOT_CONFIGURED", "BUDGET_EXCEEDED", "DAILY_BUDGET_EXCEEDED", "AI_BUSY", "AI_IN_PROGRESS", "AI_PREVIOUS_REQUEST_FAILED", "AI_INVALID_PROPOSAL", "AI_INPUT_TOO_LARGE", "PROVIDER_HTTP_ERROR", "PROVIDER_INVALID_JSON", "PROVIDER_TIMEOUT", "GENERATION_BUSY"].includes(error.code);
        if (permissionLost || blocksWrites === true || (blocksWrites === false && !serviceFailure)) this.block(error);
        else this.update({ error: failure(error) });
      }
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<BackendUser> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    this.stopRenewal();
    const epoch = ++this.epoch;
    this.tokens = null;
    this.recoveryTokens = null;
    this.persistTokens();
    this.update({ user: null, recoveryReady: false, lease: null, writeBlocked: true });
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
  private async verifyUser(access: string): Promise<BackendUser> {
    const response = await fetch(`${this.config.url}/auth/v1/user`, {
      headers: { apikey: this.config.anonKey, Authorization: `Bearer ${access}` }, cache: "no-store",
    });
    if (!response.ok) throw new SceneApiError(response.status === 401 || response.status === 403 ? "UNAUTHENTICATED" : "NETWORK_ERROR", response.status, null);
    const user = await response.json() as BackendUser;
    if (!user.id) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    return user;
  }
  async restoreSession(): Promise<void> {
    if (!this.config.configured || this.tokens) return;
    let stored: Tokens | null = null;
    try { stored = JSON.parse(this.storage?.getItem(`scendance:auth:${this.config.url}`) ?? "null"); } catch { return; }
    if (!stored?.access || !stored.refresh || !Number.isFinite(stored.expiresAt)) return;
    const epoch = this.epoch;
    try {
      if (stored.expiresAt <= Date.now() + 30_000) {
        const result = await this.authRequest("refresh_token", { refresh_token: stored.refresh });
        if (epoch !== this.epoch) return;
        this.acceptAuth(result);
      } else {
        const user = await this.verifyUser(stored.access);
        if (epoch !== this.epoch) return;
        this.tokens = stored;
        this.update({ user });
      }
      this.update({ status: "ready", error: null });
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.tokens = null;
      // Keep the saved session on a transient network failure so a reload can retry.
      if (error instanceof SceneApiError && error.code === "UNAUTHENTICATED") this.persistTokens();
      this.block(error);
    }
  }
  async acceptCallback(hash: string, expectedType?: "recovery"): Promise<void> {
    const values = new URLSearchParams(hash.replace(/^#/, ""));
    if (expectedType && values.get("type") !== expectedType) throw new Error("请使用密码重置邮件中的验证码或链接。");
    if (values.has("error")) throw new Error("验证链接已失效，请返回登录页重新注册或登录。");
    const access = values.get("access_token"), refresh = values.get("refresh_token");
    const expires = Number(values.get("expires_in"));
    if (!access || !refresh || !Number.isFinite(expires) || expires <= 0) throw new Error("验证链接不完整，请重新打开邮件中的链接。");
    const epoch = this.epoch;
    const user = await this.verifyUser(access);
    if (epoch !== this.epoch) return;
    if (values.get("type") === "recovery") {
      this.recoveryTokens = { access, refresh, expiresAt: Date.now() + expires * 1000 };
      this.update({ recoveryReady: true });
      return;
    }
    this.acceptAuth({ access_token: access, refresh_token: refresh, expires_in: expires, user });
    this.update({ status: "ready", error: null });
  }
  private async emailAuthRequest(path: string, body: unknown, access?: string): Promise<AuthResponse> {
    this.requireConfig();
    const response = await fetch(`${this.config.url}/auth/v1/${path}`, {
      method: access ? "PUT" : "POST",
      headers: { apikey: this.config.anonKey, "Content-Type": "application/json", ...(access ? { Authorization: `Bearer ${access}` } : {}) },
      body: JSON.stringify(body), cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) {
      const code = result.code ?? result.error_code;
      if (path.startsWith("recover?") && code === "user_not_found") return result;
      const messages: Record<string, string> = {
        user_already_exists: "该邮箱已注册，请切换到登录。",
        weak_password: "请使用至少 12 位、更难猜测的密码。",
        same_password: "新密码不能与旧密码相同。",
        email_address_invalid: "请输入有效的邮箱地址。",
        over_email_send_rate_limit: "发送邮件过于频繁，请稍后再试。",
        over_request_rate_limit: "操作过于频繁，请稍后再试。",
        over_email_send_daily_limit: "今天的邮件发送额度已用完，请稍后再试。",
        email_address_not_authorized: "验证邮件服务尚未开放，请联系管理员。",
        signup_disabled: "注册暂未开放，请稍后再试。",
        otp_expired: "验证码已失效或不正确，请重新获取验证码。",
        email_not_confirmed: "请先使用邮件中的验证码确认邮箱。",
        reauthentication_needed: "验证已失效，请重新获取验证码。",
      };
      throw new Error(messages[code] ?? (response.status === 429 ? "操作过于频繁，请稍后再试。" : "验证服务暂时不可用，请稍后重试。"));
    }
    return result;
  }
  async resendSignup(email: string, redirectTo: string): Promise<void> {
    await this.emailAuthRequest(`resend?redirect_to=${encodeURIComponent(redirectTo)}`, { type: "signup", email: email.trim() });
  }
  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    await this.emailAuthRequest(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email: email.trim() });
  }
  async verifyEmailCode(email: string, token: string, type: "signup" | "recovery"): Promise<void> {
    if (!/^\d{6}$/.test(token)) throw new Error("请输入六位数字验证码。");
    const epoch = this.epoch;
    const result = await this.emailAuthRequest("verify", { email: email.trim(), token, type });
    if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
    if (!result.access_token || !result.refresh_token || !result.user?.id || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    if (type === "recovery") {
      this.recoveryTokens = { access: result.access_token, refresh: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000 };
      this.update({ recoveryReady: true, error: null });
    } else {
      this.acceptAuth(result);
      this.update({ status: "ready", error: null });
    }
  }
  async updatePassword(password: string): Promise<{ signedOutEverywhere: boolean }> {
    const recovery = this.recoveryTokens;
    if (!recovery || recovery.expiresAt <= Date.now()) throw new Error("验证已失效，请重新获取验证码。");
    if (password.length < 12) throw new Error("请使用至少 12 位、更难猜测的密码。");
    const epoch = this.epoch;
    await this.emailAuthRequest("user", { password }, recovery.access);
    if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
    ++this.epoch;
    this.tokens = null;
    this.recoveryTokens = null;
    this.persistTokens();
    this.stopRenewal();
    this.update({ user: null, recoveryReady: false, project: null, lease: null, revision: null, status: "signed_out", writeBlocked: true, error: null });
    try {
      const response = await fetch(`${this.config.url}/auth/v1/logout?scope=global`, { method: "POST", headers: { apikey: this.config.anonKey, Authorization: `Bearer ${recovery.access}` } });
      return { signedOutEverywhere: response.ok };
    } catch { return { signedOutEverywhere: false }; }
  }
  clearPasswordRecovery(): void {
    ++this.epoch;
    this.recoveryTokens = null;
    this.update({ recoveryReady: false });
  }
  async signUp(email: string, password: string, displayName: string, redirectTo: string): Promise<boolean> {
    const epoch = this.epoch;
    const result = await this.emailAuthRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, { email: email.trim(), password, data: { display_name: displayName.trim().slice(0, 80) } });
    if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
    if (result.access_token && result.refresh_token && result.user?.id && Number.isFinite(result.expires_in)) {
      this.acceptAuth(result);
      this.update({ status: "ready", error: null });
      return true;
    }
    return false;
  }
  async signOut(): Promise<void> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    try { if (this.snapshot.lease && !this.snapshot.writeBlocked) await this.releaseLease(); } catch { /* Lease expires within 90 seconds; draft remains. */ }
    const token = this.tokens?.access;
    ++this.epoch;
    this.tokens = null;
    this.recoveryTokens = null;
    this.persistTokens();
    this.stopRenewal();
    this.update({ user: null, recoveryReady: false, lease: null, status: this.config.configured ? "signed_out" : "unconfigured", writeBlocked: true, error: null });
    if (token) {
      try {
        await fetch(`${this.config.url}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: this.config.anonKey, Authorization: `Bearer ${token}` } });
      } catch { /* Local credentials have already been discarded. */ }
    }
  }
  listStudios(): Promise<Studio[]> { return this.request("/studios"); }
  listProjects(): Promise<ProjectSummary[]> { return this.request("/projects"); }
  /** Asset, sharing and membership operations reuse the authenticated session. */
  businessRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    return this.request<T>(path, method, body, this.captureRequestScope(), "business");
  }
  async deleteProject(projectId: string, expectedRevision: number): Promise<void> {
    this.ensureCanSwitch();
    this.operationPending = true;
    try {
      const result = await this.businessRequest<{ deleted: boolean }>(`/projects/${uuid.parse(projectId)}`, "DELETE", { expectedRevision });
      if (result.deleted !== true) throw new Error('项目删除结果无效，请刷新列表核对。');
      if (this.snapshot.project?.id === projectId) {
        this.stopRenewal();
        this.update({ project: null, lease: null, revision: null, writeBlocked: true, status: "ready", error: null });
      }
    } finally { this.operationPending = false; }
  }
  async renameProject(name: string): Promise<BackendProject> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    const lease = this.writableLease();
    this.operationPending = true;
    try {
      const project = await this.request<BackendProject>(`/projects/${lease.projectId}`, "PATCH", {
        name, sessionId: lease.sessionId, generation: lease.generation, expectedRevision: this.snapshot.revision,
      });
      this.update({ project: { ...this.snapshot.project!, ...project }, revision: project.revision,
        lease: { ...(this.snapshot.lease ?? lease), revision: project.revision } });
      return project;
    } finally { this.operationPending = false; }
  }
  async authorizeAsset(assetId: string, scope = this.captureRequestScope()): Promise<{ id: string; url: string; name: string }> {
    uuid.parse(assetId);
    const result = await this.request<unknown>(`/assets/${encodeURIComponent(assetId)}/url`, "POST", undefined, scope, "business");
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
  }
  /** Resolve only referenced GLB IDs; signed URLs remain transient renderer inputs. */
  async authorizeAssets(scene: Scene): Promise<AuthorizedAssets> {
    const epoch = this.epoch;
    const scope = this.captureRequestScope();
    try {
      const parsed = sceneSchema.parse(scene);
      const ids = [...new Set(parsed.objects.flatMap(object => object.assetId ? [object.assetId] : []))];
      const assets = await Promise.all(ids.map(async assetId => {
        return this.authorizeAsset(assetId, scope);
      }));
      if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
      return {
        assetUrls: Object.fromEntries(assets.map(asset => [asset.id, asset.url])),
        assetNames: Object.fromEntries(assets.map(asset => [asset.id, asset.name])),
      };
    } catch (error) {
      if (epoch === this.epoch && this.isCurrentRequestScope(scope)) this.block(error);
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
  private proposalState(scene: Scene): EditorState {
    const parsed = sceneSchema.parse(scene);
    const lease = this.writableLease();
    if (this.snapshot.project?.id !== lease.projectId || this.snapshot.revision === null) throw new SceneApiError("CLOUD_WRITE_BLOCKED", 409, null);
    // Synchronize an edit that has not yet reached the React draft effect. Equal
    // snapshots must not invalidate a proposal merely because it was previewed.
    if (canonical(this.snapshot.draft) !== canonical(parsed)) this.setDraft(parsed);
    return { projectId: lease.projectId, sessionId: lease.sessionId, generation: lease.generation,
      expectedRevision: this.snapshot.revision, localRevision: this.snapshot.localRevision, scene: parsed };
  }
  private assertProposalContext(state: EditorState): void {
    if (!this.isCurrentRequestScope({ projectId: state.projectId, lease: state })) throw new SceneApiError("STALE_PROPOSAL", 409, null);
    const lease = this.writableLease();
    if (lease.projectId !== state.projectId || lease.sessionId !== state.sessionId || lease.generation !== state.generation ||
        this.snapshot.project?.id !== state.projectId || this.snapshot.revision !== state.expectedRevision ||
        this.snapshot.localRevision !== state.localRevision || canonical(this.snapshot.draft) !== canonical(state.scene)) {
      throw new SceneApiError("STALE_PROPOSAL", 409, null);
    }
  }
  /** Generate a preview only. Requests never change or save the scene. */
  async requestProposal(input: SceneProposalInput): Promise<SceneProposal> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    const parsed = sceneSchema.parse(input.scene);
    if (input.mode === "layout" && parsed.objects.length > 0) throw new SceneApiError("LAYOUT_REQUIRES_EMPTY_SCENE", 422, null);
    const state = this.proposalState(parsed);
    const epoch = this.epoch;
    const requestInput = { projectId: state.projectId, sessionId: state.sessionId, generation: state.generation,
      expectedRevision: state.expectedRevision, localRevision: state.localRevision, scene: parsed,
      instruction: input.prompt.trim(), mode: input.mode, selectedIds: [...new Set(input.selectedIds ?? [])].sort() };
    const fingerprint = canonical(requestInput);
    const contextKey = `${epoch}:${fingerprint}`;
    let requestId = input.requestId ?? this.proposalRequestIds.get(contextKey) ?? crypto.randomUUID();
    let key = `${epoch}:${requestId}`;
    let existing = this.proposalRequests.get(key);
    if (existing?.result && (existing.result.applied_at !== null || Date.parse(existing.result.expires_at) <= Date.now())) {
      // A new user invocation may regenerate a definitively completed proposal
      // that can no longer be applied. Uncertain failures have no result and
      // retain their original idempotency key instead.
      this.proposalRequests.delete(key);
      for (const [context, id] of this.proposalRequestIds) if (id === requestId) this.proposalRequestIds.delete(context);
      requestId = crypto.randomUUID();
      key = `${epoch}:${requestId}`;
      existing = undefined;
    }
    const body = proposalRequestSchema.parse({ ...requestInput, requestId });
    if (body.selectedIds.some(id => !body.scene.objects.some(object => object.id === id))) throw new SceneApiError("OBJECT_NOT_FOUND", 422, null);
    this.proposalRequestIds.set(contextKey, requestId);
    if (existing && existing.fingerprint !== fingerprint) throw new SceneApiError("IDEMPOTENCY_CONFLICT", 409, null);
    if (existing?.promise) {
      const proposal = await existing.promise;
      await assertFreshProposal(proposal, state);
      this.assertProposalContext(state);
      return proposal;
    }
    if (this.proposalPending) throw new SceneApiError("AI_BUSY", 409, null);
    const record: PaidRequest<SceneProposal> = { fingerprint };
    this.proposalRequests.set(key, record);
    this.proposalPending = true;
    record.promise = (async () => {
      try {
        // Keep renewal running during an AI call: generation may exceed 30 seconds.
        const proposal = proposalResponseSchema.parse(await this.request<unknown>(`/projects/${state.projectId}/proposals`, "POST", body, { projectId: state.projectId, lease: state }, false));
        if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
        await assertFreshProposal(proposal, state);
        this.assertProposalContext(state);
        if (canonical(proposal.base_scene) !== canonical(state.scene)) throw new SceneApiError("INVALID_RESPONSE", 502, null);
        record.result = proposal;
        return proposal;
      } catch (error) {
        // Keep the idempotency key after failure. A user retry reuses it; no
        // automatic retry may reserve a second paid request.
        delete record.promise;
        throw error;
      } finally { this.proposalPending = false; }
    })();
    return record.promise;
  }
  /** Start once; uncertain dispatches are recovered by request ID through GET. */
  async startAgentRun(input: AgentRunInput): Promise<AgentRun> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    const state = this.proposalState(input.scene);
    const body = agentRunRequestSchema.parse({ ...input, sessionId: state.sessionId, generation: state.generation, expectedRevision: state.expectedRevision, localRevision: state.localRevision });
    const run = agentRunSchema.parse(await this.request(`/projects/${state.projectId}/agent-runs`, 'POST', body, { projectId: state.projectId, lease: state }, false));
    if (run.projectId !== state.projectId || run.requestId !== input.requestId) throw new SceneApiError('INVALID_RESPONSE', 502, null);
    return run;
  }
  async getAgentRun(runId: string): Promise<AgentRun> {
    const projectId = this.snapshot.project?.id;
    if (!projectId) throw new SceneApiError('PROJECT_REQUIRED', 409, null);
    const run = agentRunSchema.parse(await this.businessRequest(`/projects/${projectId}/agent-runs/${uuid.parse(runId)}`));
    if (run.projectId !== projectId || run.id !== runId) throw new SceneApiError('INVALID_RESPONSE', 502, null);
    return run;
  }
  async getAgentRunByRequest(requestId: string): Promise<AgentRun> {
    const projectId = this.snapshot.project?.id;
    if (!projectId) throw new SceneApiError('PROJECT_REQUIRED', 409, null);
    const run = agentRunSchema.parse(await this.businessRequest(`/projects/${projectId}/agent-runs/by-request/${uuid.parse(requestId)}`));
    if (run.projectId !== projectId || run.requestId !== requestId) throw new SceneApiError('INVALID_RESPONSE', 502, null);
    return run;
  }
  async cancelAgentRun(runId: string): Promise<AgentRun> {
    const projectId = this.snapshot.project?.id;
    if (!projectId) throw new SceneApiError('PROJECT_REQUIRED', 409, null);
    const run = agentRunSchema.parse(await this.businessRequest(`/projects/${projectId}/agent-runs/${uuid.parse(runId)}/cancel`, 'POST'));
    if (run.projectId !== projectId || run.id !== runId) throw new SceneApiError('INVALID_RESPONSE', 502, null);
    return run;
  }
  /** Deterministic asset replacement prepares a preview; only applySceneProposal saves it. */
  async prepareMaterialVariantProposal(input: { requestId: string; scene: Scene; objectIds: string[]; sourceAssetId: string; variantAssetId: string }): Promise<SceneProposal> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    const state = this.proposalState(input.scene), epoch = this.epoch;
    const body = materialVariantProposalRequestSchema.parse({ sessionId: state.sessionId, generation: state.generation, expectedRevision: state.expectedRevision, localRevision: state.localRevision, ...input });
    const proposal = proposalResponseSchema.parse(await this.request(`/projects/${state.projectId}/material-variants`, "POST", body, { projectId: state.projectId, lease: state }, false));
    if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
    await assertFreshProposal(proposal, state);
    this.assertProposalContext(state);
    if (canonical(proposal.base_scene) !== canonical(state.scene)) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    return proposal;
  }
  async applySceneProposal(proposal: SceneProposal, scene: Scene): Promise<ApplySceneProposalResult> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    const state = this.proposalState(scene);
    const epoch = this.epoch;
    const scope: RequestScope = { projectId: state.projectId, lease: state };
    this.operationPending = true;
    try {
      const checked = proposalResponseSchema.parse(proposal);
      await assertFreshProposal(checked, state);
      this.assertProposalContext(state);
      this.update({ status: "saving", error: null });
      const result = applyProposalResponseSchema.parse(await this.request<unknown>(`/projects/${state.projectId}/proposals/apply`, "POST", {
        proposalId: checked.id, sessionId: state.sessionId, generation: state.generation,
        expectedRevision: state.expectedRevision, localRevision: state.localRevision, currentScene: state.scene,
      }, scope));
      if (epoch !== this.epoch) throw new SceneApiError("SESSION_CHANGED", 409, null);
      if (!this.isCurrentRequestScope(scope)) throw new SceneApiError("STALE_PROPOSAL", 409, null);
      if (result.id !== state.projectId || result.undoGroup !== checked.id || result.revision !== state.expectedRevision + 1 ||
          canonical(result.scene) !== canonical(checked.candidate) || canonical(result.previousScene) !== canonical(checked.base_scene)) {
        throw new SceneApiError("INVALID_RESPONSE", 502, null);
      }
      for (const record of this.proposalRequests.values()) {
        if (record.result?.id === checked.id) record.result = { ...record.result, applied_at: result.updatedAt };
      }
      const acceptedLocally = !this.snapshot.writeBlocked && this.snapshot.localRevision === state.localRevision &&
        canonical(this.snapshot.draft) === canonical(state.scene) && this.snapshot.lease?.generation === state.generation;
      this.update({ revision: result.revision, project: { ...this.snapshot.project!, revision: result.revision, scene: result.scene },
        ...(this.snapshot.lease ? { lease: { ...this.snapshot.lease, revision: result.revision } } : {}),
        ...(acceptedLocally ? { draft: result.scene, dirty: false, localRevision: this.snapshot.localRevision + 1 } : { dirty: true }),
        ...(!this.snapshot.writeBlocked ? { status: "editing", error: null } : {}),
      });
      if(checked.base_scene.schemaVersion===1&&checked.candidate.schemaVersion===2)this.lastAppliedReconstruction={proposal:checked,epoch:this.epoch};
      return { ...result, acceptedLocally };
    } catch (error) {
      // A stale preview is a local validation failure, not a loss of editing rights.
      if (epoch === this.epoch && this.isCurrentRequestScope(scope) && !(error instanceof SceneApiError && error.code === "STALE_PROPOSAL")) this.block(error);
      throw error;
    } finally { this.operationPending = false; }
  }
  /** Source bytes remain private; no base64 payload or credentials are persisted with a scene. */
  async uploadSource(file: Blob, name: string, kind: SourceImage['kind']): Promise<SourceImage> {
    this.requireConfig();
    const lease = this.writableLease();
    const scope = this.captureRequestScope();
    const epoch = this.epoch;
    const token = await this.accessToken();
    if (!token) throw new SceneApiError("UNAUTHENTICATED", 401, null);
    const form = new FormData(); form.append("file", file, name); form.append("projectId", lease.projectId); form.append("kind", kind);
    const response = await fetch(`${this.config.apiUrl}/assets/sources`, { method: "POST", headers: {Authorization: `Bearer ${token}`}, body: form, cache: "no-store" });
    const result = await response.json();
    if (epoch !== this.epoch || !this.isCurrentRequestScope(scope)) throw new SceneApiError("SESSION_CHANGED", 409, null);
    if (!response.ok) throw new SceneApiError(result.error?.code ?? "SOURCE_UPLOAD_FAILED", response.status, result.error?.details);
    return sourceImageSchema.parse(result);
  }
  async listSources(): Promise<SourceImage[]> {
    const projectId = this.snapshot.project?.id;
    if (!projectId) throw new SceneApiError("PROJECT_REQUIRED", 409, null);
    return z.array(sourceImageSchema).parse(await this.request(`/projects/${projectId}/sources`, 'GET', undefined, this.captureRequestScope(), false));
  }
  async removeSource(assetId: string): Promise<void> {
    const lease=this.writableLease();
    const result=await this.request<{removed:boolean}>(`/projects/${lease.projectId}/sources/${uuid.parse(assetId)}`, 'DELETE', undefined, this.captureRequestScope(), false);
    if(result.removed!==true)throw new SceneApiError('INVALID_RESPONSE',502,null);
  }
  async sourceImageUrl(assetId: string): Promise<string> {
    const result = await this.request<{id: string; url: string}>(`/assets/${uuid.parse(assetId)}/url`, "POST", undefined, this.captureRequestScope(), false);
    if (result.id !== assetId || typeof result.url !== 'string') throw new SceneApiError("INVALID_RESPONSE", 502, null);
    const url = new URL(result.url);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    return url.href;
  }
  async createReconstruction(input: ReconstructionInput): Promise<ReconstructionJob> {
    const state = this.proposalState(input.scene);
    const request = reconstructionRequestSchema.parse({ ...input, sessionId: state.sessionId, generation: state.generation, expectedRevision: state.expectedRevision, localRevision: state.localRevision });
    const job = parseReconstructionJob(await this.request(`/projects/${state.projectId}/reconstructions`, 'POST', request, {projectId:state.projectId,lease:state}, false));
    this.assertProposalContext(state);
    return job;
  }
  async getReconstruction(jobId: string): Promise<ReconstructionJob> {
    const projectId = this.snapshot.project?.id;
    if (!projectId) throw new SceneApiError("PROJECT_REQUIRED", 409, null);
    const job = parseReconstructionJob(await this.request(`/projects/${projectId}/reconstructions/${uuid.parse(jobId)}`, 'GET', undefined, this.captureRequestScope(), false));
    if (job.id !== jobId) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    return job;
  }
  async getGenerationCapabilities(): Promise<GenerationCapabilities> {
    return generationCapabilitiesSchema.parse(await this.businessRequest('/generation/capabilities'));
  }
  async uploadGenerationReference(file: File): Promise<{ id: string }> {
    if (!['image/png','image/jpeg'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('请选择 5 MB 以内的 PNG 或 JPEG 参考图。');
    this.requireConfig();
    const scope = this.captureRequestScope(), epoch = this.epoch, token = await this.accessToken();
    if (!token) throw new SceneApiError('UNAUTHENTICATED', 401, null);
    try {
      const response = await fetch(`${this.config.apiUrl}/assets/floorplan`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type }, body: file, cache: 'no-store' });
      if (epoch !== this.epoch || !this.isCurrentRequestScope(scope)) throw new SceneApiError('SESSION_CHANGED', 409, null);
      if (response.status === 401) throw new SceneApiError('UNAUTHENTICATED', 401, null);
      const result = await response.json();
      if (epoch !== this.epoch || !this.isCurrentRequestScope(scope)) throw new SceneApiError('SESSION_CHANGED', 409, null);
      if (!response.ok) throw new SceneApiError(result.error?.code ?? 'SOURCE_UPLOAD_FAILED', response.status, result.error?.details);
      return z.object({ id: uuid }).parse(result);
    } catch (error) {
      if (epoch === this.epoch && this.isCurrentRequestScope(scope)) {
        if (error instanceof SceneApiError && error.status === 401) {
          this.tokens = null; this.persistTokens(); this.update({ user: null }); this.block(error);
        } else this.update({ error: failure(error) });
      }
      throw error;
    }
  }
  async createGenerationJob(prompt: string, requestId: string, options?: Pick<GenerationRequest, 'kind' | 'referenceImageAssetId' | 'sourceAssetId'>): Promise<GenerationJob> {
    const parsed = generationRequestSchema.parse({ prompt: prompt.trim(), requestId, ...options });
    // Preserve the existing text request body and identity across reloads and upgrades.
    const body = parsed.kind === 'text' ? { prompt: parsed.prompt, requestId: parsed.requestId } : parsed;
    const fingerprint = canonical(body);
    const key = `${this.epoch}:${body.requestId}`;
    const existing = this.generationRequests.get(key);
    if (existing && existing.fingerprint !== fingerprint) throw new SceneApiError("IDEMPOTENCY_CONFLICT", 409, null);
    if (existing?.promise) return existing.promise;
    if (this.generationPending) throw new SceneApiError("GENERATION_BUSY", 409, null);
    const record: PaidRequest<GenerationJob> = { fingerprint };
    this.generationRequests.set(key, record);
    this.generationPending = true;
    record.promise = (async () => {
      try { return generationJobSchema.parse(await this.businessRequest<unknown>("/jobs", "POST", body)); }
      catch (error) { delete record.promise; throw error; }
      finally { this.generationPending = false; }
    })();
    return record.promise;
  }
  async getGenerationJob(id: string): Promise<GenerationJob> {
    const job = generationJobSchema.parse(await this.businessRequest<unknown>(`/jobs/${uuid.parse(id)}`));
    if (job.id !== id) throw new SceneApiError("INVALID_RESPONSE", 502, null);
    return job;
  }
  async listGenerationJobs(): Promise<GenerationJob[]> {
    return z.array(generationJobSchema).parse(await this.businessRequest<unknown>("/jobs"));
  }
  /** Call after saving a scene containing asset_id; the server verifies that reference. */
  async markGenerationAdded(id: string, projectId: string): Promise<GenerationJob> {
    const job = generationJobSchema.parse(await this.request<unknown>(`/jobs/${uuid.parse(id)}/added`, "POST", { projectId: uuid.parse(projectId) }, this.captureRequestScope(projectId), "business"));
    if (job.id !== id || job.state !== "added") throw new SceneApiError("INVALID_RESPONSE", 502, null);
    return job;
  }
  /** A v2 -> v1 local undo can restore only an authoritative, known pre-apply snapshot. */
  private async saveReconstructionUndo(scene: Scene, proposal: SceneProposal): Promise<SaveResult> {
    this.setDraft(scene);
    const lease=this.writableLease(),epoch=this.epoch,scope=this.captureRequestScope();
    const revision=this.snapshot.revision!,localRevision=this.snapshot.localRevision;
    this.operationPending=true;this.update({status:'saving',error:null});
    try {
      const raw=await this.request<unknown>(`/projects/${lease.projectId}/history/restore`,'POST',{
        sessionId:lease.sessionId,generation:lease.generation,expectedRevision:revision,proposalId:proposal.id,currentScene:proposal.candidate,
      },scope);
      const result=applyProposalResponseSchema.extend({warnings:z.array(z.object({code:z.string(),ids:z.array(uuid)}))}).parse(raw);
      if(epoch!==this.epoch||!this.isCurrentRequestScope(scope))throw new SceneApiError('SESSION_CHANGED',409,null);
      if(result.id!==lease.projectId||result.revision!==revision+1||result.undoGroup!==proposal.id||canonical(result.scene)!==canonical(proposal.base_scene)||canonical(result.previousScene)!==canonical(proposal.candidate))throw new SceneApiError('INVALID_RESPONSE',502,null);
      const unchanged=this.snapshot.localRevision===localRevision&&canonical(this.snapshot.draft)===canonical(scene);
      this.lastAppliedReconstruction=null;
      this.update({revision:result.revision,project:{...this.snapshot.project!,revision:result.revision,scene:result.scene},lease:{...lease,revision:result.revision},...(unchanged?{draft:result.scene,dirty:false}:{dirty:true}),status:'editing',error:null});
      return result;
    }catch(error){if(epoch===this.epoch&&this.isCurrentRequestScope(scope))this.block(error);throw error;}
    finally{this.operationPending=false;}
  }
  async saveScene(scene: Scene): Promise<SaveResult> {
    if (this.operationPending) throw new SceneApiError("CLOUD_OPERATION_BUSY", 409, null);
    const restore=this.lastAppliedReconstruction;
    if(scene.schemaVersion===1&&this.snapshot.project?.scene.schemaVersion===2&&restore?.epoch===this.epoch&&restore.proposal.project_id===this.snapshot.project.id&&canonical(scene)===canonical(restore.proposal.base_scene)&&canonical(this.snapshot.project.scene)===canonical(restore.proposal.candidate))return this.saveReconstructionUndo(scene,restore.proposal);
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
    this.recoveryTokens = null;
    this.update({ user: null, recoveryReady: false, lease: null, writeBlocked: true, status: this.config.configured ? "signed_out" : "unconfigured" });
    this.listeners.clear();
  }
}

export function createBackendSession(config?: BackendConfig): BackendSession {
  let storage: Storage | undefined;
  try { if (typeof window !== "undefined") storage = window.sessionStorage; } catch { /* Memory-only fallback. */ }
  return new BackendSession(config, storage);
}
export function useBackendSession(controller: BackendSession): BackendSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
