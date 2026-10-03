# 固定参数化资产

纯数据契约为 `supabase/functions/_shared/parametric-contract.ts`。`parametricParametersSchema` 只接受六个固定族：`table`、`chair`、`counter`、`platform`、`backdrop`、`cabinet`。共同字段 `width/depth/height` 单位为米，`color` 是六位十六进制 sRGB。圆桌宽深相等；凳子的总高度就是坐面高度。厚度、层板和 L 形柜台臂宽由服务器校验，模型不能提供脚本、网格、URL 或存储路径。

`buildParametricGlb(parameters)` 返回 `{bytes,metadata,size,parameters}`。固定 builder 输出 Y 向上、X/Z 居中、Y=0 落地的三角面 GLB，带法线、UV 和可编辑 PBR 材质槽。每个结果经过既有 glTF 校验并将实际包围盒与参数尺寸比较。`size` 是准确输入尺寸；`metadata.sourceSize` 是 GLB 浮点测量值，供现有渲染缩放使用。

`createParametricAsset(backend,actor,studioId,requestId,parameters)` 返回 `{asset,reused,resource}`。`resource` 沿用 SceneResource，`resourceId=asset:<UUID>`，`category=parametric`，可进入既有 `add_resource/replace_resource` 提案流程。资源创建不修改场景；替换时仍校验选中对象、锁定、租约、版本和原场景哈希。每次参数变更使用新请求 ID、新资产 ID；已有资产内容不会改变。

迁移 `20261003190000_parametric_assets` 增加私有幂等表和 `parametric.reserve/complete` RPC 分支，先检查工作室成员资格，再进行构建/上传。相同请求与内容重放返回原资产，修改参数重放返回 `IDEMPOTENCY_CONFLICT`；上传中断重试使用原资产 ID 和内容寻址路径。浏览器不能直接访问表或 RPC，不增加每日/累计额度限制。旧资产、任务和授权规则保留。

`metadata.parametric` 保存 `builderVersion/family/parameters/size/procurementStatus`。材质派生会沿用这些来源字段；后续参数编辑重新生成几何时，颜色采用该次参数明确提供的值，不能将原来的纹理或材质修改声称为自动保留。模型仅是外形构型，采购、承重、施工规格仍为 `needs_confirmation`。
