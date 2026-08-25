import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { UniverseControls } from './controls'

/**
 * 星空漫游 HUD（universe.md §2，DOM 覆盖层，pointer-events-none）
 * - Crosshair：固定于画面正中的第一版望远镜十字分划（外环刻度 + 水平十字丝）；
 *   静止时横丝水平；左右转视角时整组轻微倾转；掠过书房星时着色锁定
 * - CompassStrip：罗盘刻度带（每 15° 刻线，四象星宿名，金色三角指针随 yaw 滚动）
 * - HintBar：操作提示；手机端在罗盘下方居中，桌面在左下；入场 6s 后降至 40% 透明度
 * 入场：0.5s 起依序淡入（stagger 150ms，y +10→0）。
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const RETICLE_IDLE = 'rgba(245, 240, 230, 0.2)'
const RETICLE_AIM_ALPHA = 0.28
/** 左右扫视时准星最大倾角（度） */
const BANK_MAX_DEG = 6.5
/** yaw 角速度（弧度/帧）→ 倾角的放大系数 */
const BANK_GAIN = 95
const BANK_SMOOTH = 0.14

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex
  const n = Number.parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

/* ── 中央准星：望远镜十字分划 + 扫视倾转 ─────────── */

export function Crosshair({ controls }: { controls: UniverseControls }) {
  const reticleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastColor: string | null | undefined = undefined
    let lastYaw = controls.yaw
    let bankDeg = 0

    const tick = () => {
      const el = reticleRef.current
      if (!el) {
        raf = requestAnimationFrame(tick)
        return
      }

      const color = controls.aimColor
      if (color !== lastColor) {
        lastColor = color
        el.style.color = color ? hexToRgba(color, RETICLE_AIM_ALPHA) : RETICLE_IDLE
        el.dataset.locked = color ? 'true' : 'false'
      }

      const dyaw = controls.yaw - lastYaw
      lastYaw = controls.yaw
      // yaw 增大 = 左转；倾转方向与扫视相反，像机身带着镜筒甩了一下
      const targetBank = REDUCED_MOTION
        ? 0
        : clamp(-dyaw * BANK_GAIN, -BANK_MAX_DEG, BANK_MAX_DEG)
      bankDeg += (targetBank - bankDeg) * BANK_SMOOTH
      if (Math.abs(bankDeg) < 0.02 && targetBank === 0) bankDeg = 0

      const scale = color ? 1.08 : 1
      el.style.transform = `rotate(${bankDeg.toFixed(3)}deg) scale(${scale})`
      el.style.filter = color ? `drop-shadow(0 0 6px ${hexToRgba(color, 0.22)})` : 'none'

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
        className="crosshair-reticle relative h-[72px] w-[72px] text-[rgba(245,240,230,0.2)] will-change-transform"
        style={{ transform: 'rotate(0deg) scale(1)' }}
      >
        {/* 外环刻度：慢转；十字丝本身保持相对水平，只随扫视倾转 */}
        <svg
          className={REDUCED_MOTION ? 'absolute inset-0' : 'crosshair-reticle-spin absolute inset-0'}
          viewBox="0 0 72 72"
          fill="none"
        >
          <circle cx="36" cy="36" r="33" stroke="currentColor" strokeWidth="0.75" strokeOpacity="0.35" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2
            const major = i % 3 === 0
            const inner = major ? 28 : 30.5
            const outer = 33
            return (
              <line
                key={i}
                x1={36 + Math.cos(a) * inner}
                y1={36 + Math.sin(a) * inner}
                x2={36 + Math.cos(a) * outer}
                y2={36 + Math.sin(a) * outer}
                stroke="currentColor"
                strokeOpacity={major ? 0.4 : 0.22}
                strokeWidth={major ? 1.1 : 0.7}
                strokeLinecap="square"
              />
            )
          })}
        </svg>

        {/* 静止十字丝：横丝水平、中心留空 */}
        <svg className="absolute inset-0" viewBox="0 0 72 72" fill="none">
          <circle cx="36" cy="36" r="11" stroke="currentColor" strokeWidth="0.85" strokeOpacity="0.4" />
          <line x1="3" y1="36" x2="25" y2="36" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.5" />
          <line x1="47" y1="36" x2="69" y2="36" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.5" />
          <line x1="36" y1="3" x2="36" y2="25" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.5" />
          <line x1="36" y1="47" x2="36" y2="69" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.5" />
          <line x1="20" y1="36" x2="24" y2="36" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.55" />
          <line x1="48" y1="36" x2="52" y2="36" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.55" />
          <line x1="36" y1="20" x2="36" y2="24" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.55" />
          <line x1="36" y1="48" x2="36" y2="52" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.55" />
          <circle cx="36" cy="36" r="1.15" fill="currentColor" fillOpacity="0.55" />
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
      className="pointer-events-none fixed z-10 bottom-[4.75rem] left-1/2 -translate-x-1/2 sm:bottom-6 sm:left-auto sm:right-[132px] sm:translate-x-0"
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

/* ── 操作提示：手机端置于罗盘下方居中，避免与刻度带叠字 ── */

export function HintBar() {
  const [dimmed, setDimmed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDimmed(true), 6000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <motion.p
      className="pointer-events-none fixed inset-x-0 z-10 px-4 text-center font-hud text-[10px] uppercase tracking-[0.16em] text-starlight-faint bottom-[max(1.1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:px-0 sm:text-left sm:text-[11px] sm:tracking-[0.22em]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: dimmed ? 0.4 : 1, y: 0 }}
      transition={{
        opacity: { duration: dimmed ? 1.2 : 0.5, ease: 'easeOut' },
        y: { duration: 0.5, delay: 0.8, ease: EASE },
      }}
    >
      <span className="sm:hidden">拖动环顾 · 点击星星进入书房</span>
      <span className="hidden sm:inline">拖动环顾 · 方向键旋转 · 点击星星进入书房</span>
    </motion.p>
  )
}
