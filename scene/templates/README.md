# 完整场景库

体育馆、品牌快闪、摄影工作室、酒吧与咖啡店放在同一个分支 `codex/gym-scene-template`，每个目录都包含完整 GLB、独立预览页面、生成源码、素材来源及验证记录。

| 场景 | 模型与说明 | 已实现的交互 |
| --- | --- | --- |
| 体育馆 · 黑客松 | [gym/](gym/) · 100 位参与者、25 支团队的概念方案 | 旋转、缩放、三个视角、屋顶开关 |
| 品牌快闪 · 青序 | [popup/](popup/) · 12 × 8 米概念方案 | 旋转、缩放、三个视角、四个阶段、8–30 位来访者与 2 位店员 |
| 摄影工作室 · STUDIO / 01 | [studio/](studio/) · 12 × 10 米概念方案 | 旋转、缩放、三个视角、屋顶与分区说明开关 |
| 酒吧 · 琥珀间 | [bar/](bar/) · 12 × 9 米概念方案 | 旋转、缩放、三个视角、外墙与顶盖开关 |
| 咖啡店 · 慢调 | [cafe/](cafe/) · 12 × 9 米概念方案 | 旋转、缩放、三个视角、屋顶与外墙开关 |

## 新增模型与完整包

三个新场景与 `gym/`、`popup/` 并列，归档日期为 2026-10-03。ZIP 保留经验证的原始内容，与各目录内模型、清单及预览图一致。

| 场景 | 完整模型 | 可解压运行的 ZIP |
| --- | --- | --- |
| 摄影工作室 | [studio/studio.glb](studio/studio.glb) | [studio/studio-scene-template.zip](studio/studio-scene-template.zip) |
| 酒吧 | [bar/bar.glb](bar/bar.glb) | [bar/bar-template.zip](bar/bar-template.zip) |
| 咖啡店 | [cafe/cafe.glb](cafe/cafe.glb) | [cafe/cafe-template.zip](cafe/cafe-template.zip) |

各包内 `local archive only`、`Not pushed` 等描述是首次打包时的状态记录。当前三个目录已纳入上述 GitHub 分支；正式网站的场景登记、编辑器与后端接入状态仍以各包说明为准。

## 一起预览

在仓库根目录运行：

```sh
python3 serve.py 8771
```

打开 <http://127.0.0.1:8771/scene/templates/>，选择任一场景。保持终端里的服务器运行；查看无需 npm、账号或 API Key。GitHub 文件页面可以阅读说明和效果图，但不会直接运行三维预览。

## 使用范围

五个场景都是独立模板，尚未接入正式网站的编辑器、物料登记或生成接口。体育馆人数固定；快闪调人数只更新人物，家具布局固定。摄影工作室、酒吧与咖啡店为无人静态空间，物件保留独立命名分组。各自下载的 GLB 均为已归档的默认快照。

场馆均未经过现场尺寸测量，概念人数不代表现场核定容量。详细假设、来源和验证范围见各目录的 README 与 template.json。重建模型使用对应目录内的 serve.py，操作方法见各自说明。
