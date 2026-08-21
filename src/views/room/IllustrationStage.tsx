import { memo, useCallback, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import type { Room } from '@/data/rooms'
import HUDFrame from '@/components/HUDFrame'
import HotspotDot from './HotspotDot'
import { hexToRgba } from './utils'

/**
 * <IllustrationStage> 2.5D 插画舞台（room.md §1 / §3）
 * - HUDFrame 括弧包裹的 1:1 插画，object-cover，圆角 8px
 * - 桌面悬停视差：鼠标移动时图片反向微移（±6px, spring 插值），营造 2.5D 景深
 * - 移动端：8s 周期缓慢漂移（幅度 4px）
 * - 图片加载中显示 starColor 呼吸骨架；底部叠加 starColor→透明渐变融入深空
 * - 悬停热点时以热点为中心淡入径向高光（"照亮这个角落"）
 */
interface IllustrationStageProps {
  room: Room
  enterDelay: number
  reduced: boolean
  isMobile: boolean
  activeHotspot: number | null
  flash: { index: number; key: number }
  onActiveHotspot: (index: number | null) => void
}

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

function IllustrationStageInner({
  room,
  enterDelay,
  reduced,
  isMobile,
  activeHotspot,
  flash,
  onActiveHotspot,
}: IllustrationStageProps) {
  const [loaded, setLoaded] = useState(false)
  const [hoveredSpot, setHoveredSpot] = useState<number | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  // 视差位移（MotionValue 直绑，绕过 render 循环）
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const px = useSpring(mx, { stiffness: 90, damping: 18, mass: 0.6 })
  const py = useSpring(my, { stiffness: 90, damping: 18, mass: 0.6 })

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (reduced || isMobile) return
      const rect = frameRef.current?.getBoundingClientRect()
      if (!rect) return
      const nx = (e.clientX - rect.left) / rect.width - 0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5
      mx.set(-nx * 12)
      my.set(-ny * 12)
    },
    [reduced, isMobile, mx, my],
  )

  const handleMouseLeave = useCallback(() => {
    mx.set(0)
    my.set(0)
    setHoveredSpot(null)
  }, [mx, my])

  const highlightSpot =
    hoveredSpot != null ? room.hotspots[hoveredSpot] : activeHotspot != null ? room.hotspots[activeHotspot] : null

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.15, filter: 'blur(10px)' }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: reduced ? 0.4 : 0.9, delay: enterDelay, ease: EASE_OUT }}
    >
      <HUDFrame color={hexToRgba(room.starColor, 0.4)}>
        <div
          ref={frameRef}
          className="relative aspect-square w-full touch-pan-y overflow-hidden rounded-lg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={() => onActiveHotspot(null)}
        >
          {/* 加载骨架：starColor 呼吸占位（防闪烁，room.md §7） */}
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${hexToRgba(room.starColor, 0.22)}, rgba(11,16,38,0.9) 72%)`,
            }}
            animate={reduced || loaded ? { opacity: loaded ? 0 : 0.4 } : { opacity: [0.25, 0.65, 0.25] }}
            transition={
              reduced || loaded
                ? { duration: 0.6 }
                : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
            }
          />

          {/* 插画层（视差 / 移动端漂移） */}
          <motion.div
            className="absolute inset-[-3%]"
            style={isMobile || reduced ? undefined : { x: px, y: py }}
            animate={
              isMobile && !reduced
                ? { x: [0, 4, 0, -4, 0], y: [0, -3, 0, 3, 0] }
                : undefined
            }
            transition={
              isMobile && !reduced
                ? { duration: 8, repeat: Infinity, ease: 'easeInOut' }
                : undefined
            }
          >
            <motion.img
              src={room.img}
              alt={`${room.reader}的书房插画`}
              className="h-full w-full select-none object-cover"
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: loaded ? 1 : 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              onLoad={() => setLoaded(true)}
            />
          </motion.div>

          {/* 底部 starColor → 透明渐变（融入深空） */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, transparent 55%, ${hexToRgba(room.starColor, 0.12)})`,
            }}
          />

          {/* 悬停热点的区域提亮（radial 140px, starColor 12%） */}
          <AnimatePresence>
            {highlightSpot && (
              <motion.div
                key={`${hoveredSpot ?? activeHotspot}`}
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(circle 140px at ${highlightSpot.x * 100}% ${highlightSpot.y * 100}%, ${hexToRgba(room.starColor, 0.12)}, transparent 70%)`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            )}
          </AnimatePresence>

          {/* 脉冲热点 ×3 */}
          {room.hotspots.map((spot, i) => (
            <HotspotDot
              key={`${room.id}-${i}`}
              spot={spot}
              index={i}
              color={room.starColor}
              enterDelay={enterDelay + (reduced ? 0 : 1.0)}
              reduced={reduced}
              active={activeHotspot === i}
              flashKey={flash.index === i ? flash.key : 0}
              onHover={setHoveredSpot}
              onToggle={(idx) => onActiveHotspot(activeHotspot === idx ? null : idx)}
            />
          ))}
        </div>
      </HUDFrame>
    </motion.div>
  )
}

const IllustrationStage = memo(IllustrationStageInner)
export default IllustrationStage
