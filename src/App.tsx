import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store'
import { fetchRooms } from '@/data/rooms'
import { audioManager } from '@/audio/AudioManager'
import StarfieldCursor from '@/components/StarfieldCursor'
import BrandMark from '@/components/BrandMark'
import AudioToggle from '@/components/AudioToggle'
import LandingView from '@/views/LandingView'
import UniverseView from '@/views/UniverseView'
import RoomView from '@/views/RoomView'
import LibraryView from '@/views/LibraryView'

/**
 * 视图装配（design.md §1 / §7.6：无传统 Navbar/Footer，单页状态机切换视图）
 *
 * 挂载位置约定：
 * - view === 'landing'  → <LandingView />（已实现，含穿越 timeline，白场峰值调用 enterUniverse）
 * - view === 'universe' → TODO(universe-agent): 在此挂载 <UniverseView />
 * - view === 'room'     → TODO(room-agent): 在此挂载 <RoomView />
 */

/** landing→universe 穿越的白场淡出（landing 内部推进到白场峰值后切视图，由此层 500ms 淡出露出星野） */
function WarpFlash() {
  const view = useAppStore((s) => s.view)
  const [prevView, setPrevView] = useState(view)
  const [flashing, setFlashing] = useState(false)

  // 渲染期间检测视图切换（React 推荐的 adjust-state-during-render 模式）
  if (prevView !== view) {
    if (prevView === 'landing' && view === 'universe') {
      setFlashing(true)
    }
    setPrevView(view)
  }

  if (!flashing) return null
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] bg-starlight"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      onAnimationComplete={() => setFlashing(false)}
    />
  )
}

export default function App() {
  const view = useAppStore((s) => s.view)

  // 预载书房数据（写入 store.roomOrder，供 nextRoom/prevRoom 循环）
  useEffect(() => {
    void fetchRooms()
  }, [])

  // ambience 音量随视图调整（design.md §8）
  useEffect(() => {
    if (view === 'landing') audioManager.setAmbienceLevel('landing')
    else audioManager.setAmbienceLevel('universe')
  }, [view])

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void text-starlight">
      {view === 'landing' && <LandingView />}

      {view === 'universe' && <UniverseView />}

      {view === 'room' && <RoomView />}

      {view === 'library' && <LibraryView />}

      <WarpFlash />

      {/* 常驻 HUD（design.md §7.6） */}
      <StarfieldCursor />
      <BrandMark />
      <AudioToggle />
    </div>
  )
}
