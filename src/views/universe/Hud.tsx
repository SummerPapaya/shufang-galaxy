import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { UniverseControls } from './controls'

/**
 * 星空漫游 HUD（universe.md §2，DOM 覆盖层，pointer-events-none）
 * - Crosshair：光学瞄准镜分划（目镜双环 + mil-dot 十字丝，线条半透明），
 *   准星附近 60px 内有书房星投影时整组淡染 starColor（rAF 直写 style）
 * - CompassStrip：右下罗盘刻度带（每 15° 刻线，四象星宿名，金色三角指针随 yaw 滚动）
 * - HintBar：左下操作提示，入场 6s 后降至 40% 透明度
 * 入场：0.5s 起依序淡入（stagger 150ms，y +10→0）。
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const RETICLE_IDLE = 'rgba(245, 240, 230, 0.22)'

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const MIL_DOTS = [18, 26, 34] as const

/* ── 中央准星：光学瞄准镜分划 ───────────────────── */

export function Crosshair({ controls }: { controls: UniverseControls }) {
  const reticleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let last: string | null = null
    const tick = () => {
      const color = controls.aimColor
      if (color !== last && reticleRef.current) {
        last = color
        const el = reticleRef.current
        el.style.color = color ? hexToRgba(color, 0.34) : RETICLE_IDLE
        el.style.scale = color ? '1.04' : '1'
        el.style.filter = color ? `drop-shadow(0 0 5px ${hexToRgba(color, 0.28)})` : 'none'
        el.dataset.locked = color ? 'true' : 'false'
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
      <div
        ref={reticleRef}
        className="crosshair-reticle relative h-[88px] w-[88px] text-[rgba(245,240,230,0.22)] transition-[scale,filter,color] duration-200"
      >
        {/* 目镜外环：细刻度缓慢旋转 */}
        <svg
          className={REDUCED_MOTION ? 'absolute inset-0' : 'crosshair-reticle-spin absolute inset-0'}
          viewBox="0 0 96 96"
          fill="none"
        >
          <circle cx="48" cy="48" r="45.5" stroke="currentColor" strokeWidth="0.55" strokeOpacity="0.45" />
          <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.28" strokeDasharray="1.2 2.4" />
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2 - Math.PI / 2
            const major = i % 5 === 0
            const inner = major ? 41.2 : 43.4
            const outer = 45.5
            return (
              <line
                key={i}
                x1={48 + Math.cos(a) * inner}
                y1={48 + Math.sin(a) * inner}
                x2={48 + Math.cos(a) * outer}
                y2={48 + Math.sin(a) * outer}
                stroke="currentColor"
                strokeOpacity={major ? 0.55 : 0.28}
                strokeWidth={major ? 0.7 : 0.4}
                strokeLinecap="square"
              />
            )
          })}
        </svg>

        {/* 静止分划：浮空十字 + mil-dot，中心全透明 */}
        <svg className="absolute inset-0" viewBox="0 0 96 96" fill="none">
          <circle cx="48" cy="48" r="13.5" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.4" />
          {/* 十字丝（中心开口） */}
          <line x1="6" y1="48" x2="34.5" y2="48" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.55" />
          <line x1="61.5" y1="48" x2="90" y2="48" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.55" />
          <line x1="48" y1="6" x2="48" y2="34.5" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.55" />
          <line x1="48" y1="61.5" x2="48" y2="90" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.55" />
          {/* mil-dot */}
          {MIL_DOTS.flatMap((d) => [
            <circle key={`e${d}`} cx={48 + d} cy="48" r="0.7" stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.45" />,
            <circle key={`w${d}`} cx={48 - d} cy="48" r="0.7" stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.45" />,
            <circle key={`s${d}`} cx="48" cy={48 + d} r="0.7" stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.45" />,
            <circle key={`n${d}`} cx="48" cy={48 - d} r="0.7" stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.45" />,
          ])}
          {/* 45° 细标线 */}
          {[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((a) => (
            <line
              key={a}
              x1={48 + Math.cos(a) * 16}
              y1={48 + Math.sin(a) * 16}
              x2={48 + Math.cos(a) * 20}
              y2={48 + Math.sin(a) * 20}
              stroke="currentColor"
              strokeWidth="0.4"
              strokeOpacity="0.28"
            />
          ))}
        </svg>
      </div>
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
