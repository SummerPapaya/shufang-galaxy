import { useEffect, useRef, useState } from 'react'
import {
  AMBIENCE_TRACK_LIST,
  audioManager,
  type AmbienceMode,
  type AudioManagerState,
} from '@/audio/AudioManager'
import { cn } from '@/lib/utils'

/**
 * <AudioToggle> 右下角片花 / 静音选择（design.md §7.3）
 * - 播放中：5 柱声波实时起伏 + 金色呼吸光环，让"正在放片花"一眼可辨
 * - 静音：柱状压平为静止短线 + 斜杠
 * - 点击展开菜单：随机片花、男声、女声、静音
 */

/** 声波柱：高度 / 动画时长 / 相位错开，模拟真实电平起伏 */
const WAVE_BARS = [
  { h: 8, dur: 1.05, delay: 0 },
  { h: 14, dur: 0.85, delay: 0.18 },
  { h: 18, dur: 1.25, delay: 0.06 },
  { h: 12, dur: 0.95, delay: 0.3 },
  { h: 7, dur: 1.15, delay: 0.14 },
]

const MODE_OPTIONS: { mode: AmbienceMode; label: string; hint: string }[] = [
  { mode: 'random', label: '随机片花', hint: '男声 / 女声随机续播' },
  {
    mode: 'trailer1',
    label: AMBIENCE_TRACK_LIST[0]?.label ?? '男声片花',
    hint: '锁定男声版',
  },
  {
    mode: 'trailer2',
    label: AMBIENCE_TRACK_LIST[1]?.label ?? '女声片花',
    hint: '锁定女声版',
  },
  { mode: 'muted', label: '静音', hint: '关闭背景片花' },
]

function modeAria(mode: AmbienceMode): string {
  if (mode === 'muted') return '音频：静音，点击选择片花'
  if (mode === 'random') return '音频：随机片花，点击切换'
  if (mode === 'trailer1') return '音频：男声片花，点击切换'
  return '音频：女声片花，点击切换'
}

export default function AudioToggle() {
  const [state, setState] = useState<AudioManagerState>(audioManager.getState())
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => audioManager.subscribe(setState), [])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const muted = state.muted || state.ambienceMode === 'muted'
  /** 片花（或朗读样片）确实在响 → 播放声波动画 */
  const active = !muted && (state.ambienceStarted || state.playing)

  return (
    <div
      ref={rootRef}
      className={cn(
        'fixed right-4 z-[90] sm:right-6',
        state.playingId ? 'bottom-[9.5rem] sm:bottom-6' : 'bottom-6',
      )}
    >
      {open && (
        <div
          role="menu"
          aria-label="背景片花"
          className="absolute bottom-[52px] right-0 w-[min(288px,calc(100vw-32px))] overflow-hidden rounded-xl border border-[rgba(255,217,160,0.28)] bg-[rgba(11,16,38,0.92)] shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          <p className="border-b border-white/5 px-3.5 py-2.5 font-hud text-[10px] uppercase tracking-[0.22em] text-starlight-faint">
            星空背景音
          </p>
          <ul className="py-1">
            {MODE_OPTIONS.map((opt) => {
              const selected = state.ambienceMode === opt.mode
              return (
                <li key={opt.mode}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    data-cursor="interactive"
                    onClick={() => {
                      audioManager.setAmbienceMode(opt.mode)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition-colors',
                      selected
                        ? 'bg-[rgba(255,217,160,0.12)] text-gold'
                        : 'text-starlight hover:bg-white/5',
                    )}
                  >
                    <span className="font-sans text-[13px] leading-snug">{opt.label}</span>
                    <span className="font-hud text-[10px] tracking-[0.12em] text-starlight-faint">
                      {opt.hint}
                      {selected && state.ambienceMode === 'random'
                        ? ` · 当前 ${
                            state.ambienceTrackId === 'trailer1' ? '男声' : '女声'
                          }`
                        : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="relative">
        {/* 播放中：金色呼吸光环从按钮向外扩散 */}
        {active && (
          <>
            <span
              aria-hidden
              className="animate-audio-pulse pointer-events-none absolute inset-0 rounded-full border border-[rgba(255,217,160,0.55)]"
            />
            <span
              aria-hidden
              className="animate-audio-pulse pointer-events-none absolute inset-0 rounded-full border border-[rgba(255,217,160,0.35)]"
              style={{ animationDelay: '1.2s' }}
            />
          </>
        )}

        <button
          type="button"
          aria-label={modeAria(state.ambienceMode)}
          aria-haspopup="menu"
          aria-expanded={open}
          data-cursor="interactive"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'relative flex h-11 w-11 items-center justify-center rounded-full',
            'border bg-[rgba(11,16,38,0.5)] backdrop-blur-sm transition-colors duration-200',
            active
              ? 'border-[rgba(255,217,160,0.6)] shadow-[0_0_18px_rgba(255,217,160,0.28)]'
              : 'border-[rgba(255,217,160,0.3)]',
            'hover:border-[rgba(255,217,160,0.8)]',
            open && 'border-[rgba(255,217,160,0.8)]',
          )}
        >
          <span className="flex h-[18px] items-end gap-[2.5px]" aria-hidden>
            {WAVE_BARS.map((bar, i) => (
              <span
                key={i}
                className={cn(
                  'block w-[2.5px] origin-bottom rounded-full',
                  active
                    ? 'animate-audio-bar bg-[var(--gold)] shadow-[0_0_6px_rgba(255,217,160,0.65)]'
                    : 'bg-[var(--starlight-dim)]',
                )}
                style={{
                  height: active ? bar.h : 5,
                  animationDelay: `${bar.delay}s`,
                  animationDuration: `${bar.dur}s`,
                }}
              />
            ))}
          </span>

          {/* 静音：斜杠盖在压平的柱状上 */}
          {muted && (
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 44 44"
              aria-hidden
            >
              <line
                x1="13"
                y1="31"
                x2="31"
                y2="13"
                stroke="var(--starlight-dim)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
