# 户外市集素材来源

本包复用 2026-10-02 已归档的 3DAssets.dev 模型。下表的原始 GLB 均逐字节复制，SHA-256 已与原 catalogue 核对相符；所有模型无外部 buffer/image URI。未调用付费模型或图像接口，未新增下载。

许可依据为现有归档的 **CC0 1.0 Universal** 声明（不要求署名），不是本次新进行的在线许可审计。原 catalogue 和来源说明随包保留，见 `assets/SOURCE-CATALOGUE.json`、`assets/SOURCE-LIBRARY-README.md`；本包逐项记录见 `assets/catalogue.json`，许可说明见 `assets/LICENSE-CC0.md`。

尺寸以模型原始顶点经节点变换后的实际 XYZ 包围盒计算，表中按宽 × 深 × 高列出；场景可按设计尺寸缩放，原文件不改写。

| 本地文件 | 归档原始素材 | 原始宽 × 深 × 高（米） | SHA-256 |
|---|---|---|---|
| `assets/models/table.glb` | [Trestle Table (Medieval Monastery and Scriptorium)](https://3dassets.dev/assets/medieval-monastery-and-scriptorium-trestle-table-2a0801e0) | 1.900 × 0.820 × 0.862 | `774b974756875549fd608e72f11cd24c6c1fdcb0d1c9f18381845591c2f446fc` |
| `assets/models/chair.glb` | [Dining Chair Timber (Bedroom and Living Room Furniture)](https://3dassets.dev/assets/bedroom-and-living-room-furniture-dining-chair-timber-b8b614f7) | 0.490 × 0.471 × 1.003 | `41ceb2de779a5f237bc4b77101199362e36a9526b3d8a64003d4404746cb7380` |
| `assets/models/planter.glb` | [Planter with Shrub (Street Food Market and Food Trucks)](https://3dassets.dev/assets/street-food-market-and-food-trucks-planter-with-shrub-0eedba0e) | 0.940 × 0.930 × 1.307 | `5ff09e626c231efe65a4c163caea4b5fd84d002da304749161e472c666454f20` |
| `assets/models/bin.glb` | [Waste Bin Foot Pedal (Underground Bunker and Survivor Hideout)](https://3dassets.dev/assets/bunker-shelter-construction-waste-bin-foot-pedal-f50124e7) | 0.450 × 0.518 × 0.700 | `3138813599ae643bae98c0d1c0765b5d9e2c47172a892df095e1fe41eddc74e6` |
| `assets/models/parasol.glb` | [Cafe Parasol (Hero Shooter Harbour Payload)](https://3dassets.dev/assets/hero-shooter-harbour-payload-cafe-parasol-3af84c9f) | 2.520 × 2.520 × 2.720 | `5711e4a9ea8f34e54f9c945109c3964a8b7654aed97fcb396e056fc814522d43` |
| `assets/models/microphone.glb` | [Microphone on a Boom Stand (Live Music Venue and Festival Stage)](https://3dassets.dev/assets/live-music-venue-and-festival-stage-microphone-on-boom-b553a46d) | 1.222 × 0.576 × 1.838 | `ce4e75c881e8186395ec196ea4bbd6a747b4904f2c0811ba7e4beadf5b7dcfa0` |

来源文件均为 glTF 2.0，部分包含 `KHR_mesh_quantization` 和 `EXT_texture_webp`；内嵌图片保持在 GLB 内。预览器通过 GLTFLoader 解码；合并导出需将量化顶点解码为浮点属性，并将纹理内嵌到最终 GLB。

场地、地面标线、摊位编号、入口文字、及其他程序生成部件由本项目制作；它们是概念设计元素。桌椅、摊位的位置与场地尺寸是设计假设，不构成现场测量或容量认证。

最终 `market.glb` 导出时已解码量化顶点，并将纹理转为内嵌 PNG；原始素材文件保持原样。此版本按用户要求不包含人物。Three.js 的 MIT 许可全文见 `vendor/three/LICENSE`。

验证工具复用工作区现有 glTF Validator 2.0.0-dev.3.10；随包复制其原文件，Apache-2.0 许可与 NOTICES 保存在 `vendor/gltf-validator/`。
