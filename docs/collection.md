# JSONL 采集

采集使用正式客户端，将每条 WS 广播直接追加到本地 JSONL，作为后续 agent 评估快照的候选池。已知、未知和格式不匹配的广播都记录，不按事件 key 去重，也不限制每种命令的数量。HTTP 响应、Cookie、认证包和心跳包不写入广播日志。

```sh
vp run capture
# 明确省略 Cookie，即使 .env 存在 BILI_COKKIES。
vp run capture:anonymous
```

这两个 Vite Task 已显式关闭缓存，也可从 `vp run` 的任务列表中选择。任务仍直接执行同一个 TS 入口，房间和采集参数继续读取 `.env`。

配置示例：

```dotenv
BILI_COKKIES=你的完整Cookie
BILI_ROOM_IDS=21756924,732
# 0 表示持续运行；正数限制本次监控秒数，包含连接、重连等待。
BILI_CAPTURE_SECONDS=0
BILI_CAPTURE_OUTPUT=.captures/21756924-732
BILI_CAPTURE_MAX_BYTES=67108864
```

未配置 `BILI_ROOM_IDS` 时自动发现房间；短号由客户端解析为真实房间号。默认启用客户端的重连和心跳机制，重连只恢复后续推送，不补拉断线期间消息。Ctrl+C 或 SIGTERM 停止监控。

## 直接运行 TS

在项目根目录执行以下命令。Bun 读取已有 `.env`，按其中的 `BILI_ROOM_IDS` 监听，无需在命令中传房间号，也不会覆盖配置。

```sh
# 使用 .env 中的房间、Cookie、持续时间和输出目录。
bun scripts/capture.ts

# 匿名模式：不读取或传入 Cookie。
bun scripts/capture.ts --anonymous
```

`BILI_CAPTURE_SECONDS=0` 表示持续监控；`BILI_CAPTURE_MAX_BYTES=67108864` 表示按 64 MiB 分段。Ctrl+C 停止后，采集器同步并关闭当前分段。

## 每行格式

```json
{
  "version": 1,
  "receivedAt": "2026-11-15T00:00:00.000Z",
  "roomId": 7734200,
  "authentication": "anonymous",
  "raw": { "cmd": "LIKE_INFO_V3_UPDATE", "data": { "click_count": 123 } }
}
```

- `version` 为记录格式版本，目前为 1。
- `receivedAt` 为本机收到广播时的 UTC ISO 时间，不参与事件 key。
- `roomId` 为解析后的真实房间号。
- `authentication` 为采集实例的登录模式。
- `raw` 为完整广播 JSON，包括 protobuf 字符串和未识别字段，不包含预先生成的预期解析结果。

广播中的换行和引号会正常转义，一条广播始终占一行。`SEND_GIFT_V2` 即使包含多个礼物条目，也仅保存一条原始广播。

## 写入与分段

每次回调只序列化并同步写入当前这一条记录，写完才返回，没有随着时间增长的消息队列或去重集合。内存中仅保留当前记录、客户端状态和固定数量的计数器。同步文件写入会占用事件循环，因此应使用能跟上采集速度的本地磁盘。

默认写入 `.captures/<启动时间>/events-000001.jsonl`；达到 64 MiB 阈值后切换到下一个文件，不在记录中间切分。单条消息超过阈值时保留完整消息，该分段可超过阈值。再次使用同一目录或多个实例使用同一目录时，各自创建新的文件，不覆盖既有分段，也不拼接可能残缺的旧尾行。

写入错误会传回采集任务，停止本次所有房间的采集并以非零状态退出，不会被客户端的订阅异常隔离机制静默吞掉。切换分段和正常退出时执行文件同步并关闭描述符。逐条写入不等于逐条 `fsync`；强制终止或断电时，最后一行仍可能不完整，后续读取应将残缺尾行单独报告，不作为快照候选。

## 评估并加入快照

采集阶段不生成 manifest、独立 raw 文件或预期快照。后续 agent 应逐行读取 JSONL，与已收录语料和当前解析器比较，只推荐能补足分支、协议变化或实际缺陷的记录，并说明保留理由。JSONL 不自动进入回归测试。

读取时使用 `parseRawJson(line)`，导出选定 raw 时使用 `stringifyRawJson(record.raw)`，然后计算导出文件的 SHA-256。不要先用普通 `JSON.parse` 读取，否则超大纳秒整数会丢失精度。旧版候选目录中的独立 JSON 和 manifest 仍可读取，无需转换已收录语料。

选定后继续沿用现有结构：每条 raw 和预期结果各自保存为独立 JSON，在 `src/testing/live/manifest.json` 登记真实房间、采集时间、模式、哈希和 `purpose`。再运行：

`purpose` 必须说明样本增加的独立覆盖。JSONL 导入还应记录 `source: { file: "events-000001.jsonl", line: 123 }`，其中行号从 1 开始，便于回到本地日志核验。已经由现有样本覆盖的消息不新增；替换样本时同步移除旧 raw、expected 和 manifest 项，回放测试会检查三者一一对应。原始采集日志继续保留在本地。

```sh
bun run snapshots:update
bun test
```

详见 [实录筛选记录](./capture-review.md)。采集原始日志与已审阅的回归语料保持分开。
