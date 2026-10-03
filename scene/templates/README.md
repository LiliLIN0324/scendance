# 完整场景库

十类完整场景统一归档在 `codex/gym-scene-template` 分支的 `scene/templates/`。每类包含独立 GLB、template.json、预览页面、生成源码、素材来源、效果图、验证记录和 ZIP。

[index.html](index.html) 是十个场景共用的查看器：一屏一场景、滚动吸附；左侧是可收缩的分区、时段与人物，右上角切换分区标签与屋顶／外墙；点击某个分区，镜头会聚焦到对应区域。

## 模型与完整包

| 场景 | 模型与说明 | 完整 GLB | 可解压运行的 ZIP |
| --- | --- | --- | --- |
| 体育馆 · 黑客松 | [gym/](gym/) | [gym.glb](gym/gym.glb) | [gym-scene-template-v1.zip](gym/gym-scene-template-v1.zip) |
| 品牌快闪 · 青序 | [popup/](popup/) | [popup.glb](popup/popup.glb) | [popup-scene-template-v1.zip](popup/popup-scene-template-v1.zip) |
| 室外草坪 · 旷野有约 | [lawn/](lawn/) | [lawn.glb](lawn/lawn.glb) | [lawn-scene-template-v1.zip](lawn/lawn-scene-template-v1.zip) |
| 户外市集 · 风物市集 | [market/](market/) | [market.glb](market/market.glb) | [market-scene-template.zip](market/market-scene-template.zip) |
| 美术馆 · 留白之间 | [museum/](museum/) | [museum.glb](museum/museum.glb) | [museum-template.zip](museum/museum-template.zip) |
| 学术会议 · 共知 | [conference/](conference/) | [conference.glb](conference/conference.glb) | [conference-template.zip](conference/conference-template.zip) |
| 办公室 · 留白 | [office/](office/) | [office.glb](office/office.glb) | [office-scene-template-v1.zip](office/office-scene-template-v1.zip) |
| 摄影工作室 | [studio/](studio/) | [studio.glb](studio/studio.glb) | [studio-scene-template.zip](studio/studio-scene-template.zip) |
| 酒吧 · 琥珀间 | [bar/](bar/) | [bar.glb](bar/bar.glb) | [bar-template.zip](bar/bar-template.zip) |
| 咖啡店 · 慢调 | [cafe/](cafe/) | [cafe.glb](cafe/cafe.glb) | [cafe-template.zip](cafe/cafe-template.zip) |

## 本次补传

2026-10-03 补传草坪、市集、美术馆、学术会议、办公室的完整目录；补齐体育馆、快闪的 ZIP，草坪原来位于库上层的 ZIP 一并放回对应目录。美术馆使用本地最新的留白稀疏 v2。摄影工作室、酒吧、咖啡店沿用分支内已有归档。独立物料的咖啡机、吊灯、小盆栽见 [补充物料说明](../../assets/models/EXTRA-MODELS.md)。

本次保留各场景和原 ZIP 的字节内容。各模板或包内的 `Not pushed`、`Not uploaded`、`local archive only` 等是制作时记录；GitHub 当前归档位置以本页和 [上传清单](UPLOAD-INVENTORY.json) 为准。清单包含十个模型及 ZIP 的大小和 SHA-256。

## 一起预览

在仓库根目录运行 `python3 serve.py 8771`，打开 <http://127.0.0.1:8771/scene/templates/>，选择场景。GitHub 文件页面用于阅读说明、查看截图和下载文件，不会直接运行三维预览。

也可以解压单个 ZIP，按包内 README 在对应目录运行 `python3 serve.py`。各场景原有的本地端口与重建步骤保持原样。

## 使用范围与对接

这是场景素材归档与独立预览入口。本次上传不合并 main、不部署网站、不登记后端资产，也不改变生成接口。正式产品接入状态应以 main 和部署记录为准，不能由本分支文件存在推断已上线。

完整场景采用 glTF 2.0 binary、米制约定和 Y 轴向上，模型贴图内嵌。各场景的尺寸依据、分组、人数/交互、前后端接入边界和来源见各自 README、template.json 与 ASSET-SOURCES.md。完整场景不等于单件家具，不能直接当作已通过单件物料上传限制的文件。

人数和尺寸为各示例的设计假设；本次只核验归档完整性、文件一致性与入口引用，没有重新进行场景交互或现场尺度验收。
