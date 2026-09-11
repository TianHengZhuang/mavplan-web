# mavplan-web

[mavplan](https://github.com/TianHengZhuang/mavplan) 的配套 Web 控制台：在浏览器里完成航线编辑、区域扫描图案生成、飞行前检查与任务文件收发。纯前端实现，不依赖后端服务，可离线使用。

## 功能

| 模块 | 说明 |
| --- | --- |
| 航线编辑器 | 地图上点位增删改拖拽、经纬度/高度表格编辑、航点排序重编号 |
| 高度剖面 | 按累计距离绘制爬升剖面，点击剖面与地图联动选中航点 |
| 图案生成 | 割草机式（矩形按航线间距逐行覆盖）、环绕（圆周等分）、多边形扫描（含凸包包围盒与面积核算） |
| 飞行前检查 | 超限高度/超限航程、禁飞区（圆形与多边形，含限高）冲突判定、电量与返航余量估算、结果分级 |
| 任务收发 | 导入导出 QGC WPL / QGC Plan / KML / CSV / JSON，自动识别格式 |
| 航段规划 | 相邻航点自动成段，给出航段距离、方位角、飞行时间与爬升率，累计爬升/下降与最大垂直速率汇总 |
| 动作项 | 单独列出自研动作（相机触发、设置 HOME、返航等）并就地修改触发间距或时间间隔 |
| 载荷估算 | 按航高与视场角推算地面幅宽、GSD、重叠率与拍照间距，估算照片数与数据量 |
| 任务简报 | 一页纸简报：关键指标、航点/航段表、载荷估算、预检结论与签派签字栏，可打印或导出 PDF、可复制为纯文本 |
| 飞行回放 | 沿航迹按距离/时间回放，显示当前位置、高度、速度与所属航段 |
| 控制台总览 | 任务统计、航段分布与预检摘要仪表盘 |
| 其他 | 中英文界面切换、明暗主题、任务本地持久化（localStorage）、快捷键（<kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销等） |

## 技术栈

Vue 3（组合式 API + `<script setup>`）、TypeScript、Pinia、Vue Router、Vite；单元测试使用 Vitest，类型检查使用 vue-tsc。

## 在线演示

<https://tianhengzhuang.github.io/mavplan-web/>

`main` 分支每次推送都会触发 `.github/workflows/demo.yml`：先跑类型检查、单元测试与生产构建，再把 `dist/` 发布到 GitHub Pages。构建使用相对资源路径（`base: './'`），因此同一份产物也能直接放到静态服务器或 U 盘里运行。

## 本地运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建（输出 dist/）
npm run preview    # 预览构建产物
npm run test       # 单元测试
npm run typecheck  # 仅类型检查
```

## 目录结构

```
src/
  core/        纯逻辑层（无框架依赖，可单独测试）
    geo.ts         距离、方位角、局部平面投影、多边形判定
    mission.ts     任务模型与 WPL / QGC Plan / KML / CSV 读写
    pattern.ts     割草机、环绕、多边形扫描图案生成
    preflight.ts   飞行前检查规则与禁飞区判定
    flight.ts      航段构建、采样与爬升统计
    camera.ts      幅宽、GSD、重叠率、拍照间距与数据量
    actions.ts     MAVLink 命令分类
    i18n.ts        中英文词条
  stores/      Pinia 状态（任务、设置）
  components/  地图、剖面、航点表、航段时间线、动作项、相机、图案、预检、任务收发
  views/       编辑器、总览、回放、预检、简报、关于
tests/        core 层与状态层单元测试
```

## 数据格式

任务文件沿用 QGroundControl 约定：WPL 行以制表符分隔，`seq` 为零基下标，与内部航点数组顺序一致；导出时保留 `frame`、`command`、`autocontinue`、`acceptance_radius`、`orbit`、`yaw` 等字段。

## 许可

MIT，详见 [LICENSE](LICENSE)。

---

## Changelog

### v1.9.0 (2026-09-11)

Backend pairing with the mavplan Python toolkit (same files, same limits):

- **TaskSpec import** — load a CLI exam brief (`mavplan scenario run --task-out task.json` / `TaskSpec.save()`). Applies home, altitude/speed windows, max distance/time to preflight and merges `no_fly_zones` into the zone list.
- **Zones JSON import/export** — Python `load_zones_json` layout (`radius_m`, `kind`, `vertices` as `[lat, lon]`, bare list / `{"zones":[...]}`). Export option: 禁飞区 JSON（mavplan）.
- **Required-checkpoint overlay** — green dashed rings + labels on the editor and preflight maps for TaskSpec `required` points/areas.
- **CLI companion panel** — paste-ready `pip install` / `mission import` / `mission preview` / `mission check --zones-json` / `grade` commands for the live mission, zones and task.
- New modules: `src/core/zones.ts`, `src/core/taskspec.ts`, `src/core/cli.ts`.
- Tests: 47 → 56.

### v1.8.0 (2026-09-11)

Fixed QGC interop bugs found in review (aligned with mavplan Python `formats.py`):

- **WPL column order**: writer/reader previously swapped `autocontinue` with `param1`. Real QGC / Mission Planner files now import correctly; exports use `seq, current, frame, command, p1..p4, lat, lon, alt, autocontinue`.
- **QGC `.plan` export**: `params` is now the full 7-element array `[p1, p2, p3, p4, lat, lon, alt]` plus `coordinate: [lat, lon]`. The old 4-param payload dropped every waypoint position.
- **QGC `.plan` import**: reads coordinates from `params[4..6]` first (QGC authoritative), falls back to `coordinate: [lat, lon]`. The previous reader inverted lat/lon on the coordinate fallback.
- **WPL HOME row**: leading `frame=0` HOME item is stored as `mission.home` instead of becoming a flown waypoint; optional leading HOME is emitted on WPL export when home is set.
- **Return-to-launch**: `addReturnToLaunch()` now inserts `NAV_RETURN_TO_LAUNCH` (cmd 20) instead of a plain waypoint.
- Tests: 42 → 47, covering real QGC WPL 110 samples, `.plan` 7-param round-trip, coordinate-only plans, HOME extraction and RTL command.

### v1.7.0 (2026-09-11)

- Initial public console: mission editor, patterns, preflight, flight plan, camera panel, printable briefing, playback, dashboard.
- Offline SVG map, zh-CN / en UI, localStorage persistence, GitHub Pages demo workflow.

---

`mavplan-web` is the browser console companion to the `mavplan` toolkit: waypoint editing, area-coverage pattern generation, preflight checks and mission file import/export. It is a pure client-side Vue 3 + TypeScript application and keeps working offline.
