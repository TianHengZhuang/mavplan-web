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
| 其他 | 中英文界面切换、明暗主题、任务本地持久化（localStorage）、快捷键（<kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销等） |

## 技术栈

Vue 3（组合式 API + `<script setup>`）、TypeScript、Pinia、Vue Router、Vite；单元测试使用 Vitest，类型检查使用 vue-tsc。

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
    actions.ts     MAVLink 命令分类
    i18n.ts        中英文词条
  stores/      Pinia 状态（任务、设置）
  components/  地图、剖面、航点表、图案面板、预检面板、任务收发
  views/       编辑器、预检、关于
tests/        core 层单元测试
```

## 数据格式

任务文件沿用 QGroundControl 约定：WPL 行以制表符分隔，`seq` 为零基下标，与内部航点数组顺序一致；导出时保留 `frame`、`command`、`autocontinue`、`acceptance_radius`、`orbit`、`yaw` 等字段。

## 许可

MIT，详见 [LICENSE](LICENSE)。

---

`mavplan-web` is the browser console companion to the `mavplan` toolkit: waypoint editing, area-coverage pattern generation, preflight checks and mission file import/export. It is a pure client-side Vue 3 + TypeScript application and keeps working offline.
