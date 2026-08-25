import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { audioManager } from '@/audio/AudioManager'
import type { AudioManagerState } from '@/audio/AudioManager'
import { cn } from '@/lib/utils'
import type { Book } from './books'
import { formatTime, hexToRgba } from '../room/utils'

/**
 * <PlayerBar> 页面底部有声书播放器条
 * - fixed bottom，framer-motion 滑入 / 滑出 300ms（reduced-motion 仅淡入淡出）
 * - starColor 封面色块（书名首字）+ 书名 / 作者 /「XXX 正在朗读」
 * - 播放暂停、可点击 / 拖动 seek 的进度条 + 当前时间 / 总时长、关闭按钮
 * - 音频走全局 audioManager 单例：play(id, src) 内部自动暂停背景片花，
 *   stop() 后恢复；进度 / 时长经 subscribe 轮询同步（250ms）
 */

interface PlayerBarProps {
  book: Book
  reduced: boolean
  onClose: () => void
}

function PlayIcon({ playing, color }: { playing: boolean; color: string }) {
  return playing ? (
    <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden>
      <rect x="2" y="1.5" width="3.4" height="11" rx="1" fill={color} />
      <rect x="8.6" y="1.5" width="3.4" height="11" rx="1" fill={color} />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden>
      <path d="M4 1.8 12 7l-8 5.2z" fill={color} />
    </svg>
  )
}

/** 可点击 / 拖动 seek 的进度条 */
function SeekBar({
  ratio,
  color,
  onSeek,
}: {
  ratio: number
  color: string
  onSeek: (ratio: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const ratioFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      data-cursor="interactive"
      data-cursor-color={color}
      className="group relative h-4 w-full cursor-pointer"
      onPointerDown={(e) => {
        e.stopPropagation()
        setDragging(true)
        e.currentTarget.setPointerCapture(e.pointerId)
        onSeek(ratioFromEvent(e.clientX))
      }}
      onPointerMove={(e) => {
        if (dragging) onSeek(ratioFromEvent(e.clientX))
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[rgba(245,240,230,0.12)]" />
      <div
        className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
        style={{
          width: `${ratio * 100}%`,
          backgroundColor: color,
          boxShadow: `0 0 8px ${hexToRgba(color, 0.55)}`,
          transition: dragging ? 'none' : 'width 150ms linear',
        }}
      />
      <div
        aria-hidden
        className={cn(
          'absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150',
          dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        style={{
          left: `${ratio * 100}%`,
          backgroundColor: color,
          boxShadow: `0 0 8px ${hexToRgba(color, 0.7)}`,
        }}
      />
    </div>
  )
}

export default function PlayerBar({ book, reduced, onClose }: PlayerBarProps) {
  const [st, setSt] = useState<AudioManagerState>(() => audioManager.getState())
  /* R3：当前单集（同一本书内可切换） */
  const [epIdx, setEpIdx] = useState(0)
  const [lastBookId, setLastBookId] = useState(book.id)
  if (lastBookId !== book.id) {
    // 切换书籍：回到第 0 集（render 期间调整 state 模式）
    setLastBookId(book.id)
    setEpIdx(0)
  }
  const episodes =
    book.episodes.length > 0 ? book.episodes : [{ title: '第 1 集 · 试音样片', audio: book.audio }]
  const safeIdx = Math.min(epIdx, episodes.length - 1)
  const ep = episodes[safeIdx]
  const trackKey = `${book.id}#${safeIdx}`

  // 进入 / 切书 / 切集即播放对应音频（audioManager 内部 duck ambience）
  useEffect(() => {
    audioManager.play(trackKey, ep.audio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, ep.audio])

  // 订阅播放状态（进度 / 播放态驱动 UI）
  useEffect(() => audioManager.subscribe(setSt), [])

  // 卸载时停止 sample，ambience 恢复基准
  useEffect(() => () => audioManager.stop(), [])

  const isCurrent = st.playingId === trackKey
  const playing = isCurrent && st.playing
  const progress = isCurrent ? st.progress : 0
  const duration = isCurrent ? st.duration : 0

  const handleToggle = () => {
    if (isCurrent) audioManager.toggleSample()
    else audioManager.play(trackKey, ep.audio)
  }

  const status = playing
    ? `${book.reader} 正在朗读`
    : isCurrent
      ? `已暂停 · ${book.reader}`
      : `${book.reader} · 接续星光信号`

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 72 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 72 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-5"
    >
      <div
        className="glass-panel flex w-[min(96vw,660px)] flex-col gap-2.5 rounded-xl border px-3.5 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:px-4"
        style={{
          borderColor: 'rgba(245,240,230,0.16)',
          boxShadow: `0 18px 60px rgba(0,0,0,0.55), 0 0 32px ${hexToRgba(book.starColor, 0.12)}`,
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* 封面色块：starColor 渐变 + 书名首字 */}
          <div
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border font-serif text-[17px] sm:h-12 sm:w-12 sm:text-[18px]"
            style={{
              borderColor: hexToRgba(book.starColor, 0.5),
              background: `linear-gradient(160deg, ${hexToRgba(book.starColor, 0.85)} 0%, ${hexToRgba(book.starColor, 0.35)} 100%)`,
              color: 'rgba(11,16,38,0.9)',
              boxShadow: `0 0 16px ${hexToRgba(book.starColor, 0.35)}`,
            }}
          >
            {book.title.charAt(0)}
          </div>

          {/* 书名 / 作者 / 朗读者 — 手机端也显示 */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[13px] leading-snug text-starlight sm:text-[14px]">
              《{book.title}》
            </p>
            <p className="truncate text-[11px] text-starlight-dim">
              {book.author} 著
              <span className="mx-1.5 text-starlight-faint">·</span>
              {book.reader} 朗读
            </p>
            <p
              className="mt-0.5 flex items-center gap-1.5 font-hud text-[10px] tracking-[0.12em]"
              style={{ color: hexToRgba(book.starColor, 0.9) }}
            >
              <motion.span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: book.starColor,
                  boxShadow: `0 0 8px ${hexToRgba(book.starColor, 0.8)}`,
                }}
                animate={
                  playing && !reduced ? { opacity: [1, 0.25, 1] } : { opacity: playing ? 1 : 0.35 }
                }
                transition={
                  playing && !reduced
                    ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.2 }
                }
              />
              <span className="truncate">{status}</span>
            </p>
          </div>

          <button
            type="button"
            aria-label="关闭播放器"
            data-cursor="interactive"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-starlight-dim transition-colors duration-200 hover:text-starlight sm:hidden"
            style={{ borderColor: 'rgba(245,240,230,0.22)' }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M1 1l10 10M11 1L1 11"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-3 sm:flex-1">
          {/* 播放 / 暂停 */}
          <button
            type="button"
            aria-label={playing ? '暂停朗读' : '播放朗读'}
            data-cursor="interactive"
            data-cursor-color={book.starColor}
            onClick={handleToggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-shadow duration-200"
            style={{
              borderColor: hexToRgba(book.starColor, 0.8),
              boxShadow: playing ? `0 0 16px ${hexToRgba(book.starColor, 0.4)}` : undefined,
            }}
          >
            <PlayIcon playing={playing} color={book.starColor} />
          </button>

          {/* 单集切换 + 进度条 + 时间 */}
          <div className="min-w-0 flex-1">
            {episodes.length > 1 && (
              <div
                className="mb-1.5 flex gap-1.5 overflow-x-auto pb-0.5"
                data-cursor="interactive"
                aria-label="单集列表"
              >
                {episodes.map((e2, i) => {
                  const active = i === Math.min(epIdx, episodes.length - 1)
                  return (
                    <button
                      key={`${book.id}-ep-${i}`}
                      type="button"
                      data-cursor="interactive"
                      data-cursor-color={book.starColor}
                      onClick={() => setEpIdx(i)}
                      className={cn(
                        'shrink-0 rounded-full border px-2.5 py-0.5 font-hud text-[10px] tracking-[0.1em] transition-colors duration-150',
                        active ? 'text-starlight' : 'text-starlight-faint hover:text-starlight-dim',
                      )}
                      style={{
                        borderColor: hexToRgba(book.starColor, active ? 0.7 : 0.22),
                        background: active ? hexToRgba(book.starColor, 0.12) : 'transparent',
                      }}
                    >
                      {e2.title.split('·')[0].trim()}
                    </button>
                  )
                })}
              </div>
            )}
            <SeekBar ratio={progress} color={book.starColor} onSeek={(r) => audioManager.seek(r)} />
            <div className="mt-1 flex items-center justify-between font-hud text-[10px] tabular-nums text-starlight-dim">
              <span>{formatTime(progress * duration)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* 桌面关闭 */}
          <button
            type="button"
            aria-label="关闭播放器"
            data-cursor="interactive"
            onClick={onClose}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border text-starlight-dim transition-colors duration-200 hover:text-starlight sm:flex"
            style={{ borderColor: 'rgba(245,240,230,0.22)' }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M1 1l10 10M11 1L1 11"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  )
}
