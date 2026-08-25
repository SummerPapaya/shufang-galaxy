import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'

/**
 * 宇宙回声 · 管理接口（需 ECHOES_ADMIN_SECRET）
 *
 * GET    /api/echoes/admin          → { echoes: AdminEcho[] }  （含可选邮箱）
 * DELETE /api/echoes/admin?id=...   → { ok: true, id }
 *
 * 鉴权：Authorization: Bearer <secret> 或 x-echoes-admin-secret: <secret>
 */

interface Echo {
  id: string
  name: string
  message: string
  at: number
}

interface AdminEcho extends Echo {
  email?: string
}

const ECHO_STORE_MAX = 300
const ECHO_REDIS_KEY = 'shufang-galaxy:echoes:v1'
const EMAIL_REDIS_KEY = 'shufang-galaxy:echo-emails:v1'

function redisClient(): Redis | null {
  try {
    const url =
      process.env.shufang_KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL
    const token =
      process.env.shufang_KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN
    if (!url || !token) return null
    if (url.startsWith('redis://') || url.startsWith('rediss://')) return null
    return new Redis({ url, token })
  } catch {
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-echoes-admin-secret')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (ok !== '*') res.setHeader('Vary', 'Origin')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function readAdminSecret(req: VercelRequest): string {
  const header = req.headers['x-echoes-admin-secret']
  if (typeof header === 'string' && header.trim()) return header.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return ''
}

function assertAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.ECHOES_ADMIN_SECRET?.trim()
  if (!expected) {
    res.status(503).json({
      error: 'admin_not_configured',
      message: '请在 Vercel 环境变量中设置 ECHOES_ADMIN_SECRET 后重新部署',
    })
    return false
  }
  const provided = readAdminSecret(req)
  if (!provided || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'unauthorized', message: '管理密钥不正确' })
    return false
  }
  return true
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

function parseRow(row: unknown): Echo | null {
  if (typeof row === 'string') {
    try {
      const parsed: unknown = JSON.parse(row)
      return isPublicEcho(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return isPublicEcho(row) ? row : null
}

async function listEchoes(redis: Redis): Promise<Echo[]> {
  const rows = await redis.lrange(ECHO_REDIS_KEY, 0, ECHO_STORE_MAX - 1)
  return (rows as unknown[]).map(parseRow).filter((e): e is Echo => !!e)
}

async function deleteEcho(redis: Redis, id: string): Promise<boolean> {
  const rows = await redis.lrange(ECHO_REDIS_KEY, 0, ECHO_STORE_MAX - 1)
  const kept: string[] = []
  let removed = false
  for (const row of rows as unknown[]) {
    const echo = parseRow(row)
    if (echo && echo.id === id) {
      removed = true
      continue
    }
    if (echo) kept.push(JSON.stringify(echo))
    else if (typeof row === 'string') kept.push(row)
    else kept.push(JSON.stringify(row))
  }
  if (!removed) return false
  await redis.del(ECHO_REDIS_KEY)
  if (kept.length > 0) {
    // rpush 保持「新→旧」需 reverse：原 list 是 lpush 的新在左
    await redis.rpush(ECHO_REDIS_KEY, ...kept)
  }
  await redis.hdel(EMAIL_REDIS_KEY, id)
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    setCors(res, typeof req.headers.origin === 'string' ? req.headers.origin : undefined)

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    if (!assertAdmin(req, res)) return

    const redis = redisClient()
    if (!redis) {
      res.status(503).json({ error: 'echo_store_unavailable', message: '回声库未配置' })
      return
    }

    if (req.method === 'GET') {
      const echoes = await listEchoes(redis)
      const emails = (await redis.hgetall<Record<string, string>>(EMAIL_REDIS_KEY)) || {}
      const enriched: AdminEcho[] = echoes.map((e) => {
        const email = emails[e.id]
        return email ? { ...e, email } : { ...e }
      })
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json({ echoes: enriched })
      return
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''
      if (!id) {
        res.status(400).json({ error: 'missing_id', message: '请提供要删除的留言 id' })
        return
      }
      const ok = await deleteEcho(redis, id)
      if (!ok) {
        res.status(404).json({ error: 'not_found', message: '没有找到这条回声' })
        return
      }
      res.status(200).json({ ok: true, id })
      return
    }

    res.setHeader('Allow', 'GET, DELETE, OPTIONS')
    res.status(405).json({ error: 'method_not_allowed' })
  } catch (err) {
    console.error('[api/echoes/admin]', err)
    res.status(500).json({
      error: 'server_error',
      message: '管理接口暂时不可用',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
