import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        darksurface: {
          DEFAULT: 'hsl(var(--darksurface))',
          foreground: 'hsl(var(--darksurface-foreground))'
        },
        // Tokens del CRM: definidos en globals.css (--crm-*), cambian con .dark
        crm: {
          primary: 'var(--crm-primary)',
          'primary-hover': 'var(--crm-primary-hover)',
          'primary-soft': 'var(--crm-primary-soft)',
          accent: 'var(--crm-accent)',
          ink: 'var(--crm-ink)',
          'ink-2': 'var(--crm-ink-2)',
          nav: 'var(--crm-nav)',
          muted: 'var(--crm-muted)',
          subtle: 'var(--crm-subtle)',
          bg: 'var(--crm-bg)',
          side: 'var(--crm-side)',
          card: 'var(--crm-card)',
          surf: 'var(--crm-surf)',
          chip: 'var(--crm-chip)',
          'seg-on': 'var(--crm-seg-on)',
          border: 'var(--crm-border)',
          'border-2': 'var(--crm-border-2)',
          tint: 'var(--crm-tint)',
          'tint-border': 'var(--crm-tint-border)',
          'bot-bubble': 'var(--crm-bot-bubble)',
          'in-bubble': 'var(--crm-in-bubble)',
          note: 'var(--crm-note)',
          'note-border': 'var(--crm-note-border)',
          'note-ink': 'var(--crm-note-ink)',
          success: 'var(--crm-success)',
          'success-ink': 'var(--crm-success-ink)',
          'success-bg': 'var(--crm-success-bg)',
          warn: 'var(--crm-warn)',
          'warn-ink': 'var(--crm-warn-ink)',
          'warn-ink-2': 'var(--crm-warn-ink-2)',
          'warn-bg': 'var(--crm-warn-bg)',
          'warn-soft': 'var(--crm-warn-soft)',
          'warn-border': 'var(--crm-warn-border)',
          error: 'var(--crm-error)',
          'error-ink': 'var(--crm-error-ink)',
          'error-ink-2': 'var(--crm-error-ink-2)',
          'error-bg': 'var(--crm-error-bg)',
          'error-border': 'var(--crm-error-border)',
          overlay: 'var(--crm-overlay)',
          'chat-wa': 'var(--crm-chat-wa)',
          wa: 'var(--crm-ch-wa)',
          ig: 'var(--crm-ch-ig)',
          igc: 'var(--crm-ch-igc)',
          fb: 'var(--crm-ch-fb)',
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // CRM: botones pill, cards 20px, inputs 12px
        pill: '999px',
        card: '20px',
        field: '12px'
      },
      container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '2rem',
        lg: '4rem',
        xl: '5rem',
        '2xl': '6rem',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      },
    }
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
