# 留白摄影工作室 · 完整三维场景

Scendance 的独立摄影棚模板，概念尺寸为 **12 × 10 米、层高 4.3 米**。空间采用暖灰背景、深灰墙面与陶土色点缀，降低大面积白色反光。场景包含弧形无影墙、拍摄设备、联机车、修图桌、化妆台及器材收纳；不包含人物。家具和设备采用固定布置，页面用于查看完整空间。

## 打开预览

在解压后的 `studio/` 目录运行：

```sh
python3 serve.py
```

打开 [http://127.0.0.1:8778/](http://127.0.0.1:8778/)。服务器仅绑定本机 `127.0.0.1:8778`，只服务本目录。需要 Python 3.9 或以上及支持 WebGL 2 的浏览器；不需要账号、API Key、npm 安装或联网下载素材。直接双击 `index.html` 不能可靠加载本地模块与 GLB，请通过 HTTP 打开。

页面默认使用 `GLTFLoader` 读取已导出的 **`studio.glb`**，不是临时重新建模。模型内嵌几何、材质和纹理，可单独复制到支持 glTF 2.0 的三维工具中使用。默认隐藏屋顶以便观察内部，下载文件仍包含完整屋顶。页面的环境光、背景和预设相机由 `app.js` 提供，在其他查看器中的显示可能有所不同。

预览提供整体、俯视、场内三个视角，支持拖动旋转、滚轮或双指缩放，以及分区标签和屋顶开关。默认页面不显示构建与归档按钮。也可用其他静态 HTTP 服务器查看，但下面的保存操作需要本包 `serve.py`。

## 尺寸、轴向与分组

模型单位为米（`units: "meters"`），Y 轴向上（`upAxis: "+Y"`）。X 轴对应场地宽度，Z 轴对应进深；名义地面范围为 X = −6 至 +6、Z = −5 至 +5。入口侧位于 +Z，弧形背景位于 −Z，修图、化妆与主要收纳区域位于 +X 侧。

12 × 10 × 4.3 米是概念空间尺寸，非现场测绘结果。完整模型包围盒还包含楼板、外墙厚度和屋顶构造，不能直接当作内部可用尺寸。前侧与右侧立面采用剖开展示，便于查看内部。

根节点名为 `Studio_Photography_12x10`，五个直接子组如下：

| 节点名 | 内容 |
|---|---|
| `Studio_Structure` | 地面、墙体、工业窗、无影墙及场地标识 |
| `Studio_Furniture` | 静物陈设、修图和化妆家具、座椅等 |
| `Studio_Equipment` | 相机、柔光箱、反光板、联机车与器材收纳 |
| `Studio_Lighting` | 顶部灯具组件 |
| `Studio_Roof` | 屋面、梁、顶部轨道及风管 |

根节点 `userData` 随 GLB 写入 glTF `extras`，保留 `templateId`、尺寸、`inventory`、`counts`、`footprints` 和 `corridors` 等信息。`inventory` 的 `id` / `nodeName` 指向具名对象组，`category` 表示类别，`layer` 表示所属分组；`counts` 为各类对象数量。实际条目及核对结果见 [inventory-validation.json](validation/inventory-validation.json)。

## 修改边界

这是完整场景，不是单个家具素材。具名对象组可以在支持 glTF 的编辑器中整体平移、旋转、隐藏或替换；编辑时优先操作组节点，避免拆散相机、灯架、桌面设备等组合。页面本身只提供查看和显示开关，不提供拖拽布置、自动布局或设备工作状态模拟。

需要可重复生成时，修改 `model.js` 中的尺寸、摆放与设备建模代码；共用建模函数位于 `scene-kit.js`。修改物料或位置后，同时更新对应的 `inventory`、`counts`、地面占用 `footprints` 与通道 `corridors`，重新导出并复跑验证。直接在外部软件修改 GLB 不会自动回写源代码；以后从源码重新构建时也不会保留这些外部修改。

## 重新建模并导出

保持本包服务器运行，打开 [构建页面](http://127.0.0.1:8778/?build=1)，等待场景完成后点击画布下方的“保存完整模型”。

构建页调用 `buildStudio()`，读取本地笔记本电脑素材并生成其余空间。保存时调用 `portableCopy()` 与 `GLTFExporter`，导出完整分组并内嵌纹理；笔记本素材的量化几何属性在场景副本中转为通用浮点属性。即使当前隐藏屋顶，导出文件也包含屋顶。

服务器的 `POST /__save_model` 只接受本模板根节点，将结果写入固定文件 `studio.glb`，**替换该文件的上次版本**。页面上的缩放、视角和屋顶显示操作不会自动改写 GLB；下载按钮始终下载磁盘上的文件。

## 归档效果图

打开 [归档页面](http://127.0.0.1:8778/?archive=1)，选择视角、调整屋顶显示后，点击“归档效果图”。按钮保存当前三维画布的 PNG，不包含网页文字与控件。三个固定目标为：

| 视角 | 保存文件 |
|---|---|
| 整体 | `previews/studio-overview.png` |
| 俯视 | `previews/studio-top.png` |
| 场内 | `previews/studio-interior.png` |

同一视角再次归档会替换对应 PNG。构建模式也提供归档按钮。`POST /__save_capture` 只允许上述三个目标；普通静态服务器不提供这些写入接口。完整资料包下载文件名为 `studio-scene-template.zip`。

## 离线验证

安装有 Node.js 时，在 `studio/` 目录运行：

```sh
node validation/validate-model.cjs
```

也可指定另一个待检查的模型副本：

```sh
node validation/validate-model.cjs /path/to/studio-copy.glb
```

脚本使用包内 Khronos glTF Validator 和 Node.js 内置模块，无需联网安装依赖。它会重新计算文件哈希并更新本目录 `validation/` 下的模型报告；指定副本时也会覆盖这组报告，请注意保存需要保留的旧结果。

| 报告 | 检查内容 |
|---|---|
| [model-validation-summary.json](validation/model-validation-summary.json) | 本次检查的模型哈希、格式和布局结果摘要 |
| [gltf-validator.json](validation/gltf-validator.json) | Khronos glTF 格式检查及完整提示 |
| [geometry-report.json](validation/geometry-report.json) | 独立读取 GLB 顶点和节点变换后的数量、实际边界、外部资源与分组检查 |
| [inventory-validation.json](validation/inventory-validation.json) | 物料清单、节点名称与分类数量的一致性 |
| [layout-validation.json](validation/layout-validation.json) | 主要物料地面占用、名义边界、通道占用及重叠情况 |

具体统计与通过状态以报告的 `sha256`、`checkedAt` 和 `passed` 为准；改过模型后应重新运行。脚本验证不等于浏览器交互验证，浏览器记录单独保存在 `validation/`。

布局检查基于已声明的水平占用矩形，并读取实际几何边界进行对照；小型零件、曲面、支架腿和有意叠放仍需结合三维画面判断。它不构成场地测绘、专业布光测量、消防、电气、结构或运营条件验收。

## 前后端接入说明

当前状态为 **独立模板，尚未接入正式前端或后端（not integrated）**。本包的本机服务器、下载链接及 `template.json` 归档信息，不代表已创建产品里的场景记录或素材库条目。

后续建议把 `studio.glb` 作为完整场景文件存储，通过 `templateId`、模型地址、SHA-256、尺寸、物料清单和预览图地址建立引用，再由场景加载入口读取。上述字段是接入建议，需按正式后端接口映射，不能将归档清单直接当作后端 `Scene` 请求体。

不要直接把整套摄影棚送入面向单个物料的 asset upload 流程。完整场景包含建筑、多种设备、分组和元数据，应先确认完整场景的存储与加载约定；若要复用单个物料，应另行拆分并登记其来源与尺度。

## 素材来源与许可

唯一复用的第三方三维素材是 `assets/models/laptop.glb`，来自已有归档中的 3DAssets.dev **Convertible flip laptop**。其归档许可为 CC0 1.0 Universal，原始来源记录、哈希与许可声明随包保留；这不是本次重新进行的在线许可审计。

其余壳体、无影墙、摄影设备、家具、标识、屏幕图形及程序纹理由本项目原创制作。Three.js 采用 MIT 许可；离线 glTF Validator 采用 Apache-2.0 许可。详细来源见 [ASSET-SOURCES.md](ASSET-SOURCES.md)、[CC0 归档声明](assets/LICENSE-CC0.md)、[Three.js LICENSE](vendor/three/LICENSE) 和 [Validator LICENSE](vendor/gltf-validator/LICENSE)。未调用付费图像或三维生成接口。
