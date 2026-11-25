---
'@elysionjs/blive-ws': minor
---

commit: 7eb62b1ccdca0b836e5b3e124280532f5b07dd3c

直播客户端支持 Node.js 24+，自动加载可选依赖 `ws` 和 `cookie`。Bun 1.4.4+ 使用原生 WebSocket 和 `Bun.CookieMap`。B 站 API 请求失败时，错误信息会指出失败端点和阶段，并省略凭据。
