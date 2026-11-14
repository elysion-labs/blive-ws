# CI 与发布

工作流采用检查与发布分开的方式，参考 [cyrenex/core 的配置](https://github.com/cyrenex/core/tree/master/.github/workflows)，按本项目的单包结构、`main` 分支和 Bun 测试调整。

## CI

推送任意分支或创建 PR 时运行 `.github/workflows/ci.yml`。使用 Node.js 24、Bun 1.4.4 和项目锁定的 Vite+，通过冻结的 `bun.lock` 安装依赖，依次执行：

```sh
vp check
vp run typecheck
vp run test:unit
vp run test:live
vp run build
```

`test:unit` 执行常规单元与本地集成测试，排除真实 raw 回归文件；`test:live` 单独执行真实 raw 快照回放。两组都必须通过，CI 和 Release 使用相同检查。`bun test` 仍可一次运行全部测试。

快照测试校验 raw 哈希、解析结果、输入不变性和 manifest 文件对应关系，不会更新快照，不会连接 B 站，也不需要 `BILI_COKKIES`。采集任务不属于 CI。

## 版本与发布

使用 Changesets 3 和 `changesets/action@v2`。包有需要发布的改动时，在本地运行：

```sh
vp run changeset
```

选择包 `@elysionjs/blive-ws` 的版本级别并填写变更说明，将 `.changeset/*.md` 与代码一同提交。初始 changeset 将当前的 `0.0.0` 提升为 `0.1.0`，不会在配置 CI 时直接修改版本或发布。

合并到 `main` 后，`.github/workflows/release.yml` 先执行完整检查，再创建或更新版本 PR。版本 PR 更新包版本、CHANGELOG 和锁文件，标题含包名及版本。合并版本 PR 后，工作流再次通过两组测试和构建，才调用 `changeset publish`，然后创建标签和 GitHub Release。

发布流程通过并发组串行执行，不中断已经进行的发布。npm 发布使用 Node.js 下的 npm 11，依赖安装和测试继续使用 Bun。`packageManager: "bun@1.4.4"` 保留项目工具版本锁定，同时允许 npm 执行打包与发布。`publishConfig` 声明公开发布和 provenance，包元信息中的仓库为 `elysion-labs/blive-ws`。

## 仓库与 npm 设置

GitHub 仓库的 Settings → Actions → General 中需要启用允许 GitHub Actions 创建 PR 的选项。工作流使用内置 `GITHUB_TOKEN`，不需要额外 GitHub token。

在 npm 的 `@elysionjs/blive-ws` 包设置中添加 GitHub Actions Trusted Publisher：

| 设置                 | 值                               |
| -------------------- | -------------------------------- |
| Organization or user | `elysion-labs`                   |
| Repository           | `blive-ws`                       |
| Workflow filename    | `release.yml`                    |
| Environment name     | 留空，本工作流未配置 environment |
| Allowed actions      | 允许直接 `npm publish`           |

发布使用 OIDC 和 `id-token: write`，工作流不存放 `NPM_TOKEN`。npm 侧配置的 workflow 文件名必须精确匹配。配置方法见 [npm 官方文档](https://docs.npmjs.com/trusted-publishers/)。

如果包尚未存在、npm 页面无法配置 Trusted Publisher，需要先由有发布权限的账号完成首次发布，再配置上述信任关系；首次发布的版本同样应先通过两组测试和构建。本地发布没有 GitHub provenance 环境时需显式关闭本次 provenance，后续 CI 发布保留 provenance。不要将 npm 凭据写入仓库或采集日志。

## 许可证

项目使用 [MIT 许可证](../LICENSE)，`package.json` 中的 `license` 与许可证文件一致。npm 打包包含构建产物、README、包元信息和许可证，不包含采集日志、测试 raw、`.env` 或源码目录。
