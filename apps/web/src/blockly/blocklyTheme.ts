/**
 * Blockly 主题 + 工具箱（Scratch / MakeCode 风格的图形化编程观感）。
 *
 * - 自定义主题：4 个分类色 + 「开始」hat 块样式 + 组件样式（toolbox/flyout/选中辉光）。
 *   分类色 = 积木色，保证面板和积木一眼对应。
 * - JSON 工具箱（categoryToolbox）：每个分类挂 categorystyle + cssconfig.icon，
 *   配合 blocklyTheme.css 渲染成统一风格的彩色图标按钮。
 *
 * 红线：只用 @fwx/shared 的 IR 类型经由 blocks/compiler，本文件不碰 IR 契约。
 */
import * as Blockly from 'blockly'
import './blocks' // 注册自定义积木（含 drone_start）作为副作用

// 分类 / 积木配色（与 blocks.ts 的 setColour 保持一致）
const COLOR_FLIGHT = '#4AA3F0'
const COLOR_SENSOR = '#3EB489'
const COLOR_LOGIC = '#D4A74A'
const COLOR_LOOP = '#a67038'
const COLOR_START = '#7C5CFF' // 「开始」锚点，刻意区别于 4 个分类色

export const DRONE_THEME = Blockly.Theme.defineTheme('fwx-drone', {
  name: 'fwx-drone',
  base: Blockly.Themes.Classic,
  categoryStyles: {
    start_category: { colour: COLOR_START },
    flight_category: { colour: COLOR_FLIGHT },
    sensor_category: { colour: COLOR_SENSOR },
    logic_category: { colour: COLOR_LOGIC },
    loop_category: { colour: COLOR_LOOP },
  },
  blockStyles: {
    // 仅「开始」块走主题样式，以拿到 hat(帽子)外形；其余块仍用各自 setColour
    start_blocks: { colourPrimary: COLOR_START, hat: 'cap' },
  },
  componentStyles: {
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#51565b',
    flyoutBackgroundColour: '#f7f9fa',
    flyoutForegroundColour: '#51565b',
    flyoutOpacity: 1,
    scrollbarColour: '#d9dfe3',
    selectedGlowColour: '#0070d5',
    insertionMarkerColour: '#0070d5',
    cursorColour: '#0070d5',
  },
  fontStyle: { family: 'inherit', weight: 'normal', size: 12 },
})

/**
 * 分类图标的白色 glyph（lucide 风格描边）。颜色/尺寸由 CSS 的 fwx-cat-* 负责，
 * 这里只把 glyph 作为 background-image 注入，省去手工 URL 编码 SVG 的出错风险。
 */
const CAT_GLYPHS: Record<string, string> = {
  'fwx-cat-start': `<svg viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>`,
  'fwx-cat-flight': `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>`,
  'fwx-cat-sensor': `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M4.9 19.1a10 10 0 0 1 0-14.2"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M16.2 16.2a6 6 0 0 0 0-8.4"/><path d="M19.1 19.1a10 10 0 0 0 0-14.2"/><circle cx="12" cy="12" r="1.6" fill="#fff" stroke="none"/></svg>`,
  'fwx-cat-logic': `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  'fwx-cat-loop': `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>`,
}

/** 在注入后调用：给各分类的图标 chip 写入白色 glyph。toolbox 静态构建一次即可。 */
export function applyCategoryIcons(root: HTMLElement): void {
  for (const [cls, svg] of Object.entries(CAT_GLYPHS)) {
    const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    root.querySelectorAll<HTMLElement>(`.${cls}`).forEach((el) => {
      el.style.backgroundImage = uri
    })
  }
}

/** JSON 工具箱：分类 → 彩色图标按钮（图标样式见 blocklyTheme.css 的 fwx-cat-* 类）。 */
export const DRONE_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '开始',
      categorystyle: 'start_category',
      cssconfig: { icon: 'fwx-cat-icon fwx-cat-start' },
      contents: [{ kind: 'block', type: 'drone_start' }],
    },
    {
      kind: 'category',
      name: '飞行动作',
      categorystyle: 'flight_category',
      cssconfig: { icon: 'fwx-cat-icon fwx-cat-flight' },
      contents: [
        { kind: 'block', type: 'drone_takeoff', fields: { ALTITUDE: 100 } },
        { kind: 'block', type: 'drone_land' },
        { kind: 'block', type: 'drone_move', fields: { DIRECTION: 'forward', DISTANCE: 50, SPEED: 30 } },
        { kind: 'block', type: 'drone_rotate', fields: { DEGREES: 90 } },
        { kind: 'block', type: 'drone_hover', fields: { DURATION: 1000 } },
        { kind: 'block', type: 'drone_led', fields: { R: 0, G: 255, B: 0 } },
      ],
    },
    {
      kind: 'category',
      name: '传感器',
      categorystyle: 'sensor_category',
      cssconfig: { icon: 'fwx-cat-icon fwx-cat-sensor' },
      contents: [
        { kind: 'block', type: 'drone_condition', fields: { SENSOR: 'frontDistanceCm', OP: '<', VALUE: 30 } },
      ],
    },
    {
      kind: 'category',
      name: '逻辑',
      categorystyle: 'logic_category',
      cssconfig: { icon: 'fwx-cat-icon fwx-cat-logic' },
      contents: [
        { kind: 'block', type: 'drone_wait_until' },
        { kind: 'block', type: 'drone_lock_axis' },
        { kind: 'block', type: 'drone_if_else' },
      ],
    },
    {
      kind: 'category',
      name: '循环',
      categorystyle: 'loop_category',
      cssconfig: { icon: 'fwx-cat-icon fwx-cat-loop' },
      contents: [
        { kind: 'block', type: 'drone_repeat', fields: { TIMES: 4 } },
        { kind: 'block', type: 'drone_while' },
      ],
    },
  ],
}
