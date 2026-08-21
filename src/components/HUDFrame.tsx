import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * <HUDFrame> 科幻边框装饰（design.md §7.2）
 * 四角 L 形细线括弧（1px，默认 gold/40%），内边距 12px，角长 16px。
 * 用于详情面板、提示卡四角，呼应"观测舱"感。
 */
interface HUDFrameProps {
  children?: ReactNode
  className?: string
  /** 括弧颜色，默认 rgba(255,217,160,0.4)（gold/40%）；书房详情可传 room.starColor */
  color?: string
  /** 角长 px，默认 16 */
  corner?: number
}

export default function HUDFrame({
  children,
  className,
  color = 'rgba(255, 217, 160, 0.4)',
  corner = 16,
}: HUDFrameProps) {
  const base: CSSProperties = {
    position: 'absolute',
    width: corner,
    height: corner,
    borderColor: color,
    borderStyle: 'solid',
    borderWidth: 0,
    pointerEvents: 'none',
  }
  return (
    <div className={cn('relative p-3', className)}>
      <span aria-hidden style={{ ...base, top: 0, left: 0, borderTopWidth: 1, borderLeftWidth: 1 }} />
      <span aria-hidden style={{ ...base, top: 0, right: 0, borderTopWidth: 1, borderRightWidth: 1 }} />
      <span aria-hidden style={{ ...base, bottom: 0, left: 0, borderBottomWidth: 1, borderLeftWidth: 1 }} />
      <span aria-hidden style={{ ...base, bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1 }} />
      {children}
    </div>
  )
}
