import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatEchoTime, useEchoes } from './echoes'
import type { Echo } from './echoes'

/**
 * <EchoField> 宇宙回声 · 漂浮在星空图书馆背景里的留言星
 * - 每条回声是一颗缓慢呼吸的星；位置由 id 稳定散列，避开中央书廊
 * - 鼠标靠近 / 悬停时浮出留言卡片（昵称 · 正文 · 相对时间）
 * - 不抢书廊交互：默认 pointer-events 只开在星点热区
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const TINTS = ['#ffd9a0', '#aee6ff', '#c9a2e8', '#8fe3c0', '#ffb3c8', '#f5d06a', '#7fb8e8', '#cfe3d8']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 把回声安放在画面边缘带，避开中央环形书廊（约 30%–70% 中心） */
function placeEcho(echo: Echo, index: number): { x: number; y: number; tint: string } {
  const h = hash(echo.id + echo.name)
  const ring = 0.14 + ((h % 1000) / 1000) * 0.18
  const angle = ((h % 360) + index * 47) * (Math.PI / 180)
  // 椭圆环：上下更宽，左右略收，避开书廊
  let x = 0.5 + Math.cos(angle) * (0.38 + ring)
  let y = 0.5 + Math.sin(angle) * (0.32 + ring * 0.85)
  x = Math.min(0.94, Math.max(0.06, x))
  y = Math.min(0.9, Math.max(0.1, y))
  // 若仍落在中心，推到外缘
  if (x > 0.32 && x < 0.68 && y > 0.28 && y < 0.72) {
    x = x < 0.5 ? 0.12 + (h % 80) / 800 : 0.82 + (h % 80) / 900
  }
  return { x, y, tint: TINTS[h % TINTS.length] }
}

interface EchoFieldProps {
  reduced: boolean
}

export default function EchoField({ reduced }: EchoFieldProps) {
  const { echoes } = useEchoes()
  const [hoverId, setHoverId] = useState<string | null>(null)

  const placed = useMemo(
    () => echoes.map((echo, i) => ({ echo, ...placeEcho(echo, i) })),
    [echoes],
  )

  const hovered = placed.find((p) => p.echo.id === hoverId)

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]" aria-label="宇宙回声星群">
      {placed.map(({ echo, x, y, tint }, i) => {
        const active = hoverId === echo.id
        return (
          <button
            key={echo.id}
            type="button"
            aria-label={`${echo.name}的回声`}
            data-cursor="interactive"
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-0"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: 28, height: 28 }}
            onMouseEnter={() => setHoverId(echo.id)}
            onMouseLeave={() => setHoverId((id) => (id === echo.id ? null : id))}
            onFocus={() => setHoverId(echo.id)}
            onBlur={() => setHoverId((id) => (id === echo.id ? null : id))}
          >
            <motion.span
              aria-hidden
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: active ? 10 : 6,
                height: active ? 10 : 6,
                marginLeft: active ? -5 : -3,
                marginTop: active ? -5 : -3,
                background: tint,
                boxShadow: active
                  ? `0 0 16px ${tint}, 0 0 36px ${tint}88`
                  : `0 0 8px ${tint}aa`,
              }}
              animate={
                reduced
                  ? { opacity: 0.85 }
                  : { opacity: [0.45, 1, 0.45], scale: active ? 1.35 : [1, 1.15, 1] }
              }
              transition={
                reduced
                  ? { duration: 0.2 }
                  : {
                      duration: 2.6 + (i % 5) * 0.35,
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
              top: `calc(${hovered.y * 100}% + 18px)`,
            }}
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 4 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <div
              className="rounded-lg border px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
              style={{
                borderColor: `${hovered.tint}55`,
                background: 'rgba(245,240,230,0.94)',
                color: '#1a1f33',
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-[14px]" style={{ color: '#12162a' }}>
                  {hovered.echo.name}
                </span>
                <span
                  className="shrink-0 font-hud text-[10px] tracking-[0.14em]"
                  style={{ color: 'rgba(26,31,51,0.45)' }}
                >
                  {formatEchoTime(hovered.echo.at)}
                </span>
              </div>
              <p
                className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed"
                style={{ color: 'rgba(26,31,51,0.78)' }}
              >
                {hovered.echo.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
