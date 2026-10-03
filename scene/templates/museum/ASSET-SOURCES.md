# 当代美术馆 · 素材来源

本场景是 20 × 14 米的当代美术馆概念方案，策展主题为“留白之间 / THE SPACE BETWEEN”。建筑、展墙、开放雕塑展台、原创抽象绘画与雕塑装置、展签图形、艺术创作体验台、灯具和示意人物由本项目程序建模或绘制。示例作品均为虚构概念，不对应真实艺术家、创作年代或馆藏来源。

## 复用的环境道具

以下两件道具复制自工作区已经归档的 3DAssets.dev 物料库。只用作休息区座椅及装饰植物，不作为馆藏。许可信息沿用 `scendance-github-preview/assets/library/catalogue.json` 的 2026-10-02 归档记录；本次没有重新在线核验供应方条款。原文件未改写，复制前后 SHA-256 均与归档值核对一致。

| 本地文件 | 来源页面 | 归档许可 | 原文件 SHA-256 |
|---|---|---|---|
| `assets/models/chair.glb` | [Dining Chair Timber](https://3dassets.dev/assets/bedroom-and-living-room-furniture-dining-chair-timber-b8b614f7) | CC0 1.0 Universal | `41ceb2de779a5f237bc4b77101199362e36a9526b3d8a64003d4404746cb7380` |
| `assets/models/plant.glb` | [Planter with Shrub](https://3dassets.dev/assets/street-food-market-and-food-trucks-planter-with-shrub-0eedba0e) | CC0 1.0 Universal | `5ff09e626c231efe65a4c163caea4b5fd84d002da304749161e472c666454f20` |

完整来源地址、CDN 地址、字节数、三角形数、许可依据和哈希保存在 `assets/catalogue.json`。两件资产共 45,516 字节、948 个源三角形，不含外部图片。布局时可作等比例缩放与转向；合并导出可能把原始量化顶点解码为普通浮点属性，因此合并模型的哈希不与原道具相同。

## 运行与验证代码

Three.js、OrbitControls、GLTFLoader、GLTFExporter 随 `vendor/three/` 本地提供，其 MIT 许可见 `vendor/three/LICENSE`。网页运行时不依赖外部 CDN，也不调用付费图片或模型生成服务。

格式检查使用本工作区已有的 Khronos glTF Validator，具体版本与结果记录在 `validation/gltf-validation.json` 及 `validation/model-inspection.json`。验证器是复核工具，不是网页运行依赖。

展签和原创图形为程序绘制并随完整 GLB 内嵌。系统字体只参与构建时的文字栅格化；独立模型打开时不需下载这些字体。
