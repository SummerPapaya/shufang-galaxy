import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAppStore } from '@/store'
import { useRoom } from '@/data/rooms'
import { audioManager } from '@/audio/AudioManager'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import IllustrationStage from './room/IllustrationStage'
import ShelfPlayer from './room/ShelfPlayer'
import StarDust from './room/StarDust'
import { HudNote, RoomBook, RoomHeading, RoomQuote } from './room/RoomInfo'
import { hexToRgba, poeticLine } from './room/utils'

/**
 * <RoomView> 书房详情视图（room.md）
 * - 2.5D 插画舞台（悬停视差 / 移动端漂移）+ 3 个脉冲热点（悬停气泡 / 点击诗意卡片）
 * - 拟物书架播放器：audioManager.play/toggleSample/seek，播放时 ambience ducking
 * - 信息区（标题 / 风格 / 语录 / 书目）强调色全部随 starColor 切换
 * - 入场：白场落地对焦（§2 时序）；退出：收拢 + 白场闪入后 closeRoom()
 * - ← / → 平行宇宙跳跃（面板滑出 + 白场淡入，动画 1.2 倍速）；ESC 返回星空
 */

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const EASE_IN: [number, number, number, number] = [0.64, 0, 0.78, 0]

function NavButton({
  children,
  color,
  onClick,
  ariaLabel,
}: {
  children: ReactNode
  color: string
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-cursor="interactive"
      data-cursor-color={color}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded-full border px-3.5 py-1.5 font-hud text-[11px] tracking-[0.18em] text-starlight-dim transition-colors duration-200 hover:text-starlight"
      style={{ borderColor: hexToRgba(color, 0.3) }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = hexToRgba(color, 0.7))}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = hexToRgba(color, 0.3))}
    >
      {children}
    </button>
  )
}

export default function RoomView() {
  const selectedRoomId = useAppStore((s) => s.selectedRoomId)
  const roomOrder = useAppStore((s) => s.roomOrder)
  const closeRoom = useAppStore((s) => s.closeRoom)
  const nextRoom = useAppStore((s) => s.nextRoom)
  const prevRoom = useAppStore((s) => s.prevRoom)

  const room = useRoom(selectedRoomId)
  const reduced = useReducedMotion() ?? false
  const isMobile = useIsMobile()

  const [leaving, setLeaving] = useState(false)
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null)
  const [flash, setFlash] = useState({ index: -1, key: 0 })
  const [wake, setWake] = useState(0)
  /* R3 朗读书目：当前选中的书/集 */
  const [trackSel, setTrackSel] = useState({ b: 0, e: 0 })
  const stageScrollRef = useRef<HTMLDivElement>(null)

  // 平行宇宙跳跃方向（由 roomOrder 索引差推断，render 期间调整 state 模式）
  const [lastId, setLastId] = useState<string | null>(selectedRoomId)
  const [dir, setDir] = useState(1)
  if (lastId !== selectedRoomId) {
    const prevIdx = lastId ? roomOrder.indexOf(lastId) : -1
    const nextIdx = selectedRoomId ? roomOrder.indexOf(selectedRoomId) : -1
    if (prevIdx >= 0 && nextIdx >= 0 && prevIdx !== nextIdx) {
      // 末→首 回绕视为正向
      setDir(nextIdx === (prevIdx + 1) % roomOrder.length ? 1 : -1)
    }
    setLastId(selectedRoomId)
    setActiveHotspot(null)
    setTrackSel({ b: 0, e: 0 })
  }

  // 入场延迟倍率：首次白场落地 1，平行宇宙跳跃 0.7（1.2 倍速）
  const [firstId] = useState(selectedRoomId)
  const ds = selectedRoomId === firstId ? 1 : 0.7

  const requestClose = useCallback(() => {
    setLeaving(true)
  }, [])

  // 键盘：ESC 返回星空；← → 切换书房
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
      else if (e.key === 'ArrowRight') nextRoom()
      else if (e.key === 'ArrowLeft') prevRoom()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose, nextRoom, prevRoom])

  // 切换房间 / 离开视图：停止当前 sample（300ms 淡出由 AudioManager 处理）
  useEffect(() => {
    return () => audioManager.stop()
  }, [selectedRoomId])

  if (!room) {
    // 数据仍在加载：星光闪烁骨架
    return (
      <div className="absolute inset-0 z-[30] flex items-center justify-center bg-void">
        <motion.p
          className="font-hud text-[11px] tracking-[0.35em] text-starlight-faint"
          animate={reduced ? { opacity: 0.6 } : { opacity: [0.25, 0.8, 0.25] }}
          transition={reduced ? { duration: 0.3 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          正在校准星轨 …
        </motion.p>
      </div>
    )
  }

  const roomIndex = Math.max(0, roomOrder.indexOf(room.id))

  /* 朗读书目 + 播放器：创始人书房（noPlayer）不展示 */
  const showReading = !room.noPlayer

  /* R3 朗读书目：当前曲目（书+单集）→ 播放器 */
  const books =
    room.books && room.books.length > 0
      ? room.books
      : [
          {
            title: room.book.split('·')[0].trim().replace(/[《》]/g, ''),
            author: room.book.split('·')[1]?.trim() ?? '',
            episodes: [{ title: '第 1 集 · 试音样片', audio: room.audio }],
          },
        ]
  const curBook = books[Math.min(trackSel.b, books.length - 1)]
  const curEp = curBook.episodes[Math.min(trackSel.e, curBook.episodes.length - 1)]
  const track = {
    key: `${room.id}#${trackSel.b}-${trackSel.e}`,
    label: `《${curBook.title}》 · ${curEp.title}`,
    sub: `${room.reader} 正在朗读`,
    audio: curEp.audio,
  }
  const handleSelectTrack = (b: number, e: number, play: boolean) => {
    setTrackSel({ b, e })
    if (play) {
      const ep = books[b]?.episodes[e]
      if (ep) {
        audioManager.play(`${room.id}#${b}-${e}`, ep.audio)
        setWake((w) => w + 1)
      }
    }
  }

  const guideToHotspot = (i: number) => {
    setFlash((f) => ({ index: i, key: f.key + 1 }))
    setActiveHotspot(i)
    if (isMobile) stageScrollRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  }

  const topBar = (
    <motion.div
      className="relative z-[95] flex items-center justify-between gap-3 pt-[76px] lg:pt-6 lg:pl-[430px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: (reduced ? 0.2 : 1.3) * ds }}
    >
      <NavButton color={room.starColor} onClick={requestClose} ariaLabel="返回星空">
        ← 返回星空
      </NavButton>
      <div className="flex items-center gap-2">
        <NavButton color={room.starColor} onClick={prevRoom} ariaLabel="上一颗书房星">
          ← 上一颗
        </NavButton>
        <NavButton color={room.starColor} onClick={nextRoom} ariaLabel="下一颗书房星">
          下一颗 →
        </NavButton>
      </div>
    </motion.div>
  )

  const stage = (
    <IllustrationStage
      room={room}
      enterDelay={reduced ? 0.1 : 0.3 * ds}
      reduced={reduced}
      isMobile={isMobile}
      activeHotspot={activeHotspot}
      flash={flash}
      onActiveHotspot={setActiveHotspot}
    />
  )

  const player = (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 1.1 * ds, ease: EASE_OUT }}
    >
      <ShelfPlayer room={room} track={track} reduced={reduced} onWake={() => setWake((w) => w + 1)} />
    </motion.div>
  )

  return (
    <div className="absolute inset-0 z-[30] bg-void">
      {/* 背景层：深空渐变 + 星点 + starColor 大半径光晕 */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 50% 40%, var(--nebula-deep) 0%, var(--void) 75%)',
        }}
      />
      <StarDust seed={room.id} reduced={reduced} />
      <motion.div
        key={`glow-${wake}`}
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle 560px at 32% 50%, ${hexToRgba(room.starColor, 0.14)}, transparent 70%)`,
          filter: 'blur(60px)',
        }}
        initial={{ opacity: 0 }}
        animate={
          wake > 0
            ? { opacity: [1, 1.2, 1] } // 「房间回应」：播放瞬间光晕亮度 +20%，600ms 回落
            : { opacity: 1 }
        }
        transition={wake > 0 ? { duration: 0.6, times: [0, 0.25, 1] } : { duration: 0.9, delay: 0.3 * ds }}
      />

      {/* 面板（平行宇宙跳跃：旧面板滑出，新面板白场淡入） */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={room.id}
          className="relative h-full w-full"
          initial={{ opacity: 0 }}
          animate={leaving ? { opacity: 0.4, scale: reduced ? 1 : 0.94 } : { opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -40 * dir }}
          transition={
            leaving
              ? { duration: 0.6, ease: EASE_IN }
              : { duration: 0.25, ease: EASE_IN }
          }
        >
          {isMobile ? (
            /* ── 移动端：全屏纵向抽屉（§1）── */
            <div className="scrollbar-starfield h-full overflow-y-auto overscroll-contain">
              <div className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 pb-6 pt-2">
                {topBar}
                <div ref={stageScrollRef} className="scroll-mt-6">
                  {stage}
                </div>
                <RoomHeading room={room} roomIndex={roomIndex} ds={ds} reduced={reduced} />
                <RoomQuote room={room} roomIndex={roomIndex} ds={ds} reduced={reduced} />
                {showReading && player}
                {showReading && (
                  <RoomBook
                    key={`book-${room.id}`}
                    room={room}
                    roomIndex={roomIndex}
                    ds={ds}
                    reduced={reduced}
                    selB={trackSel.b}
                    selE={trackSel.e}
                    onSelect={handleSelectTrack}
                  />
                )}
                {/* 物件导览（每行：label + 一句话，点击滚回插画并闪烁热点） */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: (reduced ? 0.2 : 1.3) * ds }}
                >
                  <p className="font-hud text-[10px] uppercase tracking-[0.22em] text-starlight-faint">
                    物件导览
                  </p>
                  <ul className="mt-2 divide-y divide-[rgba(245,240,230,0.08)]">
                    {room.hotspots.map((spot, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 py-3 text-left"
                          onClick={() => guideToHotspot(i)}
                        >
                          <span
                            aria-hidden
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: room.starColor, boxShadow: `0 0 8px ${hexToRgba(room.starColor, 0.6)}` }}
                          />
                          <span>
                            <span className="block text-[13px] font-medium text-starlight">{spot.label}</span>
                            <span className="mt-0.5 block text-[12px] leading-relaxed text-starlight-dim">
                              {poeticLine(spot.label)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
                <HudNote room={room} roomIndex={roomIndex} ds={ds} reduced={reduced} />
              </div>
              {/* sticky 底部紧凑播放器（§7：随时可控音频） */}
              {showReading && (
                <div className="sticky bottom-0 z-20">
                  <ShelfPlayer room={room} compact reduced={reduced} onWake={() => setWake((w) => w + 1)} />
                </div>
              )}
            </div>
          ) : (
            /* ── 桌面端：双栏 max-w 1200px 居中（§1）── */
            <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col px-6 pb-6 lg:px-10">
              {topBar}
              <div className="flex min-h-0 flex-1 items-center gap-8 lg:gap-12">
                {/* 左栏：插画舞台 ~58% */}
                <div ref={stageScrollRef} className="flex w-[55%] justify-center lg:w-[58%]">
                  <div className="w-full max-w-[min(100%,76vh)]">{stage}</div>
                </div>
                {/* 右栏：信息区 ~42% */}
                <div className="scrollbar-starfield flex max-h-full w-[45%] flex-col gap-5 overflow-y-auto pr-1 lg:w-[42%] lg:gap-6">
                  <RoomHeading room={room} roomIndex={roomIndex} ds={ds} reduced={reduced} />
                  <RoomQuote room={room} roomIndex={roomIndex} ds={ds} reduced={reduced} />
                  {showReading && (
                    <RoomBook
                      key={`book-${room.id}`}
                      room={room}
                      roomIndex={roomIndex}
                      ds={ds}
                      reduced={reduced}
                      selB={trackSel.b}
                      selE={trackSel.e}
                      onSelect={handleSelectTrack}
                    />
                  )}
                  {showReading && player}
                </div>
              </div>
              {/* 底栏：物件导览 chips + HUD 角注 */}
              <motion.div
                className="flex items-end justify-between gap-4 pt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: (reduced ? 0.2 : 1.3) * ds }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 font-hud text-[10px] uppercase tracking-[0.22em] text-starlight-faint">
                    物件导览
                  </span>
                  {room.hotspots.map((spot, i) => (
                    <button
                      key={i}
                      type="button"
                      data-cursor="interactive"
                      data-cursor-color={room.starColor}
                      onClick={() => guideToHotspot(i)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-[12px] text-starlight-dim transition-colors duration-200 hover:text-starlight',
                        activeHotspot === i && 'text-starlight',
                      )}
                      style={{
                        borderColor: hexToRgba(room.starColor, activeHotspot === i ? 0.7 : 0.25),
                        background: activeHotspot === i ? hexToRgba(room.starColor, 0.08) : 'transparent',
                      }}
                    >
                      {spot.label.split('·')[0].trim()}
                    </button>
                  ))}
                </div>
                <HudNote room={room} roomIndex={roomIndex} ds={ds} reduced={reduced} />
              </motion.div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 白场：进入时从白场浮现，退出时收拢为白场后 closeRoom() */}
      <motion.div
        key={`white-${room.id}`}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-starlight"
        initial={{ opacity: 1 }}
        animate={{ opacity: leaving ? 1 : 0 }}
        transition={
          leaving
            ? { duration: reduced ? 0.4 : 0.6, ease: EASE_IN }
            : { duration: (reduced ? 0.4 : 0.45) * ds, ease: 'easeOut' }
        }
        onAnimationComplete={() => {
          if (leaving) closeRoom()
        }}
      />
    </div>
  )
}
