/**
 * MAV_CMD constants and helpers, mirroring `src/mavplan/actions.py`.
 *
 * Only the subset used by mission planning / training workflows is listed;
 * the numeric ids are the MAVLink common-message values and must never be
 * renumbered.
 */

export const NAV_WAYPOINT = 16
export const NAV_LOITER_UNLIM = 17
export const NAV_LOITER_TURNS = 18
export const NAV_LOITER_TIME = 19
export const NAV_RETURN_TO_LAUNCH = 20
export const NAV_LAND = 21
export const NAV_TAKEOFF = 22
export const NAV_SPLINE_WAYPOINT = 82
export const NAV_VTOL_TAKEOFF = 84
export const NAV_VTOL_LAND = 85

export const DO_JUMP = 177
export const DO_CHANGE_SPEED = 178
export const DO_SET_HOME = 179
export const DO_SET_RELAY = 181
export const DO_REPEAT_RELAY = 182
export const DO_SET_SERVO = 183
export const DO_REPEAT_SERVO = 184
export const DO_SET_ROI_LOCATION = 195
export const DO_SET_ROI_WPNEXT_OFFSET = 196
export const DO_SET_ROI_NONE = 197
export const DO_DIGICAM_CONTROL = 203
export const DO_MOUNT_CONTROL = 205
export const DO_SET_CAM_TRIGG_DIST = 206
export const DO_FENCE_ENABLE = 207
export const DO_PARACHUTE = 208
export const DO_GRIPPER = 211
export const DO_SET_CAM_TRIGG_INTERVAL = 214

/** First id of the DO_* action band (everything from here is an action item). */
export const ACTION_RANGE_START = 176

export const COMMAND_NAMES: Record<number, string> = {
  [NAV_WAYPOINT]: 'NAV_WAYPOINT',
  [NAV_LOITER_UNLIM]: 'NAV_LOITER_UNLIM',
  [NAV_LOITER_TURNS]: 'NAV_LOITER_TURNS',
  [NAV_LOITER_TIME]: 'NAV_LOITER_TIME',
  [NAV_RETURN_TO_LAUNCH]: 'NAV_RETURN_TO_LAUNCH',
  [NAV_LAND]: 'NAV_LAND',
  [NAV_TAKEOFF]: 'NAV_TAKEOFF',
  [NAV_SPLINE_WAYPOINT]: 'NAV_SPLINE_WAYPOINT',
  [NAV_VTOL_TAKEOFF]: 'NAV_VTOL_TAKEOFF',
  [NAV_VTOL_LAND]: 'NAV_VTOL_LAND',
  [DO_JUMP]: 'DO_JUMP',
  [DO_CHANGE_SPEED]: 'DO_CHANGE_SPEED',
  [DO_SET_HOME]: 'DO_SET_HOME',
  [DO_SET_RELAY]: 'DO_SET_RELAY',
  [DO_REPEAT_RELAY]: 'DO_REPEAT_RELAY',
  [DO_SET_SERVO]: 'DO_SET_SERVO',
  [DO_REPEAT_SERVO]: 'DO_REPEAT_SERVO',
  [DO_SET_ROI_LOCATION]: 'DO_SET_ROI_LOCATION',
  [DO_SET_ROI_WPNEXT_OFFSET]: 'DO_SET_ROI_WPNEXT_OFFSET',
  [DO_SET_ROI_NONE]: 'DO_SET_ROI_NONE',
  [DO_DIGICAM_CONTROL]: 'DO_DIGICAM_CONTROL',
  [DO_MOUNT_CONTROL]: 'DO_MOUNT_CONTROL',
  [DO_SET_CAM_TRIGG_DIST]: 'DO_SET_CAM_TRIGG_DIST',
  [DO_FENCE_ENABLE]: 'DO_FENCE_ENABLE',
  [DO_PARACHUTE]: 'DO_PARACHUTE',
  [DO_GRIPPER]: 'DO_GRIPPER',
  [DO_SET_CAM_TRIGG_INTERVAL]: 'DO_SET_CAM_TRIGG_INTERVAL'
}

/** Commands offered in the waypoint editor drop-down. */
export const SELECTABLE_COMMANDS: number[] = [
  NAV_WAYPOINT,
  NAV_SPLINE_WAYPOINT,
  NAV_TAKEOFF,
  NAV_LAND,
  NAV_LOITER_TIME,
  NAV_LOITER_TURNS,
  NAV_RETURN_TO_LAUNCH,
  DO_CHANGE_SPEED,
  DO_SET_HOME,
  DO_SET_ROI_LOCATION,
  DO_SET_ROI_NONE,
  DO_SET_CAM_TRIGG_DIST,
  DO_SET_CAM_TRIGG_INTERVAL,
  DO_JUMP,
  DO_SET_SERVO,
  DO_GRIPPER,
  DO_FENCE_ENABLE
]

export function commandName(command: number): string {
  return COMMAND_NAMES[command] ?? `MAV_CMD_${command}`
}

/**
 * Localized display name for a MAV_CMD. Falls back to the technical
 * `DO_*` / `NAV_*` token when the locale table has no entry.
 */
export function commandLabel(command: number, translate: (key: string) => string): string {
  const technical = commandName(command)
  const key = `action.cmd.${technical}`
  const label = translate(key)
  if (!label || label === key) return technical
  return label
}

/** True for DO_* action items, false for NAV_* navigation items. */
export function isAction(command: number): boolean {
  return command >= ACTION_RANGE_START
}

export function isNavigable(command: number): boolean {
  return !isAction(command)
}

export interface CommandMeta {
  id: number
  /** Param labels in MAVLink order (param1..param4). */
  params: [string, string, string, string]
  /** True when the item carries a position that participates in the flown path. */
  navigates: boolean
}

const DEFAULT_PARAMS: [string, string, string, string] = ['param1', 'param2', 'param3', 'param4']

export const COMMAND_META: Record<number, CommandMeta> = {
  [NAV_WAYPOINT]: { id: NAV_WAYPOINT, params: ['delay', 'acceptance', 'orbit', 'yaw'], navigates: true },
  [NAV_SPLINE_WAYPOINT]: {
    id: NAV_SPLINE_WAYPOINT,
    params: ['delay', 'acceptance', 'orbit', 'yaw'],
    navigates: true
  },
  [NAV_TAKEOFF]: { id: NAV_TAKEOFF, params: ['pitch', '—', '—', 'yaw'], navigates: false },
  [NAV_LAND]: { id: NAV_LAND, params: ['abort alt', 'precision', '—', 'yaw'], navigates: false },
  [NAV_LOITER_TIME]: { id: NAV_LOITER_TIME, params: ['time s', '—', 'radius m', 'yaw'], navigates: false },
  [NAV_LOITER_TURNS]: { id: NAV_LOITER_TURNS, params: ['turns', '—', 'radius m', 'yaw'], navigates: false },
  [NAV_RETURN_TO_LAUNCH]: { id: NAV_RETURN_TO_LAUNCH, params: DEFAULT_PARAMS, navigates: false },
  [DO_CHANGE_SPEED]: { id: DO_CHANGE_SPEED, params: ['type', 'speed m/s', 'throttle %', 'rel'], navigates: false },
  [DO_SET_HOME]: { id: DO_SET_HOME, params: ['use current', '—', '—', 'yaw'], navigates: false },
  [DO_SET_ROI_LOCATION]: { id: DO_SET_ROI_LOCATION, params: ['—', '—', '—', '—'], navigates: false },
  [DO_SET_CAM_TRIGG_DIST]: { id: DO_SET_CAM_TRIGG_DIST, params: ['dist m', '—', '—', '—'], navigates: false },
  [DO_SET_CAM_TRIGG_INTERVAL]: {
    id: DO_SET_CAM_TRIGG_INTERVAL,
    params: ['interval s', '—', '—', '—'],
    navigates: false
  },
  [DO_JUMP]: { id: DO_JUMP, params: ['target seq', 'repeat', '—', '—'], navigates: false }
}

export function paramLabels(command: number): [string, string, string, string] {
  return COMMAND_META[command]?.params ?? DEFAULT_PARAMS
}
