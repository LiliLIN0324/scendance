# 慢调咖啡 · SLOW NOTES

Scendance 完整独立咖啡店三维场景。12 × 9 米、108 ㎡、室内高 3.25 米均为原创概念尺寸，未依据用户现场照片或实测。场景采用浅木、暖白墙面、绿色软装和自然光，包含点单取餐、咖啡操作、糕点展示、小桌、卡座与靠窗座位。

这是静态空间模板。无人物、人数控制、活动阶段或人流仿真；桌椅数量只表示建模物件数量，不表示核定接待容量。

## 本地打开

```sh
cd "/Users/sandra/Documents/ChatGPT/国庆黑客松/scene-template-library/cafe"
python3 serve.py
```

打开 <http://127.0.0.1:8780/>。ZIP 解压后进入 `cafe/` 目录运行同一命令即可。需要 Python 3 和支持 WebGL 的浏览器，无需 npm 安装、账号或 API Key。普通预览只读本地 `cafe.glb` 与本地 Three.js；不能使用 `file://` 双击 HTML 加载模块。

界面保留整体、俯视和场内三个视角、拖动旋转、滚轮缩放、视角复位，以及屋顶/遮挡外墙开关。GLB 下载包含完整屋顶和围护；网页的剖开预览不会删改归档模型。

## 文件与重建

- `cafe.glb`：glTF 2.0 binary 完整场景，纹理内嵌。
- `index.html`、`app.js`、`style.css`：独立预览，默认使用 GLTFLoader 直接读取归档 GLB。
- `model.js`：咖啡店布局、独立对象与设备的生成源码。
- `scene-kit.js`：归档在本目录的本地几何组件。运行和重建均不读取 `office/` 的实时文件。
- `template.json`：schemaVersion 1、complete-scene-template 类型的归档清单。
- `assets/catalogue.json`、`assets/manifest.json`、`ASSET-SOURCES.md`：已归档盆栽的来源、许可、哈希与检查记录。
- `vendor/three/`：随包 Three.js 与 MIT 许可证。
- `previews/overview.jpg`、`top.jpg`、`interior.jpg`：来自真实三维预览的三个视角截图。
- `validation/`：实际导出文件的格式、几何、对象和浏览器检查结果。
- `cafe-template.zip`：可解压运行的完整包。

需要重建时，打开 <http://127.0.0.1:8780/?build=1>，待真实模型构建成功后点击“保存咖啡店 GLB”。保存端点只在本机服务中可用，检查 Origin、GLB 文件头、文件大小和根节点，目标固定为本目录 `cafe.glb`。重建后应重新运行校验并更新清单哈希、截图和 ZIP。

```sh
node validation/validate-glb.mjs
node validation/check-layout.mjs
```

自带布局脚本只依赖本包 Three.js。glTF 格式脚本复用工作区现有 `scendance-frontend/node_modules/gltf-validator`；独立解压使用时可按脚本参数提供已经安装的 Validator 路径。浏览器预览本身不依赖 Node 或 Validator。

## 坐标、分组与编辑

单位为米，+Y 向上；地面中心为 X/Z 原点，地板 X 范围 −6 至 +6、Z 范围 −4.5 至 +4.5，地面标高 Y=0。整场包围盒还可能包含墙厚、屋顶或边沿，不能当成净使用面积。

根节点为 `Cafe_12x9`，主分组为：

| 分组 | 内容 |
| --- | --- |
| `Cafe_Structure` | 地板、固定墙面、窗框与建筑饰面 |
| `Cafe_Furniture` | 操作柜体、桌椅、卡座、窗边吧台、绿植 |
| `Cafe_Equipment` | 咖啡机、磨豆机、糕点柜、点单设备、备餐设备与菜单等 |
| `Cafe_Lighting` | 灯具与随 GLB 导出的实际灯光 |
| `Cafe_Roof` | 可隐藏屋顶及遮挡外墙 |

每件家具/设备保留 `Cafe_<Role>_<序号>` 的独立命名节点，且带有 `userData.editableObject` 与 `role`。根节点保存 `inventory`、`counts` 和布局检查所用的家具占地信息。完整对象清单来自实际 GLB 校验结果。

在 Three.js 中可以按对象名选择其分组并修改 `position`、`rotation`、`scale`；不得将该独立分组误称为已经实现正式产品的逐件编辑功能。预览页不提供拖拽家具、尺寸编辑或自动重排。部分几何与材质为复用资源，如需只修改一件对象的材质，应先克隆该材质。整体缩放不会智能调整座椅净距、台高或设备操作空间，修改布局后应重新检查。

## 前后端加载路径与接入边界

**当前独立前端**：页面入口 `index.html`，模块入口 `app.js`，模型地址相对于页面为 `./cafe.glb`，清单地址为 `./template.json`。可用以下等价加载方式保留原始层级：

```js
const gltf = await new GLTFLoader().loadAsync('./cafe.glb');
const cafe = gltf.scene.getObjectByName('Cafe_12x9');
scene.add(cafe);
cafe.getObjectByName('Cafe_Roof').visible = false; // 剖开查看
```

**后续静态库归档路径建议**：`scene/templates/cafe/`，对应浏览器模型 URL `/scene/templates/cafe/cafe.glb` 和清单 URL `/scene/templates/cafe/template.json`。这只是与已有完整场景包一致的建议路径，本次没有写入共享 checkout、注册资产或部署。集成方应以实际静态资源前缀为准。

**当前正式前端参考入口**：工作区 `scendance-frontend/frontend/components/room-organizer/three/glb-assets.ts` 使用 GLTFLoader 处理单个物料。咖啡店应通过完整场景入口载入根节点，或者由后续专门转换流程逐件注册对象，不能仅把它改名为一件桌子上传。

**后端参考入口与存储**：工作区 `scendance-frontend/supabase/functions/_shared/assets.ts` 的资产记录使用 `<owner>/<asset-id>/<sha256>.glb` 存储路径；`_shared/models.ts` 是现有单物料文件校验。完整场景需要独立的模板归档/登记流程，保留本清单、模型哈希和层级，再由后端返回模型可读 URL。此处不调用任何上传接口、数据库、对象存储或生成 API，也没有把 `template.json` 冒充为后端 `Scene` 数据结构。

**完整场景不等同于单物料上传接口**。单物料通路具有自己的体积与复杂度限制；独立节点和 glTF 格式通过并不表示整场已兼容正式上传或后端编辑协议。

## 来源与验证边界

盆栽复用已经归档的 3DAssets.dev 模型并核对 SHA-256。其他室内构件、木餐椅、咖啡设备、菜单、食品造型和画面为本模板程序建模。品牌“慢调 / SLOW NOTES”与菜单是原创虚构示例。素材许可按本地归档证据保留，详见 `ASSET-SOURCES.md`。

尺寸和布置属于概念设计。校验覆盖静态模型边界、指定通道及设备贴合；没有模拟人流、开门、搬椅或设备维护，也不构成现场测量或施工图。

## 最终文件检查

归档 GLB 为 **3,798,732 字节（3.62 MiB）**，包含 813 个节点、750 个网格实例、63,688 个三角形、47 个独立对象和 8 张内嵌图片，无外部资源。

SHA-256：`b739d1e18375ee9705a8d0dc56d7d84d832f5684e71a7f1c31a1af42099df4f8`。

Khronos glTF Validator：0 错误、0 警告；另有 242 条信息级提示（239 条未使用对象、3 条非 2 次幂图片尺寸），完整记录保留在 `validation/gltf-validation.json`。布局检查读取导出文件的真实顶点和层级变换：26 件落地家具的 325 对组合与指定通道检查通过；12 组台面设备/物件实际间隙均为 1 毫米，满足 0–2 毫米容差。墙挂对象仅做有限靠墙距离检查。

浏览器实测与三个视角截图记录在 `validation/browser-validation.json`；命名分组保留编辑基础，页面交互只覆盖观察功能。
