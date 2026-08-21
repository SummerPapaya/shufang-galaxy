import { memo, useEffect, useRef } from 'react'
import { seededRandoms } from '../room/utils'

/**
 * <LibraryStarfield> 图书馆背景星野（轻量 canvas，非 WebGL）
 * - 稀疏星星 170 颗，正弦呼吸明暗；最亮的星带十字光芒
 * - 少量金色 / 青色染色星，呼应设计 token
 * - reduced-motion：静态绘制一帧，不闪烁
 */

const STAR_COUNT = 170

interface Star {
  x: number
  y: number
  r: number
  base: number
  speed: number
  phase: number
  /** 0–1：<0.12 金色，<0.2 青色，其余月白 */
  tint: number
}

function makeStars(): Star[] {
  const rand = seededRandoms('starlight-library', STAR_COUNT * 6)
  const stars: Star[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: rand[i * 6] ?? 0,
      y: rand[i * 6 + 1] ?? 0,
      r: 0.4 + (rand[i * 6 + 2] ?? 0) * 1.3,
      base: 0.25 + (rand[i * 6 + 3] ?? 0) * 0.65,
      speed: 0.4 + (rand[i * 6 + 4] ?? 0) * 1.2,
      phase: (rand[i * 6 + 5] ?? 0) * Math.PI * 2,
      tint: rand[i * 6 + 2] ?? 0,
    })
  }
  return stars
}

const STARS = makeStars()

function starColor(tint: number): string {
  if (tint < 0.12) return '#ffd9a0'
  if (tint < 0.2) return '#aee6ff'
  return '#f5f0e6'
}

export default memo(function LibraryStarfield({ reduced }: { reduced: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
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
      for (const s of STARS) {
        const alpha = reduced ? s.base * 0.8 : s.base * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase))
        const x = s.x * w
        const y = s.y * h
        ctx.globalAlpha = Math.max(0.05, Math.min(1, alpha))
        ctx.fillStyle = starColor(s.tint)
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, Math.PI * 2)
        ctx.fill()
        // 亮星十字光芒
        if (s.base > 0.78) {
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
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
})
