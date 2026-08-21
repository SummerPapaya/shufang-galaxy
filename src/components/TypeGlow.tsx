import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * <TypeGlow> 发光标题（design.md §7.5）
 * 文本下方叠加同文本的模糊副本（blur 12px，gold/40%），营造霓虹柔光。
 * landing 主标题与书房标题共用。
 */
interface TypeGlowProps {
  children: ReactNode
  className?: string
  /** 光晕颜色，默认 gold/40%；书房详情可传 room.starColor */
  glowColor?: string
  /** 模糊半径 px，默认 12 */
  blur?: number
}

export default function TypeGlow({
  children,
  className,
  glowColor = 'rgba(255, 217, 160, 0.4)',
  blur = 12,
}: TypeGlowProps) {
  return (
    <span className={cn('relative inline-block', className)}>
      {/* 模糊副本（光晕层） */}
      <span
        aria-hidden
        className="absolute inset-0 select-none"
        style={{ color: glowColor, filter: `blur(${blur}px)` }}
      >
        {children}
      </span>
      {/* 文本本体 */}
      <span className="relative">{children}</span>
    </span>
  )
}
