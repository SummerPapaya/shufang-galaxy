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
 * - 主按钮展示当前状态（声波 / 静音斜杠）
 * - 点击展开菜单：随机片花、男声、女声、静音
 */

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
  const active = !muted && (state.ambienceStarted || state.playing)

  return (
    <div ref={rootRef} className="fixed bottom-6 right-6 z-[90]">
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

      <button
        type="button"
        aria-label={modeAria(state.ambienceMode)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-cursor="interactive"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full',
          'border border-[rgba(255,217,160,0.3)] bg-[rgba(11,16,38,0.5)] backdrop-blur-sm',
          'transition-colors duration-200 hover:border-[rgba(255,217,160,0.7)]',
          open && 'border-[rgba(255,217,160,0.7)]',
        )}
      >
        {muted ? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <line
              x1="2"
              y1="14"
              x2="14"
              y2="2"
              stroke="var(--starlight-dim)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <span className="flex h-4 items-center gap-[3px]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  'w-[2px] rounded-full bg-[var(--gold)]',
                  active && 'animate-audio-bar',
                )}
                style={{
                  height: 14,
                  transform: active ? undefined : 'scaleY(0.3)',
                  animationDelay: `${i * 0.3}s`,
                  animationDuration: `${1.6 + i * 0.35}s`,
                }}
              />
            ))}
          </span>
        )}
      </button>
    </div>
  )
}
