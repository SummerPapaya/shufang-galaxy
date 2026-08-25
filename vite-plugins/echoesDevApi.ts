import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  ECHO_STORE_MAX,
  isPublicEcho,
  validateEcho,
  type Echo,
} from '../shared/echoes'

/**
 * 本地开发：用内存模拟 /api/echoes 与 /api/echoes/admin
 */

const memory: Echo[] = []
const emails = new Map<string, string>()
const DEV_ADMIN_SECRET = process.env.ECHOES_ADMIN_SECRET || 'dev-echoes-admin'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `echo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readAdminSecret(req: IncomingMessage): string {
  const header = req.headers['x-echoes-admin-secret']
  if (typeof header === 'string' && header.trim()) return header.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return ''
}

export function echoesDevApi(): Plugin {
  return {
    name: 'echoes-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/api/echoes' && url !== '/api/echoes/admin') return next()

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-echoes-admin-secret')
          res.end()
          return
        }

        if (url === '/api/echoes/admin') {
          if (readAdminSecret(req) !== DEV_ADMIN_SECRET) {
            sendJson(res, 401, { error: 'unauthorized', message: '管理密钥不正确' })
            return
          }

          if (req.method === 'GET') {
            sendJson(res, 200, {
              echoes: memory.filter(isPublicEcho).map((e) => {
                const email = emails.get(e.id)
                return email ? { ...e, email } : e
              }),
            })
            return
          }

          if (req.method === 'DELETE') {
            const id = new URL(req.url || '', 'http://local').searchParams.get('id') || ''
            if (!id) {
              sendJson(res, 400, { error: 'missing_id', message: '请提供要删除的留言 id' })
              return
            }
            const before = memory.length
            for (let i = memory.length - 1; i >= 0; i--) {
              if (memory[i]!.id === id) memory.splice(i, 1)
            }
            emails.delete(id)
            if (memory.length === before) {
              sendJson(res, 404, { error: 'not_found', message: '没有找到这条回声' })
              return
            }
            sendJson(res, 200, { ok: true, id })
            return
          }

          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        if (req.method === 'GET') {
          sendJson(res, 200, { echoes: memory.filter(isPublicEcho) })
          return
        }

        if (req.method === 'POST') {
          try {
            const raw = await readBody(req)
            const body = raw ? JSON.parse(raw) : {}
            const draft = {
              name: String(body?.name ?? ''),
              email: String(body?.email ?? ''),
              message: String(body?.message ?? ''),
            }
            const errors = validateEcho(draft)
            if (Object.keys(errors).length > 0) {
              sendJson(res, 400, { error: 'validation', errors })
              return
            }
            const echo: Echo = {
              id: makeId(),
              name: draft.name.trim(),
              message: draft.message.trim(),
              at: Date.now(),
            }
            memory.unshift(echo)
            if (memory.length > ECHO_STORE_MAX) memory.length = ECHO_STORE_MAX
            if (draft.email.trim()) emails.set(echo.id, draft.email.trim())
            sendJson(res, 201, { echo })
          } catch {
            sendJson(res, 400, { error: 'bad_request', message: '无法解析留言' })
          }
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })
    },
  }
}
