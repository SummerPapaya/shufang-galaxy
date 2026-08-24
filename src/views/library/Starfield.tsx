import { memo, useEffect, useRef } from 'react'
import { seededRandoms } from '../room/utils'

/**
 * <LibraryStarfield> 图书馆背景星野（轻量 canvas）
 *
 * 自然星空氛围（非指针拨动）：
 * - 远 / 近两层星点，以不同角速度缓慢漂移，形成轻视差
 * - 正弦呼吸明暗 + 亮星十字光芒
 * - 偶尔划过的流星（稀疏、慢、淡金）
 * - reduced-motion：静态一帧
 */

const FAR_COUNT = 140
const NEAR_COUNT = 70

interface Star {
  x: number
  y: number
  r: number
  base: number
  speed: number
  phase: number
  tint: number
  /** 视差层：远慢近快 */
  layer: 'far' | 'near'
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

function makeStars(): Star[] {
  const total = FAR_COUNT + NEAR_COUNT
  const rand = seededRandoms('starlight-library-v2', total * 6)
  const stars: Star[] = []
  for (let i = 0; i < total; i++) {
    const near = i >= FAR_COUNT
    stars.push({
      x: rand[i * 6] ?? 0,
      y: rand[i * 6 + 1] ?? 0,
      r: near ? 0.7 + (rand[i * 6 + 2] ?? 0) * 1.6 : 0.35 + (rand[i * 6 + 2] ?? 0) * 1.1,
      base: near ? 0.35 + (rand[i * 6 + 3] ?? 0) * 0.55 : 0.2 + (rand[i * 6 + 3] ?? 0) * 0.5,
      speed: 0.35 + (rand[i * 6 + 4] ?? 0) * 1.1,
      phase: (rand[i * 6 + 5] ?? 0) * Math.PI * 2,
      tint: rand[i * 6 + 2] ?? 0,
      layer: near ? 'near' : 'far',
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
    let meteor: Meteor | null = null
    let nextMeteorAt = performance.now() + 4200

    const spawnMeteor = (w: number, h: number) => {
      const fromLeft = Math.random() > 0.45
      meteor = {
        x: fromLeft ? -20 : w * (0.2 + Math.random() * 0.5),
        y: h * (0.05 + Math.random() * 0.35),
        vx: fromLeft ? 180 + Math.random() * 120 : 140 + Math.random() * 100,
        vy: 70 + Math.random() * 50,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.5,
      }
    }

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
        const alpha = reduced
          ? s.base * 0.8
          : s.base * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase))
        // 缓慢漂移：远层慢、近层稍快，形成轻视差（不做指针交互）
        const driftAmp = s.layer === 'near' ? 10 : 4
        const driftSpeed = s.layer === 'near' ? 0.045 : 0.02
        const dx = reduced ? 0 : Math.sin(t * driftSpeed + s.phase) * driftAmp
        const dy = reduced ? 0 : Math.cos(t * driftSpeed * 0.85 + s.phase * 1.3) * driftAmp * 0.55
        const x = ((s.x * w + dx) % w + w) % w
        const y = ((s.y * h + dy) % h + h) % h

        ctx.globalAlpha = Math.max(0.05, Math.min(1, alpha))
        ctx.fillStyle = starColor(s.tint)
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, Math.PI * 2)
        ctx.fill()

        if (s.base > 0.78) {
          ctx.globalAlpha = Math.max(0.03, alpha * 0.32)
          ctx.lineWidth = 0.55
          ctx.strokeStyle = starColor(s.tint)
          const len = s.r * 4.2
          ctx.beginPath()
          ctx.moveTo(x - len, y)
          ctx.lineTo(x + len, y)
          ctx.moveTo(x, y - len)
          ctx.lineTo(x, y + len)
          ctx.stroke()
        }
      }

      if (!reduced) {
        if (!meteor && now >= nextMeteorAt) {
          spawnMeteor(w, h)
          nextMeteorAt = now + 5500 + Math.random() * 7000
        }
        if (meteor) {
          const dt = 1 / 60
          meteor.life += dt
          meteor.x += meteor.vx * dt
          meteor.y += meteor.vy * dt
          const fade = 1 - meteor.life / meteor.maxLife
          if (fade <= 0 || meteor.x > w + 40 || meteor.y > h + 40) {
            meteor = null
          } else {
            const len = 36 + 28 * fade
            const ang = Math.atan2(meteor.vy, meteor.vx)
            ctx.save()
            ctx.globalCompositeOperation = 'lighter'
            ctx.strokeStyle = `rgba(255,217,160,${0.45 * fade})`
            ctx.lineWidth = 1.2
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(meteor.x, meteor.y)
            ctx.lineTo(meteor.x - Math.cos(ang) * len, meteor.y - Math.sin(ang) * len)
            ctx.stroke()
            ctx.fillStyle = `rgba(245,240,230,${0.7 * fade})`
            ctx.beginPath()
            ctx.arc(meteor.x, meteor.y, 1.4, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
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
