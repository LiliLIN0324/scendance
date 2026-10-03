import { describe, expect, it } from "vitest";
import { ASSISTANT_INSTRUCTION_LIMIT, AssistantContextError, buildAssistantInstruction, buildAgentContext } from "./assistant-context";

describe("assistant context composition", () => {
  it("preserves the full brief, explicit decisions, latest proposal and current request", () => {
    const brief = "24 人品牌活动。必须留出出入口通道。\n风格：自然；配色：米白和绿；灯光：warm。";
    const decisions = ["帐篷保留为待补资产，不用桌子冒充。", "用户明确同意将圆桌改为现有矩形桌，并说明差异。"];
    const latest = "建议签到区置于入口右侧，交流区位于中央。";
    const request = "把刚才的签到区向左移动，其他要求保留。";
    const result = buildAssistantInstruction({ briefInstruction: brief, confirmedMaterialDecisions: decisions,
      message: request, lastProposalExplanation: latest });
    expect(result.instruction).toContain(brief);
    for (const decision of decisions) expect(result.instruction).toContain(decision);
    expect(result.instruction).toContain(latest);
    expect(result.instruction).toContain(request);
    expect(result.omittedHistory).toBe(0);
  });

  it("keeps recent multi-turn dialogue in order with explicit roles", () => {
    const history = [{ role: "user" as const, text: "签到区放在哪里？" },
      { role: "assistant" as const, text: "建议放入口右侧，仍需确认。" },
      { role: "user" as const, text: "右侧需要留通道。" }];
    const result = buildAssistantInstruction({ briefInstruction: "工作坊，16 人。", message: "那就换到另一边。", recentMessages: history });
    expect(result.instruction.indexOf(history[0]!.text)).toBeLessThan(result.instruction.indexOf(history[1]!.text));
    expect(result.instruction.indexOf(history[1]!.text)).toBeLessThan(result.instruction.indexOf(history[2]!.text));
    for (const entry of history) expect(result.instruction).toContain(JSON.stringify(entry));
    expect(result.instruction).toContain('"role":"assistant"');
    expect(result.instruction.indexOf("那就换到另一边。")).toBeGreaterThan(result.instruction.indexOf(history[2]!.text));
  });

  it("drops only whole oldest messages and reports the omission", () => {
    const oldest = { role: "user" as const, text: "旧消息".repeat(1500) };
    const newest = { role: "assistant" as const, text: "仍需保留无障碍通道。" };
    const brief = "必须保留入口。";
    const request = "减少一张桌子。";
    const result = buildAssistantInstruction({ briefInstruction: brief, confirmedMaterialDecisions: "帐篷仍待补资产。",
      message: request, recentMessages: [oldest, newest], lastProposalExplanation: "交流桌尚未应用。" });
    expect(result.omittedHistory).toBe(1);
    expect(result.instruction).not.toContain("旧消息");
    expect(result.instruction).toContain(JSON.stringify(newest));
    expect(result.instruction).toContain(brief);
    expect(result.instruction).toContain(request);
    expect(result.instruction).toContain("帐篷仍待补资产。");
    expect(result.instruction).toContain("交流桌尚未应用。");
  });

  it("accepts exactly 3000 characters and rejects 3001 without truncating the request", () => {
    const overhead = buildAssistantInstruction({ briefInstruction: "", message: "x" }).instruction.length - 1;
    const exact = "问".repeat(ASSISTANT_INSTRUCTION_LIMIT - overhead);
    expect(buildAssistantInstruction({ briefInstruction: "", message: exact }).instruction).toHaveLength(3000);
    expect(() => buildAssistantInstruction({ briefInstruction: "", message: `${exact}多` })).toThrow(AssistantContextError);
    try { buildAssistantInstruction({ briefInstruction: "", message: `${exact}多` }); }
    catch (error) {
      expect(error).toMatchObject({ code: "ASSISTANT_CONTEXT_TOO_LONG", requiredLength: 3001 });
      expect((error as Error).message).toContain("不会自动删减");
    }
  });

  it.each(["brief", "decisions", "proposal"] as const)("never trims required %s context to fit", field => {
    const large = "条件".repeat(1600);
    expect(() => buildAssistantInstruction({ briefInstruction: field === "brief" ? large : "工作坊",
      confirmedMaterialDecisions: field === "decisions" ? [large] : [],
      lastProposalExplanation: field === "proposal" ? large : "",
      message: "保留需求生成。", recentMessages: [{ role: "user", text: "旧话题" }] })).toThrow("超过 3000");
  });

  it("can discard every old message while preserving the request byte for byte", () => {
    const message = "  当前请求\n请不要删掉这一行。  ";
    const result = buildAssistantInstruction({ briefInstruction: "", message,
      recentMessages: [{ role: "user", text: "旧".repeat(5000) }, { role: "assistant", text: "历史".repeat(2000) }] });
    expect(result.omittedHistory).toBe(2);
    expect(result.instruction.endsWith(message)).toBe(true);
  });

  it("always includes the explicit no-image-access constraint", () => {
    const result = buildAssistantInstruction({ briefInstruction: "", message: "看看我上传的照片。" });
    expect(result.instruction).toContain("本次没有向模型提交现场照片或任何图像");
    expect(result.instruction).toContain("不得声称看过、识别、测量或参考了图片内容");
    expect(result.instruction).toContain("不声称已经应用、保存");
  });

  it("rejects an empty current request but permits chat without a filled brief", () => {
    expect(() => buildAssistantInstruction({ briefInstruction: "活动", message: " \n " })).toThrow("请填写本次");
    expect(buildAssistantInstruction({ briefInstruction: "", message: "帮我梳理活动需求。" }).instruction).toContain("帮我梳理活动需求。");
  });

  it("does not mutate caller history or accepted decisions", () => {
    const history = Object.freeze([Object.freeze({ role: "user" as const, text: "旧".repeat(4000) })]);
    const decisions = Object.freeze(["不自动替代缺少物料。"]);
    buildAssistantInstruction({ briefInstruction: "活动", message: "继续", recentMessages: history, confirmedMaterialDecisions: decisions });
    expect(history).toHaveLength(1);
    expect(history[0]?.text).toHaveLength(4000);
    expect(decisions).toEqual(["不自动替代缺少物料。"]);
  });
});

describe('structured Agent context',()=>{
  it('keeps a long brief and the latest request in independent fields',()=>{
    const brief='完整需求'.repeat(1000);
    const result=buildAgentContext({briefInstruction:brief,message:'把选中桌子移动一米',confirmedMaterialDecisions:['保留入口通道'],recentMessages:[{role:'assistant',text:'背景'}]});
    expect(result.context.brief).toBe(brief);
    expect(result.instruction).toBe('把选中桌子移动一米');
    expect(result.context.acceptedDecisions).toEqual(['保留入口通道']);
    expect(result.context.recentMessages).toEqual([{role:'assistant',text:'背景'}]);
  });
  it('bounds background history while rejecting oversized essential context',()=>{
    const result=buildAgentContext({briefInstruction:'需求',message:'当前操作',recentMessages:Array.from({length:20},(_,index)=>({role:'user' as const,text:`背景 ${index}`}))});
    expect(result.context.recentMessages).toHaveLength(12);expect(result.omittedHistory).toBe(8);
    expect(()=>buildAgentContext({briefInstruction:'x'.repeat(12001),message:'当前操作'})).toThrow('不会自动截断');
  });
});
