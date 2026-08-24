import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Radio } from 'lucide-react'
import { useAppStore } from '@/store'
import { audioManager } from '@/audio/AudioManager'
import TypeGlow from '@/components/TypeGlow'
import { useBooks } from './library/books'
import type { Book } from './library/books'
import LibraryStarfield from './library/Starfield'
import RingCarousel from './library/RingCarousel'
import PlayerBar from './library/PlayerBar'
import EchoWall from './library/EchoWall'
import EchoField from './library/EchoField'

/**
 * <LibraryView> 星空图书馆（view === 'library'）
 * - 深邃星空中悬浮单层 3D 环形书廊（数据 /assets/books.json，中心约 top-[46%]）
 * - 拖拽（惯性）/ ← → 方向键 / 自动旋转由 RingCarousel 接管；点击书脊 → 底部 PlayerBar
 * - 标题「星空图书馆」位于页面顶部安全区（pointer-events-none，绝不压住书廊）
 * - 入场：白色隧道式闪光淡入（峰值透明度 ≤0.55，呼应虫洞越迁）
 * - 「宇宙回声」：右上角打开写信窗；提交后留言化作背景漂浮星，悬停可见卡片
 * - ESC：先关回声墙 / 播放器，再 closeLibrary()；「返回星空」→ closeLibrary()
 * - reduced-motion：关闭漂浮 / 入场闪光 / 自动旋转，保留全部功能
 */
export default function LibraryView() {
  const closeLibrary = useAppStore((s) => s.closeLibrary)
  const { books, error } = useBooks()
  const reduced = useReducedMotion() ?? false

  const [activeBook, setActiveBook] = useState<Book | null>(null)
  const [echoOpen, setEchoOpen] = useState(false)

  const handleSelect = useCallback((book: Book) => {
    setActiveBook(book)
  }, [])

  const closePlayer = useCallback(() => {
    audioManager.stop()
    setActiveBook(null)
  }, [])

  const closeEcho = useCallback(() => setEchoOpen(false), [])

  /* ── ESC：回声墙 → 播放器 → 返回星空 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (echoOpen) return // EchoWall 自己处理 ESC
      if (activeBook) closePlayer()
      else closeLibrary()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeBook, echoOpen, closeLibrary, closePlayer])

  /* ── 离开视图：停声 ── */
  useEffect(() => () => audioManager.stop(), [])

  return (
    <div className="absolute inset-0 z-[30] overflow-hidden bg-void">
      {/* ── 背景：星云渐变 + 星点 canvas ── */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 22% 28%, rgba(61,43,110,0.38) 0%, transparent 70%),' +
            'radial-gradient(ellipse 55% 42% at 78% 64%, rgba(110,43,85,0.30) 0%, transparent 70%),' +
            'radial-gradient(ellipse 75% 60% at 50% 50%, rgba(27,35,80,0.55) 0%, transparent 78%),' +
            'linear-gradient(180deg, #05060f 0%, #0b1026 52%, #05060f 100%)',
        }}
      />
      <LibraryStarfield reduced={reduced} />
      <EchoField reduced={reduced} />

      {/* ── 顶部安全区 HUD：标题（不与环形书廊重叠） ── */}
      <motion.header
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center pt-7"
        initial={{ opacity: 0, y: reduced ? 0 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: reduced ? 0.1 : 0.45 }}
      >
        <h1 className="font-serif text-[16px] tracking-[0.12em] text-starlight md:text-[19px]">
          <TypeGlow glowColor="rgba(255,217,160,0.45)">星空图书馆</TypeGlow>
          <span className="ml-3 font-hud text-[11px] tracking-[0.3em] text-starlight-dim">
            · Starlight Library
          </span>
        </h1>
        <p className="mt-2 font-hud text-[10px] uppercase tracking-[0.35em] text-starlight-faint">
          {books ? `${books.length} Volumes` : '…'} · A Ring of Starlight
        </p>
      </motion.header>

      <motion.div
        className="absolute right-5 top-5 z-20 flex items-center gap-2 md:right-8 md:top-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: reduced ? 0.1 : 0.5 }}
      >
        <button
          type="button"
          aria-label="打开宇宙回声留言板"
          data-cursor="interactive"
          onClick={() => setEchoOpen(true)}
          className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-hud text-[11px] tracking-[0.18em] text-gold transition-colors duration-200 hover:bg-gold/10 hover:text-starlight"
          style={{ borderColor: 'rgba(255,217,160,0.4)' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.85)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.4)')}
        >
          <Radio className="h-3 w-3" aria-hidden />
          宇宙回声
        </button>
        <button
          type="button"
          aria-label="返回星空"
          data-cursor="interactive"
          onClick={closeLibrary}
          className="rounded-full border px-3.5 py-1.5 font-hud text-[11px] tracking-[0.18em] text-starlight-dim transition-colors duration-200 hover:text-starlight"
          style={{ borderColor: 'rgba(255,217,160,0.35)' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.75)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.35)')}
        >
          ← 返回星空
        </button>
      </motion.div>

      {/* ── 环形书廊（数据就绪后点亮） ── */}
      {books && <RingCarousel books={books} reduced={reduced} onSelect={handleSelect} />}

      {/* 加载 / 错误态 */}
      {!books && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <motion.p
            className="font-hud text-[11px] tracking-[0.35em] text-starlight-faint"
            animate={reduced ? { opacity: 0.6 } : { opacity: [0.25, 0.8, 0.25] }}
            transition={
              reduced ? { duration: 0.3 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            }
          >
            正在点亮书廊 …
          </motion.p>
        </div>
      )}
      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="font-hud text-[11px] tracking-[0.2em] text-starlight-dim">
            星光信号微弱，书廊暂时无法显现（{error.message}）
          </p>
        </div>
      )}

      {/* ── 底部提示（播放器打开时让位） ── */}
      {!activeBook && (
        <motion.footer
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: reduced ? 0.15 : 0.7 }}
        >
          <p className="font-hud text-[11px] tracking-[0.22em] text-starlight-faint">
            拖拽或按 ← → 转动书廊 · 悬停星点可读回声 · 点击书籍开始聆听
          </p>
        </motion.footer>
      )}

      {/* ── 底部播放器（滑入 / 滑出 300ms） ── */}
      <AnimatePresence>
        {activeBook && (
          <PlayerBar
            key={activeBook.id}
            book={activeBook}
            reduced={reduced}
            onClose={closePlayer}
          />
        )}
      </AnimatePresence>

      {/* ── 宇宙回声留言板 ── */}
      <AnimatePresence>
        {echoOpen && <EchoWall key="echo-wall" reduced={reduced} onClose={closeEcho} />}
      </AnimatePresence>

      {/* ── 入场：白色隧道式闪光（峰值 ≤0.55，呼应虫洞越迁） ── */}
      {!reduced && (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-40 bg-starlight"
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-40"
            style={{
              background:
                'radial-gradient(circle at 50% 46%, transparent 24%, rgba(245,240,230,0.5) 44%, transparent 62%)',
            }}
            initial={{ opacity: 0.55, scale: 0.3 }}
            animate={{ opacity: 0, scale: 1.9 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </>
      )}
    </div>
  )
}
