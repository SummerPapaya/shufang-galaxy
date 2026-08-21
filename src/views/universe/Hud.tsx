import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { UniverseControls } from './controls'

/**
 * 星空漫游 HUD（universe.md §2，DOM 覆盖层，pointer-events-none）
 * - Crosshair：中央准星（4px 月白圆点 + 16px 细圆环），
 *   准星附近 60px 内有书房星投影时圆环染 starColor 并微放大（rAF 直写 style）
 * - CompassStrip：右下罗盘刻度带（每 15° 刻线，四象星宿名，金色三角指针随 yaw 滚动）
 * - HintBar：左下操作提示，入场 6s 后降至 40% 透明度
 * 入场：0.5s 起依序淡入（stagger 150ms，y +10→0）。
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/* ── 中央准星 ───────────────────────────────────── */

export function Crosshair({ controls }: { controls: UniverseControls }) {
  const ringRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    let last: string | null = null
    const tick = () => {
      const color = controls.aimColor
      if (color !== last && ringRef.current) {
        last = color
        const el = ringRef.current
        el.style.borderColor = color ?? 'rgba(245,240,230,0.25)'
        el.style.scale = color ? '1.25' : '1'
        el.style.boxShadow = color ? `0 0 12px ${color}66` : 'none'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controls])

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5, ease: EASE }}
    >
      <span
        ref={ringRef}
        className="block h-4 w-4 rounded-full border transition-[border-color,box-shadow] duration-200"
        style={{ borderColor: 'rgba(245,240,230,0.25)' }}
      />
      <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-starlight" />
    </motion.div>
  )
}

/* ── 罗盘刻度条 ─────────────────────────────────── */

const DEG_LABELS: Record<number, string> = {
  0: '青龙',
  90: '朱雀',
  180: '白虎',
  270: '玄武',
}
/** 可见窗口 90°，带宽 160px */
const PX_PER_DEG = 160 / 90
/** 刻度覆盖 −360°..720°（3 圈），保证任意朝向可滚动 */
const TICKS: number[] = []
for (let d = -360; d <= 720; d += 15) TICKS.push(d)

export function CompassStrip({ controls }: { controls: UniverseControls }) {
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (stripRef.current) {
        // yaw 增大（左转）→ 刻度带向右滚动；朝向 = −yaw
        const heading = ((-controls.yaw * 180) / Math.PI % 360 + 360) % 360
        const x = 80 - (heading + 360) * PX_PER_DEG
        stripRef.current.style.transform = `translateX(${x.toFixed(2)}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controls])

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed bottom-6 z-10"
      style={{ right: 132 }} // 音频钮（right 24 + 44 宽）左侧 64px
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.95, ease: EASE }}
    >
      <div
        className="relative h-9 w-40 overflow-hidden"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%)',
        }}
      >
        {/* 刻度带 */}
        <div ref={stripRef} className="absolute left-0 top-0 h-full will-change-transform">
          {TICKS.map((d) => {
            const norm = ((d % 360) + 360) % 360
            const major = norm % 90 === 0
            return (
              <div
                key={d}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: (d + 360) * PX_PER_DEG }}
              >
                <span
                  className={
                    major ? 'h-2.5 w-px bg-starlight-dim' : 'h-1.5 w-px bg-starlight-faint'
                  }
                />
                {major && (
                  <span className="mt-1 -translate-x-1/2 whitespace-nowrap font-hud text-[9px] tracking-[0.2em] text-starlight-faint">
                    {DEG_LABELS[norm]}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {/* 两侧渐隐（mask 而非色块，避免与星空底色产生色差） */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 22%, black 78%, transparent 100%)',
            maskImage:
              'linear-gradient(to right, transparent 0%, black 22%, black 78%, transparent 100%)',
          }}
        />
        {/* 金色三角指针 */}
        <span
          className="absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '6px solid var(--gold)',
            filter: 'drop-shadow(0 0 4px var(--gold-glow))',
          }}
        />
      </div>
    </motion.div>
  )
}

/* ── 左下操作提示 ───────────────────────────────── */

export function HintBar() {
  const [dimmed, setDimmed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDimmed(true), 6000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <motion.p
      className="pointer-events-none fixed bottom-6 left-6 z-10 font-hud text-[11px] uppercase tracking-[0.22em] text-starlight-faint"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: dimmed ? 0.4 : 1, y: 0 }}
      transition={{
        opacity: { duration: dimmed ? 1.2 : 0.5, ease: 'easeOut' },
        y: { duration: 0.5, delay: 0.8, ease: EASE },
      }}
    >
      拖动环顾 · 方向键旋转 · 点击星星进入书房
    </motion.p>
  )
}
