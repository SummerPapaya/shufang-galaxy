import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Radio, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MESSAGE_MAX,
  NAME_MAX,
  formatEchoTime,
  useEchoes,
  validateEcho,
} from './echoes'
import type { EchoFieldError } from './echoes'

/**
 * <EchoWall> 星空图书馆「宇宙回声」留言板
 * - 左侧表单：昵称（必填）/ 邮箱（可选，不公开）/ 留言（必填）
 * - 右侧回声墙：新回声在顶部升起，卡片按星色描边，显示相对时间
 * - 提交成功后弹一句「回声已送入星海」，1.8s 后淡出
 * - ESC / 点遮罩 / 关闭按钮退出；打开时焦点移入昵称输入框
 * - reduced-motion：去掉升起位移，仅保留淡入
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** 回声卡片描边色：按昵称散列取一个星色，和书房星同一色板 */
const ECHO_TINTS = [
  '#ffd9a0',
  '#aee6ff',
  '#c9a2e8',
  '#8fe3c0',
  '#ffb3c8',
  '#f5d06a',
  '#7fb8e8',
  '#cfe3d8',
]

function tintFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return ECHO_TINTS[h % ECHO_TINTS.length]
}

interface EchoWallProps {
  reduced: boolean
  onClose: () => void
}

export default function EchoWall({ reduced, onClose }: EchoWallProps) {
  const { echoes, ownCount, submit } = useEchoes()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<EchoFieldError>({})
  const [sentId, setSentId] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!sentId) return
    const timer = window.setTimeout(() => setSentId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [sentId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const draft = { name, email, message }
    const found = validateEcho(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const echo = submit(draft)
    setMessage('')
    setSentId(echo.id)
  }

  const fieldBase =
    'w-full rounded-md border bg-[rgba(5,6,15,0.55)] px-3 py-2.5 font-sans text-[14px] text-starlight ' +
    'outline-none transition-colors placeholder:text-starlight-faint focus:border-gold/60'

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* 深空遮罩 */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'rgba(3,5,16,0.82)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
        onClick={onClose}
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label="宇宙回声留言板"
        className="glass-panel relative flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-gold/25 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        initial={{ opacity: 0, y: reduced ? 0 : 18, scale: reduced ? 1 : 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.99 }}
        transition={{ duration: 0.32, ease: EASE }}
      >
        {/* ── 标题栏 ── */}
        <header className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
          <div>
            <h2 className="flex items-center gap-2.5 font-serif text-[22px] tracking-[0.06em] text-starlight">
              <Radio className="h-4 w-4 text-gold" aria-hidden />
              宇宙回声
            </h2>
            <p className="mt-1.5 font-hud text-[10px] uppercase tracking-[0.3em] text-starlight-faint">
              Cosmic Echo · 说出口的话，会在星海里一直回响
            </p>
          </div>
          <button
            type="button"
            data-cursor="interactive"
            aria-label="关闭宇宙回声"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-starlight-faint text-starlight-dim transition-colors hover:border-gold/60 hover:text-starlight"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </header>

        <div className="scrollbar-starfield flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6 md:flex-row md:gap-8">
          {/* ── 提交表单 ── */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex w-full shrink-0 flex-col gap-4 md:w-[300px]"
          >
            <div>
              <label
                htmlFor="echo-name"
                className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.24em] text-starlight-dim"
              >
                昵称 <span className="text-gold">*</span>
              </label>
              <input
                id="echo-name"
                ref={nameRef}
                value={name}
                maxLength={NAME_MAX + 8}
                onChange={(e) => setName(e.target.value)}
                placeholder="星海里怎么称呼你"
                aria-invalid={!!errors.name}
                className={cn(fieldBase, errors.name ? 'border-[#ff8f8f]/70' : 'border-white/10')}
              />
              {errors.name && (
                <p className="mt-1.5 font-sans text-[12px] text-[#ff8f8f]">{errors.name}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="echo-email"
                className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.24em] text-starlight-dim"
              >
                邮箱 <span className="normal-case tracking-normal">（可选）</span>
              </label>
              <input
                id="echo-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="想收到回信就留一个"
                aria-invalid={!!errors.email}
                className={cn(fieldBase, errors.email ? 'border-[#ff8f8f]/70' : 'border-white/10')}
              />
              {errors.email ? (
                <p className="mt-1.5 font-sans text-[12px] text-[#ff8f8f]">{errors.email}</p>
              ) : (
                <p className="mt-1.5 font-sans text-[11px] text-starlight-faint">
                  邮箱不会出现在回声墙上
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="echo-message"
                className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.24em] text-starlight-dim"
              >
                留言 <span className="text-gold">*</span>
              </label>
              <textarea
                id="echo-message"
                value={message}
                rows={5}
                maxLength={MESSAGE_MAX}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="想对朗读者、对某本书、或者对某个深夜说的话…"
                aria-invalid={!!errors.message}
                className={cn(
                  fieldBase,
                  'resize-none leading-relaxed',
                  errors.message ? 'border-[#ff8f8f]/70' : 'border-white/10',
                )}
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                {errors.message ? (
                  <p className="font-sans text-[12px] text-[#ff8f8f]">{errors.message}</p>
                ) : (
                  <span />
                )}
                <span className="shrink-0 font-hud text-[10px] tracking-[0.14em] text-starlight-faint">
                  {message.length} / {MESSAGE_MAX}
                </span>
              </div>
            </div>

            <button
              type="submit"
              data-cursor="interactive"
              className="flex items-center justify-center gap-2 rounded-full border border-gold/60 px-4 py-2.5 font-hud text-[11px] uppercase tracking-[0.24em] text-gold transition-colors hover:border-gold hover:bg-gold/10 hover:text-starlight"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              让回声响起
            </button>

            <AnimatePresence>
              {sentId && (
                <motion.p
                  role="status"
                  className="font-sans text-[12.5px] text-gold"
                  initial={{ opacity: 0, y: reduced ? 0 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  回声已送入星海 ✦
                </motion.p>
              )}
            </AnimatePresence>
          </form>

          {/* ── 回声墙 ── */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="font-hud text-[10px] uppercase tracking-[0.28em] text-starlight-dim">
                星海回响
              </h3>
              <span className="font-hud text-[10px] tracking-[0.18em] text-starlight-faint">
                {echoes.length} echoes
                {ownCount > 0 ? ` · 你留下 ${ownCount} 条` : ''}
              </span>
            </div>

            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {echoes.map((echo) => {
                  const tint = tintFor(echo.name + echo.id)
                  return (
                    <motion.li
                      key={echo.id}
                      layout={!reduced}
                      initial={{ opacity: 0, y: reduced ? 0 : -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="relative overflow-hidden rounded-lg border px-4 py-3.5"
                      style={{
                        borderColor: `${tint}33`,
                        background:
                          'linear-gradient(180deg, rgba(11,16,38,0.62) 0%, rgba(5,6,15,0.5) 100%)',
                      }}
                    >
                      {/* 左侧星色光条 */}
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-[2px]"
                        style={{ background: tint, boxShadow: `0 0 10px ${tint}` }}
                      />
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-serif text-[15px] text-starlight">{echo.name}</span>
                        <span className="shrink-0 font-hud text-[10px] tracking-[0.16em] text-starlight-faint">
                          {formatEchoTime(echo.at)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-starlight-dim">
                        {echo.message}
                      </p>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>

            <p className="mt-4 font-hud text-[10px] tracking-[0.2em] text-starlight-faint/70">
              回声暂存于这台设备，等接上信号站后就会在所有星球间共享
            </p>
          </div>
        </div>
      </motion.section>
    </motion.div>
  )
}
