import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import GalaxyBackdrop from '@/components/GalaxyBackdrop'
import type { RoomStarSpec } from '@/components/GalaxyBackdrop'
import TypeGlow from '@/components/TypeGlow'
import { useRooms, preloadRoomImage } from '@/data/rooms'
import { useAppStore } from '@/store'
import { audioManager } from '@/audio/AudioManager'

gsap.registerPlugin(useGSAP)

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const TITLE = Array.from('一个人的书房')

/* 伍尔夫 SLOGAN：分段数据（gold = 暖金强调关键词） */
const SLOGAN_SEGMENTS: { text: string; gold?: boolean }[] = [
  { text: '「若以书而论，每本书都会变成你自己的' },
  { text: '房间', gold: true },
  { text: '，给你一个' },
  { text: '庇护', gold: true },
  { text: '，让你' },
  { text: '安静', gold: true },
  { text: '下来。」' },
]

const SLOGAN_CHARS = SLOGAN_SEGMENTS.flatMap((seg) =>
  Array.from(seg.text).map((ch) => ({ ch, gold: !!seg.gold })),
)
const SLOGAN_TOTAL = SLOGAN_CHARS.length

/** 打字机节奏：每字 60–90ms 随机；入场动画（~2.8s）结束后开打的延迟 */
const TYPE_START_DELAY = 2600

/**
 * 整页 SLOGAN：伍尔夫引言打字机逐字显现 + 暖金竖线光标。
 * 布局稳定方案：渲染一份 invisible 全文占位（撑开高度），打字层绝对覆盖其上。
 * prefers-reduced-motion：直接完整显示，无动画。
 */
function SloganTypewriter() {
  const [typed, setTyped] = useState(REDUCED_MOTION ? SLOGAN_TOTAL : 0)
  const done = typed >= SLOGAN_TOTAL

  useEffect(() => {
    if (REDUCED_MOTION) return
    let timer: number
    const typeNext = (count: number) => {
      if (count >= SLOGAN_TOTAL) return
      timer = window.setTimeout(() => {
        setTyped(count + 1)
        typeNext(count + 1)
      }, 60 + Math.random() * 30)
    }
    timer = window.setTimeout(() => typeNext(0), TYPE_START_DELAY)
    return () => window.clearTimeout(timer)
  }, [])

  const sloganClass =
    'slogan-text font-serif text-[clamp(20px,3.2vw,30px)] font-medium leading-relaxed tracking-[0.06em] text-starlight'

  return (
    <div className="mt-10 flex max-w-[680px] flex-col items-center">
      <div className="relative">
        {/* 不可见全文占位：保证打字过程中下方 CTA 不位移 */}
        <p aria-hidden className={`invisible ${sloganClass}`}>
          {SLOGAN_CHARS.map((c, i) => (
            <span key={i} className={c.gold ? 'slogan-keyword' : undefined}>
              {c.ch}
            </span>
          ))}
        </p>
        {/* 打字层 */}
        <p className={`absolute inset-0 ${sloganClass}`}>
          {SLOGAN_CHARS.slice(0, typed).map((c, i) => (
            <span key={i} className={c.gold ? 'slogan-keyword' : undefined}>
              {c.ch}
            </span>
          ))}
          {!REDUCED_MOTION && (
            <span
              aria-hidden
              className={done ? 'slogan-caret slogan-caret--fade' : 'slogan-caret slogan-caret--blink'}
            />
          )}
        </p>
      </div>
      {/* 署名：打字完成后淡入 */}
      <p
        className="mt-5 font-serif text-[clamp(13px,1.6vw,16px)] tracking-[0.08em] text-starlight-dim transition-all duration-700 ease-out"
        style={{
          opacity: done ? 1 : 0,
          transform: done ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        —— 弗吉尼亚·伍尔夫《一个人的房间》
      </p>
    </div>
  )
}

/**
 * Landing · 星河远景（design/home.md）
 * - 程序化银河远景（GalaxyBackdrop）+ 逐字入场标题 + 品牌引言 + CTA
 * - 点击 CTA / 向下滚动触发穿越动画（FOV 拉伸 + 粒子飞散 + 白光隧道 + 闪白）
 *   穿越 timeline 在本组件内驱动 GalaxyBackdrop 的 warpRef/fovRef，
 *   白场峰值时调用 store.enterUniverse()；白场淡出让 App 层闪白层接管。
 */
export default function LandingView() {
  const { rooms } = useRooms()
  const enterUniverse = useAppStore((s) => s.enterUniverse)

  const rootRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const tunnelRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)

  const warpingRef = useRef(false)
  const warpProgress = useRef(0)
  const fovValue = useRef(60)

  const [coords, setCoords] = useState('RA 05h 35m · DEC −05° 23′ · 距离 1,300 光年')

  const roomStars: RoomStarSpec[] = useMemo(
    () => rooms.map((r) => ({ id: r.id, color: r.starColor })),
    [rooms],
  )

  /* 底部坐标每 8s 轻微跳动（"实时观测"感） */
  useEffect(() => {
    if (REDUCED_MOTION) return
    const timer = window.setInterval(() => {
      const ly = 1297 + Math.floor(Math.random() * 7)
      const decMin = 21 + Math.floor(Math.random() * 5)
      setCoords(`RA 05h 35m · DEC −05° ${decMin}′ · 距离 ${ly.toLocaleString()} 光年`)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [])

  /* 入场动画（home.md §2，总时长 ~2.8s） */
  useGSAP(
    () => {
      if (REDUCED_MOTION) {
        gsap.fromTo(
          rootRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.4, ease: 'power1.out' },
        )
        return
      }
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      // 0.0s 星河背景：对焦淡入
      tl.fromTo(
        bgRef.current,
        { opacity: 0, scale: 1.08 },
        { opacity: 1, scale: 1, duration: 1.8, ease: 'power2.out' },
        0,
      )
      // 0.4s 主标题逐字入场
      tl.fromTo(
        '.landing-char',
        { y: 30, opacity: 0, filter: 'blur(6px)' },
        { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9, stagger: 0.09 },
        0.4,
      )
      // 1.2s 副题
      tl.fromTo(
        '.landing-subtitle',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5 },
        1.2,
      )
      // 1.8s 引言逐行
      tl.fromTo(
        '.landing-quote-line',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.2 },
        1.8,
      )
      // 2.4s CTA（伍尔夫 SLOGAN 由打字机驱动，不参与整段淡入）
      tl.fromTo(
        ctaRef.current,
        { opacity: 0, scale: 0.92 },
        { opacity: 1, scale: 1, duration: 0.5 },
        2.4,
      )
      // 2.6s 底部 HUD
      tl.fromTo('.landing-hud-line', { scaleX: 0 }, { scaleX: 1, duration: 0.6 }, 2.6)
      tl.fromTo(hudRef.current, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 2.6)
    },
    { scope: rootRef },
  )

  /* 文案层反向视差 ±4px */
  useEffect(() => {
    if (REDUCED_MOTION) return
    const el = textRef.current
    if (!el) return
    const qx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power2.out' })
    const qy = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power2.out' })
    const onMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      qx(nx * 8)
      qy(ny * 8)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  /* 穿越动画（home.md §4，~2800ms） */
  const startWarp = () => {
    if (warpingRef.current) return
    warpingRef.current = true

    // 首次用户手势：解锁音频，ambience 以 landing 音量起播
    audioManager.unlock()
    audioManager.startAmbience('landing')

    const onArrive = () => {
      enterUniverse()
      audioManager.setAmbienceLevel('universe')
    }

    if (REDUCED_MOTION) {
      // 降级：600ms 简单闪白
      gsap
        .timeline()
        .to(flashRef.current, { opacity: 1, duration: 0.3, ease: 'power1.in' })
        .call(onArrive)
      return
    }

    const fov = { v: 60 }
    const warp = { v: 0 }
    const tl = gsap.timeline()

    // 1) 0–600ms 文案层上浮消散，HUD 淡出
    tl.to(
      textRef.current,
      { scale: 1.06, opacity: 0, y: -40, filter: 'blur(8px)', duration: 0.6, ease: 'power2.in' },
      0,
    ).to([ctaRef.current, hudRef.current], { opacity: 0, duration: 0.4 }, 0)

    // 2) 300–2400ms 镜头推进：FOV 60→92→62，粒子径向飞散
    tl.to(
      fov,
      {
        v: 92,
        duration: 1.2,
        ease: 'power2.in',
        onUpdate: () => (fovValue.current = fov.v),
      },
      0.3,
    ).to(
      fov,
      {
        v: 62,
        duration: 0.9,
        ease: 'power2.out',
        onUpdate: () => (fovValue.current = fov.v),
      },
      1.5,
    )
    tl.to(
      warp,
      {
        v: 1,
        duration: 2.1,
        ease: 'power2.in',
        onUpdate: () => (warpProgress.current = warp.v),
      },
      0.3,
    )

    // 3) 白光隧道（radial-gradient 蒙版，scale 0→3）
    tl.fromTo(
      tunnelRef.current,
      { scale: 0, opacity: 1 },
      { scale: 3, duration: 2.1, ease: 'power2.in' },
      0.3,
    )

    // 4) 2200–2800ms 白场铺满 → 切换视图（淡出让 App 层接管）
    tl.to(flashRef.current, { opacity: 1, duration: 0.35, ease: 'power1.in' }, 2.45)
    tl.call(onArrive, undefined, 2.75)
  }

  /* 滚轮 / 触摸上滑：累积阈值 ~300px 触发穿越 */
  useEffect(() => {
    let acc = 0
    let touchY: number | null = null

    const onWheel = (e: WheelEvent) => {
      if (warpingRef.current) return
      acc += e.deltaY
      if (acc > 300) {
        acc = 0
        startWarp()
      }
      // 反向滚动则衰减
      if (e.deltaY < 0) acc = Math.max(0, acc + e.deltaY * 2)
    }
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (touchY == null || warpingRef.current) return
      const dy = touchY - e.touches[0].clientY
      if (dy > 80) startWarp()
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={rootRef} className="relative h-[100dvh] w-full overflow-hidden bg-void">
      {/* A. 星河背景层 */}
      <div ref={bgRef} className="absolute inset-0">
        <GalaxyBackdrop
          roomStars={roomStars}
          warpRef={warpProgress}
          fovRef={fovValue}
          onRoomStarHover={(id) => {
            // landing 保持克制：悬停仅提亮（组件内置），顺带预取插画
            const room = id ? rooms.find((r) => r.id === id) : undefined
            if (room) preloadRoomImage(room)
          }}
        />
      </div>

      {/* B + C. 文案与 CTA 层 */}
      <div
        ref={textRef}
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
      >
        {/* 主标题（逐字入场） */}
        <h1 className="mt-6 font-serif text-[clamp(48px,9vw,88px)] font-bold leading-tight tracking-[0.12em] text-starlight">
          <TypeGlow>
            {TITLE.map((ch, i) => (
              <span key={i} className="landing-char inline-block">
                {ch}
              </span>
            ))}
          </TypeGlow>
        </h1>

        {/* 副题 */}
        <p className="landing-subtitle mt-4 font-serif text-xl font-semibold text-gold">
          「你的，我的，我们的房间」
        </p>

        {/* 引言 */}
        <div
          className="mt-8 max-w-[480px] font-sans text-[15px] text-starlight-dim"
          style={{ lineHeight: 2.2 }}
        >
          <p className="landing-quote-line">宇宙浩瀚广阔，而我们不过是散落其中的小小尘埃，</p>
          <p className="landing-quote-line">但感谢时空的涟漪，让我们在这茫茫星河里相遇。</p>
        </div>

        {/* 伍尔夫 SLOGAN（打字机逐字显现，整页视觉主角之一） */}
        <SloganTypewriter />

        {/* CTA */}
        <div ref={ctaRef} className="mt-10 flex flex-col items-center">
          <button
            type="button"
            data-cursor="interactive"
            onClick={startWarp}
            className="group relative flex h-14 w-[200px] items-center justify-center rounded-full border border-[rgba(255,217,160,0.6)] bg-transparent transition-all duration-200 hover:scale-[1.03] hover:border-gold hover:bg-[rgba(255,217,160,0.08)]"
          >
            <span className="font-sans text-base font-medium tracking-[0.3em] text-starlight">
              进入星空
            </span>
            <span
              aria-hidden
              className="animate-cta-breathe absolute h-1.5 w-1.5 rounded-full bg-gold group-hover:[animation-duration:1.2s]"
              style={{ boxShadow: '0 0 10px var(--gold)' }}
            />
          </button>
          <p className="animate-hint-float mt-4 font-hud text-[11px] tracking-[0.22em] text-starlight-faint">
            ↓ 或向下滚动，穿越星河
          </p>
        </div>
      </div>

      {/* D. 底部 HUD */}
      <div ref={hudRef} className="absolute inset-x-0 bottom-6 z-10">
        <div className="relative flex items-center justify-center">
          <span
            className="landing-hud-line absolute inset-x-0 top-1/2 h-px origin-center"
            style={{ background: 'rgba(245, 240, 230, 0.08)' }}
          />
          <span className="relative bg-void px-4 font-hud text-[11px] tracking-[0.18em] text-starlight-faint">
            OBSERVATORY · {coords}
          </span>
        </div>
      </div>

      {/* 穿越：白光隧道 */}
      <div
        ref={tunnelRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0"
      >
        <div
          className="h-[80vmin] w-[80vmin] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(245,240,230,0.95) 0%, rgba(255,217,160,0.5) 35%, rgba(245,240,230,0.12) 60%, transparent 75%)',
          }}
        />
      </div>

      {/* 穿越：白场闪白 */}
      <div
        ref={flashRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30 bg-starlight opacity-0"
      />
    </div>
  )
}
