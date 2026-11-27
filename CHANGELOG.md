# @elysionjs/blive-ws

## 0.2.0

### Minor Changes

- 事件的 `user` 新增 `wealthLevel`，提供 B 站直播荣耀等级。仅返回正整数，缺失或为零时返回 `null`。
- 新增 `INTERACT_WORD` 和 `INTERACT_WORD_V2` 的观众交互解析，以及旧版 `USER_TOAST_MSG` 的大航海解析。

## 0.1.0

### Minor Changes

- [`80ac591`](https://github.com/elysion-labs/blive-ws/commit/80ac591af4bd7a7910d17c50ee7194589dcfab5f) Thanks [@YanChenBai](https://github.com/YanChenBai)! - 新增 `@elysionjs/blive-ws/electron`，可在 Electron 主进程通过 `createElectronClient()` 只读监听直播页面收到的 WebSocket 消息，复用 `LiveClient` 的事件订阅、人气更新和协议诊断。认证、心跳和重连由页面负责。`electron` 是可选 peer dependency。

- [`04fa8c1`](https://github.com/elysion-labs/blive-ws/commit/04fa8c1c688c8000fa1d55cd637fac34207a507b) Thanks [@YanChenBai](https://github.com/YanChenBai)! - 提供直播间连接、心跳、自动重连和可刷新 Cookie 的客户端，支持类型化事件解析、事件 key 和协议变化诊断。

  提供持续写入 JSONL 的采集任务，以及经过筛选的独立真实 raw 回归用例。

- [`7eb62b1`](https://github.com/elysion-labs/blive-ws/commit/7eb62b1ccdca0b836e5b3e124280532f5b07dd3c) Thanks [@YanChenBai](https://github.com/YanChenBai)! - 直播客户端支持 Node.js 24+，自动加载可选依赖 `ws` 和 `cookie`。Bun 1.4.4+ 使用原生 WebSocket 和 `Bun.CookieMap`。B 站 API 请求失败时，错误信息会指出失败端点和阶段，并省略凭据。

- [`b23c094`](https://github.com/elysion-labs/blive-ws/commit/b23c094bdf4d51ec5b2d9f64b02873a0a826d78c) Thanks [@YanChenBai](https://github.com/YanChenBai)! - 新增 `@elysionjs/blive-ws/protocol`，导出 `encodePacket()` 和 `decodePackets()`，支持 B 站 WebSocket 数据包的编码、拆包以及 zlib 和 Brotli 解压。已有 WebSocket 数据的调用方可以单独解包，再交给 `/parser` 解析事件。
