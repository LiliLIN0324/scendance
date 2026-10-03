export const ASSISTANT_INSTRUCTION_LIMIT = 3000;

export interface AssistantContextMessage {
  role: "user" | "assistant";
  text: string;
}
export interface AssistantContextInput {
  /** Complete briefInstruction output. An empty brief is allowed for chat. */
  briefInstruction: string;
  /** Only decisions explicitly accepted by the user belong here. */
  confirmedMaterialDecisions?: string | readonly string[];
  message: string;
  /** Oldest first. Messages are removed whole, never shortened. */
  recentMessages?: readonly AssistantContextMessage[];
  lastProposalExplanation?: string;
}
export interface AssistantContextResult {
  instruction: string;
  /** Number of oldest messages omitted to fit the existing API limit. */
  omittedHistory: number;
}
export class AssistantContextError extends Error {
  readonly name = "AssistantContextError";
  constructor(readonly code: "ASSISTANT_MESSAGE_REQUIRED" | "ASSISTANT_CONTEXT_TOO_LONG", readonly requiredLength: number) {
    super(code === "ASSISTANT_MESSAGE_REQUIRED"
      ? "请填写本次要沟通或调整的内容。"
      : `完整需求、已确认决定、最近提案说明和本次请求共 ${requiredLength} 个字符，超过 ${ASSISTANT_INSTRUCTION_LIMIT} 字符上限。请精简后重试；不会自动删减必需条件或本次请求。`);
  }
}

const rules = [
  "【本轮约束】",
  "依据完整客户需求和已确认物料决定处理本轮请求；近期对话仅用于补充上下文，不代表修改已经执行。",
  "保留锁定对象，只返回待确认提案，不声称已经应用、保存或完成施工。缺少物料须列为待补项，不得用其他物件冒充；仅已明确确认的替代可改变原物料要求。",
  "本次没有向模型提交现场照片或任何图像。不得声称看过、识别、测量或参考了图片内容，不得编造图中设施；场地尺寸依据用户填写的数据。",
  "风格、配色与灯光偏好属于客户要求；不支持的效果请明确说明，不声称它们已经渲染或持久化。",
].join("\n");

/** Compose the existing text-only instruction without losing required context. */
export function buildAssistantInstruction(input: AssistantContextInput): AssistantContextResult {
  if (!input.message.trim()) throw new AssistantContextError("ASSISTANT_MESSAGE_REQUIRED", 0);
  const decisions = typeof input.confirmedMaterialDecisions === "string"
    ? input.confirmedMaterialDecisions : (input.confirmedMaterialDecisions ?? []).join("\n");
  const essential = [rules,
    ...(input.briefInstruction.trim() ? [`【完整客户需求】\n${input.briefInstruction}`] : []),
    ...(decisions.trim() ? [`【已确认的物料决定】\n${decisions}`] : []),
    ...(input.lastProposalExplanation?.trim() ? [`【最近提案说明；仅作为背景，应用状态以场景为准】\n${input.lastProposalExplanation}`] : []),
  ];
  const current = `【本轮请求】\n${input.message}`;
  const required = [...essential, current].join("\n\n");
  // The API's Zod max(3000) uses JavaScript string length, including UTF-16
  // surrogate pairs. Match that exact count rather than approximating tokens.
  if (required.length > ASSISTANT_INSTRUCTION_LIMIT) throw new AssistantContextError("ASSISTANT_CONTEXT_TOO_LONG", required.length);
  const history = input.recentMessages ?? [];
  for (let omittedHistory = 0; omittedHistory <= history.length; omittedHistory++) {
    const remaining = history.slice(omittedHistory);
    // Structured role labels avoid treating text containing newlines or a fake
    // transcript header as an additional conversation entry.
    const transcript = remaining.length
      ? [`【近期对话记录；各行是角色与原始文字】\n${remaining.map(message => JSON.stringify({ role: message.role, text: message.text })).join("\n")}`] : [];
    const instruction = [...essential, ...transcript, current].join("\n\n");
    if (instruction.length <= ASSISTANT_INSTRUCTION_LIMIT) return { instruction, omittedHistory };
  }
  // The required block already fits, so dropping all history always succeeds.
  return { instruction: required, omittedHistory: history.length };
}

/** Agent fields have independent limits, so the current brief is never squeezed into chat history. */
export function buildAgentContext(input: AssistantContextInput) {
  if (!input.message.trim()) throw new AssistantContextError('ASSISTANT_MESSAGE_REQUIRED', 0);
  const decisions = typeof input.confirmedMaterialDecisions === 'string' ? [input.confirmedMaterialDecisions] : [...(input.confirmedMaterialDecisions ?? [])];
  if (input.message.length > 6000 || input.briefInstruction.length > 12000 || decisions.some(value => value.length > 1000)) {
    throw new Error('本次请求、完整需求或已确认决定过长，请精简后重试；必需条件不会自动截断。');
  }
  const history = input.recentMessages ?? [];
  const recentMessages = history.filter(message => message.text.length <= 3000).slice(-12).map(({role,text}) => ({role,text}));
  return {
    instruction: input.message.trim(),
    context: {
      brief: input.briefInstruction,
      acceptedDecisions: decisions.slice(-20),
      recentMessages,
      ...(input.lastProposalExplanation?.trim() ? { lastProposalExplanation: input.lastProposalExplanation.slice(0, 1200) } : {}),
    },
    omittedHistory: history.length - recentMessages.length,
  };
}
