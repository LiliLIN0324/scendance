# 场域 · 活动场地工作台

前端首版基于 PLAN 指定的 `threejs-sims-house-builder` 提交 `ab64647640a493657929246d62a2a37ebfc0ed42` 定向改造，使用 Next.js 静态导出、React、TypeScript、Three.js、Zustand。上游 MIT 许可见 [UPSTREAM-LICENSE](UPSTREAM-LICENSE)。原体育馆展示页仍在仓库根目录。

## 运行

使用 Node.js 24.15+（建议 Node 24 LTS），在仓库根目录执行：

```sh
npm ci
cd frontend
npm ci
npm run dev
```

打开 `http://localhost:3000`。根依赖用于直接引用后端共享的 Zod 场景契约，前端目录有独立锁文件，不修改后端依赖。

生产构建与检查：

```sh
cd frontend
npm run typecheck
npm test
npm run build
python3 -m http.server 3018 --bind 127.0.0.1 --directory out
```

最后打开 `http://127.0.0.1:3018`。部署目录为 `frontend/out/`，不是仓库根的旧 `index.html`。所有 UI 字体使用系统字体，不依赖 Google Fonts。

## 当前可用

- 单层矩形场地、米制尺寸、后端 catalog 中的八类活动物料。
- 选择、拖动、旋转、调整尺寸、内置物件换色、备注、复制、删除、锁定、撤销/重做。
- 整体、俯视、客户观察角度与 2D 视图；“客户视角”只是相机预设，不是已发布客户页面。
- 本地自动保存与 JSON 导入导出；真实 GLB 桌子样例可设定尺寸、复制、删除、刷新重开，保留原材质。
- 云项目弹层、Auth 登录、工作室/项目列表、创建/打开项目、获取/续期/释放编辑权、版本校验保存与私有模型授权请求均已接线。
- 未配置后端时只使用本地模式，云项目不会显示伪造的保存成功。

后端尚未部署，因此本轮只证明本地编辑和接口契约通过测试，**没有证明真实云端、双账号交接、第三方生成或手机真机闭环**。

## 部署后配置

复制 `frontend/.env.example` 为 `frontend/.env.local`，在本机填写：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

仅放公开 anon / publishable key；不要放 service-role、模型 API key、worker secret。公开配置在构建时写入前端，修改后要重启开发服务或重新构建。账号密码在登录框输入，Auth access/refresh token 只在内存，刷新后重新登录；本地草稿保留。

B 按 [后端部署说明](../docs/DEPLOYMENT.md) 部署、迁移并准备工作室账号；将实际前端 Origin 加入后端 `ALLOWED_ORIGINS`。`http://localhost:3000` 与 `http://127.0.0.1:3018` 是不同 Origin，应按实际地址配置。

验证顺序：登录 → 把当前画布创建为项目 → 获取编辑权 → 移动物件 → 保存 → 刷新、登录并打开项目 → 检查数据 → 释放编辑权 → 第二个账号接手。获取编辑权始终采用服务端最新场景并清空旧撤销历史；保存失败、断网或版本冲突不会丢弃当前草稿。

## 对接真源与文件归属

以用户指定后端分支 `codex/backend-implementation-20261002` 的 `f4296f3dc77b661f6f7e8dac3310a3fbc75ebee3` 为基线。

| 文件 | 责任 |
|---|---|
| `../supabase/functions/_shared/domain.ts` | B：唯一场景类型、校验和物料目录 |
| `../client/scene-client.ts` | B：通用 API 与旧提案保护；本 PR 仅修复可选 body 的 TypeScript 兼容性 |
| `lib/backend-session.ts` | A：登录、请求、租约和前端状态 |
| `components/room-organizer/lib/backend-adapter.ts` | A：上游编辑器与后端 v1 场景转换 |
| `components/room-organizer/three/glb-assets.ts` | A：GLB 加载、归一化和资源生命周期 |
| `components/room-organizer/panels/` | A：工作台与云项目界面 |
| `package.json` / `package-lock.json`（此目录） | A：前端构建；根目录依赖归 B |

协议差异、验证证据与下一步见 [A01 交接报告](../docs/team/reports/A/A01.md)。

## 明确未完成

平面图标定、多边形编辑、AI 提案 UI、真实生成 UI、公共库推荐 UI、共享物料汇总、客户发布页面仍待后续任务。此版会拒绝打开包含多边形、云底图或不可无损转换的结构，不会偷偷改成矩形保存。宽/深小于 0.1m 或高度小于 0.01m 的物体也明确拒绝转换。

本地 GLB 样例没有云端 assetId，不能直接云保存。真实云资产须经后端归档和授权；授权失败会保留当前画布并报告错误。GLB 目前不支持换色、动画编辑或从电脑上传任意文件；样例是仓库已有的真实模型加载路径验证。

恢复点保存在本机；完整恢复点管理 UI 尚未接回，重要方案请导出 JSON。不要把浏览器本地保存当作云备份。
