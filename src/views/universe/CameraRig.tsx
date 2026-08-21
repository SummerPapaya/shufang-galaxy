/* eslint-disable react-hooks/immutability --
 * R3F 命令式模式：controls 是组件间共享的普通可变对象（见 controls.ts），
 * 高频写入（每帧 yaw/pitch/fov）刻意绕过 React 重渲染。 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { UniverseControls } from './controls'
import {
  BASE_FOV,
  PITCH_LIMIT,
  REDUCED_MOTION,
  clamp,
  easeInOutCubic,
  easeOutCubic,
  shortestAngle,
} from './controls'

/**
 * 第一人称相机操控（universe.md §1-C）
 * - 相机固定原点，只旋转（YXZ：yaw + pitch，pitch 限 ±75°）
 * - 拖动旋转：Pointer Events → 目标角增量，实际角以 ~0.08/帧阻尼趋近（惯性丝滑）
 * - 方向键 / WASD：持续旋转（60°/s，按下加速、松开阻尼停止）
 * - 自动巡游：无操作 12s 后以 1.5°/s 极缓向右巡游 + 正弦俯仰（±3°，周期 20s），
 *   任何输入立即打断；prefers-reduced-motion 下关闭
 * - 滚轮：微调视距（基础 FOV 56–70）
 * - 飞星转场期间：输入锁定，镜头 slerp 朝向目标星，FOV 62→78 冲刺
 */

const DRAG_SPEED = 0.0032 // rad / px
const KEY_SPEED = Math.PI / 3 // 60°/s
const DAMPING = 0.08 // 每帧（60fps 基准）
const TOUR_SPEED = (1.5 * Math.PI) / 180
const IDLE_DELAY = 12

export default function CameraRig({ controls }: { controls: UniverseControls }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const keys = useRef<Set<string>>(new Set())
  const keyVel = useRef({ yaw: 0, pitch: 0 })

  useEffect(() => {
    const el = gl.domElement
    const markInput = () => {
      controls.lastInput = performance.now() / 1000
    }

    const onPointerDown = (e: PointerEvent) => {
      if (controls.fly.active) return
      markInput()
      drag.current = { x: e.clientX, y: e.clientY, vx: 0, vy: 0 }
      el.setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      markInput()
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      d.x = e.clientX
      d.y = e.clientY
      d.vx = d.vx * 0.7 + dx * 0.3
      d.vy = d.vy * 0.7 + dy * 0.3
      // 抓握式拖动：向右拖 → 场景向右 → 视角左转
      controls.targetYaw += dx * DRAG_SPEED
      controls.targetPitch = clamp(
        controls.targetPitch + dy * DRAG_SPEED,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      )
    }
    const onPointerUp = () => {
      const d = drag.current
      drag.current = null
      if (!d) return
      // 轻微甩动惯性
      controls.targetYaw += d.vx * DRAG_SPEED * 6
      controls.targetPitch = clamp(
        controls.targetPitch + d.vy * DRAG_SPEED * 6,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      )
    }

    const KEY_MAP: Record<string, 'left' | 'right' | 'up' | 'down'> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      a: 'left',
      d: 'right',
      w: 'up',
      s: 'down',
      A: 'left',
      D: 'right',
      W: 'up',
      S: 'down',
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key]
      if (!dir) return
      if (controls.fly.active) return
      // 输入框聚焦时让路
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      markInput()
      keys.current.add(dir)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = KEY_MAP[e.key]
      if (dir) keys.current.delete(dir)
    }
    const onBlur = () => keys.current.clear()

    const onWheel = (e: WheelEvent) => {
      if (controls.fly.active) return
      markInput()
      controls.baseFov = clamp(controls.baseFov + e.deltaY * 0.01, 56, 70)
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl, controls])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (controls.entryStart < 0) controls.entryStart = t
    const cam = camera as import('three').PerspectiveCamera
    cam.rotation.order = 'YXZ'

    if (controls.fly.active && !REDUCED_MOTION) {
      /* 飞星：镜头朝目标星平滑转向（400ms），FOV →78（900ms 冲刺感） */
      const fly = controls.fly
      const tRel = t - fly.start
      const q = easeInOutCubic(clamp(tRel / 0.4, 0, 1))
      controls.yaw = fly.fromYaw + shortestAngle(fly.toYaw, fly.fromYaw) * q
      controls.pitch = fly.fromPitch + (fly.toPitch - fly.fromPitch) * q
      controls.targetYaw = controls.yaw
      controls.targetPitch = controls.pitch
      controls.fov = fly.fromFov + (78 - fly.fromFov) * easeOutCubic(clamp(tRel / 0.9, 0, 1))
    } else {
      /* 键盘：按下加速、松开阻尼停止 */
      const k = keys.current
      const yawIn = (k.has('left') ? 1 : 0) - (k.has('right') ? 1 : 0)
      const pitchIn = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0)
      const accel = Math.min(1, delta * 6)
      keyVel.current.yaw += (yawIn * KEY_SPEED - keyVel.current.yaw) * accel
      keyVel.current.pitch += (pitchIn * KEY_SPEED - keyVel.current.pitch) * accel
      if (Math.abs(keyVel.current.yaw) > 0.0004 || Math.abs(keyVel.current.pitch) > 0.0004) {
        controls.targetYaw += keyVel.current.yaw * delta
        controls.targetPitch = clamp(
          controls.targetPitch + keyVel.current.pitch * delta,
          -PITCH_LIMIT,
          PITCH_LIMIT,
        )
      }

      /* 自动巡游：12s 无操作，极缓向右 + 正弦俯仰 */
      const idle = performance.now() / 1000 - controls.lastInput
      if (!REDUCED_MOTION && idle > IDLE_DELAY && !drag.current) {
        controls.targetYaw -= TOUR_SPEED * delta
        const tourPitch =
          (10 * Math.PI) / 180 + Math.sin((t * Math.PI * 2) / 20) * ((3 * Math.PI) / 180)
        controls.targetPitch += (tourPitch - controls.targetPitch) * Math.min(1, delta * 0.5)
      }

      /* 阻尼趋近目标角（帧率无关） */
      const dampK = 1 - Math.pow(1 - DAMPING, delta * 60)
      controls.yaw += (controls.targetYaw - controls.yaw) * dampK
      controls.pitch += (controls.targetPitch - controls.pitch) * dampK
      controls.fov += (controls.baseFov - controls.fov) * Math.min(1, delta * 5)
    }

    cam.rotation.y = controls.yaw
    cam.rotation.x = controls.pitch
    if (Math.abs(cam.fov - controls.fov) > 0.01) {
      cam.fov = controls.fov
      cam.updateProjectionMatrix()
    }
  })

  /* 相机参数由 Canvas 的 camera prop 初始化；FOV 每帧从 controls 同步 */
  useEffect(() => {
    const cam = camera as import('three').PerspectiveCamera
    cam.fov = BASE_FOV
    cam.updateProjectionMatrix()
  }, [camera])

  return null
}
