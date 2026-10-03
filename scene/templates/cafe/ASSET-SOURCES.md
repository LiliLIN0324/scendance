# 咖啡店模板素材来源

本模板是一处 **12 × 9 米、108 平方米的静态概念咖啡店**。尺寸是设计假设，不是照片测量结果或真实店铺的复刻。模板不包含人物、人数调节或阶段演示。

## 本次使用的归档模型

只有以下盆栽使用了外部 GLB。它已保存在本地，本次没有联网下载或重新查询上游许可。

| 用途 | 原始素材 | 本地文件 | 默认尺寸 X × Y × Z（米） | 字节 | 三角形 |
| --- | --- | --- | --- | ---: | ---: |
| 室内宽叶盆栽 | [Studio Plant Pot](https://3dassets.dev/assets/tattoo-and-piercing-studio-studio-plant-pot-7ee5b536) | `assets/models/plant.glb` | 0.809956 × 1.672433 × 0.854090 | 40,208 | 1,036 |

- 原始 slug：`tattoo-and-piercing-studio-studio-plant-pot-7ee5b536`。
- 上游模型 ID：`34557`。
- [上游元数据地址](https://3dassets.dev/api/v1/assets/tattoo-and-piercing-studio-studio-plant-pot-7ee5b536) · [原始 GLB 地址](https://cdn.3dassets.dev/assets/34557/v1/model.glb)。
- 许可证据：`scene-template-library/gym/assets/catalogue.json` 中 2026-10-02 归档的**单件许可对象**，记录为 `CC0 1.0 Universal`、`attributionRequired: false`，并附有 [CC0 1.0 许可文本](https://creativecommons.org/publicdomain/zero/1.0/)。这是归档记录，未在本次重新向上游确认。
- 本次核对日期：2026-10-03。咖啡店文件、原归档 GLB 与原清单 SHA-256 三者一致：

  `a4ecf82c56717032ca0cb588d1664c3de7867971f2dce6a364a794a341b6df9a`

[`assets/catalogue.json`](assets/catalogue.json) 和 [`assets/manifest.json`](assets/manifest.json) 保留上游页面、CDN、完整原记录、许可对象、原清单哈希、源文件哈希、副本哈希与本次验证结果。上游归档将该模型标识为 AI 生成素材。

## 本次验证与放置方法

- GLB 2.0 头与声明文件长度正确；二进制缓冲、buffer view、accessor 范围、索引对应顶点范围及材质引用检查通过。
- 解码量化顶点并应用完整默认场景节点变换后，实际尺寸与原清单精度一致；全部顶点数值有限，三角形数为 1,036。
- 原记录声明 **+Y 向上、米制**。实际几何与该声明的 X/Y/Z 米制边界一致，底部 Y 为 0。
- 文件没有外部纹理、图片或二进制资源引用；运行预览无需访问素材提供者。
- 模型使用 `KHR_mesh_quantization`。保留内部节点变换，以实际 `Box3.min.y` 和 X/Z 中点校正位置后等比例缩放；不要直接把内部量化顶点当成最终场景尺寸。整场导出可转为浮点几何，归档原文件保持不变。
- 模型包含深色支架、白色花盆、绿色宽叶与少量品红盆饰。植物叶片完整边界宽于花盆占地。

上述记录验证的是素材完整性与几何数据，不代替整场模型的加载、显示或布局检查；相关结果见模板的 `validation/`。

## 原创内容与软件许可

除盆栽外，本模板的建筑结构、木餐椅、桌台、咖啡设备、灯具、装饰画、程序表面材质及虚构菜单均由本模板代码制作。原创画作和菜单用于概念空间展示，不冒充真实品牌或经营信息；未使用照片重建依据或付费生成接口。

Three.js 是第三方软件，按 MIT 许可随包保留，许可原文见 [`vendor/three/LICENSE`](vendor/three/LICENSE)。盆栽的 CC0 许可不自动覆盖本模板之外的照片、画作、文字或其他第三方资源。
