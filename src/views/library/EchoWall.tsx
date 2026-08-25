import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MESSAGE_MAX,
  NAME_MAX,
  useEchoes,
  validateEcho,
} from './echoes'
import type { Echo, EchoFieldError } from './echoes'

/**
 * <EchoWall> 「宇宙回声」留言表单
 * - 深空玻璃面板 + 月白文字，保证可读
 * - 提交到公共回声库；成功后交给父级做「化作星星飞入星空」动效
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface EchoWallProps {
  reduced: boolean
  onClose: () => void
  onSubmitted?: (echo: Echo, origin: { x: number; y: number }) => void
}

export default function EchoWall({ reduced, onClose, onSubmitted }: EchoWallProps) {
  const { echoes, status, errorMessage, submit } = useEchoes()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<EchoFieldError>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending || sent) return
    const draft = { name, email, message }
    const found = validateEcho(draft)
    setErrors(found)
    setSubmitError(null)
    if (Object.keys(found).length > 0) return

    setSending(true)
    try {
      const echo = await submit(draft)
      const rect = submitRef.current?.getBoundingClientRect()
      const origin = {
        x: (rect?.left ?? window.innerWidth / 2) + (rect?.width ?? 0) / 2,
        y: (rect?.top ?? window.innerHeight / 2) + (rect?.height ?? 0) / 2,
      }
      setSent(true)
      onSubmitted?.(echo, origin)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '送入星海失败，请稍后再试')
    } finally {
      setSending(false)
    }
  }

  const fieldBase =
    'w-full rounded-md border bg-[rgba(6,10,24,0.88)] px-3 py-2.5 font-sans text-[15px] text-[#f6f2ea] ' +
    'outline-none transition-colors placeholder:text-[rgba(245,240,230,0.42)] ' +
    'focus:border-[rgba(255,217,160,0.65)] focus:bg-[rgba(10,14,32,0.95)]'

  const publicCount = echoes.filter((e) => !e.seed).length

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'rgba(10,16,42,0.28)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        onClick={onClose}
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label="宇宙回声留言"
        className="relative w-full max-w-[440px] overflow-hidden rounded-xl border border-gold/30 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,24,48,0.96) 0%, rgba(8,12,28,0.96) 100%)',
        }}
        initial={{ opacity: 0, y: reduced ? 0 : 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : 8 }}
        transition={{ duration: 0.28, ease: EASE }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-[21px] tracking-[0.04em] text-[#f6f2ea]">宇宙回声</h2>
            <p className="mt-1 font-sans text-[13px] leading-relaxed text-[rgba(245,240,230,0.82)]">
              写下一句，它会化作星空里所有人都能看见的一颗星
            </p>
          </div>
          <button
            type="button"
            data-cursor="interactive"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(245,240,230,0.28)] text-[rgba(245,240,230,0.75)] transition-colors hover:border-gold/50 hover:text-starlight"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </header>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5 px-5 py-5">
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
            defaultValue=""
          />

          <div>
            <label
              htmlFor="echo-name"
              className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.22em] text-[rgba(245,240,230,0.78)]"
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
              className={cn(fieldBase, errors.name ? 'border-[#ff8f8f]/70' : 'border-white/15')}
            />
            {errors.name && (
              <p className="mt-1.5 font-sans text-[12px] text-[#ffb4b4]">{errors.name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="echo-email"
              className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.22em] text-[rgba(245,240,230,0.78)]"
            >
              邮箱{' '}
              <span className="normal-case tracking-normal text-[rgba(245,240,230,0.62)]">
                （可选，不公开）
              </span>
            </label>
            <input
              id="echo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="想收到回信就留一个"
              aria-invalid={!!errors.email}
              className={cn(fieldBase, errors.email ? 'border-[#ff8f8f]/70' : 'border-white/15')}
            />
            {errors.email && (
              <p className="mt-1.5 font-sans text-[12px] text-[#ffb4b4]">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="echo-message"
              className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.22em] text-[rgba(245,240,230,0.78)]"
            >
              留言 <span className="text-gold">*</span>
            </label>
            <textarea
              id="echo-message"
              value={message}
              rows={4}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="想对朗读者、对某本书、或者对某个深夜说的话…"
              aria-invalid={!!errors.message}
              className={cn(
                fieldBase,
                'resize-none leading-relaxed',
                errors.message ? 'border-[#ff8f8f]/70' : 'border-white/15',
              )}
            />
            <div className="mt-1.5 flex items-center justify-between gap-3">
              {errors.message ? (
                <p className="font-sans text-[12px] text-[#ffb4b4]">{errors.message}</p>
              ) : status === 'error' ? (
                <p className="font-sans text-[12px] text-[#ffb4b4]">
                  {errorMessage || '公共星海暂未连通'}
                </p>
              ) : (
                <span className="font-sans text-[12px] text-[rgba(245,240,230,0.58)]">
                  {status === 'loading'
                    ? '正在聆听星海…'
                    : `公共星海已有 ${publicCount} 颗回声`}
                </span>
              )}
              <span className="shrink-0 font-hud text-[10px] tracking-[0.12em] text-[rgba(245,240,230,0.58)]">
                {message.length} / {MESSAGE_MAX}
              </span>
            </div>
          </div>

          {submitError && (
            <p role="alert" className="font-sans text-[12px] text-[#ffb4b4]">
              {submitError}
            </p>
          )}

          <button
            ref={submitRef}
            type="submit"
            data-cursor="interactive"
            disabled={sent || sending}
            className="mt-1 flex items-center justify-center gap-2 rounded-full border border-gold bg-gold/10 px-4 py-2.5 font-hud text-[11px] uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold/20 hover:text-starlight disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {sending ? '送入中…' : '送入星海'}
          </button>

          <AnimatePresence>
            {sent && (
              <motion.p
                role="status"
                className="text-center font-sans text-[13px] text-gold"
                initial={{ opacity: 0, y: reduced ? 0 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                正在化作一颗星…
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      </motion.section>
    </motion.div>
  )
}
