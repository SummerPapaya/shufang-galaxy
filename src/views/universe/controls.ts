/**
 * 星空漫游共享控制对象（universe.md §1-C / §3）
 *
 * UniverseView 创建一份普通可变对象（非 React state），在
 * CameraRig（写入 yaw/pitch/fov）、RoomStars（写入 tooltip 投影 /
 * 准星染色 / 飞星进度）与 HUD DOM 组件（rAF 读取）之间共享，
 * 避免高频动画触发 React 重渲染。
 */

export interface FlyState {
  active: boolean
  id: string | null
  /** 场景时钟（clock.elapsedTime）上的起飞时刻 */
  start: number
  duration: number
  fromYaw: number
  fromPitch: number
  toYaw: number
  toPitch: number
  fromFov: number
  done: boolean
}

export interface UniverseControls {
  /** 当前已应用的相机角（弧度，YXZ 顺序） */
  yaw: number
  pitch: number
  /** 输入目标角（阻尼趋近） */
  targetYaw: number
  targetPitch: number
  fov: number
  /** 滚轮微调后的基础 FOV（56–70，默认 62） */
  baseFov: number
  /** 背景星 / 其他书房星亮度系数（飞星时降至 0.15） */
  dim: number
  /** 白场闪白 0..1 */
  flash: number
  /** 准星附近 60px 内有书房星投影时 = 该星 starColor */
  aimColor: string | null
  /** 悬停星的屏幕投影（视口 px），供 StarTooltip 跟随 */
  tooltipX: number
  tooltipY: number
  /** 场景时钟上的入场起点（首帧写入，-1 = 未写入） */
  entryStart: number
  /** 最后一次用户输入（performance.now() 秒），用于 12s 自动巡游 */
  lastInput: number
  /** 0 = prefers-reduced-motion（关闭呼吸/巡游/闪烁） */
  motion: number
  fly: FlyState
  /** RoomStars 挂载后注册：触发"飞星"转场（HUD 索引抽屉也走这里） */
  requestFly: ((id: string) => void) | null
}

export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const INITIAL_PITCH = (10 * Math.PI) / 180
export const PITCH_LIMIT = (75 * Math.PI) / 180
export const BASE_FOV = 62

export function createControls(
  saved?: { yaw: number; pitch: number } | null,
): UniverseControls {
  const entryYaw = (8 * Math.PI) / 180
  // 相机角度记忆：从书房/图书馆返回时（store.universeCamera 非空）直接落在
  // 当时的 yaw/pitch（无入场回正摆动）；首次从 landing 进入走默认 8° 回正。
  const startYaw = saved ? saved.yaw : entryYaw
  const startPitch = clamp(saved ? saved.pitch : INITIAL_PITCH, -PITCH_LIMIT, PITCH_LIMIT)
  const targetYaw = saved ? saved.yaw : 0
  return {
    // 入场：相机带 8° 回正摆动（当前值偏离目标，阻尼收敛出"落地感"）
    yaw: startYaw,
    pitch: startPitch,
    targetYaw,
    targetPitch: startPitch,
    fov: BASE_FOV,
    baseFov: BASE_FOV,
    dim: 1,
    flash: 0,
    aimColor: null,
    tooltipX: 0,
    tooltipY: 0,
    entryStart: -1,
    lastInput: performance.now() / 1000,
    motion: REDUCED_MOTION ? 0 : 1,
    fly: {
      active: false,
      id: null,
      start: 0,
      duration: 1.6,
      fromYaw: 0,
      fromPitch: 0,
      toYaw: 0,
      toPitch: 0,
      fromFov: BASE_FOV,
      done: false,
    },
    requestFly: null,
  }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 最短角距（弧度），结果 ∈ [-π, π] */
export function shortestAngle(to: number, from: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
