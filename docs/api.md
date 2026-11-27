# @elysionjs/blive-ws

这里说明二进制协议入口与独立 JSON 解析器。连接、认证、心跳和重连见 [客户端文档](./client.md)。

<a id="binary-protocol"></a>

## 二进制协议

`@elysionjs/blive-ws/protocol` 适用于 Node.js、Bun 和 Electron 主进程。`decodePackets(buffer)` 接收一条完整的 WebSocket 二进制消息，按顺序返回解包后的 `Packet[]`，并处理 zlib 和 Brotli 压缩批次。无效包或超出解压限制时会抛出错误。`encodePacket(operation, body?)` 将操作码和可选的 UTF-8 字符串编码为一个包。

下面的函数接收来自已筛选的 B 站弹幕连接的 CDP 二进制消息，即 `Network.webSocketFrameReceived` 中 `response.opcode === 2` 时的 `response.payloadData`。房间 ID 由调用方提供。

```ts
import { createParser, parseRawJson } from '@elysionjs/blive-ws/parser';
import { decodePackets } from '@elysionjs/blive-ws/protocol';

const parser = createParser({ roomId: 21452505 });

parser.on('event', event => {
  if (event.type === 'message') {
    console.log(event.user.name, event.content);
  }
});

function handlePayload(payloadData: string) {
  const packets = decodePackets(Buffer.from(payloadData, 'base64'));

  for (const { operation, body } of packets) {
    if (operation === 5) {
      parser.parse(parseRawJson(body.toString('utf8')));
    }
  }
}
```

## 无状态解析

```ts
import { parseEvent } from '@elysionjs/blive-ws/parser';

const result = parseEvent(
  {
    cmd: 'LIKE_INFO_V3_UPDATE',
    data: { click_count: 123 },
  },
  { roomId: 21452505 },
);

switch (result.status) {
  case 'parsed':
    console.log(result.event);
    console.log(result.events); // 全部事件；protobuf 礼物可能有多条。
    break;
  case 'unknown':
    console.log('未知命令', result.command, result.raw);
    break;
  case 'mismatch':
    console.log('格式异常', result.command, result.issues, result.raw);
    break;
}
```

`parseEvent()` 接受已经解码的对象，不处理 JSON 字符串或 WebSocket 二进制数据。已知命令的字段校验失败会返回第一个问题的 JSON pointer 路径、预期类型与实际类型；不会用默认的 `0` 或空字符串掩盖必需字段缺失。

原始数据通过 `result.raw` 原样引用，不会被解析器修改，也不会进行深拷贝。调用方应将原始数据与事件负载视为只读。未知命令和异常消息也会保留。

`cmd` 保留完整原始值，`command` 用于命令分派。例如 `DANMU_MSG:4:0:2:2:2:0` 按 `DANMU_MSG` 解析。

## 编程监听

```ts
import { createParser } from '@elysionjs/blive-ws/parser';

const parser = createParser({ roomId: 21452505, observeShapes: true });

const unsubscribe = parser.on('event', event => {
  if (event.type === 'message') {
    console.log(event.user.name, event.content);
  }
});

parser.on('raw', raw => console.log('原始输入', raw));
parser.on('unknownCommand', result => console.log('未知命令', result.command, result.raw));
parser.on('schemaMismatch', result => console.log('字段异常', result.issues, result.raw));
parser.on('schemaChange', diagnostic => console.log('结构变化', diagnostic.changes));

parser.parse({ cmd: 'LIKE_INFO_V3_UPDATE', data: { click_count: 123 } });
console.log(parser.getStatus());
unsubscribe();
```

`.parse()` 返回与 `parseEvent()` 相同的结果，同时更新统计并发出通知。单次调用的通知顺序为 `raw` → 结果对应的 `event` / `unknownCommand` / `schemaMismatch` → 可选的 `schemaChange`。统计与结构分析在通知前完成。

订阅是同步的，不等待异步回调。回调抛错会向 `.parse()` 的调用方传播，并中断该次剩余通知；不会被误报成格式异常。注册同一个回调多次时，每次返回的取消函数只移除本次订阅。支持 `.parse(input, { roomId })` 临时覆盖房间上下文。

## 结构变化观察

`observeShapes` 默认关闭，开启后：

- 每个规范化命令的首次有效消息建立当前实例的结构基线。
- 首次观察到新增字段或新的非空类型时，发送 `schemaChange`；同一字段的同一类型不会反复通知。
- 新对象只报告它的入口字段，避免为所有子字段重复报警。
- 字段暂时缺失、值变为 `null`、普通数组长度或元素顺序变化不会触发结构变化通知。
- 空数组的首个元素结构、仅为 `null` 的字段首次出现具体值，用于补全基线。
- 普通列表使用 `/*` 汇总元素类型，弹幕的定位数组保留具体索引。
- 已知事件校验失败时发出 `schemaMismatch`，不会将失败样本写入结构基线。

例如 `/data/count` 从数字变为字符串：

```ts
{
  kind: 'typeChanged',
  path: '/data/count',
  previousTypes: ['number'],
  observedType: 'string',
}
```

对于已知事件，如果该变化违反解析规则，将通过 `schemaMismatch` 报告。`schemaChange` 关注仍可解析的消息和未知命令的额外结构变化。

```ts
const parser = createParser({
  observeShapes: {
    maxCommands: 128,
    maxPaths: 512,
    maxDepth: 12,
    maxArrayItems: 16,
  },
});
```

以上为默认上限。命令基线按 LRU 淘汰；每个命令限制记忆的路径数，每次采样还有遍历预算。深度最多配置为 64。截断样本计入 `truncatedShapes`；有变化的诊断也携带 `truncated`。超限区域不保证检测完整。

基线只存字段路径和类型，不保留历史原始消息。调用 `resetShapes()` 清除基线；累计统计和订阅继续保留。重启实例后重新学习，当前不持久化基线。

观察结果表示“本实例首次见到”，不证明 B 站修改了协议。可选字段、条件分支和灰度推送也可能产生新增字段通知。字段语义变化、从第一条消息就存在的未知类型、未采样的数据，以及未使用字段的删除，不能仅靠结构观察自动确认。

## 支持的事件

除下表外，`SEND_GIFT_V2` 解码 `data.pb` 中的 protobuf，输出同样的 `gift` 类型。一条广播的所有礼物分别进入 `result.events`，订阅也逐件通知；`result.event` 仅为第一条的兼容访问。

| 命令                                   | `event.type`      | 主要内容                                        |
| -------------------------------------- | ----------------- | ----------------------------------------------- |
| `DANMU_MSG`                            | `message`         | 用户、正文、样式、粉丝牌、表情、回复            |
| `SEND_GIFT`                            | `gift`            | 用户、礼物、数量、金币或银币、总金额            |
| `USER_TOAST_MSG` / `USER_TOAST_MSG_V2` | `guard`           | 大航海类型、支付流水、数量、单位、起止时间      |
| `SUPER_CHAT_MESSAGE`                   | `superChat`       | 醒目留言 ID、正文、翻译、价格、展示时长         |
| `SUPER_CHAT_MESSAGE_DELETE`            | `superChatDelete` | 被删除的醒目留言 ID 列表                        |
| `LIVE`                                 | `liveStart`       | 开播时间、特殊类型                              |
| `PREPARING`                            | `liveEnd`         | 下播                                            |
| `CUT_OFF`                              | `liveCutoff`      | 切断原因                                        |
| `WARNING`                              | `liveWarning`     | 警告内容                                        |
| `LIKE_INFO_V3_CLICK`                   | `like`            | 点赞用户、提示文字、粉丝牌                      |
| `LIKE_INFO_V3_UPDATE`                  | `likesUpdate`     | 点赞总数                                        |
| `ENTRY_EFFECT`                         | `entry`           | 入场用户、文案、展示时长、权限类型              |
| `INTERACT_WORD` / `INTERACT_WORD_V2`   | `interaction`     | 观众交互，`interactionType` 保留原始 `msg_type` |

此列表不是 B 站全部命令。包括 `GUARD_BUY` 在内的其余命令当前通过 `unknownCommand` 暴露。

### 数据约定

- `user.wealthLevel` 为正整数荣耀等级，缺失、为零或无效时为 `null`。
- `interactionType` 的 1、2、3 分别表示进场、关注和分享。`INTERACT_WORD_V2` 优先读取 `data.pb`。房间号可回退到交互消息内的房间字段。
- 礼物 V1 / V2 的 key 使用 `上游秒时间:真实房间号:combo尾段:giftId:累计原始金额`。累计金额缺失时取 total_coin；缺少时间或 combo 身份时不生成 key。
- protobuf 读取器校验字段类型、长度、UTF-8 和整数精度，限制输入大小。未使用的 protobuf 字段按协议跳过；外层结构观察不会把 pb 字符串自动展开成内部字段基线。

- 所有规范事件都包含 `key: string | null`，与 `sourceId` 分开，非空 key 均包含真实房间号。缺少必要身份时为 `null`。客户端自动解析短号；独立调用时，`roomId` 必须为真实房间号。大航海使用 `开始时间:真实房间号:用户名:原始金额`，详见 [ID 规则](./event-identity.md)。
- SC 删除 key 由房间和排序去重后的目标 ID 集合构成，不加入时间；`ids` 仍保留原顺序和重复项。每种事件的 key 规则、相等含义和缺字段处理统一列在 [key 规则](./event-identity.md) 中。
- 点赞文案可能变化：不同文案生成不同 key，相同文案的多次点赞可能共用 key。库不丢弃重复回调，UI 自行管理有限的去重窗口。
- `SEND_GIFT_V2` 的 `sourceId` 取每个 protobuf 礼物条目的 tid，不把整个广播当成单件礼物。无有效条目或 protobuf 无法解码时报告 schemaMismatch，不合成 unknown gift。

- `timestamp` 为上游毫秒时间；礼物、SC、大航海的秒时间和入场的纳秒时间按对应协议转换。没有上游时间时为 `null`，不会使用本机收到时间补齐。
- `sourceId` 为字符串形式的上游 ID，缺失为 `null`。弹幕取 `extra.id_str`，礼物取 `tid`，大航海取 `payflow_id`，SC 取 `data.id`；可用时以顶层 `msg_id` 作为其他消息的标识。它不是跨命令、跨房间的全局 ID，也不保证同一 ID 的多次推送负载一致。
- 字符串 ID 保留原值；不安全的数值 ID 拒绝解析，避免为已丢失精度的 ID 生成错误标识。
- `roomId` 优先使用调用上下文，否则读取顶层房间 ID；支持数字和十进制字符串，缺失为 `null`。短房间号由客户端解析为真实房间号；直接调用解析器时由调用方提供。
- 金币礼物及大航海金额除以 1000 转为元；SC 已以元计价。银币礼物的人民币 `price` 为 `null`，保留 `totalCoin`。
- 不推算付费时长、积分或权益。大航海保留平台的 `quantity`、`unit` 和起止时间。
- `getStatus()` 返回独立快照，仅包含计数、当前基线数量、截断次数与最近诊断的类型和命令，不包含原始消息。`schemaChanges` 统计通知次数，不是变化字段数。

## 精确 JSON

客户端会保留纳秒整数原始 token。独立回放从 parseRawJson(text) 取得 raw，记录时使用 stringifyRawJson(raw)；普通 JSON.parse 已丢失的精度无法恢复。raw 的可见字段仍保持原始类型。

解析上下文仅包含真实房间号 `roomId`，不接收场次时间。独立调用可通过 `createParser({ roomId })` 或 `parseEvent(raw, { roomId })` 提供。所有 key 仅由本条消息和真实房间号生成，不使用 `room_init.live_time` 或历史 WS 消息；开播 key 可使用本条 `LIVE.live_time`，缺失时使用房间级 key。
