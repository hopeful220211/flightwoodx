import type { UserPartCategory } from '@fwx/parts-schema'

/** User-part vocabulary shared by the studio and assembly library. */
export const USER_PART_CATEGORY_LABELS: Record<UserPartCategory, string> = {
  mainboard: '主机身',
  landing: '起落架',
  guard: '保护板',
  joint: '连接件',
  deco: '装饰件',
}
