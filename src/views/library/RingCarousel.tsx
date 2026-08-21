import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Book } from './books'
import { hexToRgba } from '../room/utils'

/**
 * <RingCarousel> 单层 3D 环形书廊（星空图书馆核心交互）
 * - 15 册书脊朝外排在圆环上：rotateY(i * 24deg) translateZ(430px)，容器 perspective 1500px
 * - rAF 驱动：每帧直接写 DOM transform / opacity / filter，不经过 React setState
 * - 拖拽 + 惯性（速度每帧 ×0.93）；← / → 方向键步进一册；
 *   60 秒 / 圈自动旋转，任意交互后暂停 8 秒恢复
 * - 每帧按 cos 衰减：opacity = 0.05 + 0.95·t^2.4，brightness = 0.55 + 0.6·t^1.4
 *   （t = cos(与正面夹角) clamp 到 [0,1]），背面的书 pointer-events: none
 * - 每册底部 starColor 地面辉光；hover 向上漂浮 + 信息卡；moved-flag 区分拖拽与点击
 * - 无外框书架；reduced-motion：关闭漂浮与自动旋转（方向键改为瞬时步进），保留全部功能
 */

const RADIUS = 430
const PERSPECTIVE = 1500
const SPINE_W = 58
const SPINE_H = 216
/** 拖拽像素 → 角度（度 / px） */
const DEG_PER_PX = 0.22
/** 惯性摩擦：速度每帧 ×0.93 */
const FRICTION = 0.93
/** 自动旋转角速度：60 秒 / 圈 */
const AUTO_DEG_PER_MS = 360 / 60000
/** 交互后暂停自动旋转的时长 */
const RESUME_MS = 8000
/** 拖拽 / 点击判定阈值（px） */
const MOVE_THRESHOLD = 6
/** 背面判定：t 小于该值时禁用指针事件 */
const BACK_T = 0.02

interface RingCarouselProps {
  books: Book[]
  reduced: boolean
  onSelect: (book: Book) => void
}

interface DragState {
  dragging: boolean
  moved: boolean
  pointerId: number
  el: HTMLDivElement | null
  startX: number
  lastX: number
  lastT: number
}

export default function RingCarousel({ books, reduced, onSelect }: RingCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  /** 当前环角（度），rAF 内唯一真源 */
  const angleRef = useRef(0)
  /** 惯性角速度（度 / 帧，1 帧 = 16.7ms） */
  const velRef = useRef(0)
  /** 方向键步进目标角（null = 无步进） */
  const targetRef = useRef<number | null>(null)
  /** 最近一次交互时间戳（自动旋转 8 秒静默期） */
  const lastInteractRef = useRef(-1e9)
  const dragRef = useRef<DragState>({
    dragging: false,
    moved: false,
    pointerId: -1,
    el: null,
    startX: 0,
    lastX: 0,
    lastT: 0,
  })
  const hoverRef = useRef<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const setHover = (id: string | null) => {
    hoverRef.current = id
    setHoverId(id)
    if (id) lastInteractRef.current = performance.now()
  }

  /* ── rAF 主循环：步进 / 惯性 / 自动旋转 + 逐册写入 transform ── */
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const step = 360 / Math.max(1, itemRefs.current.length || 15)

    const paint = () => {
      const els = itemRefs.current
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        if (!el) continue
        const a = angleRef.current + i * step
        const t = Math.min(1, Math.max(0, Math.cos((a * Math.PI) / 180)))
        el.style.transform = `rotateY(${a.toFixed(3)}deg) translateZ(${RADIUS}px)`
        el.style.opacity = (0.05 + 0.95 * Math.pow(t, 2.4)).toFixed(3)
        el.style.filter = `brightness(${(0.55 + 0.6 * Math.pow(t, 1.4)).toFixed(3)})`
        el.style.pointerEvents = t <= BACK_T ? 'none' : 'auto'
      }
    }

    const tick = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      const frames = dt / 16.7

      if (dragRef.current.dragging) {
        // 拖拽中角度由 pointermove 直接推进
      } else if (targetRef.current != null) {
        const diff = targetRef.current - angleRef.current
        angleRef.current += diff * Math.min(1, 0.16 * frames)
        if (Math.abs(diff) < 0.05) {
          angleRef.current = targetRef.current
          targetRef.current = null
        }
      } else {
        if (Math.abs(velRef.current) > 0.02) {
          angleRef.current += velRef.current * frames
          velRef.current *= Math.pow(FRICTION, frames)
        } else {
          velRef.current = 0
        }
        if (
          !reduced &&
          hoverRef.current == null &&
          now - lastInteractRef.current > RESUME_MS
        ) {
          angleRef.current -= AUTO_DEG_PER_MS * dt
        }
      }

      paint()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  /* ── 方向键：← / → 步进一册 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const step = 360 / Math.max(1, books.length)
      const a = angleRef.current
      // floor / ceil 保证跨越任意中间态都完整步进一册
      const to =
        e.key === 'ArrowLeft'
          ? Math.floor(a / step) * step + step
          : Math.ceil(a / step) * step - step
      velRef.current = 0
      lastInteractRef.current = performance.now()
      if (reduced) {
        angleRef.current = to
        targetRef.current = null
      } else {
        targetRef.current = to
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [books.length, reduced])

  /* ── 滚轮 / 触控板横向滑动：转动书廊（R3） ──
   * 原生监听 + passive:false：preventDefault 阻止浏览器横向导航手势 */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (delta === 0) return
      e.preventDefault()
      targetRef.current = null
      angleRef.current += delta * 0.06
      // 给一点惯性余韵
      velRef.current = velRef.current * 0.6 + delta * 0.004 * 16.7 * 0.4
      lastInteractRef.current = performance.now()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ── 拖拽（pointer drag + 惯性；越过阈值才捕获指针，保住点击） ── */

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const d = dragRef.current
    d.dragging = true
    d.moved = false
    d.pointerId = e.pointerId
    d.el = e.currentTarget
    d.startX = e.clientX
    d.lastX = e.clientX
    d.lastT = performance.now()
    velRef.current = 0
    targetRef.current = null
    lastInteractRef.current = performance.now()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d.dragging) return
    if (!d.moved && Math.abs(e.clientX - d.startX) > MOVE_THRESHOLD) {
      d.moved = true
      // 确认是拖拽后才捕获指针：未拖拽时 click 照常落到书脊按钮上
      try {
        d.el?.setPointerCapture(d.pointerId)
      } catch {
        /* 指针可能已释放 */
      }
    }
    const now = performance.now()
    const dt = now - d.lastT
    const dx = e.clientX - d.lastX
    angleRef.current += dx * DEG_PER_PX
    if (dt > 0) {
      const v = ((dx * DEG_PER_PX) / dt) * 16.7
      velRef.current = velRef.current * 0.5 + v * 0.5
      d.lastX = e.clientX
      d.lastT = now
    }
    lastInteractRef.current = now
  }

  const onPointerUp = () => {
    const d = dragRef.current
    if (!d.dragging) return
    d.dragging = false
    lastInteractRef.current = performance.now()
    if (reduced || !d.moved) velRef.current = 0
  }

  /* ── 点击选书（拖拽刚结束时抑制） ── */
  const handleBookClick = (book: Book) => {
    if (dragRef.current.moved) return
    onSelect(book)
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 3D 舞台：环形书廊中心约在页面 top-[46%] */}
      <div
        className="absolute left-1/2 top-[46%] h-0 w-0"
        style={{ perspective: `${PERSPECTIVE}px` }}
      >
        <div className="absolute left-0 top-0 h-0 w-0" style={{ transformStyle: 'preserve-3d' }}>
          {books.map((book, i) => {
            const c = book.starColor
            const hover = hoverId === book.id
            const floated = hover && !reduced
            return (
              <div
                key={book.id}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                className="absolute"
                style={{
                  width: SPINE_W,
                  height: SPINE_H,
                  marginLeft: -SPINE_W / 2,
                  marginTop: -SPINE_H / 2,
                  willChange: 'transform, opacity, filter',
                }}
              >
                {/* 地面辉光（随书一同绕环） */}
                <span
                  aria-hidden
                  className="absolute -bottom-14 left-1/2 block h-7 w-[170px] -translate-x-1/2 rounded-full blur-lg"
                  style={{
                    background: `radial-gradient(ellipse at center, ${hexToRgba(c, hover ? 0.55 : 0.38)} 0%, transparent 70%)`,
                    transition: 'background 300ms ease',
                  }}
                />

                {/* 漂浮层（hover 上浮；rAF 只写外层 transform，互不冲突） */}
                <div
                  className="relative h-full w-full"
                  style={{
                    transform: floated ? 'translateY(-18px)' : 'translateY(0)',
                    transition: reduced
                      ? 'none'
                      : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {/* 悬停信息卡 */}
                  <div
                    aria-hidden={!hover}
                    className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-4 w-[190px]"
                    style={{
                      opacity: hover ? 1 : 0,
                      transform: `translateX(-50%) translateY(${hover ? 0 : 8}px)`,
                      transition: 'opacity 200ms ease, transform 200ms ease',
                    }}
                  >
                    <div
                      className="glass-panel rounded-md border p-3 backdrop-blur-md"
                      style={{
                        borderColor: 'rgba(245,240,230,0.18)',
                        boxShadow: `0 0 24px ${hexToRgba(c, 0.18)}`,
                      }}
                    >
                      <p className="font-serif text-[14px] leading-snug text-starlight">
                        《{book.title}》
                      </p>
                      <p className="mt-1 text-[11px] text-starlight-dim">{book.author} 著</p>
                      <p className="mt-1.5 flex items-center gap-1.5 font-hud text-[10px] tracking-[0.14em] text-starlight-dim">
                        <span
                          aria-hidden
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: c, boxShadow: `0 0 6px ${hexToRgba(c, 0.8)}` }}
                        />
                        朗读 · {book.reader}
                      </p>
                    </div>
                  </div>

                  {/* 书脊：半透明星光质感，无外框书架 */}
                  <button
                    type="button"
                    aria-label={`《${book.title}》，${book.author} 著，${book.reader} 朗读，点击开始聆听`}
                    data-cursor="interactive"
                    data-cursor-color={c}
                    onClick={() => handleBookClick(book)}
                    onMouseEnter={() => setHover(book.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(book.id)}
                    onBlur={() => setHover(null)}
                    className="relative block h-full w-full overflow-hidden rounded-[4px] border outline-none backdrop-blur-sm"
                    style={{
                      borderColor: hover ? hexToRgba(c, 0.55) : 'rgba(245,240,230,0.18)',
                      background: `linear-gradient(180deg, ${hexToRgba(c, 0.3)} 0%, ${hexToRgba(c, 0.14)} 48%, ${hexToRgba(c, 0.05)} 100%)`,
                      boxShadow: hover
                        ? `0 0 26px ${hexToRgba(c, 0.5)}, 0 0 60px ${hexToRgba(c, 0.22)}`
                        : `0 0 12px ${hexToRgba(c, 0.16)}`,
                      transition:
                        'border-color 240ms ease, box-shadow 240ms ease, background 240ms ease',
                    }}
                  >
                    {/* 圆柱光泽叠加（左高光 / 右落影） */}
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(90deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 22%, rgba(0,0,0,0.06) 62%, rgba(0,0,0,0.22) 100%)',
                      }}
                    />
                    {/* 顶部 / 底部烫金细线 */}
                    <span
                      aria-hidden
                      className="absolute left-[6px] right-[6px] top-[10px] h-px"
                      style={{ background: 'rgba(245,240,230,0.22)' }}
                    />
                    <span
                      aria-hidden
                      className="absolute bottom-[10px] left-[6px] right-[6px] h-px"
                      style={{ background: 'rgba(245,240,230,0.22)' }}
                    />
                    {/* 竖排书名 + 作者 */}
                    <span
                      className="absolute inset-0 flex items-center justify-between px-0 py-[18px]"
                      style={{ writingMode: 'vertical-rl', flexDirection: 'row' }}
                    >
                      <span
                        className="font-serif font-medium tracking-[0.2em] text-starlight"
                        style={{ fontSize: 13, lineHeight: 1 }}
                      >
                        {book.title}
                      </span>
                      <span
                        className="font-hud tracking-[0.12em] text-starlight-dim"
                        style={{ fontSize: 9, lineHeight: 1 }}
                      >
                        {book.author}
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
