import { useCallback, useSyncExternalStore } from 'react'

/**
 * 「宇宙回声」留言数据层。
 *
 * 站点是纯静态托管（GitHub Pages），没有后端可写；因此回声先落在
 * localStorage：访客提交后立刻在自己的星海里看到留言，刷新仍在。
 * 若日后接入表单服务（Formspree / Cloudflare Worker 等），
 * 只要把 submitEcho 内部换成一次 POST，UI 层无需改动。
 */

export interface Echo {
  id: string
  /** 昵称（必填） */
  name: string
  /** 邮箱（可选，仅本地留存，不在墙上公开） */
  email?: string
  /** 留言正文 */
  message: string
  /** 提交时间戳（ms） */
  at: number
  /** 是否为初始展示的示例回声（不可删除，仅作氛围） */
  seed?: boolean
}

export const NAME_MAX = 24
export const MESSAGE_MAX = 200

const STORAGE_KEY = 'shufang-galaxy:echoes:v1'

/** 星海里预先回响的几条示例留言（首次进入不至于空荡） */
const SEED_ECHOES: Echo[] = [
  {
    id: 'seed-1',
    name: '拾光者',
    message: '在通勤的地铁里听完一集，抬头发现窗外的灯火也温柔了。',
    at: Date.UTC(2026, 6, 14, 12, 20),
    seed: true,
  },
  {
    id: 'seed-2',
    name: '南山雀',
    message: '愿每个深夜赶稿的人，都有一间自己的书房可以躲一躲。',
    at: Date.UTC(2026, 7, 2, 15, 45),
    seed: true,
  },
  {
    id: 'seed-3',
    name: '海边的卡夫卡',
    message: '声音真的可以带人走很远。谢谢你们把书读成了星星。',
    at: Date.UTC(2026, 7, 19, 3, 10),
    seed: true,
  },
]

function readStored(): Echo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is Echo =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as Echo).id === 'string' &&
        typeof (e as Echo).name === 'string' &&
        typeof (e as Echo).message === 'string' &&
        typeof (e as Echo).at === 'number',
    )
  } catch {
    return []
  }
}

function writeStored(list: Echo[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* 隐私模式 / 配额已满：这一条回声只活在当前会话里 */
  }
}

/* ── 模块级 store：localStorage 是外部系统，用 useSyncExternalStore 订阅 ── */

let snapshot: Echo[] | null = null
const listeners = new Set<() => void>()

/** 新的在前，示例回声垫在最后 */
function compose(stored: Echo[]): Echo[] {
  return [...stored].sort((a, b) => b.at - a.at).concat(SEED_ECHOES)
}

function getSnapshot(): Echo[] {
  if (snapshot === null) snapshot = compose(readStored())
  return snapshot
}

/** SSR / 预渲染时只给示例回声，避免读不到 localStorage */
function getServerSnapshot(): Echo[] {
  return SEED_ECHOES
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // 跨标签页同步：另一个标签留言后这里也会刷新
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return
    snapshot = compose(readStored())
    listeners.forEach((l) => l())
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export interface EchoDraft {
  name: string
  email: string
  message: string
}

export type EchoFieldError = Partial<Record<'name' | 'email' | 'message', string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEcho(draft: EchoDraft): EchoFieldError {
  const errors: EchoFieldError = {}
  const name = draft.name.trim()
  const message = draft.message.trim()
  const email = draft.email.trim()

  if (!name) errors.name = '留个称呼吧，星海需要知道是谁在说话'
  else if (name.length > NAME_MAX) errors.name = `昵称请不超过 ${NAME_MAX} 字`

  if (!message) errors.message = '还没有内容，写一句想说的话'
  else if (message.length > MESSAGE_MAX) errors.message = `留言请不超过 ${MESSAGE_MAX} 字`

  if (email && !EMAIL_RE.test(email)) errors.email = '邮箱格式看起来不太对'

  return errors
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `echo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期 */
export function formatEchoTime(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return new Date(at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

export interface UseEchoesResult {
  echoes: Echo[]
  /** 访客自己提交的条数（示例回声不计） */
  ownCount: number
  submit: (draft: EchoDraft) => Echo
}

export function useEchoes(): UseEchoesResult {
  const echoes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const submit = useCallback((draft: EchoDraft): Echo => {
    const echo: Echo = {
      id: makeId(),
      name: draft.name.trim(),
      message: draft.message.trim(),
      at: Date.now(),
    }
    const email = draft.email.trim()
    if (email) echo.email = email

    const next = [echo, ...readStored()]
    writeStored(next)
    snapshot = compose(next)
    listeners.forEach((l) => l())
    return echo
  }, [])

  return { echoes, ownCount: echoes.filter((e) => !e.seed).length, submit }
}
