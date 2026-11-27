# 事件回归语料

每条用例独立保存为 JSON。synthetic/ 是构造的边界用例；live/ 是实际收到的广播消息；expected/ 保存与每条真实消息对应的解析结果。

当前共有 24 条真实 raw，来自 7 个房间，覆盖 11 种命令；其中 23 条已解析，1 条保留为未知命令。

| 命令                  | 数量 | 当前状态 |
| --------------------- | ---: | -------- |
| `DANMU_MSG`           |    6 | 已解析   |
| `ENTRY_EFFECT`        |    2 | 已解析   |
| `INTERACT_WORD_V2`    |    1 | 已解析   |
| `LIKE_INFO_V3_CLICK`  |    2 | 已解析   |
| `LIKE_INFO_V3_UPDATE` |    1 | 已解析   |
| `LIVE`                |    2 | 已解析   |
| `LOG_IN_NOTICE`       |    1 | 未知命令 |
| `PREPARING`           |    1 | 已解析   |
| `SEND_GIFT_V2`        |    5 | 已解析   |
| `SUPER_CHAT_MESSAGE`  |    2 | 已解析   |
| `USER_TOAST_MSG_V2`   |    1 | 已解析   |

原始 JSON 保留完整字段和 protobuf 字符串，manifest.json 记录房间、采集时间、文件 SHA-256 及每条必填的 purpose 保留理由。由 JSONL 导入的样本另记 source.file 和一基行号 source.line。Cookie 与认证包不进入语料。真实覆盖以此表为准，不把合成用例当作实录证据。

语料按解析分支保留代表：用户名、正文、时间、金额或计数不同但解析路径相同的消息不重复收录；未知命令仅留 JSON 与 protobuf 代表，不逐个命令堆积快照。回放测试要求 raw、expected 文件与 manifest 一一对应，防止精简后留下孤立文件。筛选依据见 [实录筛选记录](../../docs/capture-review.md)。

## 回放与更新

```sh
bun test
bun run test:live
```

离线回放只读取本地文件，校验 raw 哈希、输入不变性、识别状态及每条独立预期 JSON，不发起网络请求。

```sh
# 先运行采集，再离线审阅 JSONL，将选定 raw 登记进 manifest。
vp run capture
bun run snapshots:update
bun test
```

采集命令复用正式客户端并自动重连，每条广播立即追加到已忽略的 .captures/ JSONL 分段，不累积消息；默认持续运行，BILI_CAPTURE_SECONDS=0 表示等待 Ctrl+C。--anonymous 明确省略 Cookie，不读取 BILI_COKKIES。候选需要按解析分支、结构差异或实际缺陷筛选，不能仅因用户、正文或数值不同就加入回归语料。已审阅样本可在 manifest 中通过 authentication 和 purpose 记录来源与保留理由。

用 parseRawJson() 逐行读取 JSONL，将选定记录的 raw 通过 stringifyRawJson() 导出到 live/，登记导出文件哈希和保留理由后，再更新预期。预期更新不修改 raw；raw 哈希变化或已知命令解析失败时，拒绝接受新的预期。见 [JSONL 采集](../../docs/collection.md) 和 [热门房间筛选记录](../../docs/capture-review.md)。
