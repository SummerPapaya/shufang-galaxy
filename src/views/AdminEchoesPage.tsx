import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * 宇宙回声 · 管理页（审核 / 删除）
 * 入口：主站或 Vercel 域名打开 `/#/admin/echoes`
 * 密钥：Vercel 环境变量 ECHOES_ADMIN_SECRET（浏览器只存在 sessionStorage）
 */

interface AdminEcho {
  id: string
  name: string
  message: string
  at: number
  email?: string
}

const SECRET_KEY = 'shufang-galaxy:echo-admin-secret'

function apiAdminBase(): string {
  const fromEnv = import.meta.env.VITE_ECHOES_API as string | undefined
  const base = fromEnv && fromEnv.trim() ? fromEnv.replace(/\/$/, '') : '/api/echoes'
  return `${base}/admin`
}

function formatTime(at: number): string {
  try {
    return new Date(at).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(at)
  }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** UTF-8 BOM CSV，Excel 可直接打开中文 */
function downloadEchoesCsv(rows: AdminEcho[], filename: string) {
  const header = ['id', 'name', 'email', 'message', 'at', 'time']
  const lines = [
    header.join(','),
    ...rows.map((e) =>
      [
        csvEscape(e.id),
        csvEscape(e.name),
        csvEscape(e.email || ''),
        csvEscape(e.message),
        String(e.at),
        csvEscape(formatTime(e.at)),
      ].join(','),
    ),
  ]
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function stampForFilename(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export default function AdminEchoesPage() {
  const [secret, setSecret] = useState(() => {
    try {
      return sessionStorage.getItem(SECRET_KEY) || ''
    } catch {
      return ''
    }
  })
  const [draftSecret, setDraftSecret] = useState(secret)
  const [echoes, setEchoes] = useState<AdminEcho[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const authed = secret.trim().length > 0

  const load = useCallback(async (token: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiAdminBase(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = (await res.json().catch(() => null)) as
        | { echoes?: AdminEcho[]; message?: string }
        | null
      if (!res.ok) throw new Error(data?.message || `加载失败（${res.status}）`)
      setEchoes(Array.isArray(data?.echoes) ? data!.echoes! : [])
    } catch (err) {
      setEchoes([])
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authed) void load(secret.trim())
  }, [authed, secret, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return echoes
    return echoes.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    )
  }, [echoes, query])

  const unlock = (e: React.FormEvent) => {
    e.preventDefault()
    const next = draftSecret.trim()
    if (!next) {
      setError('请输入管理密钥')
      return
    }
    try {
      sessionStorage.setItem(SECRET_KEY, next)
    } catch {
      /* ignore */
    }
    setSecret(next)
  }

  const logout = () => {
    try {
      sessionStorage.removeItem(SECRET_KEY)
    } catch {
      /* ignore */
    }
    setSecret('')
    setDraftSecret('')
    setEchoes([])
    setError(null)
  }

  const remove = async (id: string) => {
    if (!confirm('确定删除这条回声？删除后星空中也会消失。')) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`${apiAdminBase()}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${secret.trim()}`,
        },
      })
      const data = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) throw new Error(data?.message || `删除失败（${res.status}）`)
      setEchoes((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-[#070b18] px-4 py-8 text-[#f5f0e6] sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="font-hud text-[10px] tracking-[0.28em] text-[rgba(245,240,230,0.55)]">
              ADMIN · COSMIC ECHO
            </p>
            <h1 className="mt-1 font-serif text-2xl tracking-[0.04em]">宇宙回声 · 审核</h1>
            <p className="mt-1 text-sm text-[rgba(245,240,230,0.65)]">
              查看公开留言与可选邮箱，删除不当内容
            </p>
          </div>
          <a
            href="#/"
            className="rounded-full border border-white/20 px-3 py-1.5 font-hud text-[10px] tracking-[0.16em] text-[rgba(245,240,230,0.75)] hover:border-[rgba(255,217,160,0.55)] hover:text-[#f5f0e6]"
          >
            ← 返回站点
          </a>
        </header>

        {!authed ? (
          <form
            onSubmit={unlock}
            className="rounded-xl border border-white/10 bg-[rgba(12,16,32,0.9)] p-5 shadow-xl"
          >
            <label className="mb-2 block font-hud text-[10px] tracking-[0.2em] text-[rgba(245,240,230,0.7)]">
              管理密钥 · ECHOES_ADMIN_SECRET
            </label>
            <input
              type="password"
              value={draftSecret}
              onChange={(e) => setDraftSecret(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-white/15 bg-[rgba(6,10,24,0.9)] px-3 py-2.5 text-[15px] outline-none focus:border-[rgba(255,217,160,0.65)]"
              placeholder="在 Vercel 环境变量中配置的密钥"
            />
            {error && <p className="mt-2 text-sm text-[#ffb4b4]">{error}</p>}
            <button
              type="submit"
              className="mt-4 rounded-full border border-[rgba(255,217,160,0.55)] bg-[rgba(255,217,160,0.12)] px-4 py-2 font-hud text-[11px] tracking-[0.18em] text-[#ffd9a0]"
            >
              进入审核
            </button>
          </form>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索昵称 / 内容 / 邮箱"
                className="min-w-[200px] flex-1 rounded-md border border-white/15 bg-[rgba(6,10,24,0.9)] px-3 py-2 text-sm outline-none focus:border-[rgba(255,217,160,0.55)]"
              />
              <button
                type="button"
                onClick={() => void load(secret.trim())}
                disabled={loading}
                className="rounded-full border border-white/20 px-3 py-2 font-hud text-[10px] tracking-[0.14em] text-[rgba(245,240,230,0.8)] hover:border-[rgba(255,217,160,0.45)] disabled:opacity-50"
              >
                {loading ? '刷新中…' : '刷新'}
              </button>
              <button
                type="button"
                disabled={filtered.length === 0}
                onClick={() =>
                  downloadEchoesCsv(
                    filtered,
                    `宇宙回声-${stampForFilename()}.csv`,
                  )
                }
                title="导出当前列表为 CSV（可用 Excel 打开）"
                className="rounded-full border border-[rgba(255,217,160,0.45)] px-3 py-2 font-hud text-[10px] tracking-[0.14em] text-[#ffd9a0] hover:bg-[rgba(255,217,160,0.1)] disabled:opacity-40"
              >
                下载 CSV
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-white/15 px-3 py-2 font-hud text-[10px] tracking-[0.14em] text-[rgba(245,240,230,0.55)]"
              >
                退出
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-md border border-[#ff8f8f]/40 bg-[#ff8f8f]/10 px-3 py-2 text-sm text-[#ffb4b4]">
                {error}
              </p>
            )}

            <p className="mb-3 font-hud text-[10px] tracking-[0.16em] text-[rgba(245,240,230,0.5)]">
              共 {echoes.length} 条公开回声
              {query.trim() ? ` · 筛选后 ${filtered.length} 条` : ''}
            </p>

            <ul className="flex flex-col gap-3 pb-16">
              {filtered.map((echo) => (
                <li
                  key={echo.id}
                  className="rounded-xl border border-white/10 bg-[rgba(12,16,32,0.88)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-serif text-[17px] text-[#f6f2ea]">{echo.name}</p>
                      <p className="mt-0.5 font-hud text-[10px] tracking-[0.12em] text-[rgba(245,240,230,0.5)]">
                        {formatTime(echo.at)}
                        {echo.email ? ` · ${echo.email}` : ' · 无邮箱'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={deletingId === echo.id}
                      onClick={() => void remove(echo.id)}
                      className="rounded-full border border-[#ff8f8f]/45 px-3 py-1.5 font-hud text-[10px] tracking-[0.14em] text-[#ffb4b4] hover:bg-[#ff8f8f]/10 disabled:opacity-50"
                    >
                      {deletingId === echo.id ? '删除中…' : '删除'}
                    </button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[rgba(245,240,230,0.88)]">
                    {echo.message}
                  </p>
                  <p className="mt-2 break-all font-mono text-[10px] text-[rgba(245,240,230,0.35)]">
                    {echo.id}
                  </p>
                </li>
              ))}
              {!loading && filtered.length === 0 && (
                <li className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-[rgba(245,240,230,0.5)]">
                  暂无留言
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
