import { AnimatePresence, motion } from 'framer-motion'
import type { Room } from '@/data/rooms'

/**
 * <StarTooltip> 星星悬停提示卡（design.md §7.4）
 * 玻璃拟态小卡：朗读者名（Serif 18px）+ 房间风格（Caption 11px）+ 星色小圆点。
 * 出现动画：scale 0.9→1 + opacity + y +6px→0，200ms。
 *
 * 用法（universe 视图悬停书房星时）：
 *   <StarTooltip room={hoveredRoom} x={screenX} y={screenY} />
 * x/y 为视口像素坐标（fixed 定位，自动偏移到光标右上方）。
 */
interface StarTooltipProps {
  /** 为 null 时不渲染（内部已包 AnimatePresence，有退出动画） */
  room: Room | null
  /** 视口像素坐标（星球光点中心） */
  x?: number
  y?: number
  /** 靠近屏幕右缘时向左翻转到光点左侧（保持与光点距离一致） */
  flipX?: boolean
  /** 靠近屏幕下缘时向上翻转到光点上方 */
  flipY?: boolean
}

export default function StarTooltip({ room, x = 0, y = 0, flipX = false, flipY = false }: StarTooltipProps) {
  return (
    <AnimatePresence>
      {room && (
        <motion.div
          key={room.id}
          initial={{ opacity: 0, scale: 0.9, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 4 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed z-[80]"
          style={{ left: x, top: y }}
        >
          {/* framer-motion 会覆写 transform，偏移翻转放在内层 div */}
          <div
            className="glass-panel rounded-md px-4 py-3"
            style={{
              /* 以光点为锚点偏移；翻转时镜像到另一侧，间距恒定 18px */
              transform: `translate(${flipX ? 'calc(-100% - 18px)' : '18px'}, ${flipY ? 'calc(-100% - 14px)' : '-14px'})`,
              border: `1px solid ${room.starColor}59`, // starColor / 35%
              boxShadow: `0 0 24px ${room.starColor}26`,
            }}
          >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background: room.starColor,
                boxShadow: `0 0 8px ${room.starColor}`,
              }}
            />
            <div>
              <p className="font-serif text-lg leading-tight text-starlight">
                {room.reader}
              </p>
              <p className="font-hud mt-1 text-[11px] uppercase tracking-[0.22em] text-starlight-dim">
                {room.style}
              </p>
            </div>
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
