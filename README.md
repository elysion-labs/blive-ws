<h1 align="center">blive-ws</h1>

<p align="center">把直播间里的弹幕、礼物和互动，变成可以理解、监听与回放的事件。</p>

<p align="center">
  <a href="#quick-start">快速开始</a> ·
  <a href="#events">支持事件</a> ·
  <a href="#diagnostics">发现协议变化</a> ·
  <a href="#snapshots">真实数据回归</a> ·
  <a href="./docs/api.md">API 文档</a>
</p>

直播事件不总是按预期到来：同一个命令可能出现新字段，熟悉的消息可能换了格式，也可能遇到还没有见过的事件。`@elysionjs/blive-ws` 保留收到的原始数据，把能理解的部分转成类型化事件，把需要关注的变化交给你的程序。

> [!NOTE]
> 公开 API 包含直播客户端和独立解析器。采集脚本复用同一个客户端。

## 现在可以做什么？

- 💬 **解析直播消息** — 覆盖弹幕、礼物、大航海、SC、点赞、入场和直播状态，共 12 类事件。
- 🔌 **直接连接直播间** — WebSocket、认证、心跳、压缩解包和断线重连。
- 🍪 **接入 Cookie 服务** — 每次连接与重连重新执行同步或异步回调。
- 🎁 **解析 protobuf 礼物** — 支持 `SEND_GIFT_V2`，一条广播中的全部礼物逐件通知。
- 🧩 **用类型消费事件** — 根据 `event.type` 收窄字段，保留平台时间和原始 ID。
- 🔎 **发现未知命令** — 通过返回值或订阅取得完整原始消息。
- 🛠️ **定位格式异常** — 报告字段路径、预期类型和实际类型。
- 📡 **观察结构变化** — 有界记录字段与类型，提供实例统计快照。
- 📼 **回放真实数据** — 每条 raw 消息和预期解析结果分别保存在独立 JSON 文件中。

<a id="quick-start"></a>

## 快速开始

从源码安装依赖并构建：

```sh
vp install
vp run build
bun examples/parse.ts
```

配置 `.env` 中的 `BILI_COKKIES` 后，运行真实监听示例：

```sh
bun run example:live
# 指定直播间：
bun examples/live.ts 25034104
```

没有指定房间时会选择一个在播房间。按 Ctrl+C 停止；设置 `BILI_EXAMPLE_SECONDS=30` 可在认证成功后监听 30 秒并自动退出。

```ts
import { createClient } from '@elysionjs/blive-ws';

await using client = createClient({
  roomId: 25034104,
  cookie: async () => cookieService.getCookie(),
});

client.on('event', event => console.log(event));
client.on('statusChange', state => console.log(state.status));
client.on('error', error => console.error(error.message));
await client.start();
console.log(client.getStatus());
// 在宿主服务中保持运行，关闭时 await client.stop()。
```

完整生命周期和配置见 [客户端文档](./docs/client.md)。

包名为 `@elysionjs/blive-ws`，提供无状态解析和带订阅的解析器：

```ts
import { createParser } from '@elysionjs/blive-ws/parser';

const parser = createParser({
  roomId: 21452505,
  observeShapes: true,
});

parser.on('event', event => {
  if (event.type === 'message') {
    console.log(event.user.name, event.content);
  }
});

parser.parse({
  cmd: 'LIKE_INFO_V3_UPDATE',
  data: { click_count: 123 },
});

console.log(parser.getStatus());
```

只需要转换一条消息时，调用 `parseEvent(raw, { roomId })`。返回值以 `status` 区分 `parsed`、`unknown` 和 `mismatch`，始终保留 `raw`。

`result.events` 包含全部事件，`result.event` 保留首个事件的便捷访问。`SEND_GIFT_V2` 可能一次产生多个 `gift`，客户端和解析器订阅会逐件通知。`/parser` 入口不加载 Bun 网络客户端。

<a id="events"></a>

## 支持的事件

| 命令                        | 事件类型                     | 内容                           |
| --------------------------- | ---------------------------- | ------------------------------ |
| `DANMU_MSG`                 | `message`                    | 用户、弹幕、粉丝牌、表情与回复 |
| `SEND_GIFT`                 | `gift`                       | 礼物、数量、金币或银币与总金额 |
| `USER_TOAST_MSG_V2`         | `guard`                      | 大航海类型、支付流水与起止时间 |
| `SUPER_CHAT_MESSAGE`        | `superChat`                  | 醒目留言、翻译、价格与展示时长 |
| `SUPER_CHAT_MESSAGE_DELETE` | `superChatDelete`            | 删除的醒目留言 ID              |
| `LIVE` / `PREPARING`        | `liveStart` / `liveEnd`      | 开播与下播                     |
| `CUT_OFF` / `WARNING`       | `liveCutoff` / `liveWarning` | 切断原因与警告                 |
| `LIKE_INFO_V3_CLICK`        | `like`                       | 点赞用户、文案与粉丝牌         |
| `LIKE_INFO_V3_UPDATE`       | `likesUpdate`                | 点赞总数                       |
| `ENTRY_EFFECT`              | `entry`                      | 入场用户、文案与效果           |

没有上游时间或 ID 时，对应字段为 `null`，不会用本机时间或随机 ID 填补。金额统一说明币种和单位，具体约定见 [API 文档](./docs/api.md#数据约定)。

<a id="diagnostics"></a>

## 让变化可以被程序发现

```ts
parser.on('raw', raw => archiveRaw(raw));
parser.on('unknownCommand', result => reportUnknown(result.command, result.raw));
parser.on('schemaMismatch', result => reportInvalid(result.issues, result.raw));
parser.on('schemaChange', diagnostic => reportChanges(diagnostic.changes));
```

未知命令、无法解析的字段和首次观察到的结构变化分别通知。可选字段缺失、`null` 值和普通列表长度变化不会被直接当成协议破坏。

结构观察默认关闭，开启后只保存有上限的路径和类型摘要。它能提示本实例首次看到的变化；字段含义改变或条件分支的差异仍需人工判断。订阅为同步调用，`.on()` 返回取消订阅函数。

<a id="snapshots"></a>

## 留下原始消息，方便下一次回归

真实语料按解析分支筛选，保留 **24 条原始消息、11 种命令**，来自 7 个直播间。覆盖弹幕与表情、protobuf 金币和银币礼物、入场、点赞、SC、大航海及开关播；未知命令只留 2 条代表。每条样本的保留理由记录在 manifest 的 `purpose` 中，详见 [筛选记录](./docs/capture-review.md)。

```text
src/testing/
  synthetic/<COMMAND>.json                 # 独立合成用例
  live/<COMMAND>/<room>-<hash>.json         # 一条真实 raw 消息
  live/manifest.json                       # 来源、房间、采集时间和 SHA-256
  expected/<COMMAND>/<room>-<hash>.json     # 对应的解析结果快照
```

### 离线运行

```sh
bun test
bun run test:live
```

测试只读取仓库中的 JSON，校验 raw 哈希、输入不变性、命令识别和预期解析结果，不发起网络请求，也不需要 Cookie。

### 采集更多真实消息

在本地 `.env` 填写：

```dotenv
BILI_COKKIES=你的完整Cookie
# 可选；未配置时自动选择 3 个正在直播的虚拟主播房间。
BILI_ROOM_IDS=
# 0 持续监控，Ctrl+C 停止；正数限制本次采集秒数，包含重连等待。
BILI_CAPTURE_SECONDS=0
# 单个 JSONL 文件的分段阈值，默认 64 MiB。
BILI_CAPTURE_MAX_BYTES=67108864
```

```sh
vp run capture
```

房间和采集配置从项目根目录的 `.env` 读取，直接执行 `bun scripts/capture.ts`，无需传房间参数；匿名模式追加 `--anonymous`。基础配置见 [.env.example](./.env.example)。

采集器复用正式客户端并启用自动重连，只接收广播消息，不发送弹幕或礼物。默认持续监控，将每条 raw 广播同步追加到已忽略的 `.captures/<采集时间>/events-000001.jsonl`。每行独立记录真实房间号、登录模式、接收时间和完整 raw，保留大整数精度；不按命令限量，不去重，也不积累消息或哈希集合。可通过 `BILI_CAPTURE_OUTPUT` 指定目录。

达到默认 64 MiB 阈值后新建分段，消息不会跨文件拆行；单条超限消息完整保存在独立分段。同一目录再次启动会创建新的分段，不覆盖或接写旧文件尾部。Ctrl+C / SIGTERM 正常停止连接并同步、关闭文件；写入错误会停止本次采集并以非零状态退出。详见 [JSONL 采集](./docs/collection.md)。

```sh
# 即使 .env 有 Cookie，也明确不传入 Cookie。
vp run capture:anonymous
```

JSONL 作为待评估的候选池，不自动生成或更新快照。后续 agent 按是否补足解析分支、结构差异或实际缺陷筛选记录；仅用户、正文、时间或计数不同的同类消息不需要新增快照，未知命令也不必逐个入库。选定后，用 `parseRawJson()` 读取记录、`stringifyRawJson(record.raw)` 导出独立 raw JSON，再在 manifest 登记来源、理由和导出文件的 SHA-256，最后更新预期。见 [热门房间筛选记录](./docs/capture-review.md)。`.env` 和候选目录已忽略，Cookie、登录资料和 WebSocket 认证包不会进入记录。

### 更新预期结果

确认新增消息或解析变化后，显式生成各用例的预期 JSON，再运行测试：

```sh
bun run snapshots:update
bun test
```

更新命令不修改 raw；已知命令解析失败或 raw 哈希发生变化时，会拒绝更新。原始语料及预期 JSON 均从自动格式化中排除。

> [!TIP]
> 真实语料不追求消息数量或所有命令穷举。删除 SC、旧版 JSON 礼物、警告及切断目前仍由合成用例覆盖，真实覆盖范围见 [语料说明](./src/testing/README.md)。

## 开发

```text
src/
  parser/       # 类型、分派、事件处理、protobuf 与结构观察
  client/       # Bun WebSocket、API、认证、心跳、重连与状态
  testing/      # 独立 raw JSON、合成用例与预期 JSON
  index.ts      # 公共导出
scripts/        # 复用正式客户端的采集脚本、离线快照更新
examples/       # 实时监听与纯解析示例
```

`parser/handlers/` 按协议命令分成独立目录，例如 `danmu-msg/`、`send-gift/`、`send-gift-v2/`、`user-toast-msg-v2/`。每个目录的 `index.ts` 负责该事件解析，专用 key 和测试就近放置；跨事件复用的字段转换和 key 工具放在 `parser/shared/`。

所有规范事件都提供 `key: string | null`，非空 key 包含解析后的真实房间号。每种事件的组成字段、相等含义和缺字段处理统一列在 [key 规则](./docs/event-identity.md) 中。必要身份不足时为 `null`，上游 `sourceId` 单独保留。库不自动过滤重复事件，使用方按业务决定去重和更新方式。

```sh
vp check
bun test
vp run typecheck
vp run build
```

CI 将常规测试与真实 raw 快照回归分开执行，两组都必须通过。发布使用 Changesets 生成版本 PR，并在合并后通过 npm OIDC 发布，配置见 [CI 与发布](./docs/releasing.md)。

项目使用 [MIT 许可证](./LICENSE)。

`vp run ready` 执行完整验证。Bun 负责运行、包管理和测试；Vite+ 负责检查与 `vp pack` 构建，输出 ESM、声明文件和 source map。
