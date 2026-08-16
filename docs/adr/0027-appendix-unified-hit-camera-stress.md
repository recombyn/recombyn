# ADR 0027 附录 A：统一命中 / CameraTransform / 浏览器压测约束

- **Parent:** [ADR 0027](./0027-canvas-layered-runtime.md)
- **Status:** Accepted (normative for all canvas chrome / hit / lattice work)
- **Date:** 2026-08-16
- **Checklist:** [canvas-unified-pipeline-checklist.md](../canvas-unified-pipeline-checklist.md)
- **Stress plan:** [canvas-lattice-conversion-fix-plan.md](../canvas-lattice-conversion-fix-plan.md) §11+

## 目标

从根源消除多套实现碎片化，**禁止补丁式单点修复**。全部控制点、坐标换算、命中检测收敛至同一套算法管线；浏览器端多轮压测验证全缩放区间与全交互模式；修改不侵入无关模块。

---

## A.1 核心实现强制规则（硬性）

### 1. 命中检测统一

所有控制点（网格手柄、选择控制框、圆角 / 圆半径 / 多边形顶点、轮廓化后控制点、贝塞尔手柄等）优先使用统一的几何命中管线；HTML 命中座只负责屏幕 UI 或必要的事件承接，不作为第二套坐标算法。

统一管线：

```
根指针捕获 → 屏幕空间几何命中（+ 空间索引粗筛）→ 精确几何
```

不允许：为同一控制点维护互相独立的坐标、缩放和命中算法。

> 数据来源、坐标转换、命中判断、hover 触发必须复用同一套公共方法；全模式、5%–10000% 行为一致。

### 2. 坐标与换算唯一

画布内容、路径、选择框、描边偏移、网格对齐、控制点位置，**只允许一套 CameraTransform**：

- `worldToScreen`
- `screenToWorld`
- `screenDeltaToWorldDelta`

（实现落点：`rcbCameraScreenOffset` + `rcbCameraCssZoom` + `createCameraTransform` / 同名纯函数。）

**禁止：** 多处私写矩阵、缩放补偿、`1/zoom` 反向缩放、`viewBox` 修正、热路径 `getBoundingClientRect` 做坐标矫正、局部补丁换算。

### 3. 视觉 · 交互 · 网格同源

元素渲染、控制点、描边扩张、路径几何、网格约束，全部基于 **`SceneDocument` 原始数据** 计算。不允许渲染一套、命中一套、吸附另一套。

### 4. 控制框与屏幕 UI 分层（ADR 0027）

选择框、路径轮廓、形状控制点和绘制预览位于共享场景 SVG 相机组中，位置统一由 CameraTransform 驱动；真正的屏幕 UI（工具栏、提示、必要的 hit seat）位于 HTML overlay。控制点的视觉尺寸通过场景尺寸换算保持稳定，不再额外维护一套 viewBox 相机镜像。

### 5. 根源修复，拒绝局部打补丁

不针对某一类控制点 / 某一类图形单独写修复分支。异常优先修正底层公共转换 / 命中 / 几何工具。改完必须校验：选择、拖拽、变换、编辑、导出、协作等无关功能不被破坏。

---

## A.2 浏览器多轮压测

- **缩放：** 5% ~ 10000%（代码范围为 `RCB_MIN_ZOOM = 0.05` 至 `RCB_MAX_ZOOM = 100`）
- **浏览器：** Chrome（主）；Safari（有条件时）
- **模式：** 普通选择、节点编辑、轮廓化、多边形编辑、曲线编辑、拖拽变换、网格开/关

### 轮次 1 — CameraTransform / 格子

- world↔screen / delta 精度；网格晶格；平移缩放后漂移 ≤ 1 screen px
- 开/关网格下：元素、描边、路径顶点计算一致

### 轮次 2 — 全类型控制点命中（重点）

清单：选择框角/边、圆角、圆/椭圆半径、多边形顶点、轮廓化控制点、贝塞尔手柄、网格吸附辅助。

验证：统一几何命中；全缩放 hover/点击/拖拽；切换编辑模式行为不变；出视口 / 多选 union；拖拽+吸附同源。

### 轮次 3 — 渲染 · 命中 · 网格一致

路径/描边/框/点/网格视觉 = 命中 = 吸附；描边扩张不造成错位；10k 节点 hover/点击 P95；关网格管线不变。

### 轮次 4 — 回归（防副作用）

拖拽、框选、复制删除、变换、撤销重做、协作预览、导出、文本/媒体 DOM、RAF 预览；`sceneToSvg` 不受运行时改动影响。

### 报告模板

```
【第N轮浏览器压测报告】
1. 测试浏览器：
2. 覆盖缩放区间：5% ~ 10000%
3. 压测功能点：
4. 发现问题清单：
5. 修改的底层公共模块/函数（只允许改公共底层，禁止业务层单点补丁）：
6. 受影响关联模块：
7. 验证结果 & 遗留风险：
8. 补充回归用例：
```

---

## A.3 Code Review 卡点（禁止）

1. ❌ 为某一类控制点单独新增 DOM/SVG 命中分支  
2. ❌ 业务代码内手写局部缩放补偿、`1/zoom`、`viewBox` 修正  
3. ❌ 渲染 / 命中 / 网格三套独立换算  
4. ❌ 组件内 `if/else` 单点补丁（必须下沉公共层）  
5. ❌ 新控制点不接入统一命中管线  

---

## A.4 已知债（相对本附录）

压测过程中已出现、需继续收敛的项（后续轮次优先下沉，禁止再叠分支）：

| 债 | 说明 | 状态 |
|----|------|------|
| path-edit HTML hit pads | 作为事件承接的屏幕 hit seat | 几何命中为权威；必要的 HTML seat 仅承接事件，不计算第二套路径坐标 |
| Pen / path-edit 散落 window 监听 | 各工具私挂 window | **Round 2 收口** → `attachViewportToolPointers`（公共层仍含 window fallback，待根指针唯一入口后删） |
| 选择框 radius/poly overlay DOM stack | seats 未带 scene 几何时的事件承接 | `setOverlayHandleSeats` 写 registry；几何命中优先，DOM 仅 fallback |
| `__rcbHitTrace` | 诊断钩子 | Round 1 已限 DEV |
| WorldScreenChromeRoot host GBR h=0 | flex stretch + height:0 壳压扁 data-* host | **Round 4 已修** → `alignItems: flex-start` |
| 文字 Outline CJK e2e | fontkit catalog / fonts.ready / canvas 过重卡死 | **已修** → CJK 走 canvas（scale 5）+ fonts 预算；e2e 绿 |
| window fallback 双触发 | stage+window 同事件各调一次 | **已修** → window 仅中继 `hitEl` 外事件 |
| 唯一根指针 | pe:auto 层上仍需 window 中继 | 仍开 — 待 viewport 根捕获层 |
| CJK fontkit Worker | 真向量轮廓不冻主线程 | 仍开 |

## References

- `apps/web/src/components/rcb/camera/transform.ts`
- `apps/web/src/components/rcb/core/math.ts`
- `apps/web/src/components/rcb/render/sceneRenderer.ts`
- `apps/web/src/components/rcb/selection/SelectionChrome.tsx`
- `apps/web/src/components/rcb/scene/document/sceneHitBridge.ts`
