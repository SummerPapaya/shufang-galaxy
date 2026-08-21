import { useEffect, useRef } from 'react'
import { REDUCED_MOTION } from './controls'

/**
 * 星尘光标（universe 视图内）：鼠标轨迹洒落细小星尘碎屑。
 * - canvas overlay（pointer-events: none，不干扰星星 raycast 悬停/点击）
 * - 月白（--starlight）/ 暖金（--gold）小光点，0.6–1.2s 内淡出并缩小消失
 * - 节流生成（≥24ms/次），存活粒子上限 60；无粒子时 rAF 循环自动停摆
 * - prefers-reduced-motion：不挂载
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  /** rgb 三元组（月白 / 暖金） */
  color: string
}

const MAX_PARTICLES = 60
const SPAWN_INTERVAL = 24 // ms
const C_STARLIGHT = '245,240,230'
const C_GOLD = '255,217,160'

export default function StardustCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (REDUCED_MOTION) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
    }
    resize()

    const pool: Particle[] = []
    let raf = 0
    let running = false
    let lastSpawn = 0
    let prev = performance.now()

    const clear = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now
      clear()
      for (let i = pool.length - 1; i >= 0; i--) {
        const p = pool[i]
        p.age += dt
        if (p.age >= p.life) {
          pool.splice(i, 1)
          continue
        }
        p.x += p.vx * dt
        p.y += p.vy * dt
        const k = 1 - p.age / p.life // 1 → 0
        const s = p.size * (0.35 + 0.65 * k)
        ctx.beginPath()
        ctx.fillStyle = `rgba(${p.color},${(k * k * 0.9).toFixed(3)})`
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2)
        ctx.fill()
      }
      if (pool.length > 0) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
        clear()
      }
    }

    const onMove = (e: PointerEvent) => {
      const now = performance.now()
      if (now - lastSpawn < SPAWN_INTERVAL) return
      lastSpawn = now
      // 每次 1–2 粒，轨迹上自然散布
      const n = Math.random() < 0.4 ? 2 : 1
      for (let i = 0; i < n; i++) {
        if (pool.length >= MAX_PARTICLES) pool.shift()
        pool.push({
          x: e.clientX + (Math.random() - 0.5) * 8,
          y: e.clientY + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 16,
          vy: (Math.random() - 0.5) * 16 - 5,
          age: 0,
          life: 0.6 + Math.random() * 0.6,
          size: 0.8 + Math.random() * 1.7,
          color: Math.random() < 0.68 ? C_STARLIGHT : C_GOLD,
        })
      }
      if (!running) {
        running = true
        prev = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
    }
  }, [])

  if (REDUCED_MOTION) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 8,
      }}
    />
  )
}
