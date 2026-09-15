import type { ReactNode } from 'react'

/**
 * 社区统一背景基调 + 字体作用域。
 * - 暖白纸感底（paper-50，木质调）+ 顶部柔和 sky 渐隐，让白色卡片在暖底上"浮"起来。
 * - 定义两个作用域工具类，全社区共用，不触碰全局样式：
 *     .fwx-display —— 标题/数字/英文使用全站 Open Sans 与系统中文字体
 *     .fwx-mono    —— 等宽技术标注（详情页 TechLabel 用，等宽数字对齐）
 * 社区各页统一包一层。
 */
export function CommunityShell({ children }: { children: ReactNode }) {
  return (
    <div className="community-shell relative min-h-[100dvh] bg-paper-50">
      {/* 作用域字体工具类（仅在社区树内可用） */}
      <style>{`
        .fwx-display{font-family:var(--font-site);}
        .fwx-mono{font-family:var(--font-site);font-variant-numeric:tabular-nums;}
      `}</style>

      {/* 顶部 sky 微光晕 + 木纹暖角，纯装饰、不挡交互 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-gradient-to-b from-sky-100/50 via-sky-50/30 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[22rem] w-[22rem] rounded-full bg-paper-200/30 blur-3xl"
      />
      <div className="relative">{children}</div>
    </div>
  )
}
