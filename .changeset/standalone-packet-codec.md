---
'@elysionjs/blive-ws': minor
---

commit: b23c094bdf4d51ec5b2d9f64b02873a0a826d78c

新增 `@elysionjs/blive-ws/protocol`，导出 `encodePacket()` 和 `decodePackets()`，支持 B 站 WebSocket 数据包的编码、拆包以及 zlib 和 Brotli 解压。已有 WebSocket 数据的调用方可以单独解包，再交给 `/parser` 解析事件。
