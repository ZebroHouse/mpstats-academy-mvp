import type { Config } from 'tailwindcss';
import tailwindAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // shadcn/ui semantic colors (CSS variables)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // MPSTATS Brand Colors
        // Primary Blue Scale
        'mp-blue': {
          50: '#E8ECFE',
          100: '#D1DAFD',
          200: '#A3B5FB',
          300: '#7590FA',
          400: '#4768F8',
          500: '#2C4FF8', // Primary buttons, links
          600: '#233FC6', // Active states
          700: '#1A2F95', // Dark text on light
          800: '#122063', // Headings
          900: '#091032', // Body text
        },
        // Accent Green Scale (Success)
        'mp-green': {
          50: '#F3FEE7',
          100: '#E7FDCF',
          200: '#CFFB9F',
          300: '#B7F96F',
          400: '#9FF73F',
          500: '#87F50F', // Success buttons, badges
          600: '#6CC40C', // Success active
          700: '#519309',
          800: '#366206',
          900: '#1B3103',
        },
        // Accent Pink Scale (Featured)
        'mp-pink': {
          50: '#FEF0F4',
          100: '#FDD1E3',
          200: '#FCA3D3',
          300: '#FB75B6',
          400: '#FA479A',
          500: '#FF168A', // Featured, Hot badges
          600: '#CC125F', // Active state
          700: '#990D47',
          800: '#66092F',
          900: '#330418',
        },
        // Neutral Gray Scale
        'mp-gray': {
          50: '#F9FAFB',  // Page background
          100: '#F3F4F6', // Card background
          200: '#E5E7EB', // Borders
          300: '#D1D5DB',
          400: '#9CA3AF', // Placeholder text
          500: '#6B7280', // Secondary text
          600: '#4B5563',
          700: '#374151', // Body text
          800: '#1F2937',
          900: '#111827', // Headings
        },
      },
      // Gradients
      backgroundImage: {
        'mp-accent-gradient': 'linear-gradient(90deg, #CCFF96 0%, #CEFFF4 100%)',
        'mp-hero-gradient': 'linear-gradient(135deg, #E8ECFE 0%, #F3FEE7 100%)',
      },
      // Typography
      fontFamily: {
        // v2 reskin: Onest (brand font from marketing) with Inter fallback.
        sans: ['var(--font-onest)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['var(--font-onest)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Display sizes
        'display-lg': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-sm': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        // Heading sizes
        'heading-xl': ['1.875rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'heading-lg': ['1.5rem', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' }],
        'heading': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-sm': ['1.125rem', { lineHeight: '1.5', fontWeight: '600' }],
        // Body sizes
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        // Caption
        'caption': ['0.75rem', { lineHeight: '1.4' }],
      },
      // Box shadows for depth
      boxShadow: {
        'mp-sm': '0 1px 2px 0 rgba(9, 16, 50, 0.05)',
        'mp': '0 1px 3px 0 rgba(9, 16, 50, 0.1), 0 1px 2px -1px rgba(9, 16, 50, 0.1)',
        'mp-md': '0 4px 6px -1px rgba(9, 16, 50, 0.1), 0 2px 4px -2px rgba(9, 16, 50, 0.1)',
        'mp-lg': '0 10px 15px -3px rgba(9, 16, 50, 0.1), 0 4px 6px -4px rgba(9, 16, 50, 0.1)',
        'mp-card': '0 2px 8px rgba(9, 16, 50, 0.08)',
        'mp-card-hover': '0 8px 24px rgba(9, 16, 50, 0.12)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
