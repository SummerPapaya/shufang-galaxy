import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Radio } from 'lucide-react'
import { useAppStore } from '@/store'
import { audioManager } from '@/audio/AudioManager'
import GalaxyBackdrop from '@/components/GalaxyBackdrop'
import TypeGlow from '@/components/TypeGlow'
import { useBooks } from './library/books'
import type { Book } from './library/books'
import RingCarousel from './library/RingCarousel'
import PlayerBar from './library/PlayerBar'
import EchoWall from './library/EchoWall'
import EchoField, { placeEcho } from './library/EchoField'
import type { Echo } from './library/echoes'

/** 提交后：留言化作一颗带尾迹的星，沿弧线飞入星空落点 */
function FlyingEchoStar({
  fromX,
  fromY,
  toX,
  toY,
  reduced,
}: {
  fromX: number
  fromY: number
  toX: number
  toY: number
  reduced: boolean
}) {
  const midX = fromX + (toX - fromX) * 0.42
  const midY = Math.min(fromY, toY) - Math.min(160, Math.abs(toY - fromY) * 0.38 + 56)
  const angle = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI
  const trail = Math.min(88, Math.hypot(toX - fromX, toY - fromY) * 0.18)

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none"
      style={{ position: 'fixed', left: 0, top: 0, zIndex: 90, marginLeft: -8, marginTop: -8 }}
      initial={{ x: fromX, y: fromY, scale: 2.8, opacity: 1 }}
      animate={{
        x: [fromX, midX, toX],
        y: [fromY, midY, toY],
        scale: [2.8, 1.25, 0.85],
        opacity: 1,
      }}
      exit={{ opacity: 0, scale: 0.3 }}
      transition={
        reduced
          ? { duration: 0.05 }
          : { duration: 1.55, times: [0, 0.34, 1], ease: [0.22, 1, 0.36, 1] }
      }
    >
      <motion.span
        className="absolute left-1/2 top-1/2 block"
        style={{
          width: trail,
          height: 12,
          marginLeft: -trail,
          marginTop: -6,
          borderRadius: 999,
          transform: `rotate(${angle}deg)`,
          transformOrigin: 'right center',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(245,240,230,0.2) 35%, rgba(245,240,230,0.95) 100%)',
          boxShadow: '0 0 18px rgba(255,217,160,0.55)',
        }}
        initial={{ opacity: 0.95, scaleX: 0.35 }}
        animate={{ opacity: [0.95, 0.75, 0], scaleX: [0.35, 1, 0.5] }}
        transition={reduced ? { duration: 0.05 } : { duration: 1.55, times: [0, 0.4, 1] }}
      />
      <span
        className="absolute left-1/2 top-1/2 block rounded-full"
        style={{
          width: 64,
          height: 64,
          marginLeft: -32,
          marginTop: -32,
          background:
            'radial-gradient(circle, rgba(245,240,230,0.8) 0%, rgba(255,217,160,0.32) 40%, transparent 72%)',
        }}
      />
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 block"
        style={{ width: 48, height: 48, marginLeft: -24, marginTop: -24 }}
      >
        <span
          className="absolute left-1/2 top-1/2 block"
          style={{
            width: 42,
            height: 2.5,
            marginLeft: -21,
            marginTop: -1.25,
            background:
              'linear-gradient(90deg, transparent, rgba(255,250,240,0.95), transparent)',
            boxShadow: '0 0 10px rgba(255,217,160,0.8)',
          }}
        />
        <span
          className="absolute left-1/2 top-1/2 block"
          style={{
            width: 2.5,
            height: 42,
            marginLeft: -1.25,
            marginTop: -21,
            background:
              'linear-gradient(180deg, transparent, rgba(255,250,240,0.95), transparent)',
            boxShadow: '0 0 10px rgba(255,217,160,0.8)',
          }}
        />
        <span
          className="absolute left-1/2 top-1/2 block"
          style={{
            width: 28,
            height: 1.5,
            marginLeft: -14,
            marginTop: -0.75,
            transform: 'rotate(45deg)',
            opacity: 0.65,
            background:
              'linear-gradient(90deg, transparent, rgba(255,248,235,0.85), transparent)',
          }}
        />
        <span
          className="absolute left-1/2 top-1/2 block"
          style={{
            width: 28,
            height: 1.5,
            marginLeft: -14,
            marginTop: -0.75,
            transform: 'rotate(-45deg)',
            opacity: 0.65,
            background:
              'linear-gradient(90deg, transparent, rgba(255,248,235,0.85), transparent)',
          }}
        />
      </span>
      <span
        className="absolute left-1/2 top-1/2 block rounded-full"
        style={{
          width: 16,
          height: 16,
          marginLeft: -8,
          marginTop: -8,
          background: '#f6f2ea',
          boxShadow:
            '0 0 14px #f6f2ea, 0 0 36px rgba(255,217,160,1), 0 0 72px rgba(255,217,160,0.5)',
        }}
      />
    </motion.div>
  )
}

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
  const [flyEcho, setFlyEcho] = useState<{
    echo: Echo
    fromX: number
    fromY: number
    toX: number
    toY: number
  } | null>(null)
  const [arrivingId, setArrivingId] = useState<string | null>(null)
  const closeEchoTimer = useRef<number | null>(null)

  const handleSelect = useCallback((book: Book) => {
    setActiveBook(book)
  }, [])

  const closePlayer = useCallback(() => {
    audioManager.stop()
    setActiveBook(null)
  }, [])

  const closeEcho = useCallback(() => setEchoOpen(false), [])

  const handleEchoSubmitted = useCallback((echo: Echo, origin: { x: number; y: number }) => {
    const slot = placeEcho(echo, 0)
    setFlyEcho({
      echo,
      fromX: origin.x,
      fromY: origin.y,
      toX: slot.x * window.innerWidth,
      toY: slot.y * window.innerHeight,
    })
    // 先让飞星从按钮上亮起，再收起写信窗，避免动效被面板挡住
    if (closeEchoTimer.current) window.clearTimeout(closeEchoTimer.current)
    closeEchoTimer.current = window.setTimeout(() => setEchoOpen(false), 180)
  }, [])

  useEffect(
    () => () => {
      if (closeEchoTimer.current) window.clearTimeout(closeEchoTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!flyEcho) return
    const ms = reduced ? 80 : 1650
    const t = window.setTimeout(() => {
      setArrivingId(flyEcho.echo.id)
      setFlyEcho(null)
    }, ms)
    return () => window.clearTimeout(t)
  }, [flyEcho, reduced])

  useEffect(() => {
    if (!arrivingId) return
    const t = window.setTimeout(() => setArrivingId(null), 2400)
    return () => window.clearTimeout(t)
  }, [arrivingId])

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
      {/* ── 背景：深蓝 / 蓝紫星云（无 WebGL 或 reduced-motion 时仍可见） ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 30% 20%, var(--nebula-violet) 0%, transparent 55%),' +
            'radial-gradient(ellipse 90% 70% at 75% 70%, var(--nebula-rose) 0%, transparent 50%),' +
            'radial-gradient(ellipse 140% 100% at 50% 50%, var(--nebula-mid) 0%, var(--nebula-deep) 45%, var(--void) 100%)',
        }}
      />
      {!reduced && (
        <GalaxyBackdrop
          starCount={1600}
          dustCount={240}
          travel={2.4}
          parallax
          interactive={false}
          className="pointer-events-none"
          style={{ position: 'absolute', zIndex: 0 }}
        />
      )}
      <EchoField
        reduced={reduced}
        hiddenId={flyEcho?.echo.id ?? null}
        arrivingId={arrivingId}
      />

      {/* ── 顶部 HUD：手机端按钮单独一行，标题在其下，避免横向叠压 ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
        <motion.div
          className="pointer-events-auto flex items-center justify-end gap-1.5 sm:gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: reduced ? 0.1 : 0.5 }}
        >
          <button
            type="button"
            aria-label="打开宇宙回声留言板"
            data-cursor="interactive"
            onClick={() => setEchoOpen(true)}
            className="flex items-center gap-1 rounded-full border px-2.5 py-1.5 font-hud text-[10px] tracking-[0.14em] text-gold transition-colors duration-200 hover:bg-gold/10 hover:text-starlight sm:gap-1.5 sm:px-3.5 sm:text-[11px] sm:tracking-[0.18em]"
            style={{ borderColor: 'rgba(255,217,160,0.4)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.85)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.4)')}
          >
            <Radio className="h-3 w-3" aria-hidden />
            <span className="sm:hidden">回声</span>
            <span className="hidden sm:inline">宇宙回声</span>
          </button>
          <button
            type="button"
            aria-label="返回星空"
            data-cursor="interactive"
            onClick={closeLibrary}
            className="rounded-full border px-2.5 py-1.5 font-hud text-[10px] tracking-[0.14em] text-starlight-dim transition-colors duration-200 hover:text-starlight sm:px-3.5 sm:text-[11px] sm:tracking-[0.18em]"
            style={{ borderColor: 'rgba(255,217,160,0.35)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.75)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,217,160,0.35)')}
          >
            <span className="sm:hidden">← 返回</span>
            <span className="hidden sm:inline">← 返回星空</span>
          </button>
        </motion.div>

        <motion.header
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0, y: reduced ? 0 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: reduced ? 0.1 : 0.45 }}
        >
          <h1 className="font-serif text-[15px] tracking-[0.1em] text-starlight sm:text-[16px] md:text-[19px]">
            <TypeGlow glowColor="rgba(255,217,160,0.45)">星空图书馆</TypeGlow>
            <span className="ml-2 hidden font-hud text-[11px] tracking-[0.3em] text-starlight-dim sm:inline">
              · Starlight Library
            </span>
          </h1>
          <p className="mt-1 font-hud text-[9px] uppercase tracking-[0.28em] text-starlight-faint sm:mt-1.5 sm:text-[10px] sm:tracking-[0.35em]">
            {books ? `${books.length} Volumes` : '…'} · A Ring of Starlight
          </p>
        </motion.header>
      </div>

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
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-6 sm:pb-6"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: reduced ? 0.15 : 0.7 }}
        >
          <p className="max-w-[92vw] px-3 text-center font-hud text-[10px] tracking-[0.16em] text-starlight-faint sm:text-[11px] sm:tracking-[0.22em]">
            <span className="sm:hidden">拖拽转动 · 双指缩放 · 点星读回声</span>
            <span className="hidden sm:inline">
              拖拽或按 ← → 转动书廊 · 点击带光晕的星点可读回声 · 点击书籍开始聆听
            </span>
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
        {echoOpen && (
          <EchoWall
            key="echo-wall"
            reduced={reduced}
            onClose={closeEcho}
            onSubmitted={handleEchoSubmitted}
          />
        )}
      </AnimatePresence>

      {/* ── 留言化作星星飞入星空（portal 到 body，避免被图书馆 overflow 裁切） ── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {flyEcho && (
              <FlyingEchoStar
                key={flyEcho.echo.id}
                fromX={flyEcho.fromX}
                fromY={flyEcho.fromY}
                toX={flyEcho.toX}
                toY={flyEcho.toY}
                reduced={reduced}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}

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
