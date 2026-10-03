# 四人通过 GitHub 协作

唯一仓库：[LiliLIN0324/scendance](https://github.com/LiliLIN0324/scendance)。默认分支 `main`。采用 GitHub 官方的 [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow)：任务分支、提交、PR、评审、合并。GitHub 同步代码与任务，不会自动让四台电脑共享运行中的网站或数据库。

## 一次性准备

仓库拥有者添加四位成员为协作者，各自接受邀请。将真实姓名与 GitHub 用户名填入 `docs/team/TASKS.json.runtime`，不要猜测账号对应角色。仓库拥有者可设置 main 必须通过 PR、至少另一人评审和协作文档检查；这些规则是否实际开启，以仓库设置为准。

A/B 各自在自己的电脑 clone。C/D 也可 clone；只改文字时可以使用 GitHub 网页编辑，选择新建分支并发起 PR。四个人不要共享同一份本地 checkout。

```sh
git clone https://github.com/LiliLIN0324/scendance.git
cd scendance
git status
```

当前原型运行：`python3 -m http.server 8766 --bind 127.0.0.1`。后续 A01/S01 如更换为计划底座，需同步实际安装、构建和部署命令。

## 一个任务从领取到交付

1. 在 TASKS.md 找到自己的任务，检查开始依赖。Issue 记录任务 ID、负责人、预期交付和阻塞；已有对应 Issue 时复用，不重复创建。
2. 工作区干净时更新 main 并建立短分支。示例：

```sh
git switch main
git pull --ff-only origin main
git switch -c codex/a-a08-floorplan
```

3. 实现或补充资料。接口有变化先与 B 对齐契约，C 提供数据样例。只提交本任务文件，不用 `git add .` 把密钥、临时文件和其他人的改动混进去。
4. 检查协作文件并完成任务需要的真实验证：

```sh
python3 scripts/validate_team.py
git diff --check
git diff --stat
```

5. 按实际文件选择 `git add 路径`，再提交和推送：

```sh
git commit -m "feat: add floorplan calibration for A08"
git push -u origin codex/a-a08-floorplan
```

6. 在仓库 Pull requests 中创建 PR，base 选择 main。填写任务 ID、修改内容、验证、未完成项和 `Refs #Issue编号`；附 `docs/team/reports/A/A08.md` 及实际提交 SHA。未完成用 Draft PR 让队友提前了解接口。
7. 另一位成员检查。A 的实现由 B 审；B 的实现由 A 审；C 的数据由使用它的开发者校验；D 的讲稿与验收由 C 核对。B 集成，D 对实际功能复验。
8. B 核对依赖和证据后更新 TASKS.json。PR 合并不自动证明功能完成；真实验收未通过时保持 review 或 blocked。

## 状态和合并约定

- TASKS.json 是唯一任务状态真源。Issue/PR 保存讨论和证据，不另外维护一套不同步的“完成”表。
- 每人同时一个主要任务，每任务一个短分支；及时交小 PR，完成合并后从最新 main 开下一项。
- 不直接推送 main，不强推他人分支。发生冲突先确认文件归属，由对应负责人保留双方必要修改，再重新验证。
- 生成资产使用授权存储和稳定 ID。客户图纸、账号密码、API Key、有效分享令牌不上传公开仓库。测试证据须移除这些内容。
- `.github/workflows/team-check.yml` 仅检查任务结构、依赖、需求快照和任务卡，不能替代产品类型检查、构建、权限和真实手机测试。A/B 在实际底座确定后再添加产品 CI。

## 四个 AI 怎么协同

每个 AI 只读当前仓库的最新计划、任务和自己的角色提示词；按文件边界工作。交接通过 PR 和报告，不依赖另一个聊天能读到自己的上下文。需要共享字段、资产或账号配置时，写出任务 ID、所需输入、接收人和仍可独立做的工作。

Issue、PR、提交 SHA 回填到任务 `github` 字段，成员使用自己的本地路径。合并负责人也要拿到其他人的评审，不能一人写、一人自证全部通过。

## 路演前

D 记录最终演示提交、部署地址、两个测试账号的安全获取方式、演示顺序和恢复方法；C 准备真实场景。B 冻结演示版本，A/B 修复阻断问题。GitHub Issue 模板要进入默认分支后才会出现在“New issue”选择页。
