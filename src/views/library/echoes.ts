import { useCallback, useSyncExternalStore } from 'react'
import {
  MESSAGE_MAX,
  NAME_MAX,
  SEED_ECHOES,
  composeEchoes,
  normalizePublicEcho,
  validateEcho,
  type Echo,
  type EchoDraft,
  type EchoFieldError,
} from '../../../shared/echoes'

export type { Echo, EchoDraft, EchoFieldError }
export { MESSAGE_MAX, NAME_MAX, SEED_ECHOES, validateEcho }

/**
 * 「宇宙回声」公共留言墙数据层。
 *
 * - 读写走 `/api/echoes`（本地 Vite 中间件 / 生产 Vercel + KV）
 * - 模块级 store + useSyncExternalStore：EchoWall / EchoField 共享同一份列表
 * - 成功拉取后写入 localStorage 缓存；刷新时先展示缓存，避免 API 短暂失败时留言「消失」
 */

const OWN_IDS_KEY = 'shufang-galaxy:echo-own-ids:v1'
const CACHE_KEY = 'shufang-galaxy:echoes-cache:v1'

function apiBase(): string {
  const fromEnv = import.meta.env.VITE_ECHOES_API as string | undefined
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, '')
  return '/api/echoes'
}

function readOwnIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(OWN_IDS_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function rememberOwnId(id: string) {
  try {
    const next = readOwnIds()
    next.add(id)
    window.localStorage.setItem(OWN_IDS_KEY, JSON.stringify([...next].slice(-80)))
  } catch {
    /* ignore */
  }
}

function readCache(): Echo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizePublicEcho).filter((e): e is Echo => !!e)
  } catch {
    return []
  }
}

function writeCache(list: Echo[]) {
  try {
    const cleaned = list.map(normalizePublicEcho).filter((e): e is Echo => !!e)
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cleaned.slice(0, 300)))
  } catch {
    /* ignore */
  }
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
  return new Date(at).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export type EchoesStatus = 'loading' | 'ready' | 'error'

interface EchoStoreState {
  remote: Echo[]
  status: EchoesStatus
  errorMessage: string | null
  ownIds: Set<string>
}

const listeners = new Set<() => void>()

const cached = readCache()

let store: EchoStoreState = {
  remote: cached,
  status: cached.length > 0 ? 'ready' : 'loading',
  errorMessage: null,
  ownIds: readOwnIds(),
}

let fetchGeneration = 0

function emit() {
  listeners.forEach((l) => l())
}

function setStore(patch: Partial<EchoStoreState>) {
  store = { ...store, ...patch }
  emit()
}

function getSnapshot(): EchoStoreState {
  return store
}

function getServerSnapshot(): EchoStoreState {
  return {
    remote: [],
    status: 'loading',
    errorMessage: null,
    ownIds: new Set(),
  }
}

function subscribe(onChange: () => void): () => void {
  const becameActive = listeners.size === 0
  listeners.add(onChange)
  if (becameActive) void refreshEchoes()
  return () => {
    listeners.delete(onChange)
  }
}

async function refreshEchoes(): Promise<void> {
  const gen = ++fetchGeneration
  try {
    const res = await fetch(apiBase(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null
      throw new Error(payload?.message || `加载失败（${res.status}）`)
    }
    const data = (await res.json()) as { echoes?: Echo[] }
    const list = Array.isArray(data.echoes)
      ? data.echoes.map(normalizePublicEcho).filter((e): e is Echo => !!e)
      : []
    if (gen !== fetchGeneration) return
    writeCache(list)
    setStore({
      remote: list,
      status: 'ready',
      errorMessage: null,
      ownIds: readOwnIds(),
    })
  } catch (err) {
    if (gen !== fetchGeneration) return
    const fallback = store.remote.length > 0 ? store.remote : readCache()
    setStore({
      remote: fallback,
      status: fallback.length > 0 ? 'ready' : 'error',
      errorMessage: err instanceof Error ? err.message : '星海暂时听不清',
      ownIds: readOwnIds(),
    })
  }
}

async function submitEcho(draft: EchoDraft): Promise<Echo> {
  const found = validateEcho(draft)
  if (Object.keys(found).length > 0) {
    const first = Object.values(found).find((v): v is string => typeof v === 'string')
    throw new Error(first || '请检查留言内容')
  }

  const res = await fetch(apiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      name: draft.name,
      email: draft.email,
      message: draft.message,
      website: '',
    }),
  })

  const payload = (await res.json().catch(() => null)) as
    | { echo?: Echo; message?: string; errors?: EchoFieldError }
    | null

  if (!res.ok) {
    const fromFields = payload?.errors && Object.values(payload.errors)[0]
    throw new Error(
      (typeof fromFields === 'string' ? fromFields : null) ||
        payload?.message ||
        `提交失败（${res.status}）`,
    )
  }

  const echo = normalizePublicEcho(payload?.echo)
  if (!echo) {
    throw new Error('星海没有回传这颗星，请稍后再试')
  }

  rememberOwnId(echo.id)
  const next = [echo, ...store.remote.filter((e) => e.id !== echo.id)]
  writeCache(next)
  // 乐观写入共享列表，确保飞星落地后 EchoField 立刻能看到
  setStore({
    remote: next,
    status: 'ready',
    errorMessage: null,
    ownIds: readOwnIds(),
  })

  // 后台再拉一次，与服务器对齐（失败时保留乐观结果 + 缓存）
  void refreshEchoes()
  return echo
}

export interface UseEchoesResult {
  echoes: Echo[]
  status: EchoesStatus
  /** 本机提交过的公共回声数量（用于轻提示，非权威） */
  ownCount: number
  errorMessage: string | null
  refresh: () => Promise<void>
  submit: (draft: EchoDraft) => Promise<Echo>
}

export function useEchoes(): UseEchoesResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const refresh = useCallback(() => refreshEchoes(), [])
  const submit = useCallback((draft: EchoDraft) => submitEcho(draft), [])

  const echoes = composeEchoes(state.remote)
  const ownCount = echoes.filter((e) => !e.seed && state.ownIds.has(e.id)).length

  return {
    echoes,
    status: state.status,
    ownCount,
    errorMessage: state.errorMessage,
    refresh,
    submit,
  }
}
