/**
 * 书房星空间分布（universe.md §1-B）：手工排布的固定坐标表。
 * - 15 颗星分布在半径 14–22 的球壳上，方位角约每 24° 一颗（错落抖动），
 *   高度角 −25°~+40°，保证 360° 任意视角都能看到至少 1–2 颗书房星。
 * - 段静（创始人）在初始视角正前方偏上 15°，穿越落地后第一眼可见。
 * - 最近的 2–3 颗（段静、大夏、子欣）size 更大 → 辉光更大更亮，制造纵深感。
 * - v2：mufeng/xiaoxiong 的坐标槽位由 misike/xiaotang 继承，
 *   并新增 5 组坐标（xizi/xiaoguang/zhanghenxiang/yitiaodahe/xiaoyu）补齐 15 星。
 */

export interface StarPosition {
  /** rooms.json 的 id */
  id: string
  /** 方位角（度）：0 = 初始正前方（-Z），顺时针增大 */
  az: number
  /** 高度角（度）：+ 向上 */
  el: number
  /** 半径（世界单位，14–22） */
  r: number
  /** 辉光尺寸系数（近星 > 1，远星 < 1） */
  size: number
}

export const STAR_POSITIONS: StarPosition[] = [
  { id: 'duanjing', az: 0, el: 15, r: 14, size: 1.35 },
  { id: 'xizi', az: 13, el: 40, r: 19, size: 0.9 },
  { id: 'xiaxiaomai', az: 41, el: -5, r: 20, size: 1.0 },
  { id: 'daxia', az: 72, el: 28, r: 16, size: 1.2 },
  { id: 'xiaoguang', az: 96, el: -22, r: 21, size: 0.9 },
  { id: 'zixin', az: 114, el: -12, r: 17, size: 1.15 },
  { id: 'zhanghenxiang', az: 133, el: 38, r: 20, size: 0.85 },
  { id: 'andrey', az: 151, el: 8, r: 21, size: 0.95 },
  { id: 'xiaoyu', az: 168, el: -16, r: 18, size: 0.95 },
  { id: 'wenda', az: 192, el: 35, r: 19, size: 1.0 },
  { id: 'yitiaodahe', az: 204, el: -12, r: 16, size: 1.0 },
  { id: 'maizi', az: 219, el: -18, r: 22, size: 0.9 },
  { id: 'hailu', az: 256, el: 5, r: 18, size: 1.0 },
  { id: 'misike', az: 294, el: 20, r: 21, size: 0.95 },
  { id: 'xiaotang', az: 329, el: -8, r: 15, size: 1.05 },
  /* ── 书房十周年 · 第二批 8 位朗读者（填补方位角空隙，保持全向可见） ── */
  { id: 'mufeng', az: 35, el: 18, r: 18, size: 0.95 },
  { id: 'huaer', az: 60, el: -14, r: 21, size: 0.9 },
  { id: 'zixiao', az: 92, el: 8, r: 17, size: 1.0 },
  { id: 'miaomiao', az: 142, el: -20, r: 20, size: 0.9 },
  { id: 'xiaotuma', az: 168, el: 26, r: 16, size: 1.05 },
  { id: 'xiali', az: 194, el: 6, r: 21, size: 0.9 },
  { id: 'xiaoxu', az: 237, el: -6, r: 19, size: 0.95 },
  { id: 'youmai', az: 275, el: 30, r: 18, size: 0.95 },
]

const DEG = Math.PI / 180

/**
 * 方位角/高度角 → 世界坐标（球壳）。
 * az = 0 朝向 -Z（相机初始朝向），az 增大向顺时针（从上往下看）。
 */
export function starWorldPosition(
  spec: StarPosition,
): [number, number, number] {
  const az = spec.az * DEG
  const el = spec.el * DEG
  return [
    Math.sin(az) * Math.cos(el) * spec.r,
    Math.sin(el) * spec.r,
    -Math.cos(az) * Math.cos(el) * spec.r,
  ]
}

/**
 * 单位方向向量 → 相机 yaw/pitch（YXZ）。
 * 与 CameraRig 的朝向公式互逆：look = (−sin(yaw)·cos(pitch), sin(pitch), −cos(yaw)·cos(pitch))
 */
export function directionToYawPitch(
  x: number,
  y: number,
  z: number,
): { yaw: number; pitch: number } {
  const len = Math.hypot(x, y, z) || 1
  return {
    yaw: Math.atan2(-x / len, -z / len),
    pitch: Math.asin(y / len),
  }
}
