import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bone: {
          DEFAULT: "#E3DCD2",
          50: "#F7F3ED",
          100: "#EFE7DC",
          200: "#E6DDCF",
          300: "#D8CCBA",
        },
        ink: {
          DEFAULT: "#100C0D",
          600: "#2A2123",
          500: "#413639",
        },
        forest: {
          DEFAULT: "#013328",
          700: "#01291F",
          800: "#011F18",
        },
        clay: {
          DEFAULT: "#CC8B65",
          100: "#F4E2D8",
          200: "#E9C5AE",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          700: "hsl(var(--accent-700))",
          100: "hsl(var(--accent-100))",
          50: "hsl(var(--accent-50))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontSize: {
        "display-lg": [
          "clamp(2.4rem, 2.1vw + 1.55rem, 3.6rem)",
          { lineHeight: "1.02", letterSpacing: "-0.038em", fontWeight: "650" },
        ],
        "display-md": [
          "clamp(2rem, 1.5vw + 1.2rem, 2.8rem)",
          { lineHeight: "1.05", letterSpacing: "-0.032em", fontWeight: "630" },
        ],
      },
    },
  },
  plugins: [],
};

export default config;
