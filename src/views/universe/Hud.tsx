import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { UniverseControls } from './controls'

/**
 * 星空漫游 HUD（universe.md §2，DOM 覆盖层，pointer-events-none）
 * - Crosshair：光学瞄准镜 Duplex 分划（目镜晕影 + 粗外柱收细十字丝 + mil 刻），
 *   准星附近 60px 内有书房星投影时分划淡染 starColor（rAF 直写 style）
 * - CompassStrip：右下罗盘刻度带（每 15° 刻线，四象星宿名，金色三角指针随 yaw 滚动）
 * - HintBar：左下操作提示，入场 6s 后降至 40% 透明度
 * 入场：0.5s 起依序淡入（stagger 150ms，y +10→0）。
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const RETICLE_IDLE = 'rgba(245, 240, 230, 0.2)'

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

/* ── 中央准星：光学瞄准镜 Duplex ─────────────────── */

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
        el.style.color = color ? hexToRgba(color, 0.32) : RETICLE_IDLE
        el.style.scale = color ? '1.03' : '1'
        el.style.filter = color ? `drop-shadow(0 0 4px ${hexToRgba(color, 0.22)})` : 'none'
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
        className="crosshair-reticle relative h-[128px] w-[128px] text-[rgba(245,240,230,0.2)] transition-[scale,filter,color] duration-200"
      >
        <svg className="absolute inset-0" viewBox="0 0 120 120" fill="none">
          <defs>
            <radialGradient id="scope-vignette" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#030510" stop-opacity="0" />
              <stop offset="58%" stop-color="#030510" stop-opacity="0" />
              <stop offset="86%" stop-color="#030510" stop-opacity="0.14" />
              <stop offset="100%" stop-color="#030510" stop-opacity="0.32" />
            </radialGradient>
            <clipPath id="scope-fov">
              <circle cx="60" cy="60" r="56" />
            </clipPath>
          </defs>

          {/* 目镜圆视场 + 边缘晕影（中间完全透出星空） */}
          <circle cx="60" cy="60" r="56" fill="url(#scope-vignette)" />
          <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.38" />
          <circle cx="60" cy="60" r="53.5" stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.18" />
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
            const inner = major ? 56.4 : 57.2
            const outer = 59.2
            return (
              <line
                key={i}
                x1={60 + Math.cos(a) * inner}
                y1={60 + Math.sin(a) * inner}
                x2={60 + Math.cos(a) * outer}
                y2={60 + Math.sin(a) * outer}
                stroke="currentColor"
                strokeOpacity={major ? 0.4 : 0.16}
                strokeWidth={major ? 0.7 : 0.35}
              />
            )
          })}
        </svg>

        {/* Duplex 分划：粗外柱 → 细十字丝，中心开口 */}
        <svg className="absolute inset-0" viewBox="0 0 120 120" fill="none" clipPath="url(#scope-fov)">
          {/* 粗柱（从视场边缘收到约 1/3） */}
          <line x1="6" y1="60" x2="38" y2="60" stroke="currentColor" strokeWidth="3.2" strokeLinecap="butt" strokeOpacity="0.42" />
          <line x1="82" y1="60" x2="114" y2="60" stroke="currentColor" strokeWidth="3.2" strokeLinecap="butt" strokeOpacity="0.42" />
          <line x1="60" y1="6" x2="60" y2="38" stroke="currentColor" strokeWidth="3.2" strokeLinecap="butt" strokeOpacity="0.42" />
          <line x1="60" y1="82" x2="60" y2="114" stroke="currentColor" strokeWidth="3.2" strokeLinecap="butt" strokeOpacity="0.42" />
          {/* 细丝（接到开口前） */}
          <line x1="38" y1="60" x2="55.5" y2="60" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.5" />
          <line x1="64.5" y1="60" x2="82" y2="60" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.5" />
          <line x1="60" y1="38" x2="60" y2="55.5" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.5" />
          <line x1="60" y1="64.5" x2="60" y2="82" stroke="currentColor" strokeWidth="0.45" strokeOpacity="0.5" />
          {/* mil 横刻 */}
          {MIL.flatMap((d) => {
            const tick = 1.6
            return [
              <line key={`h${d}`} x1={60 + d} y1={60 - tick} x2={60 + d} y2={60 + tick} stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.4" />,
              <line key={`h-${d}`} x1={60 - d} y1={60 - tick} x2={60 - d} y2={60 + tick} stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.4" />,
              <line key={`v${d}`} x1={60 - tick} y1={60 + d} x2={60 + tick} y2={60 + d} stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.4" />,
              <line key={`v-${d}`} x1={60 - tick} y1={60 - d} x2={60 + tick} y2={60 - d} stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.4" />,
            ]
          })}
          {/* 下丝额外距离刻（BDC） */}
          {[11, 17, 23].map((d) => (
            <line
              key={`bdc${d}`}
              x1={60 - 2.6}
              y1={60 + d}
              x2={60 + 2.6}
              y2={60 + d}
              stroke="currentColor"
              strokeWidth="0.35"
              strokeOpacity="0.32"
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
