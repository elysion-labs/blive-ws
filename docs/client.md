# 直播客户端

`@elysionjs/blive-ws` 使用 WebSocket、fetch 和内置 zlib/Brotli 解压，独立实现直播服务器发现、认证、协议数据包、心跳及重连。客户端运行于 Bun，不依赖 bilibili-live-ws、ws 或外部 protobuf 包。

```ts
import { createClient } from '@elysionjs/blive-ws';

await using client = createClient({
  roomId: 25034104,
  cookie: async signal => cookieService.getCookie({ signal }),
  observeShapes: true,
  reconnect: {
    maxRetries: Infinity,
    initialDelay: 1000,
    maxDelay: 30_000,
    healthyAfter: 60_000,
    jitter: 0.2,
  },
});

client.on('event', event => console.log(event));
client.on('raw', raw => archive(raw));
client.on('unknownCommand', result => console.warn(result.command));
client.on('schemaMismatch', result => console.warn(result.issues));
client.on('schemaChange', diagnostic => console.warn(diagnostic.changes));
client.on('statusChange', state => console.log(state.status));
client.on('heartbeat', heartbeat => console.log(heartbeat));
client.on('error', error => console.error(error.message));

await client.start();
console.log(client.getStatus());
// 宿主服务继续运行，关闭时调用 await client.stop()。
```

## 生命周期

| 方法                                | 行为                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `start()`                           | 等待平台认证成功；重复调用复用同一会话。初始失败且启用重连时继续等待，直到成功、重试耗尽或停止。 |
| `stop()`                            | 取消准备、连接、心跳与重连计时器并关闭 socket；以后可以再次 start。                              |
| `restart()`                         | stop 后重新 start，刷新 Cookie 与服务器信息。                                                    |
| `dispose()` / `Symbol.asyncDispose` | 永久停止并释放订阅，之后不能 start。                                                             |
| `getStatus()`                       | 独立快照：生命周期、房间、重试、心跳、解析统计及最近错误。                                       |

状态为 `idle / connecting / connected / reconnecting / stopped / failed / disposed`。WebSocket 打开后还要通过平台认证，才进入 connected。快照不包含 Cookie、认证 token 或原始数据；最近错误经过脱敏，原始 provider/fetch 错误不会透传。

## Cookie 与网络配置

`cookie` 接受字符串，或者同步/异步函数。可以忽略传入的 AbortSignal，继续使用 `() => cookie`。每次连接、重连和 restart 都重新执行回调，并重新获取服务器 token。

省略 Cookie 时尝试匿名连接，是否允许由平台决定；显式 Cookie 已失效则报告失败，并按配置重试。库不直接读取环境变量，example 和采集脚本才读取 `BILI_COKKIES`。

`connectTimeout` 默认 15 秒，限制连接准备与 socket 认证各阶段。Cookie provider 即使不响应取消，也不会让 stop 无限等待。短房间号会通过 API 解析为真实房间号，事件使用该真实号。

`fetch` 和 `createWebSocket` 可替换网络实现，适合自定义网络和本地集成测试；默认使用运行时内置实现。

## 心跳与重连

`heartbeatInterval` 默认 30 秒，`heartbeatTimeout` 默认 10 秒。等待的是 B 站协议心跳应答，与 WebSocket ping/pong 分开；有其他消息到达也不能代替心跳应答。

`reconnect: false` 禁止重试。默认无限重试，指数退避到 30 秒，随机向下抖动最多 20%；连续健康 60 秒后才重置失败计数，防止连接成功后立刻断开的重试风暴。每次重新获取 token，并轮换返回的 WSS 主机。

停止会取消等待中的重连，不会被旧会话的迟到回调重新启动。

## 事件 key

客户端先通过 `room_init` 将输入短号转换为真实房间号；所有事件的房间和 key 均使用真实房间号。key 只依赖本条消息和真实房间号，不引入场次上下文：点赞计数为 `房间号:likesUpdate:计数`，下播为 `房间号:liveEnd`，开播仅使用本条消息的 `live_time`，缺失时为 `房间号:liveStart`。

`getStatus().liveStartTime` 保留最近从平台接口或 `LIVE` 消息读到的开播秒时间，未知时为 `null`，仅供状态查询，不保证它标识当前场次，也不参与事件 key。

所有规范事件都有 `key: string | null`，按 [key 规则](./event-identity.md) 统一列出的各事件规则生成；必要身份不足时为 `null`，不用本机时间替代。库仍传递每条事件，使用方按 key 的具体含义决定去重和更新方式。SC 删除 key 规范化目标集合，使用方通过 `ids` 更新目标 SC。原始纳秒 token 在解包时保留精度，用于入场 key 和时间转换；采集脚本记录 raw 时复用这套逻辑。

## 事件订阅

客户端支持 [解析器](./api.md) 的 raw、event、unknownCommand、schemaMismatch 和 schemaChange，另有 statusChange、heartbeat 和 error。

一条 SEND_GIFT_V2 广播中的多个礼物逐件通知。原始广播只发出一次 raw。

客户端订阅允许同步或异步回调，不等待业务处理完成；失败会报告经过脱敏的 error，并继续通知其他订阅者。error 订阅者自己的异常被隔离，避免递归报错。需要可靠归档时，业务层仍需有界队列和写入失败处理，不能把回调成功当成持久化成功。

`.on()` 返回取消订阅函数。纯解析器的同步回调仍直接向 `.parse()` 调用方抛错，行为与异步网络客户端不同。

## 直接运行

```sh
vp run build
bun run example:live
bun examples/live.ts 25034104
bun examples/live.ts 732 --anonymous
```

默认使用本地 `.env` 的 `BILI_COKKIES`。`--anonymous` 明确不读取或传入 Cookie，即使 `.env` 中存在该变量。未指定房间时按 BILI_ROOM_IDS 的第一项，或自动发现一个在播房间。Ctrl+C 停止；可设置 BILI_EXAMPLE_SECONDS 在认证后自动结束。

采集任务 `vp run capture` 也使用 `createClient()` 并保留自动重连，不会维护第二套连接或解包实现；`vp run capture:anonymous` 创建不传 Cookie 的实例。两项任务均关闭缓存，配置继续读取 `.env`。采集默认持续运行，每条广播立即追加到 `.captures/` 中的 JSONL 分段，不把消息积累到内存。先由 agent 审阅候选，再选入独立 JSON 回归语料，详见 [JSONL 采集](./collection.md)。独立解析场景从 `@elysionjs/blive-ws/parser` 导入，避免加载网络客户端。
