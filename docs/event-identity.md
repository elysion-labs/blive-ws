# 事件 key

所有规范事件都包含 `key: string | null`。key 的房间号采用事件解析上下文中的真实房间号；客户端先通过平台接口将短号解析为真实房间号，再解析消息。独立调用解析器不会联网转换短号，`roomId` 必须传真实房间号。消息自带的 `roomid` / `room_id` 仅在未提供上下文时作为房间号回退，调用方需要保证它是真实房间号。

必要身份字段不足时保留 `null`，不使用本机时间、随机值或 `undefined` 占位。`sourceId` 单独保留上游原生标识。未知命令仍通过诊断返回完整 raw，不合成规范事件。

R 表示真实房间号；U 表示 UID，UID 为 0 时使用用户名；T 表示消息的顶层 `send_time` 毫秒时间；H 表示完整小写 UTF-8 SHA-256，数组先按 JSON 编码。所有 key 仅依赖本条消息和真实房间号，不使用场次上下文。

## 生成规则

| 命令                                 | key 规则                                                        | 说明                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DANMU_MSG`                          | `上游毫秒时间:R:U:H(正文)`                                      | 同一用户同毫秒的不同正文分别记录；头像等资料不影响 key。                                                                                            |
| `SEND_GIFT`                          | `上游秒时间:R:combo尾段:giftId:累计原始金额`                    | 累计金额优先 `combo_total_coin`，缺失时取 `total_coin`；显式 0 不触发回退。combo 尾段取 `batch_combo_id` 最后一个冒号之后的原始字符串，包括小数点。 |
| `SEND_GIFT_V2`                       | 与 `SEND_GIFT` 相同                                             | 遍历全部礼物；protobuf 条目的 10、12、1、14（缺失时 7）号字段分别提供上述身份字段。                                                                 |
| `USER_TOAST_MSG_V2`                  | `guard_info.start_time:R:sender_uinfo.base.name:pay_info.price` | 使用原始秒时间和原始整数金额；不依赖 `send_time`，不用 `payflow_id` 替代。                                                                          |
| `USER_TOAST_MSG`                     | `data.start_time:R:用户名:data.price`                           | 旧版大航海字段，使用同样的原始秒时间和金额。                                                                                                        |
| `SUPER_CHAT_MESSAGE`                 | `上游秒时间:R:SC ID`                                            | 同一 SC 的审核、公开及翻译版本共用 key。                                                                                                            |
| `SUPER_CHAT_MESSAGE_DELETE`          | `R:superChatDelete:排序去重后以逗号拼接的SC ID`                 | 无需时间；ID 先统一为字符串，再按字典序排序；空列表或缺房间时为 `null`。                                                                            |
| `ENTRY_EFFECT`                       | `原始纳秒trigger_time:R:U:entryEffect`                          | `R:entryEffect:U:H([文案,特权类型])`；缺房间或用户身份时为 `null`。                                                                                 |
| `INTERACT_WORD` / `INTERACT_WORD_V2` | `null`                                                          | 暂无已确认的交互事件去重规则。                                                                                                                      |
| `LIKE_INFO_V3_CLICK`                 | `R:like:U:H(点赞文案)`                                          | 相同规则；缺文案按空字符串处理，缺房间或用户身份时为 `null`。                                                                                       |
| `LIKE_INFO_V3_UPDATE`                | `R:likesUpdate:计数`                                            | 相同房间和计数共用 key。                                                                                                                            |
| `LIVE`                               | `本条live_time秒时间:R:liveStart`                               | 本条消息没有有效开播时间时为 `R:liveStart`，不使用接口或历史消息补齐。                                                                              |
| `PREPARING`                          | `R:liveEnd`                                                     | 无需时间。                                                                                                                                          |
| `WARNING`                            | `T:R:liveWarning:H(原因)`                                       | `R:liveWarning:H(原因)`。                                                                                                                           |
| `CUT_OFF`                            | `T:R:liveCutoff:H(原因)`                                        | `R:liveCutoff:H(原因)`。                                                                                                                            |

所有事件都需要真实房间号才能生成 key。摘要不包含头像、粉丝牌等资料。入场回退仅使用 `copy_writing_v2` 和 `privilege_type`，缺字段按 `null` 编码。

弹幕缺少时间或用户身份、礼物缺少时间或 combo、SC 缺少时间时，key 为 `null`。大航海缺少必要身份时也为 `null`；规则采用用户确认的“同一直播间、同一时刻、名称唯一”假设，这不是平台官方唯一性保证。例如 `1794153767:32706521:船员:138000`，`payflow_id` 仍作为 `sourceId` 保存。

点赞文案不是固定常量；当前真实语料包含“为主播点赞了”，合成边界用例也覆盖“点赞了”。同一用户的文案变化会生成不同 key，相同文案的多次点赞会共用 key，不能用此 key 统计实际点赞次数。

真实配对样本还表明：部分房间会向匿名连接隐藏弹幕 UID 并遮蔽昵称，同一 `sourceId` 的登录和匿名投递因此可能生成不同 key。这是当前“UID 为 0 时用用户名”规则的限制，不能保证混用登录与匿名实例时仍能消除同一条弹幕。已有样本和具体对比见 [筛选记录](./capture-review.md)，此次采集未改变已确认的 key 规则。

key 的组成和相等含义按上表中的事件规则确定。相同 key 可能表示同一 SC 的更新、相同删除集合、相同点赞内容或相同房间状态，不统一承诺代表全局唯一的一次发生。使用方按业务管理去重窗口和状态更新，库只提供 key，不过滤事件；每条消息继续触发监听回调。

SC 删除保留 `ids` 原始顺序和重复项，key 只规范化删除集合。使用方仍按 `ids` 更新对应 SC；相同集合重发时 key 不变。

## 解析上下文

独立回放通过 `parseEvent(raw, { roomId })` 或 `createParser({ roomId })` 提供真实房间号。解析器不接收 `liveStartTime`；相同消息和真实房间号生成相同 key，不受开始监听时间、重连或历史上下播消息影响。

`getStatus().liveStartTime` 和历史语料 manifest 的 `liveStartTime` 仅作为平台时间元信息保留，不参与解析或 key 生成；它们不保证标识当前场次。开播 key 中的时间仅来自当前 `LIVE` 消息自身。

## 超大整数精度

客户端通过 `parseRawJson()` 保存数值 token 的原始十进制文本，用 WeakMap 关联到原始对象字段，不改变 raw 的可见字段类型。`stringifyRawJson()` 在记录语料时写回原始数值 token，避免 `JSON.stringify` 再次舍入。

入场 key 使用精确纳秒整数；转换成毫秒时先做精确整数除法，再转 number。独立解析可从原始 JSON 文本调用 `parseRawJson()`，也支持十进制字符串形式。普通 `JSON.parse` 已舍入的纳秒 number 无法恢复原数值，因此 key 使用内容回退；重新编码也无法恢复更早的精度。

## 存储约定

- 本机接收时间仅作为采集元信息，不参与事件身份。
- key 按事件类型解释；保存类型和真实房间上下文。
- 相同 key 可能携带更新后的头像、粉丝牌或审核状态等负载，使用方需要确定更新策略。
