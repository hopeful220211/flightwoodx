/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* DJI reference: neutral surfaces and a single blue action accent. */
        sky: {
          50: '#f7f9fa',
          100: '#edf1f4',
          200: '#d9dfe3',
          300: '#a8b4be',
          400: '#6b8599',
          500: '#0070d5',
          600: '#005eae',
          700: '#3d4852',
          800: '#303233',
          900: '#262626',
          950: '#1c1c1c',
        },
        /* ── 木色辅助系（保留原 wood，微调使其更暖与天蓝互补） ── */
        wood: {
          50: '#faf6f0',
          100: '#f0e6d6',
          200: '#e0ccb0',
          300: '#cba87a',
          400: '#b8864f',
          500: '#a67038',
          600: '#8a5a2e',
          700: '#6e4626',
          800: '#5a3a22',
          900: '#4a3020',
        },
        /* Neutral text and surface palette. */
        ink: {
          950: '#0f0f0f',
          900: '#1A1A1A',
          800: '#2B2B2B',
          700: '#3D3D3D',
          600: '#5C5C5C',
          500: '#737373',
          400: '#8A8A8A',
          300: '#B0B0B0',
          200: '#D4D4D4',
          100: '#ECECEC',
        },
        paper: {
          50: '#f7f9fa',
          100: '#edf1f4',
          200: '#d9dfe3',
        },
        /* ── 语义色 ── */
        accent: {
          sky: '#0070d5',
          leaf: '#3EB489',
          gold: '#D4A74A',
          spark: '#0070d5',
        },
        /* Shared page surfaces; marketing footer/video use explicit dark surfaces. */
        surface: {
          white: '#ffffff',
          ice: '#f7f9fa',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        mono: ['"Open Sans"', '"PingFang SC"', '"Microsoft YaHei"', '"Helvetica Neue"', '"Hiragino Sans GB"', '"WenQuanYi Micro Hei"', 'Arial', 'sans-serif'],
        sans: ['"Open Sans"', '"PingFang SC"', '"Microsoft YaHei"', '"Helvetica Neue"', '"Hiragino Sans GB"', '"WenQuanYi Micro Hei"', 'Arial', 'sans-serif'],
        display: ['"Open Sans"', '"PingFang SC"', '"Microsoft YaHei"', '"Helvetica Neue"', '"Hiragino Sans GB"', '"WenQuanYi Micro Hei"', 'Arial', 'sans-serif'],
        /* Keep utility aliases on the same reference font stack. */
        grotesk: ['"Open Sans"', '"PingFang SC"', '"Microsoft YaHei"', '"Helvetica Neue"', '"Hiragino Sans GB"', '"WenQuanYi Micro Hei"', 'Arial', 'sans-serif'],
      },
      fontWeight: { bold: '600', extrabold: '600', black: '600' },
      /* ── RFC-020：流体字号令牌（映射 index.css 的 CSS 变量，便于 text-hero 等直接用） ── */
      fontSize: {
        hero: ['var(--fs-hero)', { lineHeight: '1', letterSpacing: '-0.3px' }],
        h2: ['var(--fs-h2)', { lineHeight: '1.1' }],
        h3: ['var(--fs-h3)', { lineHeight: '1.125' }],
        'title-sm': ['var(--fs-title-sm)', { lineHeight: '1.2' }],
        body: ['var(--fs-body)', { lineHeight: '1.5' }],
        label: ['var(--fs-label)', { lineHeight: '1.667', letterSpacing: '0' }],
        stat: ['var(--fs-stat)', { lineHeight: '1' }],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(0,0,0,.06)',
        lift: '0 14px 40px rgba(0,0,0,.12)',
        'sky-glow': 'none',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '8px',
        /* ── RFC-020：胶囊/卡片/标签圆角 ── */
        pill: '64px',
        card: '8px',
        tag: '4px',
      },
      backgroundImage: {
        'sky-gradient': 'linear-gradient(180deg, #f1f3f5 0%, #ffffff 100%)',
        'sky-hero': 'linear-gradient(155deg, #e2e6e9 0%, #f6f7f8 52%, #d8dee2 100%)',
        'wood-warm': 'linear-gradient(135deg, #faf6f0 0%, #f0e6d6 100%)',
      },
    },
  },
  plugins: [],
}
