import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { List, Sparkles, X } from 'lucide-react'
import type { Room } from '@/data/rooms'
import { useAppStore } from '@/store'
import type { UniverseControls } from './controls'
import { REDUCED_MOTION } from './controls'

/**
 * 「书房索引」全屏抽屉（universe.md §2-C / §3 键盘可达性）
 * - 顶栏右侧胶囊按钮展开；半透明深空遮罩 + 抽屉从右向左滑入（spring 200/26）
 * - 列表项（stagger 50ms）：starColor 呼吸圆点 + 朗读者名 + 房间风格
 * - 点击 = 选中该星（触发飞星转场）；ESC / 点击遮罩 / 再点按钮关闭
 * - 无障碍：role="dialog"，打开时焦点移入列表，关闭后焦点回到按钮，键盘可 Tab 到达
 * - 旁边的「虫洞越迁」按钮：呼吸式金辉脉冲（2s 周期），点击保存相机角后进图书馆
 */

interface IndexDrawerProps {
  rooms: Room[]
  controls: UniverseControls
  /** 点击列表项（等同点击星星，触发飞星转场） */
  onSelect: (id: string) => void
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/* ── 「虫洞越迁」按钮：呼吸式闪烁（金色描边 + 柔和光晕脉冲，2s 周期） ── */

function WormholeButton({ controls }: { controls: UniverseControls }) {
  const onClick = () => {
    // 相机角度记忆：进图书馆前保存当前朝向，返回时恢复
    useAppStore.getState().setUniverseCamera({ yaw: controls.yaw, pitch: controls.pitch })
    useAppStore.getState().openLibrary()
  }
  return (
    <div className="group relative">
      <motion.button
        type="button"
        data-cursor="interactive"
        aria-label="虫洞越迁：前往星空图书馆"
        onClick={onClick}
        className="flex h-7 items-center gap-1.5 rounded-full border border-gold/60 px-3 font-hud text-[11px] uppercase tracking-[0.22em] text-gold transition-colors hover:border-gold hover:text-starlight"
        animate={
          REDUCED_MOTION
            ? undefined
            : {
                boxShadow: [
                  '0 0 5px rgba(255,217,160,0.18), 0 0 0px rgba(255,217,160,0)',
                  '0 0 14px rgba(255,217,160,0.55), 0 0 30px rgba(255,217,160,0.18)',
                ],
                opacity: [0.75, 1],
              }
        }
        transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
      >
        虫洞越迁
        <Sparkles className="h-3 w-3" aria-hidden />
      </motion.button>
      {/* hover tooltip */}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded border border-gold/30 bg-nebula-deep/90 px-2.5 py-1 font-hud text-[10px] tracking-[0.18em] text-gold opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
      >
        前往星空图书馆
      </span>
    </div>
  )
}

export default function IndexDrawer({ rooms, controls, onSelect }: IndexDrawerProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  /* ESC 关闭 + 打开时焦点移入 / 关闭后归还焦点 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => firstItemRef.current?.focus(), 120)
    const trigger = buttonRef.current
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
      trigger?.focus()
    }
  }, [open])

  return (
    <>
      <motion.div
        className="fixed right-6 top-6 z-20 flex items-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.65, ease: EASE }}
      >
        <WormholeButton controls={controls} />
        <button
          ref={buttonRef}
          type="button"
          data-cursor="interactive"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 items-center gap-1.5 rounded-full border border-starlight-faint px-3 font-hud text-[11px] uppercase tracking-[0.22em] text-starlight-dim transition-colors hover:border-gold/50 hover:text-starlight"
        >
          书房索引
          <List className="h-3 w-3" aria-hidden />
        </button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <>
            {/* 深空遮罩 */}
            <motion.div
              key="overlay"
              className="fixed inset-0 z-40"
              style={{
                background: 'rgba(5,6,15,0.82)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setOpen(false)}
            />
            {/* 抽屉 */}
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="书房索引"
              className="fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-full flex-col border-l border-starlight-faint/40 bg-nebula-deep/85 px-6 py-8 backdrop-blur-xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-serif text-2xl tracking-[0.08em] text-starlight">
                  选择一颗星
                </h2>
                <button
                  type="button"
                  data-cursor="interactive"
                  aria-label="关闭书房索引"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-starlight-faint text-starlight-dim transition-colors hover:border-gold/50 hover:text-starlight"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              <motion.ul
                className="scrollbar-starfield flex flex-1 flex-col gap-1 overflow-y-auto pr-1"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.05 } } }}
              >
                {rooms.map((room, i) => (
                  <motion.li
                    key={room.id}
                    variants={{
                      hidden: { opacity: 0, x: 20 },
                      show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE } },
                    }}
                  >
                    <motion.button
                      ref={i === 0 ? firstItemRef : undefined}
                      type="button"
                      data-cursor="interactive"
                      data-cursor-color={room.starColor}
                      onClick={() => {
                        setOpen(false)
                        onSelect(room.id)
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left outline-none focus-visible:ring-1 focus-visible:ring-gold/60"
                      whileHover={{ backgroundColor: `${room.starColor}14` }}
                      whileFocus={{ backgroundColor: `${room.starColor}14` }}
                      transition={{ duration: 0.25 }}
                    >
                      <motion.span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: room.starColor,
                          boxShadow: `0 0 8px ${room.starColor}`,
                        }}
                        animate={{ opacity: [0.55, 1, 0.55] }}
                        transition={{
                          duration: 2.4 + i * 0.23,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-serif text-[17px] leading-snug text-starlight">
                          {room.reader}
                        </span>
                        <span className="mt-0.5 truncate font-hud text-[11px] uppercase tracking-[0.22em] text-starlight-dim">
                          {room.style}
                          {room.role === '创始人' ? ' · 创始人' : ''}
                        </span>
                      </span>
                    </motion.button>
                  </motion.li>
                ))}
              </motion.ul>

              <p className="mt-6 font-hud text-[10px] tracking-[0.22em] text-starlight-faint/70">
                更多朗读者的书房星球开拓中…
              </p>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
