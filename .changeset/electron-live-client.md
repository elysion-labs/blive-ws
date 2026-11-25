---
'@elysionjs/blive-ws': minor
---

commit: 80ac591af4bd7a7910d17c50ee7194589dcfab5f

新增 `@elysionjs/blive-ws/electron`，可在 Electron 主进程通过 `createElectronClient()` 只读监听直播页面收到的 WebSocket 消息，复用 `LiveClient` 的事件订阅、人气更新和协议诊断。认证、心跳和重连由页面负责。`electron` 是可选 peer dependency。
