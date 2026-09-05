import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Book } from './books'
import { hexToRgba } from '../room/utils'

/**
 * <RingCarousel> 单层 3D 环形书廊（星空图书馆核心交互）
 * - 书脊朝外排在圆环上；手机端默认更小、更靠下，避免顶栏与信息卡叠压
 * - 拖拽 + 惯性；← / → 步进；60 秒 / 圈自动旋转
 * - 手机双指 pinch / spread：缩放书环（约 0.72–1.35）
 * - hover 信息卡：桌面在书脊上方，窄屏改到下方以免顶到标题
 */

const DESKTOP_RADIUS = 450
const MOBILE_RADIUS = 248
const PERSPECTIVE = 1500
const DESKTOP_SPINE_W = 64
const DESKTOP_SPINE_H = 268
const MOBILE_SPINE_W = 46
const MOBILE_SPINE_H = 192
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
const SCALE_MIN = 0.72
const SCALE_MAX = 1.35

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

interface PinchState {
  active: boolean
  startDist: number
  startScale: number
}

function isNarrow(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export default function RingCarousel({ books, reduced, onSelect }: RingCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  /** 当前环角（度），rAF 内唯一真源 */
  const angleRef = useRef(0)
  /** 惯性角速度（度 / 帧，1 帧 = 16.7ms） */
  const velRef = useRef(0)
  /** 方向键步进目标角（null = 无步进） */
  const targetRef = useRef<number | null>(null)
  /** 最近一次交互时间戳（自动旋转 8 秒静默期）；入场先暂停，让正中册停留一会儿 */
  const lastInteractRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0)
  const radiusRef = useRef(isNarrow() ? MOBILE_RADIUS : DESKTOP_RADIUS)
  const scaleRef = useRef(1)
  const pinchRef = useRef<PinchState>({ active: false, startDist: 0, startScale: 1 })
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
  const [narrow, setNarrow] = useState(isNarrow)
  const [ringScale, setRingScale] = useState(1)
  const finePointer = useRef(
    typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
  )

  const setHover = (id: string | null) => {
    hoverRef.current = id
    setHoverId(id)
    if (id) lastInteractRef.current = performance.now()
  }

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const sync = () => {
      const n = mq.matches
      setNarrow(n)
      radiusRef.current = n ? MOBILE_RADIUS : DESKTOP_RADIUS
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  /* ── rAF 主循环：步进 / 惯性 / 自动旋转 + 逐册写入 transform ── */
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const step = 360 / Math.max(1, itemRefs.current.length || 15)

    const paint = () => {
      const els = itemRefs.current
      const radius = radiusRef.current * scaleRef.current
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        if (!el) continue
        const a = angleRef.current + i * step
        const t = Math.min(1, Math.max(0, Math.cos((a * Math.PI) / 180)))
        el.style.transform = `rotateY(${a.toFixed(3)}deg) translateZ(${radius.toFixed(2)}px)`
        el.style.opacity = (0.05 + 0.95 * Math.pow(t, 2.4)).toFixed(3)
        el.style.filter = `brightness(${(0.55 + 0.6 * Math.pow(t, 1.4)).toFixed(3)})`
        el.style.pointerEvents = t <= BACK_T ? 'none' : 'auto'
      }
      if (stageRef.current) {
        const s = scaleRef.current
        stageRef.current.style.transform = `scale(${s.toFixed(3)})`
      }
    }

    const tick = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      const frames = dt / 16.7

      if (dragRef.current.dragging || pinchRef.current.active) {
        // 拖拽 / 双指缩放中角度由手势直接推进
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

  /* ── 滚轮 / 触控板横向滑动：转动书廊 ── */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (delta === 0) return
      e.preventDefault()
      targetRef.current = null
      angleRef.current += delta * 0.06
      velRef.current = velRef.current * 0.6 + delta * 0.004 * 16.7 * 0.4
      lastInteractRef.current = performance.now()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ── 双指 pinch / spread：缩放书环 ── */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      dragRef.current.dragging = false
      pinchRef.current = {
        active: true,
        startDist: dist(e.touches[0], e.touches[1]),
        startScale: scaleRef.current,
      }
      velRef.current = 0
      targetRef.current = null
      lastInteractRef.current = performance.now()
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length !== 2) return
      e.preventDefault()
      const d = dist(e.touches[0], e.touches[1])
      if (pinchRef.current.startDist < 8) return
      const next = clamp(
        pinchRef.current.startScale * (d / pinchRef.current.startDist),
        SCALE_MIN,
        SCALE_MAX,
      )
      scaleRef.current = next
      setRingScale(next)
      lastInteractRef.current = performance.now()
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current.active = false
      lastInteractRef.current = performance.now()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  /* ── 拖拽（pointer drag + 惯性；越过阈值才捕获指针，保住点击） ── */

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pinchRef.current.active) return
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
    if (pinchRef.current.active) return
    const d = dragRef.current
    if (!d.dragging) return
    if (!d.moved && Math.abs(e.clientX - d.startX) > MOVE_THRESHOLD) {
      d.moved = true
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

  const handleBookClick = (book: Book) => {
    if (dragRef.current.moved || pinchRef.current.active) return
    // 触屏也先点亮信息卡，再打开播放器
    setHover(book.id)
    onSelect(book)
  }

  const spineW = narrow ? MOBILE_SPINE_W : DESKTOP_SPINE_W
  const spineH = narrow ? MOBILE_SPINE_H : DESKTOP_SPINE_H
  const stageTop = narrow ? '56%' : '48%'

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={`星空书廊，当前缩放 ${Math.round(ringScale * 100)}%`}
    >
      {/* 3D 舞台：手机更靠下，给顶栏与信息卡留空 */}
      <div
        className="absolute left-1/2 h-0 w-0"
        style={{ top: stageTop, perspective: `${PERSPECTIVE}px` }}
      >
        <div
          ref={stageRef}
          className="absolute left-0 top-0 h-0 w-0"
          style={{ transformStyle: 'preserve-3d', transformOrigin: 'center center' }}
        >
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
                  width: spineW,
                  height: spineH,
                  marginLeft: -spineW / 2,
                  marginTop: -spineH / 2,
                  willChange: 'transform, opacity, filter',
                }}
              >
                <span
                  aria-hidden
                  className="absolute -bottom-14 left-1/2 block h-7 w-[170px] -translate-x-1/2 rounded-full blur-lg"
                  style={{
                    background: `radial-gradient(ellipse at center, ${hexToRgba(c, hover ? 0.55 : 0.38)} 0%, transparent 70%)`,
                    transition: 'background 300ms ease',
                  }}
                />

                <div
                  className="relative h-full w-full"
                  style={{
                    transform: floated ? 'translateY(-18px)' : 'translateY(0)',
                    transition: reduced
                      ? 'none'
                      : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {/* 信息卡：手机端在书脊上方（书环已下移，避开顶栏与播放器） */}
                  <div
                    aria-hidden={!hover}
                    className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 w-[170px] sm:mb-4 sm:w-[190px]"
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
                      <p className="font-serif text-[13px] leading-snug text-starlight sm:text-[14px]">
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
                      {book.externalUrl && (
                        <a
                          href={book.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-cursor="interactive"
                          data-cursor-color={c}
                          className="pointer-events-auto mt-2 inline-flex items-center gap-1 font-hud text-[10px] tracking-[0.12em] text-gold transition-colors hover:text-starlight"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          打开官网特辑页
                          <span aria-hidden>↗</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={`《${book.title}》，${book.author} 著，${book.reader} 朗读，点击开始聆听`}
                    data-cursor="interactive"
                    data-cursor-color={c}
                    onClick={() => handleBookClick(book)}
                    onMouseEnter={() => {
                      if (finePointer.current) setHover(book.id)
                    }}
                    onMouseLeave={() => {
                      if (finePointer.current) setHover(null)
                    }}
                    onFocus={() => {
                      if (finePointer.current) setHover(book.id)
                    }}
                    onBlur={() => {
                      if (finePointer.current) setHover(null)
                    }}
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
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(90deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 22%, rgba(0,0,0,0.06) 62%, rgba(0,0,0,0.22) 100%)',
                      }}
                    />
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
                    <span
                      className="absolute inset-0 flex items-center justify-between px-0 py-[16px] sm:py-[22px]"
                      style={{ writingMode: 'vertical-rl', flexDirection: 'row' }}
                    >
                      <span
                        className="font-serif font-medium tracking-[0.18em] text-starlight whitespace-nowrap"
                        style={{ fontSize: narrow ? 11 : 13, lineHeight: 1 }}
                      >
                        {book.title}
                      </span>
                      <span
                        className="font-hud tracking-[0.12em] text-starlight-dim whitespace-nowrap"
                        style={{ fontSize: narrow ? 8 : 9, lineHeight: 1 }}
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
