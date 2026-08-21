import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Room } from '@/data/rooms'
import { audioManager } from '@/audio/AudioManager'
import { cn } from '@/lib/utils'
import { formatTime, hexToRgba, seededRandoms } from './utils'

/**
 * <ShelfPlayer> 拟物「书架播放器」（room.md §4）
 * 木质书架质感 × 科幻 HUD 的播放器卡片：
 * - 44px 圆形播放钮（hover 旋转虚线环），点击 play/toggleSample
 * - 3px 可点击/拖动 seek 进度条（已播段 starColor 发光）+ mm:ss 时间
 * - 24px 波形可视化（32 竖条，播放中实时起伏，暂停时正弦呼吸待机）
 * - 播放时 ambience 自动 duck 至 0.12（AudioManager 内置）；音频缺失时降级为禁用态
 * - compact 变体：移动端 sticky 底部 72px（播放钮 + 进度条 + 时间）
 */
interface ShelfPlayerProps {
  room: Room
  /** R3：当前播放曲目（书+单集）。缺省回退 room.book/audio 行为 */
  track?: { key: string; label: string; sub: string; audio: string }
  /** 点击播放时触发「房间回应」（光晕短暂提亮） */
  onWake?: () => void
  compact?: boolean
  reduced?: boolean
  className?: string
}

const BAR_COUNT = 32

/** 波形可视化 canvas（rAF 直绘，不触发 React 重渲染） */
function Waveform({ color, seed, playing, active, reduced }: { color: string; seed: string; playing: boolean; active: boolean; reduced: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ playing, active, reduced })
  useEffect(() => {
    stateRef.current = { playing, active, reduced }
  }, [playing, active, reduced])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const base = seededRandoms(seed, BAR_COUNT).map((r) => 0.25 + r * 0.75)
    let raf = 0

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const t = now / 1000
      const { playing: isPlaying, active: isActive, reduced: isReduced } = stateRef.current
      const gap = 2
      const barW = Math.max(1.5, (w - gap * (BAR_COUNT - 1)) / BAR_COUNT)
      for (let i = 0; i < BAR_COUNT; i++) {
        let amp: number
        if (isPlaying && !isReduced) {
          // 播放中：基准振幅 × 多频正弦起伏（类实时波形）
          amp =
            base[i] *
            (0.3 +
              0.45 * Math.abs(Math.sin(t * 3.1 + i * 0.63)) +
              0.25 * Math.abs(Math.sin(t * 5.7 + i * 1.7)))
        } else if (isReduced) {
          amp = base[i] * (isActive ? 0.3 : 0.18)
        } else {
          // 暂停 / 待机：低幅度正弦呼吸
          amp = base[i] * (0.14 + 0.07 * Math.sin(t * 1.4 + i * 0.5))
        }
        const bh = Math.max(2, amp * (h - 2))
        const x = i * (barW + gap)
        const y = (h - bh) / 2
        ctx.fillStyle = hexToRgba(color, Math.min(1, 0.22 + amp * 0.78))
        ctx.beginPath()
        ctx.roundRect(x, y, barW, bh, barW / 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [color, seed])

  return <canvas ref={canvasRef} style={{ width: '100%', height: 24, display: 'block' }} aria-hidden />
}

/** 可点击 / 拖动 seek 的进度条 */
function ProgressBar({
  ratio,
  color,
  disabled,
  onSeek,
}: {
  ratio: number
  color: string
  disabled: boolean
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
      aria-disabled={disabled}
      data-cursor={disabled ? undefined : 'interactive'}
      data-cursor-color={disabled ? undefined : color}
      className={cn('group relative h-4 w-full', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
      onPointerDown={(e) => {
        if (disabled) return
        e.stopPropagation()
        setDragging(true)
        e.currentTarget.setPointerCapture(e.pointerId)
        onSeek(ratioFromEvent(e.clientX))
      }}
      onPointerMove={(e) => {
        if (dragging && !disabled) onSeek(ratioFromEvent(e.clientX))
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[rgba(245,240,230,0.12)]" />
      <div
        className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-150"
        style={{
          width: `${ratio * 100}%`,
          backgroundColor: color,
          boxShadow: `0 0 8px ${hexToRgba(color, 0.5)}`,
        }}
      />
      {/* 拖动手柄（悬停/拖动时浮现） */}
      <div
        aria-hidden
        className={cn(
          'absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150',
          dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        style={{ left: `${ratio * 100}%`, backgroundColor: color, boxShadow: `0 0 8px ${hexToRgba(color, 0.6)}` }}
      />
    </div>
  )
}

function PlayIcon({ playing, color }: { playing: boolean; color: string }) {
  return playing ? (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="2" y="1.5" width="3.4" height="11" rx="1" fill={color} />
      <rect x="8.6" y="1.5" width="3.4" height="11" rx="1" fill={color} />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M4 1.8 12 7l-8 5.2z" fill={color} />
    </svg>
  )
}

export default function ShelfPlayer({ room, track, onWake, compact = false, reduced = false, className }: ShelfPlayerProps) {
  const trackKey = track?.key ?? room.id
  const trackAudio = track?.audio ?? room.audio
  const trackLabel = track?.label ?? room.book

  const [audioOk, setAudioOk] = useState(true)
  const [hoverBtn, setHoverBtn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [isCurrent, setIsCurrent] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  // 订阅全局音频状态
  useEffect(
    () =>
      audioManager.subscribe((s) => {
        const current = s.playingId === trackKey
        setIsCurrent(current)
        setPlaying(current && s.playing)
        setProgress(current ? s.progress : 0)
        setDuration(current ? s.duration : 0)
      }),
    [trackKey],
  )

  // 音频可用性探测（失败 → 降级禁用态，room.md §7）；切换房间时重置
  const [lastAudio, setLastAudio] = useState(trackAudio)
  if (lastAudio !== trackAudio) {
    setLastAudio(trackAudio)
    setAudioOk(true)
  }
  useEffect(() => {
    let cancelled = false
    fetch(trackAudio, { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setAudioOk(res.ok)
      })
      .catch(() => {
        if (!cancelled) setAudioOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [trackAudio])

  const handleToggle = () => {
    if (!audioOk) return
    if (isCurrent) audioManager.toggleSample()
    else audioManager.play(trackKey, trackAudio)
    onWake?.()
  }

  const disabled = !audioOk
  const currentSec = progress * duration

  const playButton = (
    <button
      type="button"
      aria-label={playing ? '暂停朗读' : '播放朗读'}
      disabled={disabled}
      data-cursor={disabled ? undefined : 'interactive'}
      data-cursor-color={disabled ? undefined : room.starColor}
      onClick={(e) => {
        e.stopPropagation()
        handleToggle()
      }}
      onMouseEnter={() => setHoverBtn(true)}
      onMouseLeave={() => setHoverBtn(false)}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full border transition-shadow duration-200',
        compact ? 'h-10 w-10' : 'h-11 w-11',
        disabled && 'opacity-40',
      )}
      style={{
        borderColor: hexToRgba(room.starColor, 0.8),
        boxShadow: playing ? `0 0 14px ${hexToRgba(room.starColor, 0.35)}` : undefined,
      }}
    >
      {/* hover 旋转虚线环（12s/圈） */}
      {hoverBtn && !disabled && !reduced && (
        <motion.span
          aria-hidden
          className="absolute inset-[-5px] rounded-full border border-dashed"
          style={{ borderColor: hexToRgba(room.starColor, 0.5) }}
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <PlayIcon playing={playing} color={room.starColor} />
    </button>
  )

  if (compact) {
    return (
      <div
        className={cn(
          'flex h-[72px] items-center gap-3 border-t px-4',
          className,
        )}
        style={{
          background: 'rgba(11,16,38,0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: hexToRgba(room.starColor, 0.25),
        }}
      >
        {playButton}
        <div className="min-w-0 flex-1">
          {disabled ? (
            <p className="text-[11px] text-starlight-faint">音频信号微弱，稍后再试</p>
          ) : (
            <ProgressBar
              ratio={progress}
              color={room.starColor}
              disabled={disabled || !isCurrent}
              onSeek={(r) => audioManager.seek(r)}
            />
          )}
        </div>
        <span className="shrink-0 font-hud text-[11px] tabular-nums text-starlight-dim">
          {formatTime(currentSec)}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn('relative flex items-center gap-4 overflow-hidden rounded-md border py-3 pl-5 pr-4', className)}
      style={{
        background: 'rgba(11,16,38,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: hexToRgba(room.starColor, 0.3),
        minHeight: 96,
      }}
    >
      {/* 左侧 4px starColor 光条（播放时常亮，暂停 40%） */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 top-0 w-1 transition-opacity duration-500"
        style={{
          backgroundColor: room.starColor,
          opacity: playing ? 1 : 0.4,
          boxShadow: `0 0 12px ${hexToRgba(room.starColor, 0.5)}`,
        }}
      />
      {playButton}
      <div className="min-w-0 flex-1">
        {disabled ? (
          <p className="text-[11px] text-starlight-faint">音频信号微弱，稍后再试</p>
        ) : (
          <>
            <p className="truncate text-[14px] font-medium text-starlight">
              {room.reader} 正在朗读
            </p>
            <p className="mt-0.5 truncate font-hud text-[11px] tracking-wider text-starlight-dim">
              {trackLabel}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <ProgressBar
                  ratio={progress}
                  color={room.starColor}
                  disabled={!isCurrent}
                  onSeek={(r) => audioManager.seek(r)}
                />
                <div className="mt-1">
                  <Waveform color={room.starColor} seed={room.id} playing={playing} active={isCurrent} reduced={reduced} />
                </div>
              </div>
              <span className="shrink-0 self-start pt-0.5 font-hud text-[11px] tabular-nums text-starlight-dim">
                {formatTime(currentSec)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
