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
import type { EchoFieldError } from './echoes'

/**
 * <EchoWall> 「宇宙回声」留言表单
 * - 提交后回声化为星空中的漂浮星（见 EchoField），此处只负责写信
 * - 配色：浅月白面板 + 深墨字，保证可读；去掉过重的深空玻璃感
 * - ESC / 遮罩 / 关闭按钮退出
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface EchoWallProps {
  reduced: boolean
  onClose: () => void
  /** 提交成功后回调（父级可关窗，让新星出现在背景） */
  onSubmitted?: () => void
}

export default function EchoWall({ reduced, onClose, onSubmitted }: EchoWallProps) {
  const { echoes, submit } = useEchoes()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<EchoFieldError>({})
  const [sent, setSent] = useState(false)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const draft = { name, email, message }
    const found = validateEcho(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    submit(draft)
    setMessage('')
    setSent(true)
    window.setTimeout(() => {
      onSubmitted?.()
      onClose()
    }, 900)
  }

  const fieldBase =
    'w-full rounded border bg-[#f7f3ea] px-3 py-2.5 font-sans text-[14px] text-[#1a1f33] ' +
    'outline-none transition-colors placeholder:text-[#1a1f33]/35 ' +
    'focus:border-[#c9a56a] focus:bg-white'

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
        style={{ background: 'rgba(8,10,22,0.55)' }}
        onClick={onClose}
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label="宇宙回声留言"
        className="relative w-full max-w-[440px] overflow-hidden rounded-xl border border-[#d8c9a8]/55 shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
        style={{ background: 'linear-gradient(180deg, #f3eee3 0%, #e8e0d0 100%)' }}
        initial={{ opacity: 0, y: reduced ? 0 : 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : 8 }}
        transition={{ duration: 0.28, ease: EASE }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#1a1f33]/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-[20px] tracking-[0.04em] text-[#1a1f33]">宇宙回声</h2>
            <p className="mt-1 font-sans text-[12.5px] leading-relaxed text-[#1a1f33]/55">
              写下一句，它会化作星空里的一颗星
            </p>
          </div>
          <button
            type="button"
            data-cursor="interactive"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1a1f33]/2 text-[#1a1f33]/55 transition-colors hover:border-[#1a1f33]/45 hover:text-[#1a1f33]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </header>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5 px-5 py-5">
          <div>
            <label
              htmlFor="echo-name"
              className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.22em] text-[#1a1f33]/5"
            >
              昵称 <span className="text-[#9a6b2f]">*</span>
            </label>
            <input
              id="echo-name"
              ref={nameRef}
              value={name}
              maxLength={NAME_MAX + 8}
              onChange={(e) => setName(e.target.value)}
              placeholder="星海里怎么称呼你"
              aria-invalid={!!errors.name}
              className={cn(fieldBase, errors.name ? 'border-[#c45c5c]' : 'border-[#1a1f33]/15')}
            />
            {errors.name && (
              <p className="mt-1.5 font-sans text-[12px] text-[#a33a3a]">{errors.name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="echo-email"
              className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.22em] text-[#1a1f33]/5"
            >
              邮箱 <span className="normal-case tracking-normal">（可选，不公开）</span>
            </label>
            <input
              id="echo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="想收到回信就留一个"
              aria-invalid={!!errors.email}
              className={cn(fieldBase, errors.email ? 'border-[#c45c5c]' : 'border-[#1a1f33]/15')}
            />
            {errors.email && (
              <p className="mt-1.5 font-sans text-[12px] text-[#a33a3a]">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="echo-message"
              className="mb-1.5 block font-hud text-[10px] uppercase tracking-[0.22em] text-[#1a1f33]/5"
            >
              留言 <span className="text-[#9a6b2f]">*</span>
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
                errors.message ? 'border-[#c45c5c]' : 'border-[#1a1f33]/15',
              )}
            />
            <div className="mt-1.5 flex items-center justify-between gap-3">
              {errors.message ? (
                <p className="font-sans text-[12px] text-[#a33a3a]">{errors.message}</p>
              ) : (
                <span className="font-sans text-[11px] text-[#1a1f33]/4">
                  星空中已有 {echoes.length} 颗回声
                </span>
              )}
              <span className="shrink-0 font-hud text-[10px] tracking-[0.12em] text-[#1a1f33]/4">
                {message.length} / {MESSAGE_MAX}
              </span>
            </div>
          </div>

          <button
            type="submit"
            data-cursor="interactive"
            className="mt-1 flex items-center justify-center gap-2 rounded border border-[#1a1f33]/25 bg-[#1a1f33] px-4 py-2.5 font-hud text-[11px] uppercase tracking-[0.2em] text-[#f5f0e6] transition-colors hover:bg-[#2a3148]"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            送入星海
          </button>

          <AnimatePresence>
            {sent && (
              <motion.p
                role="status"
                className="text-center font-sans text-[13px] text-[#6b542e]"
                initial={{ opacity: 0, y: reduced ? 0 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                已化作一颗星，去星空里找它吧
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      </motion.section>
    </motion.div>
  )
}
