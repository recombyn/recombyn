# Canvas 统一管线 Checklist（ADR 0027 附录 A）

权威全文：[adr/0027-appendix-unified-hit-camera-stress.md](./adr/0027-appendix-unified-hit-camera-stress.md)

PR / 代理改动 `apps/web/src/components/rcb/**` 时逐项自检。

## 必须

- [ ] 坐标只用 CameraTransform（`worldToScreen` / `screenToWorld` / `screenDeltaToWorldDelta` 或同名纯函数：`rcbCameraCssZoom` + `rcbCameraScreenOffset`）
- [ ] 控制点视觉位于共享场景 SVG 相机组，尺寸通过场景尺寸换算保持稳定；屏幕 UI / 必要 hit seat 才位于 HTML overlay
- [ ] 命中 = 根指针 → 几何 / 空间索引；HTML/SVG 事件承接不能引入第二套坐标算法
- [ ] 渲染 / 命中 / 网格吸附同源（同一 `SceneDocument` + 同一格子 `gℤ`）
- [ ] Bug 修在公共层（math / transform / hit / spatial / chrome 几何），不是某 Shape/Tool 内 if 补丁
- [ ] 无新 orphan `*Utils.ts` / 单消费者 helper 文件
- [ ] 改完跑相关 vitest；涉及交互则跑对应 e2e（或人工 5% / 100% / ≥800% 对拍）

## 禁止

- [ ] 不为某一类控制点单独加第二套 DOM/SVG 坐标与命中算法
- [ ] 不在业务组件手写缩放补偿 / `viewBox` 矫正 / GBR 当坐标权威
- [ ] 不维持「渲染一套、命中一套、吸附一套」
- [ ] 新控制点必须进统一命中管线

## 压测轮次（有改动时选跑）

| 轮 | 焦点 | 典型入口 |
|----|------|----------|
| 1 | Camera / 格子 | `canvas.chromeAlign` `canvas.penGrid` `mathScreenScene` |
| 2 | 全控制点命中 | `canvas.outlineHit` + 人工角点/圆角/多边形/贝塞尔 |
| 3 | 视觉=命中=格 | 高倍对拍 + 关网格 |
| 4 | 回归 | `hitSelect` `foundations` 拖拽/导出冒烟 |

报告模板见附录 A §A.2。
