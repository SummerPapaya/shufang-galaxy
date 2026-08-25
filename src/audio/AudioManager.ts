/**
 * 全局音频单例（design.md §8）
 *
 * - 星河背景音：在 trailer1 / trailer2 片花间随机（或锁定）播放；
 *   universe 0.35，landing 0.15；朗读 sample 播放时暂停片花，结束后恢复
 * - 朗读者 sample：书房详情播放器通过 play(id) 触发
 * - 浏览器自动播放策略：首次用户手势（点击「进入星空」）时调用 unlock()
 * - 同一时间只有一个朗读者声源；切换时 300ms 淡出旧音频
 *
 * API：
 *   unlock() / startAmbience() / setAmbienceLevel(level)
 *   setAmbienceMode(mode) / cycleAmbienceMode()
 *   play(roomId) / stop() / duck(on) / setMuted(muted) / toggleMuted()
 *   getState() / subscribe(listener)（AudioToggle 等 UI 订阅用）
 */

export type AmbienceLevel = 'landing' | 'universe'

/** 片花音轨 */
export type AmbienceTrackId = 'trailer1' | 'trailer2'

/**
 * random — 片花间随机续播（默认）
 * trailer1 / trailer2 — 锁定某一版片花
 * muted — 静音（保留上次非静音模式，取消静音时恢复）
 */
export type AmbienceMode = 'random' | AmbienceTrackId | 'muted'

export interface AmbienceTrackMeta {
  id: AmbienceTrackId
  src: string
  label: string
  shortLabel: string
}

export const AMBIENCE_TRACKS: Record<AmbienceTrackId, AmbienceTrackMeta> = {
  trailer1: {
    id: 'trailer1',
    src: '/assets/audio/trailer1.mp3',
    label: '「一个人的书房」片花（男声版）',
    shortLabel: '男声片花',
  },
  trailer2: {
    id: 'trailer2',
    src: '/assets/audio/trailer2.mp3',
    label: '「一个人的书房」片花（女声版）',
    shortLabel: '女声片花',
  },
}

export const AMBIENCE_TRACK_LIST: AmbienceTrackMeta[] = [
  AMBIENCE_TRACKS.trailer1,
  AMBIENCE_TRACKS.trailer2,
]

/** trailer 缺失时回退到旧环境音，避免空白 */
const AMBIENCE_FALLBACK_SRC = '/assets/audio/ambience.mp3'

export interface AudioManagerState {
  /** 全局静音（与 ambienceMode === 'muted' 同步） */
  muted: boolean
  /** 背景片花模式 */
  ambienceMode: AmbienceMode
  /** 当前正在播 / 刚选中的片花（静音时仍保留上次曲目） */
  ambienceTrackId: AmbienceTrackId
  /** ambience 是否已启动 */
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

/** 从绝对 URL 或相对路径取出 pathname，便于比较片花 src */
function audioPathname(src: string): string {
  if (!src) return ''
  try {
    return new URL(src, 'http://local').pathname
  } catch {
    return src
  }
}

function pickRandomTrack(exclude?: AmbienceTrackId | null): AmbienceTrackId {
  const ids = AMBIENCE_TRACK_LIST.map((t) => t.id)
  if (ids.length === 0) return 'trailer1'
  if (ids.length === 1) return ids[0]
  const pool = exclude ? ids.filter((id) => id !== exclude) : ids
  return pool[Math.floor(Math.random() * pool.length)] ?? ids[0]
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
  /** 取消静音时恢复的模式 */
  private modeBeforeMute: Exclude<AmbienceMode, 'muted'> = 'random'

  private state: AudioManagerState = {
    muted: false,
    ambienceMode: 'random',
    ambienceTrackId: pickRandomTrack(),
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

  /**
   * 在首次用户手势（点击「进入星空」）中调用。
   * 必须同步发起 play()：若先 await 网络请求再 play，会脱离手势上下文被浏览器静默拦截。
   */
  unlock() {
    if (this.unlocked) return
    this.unlocked = true
    this.startAmbience('landing')
  }

  /* ── ambience / 片花 ──────────────────────────────── */

  /** 启动星河背景片花（若未 unlock 则仅记录意图，unlock 后生效） */
  startAmbience(level: AmbienceLevel = 'landing') {
    this.ambienceTarget = AMBIENCE_VOLUME[level]
    if (!this.unlocked) return
    if (this.state.ambienceMode === 'muted') {
      this.emit({ ambienceStarted: true, muted: true })
      return
    }
    const trackId =
      this.state.ambienceMode === 'random'
        ? this.state.ambienceTrackId
        : this.state.ambienceMode
    this.playAmbienceTrack(trackId, { fadeIn: true })
  }

  /** 切换 ambience 基准音量：landing 0.15 / universe 0.35（500ms 淡入淡出） */
  setAmbienceLevel(level: AmbienceLevel) {
    this.ambienceTarget = AMBIENCE_VOLUME[level]
    if (this.state.ambienceStarted && this.state.ambienceMode !== 'muted') {
      this.fadeAmbienceTo(this.effectiveAmbienceVolume(), FADE_MS)
    }
  }

  /** 选择随机 / 男声 / 女声 / 静音 */
  setAmbienceMode(mode: AmbienceMode) {
    if (mode === 'muted') {
      if (this.state.ambienceMode !== 'muted') {
        this.modeBeforeMute = this.state.ambienceMode
      }
      this.emit({ ambienceMode: 'muted', muted: true })
      this.silenceAmbience()
      this.silenceSample()
      return
    }

    this.modeBeforeMute = mode
    const trackId = mode === 'random' ? pickRandomTrack(this.state.ambienceTrackId) : mode
    this.emit({ ambienceMode: mode, muted: false, ambienceTrackId: trackId })
    if (this.sample) {
      this.sample.muted = false
      this.sample.volume = 1
      if (this.state.playing && this.state.playingId) {
        void this.sample.play().catch(() => {})
      }
    }
    // 菜单点击是用户手势：即使还没点「进入星空」，也应立刻起播，
    // 这样右下角声波才能在片花真正响起时动起来。
    this.unlocked = true
    this.playAmbienceTrack(trackId, { fadeIn: true })
  }

  /** 右下角按钮：随机 → 男声 → 女声 → 静音 → 随机 … */
  cycleAmbienceMode() {
    const order: AmbienceMode[] = ['random', 'trailer1', 'trailer2', 'muted']
    const i = order.indexOf(this.state.ambienceMode)
    const next = order[(i + 1) % order.length] ?? 'random'
    this.setAmbienceMode(next)
  }

  private ensureAmbienceEl(): HTMLAudioElement {
    if (!this.ambience) {
      this.ambience = new Audio()
      this.ambience.preload = 'auto'
      this.ambience.loop = false
      this.ambience.volume = 0
      this.ambience.addEventListener('ended', this.onAmbienceEnded)
      this.ambience.addEventListener('error', this.onAmbienceError)
    }
    return this.ambience
  }

  /**
   * 同步起播片花（不可在 play 前 await，否则脱离用户手势被 autoplay 拦截）。
   * 资源缺失时由 onAmbienceError 回退到 ambience.mp3。
   */
  private playAmbienceTrack(
    trackId: AmbienceTrackId,
    opts: { fadeIn?: boolean; srcOverride?: string } = {},
  ) {
    if (this.state.ambienceMode === 'muted' || this.state.muted) {
      this.silenceAmbience()
      return
    }

    const meta = AMBIENCE_TRACKS[trackId]
    const src = opts.srcOverride ?? meta.src
    const el = this.ensureAmbienceEl()
    const currentPath = audioPathname(el.src)
    const sameSrc = currentPath === src || currentPath.endsWith(src)
    const switching = el.src !== '' && !sameSrc && !el.paused

    const start = () => {
      if (this.state.ambienceMode === 'muted' || this.state.muted) {
        this.silenceAmbience()
        return
      }
      el.loop = false
      el.muted = false
      const pathNow = audioPathname(el.src)
      const already = pathNow === src || pathNow.endsWith(src)
      if (!already) {
        el.src = src
      } else {
        try {
          el.currentTime = 0
        } catch {
          /* ignore seek errors while loading */
        }
      }
      this.emit({
        ambienceStarted: true,
        ambienceTrackId: trackId,
        muted: false,
      })
      const playPromise = el.play()
      if (playPromise) {
        void playPromise.catch(() => {
          /* 仍可能被策略拦截；下一次菜单手势会再试 */
        })
      }
      this.fadeAmbienceTo(
        this.effectiveAmbienceVolume(),
        opts.fadeIn === false ? 0 : FADE_MS,
      )
    }

    if (switching) {
      this.fadeAmbienceTo(0, SWAP_FADE_MS, () => start())
    } else {
      start()
    }
  }

  private onAmbienceEnded = () => {
    if (this.state.ambienceMode === 'muted' || this.state.muted || !this.unlocked) return
    if (this.state.ambienceMode === 'random') {
      const next = pickRandomTrack(this.state.ambienceTrackId)
      this.playAmbienceTrack(next, { fadeIn: true })
      return
    }
    // 锁定某一版：播完再播同一首
    this.playAmbienceTrack(this.state.ambienceMode, { fadeIn: true })
  }

  /** 片花 404 / 解码失败时回退旧环境音，避免完全静音 */
  private onAmbienceError = () => {
    if (this.state.ambienceMode === 'muted' || this.state.muted) return
    const el = this.ambience
    if (!el) return
    const path = audioPathname(el.src)
    if (path.endsWith(AMBIENCE_FALLBACK_SRC) || path.includes('ambience.mp3')) return
    this.playAmbienceTrack(this.state.ambienceTrackId, {
      fadeIn: true,
      srcOverride: AMBIENCE_FALLBACK_SRC,
    })
  }

  /**
   * 真正关掉背景片花。
   * iOS Safari 忽略 HTMLAudioElement.volume，必须用 muted + pause。
   */
  private silenceAmbience() {
    cancelAnimationFrame(this.fadeRaf)
    this.fadeRaf = 0
    const el = this.ambience
    if (!el) return
    el.muted = true
    el.volume = 0
    el.pause()
  }

  private silenceSample() {
    const el = this.sample
    if (!el) return
    el.muted = true
    el.volume = 0
    el.pause()
  }

  private effectiveAmbienceVolume(): number {
    if (this.state.muted || this.state.ambienceMode === 'muted') return 0
    return this.ducked ? DUCK_VOLUME : this.ambienceTarget
  }

  private fadeAmbienceTo(target: number, duration: number, onDone?: () => void) {
    const el = this.ambience
    if (!el) {
      onDone?.()
      return
    }
    // 静音态不要再把 volume 拉回去（且 iOS 上 volume 本来就无效）
    if ((this.state.muted || this.state.ambienceMode === 'muted') && target > 0) {
      this.silenceAmbience()
      onDone?.()
      return
    }
    cancelAnimationFrame(this.fadeRaf)
    const start = el.volume
    const t0 = performance.now()
    if (duration <= 0) {
      el.volume = target
      if (target <= 0) {
        el.muted = true
      } else {
        el.muted = false
      }
      onDone?.()
      return
    }
    const step = (now: number) => {
      if (this.state.muted || this.state.ambienceMode === 'muted') {
        this.silenceAmbience()
        onDone?.()
        return
      }
      const t = clamp01((now - t0) / duration)
      el.volume = start + (target - start) * t
      if (t < 1) this.fadeRaf = requestAnimationFrame(step)
      else {
        if (target <= 0) el.muted = true
        onDone?.()
      }
    }
    this.fadeRaf = requestAnimationFrame(step)
  }

  /* ── 朗读者 sample ────────────────────────────────── */

  /**
   * 播放某书房的朗读 sample（淡入）；若有其它 sample 在播，300ms 淡出后切换。
   * 播放期间暂停背景片花，停止后恢复。
   */
  play(roomId: string, src?: string) {
    const url = src ?? `/assets/audio/${roomId}.mp3`
    this.duck(true)

    const startNew = () => {
      this.stopSampleImmediate()
      const el = new Audio(url)
      el.volume = 0
      el.muted = this.state.muted || this.state.ambienceMode === 'muted'
      this.sample = el
      this.wireSampleEvents(roomId, el)
      void el.play().catch(() => {})
      this.fadeSampleTo(
        el,
        this.state.muted || this.state.ambienceMode === 'muted' ? 0 : 1,
        FADE_MS,
      )
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

  /** ambience 闪避：朗读时真正暂停片花（iOS 上 volume 不可靠），停止后恢复 */
  duck(on: boolean) {
    this.ducked = on
    if (!this.state.ambienceStarted) return
    if (on) {
      this.silenceAmbience()
      return
    }
    if (this.state.muted || this.state.ambienceMode === 'muted') {
      this.silenceAmbience()
      return
    }
    const el = this.ambience
    if (!el) return
    el.muted = false
    void el.play().catch(() => {})
    this.fadeAmbienceTo(this.effectiveAmbienceVolume(), FADE_MS)
  }

  setMuted(muted: boolean) {
    if (muted) this.setAmbienceMode('muted')
    else this.setAmbienceMode(this.modeBeforeMute)
  }

  toggleMuted() {
    this.setMuted(!(this.state.muted || this.state.ambienceMode === 'muted'))
  }
}

/** 全局单例 */
export const audioManager = new AudioManager()
