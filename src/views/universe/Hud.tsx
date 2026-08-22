import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { UniverseControls } from './controls'

/**
 * 星空漫游 HUD（universe.md §2，DOM 覆盖层，pointer-events-none）
 * - Crosshair：光学瞄准镜 German #4（淡目镜晕影 + 三向粗柱收细十字丝），
 *   准星附近 60px 内有书房星投影时分划淡染 starColor（rAF 直写 style）
 * - CompassStrip：右下罗盘刻度带（每 15° 刻线，四象星宿名，金色三角指针随 yaw 滚动）
 * - HintBar：左下操作提示，入场 6s 后降至 40% 透明度
 * 入场：0.5s 起依序淡入（stagger 150ms，y +10→0）。
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const RETICLE_IDLE = 'rgba(245, 240, 230, 0.14)'

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** mil 刻：距中心的距离（viewBox 单位），落在细十字丝上 */
const MIL = [8, 14, 20] as const

/* ── 中央准星：光学瞄准镜 German #4 ──────────────── */

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
        el.style.color = color ? hexToRgba(color, 0.22) : RETICLE_IDLE
        el.style.scale = color ? '1.02' : '1'
        el.style.filter = 'none'
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
        className="crosshair-reticle relative h-[128px] w-[128px] text-[rgba(245,240,230,0.14)] transition-[scale,color] duration-200"
      >
        <svg className="absolute inset-0" viewBox="0 0 120 120" fill="none">
          <defs>
            <radialGradient id="scope-vignette" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#030510" stop-opacity="0" />
              <stop offset="72%" stop-color="#030510" stop-opacity="0" />
              <stop offset="92%" stop-color="#030510" stop-opacity="0.06" />
              <stop offset="100%" stop-color="#030510" stop-opacity="0.14" />
            </radialGradient>
            <clipPath id="scope-fov">
              <circle cx="60" cy="60" r="56" />
            </clipPath>
          </defs>

          {/* 目镜圆视场：中间全透明，只在最外缘收一点暗 */}
          <circle cx="60" cy="60" r="56" fill="url(#scope-vignette)" />
          <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="0.7" strokeOpacity="0.22" />
          <circle cx="60" cy="60" r="54.2" stroke="currentColor" strokeWidth="0.3" strokeOpacity="0.1" />
          {/* 镜片高光：左上很淡的弧，像镀膜反光 */}
          <path
            d="M28 22 A40 40 0 0 1 92 28"
            stroke="currentColor"
            strokeWidth="0.35"
            strokeOpacity="0.1"
            strokeLinecap="round"
          />
        </svg>

        {/* 调焦环刻度：沿目镜外缘慢转 */}
        <svg
          className={REDUCED_MOTION ? 'absolute inset-0' : 'crosshair-reticle-spin absolute inset-0'}
          viewBox="0 0 120 120"
          fill="none"
        >
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2 - Math.PI / 2
            const major = i % 6 === 0
            const inner = major ? 56.6 : 57.4
            const outer = 59.1
            return (
              <line
                key={i}
                x1={60 + Math.cos(a) * inner}
                y1={60 + Math.sin(a) * inner}
                x2={60 + Math.cos(a) * outer}
                y2={60 + Math.sin(a) * outer}
                stroke="currentColor"
                strokeOpacity={major ? 0.22 : 0.08}
                strokeWidth={major ? 0.55 : 0.28}
              />
            )
          })}
        </svg>

        {/* German #4：左/右/下粗柱，上丝只保留细线；中心开口 */}
        <svg className="absolute inset-0" viewBox="0 0 120 120" fill="none" clipPath="url(#scope-fov)">
          <line x1="8" y1="60" x2="40" y2="60" stroke="currentColor" strokeWidth="2.05" strokeLinecap="butt" strokeOpacity="0.26" />
          <line x1="80" y1="60" x2="112" y2="60" stroke="currentColor" strokeWidth="2.05" strokeLinecap="butt" strokeOpacity="0.26" />
          <line x1="60" y1="80" x2="60" y2="112" stroke="currentColor" strokeWidth="2.05" strokeLinecap="butt" strokeOpacity="0.26" />
          <line x1="40" y1="60" x2="55.8" y2="60" stroke="currentColor" strokeWidth="0.32" strokeOpacity="0.32" />
          <line x1="64.2" y1="60" x2="80" y2="60" stroke="currentColor" strokeWidth="0.32" strokeOpacity="0.32" />
          <line x1="60" y1="8" x2="60" y2="55.8" stroke="currentColor" strokeWidth="0.32" strokeOpacity="0.32" />
          <line x1="60" y1="64.2" x2="60" y2="80" stroke="currentColor" strokeWidth="0.32" strokeOpacity="0.32" />
          {MIL.flatMap((d) => {
            const tick = 1.35
            return [
              <line key={`h${d}`} x1={60 + d} y1={60 - tick} x2={60 + d} y2={60 + tick} stroke="currentColor" strokeWidth="0.3" strokeOpacity="0.26" />,
              <line key={`h-${d}`} x1={60 - d} y1={60 - tick} x2={60 - d} y2={60 + tick} stroke="currentColor" strokeWidth="0.3" strokeOpacity="0.26" />,
              <line key={`v${d}`} x1={60 - tick} y1={60 + d} x2={60 + tick} y2={60 + d} stroke="currentColor" strokeWidth="0.3" strokeOpacity="0.26" />,
              <line key={`v-${d}`} x1={60 - tick} y1={60 - d} x2={60 + tick} y2={60 - d} stroke="currentColor" strokeWidth="0.3" strokeOpacity="0.26" />,
            ]
          })}
          {[11, 17, 23].map((d) => (
            <line
              key={`bdc${d}`}
              x1={60 - 2.2}
              y1={60 + d}
              x2={60 + 2.2}
              y2={60 + d}
              stroke="currentColor"
              strokeWidth="0.28"
              strokeOpacity="0.2"
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
