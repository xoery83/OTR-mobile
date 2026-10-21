# OTR Mobile 2.0 — Unified Bottom Sheet Header Standard v1.0

**Status:** Owner UX Direction — Coordinator Integration  
**Scope:** All OTR Mobile 2.0 Bottom Sheets / Modal Forms  
**Priority:** Shared UI Consistency  
**Date:** 2026-10-22

## 1. Objective

统一 OTR Mobile 2.0 中 Bottom Sheet 的 Header、Drag Indicator、标题、关闭按钮、确认按钮及交互行为。

解决当前不同页面混用以下样式的问题：

- 有的显示顶部灰色 Drag Indicator，有的没有。
- 有的标题左对齐，有的居中。
- 有的使用 Cancel，有的使用 Close 或 `×`。
- 有的使用填充按钮，有的使用纯文字按钮。
- 不同 Sheet 的字体、间距、按钮位置和尺寸不一致。

**设计原则：Native-first, OTR-styled。**

优先复用现有 React Native / Expo 和 iOS 原生能力，统一 OTR 的视觉 Token 与交互语义。避免复杂自绘或重复实现。

---

## 2. Universal Header Structure

所有标准 Bottom Sheet 使用以下结构：

```text
╭──────────────────────────────────╮
│              ━━━                 │  Drag Indicator
│                                  │
│  [Left]       Sheet Title [Right]│
│                                  │
│          Sheet Content           │
╰──────────────────────────────────╯
```

### Layout Tokens

| Element | Specification |
|---|---|
| Drag Indicator | 36 × 5 pt |
| Drag Indicator Color | System tertiary / neutral gray |
| Top Corner Radius | 24–28 pt |
| Header Title | 17 pt, Semibold |
| Header Title Alignment | Center |
| Side Action Font | 16–17 pt |
| Header Horizontal Padding | 20 pt |
| Action Touch Target | Minimum 44 × 44 pt |
| Header Background | System Background |
| Header Height | Approximately 64–76 pt including drag indicator |
| Divider | Hidden by default |
| Safe Area | Native iOS safe-area aware |
| Dynamic Type | Required |
| Dark Mode | Semantic colors |

Header 标题必须视觉居中，不得因左右按钮文字长度不同而偏移。

优先采用固定的左右操作区域或等效布局保证标题居中。

---

## 3. Sheet Categories

### Type A — Lightweight Action / Selection Sheet

适用：

- Start a Trip
- Add to this trip
- Add Itinerary
- Trip Action Menu
- 其他无未保存编辑内容的轻量操作菜单

Header：

```text
              ━━━

          Start a Trip             ×
```

规范：

- 左侧无操作。
- 标题居中。
- 右侧 `×` 关闭。
- 顶部显示 Drag Indicator。
- 支持下滑关闭。
- 支持点击遮罩关闭（在当前 Presentation 允许时）。
- 不显示额外 Cancel 按钮。
- 不需要底部 Cancel CTA。

`×` 使用中性色，不使用绿色填充背景。

### Type B — Editing / Creation Form

适用：

- Create Trip
- Edit Trip
- P1–P6 Create / Edit Form
- New Expense
- Add / Edit Member
- 其他有未保存输入的表单

Header：

```text
              ━━━

 Cancel      Create Trip      Create
```

规范：

- 左侧使用 `Cancel`。
- 标题居中。
- 右侧使用 `Create`、`Save` 或 `Done`。
- 两侧均为纯文字按钮。
- 不使用背景填充、边框或胶囊按钮。
- 不使用额外底部固定 Save / Create 按钮，除非已有 owning flow 明确要求。
- 提交按钮 Disabled / Loading 状态必须明确。

### Type C — Capture / Composer Sheet

适用：

- Import Travel Plans
- Unified Capture Composer

Header：

```text
              ━━━

       Import Travel Plans         ×
```

规范：

- 标题居中。
- 右侧 `×`。
- 左侧无操作。
- 保留 Drag Indicator。
- Header 尽可能紧凑。
- 不因统一 Header 增加不必要的高度。
- 键盘弹出时优先保证 Composer、附件 Tray 和发送按钮可见。
- 存在未提交输入时，关闭行为遵守 Capture 草稿保护合同。

### Type D — Settings / Connection Sheet

适用：

- Email Import
- AI Plugins
- Connection Status / Management

默认采用 Type A Header。

如果包含需要显式保存的设置表单，则使用 Type B。

### Type E — Confirmation / Picker Sheet

适用：

- Travel Date Range Picker
- 需要明确确认的多选 Picker

Header：

```text
              ━━━

 Cancel      Travel dates      Done
```

如果选择立即生效、不需要 Done，则采用 Type A。

---

## 4. Header Button Visual Standard

统一使用 iOS 原生导航按钮风格的文字操作。

| Property | Left Action | Right Confirmation |
|---|---|---|
| Appearance | Text only | Text only |
| Background | None | None |
| Border | None | None |
| Font | 16–17 pt Regular | 16–17 pt Semibold |
| Color | OTR Brand Teal | OTR Brand Teal |
| Suggested Brand Color | #007F76 | #007F76 |
| Minimum Hit Area | 44 × 44 pt | 44 × 44 pt |
| Disabled | Normally enabled | Semantic disabled color |
| Loading | N/A | Prevent duplicate submission |

不应将 Header 的 Create / Save / Done 绘制成大面积绿色胶囊按钮。

对于 `×`：

- 使用标准 Close 图标。
- 图标约 18–20 pt。
- 使用 Secondary / Neutral 色。
- 点击区域至少 44 × 44 pt。
- 默认无填充背景。

---

## 5. Action Naming Semantics

统一以下文案：

| Action | Meaning |
|---|---|
| Cancel | 放弃当前编辑或创建操作 |
| Close | 关闭只读内容或非编辑型页面 |
| × | 关闭轻量 Sheet / Composer |
| Create | 创建新的业务对象 |
| Save | 保存已有对象的修改 |
| Done | 完成一次选择或确认 |
| Back | 返回上一级流程，而不是放弃全部内容 |

禁止在语义相同的页面中随机混用 Close / Cancel。

例如：

- Create Trip：Cancel / Create
- Edit Trip：Cancel / Save
- Travel Dates：Cancel / Done
- Start a Trip：×
- Add to this trip：×
- Import Travel Plans：×

---

## 6. Dismissal and Unsaved Data Protection

### No Unsaved Data

轻量 Sheet 可以通过：

- `×`
- 下滑
- 点击遮罩（如允许）

直接关闭。

### Unsaved Data Exists

编辑型 Sheet 或 Capture Composer 已有未保存内容时：

- Cancel、下滑、系统关闭手势遵守相同的草稿保护规则。
- 不得静默丢失重要输入。
- 如果已有 owning flow 支持保存草稿，应复用该机制。
- 如果需要确认放弃，使用统一的系统确认交互。
- 不应为每个 Sheet 独立实现一套丢弃逻辑。

### Submission

- 提交期间防止重复触发。
- 失败时保留可恢复的输入。
- 只有实际保存成功后才能反馈成功。
- 本地保存成功不等于云端同步成功。

---

## 7. Sheet-to-Sheet Navigation

当用户从一个 OTR Sheet 进入另一个 Sheet：

例如：

`Add to this trip → Import Travel Plans`

要求：

- 关闭或替换前一个 OTR Sheet。
- 不堆叠多个 OTR Bottom Sheets。
- 关闭目标 Sheet 后返回原始页面。
- 不自动重新打开前一个 Quick Add Sheet。
- 保留原始 Trip / Day 上下文。
- 不意外改变全局 Current Trip。

iOS 原生文件选择器、相册、相机、系统权限界面可以临时覆盖当前流程，并在结束后恢复上下文。

---

## 8. Keyboard and Dynamic Height

- Sheet 高度由内容决定，不强制所有 Sheet 使用相同高度。
- Compact Capture Composer 保持最小合理高度。
- 键盘弹出时自动调整位置和可用高度。
- Header 不得遮挡输入框。
- 输入内容增长时优先在内容区滚动。
- 支持 Dynamic Type、VoiceOver 和安全区域。
- 不因统一 Header 而引入不必要的固定留白。

---

## 9. Implementation Guidance

建议 Coordinator 先审查现有 Bottom Sheet / Modal 基础组件。

优先在已有共享基础上统一 Header，而不是引入第二套 Sheet Framework。

可根据现有代码组织提供统一配置能力，例如：

- Sheet title
- Sheet category
- Left action
- Right action
- Dismiss behavior
- Unsaved data guard
- Loading / Disabled state

具体 API、组件名称和实现方式由 Coordinator 根据现有架构决定。

**不要为了统一视觉而重构所有 Sheet 的业务流程。**

---

## 10. Scope and Acceptance

本轮覆盖：

1. My Trips — Start a Trip
2. Trip Home / Day Feed — Add to this trip
3. Add Itinerary
4. Create Trip
5. Import Travel Plans
6. Email Import / AI Plugins
7. Date Range Picker
8. P1–P6 Manual Forms
9. Ledger / Members / Photos 的标准 Modal Header

### Acceptance Criteria

- 所有适用 Sheet 显示一致的 Drag Indicator。
- 标题居中、字号与字重一致。
- 轻量 Sheet 使用 `×`，无多余 Cancel。
- 编辑型 Sheet 使用 Cancel + Create / Save / Done。
- Header 操作均使用统一文字按钮视觉。
- 不出现不一致的绿色胶囊 Header 按钮。
- 关闭手势与未保存内容保护正确。
- 键盘、Dark Mode、Dynamic Type、VoiceOver 正常。
- 不改变现有 Capture / Import / Admission / Ledger / Trip 业务合同。

## 11. Coordinator Delivery Boundary

本文件为 **Owner UX Standard**，不是对所有 Sheet 立即重构的授权。

请 Coordinator：

1. 将本规范纳入统一 UX Design Baseline。
2. 对现有 Sheet Header 进行差异盘点。
3. 优先在当前正在修改的 Create Trip、Import Travel Plans、Action Island Sheets 中应用。
4. 其他页面逐步统一，避免影响 Beta 主线。
5. 如发现与已批准 owning contract 冲突，先报告，不自行覆盖。

**Final Principle: One visual language, context-appropriate actions, native behavior, minimal engineering complexity.**