import { useAppStore } from '@/store'

/**
 * <BrandMark> 左上角常驻品牌小标（design.md §7.6）
 * 官方 SVG logo（书架图标 +「一個人的書房」+ 笔触下划线），点击返回 landing 视图。
 */
export default function BrandMark() {
  const backToLanding = useAppStore((s) => s.backToLanding)

  return (
    <button
      type="button"
      data-cursor="interactive"
      onClick={backToLanding}
      aria-label="返回星河远景"
      className="fixed left-6 top-6 z-[90] flex items-center gap-3 text-left"
    >
      <img
        src="/assets/logo.svg"
        alt="一個人的書房"
        className="h-8 w-auto select-none"
        draggable={false}
      />
      <span className="font-hud mt-1 text-[10px] uppercase leading-none tracking-[0.35em] text-starlight-faint">
        A Study of One&apos;s Own
      </span>
    </button>
  )
}
