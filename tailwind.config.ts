import type { Config } from 'tailwindcss';

/**
 * Solo Leveling palette. Void black with a violet cast (never neutral black), the
 * Shadow Monarch violet as primary, and the System-window cyan as the secondary
 * signal colour. Everything is an HSL variable so a single file re-themes the site.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        /** System notification cyan — panels, brackets, labels. */
        system: 'hsl(var(--system))',
        /** ARISE energy edge. */
        energy: 'hsl(var(--energy))',
        /** Rank / level gold. */
        rank: 'hsl(var(--rank))',
        /** Shadow army deep violet. */
        shadow: 'hsl(var(--shadow-violet))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        display: ['clamp(3rem, 9vw, 7rem)', { lineHeight: '0.95', letterSpacing: '-0.045em' }],
        headline: ['clamp(1.85rem, 4vw, 3.25rem)', { lineHeight: '1.08', letterSpacing: '-0.025em' }],
      },
      boxShadow: {
        glow: '0 0 24px -4px hsl(var(--accent) / 0.55), 0 0 64px -12px hsl(var(--accent) / 0.4)',
        'glow-lg':
          '0 0 40px -6px hsl(var(--accent) / 0.65), 0 0 120px -20px hsl(var(--energy) / 0.45)',
        'glow-system': '0 0 24px -4px hsl(var(--system) / 0.5), inset 0 0 24px -12px hsl(var(--system) / 0.35)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translate3d(0, 18px, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        /** Shadow embers drifting upward behind panels. */
        rise: {
          '0%': { transform: 'translate3d(0, 12%, 0) scale(1)', opacity: '0' },
          '15%': { opacity: '0.7' },
          '100%': { transform: 'translate3d(0, -120%, 0) scale(1.6)', opacity: '0' },
        },
        /** Breathing violet aura on focal elements. */
        'pulse-glow': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.06)' },
        },
        /** System-window scanline sweep. */
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
        /** Rotating conic gradient for animated panel borders. */
        'border-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        /** Brief cyan flicker, like a System window resolving. */
        flicker: {
          '0%, 100%': { opacity: '1' },
          '41%': { opacity: '1' },
          '42%': { opacity: '0.35' },
          '43%': { opacity: '1' },
          '47%': { opacity: '1' },
          '48%': { opacity: '0.5' },
          '49%': { opacity: '1' },
        },
        'stat-fill': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        rise: 'rise linear infinite',
        'pulse-glow': 'pulse-glow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scan: 'scan 5s linear infinite',
        'border-spin': 'border-spin 4s linear infinite',
        marquee: 'marquee 32s linear infinite',
        flicker: 'flicker 4s linear infinite',
        'stat-fill': 'stat-fill 1.1s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      transitionTimingFunction: {
        expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
