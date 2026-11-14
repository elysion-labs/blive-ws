# Changesets

包的行为或公共 API 改变时，运行 `vp run changeset`，选择 `@elysionjs/blive-ws` 的版本级别并写入面向使用者的说明。将生成的 Markdown 文件和代码一起提交。

合并到 `main` 后，Release 工作流创建或更新版本 PR；合并版本 PR 后，再执行检查、常规测试、真实 raw 快照回归和构建，全部成功才发布 npm 包并创建 GitHub Release。

CI 不运行采集，不需要 Cookie；发布使用 npm Trusted Publisher。首次发布和仓库设置见 [发布文档](../docs/releasing.md)。
