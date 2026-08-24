import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatEchoTime, useEchoes } from './echoes'
import type { Echo } from './echoes'

/**
 * <EchoField> 宇宙回声 · 漂浮在星空图书馆背景里的留言星
 * - 乳白核 + 暖金光晕 + 闪烁，和背景星明显区分，引导悬停 / 点击
 * - 位置由 id 稳定散列，避开中央书廊
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const MILK = '#f5f0e6'
const HALO = 'rgba(255,217,160,0.55)'

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
}

export default function EchoField({ reduced, hiddenId }: EchoFieldProps) {
  const { echoes } = useEchoes()
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)

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
        const active = activeId === echo.id
        return (
          <button
            key={echo.id}
            type="button"
            aria-label={`${echo.name}的回声，点击查看`}
            title="点击查看这条回声"
            data-cursor="interactive"
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-0"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: 48, height: 48 }}
            onMouseEnter={() => setHoverId(echo.id)}
            onMouseLeave={() => setHoverId((id) => (id === echo.id ? null : id))}
            onFocus={() => setHoverId(echo.id)}
            onBlur={() => setHoverId((id) => (id === echo.id ? null : id))}
            onClick={() => setPinnedId((id) => (id === echo.id ? null : echo.id))}
          >
            {/* 常驻柔光盘：和其他背景星区分 */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: active ? 36 : 30,
                height: active ? 36 : 30,
                marginLeft: active ? -18 : -15,
                marginTop: active ? -18 : -15,
                background:
                  'radial-gradient(circle, rgba(245,240,230,0.42) 0%, rgba(255,217,160,0.22) 36%, transparent 72%)',
              }}
            />
            {/* 外圈引导光晕：缓慢放大淡出，提示可点 */}
            <span
              aria-hidden
              className="echo-star-ring absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: 34,
                height: 34,
                marginLeft: -17,
                marginTop: -17,
                border: '1px solid rgba(255,217,160,0.55)',
                animationDelay: `${(i % 5) * 0.35}s`,
                animationPlayState: reduced ? 'paused' : 'running',
              }}
            />
            <motion.span
              aria-hidden
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: active ? 12 : 9,
                height: active ? 12 : 9,
                marginLeft: active ? -6 : -4.5,
                marginTop: active ? -6 : -4.5,
                background: MILK,
                boxShadow: active
                  ? `0 0 12px ${MILK}, 0 0 32px ${HALO}, 0 0 56px rgba(255,217,160,0.4)`
                  : `0 0 10px ${MILK}, 0 0 24px ${HALO}, 0 0 40px rgba(255,217,160,0.28)`,
              }}
              animate={
                reduced
                  ? { opacity: 0.95 }
                  : {
                      opacity: [0.5, 1, 0.62, 1, 0.5],
                      scale: active ? 1.28 : [1, 1.28, 0.88, 1.2, 1],
                    }
              }
              transition={
                reduced
                  ? { duration: 0.2 }
                  : {
                      duration: 1.85 + (i % 4) * 0.28,
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
          <motion.div
            key={hovered.echo.id}
            role="tooltip"
            className="pointer-events-none absolute z-20 w-[min(260px,70vw)] -translate-x-1/2"
            style={{
              left: `${hovered.x * 100}%`,
              top: `calc(${hovered.y * 100}% + 22px)`,
            }}
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
                <span className="font-serif text-[14px] text-starlight">{hovered.echo.name}</span>
                <span className="shrink-0 font-hud text-[10px] tracking-[0.14em] text-[rgba(245,240,230,0.7)]">
                  {formatEchoTime(hovered.echo.at)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-[rgba(245,240,230,0.88)]">
                {hovered.echo.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
