/* eslint-disable react-hooks/immutability --
 * R3F 命令式模式：controls / nodes 是普通可变对象与 three.js 对象引用，
 * 每帧直写（呼吸、弹簧、飞星进度），刻意绕过 React 重渲染。 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Room } from '@/data/rooms'
import { preloadRoomImage } from '@/data/rooms'
import { useAppStore } from '@/store'
import type { UniverseControls } from './controls'
import { REDUCED_MOTION, clamp, easeInOutCubic, easeOutCubic } from './controls'
import type { StarPosition } from './starPositions'
import { STAR_POSITIONS, directionToYawPitch, starWorldPosition } from './starPositions'
import { makeCoreTexture, makeGlowTexture, makeRingTexture } from './textures'

/**
 * 书房星 ×23（universe.md §1-B / §3 / §4）
 * 每颗星 = 星核（亮白小点）+ 辉光（starColor 径向渐变 sprite，加法混合）
 *         + hover 光晕环（弹簧弹出）+ 隐形 hit 球（Raycaster 目标）。
 *
 * - 呼吸：辉光 scale 1→1.12→1，周期 3–6s（相位随机）；hover 加速到 1.2s 且亮度 +40%
 * - 悬停：指针悬停或准星掠过光点 → hoverRoom(id) + preloadRoomImage + 光晕环 + 提示卡
 * - 准星瞄准：屏幕正中 72px 内最近星锁定 aimColor，并优先驱动信息卡片（手机可无指针悬停）
 * - 点击 / 索引选择：「飞星」转场（~1600ms；startFly 前保存相机朝向到 store）
 *   0–900ms 相机转向 + FOV 冲刺（CameraRig）；900–1400ms 目标星辉光膨胀铺满屏、
 *   其余星亮度 →0.15；1200–1600ms 柔白闪光（峰值 0.55，120ms 升起 + 1-t^1.6 衰减）；
 *   结束调用 selectRoom(id)
 * - 入场（§4）：0.8s 起 10 颗星辉光从 scale 0 绽放（stagger 70ms）；
 *   1.6s 段静之星引导性脉冲 ×2
 * - prefers-reduced-motion：呼吸/脉冲关闭，飞星改为 500ms 白场淡切
 */

interface StarNode {
  spec: StarPosition
  room: Room
  pos: THREE.Vector3
  glow: THREE.Sprite | null
  core: THREE.Sprite | null
  ring: THREE.Sprite | null
  /** 0..1 平滑 hover 量 */
  hover: number
  ringScale: number
  ringVel: number
  phase: number
  period: number
  baseGlow: number
  baseCore: number
}

interface RoomStarsProps {
  controls: UniverseControls
  rooms: Room[]
}

const GLOW_SCALE = 1.85 // 辉光基础世界尺寸（R3：半径缩小约 23%，更柔和）
const CORE_SCALE = 0.26
const FLY_DURATION = 1.6
const FLY_DURATION_REDUCED = 0.5
/* 闪光柔化（R2）：1200–1600ms 共 400ms；峰值窗口 120ms（前 30%），
 * 峰值透明度 0.55，升起用 easeOutCubic，之后按 1-(t)^1.6 衰减 */
const FLASH_START = 1.2
const FLASH_DURATION = 0.4
const FLASH_RISE = 0.3 // 峰值窗口占闪光段比例（0.3 × 400ms = 120ms）
const FLASH_PEAK = 0.34 // R3：闪光再弱化，0.55 → 0.34
/** 准星瞄准半径（屏幕像素）：略大于准星外环，便于掠过光点出卡 */
const AIM_RADIUS_PX = 72

export default function RoomStars({ controls, rooms }: RoomStarsProps) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const hoverRoom = useAppStore((s) => s.hoverRoom)
  const selectRoom = useAppStore((s) => s.selectRoom)

  const hoverIndex = useRef(-1)
  /** 指针悬停的星（与准星瞄准分离；有效悬停 = 瞄准优先，否则指针） */
  const pointerHoverIndex = useRef(-1)
  const clockNow = useRef(0)

  const coreTex = useMemo(() => makeCoreTexture(), [])

  const nodes = useMemo<StarNode[]>(() => {
    const rand = (() => {
      let s = 20250601
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
      }
    })()
    const list: StarNode[] = []
    for (const spec of STAR_POSITIONS) {
      const room = rooms.find((r) => r.id === spec.id)
      if (!room) continue
      list.push({
        spec,
        room,
        pos: new THREE.Vector3(...starWorldPosition(spec)),
        glow: null,
        core: null,
        ring: null,
        hover: 0,
        ringScale: 0.6,
        ringVel: 0,
        phase: rand(),
        period: 3 + rand() * 3,
        baseGlow: GLOW_SCALE * spec.size,
        baseCore: CORE_SCALE * spec.size,
      })
    }
    return list
  }, [rooms])

  const textures = useMemo(
    () =>
      nodes.map((n) => ({
        glow: makeGlowTexture(n.room.starColor),
        ring: makeRingTexture(n.room.starColor),
      })),
    [nodes],
  )

  /* ── 飞星转场 ─────────────────────────────────── */

  const startFly = (id: string) => {
    if (controls.fly.active) return
    const idx = nodes.findIndex((n) => n.room.id === id)
    if (idx < 0) return
    // 相机角度记忆：转场前保存当前朝向，退出书房后回到这颗星的角度
    useAppStore.getState().setUniverseCamera({ yaw: controls.yaw, pitch: controls.pitch })
    const dir = nodes[idx].pos.clone().normalize()
    const { yaw, pitch } = directionToYawPitch(dir.x, dir.y, dir.z)
    controls.fly = {
      active: true,
      id,
      start: clockNow.current,
      duration: REDUCED_MOTION ? FLY_DURATION_REDUCED : FLY_DURATION,
      fromYaw: controls.yaw,
      fromPitch: controls.pitch,
      toYaw: yaw,
      toPitch: clamp(pitch, -1.3, 1.3),
      fromFov: controls.fov,
      done: false,
    }
    hoverIndex.current = -1
    pointerHoverIndex.current = -1
    hoverRoom(null)
  }
  const startFlyRef = useRef(startFly)
  startFlyRef.current = startFly

  /* HUD 索引抽屉通过 controls.requestFly 触发同一转场 */
  useEffect(() => {
    controls.requestFly = (id) => startFlyRef.current(id)
    return () => {
      controls.requestFly = null
    }
  }, [controls])

  const setHover = (idx: number) => {
    if (controls.fly.active) return
    if (hoverIndex.current === idx) return
    hoverIndex.current = idx
    if (idx >= 0) {
      const room = nodes[idx].room
      hoverRoom(room.id)
      preloadRoomImage(room)
    } else {
      hoverRoom(null)
    }
  }

  /* ── 每帧：呼吸 / hover 弹簧 / 入场绽放 / 飞星 / 投影 ── */

  const projected = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    clockNow.current = t
    if (controls.entryStart < 0) controls.entryStart = t
    const elapsed = t - controls.entryStart
    const motion = controls.motion
    const fly = controls.fly

    /* 飞星推进 */
    let growIdx = -1
    let grow = 1
    if (fly.active) {
      const p = clamp((t - fly.start) / fly.duration, 0, 1)
      if (REDUCED_MOTION) {
        controls.flash = FLASH_PEAK * easeOutCubic(p)
        controls.dim = 1 - 0.85 * p
      } else {
        // 900–1400ms：辉光膨胀铺满屏，其余亮度骤降
        const p2 = easeInOutCubic(clamp((t - fly.start - 0.9) / 0.5, 0, 1))
        growIdx = nodes.findIndex((n) => n.room.id === fly.id)
        grow = 1 + p2 * 16
        controls.dim = 1 - 0.85 * p2
        // 1200–1600ms 柔白闪光：前 120ms easeOutCubic 升至峰值 0.55，
        // 之后 1-(t)^1.6 衰减至 0（米白 overlay，见 FlashOverlay，不再刺眼）
        const ft = clamp((t - fly.start - FLASH_START) / FLASH_DURATION, 0, 1)
        const rise = clamp(ft / FLASH_RISE, 0, 1)
        const decay = clamp((ft - FLASH_RISE) / (1 - FLASH_RISE), 0, 1)
        controls.flash =
          FLASH_PEAK * (rise < 1 ? easeOutCubic(rise) : 1 - Math.pow(decay, 1.6))
      }
      if (p >= 1 && !fly.done) {
        fly.done = true
        selectRoom(fly.id!)
      }
    }

    /* 准星瞄准检测：屏幕正中准星掠过书房星光点时锁定并弹出信息卡 */
    let aimColor: string | null = null
    let aimDist = AIM_RADIUS_PX
    let aimIdx = -1

    nodes.forEach((node, i) => {
      /* 入场绽放（0.8s 起，stagger 70ms） */
      const bloom = REDUCED_MOTION
        ? 1
        : easeInOutCubic(clamp((elapsed - 0.8 - i * 0.07) / 0.6, 0, 1))

      /* hover 平滑 + 光晕环弹簧（stiffness 260 / damping 18） */
      const hoverTarget = i === hoverIndex.current && !fly.active ? 1 : 0
      node.hover += (hoverTarget - node.hover) * Math.min(1, delta * 10)
      const ringTarget = 0.6 + 0.4 * hoverTarget
      const k = 260
      const d = 18
      node.ringVel += ((ringTarget - node.ringScale) * k - node.ringVel * d) * delta
      node.ringScale += node.ringVel * delta

      /* 呼吸：hover 时加速到 1.2s、亮度 +40% */
      const period = node.period + (1.2 - node.period) * node.hover
      const breathe =
        1 + 0.12 * Math.sin((t * Math.PI * 2) / period + node.phase * Math.PI * 2) * motion

      /* 段静之星引导性脉冲（1.6s 起，600ms ×2） */
      let pulse = 1
      if (!REDUCED_MOTION && node.room.id === 'duanjing' && elapsed > 1.6 && elapsed < 2.8) {
        const pt = (elapsed - 1.6) / 0.6
        pulse = 1 + 0.4 * Math.sin(pt * Math.PI)
      }

      const isGrowing = i === growIdx
      const dim = isGrowing ? 1 : controls.dim
      const scale =
        node.baseGlow * bloom * breathe * pulse * (1 + 0.22 * node.hover) * (isGrowing ? grow : 1)

      if (node.glow) {
        node.glow.scale.set(scale, scale, 1)
        const mat = node.glow.material as THREE.SpriteMaterial
        mat.opacity = 0.6 * dim * Math.min(1.22, 1 + 0.22 * node.hover)
      }
      if (node.core) {
        const cs = node.baseCore * bloom * (isGrowing ? 1 + (grow - 1) * 0.4 : 1)
        node.core.scale.set(cs, cs, 1)
        const mat = node.core.material as THREE.SpriteMaterial
        mat.opacity = dim
      }
      if (node.ring) {
        const rs = node.baseGlow * 1.5 * node.ringScale * bloom
        node.ring.scale.set(rs, rs, 1)
        const mat = node.ring.material as THREE.SpriteMaterial
        mat.opacity = 0.42 * node.hover * dim
        node.ring.visible = node.hover > 0.01
      }

      /* 屏幕投影：悬停提示卡跟随 + 准星瞄准（默认以画面正中为准） */
      projected.copy(node.pos).project(camera)
      if (projected.z < 1) {
        const sx = (projected.x * 0.5 + 0.5) * size.width
        const sy = (-projected.y * 0.5 + 0.5) * size.height
        if (i === hoverIndex.current) {
          controls.tooltipX = sx
          controls.tooltipY = sy
        }
        const dc = Math.hypot(sx - size.width / 2, sy - size.height / 2)
        if (dc < aimDist) {
          aimDist = dc
          aimColor = node.room.starColor
          aimIdx = i
        }
      }
    })

    controls.aimColor = fly.active ? null : aimColor

    /* 有效悬停：准星优先（手机无指针悬停也能出卡片），否则退回指针悬停 */
    if (!fly.active) {
      const nextHover = aimIdx >= 0 ? aimIdx : pointerHoverIndex.current
      setHover(nextHover)
    }
  })

  return (
    <group>
      {nodes.map((node, i) => (
        <group key={node.room.id} position={node.pos}>
          {/* 辉光 */}
          <sprite
            ref={(s) => {
              node.glow = s
            }}
            scale={[0.001, 0.001, 1]}
          >
            <spriteMaterial
              map={textures[i].glow}
              transparent
              opacity={0.6}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
          {/* 星核 */}
          <sprite
            ref={(s) => {
              node.core = s
            }}
            scale={[0.001, 0.001, 1]}
          >
            <spriteMaterial
              map={coreTex}
              transparent
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
          {/* hover 光晕环 */}
          <sprite
            ref={(s) => {
              node.ring = s
            }}
            visible={false}
            scale={[0.001, 0.001, 1]}
          >
            <spriteMaterial
              map={textures[i].ring}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
          {/* 隐形 hit 球（Raycaster 目标；colorWrite=false 不绘制但可被拾取） */}
          <mesh
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              pointerHoverIndex.current = i
            }}
            onPointerOut={() => {
              if (pointerHoverIndex.current === i) pointerHoverIndex.current = -1
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              startFlyRef.current(node.room.id)
            }}
          >
            <sphereGeometry args={[Math.max(1.6, 1.5 * node.spec.size), 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
