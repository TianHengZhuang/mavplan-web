# Changelog

## v1.15.1 (2026-09-18)

### Added
- Preflight panel: **Copy Markdown** button (summary + findings as paste-ready Markdown for class reports)


## v1.16.0 (2026-09-18)

### Added
- Report view: plan quality score + band (same rubric as CLI mavplan grade plan) and deduction list
- Print / PDF path already present; grade block prints with the briefing sheet


## v1.17.0 (2026-09-22)

### Added
- Playback view: **flight log replay** — load a recorded CSV flight log (QGroundControl / Mission Planner headers are aliased, bare `lat,lon,alt` works too), scrub the recorded timeline and follow the flown track on the map (dashed path + live cursor). Browser twin of `mavplan analyze replay`: same haversine maths, same 1200-frame budget
- Playback view: **plan vs log comparison** — max / mean / P90 cross-track deviation, max altitude error and its location, signed mean altitude error, distance and duration deltas, end offset
- Log bar: source file name, sample counts (raw / kept), downsampling badge, max altitude, average ground speed, and inline parse-failure message

### Changed
- Playback transport controls drive two timelines (plan distance in `plan` mode, recorded time in `log` mode) through one set of buttons; the map view keeps its own progress readout per mode

### Notes
- Offline only: the flight log is parsed in the browser and nothing is uploaded.
