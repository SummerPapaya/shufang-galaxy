import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'

/**
 * GET  /api/echoes  → { echoes: Echo[] }
 * POST /api/echoes  → { echo: Echo }
 *
 * 自包含实现（避免 Vercel 打包时无法解析 ../shared）。
 * 存储：Upstash Redis（UPSTASH_REDIS_REST_* 或 KV_REST_API_*）
 */

interface Echo {
  id: string
  name: string
  message: string
  at: number
}

const NAME_MAX = 24
const MESSAGE_MAX = 200
const ECHO_STORE_MAX = 300
const ECHO_REDIS_KEY = 'shufang-galaxy:echoes:v1'
const EMAIL_REDIS_KEY = 'shufang-galaxy:echo-emails:v1'
const RATE_PREFIX = 'shufang-galaxy:echo-rate:'
const RATE_LIMIT = 8
const RATE_WINDOW_SEC = 60 * 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function envPresence() {
  return {
    UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
    KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
  }
}

function redisClient(): Redis | null {
  try {
    const url =
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_URL
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_TOKEN
    // REST client needs the REST URL (usually https://….upstash.io)
    if (!url || !token) return null
    if (url.startsWith('redis://') || url.startsWith('rediss://')) {
      console.error('[api/echoes] got TCP redis URL; need UPSTASH_REDIS_REST_URL instead')
      return null
    }
    return new Redis({ url, token })
  } catch (err) {
    console.error('[api/echoes] redis init failed', err)
    return null
  }
}

function setCors(res: VercelResponse, origin: string | undefined) {
  const allowed = process.env.ECHOES_CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)
  const ok =
    !allowed || allowed.length === 0
      ? '*'
      : origin && allowed.includes(origin)
        ? origin
        : allowed[0]!
  res.setHeader('Access-Control-Allow-Origin', ok)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (ok !== '*') res.setHeader('Vary', 'Origin')
}

function clientIp(req: VercelRequest): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim()
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0]!.trim()
  return req.socket?.remoteAddress || 'unknown'
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `echo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isPublicEcho(value: unknown): value is Echo {
  if (!value || typeof value !== 'object') return false
  const e = value as Echo
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.message === 'string' &&
    typeof e.at === 'number'
  )
}

function validate(draft: { name: string; email: string; message: string }) {
  const errors: Record<string, string> = {}
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

async function listEchoes(redis: Redis): Promise<Echo[]> {
  const rows = await redis.lrange(ECHO_REDIS_KEY, 0, ECHO_STORE_MAX - 1)
  return (rows as unknown[])
    .map((row) => {
      if (typeof row === 'string') {
        try {
          return JSON.parse(row) as unknown
        } catch {
          return null
        }
      }
      return row
    })
    .filter(isPublicEcho)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    setCors(res, typeof req.headers.origin === 'string' ? req.headers.origin : undefined)

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    const redis = redisClient()
    if (!redis) {
      res.status(503).json({
        error: 'echo_store_unavailable',
        message:
          '公共回声库尚未配置。请在 Vercel → Storage 接入 Upstash Redis，确认 Environment Variables 里有 UPSTASH_REDIS_REST_URL 与 UPSTASH_REDIS_REST_TOKEN（Production），然后 Redeploy。',
        detected: envPresence(),
      })
      return
    }

    if (req.method === 'GET') {
      const echoes = await listEchoes(redis)
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60')
      res.status(200).json({ echoes })
      return
    }

    if (req.method === 'POST') {
      const ip = clientIp(req)
      const rateKey = `${RATE_PREFIX}${ip}`
      const hits = await redis.incr(rateKey)
      if (hits === 1) await redis.expire(rateKey, RATE_WINDOW_SEC)
      if (hits > RATE_LIMIT) {
        res.status(429).json({ error: 'rate_limited', message: '今天的星光有点拥挤，稍后再写一句吧' })
        return
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      const draft = {
        name: String(body?.name ?? ''),
        email: String(body?.email ?? ''),
        message: String(body?.message ?? ''),
      }

      if (body?.website) {
        res.status(200).json({
          echo: {
            id: makeId(),
            name: draft.name.slice(0, NAME_MAX) || '访客',
            message: draft.message.slice(0, MESSAGE_MAX) || '…',
            at: Date.now(),
          },
        })
        return
      }

      const errors = validate(draft)
      if (Object.keys(errors).length > 0) {
        res.status(400).json({ error: 'validation', errors })
        return
      }

      const echo: Echo = {
        id: makeId(),
        name: draft.name.trim().slice(0, NAME_MAX),
        message: draft.message.trim().slice(0, MESSAGE_MAX),
        at: Date.now(),
      }

      await redis.lpush(ECHO_REDIS_KEY, JSON.stringify(echo))
      await redis.ltrim(ECHO_REDIS_KEY, 0, ECHO_STORE_MAX - 1)

      const email = draft.email.trim()
      if (email) await redis.hset(EMAIL_REDIS_KEY, { [echo.id]: email })

      res.status(201).json({ echo })
      return
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.status(405).json({ error: 'method_not_allowed' })
  } catch (err) {
    console.error('[api/echoes]', err)
    try {
      setCors(res, typeof req.headers.origin === 'string' ? req.headers.origin : undefined)
    } catch {
      /* ignore */
    }
    res.status(500).json({
      error: 'server_error',
      message: '星海暂时听不清，请稍后再试',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
