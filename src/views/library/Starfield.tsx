import { memo, useEffect, useRef } from 'react'
import { seededRandoms } from '../room/utils'

/**
 * <LibraryStarfield> 图书馆背景星野（轻量 canvas，非 WebGL）
 * - 稀疏星星 + 少量较大星尘；正弦呼吸明暗；最亮的星带十字光芒
 * - 少量金色 / 青色染色星，呼应设计 token
 * - 粒子拨动：鼠标 / 手指滑过时星点被推开并带起切向涟漪，随后弹簧回位
 * - 指针留下一缕金色星尘尾迹 + 邻近星提亮放大，稀疏星野也能读出"被拨动"
 * - reduced-motion：静态绘制一帧，不闪烁也不响应指针
 */

const STAR_COUNT = 340
/** 稍大的近景星尘：位移一眼能看出来 */
const DUST_COUNT = 70
/** 指针影响半径（px） */
const PUSH_RADIUS = 220
/** 推开强度（px） */
const PUSH_STRENGTH = 120
/** 回位弹簧（刚度 / 阻尼） */
const SPRING_K = 16
const SPRING_D = 5.8
/** 被拨动的星额外提亮 / 放大 */
const NEAR_GLOW = 2.1
const NEAR_GROW = 1.15
/** 尾迹采样上限 */
const TRAIL_MAX = 18

interface Star {
  x: number
  y: number
  r: number
  base: number
  speed: number
  phase: number
  /** 0–1：<0.12 金色，<0.2 青色，其余月白 */
  tint: number
  /** 拨动位移与速度（px，绘制时叠加在基准位置上） */
  ox: number
  oy: number
  vx: number
  vy: number
  dust: boolean
}

function makeField(): Star[] {
  const total = STAR_COUNT + DUST_COUNT
  const rand = seededRandoms('starlight-library', total * 6)
  const stars: Star[] = []
  for (let i = 0; i < total; i++) {
    const dust = i >= STAR_COUNT
    stars.push({
      x: rand[i * 6] ?? 0,
      y: rand[i * 6 + 1] ?? 0,
      r: dust ? 1.6 + (rand[i * 6 + 2] ?? 0) * 2.4 : 0.55 + (rand[i * 6 + 2] ?? 0) * 1.5,
      base: dust ? 0.22 + (rand[i * 6 + 3] ?? 0) * 0.28 : 0.28 + (rand[i * 6 + 3] ?? 0) * 0.62,
      speed: 0.4 + (rand[i * 6 + 4] ?? 0) * 1.2,
      phase: (rand[i * 6 + 5] ?? 0) * Math.PI * 2,
      tint: rand[i * 6 + 2] ?? 0,
      ox: 0,
      oy: 0,
      vx: 0,
      vy: 0,
      dust,
    })
  }
  return stars
}

const STARS = makeField()

function starColor(tint: number): string {
  if (tint < 0.12) return '#ffd9a0'
  if (tint < 0.2) return '#aee6ff'
  return '#f5f0e6'
}

function hexAlpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${a})`
}

export default memo(function LibraryStarfield({ reduced }: { reduced: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** 指针位置（px，画布坐标）与由移动速度驱动的强度 */
  const pointer = useRef({ x: -9999, y: -9999, power: 0, inside: false })
  const trail = useRef<{ x: number; y: number; life: number }[]>([])

  /* 指针 / 触摸跟踪：速度越快，拨动越强 */
  useEffect(() => {
    if (reduced) return
    let last: { x: number; y: number } | null = null

    const track = (cx: number, cy: number) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const x = cx - (rect?.left ?? 0)
      const y = cy - (rect?.top ?? 0)
      const w = rect?.width ?? 0
      const h = rect?.height ?? 0
      const inside = x >= 0 && y >= 0 && x <= w && y <= h
      if (last) {
        const speed = Math.hypot(x - last.x, y - last.y)
        pointer.current.power = Math.min(1, pointer.current.power + speed / 55)
      }
      last = { x, y }
      pointer.current.x = x
      pointer.current.y = y
      pointer.current.inside = inside
      if (inside) {
        const t = trail.current
        const prev = t[t.length - 1]
        if (!prev || Math.hypot(prev.x - x, prev.y - y) > 10) {
          t.push({ x, y, life: 1 })
          if (t.length > TRAIL_MAX) t.shift()
        }
      }
    }

    const onPointer = (e: PointerEvent) => track(e.clientX, e.clientY)
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) track(t.clientX, t.clientY)
    }
    const onLeave = () => {
      last = null
      pointer.current.inside = false
    }

    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('pointerleave', onLeave, { passive: true })
    window.addEventListener('touchend', onLeave, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('touchend', onLeave)
    }
  }, [reduced])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let prev = performance.now()

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(draw)
        return
      }
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const t = now / 1000
      // 帧间隔上限 1/30s，避免切后台回来时一次性弹飞
      const dt = Math.min(0.033, Math.max(0.001, (now - prev) / 1000))
      prev = now

      const p = pointer.current
      if (!reduced && p.power > 0) {
        p.power *= Math.pow(0.14, dt)
        if (p.power < 0.002) p.power = 0
      }

      if (!reduced) {
        for (const node of trail.current) node.life *= Math.pow(0.08, dt)
        trail.current = trail.current.filter((node) => node.life > 0.03)
      }

      /* ── 指针尾迹：金色星尘带，稀疏星野上也能读出划过的路径 ── */
      if (!reduced && trail.current.length > 0) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        for (const node of trail.current) {
          const rad = 28 + 36 * node.life
          const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, rad)
          g.addColorStop(0, `rgba(255,217,160,${0.22 * node.life})`)
          g.addColorStop(0.45, `rgba(174,230,255,${0.08 * node.life})`)
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(node.x, node.y, rad, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      /* ── 指针所在处一汪柔光（停手也在，让"手在拨星"持续可读） ── */
      if (!reduced && p.inside) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const glowR = 70 + p.power * 50
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
        g.addColorStop(0, `rgba(255,217,160,${0.16 + p.power * 0.18})`)
        g.addColorStop(0.4, `rgba(174,230,255,${0.07 + p.power * 0.08})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      for (const s of STARS) {
        const alpha = reduced
          ? s.base * 0.8
          : s.base * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase))
        const bx = s.x * w
        const by = s.y * h

        // 指针邻近度 0–1：同时驱动位移与提亮
        let near = 0

        if (!reduced) {
          const dx = bx + s.ox - p.x
          const dy = by + s.oy - p.y
          const dist = Math.hypot(dx, dy)
          if (dist < PUSH_RADIUS && (p.inside || p.power > 0)) {
            const fall = Math.exp(-(dist * dist) / (PUSH_RADIUS * PUSH_RADIUS * 0.36))
            const presence = p.inside ? 0.35 : 0
            near = fall * Math.min(1, presence + p.power)
            if (p.power > 0) {
              const ux = dist > 0.01 ? dx / dist : 0
              const uy = dist > 0.01 ? dy / dist : -1
              const push = near * PUSH_STRENGTH * (s.dust ? 1.35 : 0.7 + s.r * 0.45)
              s.vx += (ux * 0.85 - uy * 0.45) * push * dt * 14
              s.vy += (uy * 0.85 + ux * 0.45) * push * dt * 14
            }
          }
          // 弹簧回位
          s.vx += (-s.ox * SPRING_K - s.vx * SPRING_D) * dt
          s.vy += (-s.oy * SPRING_K - s.vy * SPRING_D) * dt
          s.ox += s.vx * dt
          s.oy += s.vy * dt
        }

        const x = bx + s.ox
        const y = by + s.oy
        const radius = s.r * (1 + NEAR_GROW * near)

        ctx.globalAlpha = Math.max(0.05, Math.min(1, alpha * (1 + NEAR_GLOW * near)))
        ctx.fillStyle = starColor(s.tint)
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()

        // 被拨动 / 邻近的星带一圈柔光
        if (near > 0.08) {
          const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * (s.dust ? 8 : 7))
          const c = starColor(s.tint)
          glow.addColorStop(0, hexAlpha(c, 0.85))
          glow.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.globalAlpha = Math.min(0.7, near * 0.72)
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(x, y, radius * (s.dust ? 8 : 7), 0, Math.PI * 2)
          ctx.fill()
        }
        // 亮星十字光芒
        if (!s.dust && s.base > 0.78) {
          ctx.globalAlpha = Math.max(0.03, alpha * 0.35)
          ctx.lineWidth = 0.6
          ctx.strokeStyle = starColor(s.tint)
          const len = s.r * 4.5
          ctx.beginPath()
          ctx.moveTo(x - len, y)
          ctx.lineTo(x + len, y)
          ctx.moveTo(x, y - len)
          ctx.lineTo(x, y + len)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      if (!reduced) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
})
