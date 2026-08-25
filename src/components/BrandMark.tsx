import { useAppStore } from '@/store'

/**
 * <BrandMark> 左上角常驻品牌小标（design.md §7.6）
 * 仅中文官方 SVG logo 可点击返回 landing；英文副标展示用、无点击热点
 * （避免手机上与右上角「虫洞越迁 / 书房索引」重叠误触回首页）。
 * 星空图书馆有自有顶栏，隐藏本标以免与标题 / 宇宙回声按钮叠在一起。
 */
export default function BrandMark() {
  const view = useAppStore((s) => s.view)
  const backToLanding = useAppStore((s) => s.backToLanding)

  if (view === 'library') return null

  return (
    <div className="fixed left-4 top-4 z-[90] flex items-center gap-3 text-left md:left-6 md:top-6">
      {/* 仅中文 LOGO 可点击返回；英文副标不做热点，避免与右上角按钮重叠误触 */}
      <button
        type="button"
        data-cursor="interactive"
        onClick={backToLanding}
        aria-label="返回星河远景"
        className="block"
      >
        <img
          src="/assets/logo.svg"
          alt="一個人的書房"
          className="h-7 w-auto select-none md:h-8"
          draggable={false}
        />
      </button>
      <span
        aria-hidden
        className="pointer-events-none font-hud mt-1 text-[10px] uppercase leading-none tracking-[0.35em] text-starlight-faint max-sm:hidden"
      >
        A Study of One&apos;s Own
      </span>
    </div>
  )
}
