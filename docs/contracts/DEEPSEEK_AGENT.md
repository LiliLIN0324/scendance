# DeepSeek 场景 Agent

## 请求与运行

唯一 wire schema 在 `supabase/functions/_shared/agent-contract.ts`。`POST /projects/:id/agent-runs` 使用现有租约字段与 requestId，提交当前未保存场景、选中物件、独立 instruction/context、executionMode、jevEnabled。生产使用 EdgeRuntime.waitUntil 返回202，后台最多6次 DeepSeek 调用，总期限90秒；GET按运行ID或原requestId恢复，POST cancel使整组候选不可应用。未知网络结果不会重发原付费请求。

服务端 `agent_rpc` 检查项目成员、创建者、租约、云修订及资产授权；每次模型调用前原子计数，每个工具前重新检查。运行、检查点、候选与用量持久保存；取消与应用争用同一运行锁。运行失效后不会重启旧请求。旧每日AI额度维持不限，不恢复日限额。

工具涵盖草稿读取、授权资源检索、六类固定参数建模、真实材质槽读取/不可变材质副本、候选试算、候选提交、物料数量汇总。模型不能运行任意代码/SQL/URL。参数资产及材质派生沿用原私有GLB资产、保存重开和导出链路。仅部分可执行时保留有效方案；锁定、选择范围、尺寸、结构与应用修订检查由代码和数据库执行。

明确直接执行且未包含否定/询问/预览含义的普通指令才允许自动应用；JEV始终预览后由用户选。应用沿用 proposals.apply，一次撤销组；发布接口不属于工具列表。

## JEV

默认关闭：仅1个方案。开启：同一草稿上最多3个不同方案，经确定性检查后调用一次 `ateve-jev-v1`。实例ID、标题、纯色变化以及新建同参数模型的不同assetId不构成差异。一次定向修复失败仍保留有效检查点，不伪造缺失候选。

TokenDance TypeSafe请求发往 `https://tokendance.space/gateway/typesafe/v1/systemone`，server-only TOKENDANCE_API_KEY，choice为A/B/C/NONE。不足3个、超时、无配置、格式错误保留方案但无百分比。推荐百分比不是成功率。2026-10-03真实探测返回 metadata.confidence_definition 为 maximum candidate probability; not guaranteed correctness；按原值保留confidence，不套用其他服务的归一化公式。评价服务不返回解释文字，界面解释来自各方案自身。

## 回退与HY3

`DEEPSEEK_AGENT_MODE=legacy` 可切回原单提案生成器，强制预览，JEV不做三方评价；不恢复HY3。常规模式为 tools（省略亦可）。完全版本回退见 `docs/DEEPSEEK_AGENT_ROLLBACK.md`。两份新增迁移保持旧API兼容，回退时不删表、资产或历史。

`HY3_RETIRED=true` 时所有新text/image/texture请求在读取素材或计费前返回410 HY3_RETIRED，capabilities三项false。原worker仍按任务固定provider处理遗留请求；submit_unknown不重发。队列全终态后仅停generation cron并移除HUNYUAN_API_KEY；reconstruction worker/cron保持运行。原历史模型、纹理/材质版本和导出保留。

## 已知能力边界

参数模型覆盖桌、椅凳、柜台、台座、背景板、柜六类固定结构；不等价于HY3的任意造型图生3D或纹理生成。形状超出六类时使用库内授权模型、给出缺项或进一步澄清；不会伪造结果。当前草稿是地面单层布置，不能吊挂/台面叠放。任何施工、采购数量/规格仍需专业核对。
