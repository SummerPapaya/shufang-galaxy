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
import AdminEchoesPage from '@/views/AdminEchoesPage'

/**
 * 视图装配（design.md §1 / §7.6：无传统 Navbar/Footer，单页状态机切换视图）
 *
 * 挂载位置约定：
 * - view === 'landing'  → <LandingView />
 * - view === 'universe' → <UniverseView />
 * - view === 'room'     → <RoomView />
 * - view === 'library'  → <LibraryView />
 * - hash #/admin/echoes → 宇宙回声审核页（Pages / Vercel 均可，不依赖服务端路由）
 */

function useAdminEchoesRoute(): boolean {
  const [admin, setAdmin] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.location.hash.replace(/^#/, '') === '/admin/echoes'
  })

  useEffect(() => {
    const sync = () => {
      setAdmin(window.location.hash.replace(/^#/, '') === '/admin/echoes')
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return admin
}

/** landing→universe 穿越的白场淡出 */
function WarpFlash() {
  const view = useAppStore((s) => s.view)
  const [prevView, setPrevView] = useState(view)
  const [flashing, setFlashing] = useState(false)

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
  const adminEchoes = useAdminEchoesRoute()

  useEffect(() => {
    if (adminEchoes) return
    void fetchRooms()
  }, [adminEchoes])

  useEffect(() => {
    if (adminEchoes) return
    if (view === 'landing') audioManager.setAmbienceLevel('landing')
    else audioManager.setAmbienceLevel('universe')
  }, [view, adminEchoes])

  if (adminEchoes) {
    return <AdminEchoesPage />
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void text-starlight">
      {view === 'landing' && <LandingView />}

      {view === 'universe' && <UniverseView />}

      {view === 'room' && <RoomView />}

      {view === 'library' && <LibraryView />}

      <WarpFlash />

      <StarfieldCursor />
      <BrandMark />
      <AudioToggle />
    </div>
  )
}
