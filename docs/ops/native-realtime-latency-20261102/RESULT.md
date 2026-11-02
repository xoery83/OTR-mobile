# Hosted Version Read：定位与首个修复

本轮完成同请求分段定位和首个小修复的真实 Hosted 前后验证；整体低延迟目标仍未完成。

| 项目 | 修复前 | 修复后 |
| -- | -- | -- |
| 无排队 Reader 热读 | 中位数 4365ms（3次） | 4092ms（2次）；减少273ms／6.25% |
| 三次客户端总耗时 | 6219／8324／6818ms | 9171／5968／6409ms |
| 修复后首个慢请求 | — | 含3542ms共享Core排队；已保留原样本 |
| SQL读取方式 | state与已授权bindings分开 | 同一事务内参数化共读；减少一次往返 |

同一服务器 Request ID 关联 Client → App → HTTP → Reader。修复前稳定 Reader 为4.36秒，Auth为353–1018ms，Trip可见性查询为432–1808ms；客户端收到响应头后仅0.38–2.46ms，序列化0–1ms。物理连接取得和排队在修复前样本均为0。不能把SQL等待全部说成CPU或纯网络，也不能把约1秒的客户端减Handler差值进一步猜成DNS/TLS。

只修改已 Review 的 Reader（a205b904）：原Scope、Actor、Gate先行；state无行不调用绑定函数；严格验证、空数组及Full fallback、普通Collection保留。DEV两个VOLATILE／SECURITY DEFINER函数与隔离PG定义逐字匹配，同事务锁语义保留。37项定向回归、2项真实隔离PG及独立Review通过。

复用Root既有软件流水并获临时唯一Writer交接，原位部署后已归还Host职责。实际软件基线：dc58a1f2／镜像0ffd444c／Capture fa90e747；旧aaf656容器保留回滚。四Bundle、23文件、Env、Host、Mounts、健康200／保护401及锁释放均核验。仅一个生产文件改变，其余351个一致。

两次采样均正常Login并只读同一Synthetic Trip，各3GET，独立Session正常撤销。无Trip业务写入、Provider、设备、SQL／RLS／GRANT或业务Authority变化。main未改；Native工具57332c55，Backend修复a205b904。

完整请求UUID、分段核算及原始安全投影在DIAGNOSIS.json、HOSTED_AFTER_AND_COMPARISON.json和两份CORRELATED_SERVER_LOGS中。

未强制取得Hosted冷PG样本；本次First／Repeat不能充当冷数据库证明。既有隔离PG冷33.37ms／热5.72–11.09ms仅作局部参考。Private订阅仍关闭，未宣称多人Realtime或整体性能PASS。
