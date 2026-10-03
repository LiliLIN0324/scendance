# DeepSeek Agent 改造前快照与回退

快照目录：`/Users/lwc/Documents/ChatGPT/场景规划Agent产品开发/SNAPSHOTS/pre-deepseek-agent-20261003`。

本文件记录改造开始前的恢复点，不代表后续版本已经上线。快照独立于开发工作树，包含源码、原生产静态构建、三个原始完整 Edge 包、恢复出的各版本源码、版本证据与 SHA-256 清单。没有归档用户业务数据、会话或服务端密钥。

## 固定版本

| 发布面 | 恢复点 |
| --- | --- |
| 整理后源码 | `188fd9cc5c68a364649998a9d0cf9701db6c739a` / `codex/website-latest` |
| Pages 生产部署 | `8153b386-93b5-45b8-9904-b6caf94472df` |
| Pages 发布源码 | `b554910af8a818c08fd440c7787f8eadebc315e8` |
| Supabase 项目 | `hrsrrduwbqxnqddkexoy` |
| scene-api | v15，EZBR SHA-256 `30e56c4c57d8f53f7bb205ad6176d503363fe5ff5981be8cbca44b9fd1d43c9c` |
| generation-worker | v6，EZBR SHA-256 `9a67ad36e46fa7b0501c21c1f78f3c161381689f4aa72dbe319940148c43068e` |
| reconstruction-worker | v2，EZBR SHA-256 `f18f40698f58817c45c9d203c595e1d4937acac6911b7c7e139b1c82e0c55d1e` |
| 数据库迁移 | 16 份，至 `20261003180000_unlimited_ai_usage.sql` |

开始改造前已重新从 Cloudflare 与 Supabase 查询上述版本。快照 `evidence/live-*.json` 记录查询时间和返回结果。实时队列只有两条 `rejected` 终态记录；没有非终态或 `submit_unknown` 记录。`scene-generation-poll` 与 `scene-reconstruction-poll` 当时均开启。这只是查询时状态，执行下线前仍须重新核对。

## 已完成恢复验证

- `git bundle verify` 通过。
- 从 `repository.bundle` 克隆到新目录，HEAD 等于固定源码提交；`git fsck --full` 通过。
- 解压 `source-188fd9c.tar.gz`，其中 1730 个文件逐个匹配该提交的 Git blob。
- 原始快照 1226 个文件的 SHA-256 校验通过；增加证据后重新生成清单。
- 三个原始 ESZIP 2.3 包的模块头、源代码及 source map 区段均连续、完整，文件无截断或多余尾部数据，分别包含 1513、1510、1425 个模块。
- 从包内 source map 恢复原始 TypeScript，从 JSON 模块恢复目录数据；各函数的相对 import 图完整。配置和被编译器擦除的类型依赖明确记录为固定源码补充项，不冒充包内恢复数据。

## 前端和源码回退

在快照目录运行：

```sh
shasum -a 256 -c SHA256SUMS
git clone --branch codex/website-latest repository.bundle restored-scendance
```

前端优先在 Cloudflare Pages 的 `scendance-scene-planner` 部署记录中回退至表中的生产部署。若平台记录不可用，用已有 Cloudflare 授权从 `frontend-out` 重新部署：

```sh
npx wrangler pages deploy frontend-out --project-name scendance-scene-planner --branch main
```

这里的 `--branch main` 选择 Pages 生产发布环境，不修改或合并 Git main 分支。回退后检查正式域名的登录、编辑器、模型载入与已有项目重开。

## 后端恢复边界

三个函数曾分别发布，其 `_shared` 源码存在版本差异，必须分别恢复。完整原始函数包保存在 `evidence/<function>-raw-body.bin`，独立 SHA-256 和导出时间见旁边的 metadata JSON。它们是 Management API 原始响应，格式为 ESZIP 2.3。包内模块与恢复清单见 `evidence/eszip-verification.json`。

`edge-recovered/<function>/` 保存各自包内恢复的完整本地运行时源码和资源 JSON，并补入固定版本的 `deno.json`、`config.toml`；generation-worker 另需固定版本 `generation-contract.ts` 的类型声明。补充项有单独记录。`production-snapshot/edge/` 仅作历史证据保留，它是早先不完整的 CLI 导出，不应用作直接恢复入口。

恢复时复制对应的 `edge-recovered/<function>/` 到独立临时目录，运行类型检查与相关测试；最后在该目录使用既有授权逐个发布：

```sh
supabase functions deploy scene-api --project-ref hrsrrduwbqxnqddkexoy --use-api
```

仅需要恢复 `scene-api` 时，不重新发布两个 worker。源码重新构建不保证生成的 ESZIP 字节与原包相同；原包已完整保存，但本次没有对生产执行一次真实回退或试发布。包格式校验依据 [Deno ESZIP 实现](https://github.com/denoland/eszip/blob/v0.109.0/src/v2.rs)，导出入口见 [Supabase Management API](https://supabase.com/docs/reference/api/v1-get-a-function-body)。

## 数据库与 HY3

新增 Agent 迁移必须保持兼容旧应用。应用回退时保留新增表列、历史记录、资源与计费记录，不运行数据库 reset/drop，不删除模型或材质版本。这个文件夹不是业务数据备份。

回退也不自动恢复 HY3 新任务入口。若恢复旧 API，保持 HY3 运行密钥已移除，确认 `/generation/capabilities` 关闭且新 `/jobs` 请求被拒绝；不要恢复旧密钥来修复其他功能。若尚有遗留任务，必须先按其已固定的 provider/model 核对，不得再次提交 `submit_unknown`。`reconstruction-worker` 和 `scene-reconstruction-poll` 不属于 HY3 下线范围，保持独立运行。

上线前的顺序是：新 API 拒绝 HY3 新任务 → 重查全部非终态/未知任务 → 确认清空 → 停 `scene-generation-poll` 并移除 HY3 运行密钥。任何应用回退都不反转这个顺序。
