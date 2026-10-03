# DeepSeek 发布操作

辅助脚本 `scripts/deepseek-release.py` 只针对项目 `hrsrrduwbqxnqddkexoy`。`inspect` 只读；其他命令默认只输出操作计划，明确加 `--apply` 才执行。它不会自动重试网络结果未知的写入，不输出 HTTP 错误正文、环境变量值、登录会话或密钥。

## 已有授权与配置

- 管理 API 使用环境变量 `SUPABASE_ACCESS_TOKEN`，或现有 macOS Keychain 的服务 `Supabase CLI`，账户依次为 `supabase`、`access-token`。读取结果仅留在内存，不运行会回显 token 的 shell 命令。
- 已存在的测试账号位于原项目根目录 `.env.local`：`DEMO_OWNER_EMAIL`、`DEMO_OWNER_PASSWORD`、对应 editor 字段，以及 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`。不注册新账号，不发送邮件。
- 原项目根目录 `.env.edge.local` 的 DeepSeek 字段为空，不能整包上传覆盖云端。云端已存在 `DEEPSEEK_API_KEY`。
- 本地非空 DeepSeek 配置位于 `/Users/lwc/.codex/worktrees/e299/场景规划Agent产品开发/.env.deepseek.local`；只用于需要的真实模型检查，不写入仓库。
- JEV 密钥通过 `configure` 的 stdin 或仅本人可读的 JSON 文件传入；没有将用户提供的值写入本仓库。

## 发布顺序

1. 验证 [回退快照](DEEPSEEK_AGENT_ROLLBACK.md)、相关测试、类型检查和生产构建。
2. 在最终发布工作树执行迁移预览。已安装 CLI 2.117 支持直接指定项目：

   ```sh
   DO_NOT_TRACK=1 supabase db push --linked --project-ref hrsrrduwbqxnqddkexoy --skip-vault --dry-run
   ```

   确认仅包含本次迁移后，去掉 `--dry-run` 并加 `--yes`。保留 `--skip-vault`，避免新版 CLI 在迁移前将工作树配置同步到线上 Vault。使用 CLI 保留本地迁移版本；`sql-file` 仅执行明确提供的 SQL，不自动登记迁移历史。

3. 设置 `HY3_RETIRED=true` 和可选的 `TOKENDANCE_API_KEY`。JSON 文件是名称到值的对象；脚本仅允许这两个名称，并拒绝重新启用 HY3。先检查计划，再执行：

   ```sh
   python3 scripts/deepseek-release.py configure /private/tmp/release-secrets.json
   python3 scripts/deepseek-release.py --apply configure /private/tmp/release-secrets.json
   ```

   输入文件权限须为 `0600`，不要提交或显示内容；也可将 `-` 作为文件名，通过父进程内存传入 stdin。

4. 只部署最终发布工作树的 scene-api：

   ```sh
   DO_NOT_TRACK=1 supabase functions deploy scene-api --project-ref hrsrrduwbqxnqddkexoy --use-api
   ```

   不顺带重新部署 generation-worker 或 reconstruction-worker。核对线上 capabilities 已关闭 HY3，以及旧客户端创建任务也被拒绝。

5. 读取最新状态：

   ```sh
   python3 scripts/deepseek-release.py inspect
   ```

   快照时队列为空，但随后只读核查已出现一条 `processing`。不能用旧快照判断下线条件，必须等待全部非终态和结果未知任务清空。

6. 队列清空后执行退休操作。脚本先用已有测试账号检查线上三个生成能力均为 false，再在锁表事务中确认没有非终态任务，仅暂停 `scene-generation-poll`；重新核对队列和 cron 后才移除 `HUNYUAN_API_KEY`。

   ```sh
   python3 scripts/deepseek-release.py --apply retire-hy3 --test-env /path/to/existing/.env.local
   ```

   保留 `scene-reconstruction-poll`、重建 worker 和两种 worker 的授权配置。脚本不会删除任务、资产、材质或费用记录。

7. 发布前端并检查真实 Agent、JEV 开关、历史资产、编辑与重开。服务器端密钥不进入前端构建环境。

需要手动执行经过审查的 SQL 时，可先运行 `python3 scripts/deepseek-release.py sql-file path.sql` 查看文件摘要，再加 `--apply`。这不会声明文件一定是加法迁移；其内容须由发布任务审查。

## 验证边界

已运行 5 项本地发布防护测试：不回显密钥、不覆盖 DeepSeek、不重新启用 HY3、能力未知时不写入、队列未清空/cron 未停止时保留密钥、只删除指定 HY3 密钥。只读 `inspect` 已在真实项目验证。配置、迁移、停 cron、删除密钥、登录与部署均未由编写此脚本的任务执行。

接口依据：[SQL 查询](https://supabase.com/docs/reference/api/v1-run-a-query)、[设置 secrets](https://supabase.com/docs/reference/api/v1-bulk-create-secrets)、[删除 secrets](https://supabase.com/docs/reference/api/v1-bulk-delete-secrets)、[pg_cron 操作](https://github.com/citusdata/pg_cron#altering-a-cron-job)。
