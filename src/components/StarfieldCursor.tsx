import { useEffect, useRef } from 'react'

/**
 * <StarfieldCursor> 自定义光标（design.md §6 / §7.1）
 *
 * - 仅 `pointer: fine` 设备启用；启用时给 <html> 加 .has-starfield-cursor 隐藏原生光标
 * - 双层：6px 实心月白点 + 28px 描边圆环
 * - 悬停可交互物（`[data-cursor="interactive"]`、`a`、`button`、`[role="button"]`）
 *   圆环放大至 44px；可用 `data-cursor-color="#ffb3c8"` 染上目标 starColor
 * - 纯 DOM 操作，不触发 React 重渲染
 */
export default function StarfieldCursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)')
    if (!fine.matches) return

    const dot = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    document.documentElement.classList.add('has-starfield-cursor')

    let x = -100
    let y = -100
    let ringX = -100
    let ringY = -100
    let visible = false
    let hovering = false
    let hoverColor = 'var(--gold)'
    let raf = 0

    const onMove = (e: MouseEvent) => {
      x = e.clientX
      y = e.clientY
      if (!visible) {
        visible = true
        dot.style.opacity = '1'
        ring.style.opacity = '1'
      }
      const target = e.target as Element | null
      const interactive = target?.closest?.(
        '[data-cursor="interactive"], a, button, [role="button"]',
      ) as HTMLElement | null
      hovering = !!interactive
      hoverColor = interactive?.dataset.cursorColor || 'var(--gold)'
    }

    const onLeave = () => {
      visible = false
      dot.style.opacity = '0'
      ring.style.opacity = '0'
    }

    const loop = () => {
      // 圆环滞后跟随（lerp），光点即时
      ringX += (x - ringX) * 0.18
      ringY += (y - ringY) * 0.18
      dot.style.transform = `translate(${x - 3}px, ${y - 3}px)`
      const size = hovering ? 44 : 28
      ring.style.width = `${size}px`
      ring.style.height = `${size}px`
      ring.style.transform = `translate(${ringX - size / 2}px, ${ringY - size / 2}px)`
      ring.style.borderColor = hovering ? hoverColor : 'rgba(245, 240, 230, 0.55)'
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    raf = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
      document.documentElement.classList.remove('has-starfield-cursor')
    }
  }, [])

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[9999] opacity-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--starlight)',
          boxShadow: '0 0 8px rgba(245, 240, 230, 0.8)',
        }}
      />
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[9998] opacity-0"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid rgba(245, 240, 230, 0.55)',
          transition: 'width 200ms ease, height 200ms ease, border-color 200ms ease',
        }}
      />
    </>
  )
}
