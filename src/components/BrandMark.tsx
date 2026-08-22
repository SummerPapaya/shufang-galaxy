import { useAppStore } from '@/store'

/**
 * <BrandMark> 左上角常驻品牌小标（design.md §7.6）
 * 仅中文官方 SVG logo 可点击返回 landing；英文副标展示用、无点击热点
 * （避免手机上与右上角「虫洞越迁 / 书房索引」重叠误触回首页）。
 */
export default function BrandMark() {
  const backToLanding = useAppStore((s) => s.backToLanding)

  return (
    <div className="fixed left-6 top-6 z-[90] flex items-center gap-3 text-left">
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
          className="h-8 w-auto select-none"
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
