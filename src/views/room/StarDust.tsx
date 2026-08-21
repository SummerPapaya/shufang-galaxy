import { memo } from 'react'
import { motion } from 'framer-motion'
import { seededRandoms } from './utils'

/**
 * <StarDust> 书房背景的极淡静态星点（DOM 少量粒子，非 WebGL，room.md §1）
 * memo 隔离 perpetual 闪烁动画；reduced 时纯静态。
 */
const COUNT = 12

function StarDustInner({ seed, reduced }: { seed: string; reduced: boolean }) {
  const rand = seededRandoms(`${seed}-dust`, COUNT * 4)
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: COUNT }, (_, i) => {
        const left = rand[i * 4] * 100
        const top = rand[i * 4 + 1] * 100
        const size = 1 + rand[i * 4 + 2] * 2
        const dur = 2.5 + rand[i * 4 + 3] * 3
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-starlight"
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
            animate={reduced ? { opacity: 0.35 } : { opacity: [0.12, 0.5, 0.12] }}
            transition={
              reduced
                ? { duration: 0.3 }
                : { duration: dur, repeat: Infinity, ease: 'easeInOut', delay: rand[(i * 4 + 2) % rand.length] * dur }
            }
          />
        )
      })}
    </div>
  )
}

const StarDust = memo(StarDustInner)
export default StarDust
