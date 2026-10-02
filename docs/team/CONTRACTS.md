# 共享契约草案｜由 B 在 S01 冻结

这份文件是针对原始计划的实现建议，不是已经存在或已经验证的接口。B 对照真实代码形成项目内唯一的共享类型、Zod 校验和 `docs/engineering/contracts.md`；A 评审编辑器适配，C/D 使用冻结版本。本包不要求新建某个特定 monorepo 目录。

本契约根据最新 GitHub PLAN 增补平面图、简单多边形和公共模型推荐。原文后半仍有旧沙龙案例；执行假设 EA01–EA04 见 TASKS.json，不代表用户已确认这些细化选择。

## 1. 数据与坐标

- 领域尺寸只用 `width / depth / height`，米制；X 对应宽、Z 对应深、Y 向上。场地外接矩形中心为原点，X/Z 包围范围为 ±width/2、±depth/2；多边形实际可布置范围由 `boundary` 判定，不能只按外接矩形检查。
- 实例 `position` 表示物体底部中心，首版 y=0；`rotationY` 用弧度，正方向按 Three.js 右手系。只有地面放置和绕 Y 轴旋转进入本轮。
- 场地 `shape` 为 rectangle/polygon，两者都保存有序 `boundary` 顶点及稳定 `edges` ID。主要出入口用 `edgeId / offset / width / height`；offset 从该边起点沿边计米。S01 固定顶点绕向；改轮廓后失效的出入口必须重新校验，不静默绑到另一面墙。矩形可展示东南西北名称，但持久化统一用边 ID。
- 仅支持简单单层多边形（包括凹多边形），排除自交、重复/过短边、孔洞与多层；至少三个有效顶点。物件占地和出入口区域按真实多边形检验；这不是消防或施工安全保证。
- `floorPlan` 保存私有底图 `assetId`、图像像素尺寸、人工标定参考点/真实长度及图像到 X/Z 的变换；建议首版接受 PNG/JPEG，格式和上限在 S01 明确。人工描边与标定可核对，不承诺 AI 自动识图或 CAD 解析。
- 对上游不同语义的 `height` 字段，仅 A 在适配层转换；其他人不直接读取上游私有形状。
- 场景引用稳定 `assetId`，短期签名 URL 只用于加载，不进入持久场景。外部生成模型归一化后按 `dimensions` 设置尺寸。
- `revision` 仅在服务端成功保存后递增；`localRevision` 在每次本地场景改变、撤销/重做和场景重载时递增或生成新上下文标识，不能因为保存完成回到旧值。

建议领域场景样例（最终以 S01 校验为准）：

```json
{
  "schemaVersion": 2,
  "venue": {
    "shape": "rectangle",
    "width": 10,
    "depth": 8,
    "height": 3,
    "floorPlan": null,
    "boundary": [
      {
        "id": "v1",
        "x": -5,
        "z": -4
      },
      {
        "id": "v2",
        "x": 5,
        "z": -4
      },
      {
        "id": "v3",
        "x": 5,
        "z": 4
      },
      {
        "id": "v4",
        "x": -5,
        "z": 4
      }
    ],
    "edges": [
      {
        "id": "edge-south",
        "from": "v1",
        "to": "v2"
      },
      {
        "id": "edge-east",
        "from": "v2",
        "to": "v3"
      },
      {
        "id": "edge-north",
        "from": "v3",
        "to": "v4"
      },
      {
        "id": "edge-west",
        "from": "v4",
        "to": "v1"
      }
    ],
    "openings": [
      {
        "id": "entry-main",
        "type": "entry",
        "edgeId": "edge-south",
        "offset": 4.1,
        "width": 1.8,
        "height": 2.2
      }
    ]
  },
  "instances": [
    {
      "id": "chair-001",
      "materialId": "chair-standard",
      "assetId": null,
      "source": "builtin",
      "position": {
        "x": -1.2,
        "y": 0,
        "z": 0
      },
      "rotationY": 0,
      "dimensions": {
        "width": 0.5,
        "depth": 0.5,
        "height": 0.85
      },
      "color": "#E8DCC8",
      "locked": false,
      "notes": ""
    }
  ],
  "cameraPreset": "overview",
  "lightingPreset": "soft-daylight"
}
```

该空底图样例只说明初始结构。A08 的最终验收必须有真实上传底图和人工标定记录。`schemaVersion: 2` 是建议版本；S01 必须结合当前实现冻结并提供旧场景迁移/拒绝策略。

## 2. 业务对象的最小信息

| 对象 | 最少字段与规则 |
|---|---|
| 工作室/成员 | studioId、userId、角色 owner/editor；由服务端判定成员关系 |
| 项目 | id、studioId、name、scene、revision；客户端提交 studioId 不代表有权限 |
| 租约 | projectId、editorUserId、sessionId、generation、expiresAt；每标签页一个会话 |
| AI 提案 | proposalId、projectId、baseRevision、baseLocalRevision、baseSessionId、baseLeaseGeneration、operations、summary、validationErrors |
| 资产 | id、ownerId、source、storagePath、format、fileBytes、bounds、licenseRecord；source 区分 generated/public_library/floor_plan；公共模型增加 provider/modelId/sourceUrl/author/licenseUrl/retrievedAt，不暴露私有存储路径作未经授权的公共读取入口 |
| 平面图标定 | assetId、pixelWidth/pixelHeight、referencePoints、referenceDistanceMeters、imageToWorld；与轮廓、出入口同版本保存，原图默认只向项目成员授权 |
| 公共模型候选 | provider、modelId、name、thumbnailUrl、sourceUrl、author、licenseId/licenseUrl、importAllowed、reason；缺少所需许可或不能合法获取时 importAllowed=false |
| 公共模型导入 | importId、provider/modelId、status、assetId、errorCode；queued/downloading/validating/archiving/ready 或 failed/rejected，ready 必须已合法归档并可加载 |
| 生成任务 | id、idempotencyKey、status、errorCode、assetId、costRecord；提供商 taskId 保留在服务端 |
| 发布版本 | id、projectId、sourceRevision、scene、materialSummary、assetIds、publishedAt；所有数据不可变 |
| 分享 | id、snapshotId、tokenHash、revokedAt；生成令牌仅交给具有权限的发布者 |

生成状态建议：`pending → submitted → processing → archiving → preview_ready`；异常独立为 `failed / rejected / unknown`。UI “已加入”来自当前场景是否引用资产，不能让一个用户加入后把全局任务改成只有该用户可用的状态。允许提供商状态跳转，由 B 明确映射；`unknown` 必须核对原任务，不可盲目再次付费。

## 3. 接口与交接

以下是语义接口名，不要求使用特定 HTTP 路径。S01 决定真实路径和 SDK 调用方式；A 的模拟/真实客户端必须使用同一结构。

| 接口 | 输入 | 输出/关键约束 |
|---|---|---|
| project.create/list/get/rename | 已登录身份、名称、场地或 projectId | 项目/列表、scene、revision、编辑者；查成员关系 |
| floorplan.upload/authorize | projectId、图像元数据/文件，写入带有效编辑会话 | 私有底图 assetId / 短期授权；成员关系、类型和大小由服务端校验，场地引用由 scene.save 保存 |
| library.recommend | projectId、主题、场地、已选物料/可用需求 | 真实来源的候选、理由、分页/错误状态；所有第三方凭据在服务端 |
| library.import/get | projectId、provider/modelId、幂等键 / importId | 导入状态及稳定 assetId；服务端解析允许来源，不接受任意下载 URL；ready 后才能持久加入 |
| lease.acquire/renew/release | projectId、sessionId；续期/释放带 generation | 当前有效租约；不能释放另一个会话的租约 |
| scene.save | projectId、scene、sessionId、generation、expectedRevision | 新 revision；事务内授权、租约、版本检查 |
| ai.propose | projectId、scene、需求、选中对象、baseRevision、baseLocalRevision、sessionId、generation | 提案及基线；模板参数和修改动作受限，服务端不直接覆盖场景 |
| generation.create | 描述、idempotencyKey、模型参数 | 内部任务 ID；费用/并发上限和未知提交保护 |
| generation.get/list | 任务 ID 或所属用户 | 真实状态、可展示错误、预览资产；重开可恢复 |
| asset.authorize | assetId、已登录身份及可选 projectId，或 shareToken | 所有者可读取自己的资产用于加入前预览；成员只读项目引用资产；客户只读有效分享快照引用资产。前两类归 B04，分享分支归 B06 |
| publication.publish | projectId、expectedRevision | 不可变快照、分享 ID/链接；从已保存版本发布 |
| share.read/revoke | token 或分享 ID | 快照/撤销结果；撤销限负责人，新授权逐次检查 |

错误格式统一为 `{"error":{"code":"REVISION_CONFLICT","message":"…","details":{}}}`。至少区分：UNAUTHENTICATED、FORBIDDEN、LEASE_HELD、LEASE_EXPIRED、LEASE_MISMATCH、REVISION_CONFLICT、STALE_PROPOSAL、INVALID_OPERATION、BUDGET_EXCEEDED、GENERATION_UNKNOWN、ASSET_REJECTED、SHARE_REVOKED、FLOORPLAN_INVALID、BOUNDARY_INVALID、OPENING_OUT_OF_BOUNDS、LIBRARY_UNAVAILABLE、MODEL_NOT_FOUND、MODEL_LICENSE_UNVERIFIED、MODEL_IMPORT_FAILED。无推荐结果可作为成功的空列表，不伪装错误或伪造候选。具体 HTTP 状态和重试策略由 S01 固化。

## 4. AI 操作协议

| 类型 | 最小参数 |
|---|---|
| add | 一条通过 schema 的新实例；稳定且不重复的 id |
| remove | instanceId |
| move | instanceId、position |
| rotate | instanceId、rotationY |
| recolor | instanceId、color |
| replace | instanceId、新 materialId 或已授权 assetId、完整合法尺寸 |

锁定对象不得被修改或删除；新增的 ID 不得覆盖旧对象。A/B 使用共享校验。AI 初稿按执行假设使用分组工作坊、路演坐席两套模板，由 B 的确定性算法生成坐标并按实际多边形检查完整占地和主要出入口；初稿替换非空场景的语义需 S01 写清并在 UI 明确确认，不能默认清空已有内容。

应用前同时核对当前云版本、本地版本、会话、租约代次与有效期；服务端保存仍再次做事务校验。任何人工修改和编辑权变化使旧提案失效。整批操作一次应用、一次撤销。

## 5. 物料汇总与资产一致性

B 实现并维护一个共享纯函数，A 展示实时结果，B 发布时调用同一函数。建议按 `materialId + assetId + width/depth/height + color` 分组，单位/精度在 S01 固定；不要因为浮点噪声重复分组。备注可去重聚合为列表，不因分组合并丢失。

每行至少包含名称、数量、尺寸、备注和来源；生成物件固定显示“概念道具，实物待确认”。公共模型显示真实来源/作者/许可；其录入尺寸不证明对应实物库存或价格。个人资产加入团队项目后，只向该项目成员/有效分享授权资产读取，不开放个人库浏览。

## 6. 必须共享的契约样例

B 在 S01 交付：矩形与简单凹多边形、带底图/标定/出入口场景、无效轮廓与标定、公共库成功/空列表/超时/许可不明/导入中/成功/失败、内置+生成+公共模型场景、成功保存、租约占用、旧版本冲突、AI 提案成功/过期、生成处理中/未知/成功、有效发布/已撤销等响应。样例全由同一 schema 校验。

本地模拟接口必须有明显环境标识；禁止在正式环境静默回退假账号、假生成或模拟保存。模拟结果只证明前端交互开发进展。


## 7. 平面图、多边形与公共模型的新验收边界

- 平面图用人工标定和描边建立米制坐标；图像不是三维结果。`imageToWorld` 的具体结构、图像 Y 方向、等比约束和参考点要求由 S01 固化，A/B/C 使用同一份转换样例。
- 图像资产、轮廓及出入口随项目云保存，遵守同一租约/版本；不能让底图上传接口直接绕过场景保存。新底图待引用期间应有归属与清理规则。底图默认不发布给客户，客户快照保留可渲染几何和出入口。
- 公共模型推荐必须来自至少一个实测可用来源。C 给语义样例与授权清单，B 对真实获取方式及许可核实，A 展示推荐/预览/加入，D 检查整条真实链路；推荐 fixture 只用于开发。
- 只有允许项目所需下载、存储和客户展示的资产才可导入。合法资产归档到自有存储并用稳定 ID 引用；名称、作者、来源、许可及取得时间应保留。若来源不允许该方式，候选不可导入并记录原因，不能删掉来源记录或把未知许可视为许可。
- 公共库模型和真实 API 生成模型独立记录来源，均复用 GLB 尺寸归一化、10MB 上限、资源复制/删除、云端重开、发布授权与物料汇总。资产被引用后不得因为外部临时 URL 到期而损坏已归档场景。
- 真实闭环至少包含一个公共库模型和一个真实生成模型；展示缩略图、只跳转原站、静态伪推荐不满足公共模型推荐要求。外部源失败时允许继续内置编辑，但新增功能仍记 fail/blocked。
