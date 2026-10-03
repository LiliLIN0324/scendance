# 来源与许可

建筑、工作桌、办公椅、会议家具、软装、设备示意、灯具及原创画面由 `model.js` 和 `scene-kit.js` 程序建模。「留白」和屏幕内容均为概念设计示例。没有下载或使用任务中列出的 Sketchfab 整场景，也未调用付费图像或三维生成 API。

以下两个素材复用此前体育馆已归档的 3DAssets.dev GLB，复制时核对文件 SHA256 与原清单一致；本次没有重新查询上游授权状态。原始文件、作者/平台提供的信息和许可对象保存在 `assets/catalogue.json`。

| 本地文件 | 上游来源 | 归档许可 |
| --- | --- | --- |
| `assets/models/plant.glb` | [Studio Plant Pot](https://3dassets.dev/assets/tattoo-and-piercing-studio-studio-plant-pot-7ee5b536) | CC0 1.0 Universal |
| `assets/models/laptop.glb` | [Convertible Flip Laptop](https://3dassets.dev/assets/computers-and-desk-gadgets-laptop-convertible-flip-068fe56f) | CC0 1.0 Universal |

复用模型在场景中按目标高度等比例缩放、居中并贴合支承面。导出工具把原始量化属性转成浮点几何以便独立加载，源 GLB 没有修改。共享材质在拆分编辑时可以按需 clone，避免修改一个物件时连带影响同材质物件。

Three.js 与附带 addons 沿用现有场景库版本；MIT 许可全文见 `vendor/three/LICENSE`。第三方资产的归档许可不应扩展解释为任意参考照片或其他外部模型的许可。
