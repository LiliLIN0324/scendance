# 摄影棚素材来源

本场景仅复用一款已归档的 3DAssets.dev 笔记本电脑模型，其余空间与摄影设备由本项目程序建模。未下载新素材，未调用付费图像或模型接口，不含人物。

## 笔记本电脑

- 本地文件：`assets/models/laptop.glb`
- 原始模型：[Convertible flip laptop — Computers and Desk Gadgets](https://3dassets.dev/assets/computers-and-desk-gadgets-laptop-convertible-flip-068fe56f)
- 原始 CDN：https://cdn.3dassets.dev/assets/38825/v1/model.glb
- 原归档来源：`scendance-github-preview/assets/catalogue.json`，逐项原始记录随包保存在 `assets/SOURCE-ASSET-METADATA.json`。
- 归档许可：CC0 1.0 Universal，不要求署名；供应方标记为 AI 生成。许可声明及官方链接见 `assets/LICENSE-CC0.md`。这是已有归档声明，不是本次在线许可审计。
- SHA-256：`653437c34a05208daa868e46165843455099e01656d4da67c54183e67c78978a`
- 文件大小：75,356 字节；2026-10-03 已重新计算哈希并与原归档核对相符。
- 原始模型约宽 0.329 × 深 0.255 × 高 0.213 米；5 个网格、1,692 个三角形，不含外部图片或 buffer URI。
- 原始文件使用 `KHR_mesh_quantization`；原文件保持不变，场景导出时须解码为通用浮点几何属性。

本款是 Convertible flip laptop，不能与素材库中另一款 Laptop open 14 混用来源或哈希。

## 程序建模与运行依赖

下列部件由本项目原创程序建模：

- 摄影棚壳体、工业窗、屋顶、灯轨及顶部灯具。
- 无缝背景：地面、半径 1.2 米的四分之一圆弧和竖向背景连接为同一连续曲面网格，宽 6.9 米；曲面以有限三角形近似。
- 摄影机、镜头、三脚架、八角柔光箱、条形柔光箱、反光板、灯架、沙袋及联机线。
- 移动联机车、背景纸架、器材架、备用灯具与镜头、收纳灯架和飞行箱。
- 化妆台、带灯镜、修图桌、显示器、键盘、数位板、座椅、静物展台与陈设。
- 地面标识、墙面文字、修图屏幕图形及程序纹理。

第三方三维素材仅为上表的笔记本电脑。以上均是概念展示，尺寸和设备配置不构成现场测绘、器材厂商规格或专业布光测量；没有人物或人台模型。

最终 `studio.glb` 的源笔记本量化属性已解码为浮点几何，7 张图片全部内嵌，无需外部图片或模型请求。原始 `assets/models/laptop.glb` 保持原文件与原哈希。

- Three.js：MIT 许可，全文见 `vendor/three/LICENSE`。
- Khronos glTF Validator 2.0.0-dev.3.10：从本工作区现成依赖复制至 `vendor/gltf-validator/`，保留完整 Apache-2.0 `LICENSE` 与 `NOTICES`。只供本地离线验证，不是预览网页的运行依赖。
- `validation/validate-model.cjs` 使用包内验证器及 Node.js 内置模块，可独立复跑，无需安装 npm 依赖。
