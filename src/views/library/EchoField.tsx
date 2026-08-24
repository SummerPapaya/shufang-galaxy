import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatEchoTime, useEchoes } from './echoes'
import type { Echo } from './echoes'

/**
 * <EchoField> 宇宙回声 · 漂浮在星空图书馆背景里的留言星
 * - 小核 + 羽化光晕 + 缓慢呼吸，和背景星区分，引导悬停 / 点击
 * - 位置由 id 稳定散列，避开中央书廊
 * - 留言卡根据视口夹紧，避免贴边溢出
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const MILK = '#f5f0e6'
const HALO = 'rgba(255,217,160,0.4)'
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

  const activeId = hoverId ?? pinnedId
  const hovered = placed.find((p) => p.echo.id === activeId)

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]" aria-label="宇宙回声星群">
      {placed.map(({ echo, x, y }, i) => {
        const arriving = arrivingId === echo.id
        const active = activeId === echo.id || arriving
        const core = active ? 6 : 5
        return (
          <button
            key={echo.id}
            type="button"
            aria-label={`${echo.name}的回声，点击查看`}
            title="点击查看这条回声"
            data-cursor="interactive"
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-0"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: 28, height: 28 }}
            onMouseEnter={() => setHoverId(echo.id)}
            onMouseLeave={() => setHoverId((id) => (id === echo.id ? null : id))}
            onFocus={() => setHoverId(echo.id)}
            onBlur={() => setHoverId((id) => (id === echo.id ? null : id))}
            onClick={() => setPinnedId((id) => (id === echo.id ? null : echo.id))}
          >
            <span
              aria-hidden
              className="echo-star-halo absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: 18,
                height: 18,
                marginLeft: -9,
                marginTop: -9,
                background:
                  'radial-gradient(circle, rgba(245,240,230,0.34) 0%, rgba(255,217,160,0.16) 42%, transparent 78%)',
                animationDelay: `${(i % 5) * 0.4}s`,
                animationPlayState: reduced ? 'paused' : 'running',
              }}
            />
            <motion.span
              aria-hidden
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: core,
                height: core,
                marginLeft: -core / 2,
                marginTop: -core / 2,
                background: MILK,
                boxShadow: active
                  ? `0 0 6px ${MILK}, 0 0 14px ${HALO}`
                  : `0 0 5px ${MILK}, 0 0 10px ${HALO}`,
              }}
              animate={
                reduced
                  ? { opacity: 0.9 }
                  : {
                      opacity: [0.45, 0.95, 0.55, 0.95, 0.45],
                      scale: active ? 1.12 : [1, 1.1, 0.94, 1.08, 1],
                    }
              }
              transition={
                reduced
                  ? { duration: 0.2 }
                  : {
                      duration: 3.2 + (i % 4) * 0.35,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
              }
            />
          </button>
        )
      })}

      <AnimatePresence>
        {hovered && (
          <EchoCard key={hovered.echo.id} echo={hovered.echo} x={hovered.x} y={hovered.y} reduced={reduced} />
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
}: {
  echo: Echo
  x: number
  y: number
  reduced: boolean
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
      className="pointer-events-none absolute z-20 w-[min(260px,70vw)]"
      style={{ left: box.left, top: box.top }}
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 4 }}
      transition={{ duration: 0.22, ease: EASE }}
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
