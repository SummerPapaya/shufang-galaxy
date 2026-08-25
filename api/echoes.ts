import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import {
  ECHO_REDIS_KEY,
  ECHO_STORE_MAX,
  MESSAGE_MAX,
  NAME_MAX,
  isPublicEcho,
  validateEcho,
  type Echo,
} from '../shared/echoes'

/**
 * GET  /api/echoes  → { echoes: Echo[] }
 * POST /api/echoes  → { echo: Echo }
 *
 * 存储：Vercel KV / Upstash Redis（环境变量 KV_REST_API_* 或 UPSTASH_REDIS_REST_*）
 * 邮箱仅服务端私存（另 key），永不出现在 GET 响应里。
 */

const EMAIL_REDIS_KEY = 'shufang-galaxy:echo-emails:v1'
const RATE_PREFIX = 'shufang-galaxy:echo-rate:'
const RATE_LIMIT = 8
const RATE_WINDOW_SEC = 60 * 60

function redisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function setCors(res: VercelResponse, origin: string | undefined) {
  const allowed = process.env.ECHOES_CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)
  const ok =
    !allowed || allowed.length === 0
      ? '*'
      : origin && allowed.includes(origin)
        ? origin
        : allowed[0]
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
  return req.socket.remoteAddress || 'unknown'
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `echo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function listEchoes(redis: Redis): Promise<Echo[]> {
  const rows = await redis.lrange<Echo | string>(ECHO_REDIS_KEY, 0, ECHO_STORE_MAX - 1)
  return rows
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
  setCors(res, typeof req.headers.origin === 'string' ? req.headers.origin : undefined)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const redis = redisClient()
  if (!redis) {
    res.status(503).json({
      error: 'echo_store_unavailable',
      message: '公共回声库尚未配置（缺少 Vercel KV / Upstash 环境变量）',
    })
    return
  }

  try {
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

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const draft = {
        name: String(body?.name ?? ''),
        email: String(body?.email ?? ''),
        message: String(body?.message ?? ''),
      }
      // 蜜罐：有值视为机器人
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

      const errors = validateEcho(draft)
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

      await redis.lpush(ECHO_REDIS_KEY, echo)
      await redis.ltrim(ECHO_REDIS_KEY, 0, ECHO_STORE_MAX - 1)

      const email = draft.email.trim()
      if (email) {
        await redis.hset(EMAIL_REDIS_KEY, { [echo.id]: email })
      }

      res.status(201).json({ echo })
      return
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS')
    res.status(405).json({ error: 'method_not_allowed' })
  } catch (err) {
    console.error('[api/echoes]', err)
    res.status(500).json({ error: 'server_error', message: '星海暂时听不清，请稍后再试' })
  }
}
