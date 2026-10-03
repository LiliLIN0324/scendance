# 学术会议模板素材来源

本模板复用已归档的 3DAssets.dev GLB。六个原文件均逐字节复制到本目录，源文件、原清单 SHA-256 与复制文件 SHA-256 三者一致；本次没有重新下载模型，也没有重新查询上游许可状态。

本场景实际使用 `chair`、`laptop`、`plant`、`speaker` 四件模型。`lectern` 和 `microphone` 仅作为备用素材归档，未纳入本场景；主讲台与鹅颈麦克风由模板程序建模。

| 用途 | 上游来源 | 本地文件 | 实测 X × Y × Z（米） | 字节 | 归档许可证据 |
| --- | --- | --- | --- | ---: | --- |
| 观众座椅 | [原始素材页](https://3dassets.dev/assets/office-lobby-and-facilities-canteen-stacking-chair-3440c7d8) | `assets/models/chair.glb` | 0.460 × 0.887 × 0.514 | 51,616 | CC0 1.0（单件许可对象） |
| 控制台与签到笔记本 | [原始素材页](https://3dassets.dev/assets/computers-and-desk-gadgets-laptop-convertible-flip-068fe56f) | `assets/models/laptop.glb` | 0.329 × 0.213 × 0.255 | 75,356 | CC0 1.0（单件许可对象） |
| 室内盆栽 | [原始素材页](https://3dassets.dev/assets/tattoo-and-piercing-studio-studio-plant-pot-7ee5b536) | `assets/models/plant.glb` | 0.810 × 1.672 × 0.854 | 40,208 | CC0 1.0（单件许可对象） |
| 舞台PA音箱 | [原始素材页](https://3dassets.dev/assets/village-hall-and-community-events-pa-speaker-on-stand-7ffa787e) | `assets/models/speaker.glb` | 0.724 × 1.809 × 0.693 | 19,788 | CC0 1.0（单件许可对象） |
| 讲台（备用，未使用） | [原始素材页](https://3dassets.dev/assets/japanese-school-and-city-street-lectern-f8b909de) | `assets/models/lectern.glb` | 0.620 × 1.545 × 0.420 | 82,252 | CC0 1.0（素材库总许可声明） |
| 落地麦克风（备用，未使用） | [原始素材页](https://3dassets.dev/assets/live-music-venue-and-festival-stage-microphone-on-boom-b553a46d) | `assets/models/microphone.glb` | 1.222 × 1.838 × 0.576 | 51,392 | CC0 1.0（素材库总许可声明） |

## 许可与记录边界

- 椅子、笔记本、盆栽与音箱取自 `scene-template-library/gym/assets/catalogue.json`，归档日期为 2026-10-02。每件原记录包含 `CC0 1.0 Universal` 许可对象、许可网址和 `attributionRequired: false`。
- 备用讲台与麦克风取自 `scendance-github-preview/assets/library/catalogue.json`，归档获取时间为 `2026-10-02T09:43:36Z`。该清单只有素材库层级的 `CC0 1.0 Universal` 与 `attributionRequired: false` 声明，不能将它描述成已保留单件 API 许可对象。
- [CC0 1.0 许可文本](https://creativecommons.org/publicdomain/zero/1.0/)。许可状态在此按本地归档记录呈现，没有新增版权保证。
- 每件素材的原始 slug、页面/CDN 链接、完整原记录、许可证据来源、原清单哈希、源文件哈希与复制文件哈希均保存在 [`assets/manifest.json`](assets/manifest.json)。
- 场地结构、舞台主屏、会议信息、海报、家具补件、人物与导视采用模板程序建模。大会名称与海报是虚构的布局示例，不代表真实会议或学术结论。
- Three.js 随模板使用 MIT 许可，许可文本见 `vendor/three/LICENSE`。以上素材许可不自动覆盖其他来源的照片、文字或真实场地数据。

## 几何与放置

已在本次检查六个文件的 GLB 2.0 头、声明文件长度、默认场景节点变换、量化顶点位置、顶点有限数值、实际三角形数量和外部资源引用。所有 GLB 都不依赖外部纹理或二进制文件。此检查不是完整的渲染与场地安全验证，整场模型与布局另见 `validation/`。

所有模型实际为 **+Y 向上、米制**。上表来自本次解码 POSITION 并应用完整默认场景变换后的尺寸；备用讲台/麦克风原素材库的 `sizeMeters` 按宽/深/高排序，不能直接当成 glTF X/Y/Z。

- **chair**：浅灰可叠椅，0.887 米高、座面约 0.45 米；椅背位于 −Z，坐向 +Z。排列时按椅子完整实际边界验证通道。
- **laptop**：屏幕在 −Z，使用者侧在 +Z；按实际 `Box3.min.y` 贴桌面，避免浮空。
- **plant**：1.672 米高；白盆宽叶，包含少量品红色盆饰。
- **speaker**：1.809 米高；三脚架和箱体为一体，正面 +Z，布局须包括支架占地。
- **lectern**：1.545 米高，嵌入两张 WebP 贴图并使用 `EXT_texture_webp`。造型经缩略图检查不适合本主会场，因此仅归档。
- **microphone**：1.838 米高，横臂向 +X 伸出；以实际边界的 X/Z 中点与最小 Y 做定位，原点不等于模型中心。本场景使用程序生成的鹅颈麦克风。

六个文件均使用 `KHR_mesh_quantization`。克隆时保留原节点变换；整场导出可将量化属性转成浮点属性，但不改写本目录中的归档原文件。六件源模型合计 **320,612 字节、5,834 个三角形**；四件实际使用素材合计 **186,968 字节**。

## 精确归档文件

- **chair**：`office-lobby-and-facilities-canteen-stacking-chair-3440c7d8`  
  [原始 GLB](https://cdn.3dassets.dev/assets/26231/v1/model.glb)  
  SHA-256：`0ef21a9011a00e92766aa88fb434927ccbf85b47d4746c6e39228ca27e2f9813`

- **laptop**：`computers-and-desk-gadgets-laptop-convertible-flip-068fe56f`  
  [原始 GLB](https://cdn.3dassets.dev/assets/38825/v1/model.glb)  
  SHA-256：`653437c34a05208daa868e46165843455099e01656d4da67c54183e67c78978a`

- **plant**：`tattoo-and-piercing-studio-studio-plant-pot-7ee5b536`  
  [原始 GLB](https://cdn.3dassets.dev/assets/34557/v1/model.glb)  
  SHA-256：`a4ecf82c56717032ca0cb588d1664c3de7867971f2dce6a364a794a341b6df9a`

- **speaker**：`village-hall-and-community-events-pa-speaker-on-stand-7ffa787e`  
  [原始 GLB](https://cdn.3dassets.dev/assets/35204/v1/model.glb)  
  SHA-256：`46083c231cbd4d24dd60ef7306f35577aea7c8b8f6b3f74b8fc4ea160b28106a`

- **lectern**：`japanese-school-and-city-street-lectern-f8b909de`  
  [原始 GLB](https://cdn.3dassets.dev/assets/30085/v1/model.glb)  
  SHA-256：`fdbd9f2e1e8ae96e30c98d758dee82301eb32b5811e925d96854e56d685d65ea`

- **microphone**：`live-music-venue-and-festival-stage-microphone-on-boom-b553a46d`  
  [原始 GLB](https://cdn.3dassets.dev/assets/33914/v1/model.glb)  
  SHA-256：`ce4e75c881e8186395ec196ea4bbd6a747b4904f2c0811ba7e4beadf5b7dcfa0`
