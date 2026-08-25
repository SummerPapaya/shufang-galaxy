import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatEchoTime, useEchoes } from './echoes'
import type { Echo } from './echoes'

/**
 * <EchoField> 宇宙回声 · 漂浮在星空图书馆背景里的留言星
 * - 亮核 + 十字星芒 + 羽化光晕 + 间歇闪光，和背景粒子明显区分
 * - 位置由 id 稳定散列，避开中央书廊
 * - 留言卡根据视口夹紧，避免贴边溢出
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const CARD_PAD = 14

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 把回声安放在画面边缘带，避开中央环形书廊 */
export function placeEcho(echo: Echo, index = 0): { x: number; y: number } {
  const h = hash(echo.id + echo.name)
  const ring = 0.14 + ((h % 1000) / 1000) * 0.18
  const angle = ((h % 360) + index * 47) * (Math.PI / 180)
  let x = 0.5 + Math.cos(angle) * (0.38 + ring)
  let y = 0.5 + Math.sin(angle) * (0.32 + ring * 0.85)
  x = Math.min(0.94, Math.max(0.06, x))
  y = Math.min(0.9, Math.max(0.1, y))
  if (x > 0.32 && x < 0.68 && y > 0.28 && y < 0.72) {
    x = x < 0.5 ? 0.12 + (h % 80) / 800 : 0.82 + (h % 80) / 900
  }
  return { x, y }
}

interface EchoFieldProps {
  reduced: boolean
  /** 飞星动画进行中：先不渲染这颗，避免和飞行点叠在一起 */
  hiddenId?: string | null
  /** 刚落地：短暂放大光晕，引导目光 */
  arrivingId?: string | null
}

export default function EchoField({ reduced, hiddenId, arrivingId }: EchoFieldProps) {
  const { echoes } = useEchoes()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const finePointer = useMemo(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
    [],
  )

  useEffect(() => {
    if (arrivingId) setPinnedId(arrivingId)
  }, [arrivingId])

  const placed = useMemo(
    () =>
      echoes
        .map((echo, i) => ({ echo, ...placeEcho(echo, i) }))
        .filter((p) => p.echo.id !== hiddenId),
    [echoes, hiddenId],
  )

  const activeId = (finePointer ? hoverId : null) ?? pinnedId
  const hovered = placed.find((p) => p.echo.id === activeId)

  const togglePin = (id: string) => {
    setHoverId(null)
    setPinnedId((cur) => (cur === id ? null : id))
  }

  const dismiss = () => {
    setHoverId(null)
    setPinnedId(null)
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]" aria-label="宇宙回声星群">
      {pinnedId && (
        <button
          type="button"
          aria-label="关闭回声卡片"
          className="pointer-events-auto absolute inset-0 z-10 cursor-default border-0 bg-transparent p-0"
          onClick={dismiss}
        />
      )}
      {placed.map(({ echo, x, y }, i) => {
        const arriving = arrivingId === echo.id
        const active = activeId === echo.id || arriving
        return (
          <button
            key={echo.id}
            type="button"
            aria-label={
              pinnedId === echo.id
                ? `${echo.name}的回声，再次点击关闭`
                : `${echo.name}的回声，点击查看`
            }
            title={pinnedId === echo.id ? '再次点击关闭' : '点击查看这条回声'}
            data-cursor="interactive"
            className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-0"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: 40, height: 40 }}
            onMouseEnter={() => {
              if (finePointer) setHoverId(echo.id)
            }}
            onMouseLeave={() => {
              if (finePointer) setHoverId((id) => (id === echo.id ? null : id))
            }}
            onFocus={() => {
              if (finePointer) setHoverId(echo.id)
            }}
            onBlur={() => {
              if (finePointer) setHoverId((id) => (id === echo.id ? null : id))
            }}
            onClick={(e) => {
              e.stopPropagation()
              togglePin(echo.id)
            }}
          >
            <motion.span
              aria-hidden
              className={`echo-star absolute left-1/2 top-1/2 block ${active ? 'echo-star--active' : ''} ${reduced ? 'echo-star--reduced' : ''}`}
              style={
                {
                  '--echo-delay': `${(i % 7) * 0.55}s`,
                  '--echo-flash-delay': `${(i % 5) * 0.85 + 0.4}s`,
                } as CSSProperties
              }
              animate={
                reduced
                  ? { scale: active ? 1.2 : 1, opacity: 1 }
                  : {
                      scale: active ? 1.28 : [1, 1.06, 0.97, 1.04, 1],
                      opacity: 1,
                    }
              }
              transition={
                reduced
                  ? { duration: 0.2 }
                  : {
                      duration: 3.6 + (i % 4) * 0.4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
              }
            >
              <span className="echo-star-glow" />
              <span className="echo-star-spikes">
                <span className="echo-star-spike echo-star-spike--h" />
                <span className="echo-star-spike echo-star-spike--v" />
                <span className="echo-star-spike echo-star-spike--d1" />
                <span className="echo-star-spike echo-star-spike--d2" />
              </span>
              <span className="echo-star-core" />
              <span className="echo-star-flash" />
            </motion.span>
          </button>
        )
      })}

      <AnimatePresence>
        {hovered && (
          <EchoCard
            key={hovered.echo.id}
            echo={hovered.echo}
            x={hovered.x}
            y={hovered.y}
            reduced={reduced}
            dismissible={pinnedId === hovered.echo.id}
            onDismiss={dismiss}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function EchoCard({
  echo,
  x,
  y,
  reduced,
  dismissible,
  onDismiss,
}: {
  echo: Echo
  x: number
  y: number
  reduced: boolean
  dismissible?: boolean
  onDismiss?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.min(260, vw * 0.7)
    const h = 120
    const starX = x * vw
    const starY = y * vh
    let left = starX - w / 2
    left = Math.min(Math.max(left, CARD_PAD), Math.max(CARD_PAD, vw - w - CARD_PAD))
    let top = starY + 16
    if (top + h > vh - CARD_PAD) top = starY - 16 - h
    if (top < CARD_PAD) top = CARD_PAD
    return { left, top }
  })

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current
      if (!el) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = el.offsetWidth
      const h = el.offsetHeight
      const starX = x * vw
      const starY = y * vh
      let left = starX - w / 2
      left = Math.min(Math.max(left, CARD_PAD), Math.max(CARD_PAD, vw - w - CARD_PAD))
      let top = starY + 16
      if (top + h > vh - CARD_PAD) top = starY - 16 - h
      if (top < CARD_PAD) top = CARD_PAD
      setBox({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [x, y, echo.id, echo.message])

  return (
    <motion.div
      ref={ref}
      role="tooltip"
      className={`absolute z-30 w-[min(260px,70vw)] ${dismissible ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ left: box.left, top: box.top }}
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 4 }}
      transition={{ duration: 0.22, ease: EASE }}
      onClick={(e) => {
        if (!dismissible) return
        e.stopPropagation()
        onDismiss?.()
      }}
    >
      <div
        className="rounded-lg border px-3.5 py-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        style={{
          borderColor: 'rgba(255,217,160,0.35)',
          background: 'rgba(12,16,36,0.92)',
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-serif text-[14px] text-starlight">{echo.name}</span>
          <span className="shrink-0 font-hud text-[10px] tracking-[0.14em] text-[rgba(245,240,230,0.7)]">
            {formatEchoTime(echo.at)}
          </span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-[rgba(245,240,230,0.88)]">
          {echo.message}
        </p>
      </div>
    </motion.div>
  )
}
