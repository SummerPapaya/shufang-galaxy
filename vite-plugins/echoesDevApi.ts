import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  ECHO_STORE_MAX,
  isPublicEcho,
  validateEcho,
  type Echo,
} from '../shared/echoes'

/**
 * 本地开发：用内存模拟 /api/echoes，无需配置 KV。
 * 生产环境由 Vercel Serverless + Upstash/KV 接管。
 */

const memory: Echo[] = []

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

export function echoesDevApi(): Plugin {
  return {
    name: 'echoes-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/api/echoes') return next()

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
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
