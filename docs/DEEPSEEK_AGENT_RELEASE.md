# DeepSeek Agent 上线与回退记录

2026-10-03 已发布到 https://scendance.charlestech.org 。所选改造基线为 `codex/website-latest@188fd9c`。代码仅提交专属 `codex/ds-flash-agent` 分支，没有合并 main/dev。

## 回退点

改造前先保存完整快照：`/Users/lwc/Documents/ChatGPT/场景规划Agent产品开发/SNAPSHOTS/pre-deepseek-agent-20261003`。约248MB，包括固定源码/Git bundle、原生产前端、3个完整原始Edge包与恢复源码。1289文件SHA-256、bundle克隆/fsck、1730源码blob匹配已验证。具体恢复命令见 [回退说明](DEEPSEEK_AGENT_ROLLBACK.md)。新增迁移是加法兼容更新，应用回退不删除业务数据，也不自动恢复HY3。

## 当前发布

- Pages生产：`35434bb2-b6db-4277-b3b1-7871a4924dde`，前端源码`1e4c748`（后续修改只影响后端和验证记录）。
- scene-api最新代码：`9665dac`，平台v19；EZBR哈希见[生产核查](evidence/deepseek-agent-production.json)。
- 共18份迁移：原16份加参数资产`20261003190000`、Agent运行`20261003200000`。CLI直连失败后，用已授权管理API在一个事务中锁定并核对旧历史、执行新SQL、登记精确版本。远端保存SQL逐字匹配本地，[迁移证据](evidence/deepseek-agent-migrations.json)。
- worker源码未重新部署。设置/删除全局secrets使平台版本计数变化，generation-worker和reconstruction-worker的EZBR哈希仍与快照完全相同。
- JEV密钥只在服务端配置，DeepSeek沿用已有云端密钥。前端构建仅含公开Supabase配置。

## 功能

Binggo使用DeepSeek工具循环读取当前草稿、检索授权模型、六族参数建模、布置、创建材质副本、修改与物料统计；服务端最多6次模型调用/90秒。取消、requestId幂等、断线恢复、选中范围、锁定、租约和修订保护均保留。每天AI使用额度仍不限。

JEV关闭只生成1方案；开启生成3个独立候选，检查后评价A/B/C/NONE，百分比为模型推荐概率，始终由用户选。纯色/随机ID不算新方案，服务失败或不足3项时保留有效候选而不编造概率。已通过检查的候选有持久检查点，修复失败不丢失。

HY3文生/图生/纹理新任务均返回410；三个capabilities均false。关闭前旧队列3条均已进入rejected终态，非终态及submit_unknown为0；之后停用scene-generation-poll并删除HUNYUAN_API_KEY。历史任务、模型/材质、导出及重建服务保留，scene-reconstruction-poll仍active。

## 验证

- 后端27文件/255测试通过；最终资源引用修复后Agent27测试复跑通过；TypeScript和Deno三个函数检查通过。
- 前端132文件/1693测试通过，类型检查与生产静态构建通过；仅保留原有scene-preview import-order和静态导出rewrite提示。
- 发布工具5项防护测试通过，git diff --check通过。
- 桌面1440×1000、手机390×844模拟API浏览器检查覆盖JEV选择、部分结果、取消、失效、六族入口和历史模型，零控制台错误。
- 正式域名真实账号只读验收通过：蓝色参数化GLB和3件物料载入，JEV默认off，六族/历史/材质/导出入口正常；桌面与手机无横向溢出。134个网络请求（129×200、4×204、1×302），无失败或4xx/5xx，控制台零错误/警告；未申请编辑权或调用AI。记录和截图保存在本工作树output/playwright/verification/ds-agent。命令行HTTP抽查遇403，未据此声称完成逐字节线上哈希验证。
- 真实DeepSeek最小工具调用成功；真实JEV choice响应符合四项概率契约。实际confidence定义为最大候选概率，不是正确率保证。
- 真实云端隔离验收项目：`cc395f4c-d7d8-4987-8739-25e92a3027c0`。创建参数化圆桌→应用→重开；指定实例创建蓝色材质副本→保留尺寸/位置/旋转/几何→应用；同一草稿生成3个方案→JEV真实评价→主动选择B→保存重开一致。原requestId查询和重复POST返回同一运行，不重复模型调用。验收后已释放租约。
- 首次真实材质调用曾因模型使用裸资产UUID而未解析资源，仅返回说明、没有错误应用。修复为仅在已授权资源集合内统一解析UUID/资源引用，并补充上下文索引；随后同一项目的新请求完成真实材质操作。原失败结果保留在[真实运行证据](evidence/deepseek-agent-live.json)，未掩盖为成功。

## 能力边界

新建模是六类固定参数结构（桌、椅凳、柜台、台座、背景板、柜），并不提供任意图片生成复杂3D或新纹理。需要自由造型时使用授权库或明确列出缺项。没有执行破坏性数据库回退、没有重开HY3付费入口。兼容模式开关`DEEPSEEK_AGENT_MODE=legacy`可回到原单提案流程并强制预览。
