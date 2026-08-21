import { memo, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { RoomHotspot } from '@/data/rooms'
import { hexToRgba, poeticLine } from './utils'

/**
 * <HotspotDot> 脉冲热点（room.md §3.2）
 * 静止：10px starColor 实心核 + 20px 描边环，2.4s 脉冲扩散（三点相位各错 0.8s）；
 * 悬停：圆点放大 1.4x、脉冲暂停为常亮光晕、浮现玻璃拟态标签气泡；
 * 点击：气泡翻转为小卡片（label + 诗意扩写一句），再次点击或点击他处收回。
 * 独立 memo 组件，隔离 perpetual 脉冲动画。
 */
interface HotspotDotProps {
  spot: RoomHotspot
  index: number
  color: string
  /** 入场延迟基准（秒），三个点 stagger 150ms */
  enterDelay: number
  reduced: boolean
  /** 卡片是否展开（点击态） */
  active: boolean
  /** 递增值：触发「物件导览」的三次闪烁 */
  flashKey: number
  onHover: (index: number | null) => void
  onToggle: (index: number) => void
}

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

function HotspotDotInner({
  spot,
  index,
  color,
  enterDelay,
  reduced,
  active,
  flashKey,
  onHover,
  onToggle,
}: HotspotDotProps) {
  const [hovered, setHovered] = useState(false)
  const [flashing, setFlashing] = useState(false)
  // 物件导览触发：flashKey 递增时进入闪烁（render 期间调整 state 模式）
  const [seenFlash, setSeenFlash] = useState(flashKey)
  if (seenFlash !== flashKey) {
    setSeenFlash(flashKey)
    if (flashKey > 0) setFlashing(true)
  }

  useEffect(() => {
    if (!flashing) return
    const t = window.setTimeout(() => setFlashing(false), 1200)
    return () => window.clearTimeout(t)
  }, [flashing])

  const showBubble = (hovered && !active) || flashing
  // 气泡边缘翻转：热点太靠上则气泡放到下方，太靠边则对齐边缘
  const placeBelow = spot.y < 0.28
  const alignClass =
    spot.x < 0.22
      ? 'left-0 -translate-x-2'
      : spot.x > 0.78
        ? 'right-0 translate-x-2'
        : 'left-1/2 -translate-x-1/2'

  return (
    <motion.div
      className="absolute z-20 h-0 w-0"
      style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={
        reduced
          ? { duration: 0.3, delay: enterDelay }
          : { type: 'spring', stiffness: 320, damping: 18, delay: enterDelay + index * 0.15 }
      }
    >
      <button
        type="button"
        aria-label={spot.label}
        aria-expanded={active}
        data-cursor="interactive"
        data-cursor-color={color}
        className="relative flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        onMouseEnter={() => {
          setHovered(true)
          onHover(index)
        }}
        onMouseLeave={() => {
          setHovered(false)
          onHover(null)
        }}
        onFocus={() => onHover(index)}
        onBlur={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(index)
        }}
      >
        {/* 脉冲外环（悬停/闪烁时暂停为常亮光晕） */}
        <motion.span
          aria-hidden
          className="absolute h-5 w-5 rounded-full border"
          style={{ borderColor: hexToRgba(color, 0.6) }}
          animate={
            reduced
              ? { opacity: 0.5, scale: 1 }
              : hovered || active
                ? { opacity: 0.35, scale: 1.35 }
                : { opacity: [0.6, 0], scale: [1, 1.8] }
          }
          transition={
            reduced || hovered || active
              ? { duration: 0.25 }
              : { duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: index * 0.8 }
          }
        />
        {/* 实心核（闪烁时三次脉动） */}
        <motion.span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 10px ${hexToRgba(color, 0.8)}` }}
          animate={
            flashing
              ? { scale: [1, 1.8, 1, 1.8, 1, 1.8, 1] }
              : { scale: hovered || active ? 1.4 : 1 }
          }
          transition={flashing ? { duration: 1.1, times: [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1] } : { duration: 0.18 }}
        />
      </button>

      {/* 悬停气泡 / 点击小卡片 */}
      <AnimatePresence>
        {(showBubble || active) && (
          <motion.div
            key={active ? 'card' : 'bubble'}
            role={active ? 'dialog' : undefined}
            className={`pointer-events-none absolute z-30 w-max max-w-[240px] rounded-md border px-3 py-2 text-left ${alignClass} ${
              placeBelow ? 'top-full mt-3' : 'bottom-full mb-3'
            }`}
            style={{
              background: 'rgba(11,16,38,0.78)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderColor: hexToRgba(color, 0.35),
              pointerEvents: active ? 'auto' : 'none',
            }}
            initial={{ opacity: 0, y: reduced ? 0 : placeBelow ? -6 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : placeBelow ? -6 : 6 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] font-medium leading-snug text-starlight">{spot.label}</p>
            {active && (
              <motion.p
                className="mt-1.5 text-[12px] leading-relaxed text-starlight-dim"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, delay: 0.05 }}
              >
                {poeticLine(spot.label)}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const HotspotDot = memo(HotspotDotInner)
export default HotspotDot
