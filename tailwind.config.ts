import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  safelist: [
    "bg-cat-work", "bg-cat-work-soft", "text-cat-work",
    "bg-cat-home", "bg-cat-home-soft", "text-cat-home",
    "bg-cat-health", "bg-cat-health-soft", "text-cat-health",
    "bg-cat-personal", "bg-cat-personal-soft", "text-cat-personal",
    "bg-cat-social", "bg-cat-social-soft", "text-cat-social",
    "bg-cat-admin", "bg-cat-admin-soft", "text-cat-admin",
    "bg-cat-other", "bg-cat-other-soft", "text-cat-other",
    "border-cat-work", "border-cat-home", "border-cat-health",
    "border-cat-personal", "border-cat-social", "border-cat-admin", "border-cat-other",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        cat: {
          work: "hsl(var(--cat-work))",
          "work-soft": "hsl(var(--cat-work-soft))",
          home: "hsl(var(--cat-home))",
          "home-soft": "hsl(var(--cat-home-soft))",
          health: "hsl(var(--cat-health))",
          "health-soft": "hsl(var(--cat-health-soft))",
          personal: "hsl(var(--cat-personal))",
          "personal-soft": "hsl(var(--cat-personal-soft))",
          social: "hsl(var(--cat-social))",
          "social-soft": "hsl(var(--cat-social-soft))",
          admin: "hsl(var(--cat-admin))",
          "admin-soft": "hsl(var(--cat-admin-soft))",
          other: "hsl(var(--cat-other))",
          "other-soft": "hsl(var(--cat-other-soft))",
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
