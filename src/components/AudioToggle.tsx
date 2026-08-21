import { useEffect, useState } from 'react'
import { audioManager } from '@/audio/AudioManager'
import { cn } from '@/lib/utils'

/**
 * <AudioToggle> 全局静音按钮（design.md §7.3）
 * 固定右下角（bottom/right 24px），圆形 44px，1px gold/30% 描边；
 * 播放中三道竖线声波动画（2s 循环），静音时变为斜杠。
 */
export default function AudioToggle() {
  const [muted, setMuted] = useState(audioManager.getState().muted)
  const [active, setActive] = useState(false)

  useEffect(
    () =>
      audioManager.subscribe((s) => {
        setMuted(s.muted)
        setActive(s.ambienceStarted || s.playing)
      }),
    [],
  )

  return (
    <button
      type="button"
      aria-label={muted ? '取消静音' : '静音'}
      data-cursor="interactive"
      onClick={() => audioManager.toggleMuted()}
      className={cn(
        'fixed bottom-6 right-6 z-[90] flex h-11 w-11 items-center justify-center rounded-full',
        'border border-[rgba(255,217,160,0.3)] bg-[rgba(11,16,38,0.5)] backdrop-blur-sm',
        'transition-colors duration-200 hover:border-[rgba(255,217,160,0.7)]',
      )}
    >
      {muted ? (
        /* 静音：斜杠 */
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <line x1="2" y1="14" x2="14" y2="2" stroke="var(--starlight-dim)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        /* 三道竖线声波 */
        <span className="flex h-4 items-center gap-[3px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn('w-[2px] rounded-full bg-[var(--gold)]', active && 'animate-audio-bar')}
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
  )
}
