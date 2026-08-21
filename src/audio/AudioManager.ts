/**
 * 全局音频单例（design.md §8）
 *
 * - ambience.mp3：星河环境音循环，universe 视图 0.35，landing 回落 0.15
 * - 朗读者 sample：书房详情播放器通过 play(id) 触发；播放时 ambience duck 至 0.12
 * - 浏览器自动播放策略：首次用户手势（点击「进入星空」）时调用 unlock()
 * - 同一时间只有一个声源；切换时 300ms 淡出旧音频
 *
 * API（供 room 代理的播放器使用）：
 *   unlock() / startAmbience() / setAmbienceLevel(level)
 *   play(roomId) / stop() / duck(on) / setMuted(muted) / toggleMuted()
 *   getState() / subscribe(listener)（AudioToggle 等 UI 订阅用）
 */

export type AmbienceLevel = 'landing' | 'universe'

export interface AudioManagerState {
  /** 全局静音 */
  muted: boolean
  /** ambience 是否已启动循环 */
  ambienceStarted: boolean
  /** 当前正在播放的朗读者 sample 的 room id（无则 null） */
  playingId: string | null
  /** sample 是否处于播放中（非暂停） */
  playing: boolean
  /** 当前 sample 播放进度 0–1 */
  progress: number
  /** 当前 sample 时长（秒，未知为 0） */
  duration: number
}

const AMBIENCE_SRC = '/assets/audio/ambience.mp3'
const AMBIENCE_VOLUME: Record<AmbienceLevel, number> = {
  landing: 0.15,
  universe: 0.35,
}
const DUCK_VOLUME = 0.12
const FADE_MS = 500
const SWAP_FADE_MS = 300

type Listener = (state: AudioManagerState) => void

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

class AudioManager {
  private ambience: HTMLAudioElement | null = null
  private sample: HTMLAudioElement | null = null
  private ambienceTarget = AMBIENCE_VOLUME.landing
  private ducked = false
  private unlocked = false
  private listeners = new Set<Listener>()
  private fadeRaf = 0
  private progressTimer = 0

  private state: AudioManagerState = {
    muted: false,
    ambienceStarted: false,
    playingId: null,
    playing: false,
    progress: 0,
    duration: 0,
  }

  /* ── 订阅 ─────────────────────────────────────────── */

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  getState = (): AudioManagerState => this.state

  private emit(partial: Partial<AudioManagerState>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l(this.state))
  }

  /* ── 解锁（首次用户手势） ──────────────────────────── */

  /** 在首次用户手势（点击「进入星空」）中调用，解锁自动播放策略并启动 ambience */
  unlock() {
    if (this.unlocked) return
    this.unlocked = true
    this.startAmbience()
  }

  /* ── ambience ─────────────────────────────────────── */

  /** 启动星河环境音循环（若未 unlock 则仅记录意图，unlock 后生效） */
  startAmbience(level: AmbienceLevel = 'landing') {
    this.ambienceTarget = AMBIENCE_VOLUME[level]
    if (!this.unlocked) return
    if (!this.ambience) {
      this.ambience = new Audio(AMBIENCE_SRC)
      this.ambience.loop = true
      this.ambience.volume = 0
    }
    if (this.ambience.paused) {
      void this.ambience.play().catch(() => {})
    }
    this.emit({ ambienceStarted: true })
    this.fadeAmbienceTo(this.effectiveAmbienceVolume(), FADE_MS)
  }

  /** 切换 ambience 基准音量：landing 0.15 / universe 0.35（500ms 淡入淡出） */
  setAmbienceLevel(level: AmbienceLevel) {
    this.ambienceTarget = AMBIENCE_VOLUME[level]
    if (this.state.ambienceStarted) {
      this.fadeAmbienceTo(this.effectiveAmbienceVolume(), FADE_MS)
    }
  }

  private effectiveAmbienceVolume(): number {
    if (this.state.muted) return 0
    return this.ducked ? DUCK_VOLUME : this.ambienceTarget
  }

  private fadeAmbienceTo(target: number, duration: number) {
    const el = this.ambience
    if (!el) return
    cancelAnimationFrame(this.fadeRaf)
    const start = el.volume
    const t0 = performance.now()
    const step = (now: number) => {
      const t = clamp01((now - t0) / duration)
      el.volume = start + (target - start) * t
      if (t < 1) this.fadeRaf = requestAnimationFrame(step)
    }
    this.fadeRaf = requestAnimationFrame(step)
  }

  /* ── 朗读者 sample ────────────────────────────────── */

  /**
   * 播放某书房的朗读 sample（淡入）；若有其它 sample 在播，300ms 淡出后切换。
   * 播放期间 ambience 自动 duck 至 0.12。
   */
  play(roomId: string, src?: string) {
    const url = src ?? `/assets/audio/${roomId}.mp3`
    this.duck(true)

    const startNew = () => {
      this.stopSampleImmediate()
      const el = new Audio(url)
      el.volume = 0
      this.sample = el
      this.wireSampleEvents(roomId, el)
      void el.play().catch(() => {})
      this.fadeSampleTo(el, this.state.muted ? 0 : 1, FADE_MS)
      this.emit({ playingId: roomId, playing: true, progress: 0, duration: 0 })
    }

    if (this.sample && !this.sample.paused) {
      const old = this.sample
      this.fadeSampleTo(old, 0, SWAP_FADE_MS, () => {
        old.pause()
        if (this.sample === old) this.sample = null
      })
      window.setTimeout(startNew, SWAP_FADE_MS)
    } else {
      startNew()
    }
  }

  /** 停止当前 sample（淡出 300ms），ambience 恢复基准音量 */
  stop() {
    this.duck(false)
    const el = this.sample
    if (el) {
      this.fadeSampleTo(el, 0, SWAP_FADE_MS, () => {
        el.pause()
        if (this.sample === el) this.sample = null
      })
    }
    this.emit({ playingId: null, playing: false, progress: 0 })
  }

  /** 暂停 / 恢复当前 sample（不改变 playingId） */
  toggleSample() {
    const el = this.sample
    if (!el || !this.state.playingId) return
    if (el.paused) {
      void el.play().catch(() => {})
      this.emit({ playing: true })
    } else {
      el.pause()
      this.emit({ playing: false })
    }
  }

  /** 跳转到 0–1 进度 */
  seek(ratio: number) {
    const el = this.sample
    if (!el || !el.duration) return
    el.currentTime = clamp01(ratio) * el.duration
  }

  private stopSampleImmediate() {
    if (this.sample) {
      this.sample.pause()
      this.sample = null
    }
    if (this.progressTimer) {
      window.clearInterval(this.progressTimer)
      this.progressTimer = 0
    }
  }

  private wireSampleEvents(roomId: string, el: HTMLAudioElement) {
    el.addEventListener('ended', () => {
      if (this.state.playingId === roomId) this.stop()
    })
    if (this.progressTimer) window.clearInterval(this.progressTimer)
    this.progressTimer = window.setInterval(() => {
      if (this.sample !== el) return
      this.emit({
        duration: el.duration || 0,
        progress: el.duration ? el.currentTime / el.duration : 0,
      })
    }, 250)
  }

  private sampleFades = new WeakMap<HTMLAudioElement, number>()

  private fadeSampleTo(
    el: HTMLAudioElement,
    target: number,
    duration: number,
    onDone?: () => void,
  ) {
    const prev = this.sampleFades.get(el)
    if (prev) cancelAnimationFrame(prev)
    const start = el.volume
    const t0 = performance.now()
    const step = (now: number) => {
      const t = clamp01((now - t0) / duration)
      el.volume = start + (target - start) * t
      if (t < 1) {
        this.sampleFades.set(el, requestAnimationFrame(step))
      } else {
        onDone?.()
      }
    }
    this.sampleFades.set(el, requestAnimationFrame(step))
  }

  /* ── duck / 静音 ──────────────────────────────────── */

  /** ambience 闪避：true → 降至 0.12，false → 恢复基准 */
  duck(on: boolean) {
    this.ducked = on
    if (this.state.ambienceStarted) {
      this.fadeAmbienceTo(this.effectiveAmbienceVolume(), FADE_MS)
    }
  }

  setMuted(muted: boolean) {
    this.emit({ muted })
    if (this.ambience) {
      this.fadeAmbienceTo(this.effectiveAmbienceVolume(), 200)
    }
    if (this.sample) {
      this.sample.volume = muted ? 0 : 1
    }
  }

  toggleMuted() {
    this.setMuted(!this.state.muted)
  }
}

/** 全局单例 */
export const audioManager = new AudioManager()
