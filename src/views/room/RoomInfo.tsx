import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Room, RoomBookItem } from '@/data/rooms'
import { audioManager } from '@/audio/AudioManager'
import TypeGlow from '@/components/TypeGlow'
import { cn } from '@/lib/utils'
import { hexToRgba } from './utils'

/**
 * 信息区子组件（room.md §1 / §5）：标题块 / 引言 / 书目卡 / HUD 角注。
 * 全部强调色随 room.starColor 切换；入场时序按 §2（delayScale 在平行宇宙跳跃时压缩）。
 */

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface TimedProps {
  room: Room
  roomIndex: number
  /** 延迟倍率：首次入场 1，切换房间 0.7（§2 动画 1.2 倍速） */
  ds: number
  reduced: boolean
  className?: string
}

/** role 胶囊 + 房间标题 H1（逐字入场）+ 风格行 + 分隔细线 */
export function RoomHeading({ room, ds, reduced, className }: TimedProps) {
  const chars = Array.from(room.title)
  const base = 0.7 * ds
  return (
    <div className={className}>
      {/* role 胶囊标签 */}
      <motion.span
        className="inline-block rounded-full border px-3 py-1 font-hud text-[10px] uppercase tracking-[0.22em]"
        style={{ borderColor: hexToRgba(room.starColor, 0.4), color: room.starColor }}
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: base, ease: EASE_OUT }}
      >
        {room.role}
      </motion.span>

      {/* 房间标题 H1：40px Serif 700 + TypeGlow（光晕 starColor），逐字 stagger 60ms */}
      <h1 className="mt-3 font-serif text-[30px] font-bold leading-tight tracking-[0.08em] text-starlight md:text-[34px] lg:text-[40px]">
        <TypeGlow glowColor={hexToRgba(room.starColor, 0.4)}>
          {reduced
            ? room.title
            : chars.map((ch, i) => (
                <motion.span
                  key={`${room.id}-ch-${i}`}
                  className="inline-block"
                  initial={{ opacity: 0, y: 24, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.5, delay: base + i * 0.06, ease: EASE_OUT }}
                >
                  {ch === ' ' ? ' ' : ch}
                </motion.span>
              ))}
        </TypeGlow>
      </h1>

      {/* 风格行：✦（starColor）+ gold 文字 */}
      <motion.p
        className="mt-2 flex items-center gap-2 text-[14px] text-gold"
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: base + 0.15, ease: EASE_OUT }}
      >
        <span aria-hidden style={{ color: room.starColor }}>
          ✦
        </span>
        {room.style}
      </motion.p>

      {/* 分隔细线 */}
      <motion.div
        aria-hidden
        className="mt-5 h-px w-full origin-left"
        style={{ background: `linear-gradient(to right, ${hexToRgba(room.starColor, 0.45)}, transparent)` }}
        initial={{ opacity: 0, scaleX: reduced ? 1 : 0.4 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.6, delay: base + 0.2, ease: EASE_OUT }}
      />
    </div>
  )
}

/** 引言 quote：装饰引号 ❝ ❞ 从两侧划入 + 正文淡入 + 落款 */
export function RoomQuote({ room, ds, reduced, className }: TimedProps) {
  const base = 0.9 * ds
  return (
    <figure className={className} style={{ paddingLeft: 6 }}>
      <div className="flex">
        <motion.span
          aria-hidden
          className="mr-1 shrink-0 font-serif text-[48px] leading-none"
          style={{ color: hexToRgba(room.starColor, 0.5) }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: base, ease: EASE_OUT }}
        >
          ❝
        </motion.span>
        <motion.blockquote
          className="pt-3 font-serif text-[19px] font-semibold leading-[2.0] text-starlight lg:text-[22px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0.4 : 0.6, delay: base + 0.1 }}
        >
          {room.quote}
        </motion.blockquote>
        <motion.span
          aria-hidden
          className="-mr-1 ml-1 shrink-0 self-end font-serif text-[48px] leading-none"
          style={{ color: hexToRgba(room.starColor, 0.5) }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: base, ease: EASE_OUT }}
        >
          ❞
        </motion.span>
      </div>
      {/* 署名已隐藏
      <motion.figcaption
        className="mt-2 text-right font-hud text-[11px] tracking-[0.2em] text-starlight-dim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: base + 0.25 }}
      >
        —— {room.reader}
      </motion.figcaption>
      */}
    </figure>
  )
}

/** 朗读书目（R3 重做）：书籍按钮并排陈列，点击书名向下展开单集列表，
 *  点击集数切换底部播放器到对应有声书音频；当前播放集高亮呼吸点。 */
export function RoomBook({
  room,
  ds,
  reduced,
  className,
  selB,
  selE,
  onSelect,
}: TimedProps & {
  /** 当前选中的书 / 集（由 RoomView 持有，用于播放器展示与恢复） */
  selB: number
  selE: number
  /** (bookIdx, epIdx, 是否立即播放) */
  onSelect: (bookIdx: number, epIdx: number, play: boolean) => void
}) {
  const base = 1.1 * ds
  const books: RoomBookItem[] =
    room.books && room.books.length > 0
      ? room.books
      : [
          {
            title: room.book.split('·')[0].trim().replace(/[《》]/g, ''),
            author: room.book.split('·')[1]?.trim() ?? '',
            episodes: [{ title: '第 1 集 · 试音样片', audio: room.audio }],
          },
        ]
  /* 展开中的书（默认第 0 本展开；再次点击收起） */
  const [expanded, setExpanded] = useState(0)
  /* 当前播放 key（audioManager.playingId），用于单集高亮 */
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  useEffect(() => audioManager.subscribe((s) => setPlayingKey(s.playingId)), [])

  return (
    <motion.div
      className={cn('py-1', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0.4 : 0.6, delay: base }}
    >
      <p className="font-hud text-[10px] uppercase tracking-[0.22em] text-starlight-faint">朗读书目</p>

      {/* 书籍按钮组：并排陈列，自动换行 */}
      <div className="mt-2.5 flex flex-wrap items-stretch gap-2">
        {books.map((b, bi) => {
          const active = selB === bi
          const open = expanded === bi
          return (
            <button
              key={`${room.id}-book-${bi}`}
              type="button"
              data-cursor="interactive"
              data-cursor-color={room.starColor}
              aria-expanded={open}
              onClick={() => {
                const nextOpen = open ? -1 : bi
                setExpanded(nextOpen)
                onSelect(bi, active ? selE : 0, false)
              }}
              className={cn(
                'rounded-lg border px-3.5 py-2 text-left transition-all duration-200',
                active ? 'text-starlight' : 'text-starlight-dim hover:text-starlight',
              )}
              style={{
                borderColor: hexToRgba(room.starColor, active ? 0.65 : 0.22),
                background: active ? hexToRgba(room.starColor, 0.09) : 'rgba(245,240,230,0.03)',
                boxShadow: active ? `0 0 14px ${hexToRgba(room.starColor, 0.18)}` : undefined,
              }}
            >
              <span className="block font-serif text-[14px] leading-snug">《{b.title}》</span>
              {b.author && (
                <span className="mt-0.5 block font-hud text-[10px] tracking-[0.14em] text-starlight-faint">
                  {b.author}
                </span>
              )}
              <span
                aria-hidden
                className="mt-1 block font-hud text-[9px] tracking-[0.2em]"
                style={{ color: hexToRgba(room.starColor, open ? 0.9 : 0.45) }}
              >
                {open ? '▾ 收起单集' : `▸ ${b.episodes.length} 集`}
              </span>
            </button>
          )
        })}
      </div>

      {/* 单集列表：点击书名向下展开（手风琴） */}
      <AnimatePresence initial={false}>
        {expanded >= 0 && books[expanded] && (
          <motion.ul
            key={`${room.id}-eps-${expanded}`}
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0.15 : 0.35, ease: EASE_OUT }}
          >
            <li className="pt-2" aria-hidden />
            {books[expanded].episodes.map((ep, ei) => {
              const key = `${room.id}#${expanded}-${ei}`
              const isPlayingThis = playingKey === key
              const isSel = selB === expanded && selE === ei
              return (
                <li key={key}>
                  <button
                    type="button"
                    data-cursor="interactive"
                    data-cursor-color={room.starColor}
                    onClick={() => onSelect(expanded, ei, true)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150',
                      isSel ? 'text-starlight' : 'text-starlight-dim hover:text-starlight',
                    )}
                    style={{
                      background: isSel ? hexToRgba(room.starColor, 0.07) : 'transparent',
                    }}
                  >
                    {/* 序号 / 播放态呼吸点 */}
                    <span
                      aria-hidden
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isPlayingThis && !reduced && 'animate-pulse')}
                      style={{
                        backgroundColor: isPlayingThis || isSel ? room.starColor : hexToRgba(room.starColor, 0.35),
                        boxShadow: isPlayingThis ? `0 0 8px ${hexToRgba(room.starColor, 0.8)}` : undefined,
                      }}
                    />
                    <span className="flex-1 truncate text-[13px]">{ep.title}</span>
                    {isPlayingThis && (
                      <span className="shrink-0 font-hud text-[9px] uppercase tracking-[0.2em]" style={{ color: room.starColor }}>
                        播放中
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** HUD 角注：STAR No.0{i} · {ID} · 亮度 {starColor} */
export function HudNote({ room, roomIndex, ds, reduced, className }: TimedProps) {
  return (
    <motion.p
      className={cn('font-hud text-[10px] uppercase tracking-[0.22em] text-starlight-faint', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: (reduced ? 0.2 : 1.3) * ds }}
    >
      STAR No.{String(roomIndex + 1).padStart(2, '0')} · {room.id.toUpperCase()} · 亮度 {room.starColor}
    </motion.p>
  )
}
