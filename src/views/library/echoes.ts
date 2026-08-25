import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MESSAGE_MAX,
  NAME_MAX,
  SEED_ECHOES,
  composeEchoes,
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
 * - 可通过 `VITE_ECHOES_API` 指向独立 API（例如 GitHub Pages 前端 + Vercel 后端）
 * - 邮箱不会出现在列表响应里；示例星仅前端展示
 */

const OWN_IDS_KEY = 'shufang-galaxy:echo-own-ids:v1'

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
  const [remote, setRemote] = useState<Echo[]>([])
  const [status, setStatus] = useState<EchoesStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [ownIds, setOwnIds] = useState<Set<string>>(() => readOwnIds())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiBase(), { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(payload?.message || `加载失败（${res.status}）`)
      }
      const data = (await res.json()) as { echoes?: Echo[] }
      const list = Array.isArray(data.echoes) ? data.echoes : []
      if (!alive.current) return
      setRemote(list)
      setStatus('ready')
      setErrorMessage(null)
    } catch (err) {
      if (!alive.current) return
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : '星海暂时听不清')
      setRemote([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submit = useCallback(async (draft: EchoDraft): Promise<Echo> => {
    const found = validateEcho(draft)
    if (Object.keys(found).length > 0) {
      const first = Object.values(found).find((v): v is string => typeof v === 'string')
      throw new Error(first || '请检查留言内容')
    }

    const res = await fetch(apiBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
      throw new Error(fromFields || payload?.message || `提交失败（${res.status}）`)
    }

    const echo = payload?.echo
    if (!echo || typeof echo.id !== 'string') {
      throw new Error('星海没有回传这颗星，请稍后再试')
    }

    rememberOwnId(echo.id)
    setOwnIds(readOwnIds())
    setRemote((prev) => [echo, ...prev.filter((e) => e.id !== echo.id)])
    setStatus('ready')
    setErrorMessage(null)
    return echo
  }, [])

  const echoes = composeEchoes(remote)
  const ownCount = echoes.filter((e: Echo) => !e.seed && ownIds.has(e.id)).length

  return { echoes, status, ownCount, errorMessage, refresh, submit }
}
