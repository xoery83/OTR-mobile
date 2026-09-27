# OTR Mobile 2.0
## Expense Attachments & Receipt Scan 1.0 — Design Specification

**Status:** Design / Pre-implementation  
**Scope:** Expense attachments + New Expense receipt OCR  
**核心原则：** Offline-first、storage-aware、OCR-assisted but user-confirmed、长期成本可控。

---

# 1. 产品目标

本模块解决两个相关但相互独立的问题。

### Expense Attachments

用户可以给 Expense 保存收据、发票和付款凭证等附件。

附件属于 Expense evidence，但**不会参与 Expense 金额、FX、Settlement 等业务计算**。

### Receipt Scan

只在 **New Expense** 创建过程中提供。

当前入口保持现有设计：

> Amount → Currency → **Scan receipt**

Scan receipt 的作用是：

> **扫描收据 → OCR → 帮用户填写 Expense Draft**

而不是后台审核 Expense。

因此：

```text
Existing Expense
        │
        └── Add Attachment
                │
                └── No OCR

New Expense
        │
        └── Scan Receipt
                │
                ├── OCR
                ├── Parse
                ├── Prefill Draft
                └── Receipt becomes attachment
```

---

# 2. 明确不做的事情

1. 已创建 Expense 不执行 OCR。
2. OCR 不自动修改已经创建的账本。
3. OCR 不产生 Review Finding。
4. OCR 不参与 Settlement。
5. 第一版不做 line-item extraction。
6. 第一版不做税务/GST/VAT分析。
7. 第一版不做云端 AI OCR。
8. 第一版不做邮件收据导入。
9. 不把 OCR Result 建成长期 Ledger domain object。
10. 不长期保存手机拍摄的超大原始图片。

这几个边界应当成为 architecture guardrail。

---

# 3. 附件数量

第一版：

> **Maximum 3 attachments per Expense**

Scan Receipt 产生的图片也算一个 attachment。

例如：

```text
Expense
 ├── receipt.jpg        ← Scan receipt
 ├── card-payment.png
 └── invoice.pdf
```

达到 3 个后：

> Add attachment

变为不可用，并显示：

> Maximum 3 attachments per expense.

`3` 应作为 domain/config constant，而不是数据库 schema 本身无法突破的结构限制。

---

# 4. 文件类型

第一版正式支持：

| 类型 | 输入 | 云端 |
|---|---|---|
| JPEG | ✓ | JPEG |
| HEIC/HEIF | ✓ | 建议转 JPEG |
| PNG | ✓ | 建议归档 JPEG，特殊透明图片可保留 |
| PDF | ✓ | PDF |
| Camera | ✓ | JPEG archive |

暂不支持：

DOC/DOCX、XLS/XLSX、ZIP、视频、音频及任意 binary file。

---

# 5. 文件大小

图片和 PDF 采用不同规则。

### 图片

原始文件可以比较大，但在上传前处理。

目标：

```text
Original
3–8 MB
   ↓
resize
   ↓
long edge ≈ 2000–2400 px
   ↓
JPEG ≈ 80–85%
   ↓
Archived attachment
typically 300 KB – 1 MB
```

具体尺寸和 JPEG quality 在开发阶段通过真实 receipt 测试确定，不把当前建议值写死为产品契约。

### PDF

第一版不重新编码 PDF。

建议：

> **Maximum PDF size: 10 MB**

后续真实使用数据证明有必要再调整。

---

# 6. OCR 架构

第一版优先：

> **On-device OCR**

iOS：

**Apple Vision Framework**

未来 Android 可以对应：

**Google ML Kit / equivalent local OCR**

核心理由不是成本，而是 OTR 的 offline-first：

```text
No Internet
     ↓
Scan Receipt
     ↓
OCR works
     ↓
Expense Draft
     ↓
Save locally
```

---

# 7. OCR Pipeline

```text
Camera / Photo
      │
      ▼
Temporary local image
      │
      ├────► Image preprocessing
      │
      ▼
Apple Vision OCR
      │
      ▼
Raw text blocks
      │
      ▼
Receipt Parser
      │
      ▼
Suggested fields
      │
      ▼
Expense Draft
      │
      ▼
User reviews / edits
      │
      ▼
Save Expense
```

OCR 应优先尝试得到：

```text
amount
currency
date
merchant / description
```

Category recommendation 可以作为后续 enhancement，不是 1.0 blocker。

---

# 8. OCR 是建议，不是真相

所有 OCR 字段：

> **Suggested values only**

例如 OCR：

```text
TOTAL ¥8,520
2026/09/27
ABC Restaurant
```

New Expense：

```text
Amount       8520
Currency     JPY
Description  ABC Restaurant
Date         2026-09-27
```

用户仍然可以修改所有内容。

只有用户点击：

> Save

才进入正式：

```text
CREATE_EXPENSE
```

从这一刻开始才成为 Ledger canonical data。

---

# 9. Scan Receipt 与 Attachment 的关系

Scan Receipt 默认产生一个附件。

```text
Scan
 ↓
OCR
 ↓
Expense Draft
 ↓
Receipt preview
 ↓
Save
 ↓
Expense + Attachment
```

用户在保存 Expense 前应允许：

> Remove receipt

Remove 后：

- OCR 已填入的 draft 字段不自动清除；
- Receipt 不进入附件系统；
- 不占 cloud storage。

---

# 10. Attachment Domain Model

建议逻辑模型：

```text
expense_attachment

id
expense_id
journey_id

uploaded_by_user_id

mime_type
original_filename

original_size_bytes
stored_size_bytes

width
height
page_count

sha256

local_state
remote_state

storage_provider
object_key

created_at
uploaded_at
deleted_at
```

最终字段名称根据现有代码审计后确定，不要现在创建重复 schema。

---

# 11. Storage Ownership

规则：

> **Who uploads the attachment owns its cloud-storage usage.**

不要按照：

- Journey Owner
- Expense payer
- Participants

计算。

例如 A 上传 800 KB Receipt：

```text
A cloud usage +800 KB
B             +0
C             +0
```

即使多人都能看到附件，也只存储一份。

---

# 12. Remote Storage Architecture

推荐：

```text
                   Supabase
                PostgreSQL
                  metadata
                     ▲
                     │
OTR Mobile ───► OTR Backend
                     │
                     ▼
              Object Storage
                Germany
```

原则：

> **Database owns metadata. Object storage owns blobs.**

不把附件 binary 放 PostgreSQL。

同时不要让客户端绑定某个 storage vendor。

抽象：

```text
AttachmentStorageProvider
```

例如当前：

```text
GermanObjectStorageProvider
```

未来可以替换：

```text
R2
S3
Supabase Storage
other S3-compatible storage
```

而 Expense domain 不发生变化。

---

# 13. Object Key

可以采用：

```text
attachments/
  {account-or-user-scope}/
    {journey_id}/
      {expense_id}/
        {attachment_id}
```

但：

> Object path **不是 security boundary**。

真正授权必须通过 Backend/Auth/DB policy。

客户端不应该通过猜 object path 获取文件。

---

# 14. Offline-first Attachment Lifecycle

创建：

```text
Select / Capture
       ↓
Local file
       ↓
Attachment metadata
       ↓
Durable upload operation
       ↓
Expense can save immediately
```

没有网络时：

```text
Expense             SAVED
Attachment          LOCAL_ONLY
Upload operation    PENDING
```

网络恢复：

```text
PENDING
 ↓
UPLOADING
 ↓
server confirms
 ↓
REMOTE_AVAILABLE
```

上传失败绝不能导致 Expense 创建失败。

---

# 15. Local State

概念状态：

```text
LOCAL_ONLY
UPLOADING
CACHED
REMOTE_ONLY
```

含义：

**LOCAL_ONLY**

唯一副本还在设备。

> 永远禁止自动清理。

**UPLOADING**

正在同步。

> 禁止清理。

**CACHED**

云端已经确认存在，本地还有副本。

> 可以安全清理。

**REMOTE_ONLY**

本地已经清理。

> 打开时重新下载。

具体是否真的需要四个 persisted enum，由 Codex 根据现有 repository/state model 决定。

---

# 16. 最重要的本地安全规则

必须形成 invariant：

> **Never automatically delete the last known copy of an attachment.**

只有服务器确认：

- object exists；
- upload 成功；
- metadata 已提交；
- 必要时 hash/size 验证完成；

本地文件才能成为 disposable cache。

---

# 17. Local Cache Manager

附件与 SQLite 数据严格区分。

SQLite：

> Durable offline data

Attachments：

> Durable until uploaded → then disposable cache

建议第一版建立：

**AttachmentCacheManager**

基本策略：

```text
Protect:
LOCAL_ONLY
UPLOADING
current operations

Prefer keeping:
Active Journey
recently accessed

Evict first:
REMOTE confirmed
old Journey
least recently accessed
large files
```

---

# 18. Cache Ceiling

第一版可以采用：

> **Automatic cache management**

暂定工程目标：

**≈500 MB attachment cache ceiling**

但该数字应该是 config，不应成为 schema assumption。

达到阈值后采用 LRU 类策略清理。

例如：

```text
Cache = 540 MB
        ↓
remove old remote-backed files
        ↓
Cache = 420 MB
```

绝不删除 LOCAL_ONLY。

---

# 19. 用户主动清理

Settings 增加：

## Storage

例如：

```text
On this device

App data                 24 MB
Attachment cache        386 MB

[ Clear attachment cache ]
```

点击：

> Clear attachment cache

仅删除：

**REMOTE-confirmed local files**

不删除：

- SQLite
- Pending upload
- LOCAL_ONLY attachment
- Draft 中唯一存在的 receipt

---

# 20. Cloud Storage Usage

从 Attachment 1.0 第一版开始计量。

即使目前完全免费，也必须开始采集真实数据。

用户未来可以看到：

```text
Cloud storage

Attachments       1.8 GB
Files                486
```

---

# 21. Storage Accounting

不要依赖：

> 实时扫描整个 object-storage bucket。

每个 attachment 都必须知道实际：

```text
stored_size_bytes
```

服务端维护 storage usage projection，例如：

```text
user_storage_usage

user_id
attachment_count
stored_bytes
updated_at
```

---

# 22. Usage 必须可重建

不能只有：

```text
storage_used = 182738492
```

而没有来源。

每个 attachment 本身保留 stored bytes，因此：

```text
SUM(active attachment.stored_size_bytes)
```

可以重建用户 usage。

如果以后做 storage accounting events，也可以表达：

```text
UPLOAD
+684221

DELETE
-684221
```

Projection 出错时可以 reconcile。

---

# 23. Future Quota

第一版：

> 不收费、不阻止上传。

但 architecture 支持未来：

```text
storage_quota_bytes
storage_used_bytes
```

未来可以形成：

```text
Free       X GB
Plus       X GB
Pro        X GB
```

**现在不要决定具体商业额度。**

先积累真实数据。

---

# 24. 从第一天开始值得统计的运营数据

以后我们真正需要知道：

```text
attachments / active user
attachments / expense

average stored image size
average PDF size

image vs PDF ratio

cloud MB / user / month
cloud MB / user / year

percentage of expenses with attachment

percentage using Scan Receipt

OCR success / correction rate

attachment deletion rate
```

这些数据以后直接决定：

**免费额度、付费额度和基础设施成本模型。**

但 analytics 不保存 receipt 内容/OCR 全文等不必要的隐私数据。

---

# 25. Delete Lifecycle

用户删除附件：

```text
User Delete
    ↓
soft delete metadata
    ↓
sync
    ↓
server confirms
    ↓
deletion queue
    ↓
grace period
    ↓
physical object deletion
    ↓
storage usage reclaimed
```

建议第一版预留：

**30-day recovery/grace semantics**

是否真正提供用户恢复 UI，可以以后决定。

---

# 26. Orphan Cleanup

后台必须最终能够识别：

- abandoned upload
- failed multipart upload
- deleted Expense attachment
- deleted Journey attachment
- missing metadata object
- duplicate retry
- orphan storage object

否则长期 storage 最大的问题往往不是正常附件，而是垃圾对象。

这部分应该未来进入现有 **Data Health** 思路，而不是创建另一个完全独立的维护系统。

---

# 27. Upload Idempotency

附件计算：

```text
SHA-256
```

结合：

```text
attachment_id
```

保证同一个 durable operation 重试不会生成：

```text
receipt.jpg
receipt-copy.jpg
receipt-copy-2.jpg
```

注意：

> SHA-256 用于 integrity / retry / duplicate detection。

第一版不建议跨用户做 physical deduplication，避免 ownership、删除和隐私复杂度。

---

# 28. Security

附件必须遵循与 Expense 相同的 Journey visibility。

但：

> 能看到 Expense ≠ 永久公开 object URL。

建议下载：

```text
App
 ↓
Backend authorization
 ↓
short-lived signed URL
 ↓
Object storage
```

或 equivalent authenticated delivery。

不能保存永久公开 URL。

---

# 29. Privacy

Receipt 很可能包含：

- 姓名
- 地址
- 卡号后四位
- 酒店信息
- 行程
- 商户
- 消费习惯

因此默认：

- private storage
- authenticated access
- no public bucket
- no unnecessary OCR cloud upload
- local OCR preferred
- OCR raw content不用于 analytics
- physical deletion mechanism明确存在

---

# 30. 与现有 OTR 模块关系

```text
Expense
   │
   ├── Attachment 1.0
   │
   └── Receipt Scan
          ↓
      Expense Draft
          ↓
      CREATE_EXPENSE
          ↓
      existing Stage 5 / FX
```

不应该侵入：

```text
Settlement 2.0
Review 2.0
FX Reference
Data Health
```

除非现有 Attachment infrastructure 可以复用。

其中 **Data Health** 后期可以增加 storage consistency rules。

---

# 31. 第一版推荐交互

你现在这个 New Expense 页面基本保持。

点击：

**Scan receipt**

后：

```text
Camera
 ↓
Capture
 ↓
OCR
 ↓
New Expense
```

回来以后：

```text
Amount       86.40
Currency     NZD
What was it? Countdown
Date         2026-09-27

Receipt
[ thumbnail ] receipt.jpg   ×
```

然后正常：

> Save

Expense Detail：

```text
Attachments

receipt.jpg
invoice.pdf

[ + Add attachment ]
```

这里没有 Scan Receipt。

---

# 32. Attachment 1.0 的最终边界

我建议把第一版成功标准定义成：

> **用户可以离线扫描收据创建 Expense；OCR 在设备上辅助填写；Expense 可以拥有最多三个附件；附件可靠地后台上传至低成本云存储；上传后的设备副本成为可清理缓存；用户和系统都可以控制本地空间；服务端从第一天准确统计每个用户的实际云端存储占用。**

这已经是完整的 production foundation。

---
