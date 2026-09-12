# mavplan-web

Browser console companion to the [mavplan](https://github.com/TianHengZhuang/mavplan) Python toolkit.

Plan multirotor UAV, fixed-wing, single-rotor helicopter, and compound VTOL fixed-wing missions in the browser: edit waypoints, generate survey patterns, run preflight checks, and exchange mission files with the CLI. Pure client-side Vue 3 + TypeScript — no backend, works offline, no data leaves the machine.

## Features

| Module | What it does |
| --- | --- |
| Waypoint editor | Add / edit / drag / reorder points on an offline SVG map; lat-lon-alt table editing; automatic resequencing; keyboard select / edit / delete |
| Mission summary | Readiness metrics + copy Markdown briefing for hand-off |
| Altitude profile | Climb profile vs cumulative distance; click a point on the profile or map to select the same waypoint |
| Pattern generators | Lawn-mower (rectangular block by lane spacing), circular orbit, polygon scan (bounding box + area) |
| Preflight | Altitude / range envelopes, turn radius, circular + polygon no-fly zones (with ceilings), battery and reserve estimates, graded findings |
| Mission I/O | Import / export mavplan JSON, QGC `.plan`, QGC WPL 110/120, KML, CSV; auto format sniffing |
| Task brief (TaskSpec) | Load a mavplan exam brief (`task.json`); apply home, altitude/speed windows, max distance/time and merge `no_fly_zones` |
| Zones JSON | Import / export no-fly zones in the Python `load_zones_json` layout (`radius_m`, `kind`, `vertices`) |
| Required checkpoints | Green dashed rings + labels for TaskSpec `required` points/areas on the editor and preflight maps |
| CLI companion | Paste-ready `mavplan mission import / preview / check / grade` commands for the live mission, zones and task |
| Flight legs | Per-leg distance, bearing, duration and climb rate; cumulative climb/descent and steepest vertical rate |
| Action items | DO_* actions (camera trigger, set HOME, RTL, …) with in-place interval / distance editing |
| Camera / payload | Swath, GSD, overlap, trigger spacing, photo count and data volume from altitude + FOV |
| Briefing sheet | One-page printable brief: metrics, waypoint/leg tables, payload estimate, preflight summary, sign-off block |
| Playback | Replay along the track by distance or time; live position, altitude, speed and active leg |
| Dashboard | Mission stats, leg distribution, preflight summary |
| Other | zh-CN / en UI, light/dark theme, localStorage persistence, shortcuts (<kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>?</kbd> help) |

## Pairing with the mavplan CLI

The console and the Python package share the same files and limits:

| File | Console | CLI |
| --- | --- | --- |
| Mission JSON / WPL / `.plan` | Import & export | `mavplan mission import`, `Mission.save` |
| `zones.json` | Import & export | `mavplan mission check --zones-json` |
| `task.json` (TaskSpec) | Import (applies limits + zones) | `mavplan scenario run --task-out`, `mavplan grade` |
| Offline HTML preview | — | `mavplan mission preview` |

Install the toolkit, export from the console, then recompute the same plan in a terminal:

```bash
pip install mavplan
mavplan mission import mission.json
mavplan mission check mission.json --zones-json zones.json
mavplan mission preview mission.json -o mission_preview.html
```

The **CLI companion** panel on the About and Preflight pages generates these commands for the current mission.

## Tech stack

Vue 3 (Composition API + `<script setup>`), TypeScript, Pinia, Vue Router, Vite. Unit tests with Vitest; types with `vue-tsc`.

## Live demo

<https://tianhengzhuang.github.io/mavplan-web/>

Every push to `main` runs `.github/workflows/demo.yml`: typecheck, unit tests, production build, then publish `dist/` to GitHub Pages. The build uses relative asset paths (`base: './'`), so the same bundle also works from a static server or a USB stick.

## Local development

```bash
npm install
npm run dev        # dev server
npm run build      # typecheck + production build (dist/)
npm run preview    # preview the production bundle
npm run test       # unit tests
npm run typecheck  # types only
```

## Project layout

```
src/
  core/        Pure logic (no framework; unit-testable)
    geo.ts         Distance, bearing, local ENU projection, polygon tests
    mission.ts     Mission model + WPL / QGC Plan / KML / CSV I/O
    pattern.ts     Lawn-mower, orbit, polygon scan generators
    preflight.ts   Preflight rules and no-fly zone geometry
    flight.ts      Leg build, sampling, climb statistics
    camera.ts      Swath, GSD, overlap, trigger spacing, data volume
    actions.ts     MAV_CMD classification
    zones.ts       Python-compatible zones.json import/export
    taskspec.ts    TaskSpec (exam brief) parse + preflight mapping
    cli.ts         CLI companion command builder
    i18n.ts        zh-CN / en strings
  stores/      Pinia stores (mission, settings)
  components/  Map, profile, waypoint table, timeline, actions, camera, pattern, preflight, I/O, CLI panel
  views/       Editor, dashboard, playback, preflight, report, about
tests/         Core and store unit tests
```

## Data formats

- **Mission files** follow QGroundControl conventions. WPL lines are tab-separated with zero-based `seq` matching the internal waypoint array. Exports keep `frame`, `command`, `autocontinue`, `acceptance_radius`, `orbit`, and `yaw`.
- **QGC WPL columns**: `seq, current, frame, command, p1, p2, p3, p4, lat, lon, alt, autocontinue`.
- **QGC `.plan`**: waypoint position lives in the 7-element `params` array `[p1, p2, p3, p4, lat, lon, alt]` (same as mavplan Python `formats.py`).
- **Zones JSON**: `{ "zones": [{ "name", "kind", "lat", "lon", "radius_m", "vertices"? }] }` — also accepts a bare array or a single zone object.
- **TaskSpec JSON**: `version`, `name`, `home`, `required[]`, `altitude_range`, `speed_range`, `max_time_s`, `max_distance_m`, `no_fly_zones[]` — the same document `TaskSpec.to_dict()` writes.

## License

MIT — see [LICENSE](LICENSE).

---

## Changelog

### v1.13.0 (2026-09-12)

- Mission summary: copy a Markdown briefing (metrics table + open issues) to the clipboard
- zh-CN / en labels for the copy action

### v1.12.0 (2026-09-12)

- Preflight findings grouped by severity (error / warning / info) on the full console
- Copy `mavplan.preflight/1` JSON to the clipboard for CLI / issue paste (`toPreflightJson`)
- i18n for copy action (zh-CN / en)

### v1.11.0 (2026-09-12)

- Waypoint table keyboard navigation: `↑`/`↓` move selection, `Enter` opens the first editable field, `Delete`/`Backspace` removes the selected row (ignored while typing)
- Table wrap is focusable (`tabindex=0`) with a tooltip hint in zh-CN / en
- First formal GitHub Release for this console (v1.10.x work is included since v1.9)

### v1.10.4 (2026-09-11)

- Playback: Latitude / Longitude labels use Chinese (纬度 / 经度)

### v1.10.3 (2026-09-11)

- Editor: move import/export to the left column under mission summary; right column is now preflight → HOME → actions → camera → patterns only

### v1.10.2 (2026-09-11)

- Timeline footer: replace the Greek `Σ` prefix with the Chinese label「累计」(English: Total); action flag already uses 有/无

### v1.10.1 (2026-09-11)

- Editor layout: left/right columns are now equal width (`1fr / 1fr`); added a mission summary card under the timeline
- Localised remaining English labels on the editor side panels (waypoint table headers, HOME lat/lon, action position, preflight zone lat/lon and kind, timeline yes/no)

### v1.10.0 (2026-09-11)

Visual polish pass for the console chrome and layout density:

- **Design tokens** — tighter type scale, refined light/dark palettes, stronger contrast on headings and controls, softer panel chrome
- **App shell** — compact sticky header (brand + tabs + mission meta), backdrop blur, sun/moon theme toggle, cleaner nav pill
- **Panels & tables** — clearer section headers, selected-row accent bar, quieter inline table inputs, uppercase micro-labels
- **Controls** — consistent button hierarchy (primary / danger / ghost), focus rings, denser fields
- **Editor / preflight map** — framed map host, aligned mission bar metrics
- **index.html** — SVG app icon and theme-color
- Print stylesheet: hide chrome, flatten panels

### v1.9.1 (2026-09-11)

- Fixed: mission import now accepts files saved with a UTF-8 BOM (`sniffFormat` / `parseWpl` / `parseQgcPlan` / `parseMissionText`), matching PowerShell `Set-Content -Encoding utf8` output and mavplan Python v1.7.2.

### v1.9.0 (2026-09-11)

Backend pairing with the mavplan Python toolkit (same files, same limits):

- **TaskSpec import** — load a CLI exam brief (`mavplan scenario run --task-out task.json` / `TaskSpec.save()`). Applies home, altitude/speed windows, max distance/time to preflight and merges `no_fly_zones` into the zone list.
- **Zones JSON import/export** — Python `load_zones_json` layout (`radius_m`, `kind`, `vertices` as `[lat, lon]`, bare list / `{"zones":[...]}`).
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

## Related projects

- [mavplan](https://github.com/TianHengZhuang/mavplan) — Python CLI & toolkit (same mission files)
- [Chinese-WebNovel-Master](https://github.com/TianHengZhuang/Chinese-WebNovel-Master) — Chinese web-fiction agent workflow
- [One-click-AI-PPT-creation](https://github.com/TianHengZhuang/One-click-AI-PPT-creation) — topic → presentation deck skill
