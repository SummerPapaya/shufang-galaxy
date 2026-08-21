import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { AnimatePresence, motion } from 'framer-motion'
import { useRooms } from '@/data/rooms'
import type { Room } from '@/data/rooms'
import { useAppStore } from '@/store'
import StarTooltip from '@/components/StarTooltip'
import { createControls } from './universe/controls'
import type { UniverseControls } from './universe/controls'
import CameraRig from './universe/CameraRig'
import Starfield from './universe/Starfield'
import RoomStars from './universe/RoomStars'
import IndexDrawer from './universe/IndexDrawer'
import StardustCursor from './universe/StardustCursor'
import { CompassStrip, Crosshair, HintBar } from './universe/Hud'
import { STAR_POSITIONS } from './universe/starPositions'

/**
 * Universe · 星空漫游（universe.md）
 * 第一人称 360° 星野：~3700 背景星（单次 draw call，双层球壳 + 闪烁）+ 近景星尘 +
 * 漂移呼吸星云 + 23 颗书房星（悬停提示 / 点击飞星转场）。
 * 相机角度记忆：离开前保存 yaw/pitch，返回时恢复。
 * 拖动 / 方向键 / 滚轮 / 自动巡游。星尘光标跟随鼠标轨迹。
 *
 * 挂载约定：视图挂载时 WarpFlash 正从白场淡出，相机直接就位。
 * 动画隔离：3D 场景（R3F）与 HUD 面板（framer-motion）分属不同子树。
 */

/** WebGL 支持检测（失败走 DOM 降级，universe.md §6） */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/* ── 悬停提示卡层：跟随被悬停星的屏幕投影（§2-B） ── */

function TooltipLayer({
  controls,
  rooms,
}: {
  controls: UniverseControls
  rooms: Room[]
}) {
  const hoveredRoomId = useAppStore((s) => s.hoveredRoomId)
  const room = rooms.find((r) => r.id === hoveredRoomId) ?? null
  const [pos, setPos] = useState({ x: 0, y: 0, flipX: false, flipY: false })

  useEffect(() => {
    if (!hoveredRoomId) return
    let raf = 0
    const tick = () => {
      const x = controls.tooltipX
      const y = controls.tooltipY
      // 边缘翻转防出屏（卡片 ≈ 220×90）：不再移动锚点，只做镜像翻转，
      // 保证任何位置的卡片与光点距离一致
      const flipX = x + 260 > window.innerWidth
      const flipY = y + 140 > window.innerHeight
      setPos((prev) =>
        Math.abs(prev.x - x) > 1 || Math.abs(prev.y - y) > 1 || prev.flipX !== flipX || prev.flipY !== flipY
          ? { x, y, flipX, flipY }
          : prev,
      )
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controls, hoveredRoomId])

  return (
    <>
      <StarTooltip room={room} x={pos.x} y={pos.y} flipX={pos.flipX} flipY={pos.flipY} />
      {/* 提示行：共享 StarTooltip 不含此行（universe.md §2-B 第三行），叠加在卡片下方 */}
      <AnimatePresence>
        {room && (
          <motion.p
            key={room.id}
            className="pointer-events-none fixed z-[80] font-hud text-[11px] tracking-[0.2em] text-gold"
            style={{
              left: pos.flipX ? pos.x - 182 : pos.x + 36,
              top: pos.flipY ? pos.y - 108 : pos.y + 52,
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            点击查看书房 →
          </motion.p>
        )}
      </AnimatePresence>
    </>
  )
}

/* ── 飞星白场（§3 阶段 4；rAF 直写 opacity，无 React 重渲染） ── */

function FlashOverlay({ controls }: { controls: UniverseControls }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      const f = controls.flash
      if (ref.current && Math.abs(f - last) > 0.004) {
        last = f
        ref.current.style.opacity = String(f)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controls])

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ opacity: 0, backgroundColor: '#f7edd4' }} // 柔和米白闪光（非纯白）
    />
  )
}

/* ── WebGL 不可用时的 DOM 降级（功能完整、观感降级） ── */

function DomFallback({ rooms }: { rooms: Room[] }) {
  const selectRoom = useAppStore((s) => s.selectRoom)
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 120% 80% at 30% 20%, var(--nebula-violet) 0%, transparent 55%),' +
          'radial-gradient(ellipse 90% 70% at 75% 70%, var(--nebula-rose) 0%, transparent 50%),' +
          'radial-gradient(ellipse 140% 100% at 50% 50%, var(--nebula-mid) 0%, var(--nebula-deep) 45%, var(--void) 100%)',
      }}
    >
      {STAR_POSITIONS.map((spec) => {
        const room = rooms.find((r) => r.id === spec.id)
        if (!room) return null
        // 方位角/高度角 → 屏幕百分比散点
        const left = 8 + ((spec.az % 360) / 360) * 84
        const top = 40 - spec.el * 0.85
        return (
          <button
            key={room.id}
            type="button"
            data-cursor="interactive"
            data-cursor-color={room.starColor}
            onClick={() => selectRoom(room.id)}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none"
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            <span
              className="block h-3.5 w-3.5 rounded-full transition-transform group-hover:scale-125"
              style={{
                background: room.starColor,
                boxShadow: `0 0 ${14 * spec.size}px ${room.starColor}`,
              }}
            />
            <span className="font-serif text-xs text-starlight opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {room.reader}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── 主视图 ─────────────────────────────────────── */

export default function UniverseView() {
  const { rooms } = useRooms()
  // 共享可变控制对象：useState 惰性初始化保证身份稳定（高频写入不触发重渲染）
  // 相机角度记忆：universeCamera 非空（从书房/图书馆返回）时以其初始化朝向
  const [controls] = useState(() =>
    createControls(useAppStore.getState().universeCamera),
  )

  /* 移动端降级（design.md §9 / universe.md §6）：背景星减半、关近景星尘、星云减至 3 */
  const isMobile = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
    [],
  )
  const webgl = useMemo(() => detectWebGL(), [])

  /* 离开时清除悬停状态（避免污染 room/landing 视图） */
  useEffect(() => {
    return () => {
      useAppStore.getState().hoverRoom(null)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      {webgl ? (
        <Canvas
          camera={{ fov: 62, position: [0, 0, 0], near: 0.1, far: 220 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <color attach="background" args={['#0b1026']} />
          <CameraRig controls={controls} />
          <Starfield
            controls={controls}
            starCount={isMobile ? 1700 : 3700}
            dustCount={isMobile ? 0 : 200}
            nebulaCount={isMobile ? 3 : 6}
          />
          {rooms.length > 0 && <RoomStars controls={controls} rooms={rooms} />}
        </Canvas>
      ) : (
        <DomFallback rooms={rooms} />
      )}

      {/* HUD 层（z-10+，除交互元素外 pointer-events-none） */}
      <Crosshair controls={controls} />
      <HintBar />
      <CompassStrip controls={controls} />
      <IndexDrawer
        rooms={rooms}
        controls={controls}
        onSelect={(id) => controls.requestFly?.(id)}
      />
      <TooltipLayer controls={controls} rooms={rooms} />
      <StardustCursor />
      <FlashOverlay controls={controls} />
    </div>
  )
}
